## TOPIC: epoll() - High-Performance I/O for Linux

### INTERVIEW_QA: Comprehensive Questions and Answers
#### Q1: What is epoll() and how does it differ from select() and poll()?

**Answer:**

epoll() is a Linux-specific I/O event notification mechanism introduced in kernel 2.5.44 (2002) for scalable multiplexing of file descriptors.

**Key Differences:**

| Feature | select() | poll() | epoll() |
|---------|----------|--------|---------|
| **Max FDs** | 1024 (FD_SETSIZE) | Unlimited | Unlimited |
| **Add FD Cost** | O(1) | O(1) | O(log n) |
| **Wait Cost** | O(n) | O(n) | O(num_active) |
| **Kernel→User Data Copy** | All FDs | All FDs | Only active FDs |
| **Modify Interest** | Rebuild set | Rebuild array | O(log n) |
| **Portability** | POSIX, universal | POSIX, universal | Linux only |
| **Edge-Triggered** | No | No | Yes (optional) |

**Why epoll() Scales:**

1. **Interest list in kernel:** No need to pass all FDs on every wait
2. **Red-black tree:** Fast add/remove (O(log n))
3. **Ready list:** Only active FDs returned (O(num_active))
4. **Edge-triggered mode:** Reduces wake-ups for busy FDs

**When to Use:**
- epoll(): Linux server with >1000 connections
- poll(): Portable UNIX server with >64 FDs
- select(): Maximum portability, small FD count (<64)

---

#### Q2: Explain level-triggered vs edge-triggered modes in epoll. When would you use each?

**Answer:**

**Level-Triggered (default):**

"Is the FD ready right now?"

- Behavior: `epoll_wait()` returns FD as long as data remains available
- You can read partial data, and epoll will notify again
- Easier to use, harder to get wrong
- Like poll() behavior

```cpp
// Level-triggered example
struct epoll_event ev;
ev.events = EPOLLIN;  // No EPOLLET
ev.data.fd = fd;
epoll_ctl(epfd, EPOLL_CTL_ADD, fd, &ev);

// In event loop:
int n = recv(fd, buf, 1024, 0);  // Read only 1024 bytes
// If 2048 bytes available, next epoll_wait() will return this FD again ✅
```

**Edge-Triggered:**

"Did the FD just become ready?"

- Behavior: `epoll_wait()` returns FD only when state changes (new data arrives)
- You must read all available data (until EAGAIN)
- More efficient (fewer wake-ups), but harder to get right
- Requires non-blocking sockets

```cpp
// Edge-triggered example
struct epoll_event ev;
ev.events = EPOLLIN | EPOLLET;  // ✅ EPOLLET flag
ev.data.fd = fd;
epoll_ctl(epfd, EPOLL_CTL_ADD, fd, &ev);

// In event loop: MUST loop until EAGAIN
while (true) {
    int n = recv(fd, buf, 1024, 0);
    if (n < 0) {
        if (errno == EAGAIN) break;  // ✅ All data consumed
        // Error handling
    }
    if (n == 0) break;  // EOF
    process_data(buf, n);
}
```

**When to Use:**

| Mode | Use Case |
|------|----------|
| **Level-Triggered** | - Default choice for most applications<br>- Simpler code, easier debugging<br>- Integrating with blocking libraries<br>- Connection count < 10,000 |
| **Edge-Triggered** | - High-performance servers (>10,000 connections)<br>- Minimizing wake-ups for busy FDs<br>- Full control over non-blocking I/O<br>- Used with EPOLLONESHOT for thread pools |

**Common Mistake:**

```cpp
// ❌ WRONG: Edge-triggered with single recv()
ev.events = EPOLLIN | EPOLLET;
epoll_ctl(epfd, EPOLL_CTL_ADD, fd, &ev);

// Event loop:
int n = recv(fd, buf, 1024, 0);  // ❌ Only reads 1024 bytes
// If 2048 bytes arrived, 1024 bytes are LOST forever!
// epoll will NOT notify again until NEW data arrives
```

---

#### Q3: What is EPOLLONESHOT and why is it critical for multi-threaded servers?

**Answer:**

**EPOLLONESHOT:** Automatically disables the FD after delivering an event. Must be re-armed with `epoll_ctl(MOD)`.

**The Problem It Solves:**

Without EPOLLONESHOT, multiple threads can process the same FD simultaneously, causing race conditions:

```
Time | Thread A         | Thread B         | Problem
-----|------------------|------------------|------------------
T1   | epoll_wait()     | epoll_wait()     |
T2   | recv(fd=5)       | -                |
T3   | processing...    | epoll_wait() → fd=5 | ❌ Both threads get fd=5!
T4   | processing...    | recv(fd=5)       | ❌ RACE CONDITION
```

**With EPOLLONESHOT:**

```
Time | Thread A         | Thread B         | Behavior
-----|------------------|------------------|------------------
T1   | epoll_wait()     | epoll_wait()     |
T2   | recv(fd=5)       | -                | FD 5 auto-disabled ✅
T3   | processing...    | epoll_wait()     | B does NOT get fd=5 ✅
T4   | epoll_ctl(MOD)   | -                | A re-arms fd=5
T5   | done             | Can now get fd=5 | Safe!
```

**Implementation:**

```cpp
// Add FD with EPOLLONESHOT
struct epoll_event ev;
ev.events = EPOLLIN | EPOLLONESHOT | EPOLLET;
ev.data.fd = client_fd;
epoll_ctl(epfd, EPOLL_CTL_ADD, client_fd, &ev);

// Worker thread:
void worker(int epfd, int fd) {
    // Process event
    char buf[1024];
    int n = recv(fd, buf, sizeof(buf), 0);
    process_data(buf, n);
    
    // ✅ Re-arm for next event
    struct epoll_event ev;
    ev.events = EPOLLIN | EPOLLONESHOT | EPOLLET;
    ev.data.fd = fd;
    epoll_ctl(epfd, EPOLL_CTL_MOD, fd, &ev);  // Critical!
}
```

**Why Critical:**

1. **Thread safety:** Prevents concurrent access to same FD
2. **No locks needed:** Kernel serializes events for you
3. **Common in thread pools:** Each worker processes one FD at a time

**When NOT to Use EPOLLONESHOT:**

- Single-threaded servers (unnecessary overhead)
- Listen sockets (multiple threads can accept safely)

---

#### Q4: Explain the internal data structures of epoll. How does it achieve O(1) performance?

**Answer:**

epoll uses two main data structures in the kernel:

**1. Interest List (Red-Black Tree):**

```
                    [FD 500]
                   /        \
              [FD 100]      [FD 800]
             /      \       /      \
        [FD 50]  [FD 200] [FD 600] [FD 900]
```

- Stores all monitored FDs
- **Operations:** O(log n)
  - `epoll_ctl(ADD)`: Insert into tree
  - `epoll_ctl(DEL)`: Remove from tree
  - `epoll_ctl(MOD)`: Update node

**2. Ready List (Doubly-Linked List):**

```
[FD 50] <-> [FD 200] <-> [FD 800] <-> NULL
  ↑                                      ↑
Head                                    Tail
```

- Contains only FDs with pending events
- **Operation:** O(num_ready)
  - `epoll_wait()`: Iterate ready list, copy to userspace

**How It Works:**

1. **Registration** (`epoll_ctl(ADD)`):
   ```
   1. Insert FD into red-black tree: O(log n)
   2. Register callback with kernel driver
   3. Driver calls callback when data arrives
   ```

2. **Event Arrival**:
   ```
   1. Network data arrives for FD 200
   2. Kernel driver calls epoll callback
   3. Callback adds FD 200 to ready list: O(1) ✅
   4. Wakes up epoll_wait()
   ```

3. **Event Retrieval** (`epoll_wait()`):
   ```
   1. Iterate ready list: O(num_ready) ✅
   2. Copy events to userspace array
   3. Remove FDs from ready list (level-triggered keeps them)
   ```

**Why It's Fast:**

| Operation | poll() | epoll() | Why |
|-----------|--------|---------|-----|
| Register 10,000 FDs | O(1) per wait | O(10,000 × log n) once | One-time cost |
| Wait with 100 active | O(10,000) | O(100) | Only scan active FDs |
| Kernel→User copy | 10,000 FDs | 100 events | No wasted bandwidth |

**Memory Usage:**

- Red-black tree node: ~64 bytes per FD
- 10,000 FDs: ~640 KB in kernel
- poll(): Must copy 10,000 × sizeof(pollfd) = 80 KB **every wait**
- epoll(): Copies only active events (~3.2 KB for 100 active)

**The O(1) Claim:**

Technically, epoll is:
- Add/remove: O(log n)
- Wait: O(num_active)

But when `num_active << n`, it behaves like O(1) in practice.

---

#### Q5: What happens if you close() a file descriptor without calling epoll_ctl(DEL) first?

**Answer:**

**Short answer:** The FD is automatically removed from the epoll interest list, but this can cause subtle bugs with FD reuse.

**What Happens:**

1. **Automatic Removal:**
   ```cpp
   int fd = accept(...);
   epoll_ctl(epfd, EPOLL_CTL_ADD, fd, &ev);
   
   close(fd);  // Kernel removes fd from epoll automatically ✅
   ```

2. **FD Reuse Problem:**
   ```cpp
   // Thread A
   int fd = accept(...);  // fd = 42
   epoll_ctl(epfd, EPOLL_CTL_ADD, fd, &ev);
   
   // Thread B (before A finishes)
   close(fd);  // fd=42 closed
   
   // Thread C
   int new_fd = accept(...);  // Kernel reuses fd=42! ❌
   
   // Thread A's event loop
   epoll_wait(epfd, events, ...);
   // Gets event for fd=42, but it's a DIFFERENT connection now! ❌
   ```

**The Correct Pattern:**

```cpp
// ✅ Always DEL before close
epoll_ctl(epfd, EPOLL_CTL_DEL, fd, nullptr);
close(fd);
```

**Why DEL Before Close:**

1. **Explicit tracking:** You know exactly which FDs are monitored
2. **Avoid reuse bugs:** FD is removed from epoll before kernel reuses it
3. **Multi-threaded safety:** Prevents events for stale FDs

**Real-World Bug Example:**

```cpp
// ❌ BAD: Close without DEL in multi-threaded server
void handle_error(int fd) {
    close(fd);  // fd=100 closed, but still in epoll
}

// Later...
int new_fd = accept(...);  // Kernel reuses fd=100

// Event loop might deliver old buffered events for fd=100
// But fd=100 is now a DIFFERENT client! ❌
```

**Edge Case: dup() and dup2():**

```cpp
int fd1 = socket(...);
int fd2 = dup(fd1);  // Both point to same file description

epoll_ctl(epfd, EPOLL_CTL_ADD, fd1, &ev);
close(fd1);  // epoll entry NOT removed! fd2 still open ✅

// Event will still fire for the file description
epoll_wait(epfd, ...);  // ✅ Still works, but events point to fd1 (now invalid)
```

**Takeaway:** Always use `epoll_ctl(DEL)` before `close()` for clean, predictable behavior.

---

#### Q6: How do you handle partial sends with epoll? Explain the EPOLLOUT pattern.

**Answer:**

**Problem:** `send()` can return less than requested bytes when socket buffer is full.

```cpp
char msg[10000];
int n = send(fd, msg, 10000, 0);
// n might be 5000! ❌ 5000 bytes not sent
```

**Solution:** Use write queues + EPOLLOUT event.

**Pattern:**

```cpp
std::unordered_map<int, std::queue<std::string>> write_queues;

void send_message(int epfd, int fd, const std::string& msg) {
    // Try to send immediately
    int n = send(fd, msg.data(), msg.size(), 0);
    
    if (n < 0 && errno != EAGAIN) {
        // Error
        return;
    }
    
    if (n < msg.size()) {
        // Partial send or EAGAIN: queue remaining data
        write_queues[fd].push(msg.substr(n));
        
        // ✅ Start monitoring EPOLLOUT
        struct epoll_event ev;
        ev.events = EPOLLIN | EPOLLOUT;  // Add EPOLLOUT
        ev.data.fd = fd;
        epoll_ctl(epfd, EPOLL_CTL_MOD, fd, &ev);
    }
}

// Event loop:
if (events[i].events & EPOLLOUT) {
    auto& queue = write_queues[fd];
    
    while (!queue.empty()) {
        const auto& msg = queue.front();
        int n = send(fd, msg.data(), msg.size(), 0);
        
        if (n < 0) {
            if (errno == EAGAIN) break;  // Buffer full, try later
            // Error handling
        }
        
        if (n < msg.size()) {
            queue.front() = msg.substr(n);  // Update with remaining
            break;
        }
        
        queue.pop();  // Fully sent
    }
    
    // ✅ If queue empty, stop monitoring EPOLLOUT
    if (queue.empty()) {
        struct epoll_event ev;
        ev.events = EPOLLIN;  // Remove EPOLLOUT
        ev.data.fd = fd;
        epoll_ctl(epfd, EPOLL_CTL_MOD, fd, &ev);
    }
}
```

**Why Dynamic EPOLLOUT Monitoring:**

1. **EPOLLOUT fires frequently:** Socket is usually writable
2. **Without data pending:** Wake-ups are wasted
3. **Only monitor when needed:** Efficient event handling

**Timeline:**

```
T1: Client sends request
T2: EPOLLIN fires → process request → generate 10 MB response
T3: send() returns 5 MB sent → queue remaining 5 MB → enable EPOLLOUT
T4: EPOLLOUT fires → send() returns 3 MB sent → queue 2 MB
T5: EPOLLOUT fires → send() returns 2 MB sent → queue empty → disable EPOLLOUT ✅
```

**Common Mistake:**

```cpp
// ❌ WRONG: Always monitor EPOLLOUT
ev.events = EPOLLIN | EPOLLOUT;
epoll_ctl(epfd, EPOLL_CTL_ADD, fd, &ev);

// Event loop will wake up constantly even when you have nothing to send!
// Wastes CPU
```

**Best Practice:**

- Default: Monitor only EPOLLIN
- On partial send: Add EPOLLOUT
- When write queue empty: Remove EPOLLOUT

---

#### Q7: What is the thundering herd problem with epoll, and how does EPOLLEXCLUSIVE solve it?

**Answer:**

**Thundering Herd Problem:**

In multi-process/multi-threaded servers where each process/thread calls `epoll_wait()` on the same listen socket:

```
                    [Listen Socket FD 3]
                            |
        +-------------------+-------------------+
        |                   |                   |
    Process A           Process B           Process C
    epoll_wait()        epoll_wait()        epoll_wait()
```

When a new connection arrives:
1. **All processes wake up** (thundering herd) ❌
2. **Only one accept() succeeds**
3. **Others get EAGAIN** (wasted wake-ups)

**Performance Impact:**

- 4 processes: 3 wasted wake-ups per connection
- 1000 connections/sec: 3000 wasted context switches/sec
- High CPU usage, cache pollution

**Solution: EPOLLEXCLUSIVE (Linux 4.5+):**

```cpp
struct epoll_event ev;
ev.events = EPOLLIN | EPOLLEXCLUSIVE;  // ✅ Exclusive wake-up
ev.data.fd = listen_fd;
epoll_ctl(epfd, EPOLL_CTL_ADD, listen_fd, &ev);
```

**How EPOLLEXCLUSIVE Works:**

- Kernel wakes up **only one** waiter when event fires
- Other processes stay asleep
- Round-robin or random selection (kernel decides)

**Before EPOLLEXCLUSIVE:**

```
Connection arrives → Wake process A, B, C, D
Process A: accept() → success
Process B: accept() → EAGAIN (wasted)
Process C: accept() → EAGAIN (wasted)
Process D: accept() → EAGAIN (wasted)
```

**After EPOLLEXCLUSIVE:**

```
Connection arrives → Wake process B only ✅
Process B: accept() → success
Processes A, C, D: remain sleeping (efficient)
```

**Limitations:**

1. **Cannot use with EPOLLONESHOT:**
   ```cpp
   ev.events = EPOLLIN | EPOLLEXCLUSIVE | EPOLLONESHOT;  // ❌ Invalid
   ```

2. **Cannot use epoll_ctl(MOD):**
   ```cpp
   epoll_ctl(epfd, EPOLL_CTL_MOD, fd, &ev);  // ❌ Fails with EPOLLEXCLUSIVE
   ```

3. **Only useful for shared FDs:**
   - Listen sockets across processes: Yes
   - Client connections: No (each process has own)

**Alternative Solutions (Before EPOLLEXCLUSIVE):**

**1. SO_REUSEPORT (Linux 3.9+):**

```cpp
int opt = 1;
setsockopt(listen_fd, SOL_SOCKET, SO_REUSEPORT, &opt, sizeof(opt));

// Each process binds to same port
bind(listen_fd, ...);  // All processes bind to :8080
listen(listen_fd, 128);

// Kernel distributes connections across processes
```

**2. Single Accept Thread:**

```
[Accept Thread] → Distributes connections → [Worker Threads]
```

**When to Use:**

| Scenario | Solution |
|----------|----------|
| Multi-process pre-fork server | EPOLLEXCLUSIVE or SO_REUSEPORT |
| Thread pool with shared listen FD | EPOLLEXCLUSIVE |
| Single-threaded event loop | Not needed |
| Each process has own listen FD | Not needed |

---

#### Q8: How do you implement timeout handling with epoll (e.g., idle connection timeouts)?

**Answer:**

epoll does NOT provide per-FD timeouts. You must implement timeout tracking manually.

**Method 1: Timeouts in Event Loop (Simple):**

```cpp
#include <chrono>
#include <unordered_map>

using Clock = std::chrono::steady_clock;
using TimePoint = std::chrono::steady_clock::time_point;

std::unordered_map<int, TimePoint> last_activity;
const auto IDLE_TIMEOUT = std::chrono::seconds(30);

while (true) {
    // Set epoll_wait timeout to check timeouts periodically
    int timeout_ms = 1000;  // Check every second
    int nready = epoll_wait(epfd, events, MAX_EVENTS, timeout_ms);
    
    auto now = Clock::now();
    
    // Check for idle connections
    for (auto it = last_activity.begin(); it != last_activity.end(); ) {
        int fd = it->first;
        auto last_time = it->second;
        
        if (now - last_time > IDLE_TIMEOUT) {
            std::cout << "FD " << fd << " idle timeout\n";
            epoll_ctl(epfd, EPOLL_CTL_DEL, fd, nullptr);
            close(fd);
            it = last_activity.erase(it);
        } else {
            ++it;
        }
    }
    
    // Process events
    for (int i = 0; i < nready; i++) {
        int fd = events[i].data.fd;
        
        if (events[i].events & EPOLLIN) {
            // Update activity timestamp
            last_activity[fd] = now;
            
            // Handle read
            // ...
        }
    }
}
```

**Method 2: Timer Wheel (Efficient for Many Connections):**

```cpp
#include <list>
#include <vector>

struct TimerWheel {
    static const int SLOTS = 60;  // 60 seconds
    std::vector<std::list<int>> wheel;
    int current_slot = 0;
    
    TimerWheel() : wheel(SLOTS) {}
    
    void add(int fd, int timeout_seconds) {
        int slot = (current_slot + timeout_seconds) % SLOTS;
        wheel[slot].push_back(fd);
    }
    
    void remove(int fd) {
        for (auto& slot : wheel) {
            slot.remove(fd);
        }
    }
    
    void touch(int fd, int timeout_seconds) {
        remove(fd);
        add(fd, timeout_seconds);
    }
    
    std::vector<int> tick() {
        current_slot = (current_slot + 1) % SLOTS;
        
        std::vector<int> expired;
        for (int fd : wheel[current_slot]) {
            expired.push_back(fd);
        }
        
        wheel[current_slot].clear();
        return expired;
    }
};

// Usage:
TimerWheel timers;

// On new connection
int client_fd = accept(listen_fd, ...);
epoll_ctl(epfd, EPOLL_CTL_ADD, client_fd, &ev);
timers.add(client_fd, 30);  // 30-second timeout

// Event loop (every second)
while (true) {
    int nready = epoll_wait(epfd, events, MAX_EVENTS, 1000);
    
    // Tick timer wheel
    for (int expired_fd : timers.tick()) {
        std::cout << "FD " << expired_fd << " timeout\n";
        epoll_ctl(epfd, EPOLL_CTL_DEL, expired_fd, nullptr);
        close(expired_fd);
    }
    
    // Process events
    for (int i = 0; i < nready; i++) {
        int fd = events[i].data.fd;
        
        if (events[i].events & EPOLLIN) {
            // Reset timeout
            timers.touch(fd, 30);
            
            // Handle read
        }
    }
}
```

**Method 3: timerfd_create() (Linux-Specific):**

```cpp
#include <sys/timerfd.h>

// Create timer FD
int timer_fd = timerfd_create(CLOCK_MONOTONIC, TFD_NONBLOCK);

// Set to fire every second
struct itimerspec ts;
ts.it_value.tv_sec = 1;
ts.it_value.tv_nsec = 0;
ts.it_interval.tv_sec = 1;
ts.it_interval.tv_nsec = 0;
timerfd_settime(timer_fd, 0, &ts, nullptr);

// Add timer FD to epoll
struct epoll_event ev;
ev.events = EPOLLIN;
ev.data.fd = timer_fd;
epoll_ctl(epfd, EPOLL_CTL_ADD, timer_fd, &ev);

// Event loop
while (true) {
    int nready = epoll_wait(epfd, events, MAX_EVENTS, -1);
    
    for (int i = 0; i < nready; i++) {
        int fd = events[i].data.fd;
        
        if (fd == timer_fd) {
            // Read timer (must read to reset)
            uint64_t expirations;
            read(timer_fd, &expirations, sizeof(expirations));
            
            // Check for timeouts
            check_idle_connections();
        } else {
            // Handle client FD
        }
    }
}
```

**Performance Comparison:**

| Method | Complexity | Best For |
|--------|------------|----------|
| Check every event loop | O(num_connections) | < 100 connections |
| Timer wheel | O(1) tick | > 1000 connections |
| timerfd | O(1) tick | Linux-only, precise timing |

**Best Practice:**

- < 1000 connections: Simple map + periodic check
- \> 1000 connections: Timer wheel
- Need millisecond precision: timerfd

---

#### Q9: Can you use epoll with regular files? Why or why not?

**Answer:**

**Short Answer:** No, epoll does NOT work correctly with regular files. It always reports them as ready.

**Technical Reason:**

epoll relies on kernel drivers providing event notifications. Regular files (on disk) don't have event-driven I/O:

```cpp
int fd = open("file.txt", O_RDONLY | O_NONBLOCK);

struct epoll_event ev;
ev.events = EPOLLIN;
ev.data.fd = fd;
epoll_ctl(epfd, EPOLL_CTL_ADD, fd, &ev);  // ✅ Succeeds

int n = epoll_wait(epfd, events, 1, -1);
// ❌ Returns immediately! File FD is always "ready"
```

**Why Files Are Always Ready:**

1. **No blocking:** Disk I/O might be slow, but it never blocks (from userspace perspective)
2. **No events:** File system doesn't generate events like "data available"
3. **epoll can't help:** Would need to poll disk controller (expensive)

**What Works with epoll:**

| FD Type | Works | Reason |
|---------|-------|--------|
| **Sockets** | ✅ Yes | Network driver sends events |
| **Pipes** | ✅ Yes | Pipe buffer has event notifications |
| **TTY/PTY** | ✅ Yes | Terminal driver sends events |
| **eventfd** | ✅ Yes | Designed for event notification |
| **signalfd** | ✅ Yes | Designed for event notification |
| **timerfd** | ✅ Yes | Timer sends events |
| **Regular files** | ❌ No | Always ready (misleading) |
| **Directories** | ❌ No | No event notifications |

**Workaround for File I/O:**

**Option 1: Use io_uring (Linux 5.1+):**

```cpp
#include <liburing.h>

struct io_uring ring;
io_uring_queue_init(32, &ring, 0);

// Submit async read
struct io_uring_sqe *sqe = io_uring_get_sqe(&ring);
io_uring_prep_read(sqe, fd, buf, sizeof(buf), offset);
io_uring_submit(&ring);

// Wait for completion
struct io_uring_cqe *cqe;
io_uring_wait_cqe(&ring, &cqe);
```

**Option 2: Thread Pool for Blocking I/O:**

```cpp
// Main thread: epoll for sockets
// Worker threads: blocking read() for files

std::future<std::string> read_file_async(const char *path) {
    return std::async(std::launch::async, [path]() {
        std::ifstream file(path);
        std::string content((std::istreambuf_iterator<char>(file)),
                            std::istreambuf_iterator<char>());
        return content;
    });
}
```

**Option 3: Memory-Mapped I/O:**

```cpp
// mmap() maps file into memory (no explicit I/O)
int fd = open("file.txt", O_RDONLY);
size_t size = lseek(fd, 0, SEEK_END);
void *addr = mmap(NULL, size, PROT_READ, MAP_PRIVATE, fd, 0);

// Access like memory (kernel handles paging)
char *data = (char*)addr;
process_data(data, size);

munmap(addr, size);
```

**Real-World Mistake:**

```cpp
// ❌ WRONG: Trying to use epoll for mixed socket/file I/O
int socket_fd = socket(AF_INET, SOCK_STREAM, 0);
int file_fd = open("log.txt", O_RDONLY | O_NONBLOCK);

epoll_ctl(epfd, EPOLL_CTL_ADD, socket_fd, &ev);  // ✅ Works
epoll_ctl(epfd, EPOLL_CTL_ADD, file_fd, &ev);    // ❌ Always fires

while (true) {
    epoll_wait(epfd, events, 2, -1);
    // Will immediately return with file_fd every time! ❌
}
```

**Takeaway:** Use epoll for sockets/pipes/etc. Use io_uring or thread pools for file I/O.

---

#### Q10: What is the maxevents parameter in epoll_wait()? How do you choose the right value?

**Answer:**

**Definition:**

```cpp
int epoll_wait(int epfd, struct epoll_event *events, int maxevents, int timeout);
                                                     ^^^^^^^^^^^^
```

`maxevents`: Maximum number of events to return in one call.

**What It Does:**

```cpp
struct epoll_event events[128];  // Array size

int n = epoll_wait(epfd, events, 128, -1);
                                ^^^^
                    "Return at most 128 events"

// n <= 128
for (int i = 0; i < n; i++) {
    handle_event(events[i]);
}
```

**Impact on Performance:**

**Too Small (e.g., maxevents=1):**

```
Ready FDs: 100
maxevents: 1

Iteration 1: epoll_wait() returns 1 event  (99 still pending)
Iteration 2: epoll_wait() returns 1 event  (98 still pending)
...
Iteration 100: epoll_wait() returns 1 event

❌ 100 syscalls instead of 1!
❌ High CPU usage
❌ Event starvation (new events keep arriving)
```

**Too Large (e.g., maxevents=100000):**

```
Ready FDs: 10
maxevents: 100000

❌ Allocates 100000 × sizeof(epoll_event) = 1.2 MB on stack
❌ Wasted memory
❌ Cache pollution
✅ But only 10 events returned (correct)
```

**Choosing maxevents:**

| Value | Use Case |
|-------|----------|
| **16-64** | Low-traffic servers, < 100 connections |
| **128-512** | **Most common**, balanced performance |
| **1024-4096** | High-traffic servers, > 10,000 connections |

**Rule of Thumb:**

```cpp
maxevents = min(expected_concurrent_events, total_connections / 10)
```

Examples:
- 100 connections, 10% active at once: `maxevents = 16-32`
- 10,000 connections, 1% active: `maxevents = 128-256`
- 100,000 connections, 0.5% active: `maxevents = 512-1024`

**Dynamic Sizing:**

```cpp
int maxevents = 128;
struct epoll_event *events = new epoll_event[maxevents];

while (true) {
    int nready = epoll_wait(epfd, events, maxevents, -1);
    
    // If array was full, increase size
    if (nready == maxevents) {
        maxevents *= 2;
        delete[] events;
        events = new epoll_event[maxevents];
        std::cout << "Increased maxevents to " << maxevents << "\n";
    }
    
    // If consistently underutilized, decrease size
    if (nready < maxevents / 4 && maxevents > 64) {
        maxevents /= 2;
        delete[] events;
        events = new epoll_event[maxevents];
    }
    
    for (int i = 0; i < nready; i++) {
        handle_event(events[i]);
    }
}
```

**Trade-offs:**

| Metric | Small maxevents | Large maxevents |
|--------|-----------------|-----------------|
| **Memory** | Low | High |
| **Syscalls** | More frequent | Less frequent |
| **Latency** | Higher (events wait longer) | Lower |
| **Throughput** | Lower | Higher |
| **Fairness** | Better (events processed incrementally) | Worse (burst processing) |

**Common Mistakes:**

```cpp
// ❌ WRONG: maxevents=1 (inefficient)
struct epoll_event event;
epoll_wait(epfd, &event, 1, -1);  // One event at a time

// ❌ WRONG: Stack overflow risk
struct epoll_event events[1000000];  // 12 MB on stack!

// ✅ CORRECT: Reasonable size
struct epoll_event events[128];
epoll_wait(epfd, events, 128, -1);
```

**Benchmark Results** (10,000 connections, 100 active):

```
maxevents=1:    50,000 events/sec (100 syscalls)
maxevents=16:   180,000 events/sec (7 syscalls)
maxevents=128:  450,000 events/sec (1 syscall) ✅
maxevents=1024: 455,000 events/sec (1 syscall, but 10x memory)
```

**Recommended:** Start with `maxevents=128`, adjust based on profiling.

---


#### Q11: How does epoll handle EPOLLRDHUP, and why is it useful for detecting half-closed connections?

**Answer:**

**EPOLLRDHUP:** Event flag that indicates the peer has closed its write side (half-close/FIN received).

**Without EPOLLRDHUP:**

```cpp
// Traditional detection
int n = recv(fd, buf, sizeof(buf), 0);
if (n == 0) {
    // Peer closed connection (or half-closed)
    close(fd);
}
```

Problem: You only detect closure when you try to read.

**With EPOLLRDHUP:**

```cpp
struct epoll_event ev;
ev.events = EPOLLIN | EPOLLRDHUP;  // ✅ Request EPOLLRDHUP events
ev.data.fd = fd;
epoll_ctl(epfd, EPOLL_CTL_ADD, fd, &ev);

// Event loop
if (events[i].events & EPOLLRDHUP) {
    std::cout << "FD " << fd << " peer closed (FIN received)\n";
    
    // Can still send data if needed (half-close)
    const char *bye = "Goodbye\n";
    send(fd, bye, strlen(bye), 0);
    
    // Then close our side
    close(fd);
}
```

**Why It's Useful:**

**1. Immediate Detection:**

```
Without EPOLLRDHUP:
T1: Peer sends FIN
T2: (no notification)
T3: Application calls recv() → returns 0
T4: Close connection

With EPOLLRDHUP:
T1: Peer sends FIN
T2: epoll_wait() returns with EPOLLRDHUP ✅
T3: Application handles closure immediately
```

**2. Half-Close Support:**

TCP supports half-close: One side closes write, other can still send.

```
Client:
1. Send request
2. shutdown(fd, SHUT_WR)  ← FIN sent
3. Wait for response (can still recv)

Server:
1. EPOLLRDHUP fires ✅
2. Knows client won't send more data
3. Can still send response
4. shutdown(fd, SHUT_WR)
```

**3. Differentiate EPOLLRDHUP vs EPOLLHUP:**

| Event | Meaning | Action |
|-------|---------|--------|
| **EPOLLRDHUP** | Peer closed write side (FIN) | Can still send data, then close |
| **EPOLLHUP** | Connection completely closed (socket error) | Must close immediately |
| **EPOLLIN + recv()=0** | Detected closure during read | Traditional method |

**Full Example:**

```cpp
if (events[i].events & EPOLLRDHUP) {
    // Peer sent FIN (half-close)
    std::cout << "FD " << fd << " EPOLLRDHUP\n";
    
    // Flush any pending writes
    flush_write_queue(fd);
    
    // Shutdown our write side
    shutdown(fd, SHUT_WR);
    
    // Remove from epoll and close
    epoll_ctl(epfd, EPOLL_CTL_DEL, fd, nullptr);
    close(fd);
}

if (events[i].events & EPOLLHUP) {
    // Connection error or abrupt close (RST)
    std::cerr << "FD " << fd << " EPOLLHUP (error)\n";
    
    epoll_ctl(epfd, EPOLL_CTL_DEL, fd, nullptr);
    close(fd);
}

if (events[i].events & EPOLLIN) {
    int n = recv(fd, buf, sizeof(buf), 0);
    
    if (n == 0) {
        // Also indicates peer closed (redundant with EPOLLRDHUP)
        std::cout << "FD " << fd << " recv()=0\n";
        close(fd);
    }
}
```

**Portability:**

- **Linux 2.6.17+**: EPOLLRDHUP available
- **Older Linux**: Not available (must use recv()=0)
- **BSD/macOS**: No equivalent (use EVFILT_READ with EV_EOF)

**Best Practice:**

```cpp
#ifdef EPOLLRDHUP
    ev.events = EPOLLIN | EPOLLOUT | EPOLLRDHUP;  // Modern Linux
#else
    ev.events = EPOLLIN | EPOLLOUT;  // Fallback
#endif
```

**Real-World Use Case:**

HTTP server receiving chunked POST:

```
Client:
POST /upload HTTP/1.1
Content-Length: 1000000
[sends 500000 bytes]
[closes connection without sending remaining 500000] ← Premature close

Server (without EPOLLRDHUP):
recv() blocks waiting for more data... ❌

Server (with EPOLLRDHUP):
EPOLLRDHUP fires → "Client closed prematurely" ✅
→ Log error, close connection, free resources
```

---

#### Q12: Explain how to safely transfer an epoll FD between threads or processes.

**Answer:**

**Short Answer:** epoll FDs CAN be transferred, but with important caveats.

**epoll FD Characteristics:**

```cpp
int epfd = epoll_create1(0);
// epfd is a normal file descriptor
// Can be: dup()'d, sent via Unix socket, inherited by fork()
```

**Method 1: Inherit via fork() (Common)**

```cpp
// Parent process
int epfd = epoll_create1(0);
int listen_fd = socket(...);

struct epoll_event ev;
ev.events = EPOLLIN;
ev.data.fd = listen_fd;
epoll_ctl(epfd, EPOLL_CTL_ADD, listen_fd, &ev);

// Fork worker processes
for (int i = 0; i < 4; i++) {
    if (fork() == 0) {
        // Child process: inherited epfd and listen_fd ✅
        
        while (true) {
            struct epoll_event events[128];
            int n = epoll_wait(epfd, events, 128, -1);
            
            for (int j = 0; j < n; j++) {
                if (events[j].data.fd == listen_fd) {
                    int client_fd = accept(listen_fd, ...);
                    // Handle connection
                }
            }
        }
    }
}

// Parent can close epfd if not using it
close(epfd);
wait(NULL);
```

**Important:** Multiple processes sharing same epfd causes thundering herd (all wake up). Use EPOLLEXCLUSIVE:

```cpp
ev.events = EPOLLIN | EPOLLEXCLUSIVE;  // ✅ Only wake one process
```

**Method 2: Send via Unix Socket (Advanced)**

```cpp
// Send epfd from process A to process B

// Process A: Send epfd
int unix_sock = socket(AF_UNIX, SOCK_STREAM, 0);
connect(unix_sock, ...);

struct msghdr msg = {};
struct iovec iov = {.iov_base = (void*)"FD", .iov_len = 2};
char ctrl_buf[CMSG_SPACE(sizeof(int))];

msg.msg_iov = &iov;
msg.msg_iovlen = 1;
msg.msg_control = ctrl_buf;
msg.msg_controllen = sizeof(ctrl_buf);

struct cmsghdr *cmsg = CMSG_FIRSTHDR(&msg);
cmsg->cmsg_level = SOL_SOCKET;
cmsg->cmsg_type = SCM_RIGHTS;
cmsg->cmsg_len = CMSG_LEN(sizeof(int));
memcpy(CMSG_DATA(cmsg), &epfd, sizeof(int));

sendmsg(unix_sock, &msg, 0);

// Process B: Receive epfd
char recv_buf[2];
struct iovec iov_recv = {.iov_base = recv_buf, .iov_len = 2};
char ctrl_recv[CMSG_SPACE(sizeof(int))];

struct msghdr msg_recv = {};
msg_recv.msg_iov = &iov_recv;
msg_recv.msg_iovlen = 1;
msg_recv.msg_control = ctrl_recv;
msg_recv.msg_controllen = sizeof(ctrl_recv);

recvmsg(unix_sock, &msg_recv, 0);

struct cmsghdr *cmsg_recv = CMSG_FIRSTHDR(&msg_recv);
int received_epfd;
memcpy(&received_epfd, CMSG_DATA(cmsg_recv), sizeof(int));

// Now process B can use received_epfd ✅
epoll_wait(received_epfd, events, 128, -1);
```

**Method 3: Threads (Simplest, but Requires Synchronization)**

```cpp
int epfd = epoll_create1(0);  // Shared across threads

// Thread 1: Add FDs
void thread1() {
    int fd = socket(...);
    
    std::lock_guard<std::mutex> lock(epoll_mutex);
    struct epoll_event ev;
    ev.events = EPOLLIN;
    ev.data.fd = fd;
    epoll_ctl(epfd, EPOLL_CTL_ADD, fd, &ev);  // ✅ Thread-safe operation
}

// Thread 2: Wait for events
void thread2() {
    while (true) {
        struct epoll_event events[128];
        
        // epoll_wait() is thread-safe (no lock needed)
        int n = epoll_wait(epfd, events, 128, -1);  // ✅
        
        for (int i = 0; i < n; i++) {
            // Handle events
        }
    }
}
```

**Thread Safety of epoll Operations:**

| Operation | Thread-Safe? | Notes |
|-----------|--------------|-------|
| `epoll_wait()` | ✅ Yes | Multiple threads can call simultaneously |
| `epoll_ctl(ADD)` | ✅ Yes | Internally synchronized by kernel |
| `epoll_ctl(MOD)` | ✅ Yes | Safe to modify from different thread |
| `epoll_ctl(DEL)` | ✅ Yes | Safe to delete from different thread |
| `close(epfd)` | ⚠️ Careful | Must ensure no threads are in epoll_wait() |

**Common Pitfalls:**

**1. Thundering Herd (Multi-process without EPOLLEXCLUSIVE):**

```cpp
// ❌ BAD: All processes wake up
for (int i = 0; i < 4; i++) {
    if (fork() == 0) {
        epoll_wait(epfd, ...);  // All 4 children wake for one event
    }
}

// ✅ GOOD: Use EPOLLEXCLUSIVE
ev.events = EPOLLIN | EPOLLEXCLUSIVE;
```

**2. Race with close():**

```cpp
// Thread A
epoll_wait(epfd, ...);  // Blocked

// Thread B
close(epfd);  // ❌ Crashes Thread A!

// ✅ CORRECT: Signal threads before close
shutdown_flag = true;
// Wait for threads to exit epoll_wait()
for (auto& t : threads) t.join();
close(epfd);
```

**3. Modifying epoll from Event Handler:**

```cpp
// ✅ SAFE: Modify from same thread
for (int i = 0; i < nready; i++) {
    int fd = events[i].data.fd;
    
    // Safe to delete FD being processed
    epoll_ctl(epfd, EPOLL_CTL_DEL, fd, nullptr);
    close(fd);
}
```

**Best Practices:**

1. **Multi-process:** Use EPOLLEXCLUSIVE or SO_REUSEPORT
2. **Multi-threaded:** Use EPOLLONESHOT to prevent races
3. **Ownership:** Designate one thread/process as owner for cleanup
4. **Synchronization:** Only needed for application-level data, not epoll calls

---

#### Q13: What happens when a monitored FD is closed while epoll_wait() is blocked?

**Answer:**

**Scenario:**

```
Thread A: epoll_wait(epfd, ...) → BLOCKED
Thread B: close(monitored_fd) → ???
```

**What Happens:**

1. **Kernel removes FD from epoll automatically** ✅
2. **epoll_wait() wakes up** if that FD had pending events
3. **Events for that FD are still delivered** (race)

**Timeline:**

```
T1: Thread A calls epoll_wait(), blocks
T2: Thread B calls close(fd=42)
T3: Kernel removes fd=42 from epoll interest list ✅
T4: If fd=42 had pending events, epoll_wait() returns them ⚠️
T5: Thread A processes event for fd=42 (NOW INVALID!) ❌
```

**Problem: Use-After-Close Race**

```cpp
// Thread A: Event loop
while (true) {
    int n = epoll_wait(epfd, events, 128, -1);
    
    for (int i = 0; i < nready; i++) {
        int fd = events[i].data.fd;  // fd might be closed by Thread B!
        
        char buf[1024];
        int n = recv(fd, buf, sizeof(buf), 0);  // ❌ BAD FD error
    }
}

// Thread B: Cleanup thread
void cleanup() {
    close(some_fd);  // Races with Thread A's event loop
}
```

**Solution 1: Explicit DEL Before Close**

```cpp
// Thread B: Always DEL before close
epoll_ctl(epfd, EPOLL_CTL_DEL, fd, nullptr);  // Remove from epoll
close(fd);  // Then close

// Thread A: No longer receives events for this FD ✅
```

**Solution 2: Validate FD Before Use**

```cpp
// Track valid FDs
std::unordered_set<int> valid_fds;
std::mutex valid_fds_mutex;

// Thread B: Remove from tracking
{
    std::lock_guard<std::mutex> lock(valid_fds_mutex);
    valid_fds.erase(fd);
}
close(fd);

// Thread A: Check before using
for (int i = 0; i < nready; i++) {
    int fd = events[i].data.fd;
    
    {
        std::lock_guard<std::mutex> lock(valid_fds_mutex);
        if (valid_fds.find(fd) == valid_fds.end()) {
            continue;  // FD was closed, skip
        }
    }
    
    // Safe to use fd now
    recv(fd, buf, sizeof(buf), 0);
}
```

**Solution 3: Reference Counting**

```cpp
struct Connection {
    int fd;
    std::atomic<int> ref_count{1};
};

std::unordered_map<int, std::shared_ptr<Connection>> connections;

// Thread A: Hold reference while processing
for (int i = 0; i < nready; i++) {
    int fd = events[i].data.fd;
    
    auto conn = connections[fd];  // Increment ref count
    if (!conn) continue;
    
    // Safe to use conn->fd (won't be closed until ref released)
    recv(conn->fd, buf, sizeof(buf), 0);
}

// Thread B: Close when ref count reaches 0
void close_connection(int fd) {
    auto conn = connections[fd];
    connections.erase(fd);
    
    // conn destructor closes fd when last reference released
}
```

**Edge Case: FD Reuse**

```cpp
// Thread A: epoll_wait() blocked
// Thread B: close(fd=42) → Kernel might reuse fd=42
// Thread C: accept() returns fd=42 (REUSED!)
// Thread A: epoll_wait() returns event for "old" fd=42
//           But fd=42 is now a DIFFERENT connection! ❌
```

**Solution: Always DEL before close**

```cpp
// ✅ CORRECT: Prevents reuse issues
epoll_ctl(epfd, EPOLL_CTL_DEL, fd, nullptr);
close(fd);
```

**Kernel Behavior:**

The kernel tracks the **file description** (not FD number). When you `close()`:

1. **Decrement file description reference count**
2. **If ref count reaches 0**, remove from epoll
3. **If ref count > 0** (dup'd FDs), keep in epoll

```cpp
int fd1 = socket(...);
int fd2 = dup(fd1);  // Both point to same file description

epoll_ctl(epfd, EPOLL_CTL_ADD, fd1, &ev);

close(fd1);  // File description ref count: 2 → 1
// epoll entry NOT removed! fd2 still open ⚠️

epoll_wait(epfd, ...);  // Still returns events! (but for invalid fd1)
```

**Best Practices:**

1. **Always call `epoll_ctl(DEL)` before `close()`**
2. **Single-threaded:** Less risk, but still good practice
3. **Multi-threaded:** Essential to prevent races
4. **Reference counting:** Use smart pointers for connection objects

---

#### Q14: Compare epoll() to alternatives like kqueue (BSD), IOCP (Windows), and io_uring (Linux).

**Answer:**

**Overview:**

| Mechanism | OS | API Style | Performance | Complexity |
|-----------|----|-----------| ------------|------------|
| **epoll** | Linux | Event notification | O(num_active) | Medium |
| **kqueue** | BSD/macOS | Event notification | O(num_active) | Medium |
| **IOCP** | Windows | I/O completion | O(num_completed) | High |
| **io_uring** | Linux 5.1+ | Async I/O | O(num_completed) | High |

---

**1. epoll (Linux)**

```cpp
// Create
int epfd = epoll_create1(0);

// Register interest
struct epoll_event ev;
ev.events = EPOLLIN;
ev.data.fd = fd;
epoll_ctl(epfd, EPOLL_CTL_ADD, fd, &ev);

// Wait for events (reactive)
int n = epoll_wait(epfd, events, maxevents, timeout);

// You call recv()
recv(fd, buf, sizeof(buf), 0);
```

**Pros:**
- ✅ Fast for sockets (O(num_active))
- ✅ Edge-triggered mode available
- ✅ Well-documented, widely used

**Cons:**
- ❌ Linux-only
- ❌ Doesn't work with regular files
- ❌ Still requires recv()/send() calls

---

**2. kqueue (BSD/macOS)**

```cpp
// Create
int kq = kqueue();

// Register interest
struct kevent ev;
EV_SET(&ev, fd, EVFILT_READ, EV_ADD, 0, 0, NULL);
kevent(kq, &ev, 1, NULL, 0, NULL);  // Register

// Wait for events
struct kevent events[128];
int n = kevent(kq, NULL, 0, events, 128, NULL);

// You call recv()
recv(fd, buf, sizeof(buf), 0);
```

**Pros:**
- ✅ Equivalent performance to epoll
- ✅ More flexible filters (files, signals, timers)
- ✅ Unified API for many event types

**Cons:**
- ❌ BSD/macOS only
- ❌ More complex API than epoll

**epoll vs kqueue:**

| Feature | epoll | kqueue |
|---------|-------|--------|
| **FD events** | ✅ | ✅ |
| **File monitoring** | ❌ | ✅ (EVFILT_VNODE) |
| **Signals** | Via signalfd | ✅ (EVFILT_SIGNAL) |
| **Timers** | Via timerfd | ✅ (EVFILT_TIMER) |
| **Edge-triggered** | EPOLLET | EV_CLEAR |
| **Level-triggered** | Default | Default |

---

**3. IOCP (Windows)**

```cpp
// Create
HANDLE iocp = CreateIoCompletionPort(INVALID_HANDLE_VALUE, NULL, 0, 0);

// Associate socket with IOCP
CreateIoCompletionPort((HANDLE)socket, iocp, (ULONG_PTR)socket, 0);

// Issue async recv (proactive!)
WSABUF buf;
DWORD flags = 0;
WSARecv(socket, &buf, 1, NULL, &flags, &overlapped, NULL);

// Wait for completion
OVERLAPPED *completed;
DWORD bytes_transferred;
ULONG_PTR completion_key;
GetQueuedCompletionStatus(iocp, &bytes_transferred, &completion_key, &completed, INFINITE);

// Data is already in buffer! ✅
```

**Pros:**
- ✅ True async I/O (no recv() call needed)
- ✅ Works with files, sockets, pipes
- ✅ Zero-copy possible

**Cons:**
- ❌ Windows-only
- ❌ Complex API (OVERLAPPED structures)
- ❌ Different programming model (proactive vs reactive)

**epoll vs IOCP:**

| Aspect | epoll (Reactive) | IOCP (Proactive) |
|--------|------------------|------------------|
| **Model** | "FD is ready to read" | "Read completed" |
| **You call** | recv() after notification | Nothing, data in buffer |
| **Buffer** | You allocate after event | Pre-allocated before I/O |
| **Control** | More control over timing | Less control |

---

**4. io_uring (Linux 5.1+)**

```cpp
// Create
struct io_uring ring;
io_uring_queue_init(32, &ring, 0);

// Submit async read (proactive!)
struct io_uring_sqe *sqe = io_uring_get_sqe(&ring);
io_uring_prep_read(sqe, fd, buf, sizeof(buf), offset);
io_uring_submit(&ring);

// Wait for completion
struct io_uring_cqe *cqe;
io_uring_wait_cqe(&ring, &cqe);

// Data is already in buf! ✅
io_uring_cqe_seen(&ring, cqe);
```

**Pros:**
- ✅ True async I/O (like IOCP)
- ✅ Works with files, sockets, pipes
- ✅ Lower syscall overhead (batch submissions)
- ✅ Zero-copy, direct I/O

**Cons:**
- ❌ Linux 5.1+ only (relatively new)
- ❌ Complex API
- ❌ Requires modern kernel

**epoll vs io_uring:**

| Feature | epoll | io_uring |
|---------|-------|----------|
| **Syscalls per op** | 1 (epoll_wait + recv) | 0 (poll submission ring) |
| **File I/O** | ❌ | ✅ |
| **Async model** | Reactive | Proactive |
| **Maturity** | 20+ years | 3 years |
| **Learning curve** | Medium | High |

---

**Performance Comparison** (10,000 connections, 1,000 active):

```
epoll:      450,000 ops/sec
kqueue:     440,000 ops/sec  (equivalent)
io_uring:   850,000 ops/sec  (1.9x faster)
IOCP:       ~500,000 ops/sec (similar to epoll)
```

---

**When to Use:**

| Scenario | Best Choice |
|----------|-------------|
| **Linux sockets** | epoll (mature, reliable) |
| **Linux files + sockets** | io_uring (modern, fast) |
| **BSD/macOS** | kqueue (only option) |
| **Windows** | IOCP (only option) |
| **Cross-platform** | libevent/libev/libuv (abstracts all) |
| **Max performance Linux** | io_uring (if kernel supports) |

---

**Cross-Platform Abstraction Libraries:**

```cpp
// libevent example (works on all platforms)
struct event_base *base = event_base_new();  // Uses epoll/kqueue/IOCP internally

struct event *ev = event_new(base, fd, EV_READ | EV_PERSIST, callback, arg);
event_add(ev, NULL);

event_base_dispatch(base);  // Event loop
```

**Abstraction libraries:**
- **libevent:** Lightweight, event-driven
- **libev:** Fast, simple API
- **libuv:** Node.js backend, comprehensive
- **Boost.Asio:** C++, async I/O

---

**Future: io_uring is the successor to epoll**

io_uring advantages:
1. True async for files (epoll can't)
2. Lower CPU usage (fewer syscalls)
3. Higher throughput (batching)
4. Zero-copy operations

But epoll is still:
- More portable (older kernels)
- Simpler API
- Battle-tested for 20+ years

**Recommendation:** Use epoll for now, plan migration to io_uring for new projects.

---

#### Q15: How do you debug epoll applications? What tools and techniques are available?

**Answer:**

**1. strace: System Call Tracing**

```bash
# Trace epoll-related syscalls
strace -e trace=epoll_create1,epoll_ctl,epoll_wait ./my_server

# Output:
epoll_create1(0) = 3
epoll_ctl(3, EPOLL_CTL_ADD, 4, {EPOLLIN, {u32=4, u64=4}}) = 0
epoll_ctl(3, EPOLL_CTL_ADD, 5, {EPOLLIN, {u32=5, u64=5}}) = 0
epoll_wait(3, [{EPOLLIN, {u32=4, u64=4}}], 128, -1) = 1
epoll_wait(3, [{EPOLLIN, {u32=5, u64=5}}], 128, -1) = 1

# Trace all syscalls with timestamps
strace -tt -T -e trace=all ./my_server
```

**2. lsof: List Open File Descriptors**

```bash
# Check which FDs are open
lsof -p <pid>

# Check specific FD
lsof -p <pid> -a -d 3  # Check FD 3

# Find sockets
lsof -p <pid> -a -i

# Example output:
COMMAND   PID USER   FD   TYPE    DEVICE SIZE/OFF NODE NAME
server  12345 user    3u  epoll              0t0     (epoll)
server  12345 user    4u  IPv4  1234567      0t0  TCP *:8080 (LISTEN)
server  12345 user    5u  IPv4  1234568      0t0  TCP localhost:8080->localhost:54321 (ESTABLISHED)
```

**3. /proc Filesystem Inspection**

```bash
# List all FDs for a process
ls -la /proc/<pid>/fd

# Output:
lrwx------ 1 user user 64 Jan 1 12:00 3 -> anon_inode:[eventpoll]
lrwx------ 1 user user 64 Jan 1 12:00 4 -> socket:[1234567]
lrwx------ 1 user user 64 Jan 1 12:00 5 -> socket:[1234568]

# Check epoll contents (Linux 3.8+)
cat /proc/<pid>/fdinfo/3  # FD 3 is epoll

# Output:
pos:    0
flags:  02000000
mnt_id: 12
tfd:        4 events:       19 data:                4  pos:0 ino:1234567 sdev:9
tfd:        5 events:       19 data:                5  pos:0 ino:1234568 sdev:9
#           ^               ^^ EPOLLIN|EPOLLERR|EPOLLHUP
```

**4. gdb: Interactive Debugging**

```bash
# Attach to running process
gdb -p <pid>

# Set breakpoint
(gdb) break epoll_wait
(gdb) continue

# Inspect epoll FD
(gdb) print epfd
$1 = 3

# Inspect events array after epoll_wait returns
(gdb) print events[0]
$2 = {events = 1, data = {ptr = 0x0, fd = 4, u32 = 4, u64 = 4}}

# Backtrace
(gdb) bt

# Watch variable
(gdb) watch num_connections
```

**5. Custom Debugging: Dump epoll State**

```cpp
#include <fstream>

void dump_epoll_state(int epfd, int pid) {
    std::ifstream fdinfo("/proc/" + std::to_string(pid) + "/fdinfo/" + std::to_string(epfd));
    
    std::cout << "=== epoll FD " << epfd << " state ===\n";
    std::string line;
    while (std::getline(fdinfo, line)) {
        std::cout << line << "\n";
    }
}

// Call periodically
dump_epoll_state(epfd, getpid());
```

**6. Event Logging**

```cpp
const char* event_to_string(uint32_t events) {
    static char buf[256];
    buf[0] = '\0';
    
    if (events & EPOLLIN) strcat(buf, "EPOLLIN|");
    if (events & EPOLLOUT) strcat(buf, "EPOLLOUT|");
    if (events & EPOLLERR) strcat(buf, "EPOLLERR|");
    if (events & EPOLLHUP) strcat(buf, "EPOLLHUP|");
    if (events & EPOLLRDHUP) strcat(buf, "EPOLLRDHUP|");
    if (events & EPOLLET) strcat(buf, "EPOLLET|");
    if (events & EPOLLONESHOT) strcat(buf, "EPOLLONESHOT|");
    
    // Remove trailing '|'
    size_t len = strlen(buf);
    if (len > 0) buf[len - 1] = '\0';
    
    return buf;
}

// Log all epoll operations
int epoll_ctl_logged(int epfd, int op, int fd, struct epoll_event *ev) {
    const char *op_str = (op == EPOLL_CTL_ADD) ? "ADD" :
                         (op == EPOLL_CTL_MOD) ? "MOD" :
                         (op == EPOLL_CTL_DEL) ? "DEL" : "???";
    
    std::cout << "[epoll_ctl] " << op_str << " fd=" << fd;
    if (ev) {
        std::cout << " events=" << event_to_string(ev->events);
    }
    std::cout << "\n";
    
    int ret = epoll_ctl(epfd, op, fd, ev);
    if (ret < 0) {
        std::cerr << "[epoll_ctl] ERROR: " << strerror(errno) << "\n";
    }
    
    return ret;
}

// Log epoll_wait results
int epoll_wait_logged(int epfd, struct epoll_event *events, int maxevents, int timeout) {
    auto start = std::chrono::steady_clock::now();
    int nready = epoll_wait(epfd, events, maxevents, timeout);
    auto end = std::chrono::steady_clock::now();
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count();
    
    std::cout << "[epoll_wait] returned " << nready << " events (waited " << ms << " ms)\n";
    
    for (int i = 0; i < nready; i++) {
        std::cout << "  [" << i << "] fd=" << events[i].data.fd 
                  << " events=" << event_to_string(events[i].events) << "\n";
    }
    
    return nready;
}
```

**7. Connection Tracking**

```cpp
struct ConnectionStats {
    int fd;
    std::chrono::steady_clock::time_point connected_at;
    size_t bytes_received = 0;
    size_t bytes_sent = 0;
    size_t events_processed = 0;
};

std::unordered_map<int, ConnectionStats> conn_stats;

// Log statistics periodically
void print_statistics() {
    std::cout << "\n=== Connection Statistics ===\n";
    for (const auto& [fd, stats] : conn_stats) {
        auto now = std::chrono::steady_clock::now();
        auto duration = std::chrono::duration_cast<std::chrono::seconds>(now - stats.connected_at).count();
        
        std::cout << "FD " << fd << ": "
                  << "duration=" << duration << "s, "
                  << "rx=" << stats.bytes_received << " bytes, "
                  << "tx=" << stats.bytes_sent << " bytes, "
                  << "events=" << stats.events_processed << "\n";
    }
}
```

**8. Common Issues to Debug**

**Issue 1: FD Not Receiving Events**

```cpp
// Check 1: Is FD added to epoll?
cat /proc/<pid>/fdinfo/<epfd> | grep "tfd:.*<fd>"

// Check 2: Is FD non-blocking?
int flags = fcntl(fd, F_GETFL);
if (!(flags & O_NONBLOCK)) {
    std::cerr << "FD " << fd << " is BLOCKING!\n";  // ❌
}

// Check 3: Is socket connected?
int error;
socklen_t len = sizeof(error);
getsockopt(fd, SOL_SOCKET, SO_ERROR, &error, &len);
if (error != 0) {
    std::cerr << "FD " << fd << " socket error: " << strerror(error) << "\n";
}
```

**Issue 2: epoll_wait() Returns Immediately**

```cpp
// Regular files always ready
struct stat st;
fstat(fd, &st);
if (S_ISREG(st.st_mode)) {
    std::cerr << "FD " << fd << " is regular file! epoll won't work\n";  // ❌
}

// Check if monitoring EPOLLOUT with no data to send
if (ev.events & EPOLLOUT && write_queue.empty()) {
    std::cerr << "Monitoring EPOLLOUT but no data to send (busy loop)\n";  // ❌
}
```

**Issue 3: Events Lost in Edge-Triggered Mode**

```cpp
// Must read until EAGAIN
int total_read = 0;
while (true) {
    int n = recv(fd, buf, sizeof(buf), 0);
    if (n < 0) {
        if (errno == EAGAIN) {
            std::cout << "FD " << fd << " read " << total_read << " bytes total\n";
            break;  // ✅ All data consumed
        }
        break;  // Error
    }
    total_read += n;
    
    if (total_read > 10000) {
        std::cerr << "FD " << fd << " read > 10KB in edge-triggered, might lose data!\n";  // ⚠️
        break;  // ❌ Should continue until EAGAIN
    }
}
```

**9. Performance Profiling**

```bash
# CPU profiling
perf record -g ./my_server
perf report

# Find epoll hotspots
perf record -e syscalls:sys_enter_epoll_wait -g ./my_server

# Memory profiling
valgrind --tool=massif ./my_server
ms_print massif.out.<pid>
```

**10. Unit Testing epoll Code**

```cpp
// Mock epoll for testing
class MockEpoll {
public:
    std::queue<struct epoll_event> pending_events;
    
    int mock_epoll_wait(struct epoll_event *events, int maxevents, int timeout) {
        int n = 0;
        while (n < maxevents && !pending_events.empty()) {
            events[n++] = pending_events.front();
            pending_events.pop();
        }
        return n;
    }
    
    void inject_event(int fd, uint32_t events) {
        struct epoll_event ev;
        ev.data.fd = fd;
        ev.events = events;
        pending_events.push(ev);
    }
};

// Test
MockEpoll mock;
mock.inject_event(5, EPOLLIN);

struct epoll_event events[10];
int n = mock.mock_epoll_wait(events, 10, -1);
assert(n == 1);
assert(events[0].data.fd == 5);
```

---

#### Q16: Explain the relationship between epoll, non-blocking sockets, and edge-triggered mode.

**Answer:**

**Three Interconnected Concepts:**

1. **Non-blocking sockets:** recv()/send() return immediately with EAGAIN instead of blocking
2. **Edge-triggered epoll:** Notifies only on state change (not level)
3. **Mandatory combination:** Edge-triggered REQUIRES non-blocking

**Why Edge-Triggered Requires Non-Blocking:**

**Scenario: Edge-triggered + Blocking Socket (❌ DEADLOCK):**

```cpp
// ❌ WRONG: Edge-triggered with BLOCKING socket
int fd = accept(...);
// fd is BLOCKING (default)

struct epoll_event ev;
ev.events = EPOLLIN | EPOLLET;  // Edge-triggered
ev.data.fd = fd;
epoll_ctl(epfd, EPOLL_CTL_ADD, fd, &ev);

// Event loop
epoll_wait(epfd, events, 128, -1);  // Returns: fd has data

// First recv (1024 bytes available)
char buf[512];
recv(fd, buf, 512, 0);  // ✅ Returns 512 bytes

// Second recv (512 bytes remaining)
recv(fd, buf, 512, 0);  // ✅ Returns 512 bytes

// Third recv (NO more data)
recv(fd, buf, 512, 0);  // ❌ BLOCKS FOREVER!
// epoll won't notify again (edge-triggered)
// Application DEADLOCKED
```

**Correct: Edge-triggered + Non-blocking Socket:**

```cpp
// ✅ CORRECT: Edge-triggered with NON-BLOCKING socket
int fd = accept(...);
int flags = fcntl(fd, F_GETFL, 0);
fcntl(fd, F_SETFL, flags | O_NONBLOCK);  // ✅ Set non-blocking

struct epoll_event ev;
ev.events = EPOLLIN | EPOLLET;
ev.data.fd = fd;
epoll_ctl(epfd, EPOLL_CTL_ADD, fd, &ev);

// Event loop
epoll_wait(epfd, events, 128, -1);  // Returns: fd has data

// Read until EAGAIN
char buf[512];
while (true) {
    int n = recv(fd, buf, 512, 0);
    
    if (n < 0) {
        if (errno == EAGAIN || errno == EWOULDBLOCK) {
            break;  // ✅ All data consumed, won't block
        }
        // Error handling
    }
    
    if (n == 0) break;  // EOF
    
    process_data(buf, n);
}

// Safe! Won't deadlock
```

**Level-Triggered: Non-blocking Optional (but Recommended)**

```cpp
// Level-triggered with BLOCKING socket (works, but inefficient)
int fd = accept(...);
// fd is BLOCKING

struct epoll_event ev;
ev.events = EPOLLIN;  // Level-triggered (no EPOLLET)
ev.data.fd = fd;
epoll_ctl(epfd, EPOLL_CTL_ADD, fd, &ev);

// Event loop
epoll_wait(epfd, events, 128, -1);  // Returns: fd has data

// Single recv (might block if data < 512 bytes, but unlikely)
char buf[512];
recv(fd, buf, 512, 0);  // Might block, but epoll will notify again ✅

// Next epoll_wait() will return fd again if data remains ✅
```

**Performance Comparison:**

| Mode | Blocking | Non-blocking | Syscalls | Efficiency |
|------|----------|--------------|----------|------------|
| **Level-triggered** | Acceptable | ✅ Better | More (one recv per event) | Good |
| **Level-triggered** | ⚠️ Risky | ✅ Recommended | More | Good |
| **Edge-triggered** | ❌ DEADLOCK | ✅ **REQUIRED** | Fewer (batch recv) | Excellent |

**Deep Dive: Why Edge-Triggered is More Efficient**

**Level-Triggered:**

```
T1: 10 KB arrives on FD 5
T2: epoll_wait() returns (FD 5 ready)
T3: recv() reads 5 KB (5 KB remains)
T4: Process 5 KB
T5: epoll_wait() returns AGAIN (FD 5 still ready) ← Extra wake-up
T6: recv() reads 5 KB (0 KB remains)
T7: Process 5 KB

Result: 2 epoll_wait() calls, 2 recv() calls
```

**Edge-Triggered:**

```
T1: 10 KB arrives on FD 5
T2: epoll_wait() returns (FD 5 ready)
T3: Loop: recv() 5 KB, recv() 5 KB, recv() → EAGAIN
T4: Process all 10 KB
T5: epoll_wait() blocks (waiting for NEW data) ← No extra wake-up

Result: 1 epoll_wait() call, 3 recv() calls (last one EAGAIN)
```

**Non-Blocking Socket Behavior:**

```cpp
// NON-BLOCKING socket
int n = recv(fd, buf, 1024, 0);

if (n > 0) {
    // Data received
} else if (n == 0) {
    // EOF (peer closed)
} else {  // n < 0
    if (errno == EAGAIN || errno == EWOULDBLOCK) {
        // No data available (not an error!) ✅
    } else {
        // Actual error (ECONNRESET, etc.)
    }
}
```

**Common Mistakes:**

**Mistake 1: Forgetting O_NONBLOCK**

```cpp
// ❌ WRONG
int fd = accept(listen_fd, ...);  // fd is BLOCKING by default

struct epoll_event ev;
ev.events = EPOLLIN | EPOLLET;  // Edge-triggered
epoll_ctl(epfd, EPOLL_CTL_ADD, fd, &ev);

// Will deadlock on recv() ❌
```

**Mistake 2: Single recv() in Edge-Triggered**

```cpp
// ❌ WRONG
if (events[i].events & EPOLLIN) {
    char buf[1024];
    recv(fd, buf, 1024, 0);  // Only reads 1024 bytes
    // If 2048 bytes available, 1024 bytes are LOST! ❌
}
```

**Mistake 3: Not Handling EAGAIN**

```cpp
// ❌ WRONG
while (true) {
    int n = recv(fd, buf, 1024, 0);
    if (n <= 0) break;  // Treats EAGAIN as error ❌
    process(buf, n);
}

// ✅ CORRECT
while (true) {
    int n = recv(fd, buf, 1024, 0);
    if (n < 0) {
        if (errno == EAGAIN) break;  // ✅ Expected in non-blocking
        // Error handling
        break;
    }
    if (n == 0) break;  // EOF
    process(buf, n);
}
```

**Best Practices:**

1. **Always use non-blocking with edge-triggered**
2. **Highly recommended non-blocking with level-triggered too** (for consistency)
3. **Set O_NONBLOCK immediately after accept()**
4. **Loop until EAGAIN in edge-triggered mode**
5. **Handle EAGAIN gracefully (not an error)**

**Summary Table:**

| Combination | Behavior | Recommendation |
|-------------|----------|----------------|
| Level-triggered + Blocking | Works, but can block | ⚠️ Avoid |
| Level-triggered + Non-blocking | Works perfectly | ✅ Recommended |
| Edge-triggered + Blocking | **DEADLOCK** | ❌ Never use |
| Edge-triggered + Non-blocking | Works perfectly | ✅ **Required** |

---

#### Q17: What are the security implications of epoll? How do you prevent epoll-based DoS attacks?

**Answer:**

**epoll-Specific Attack Vectors:**

**1. FD Exhaustion Attack**

**Attack:** Open many connections to exhaust FD limit (default 1024 per process, 100K system-wide).

```
Attacker: Open 100,000 connections
Server: epoll can't add new FDs (EMFILE error)
Result: Legitimate clients rejected ❌
```

**Mitigation:**

```cpp
// Set connection limit
const int MAX_CONNECTIONS = 10000;
std::atomic<int> active_connections{0};

// On new connection
if (active_connections >= MAX_CONNECTIONS) {
    std::cerr << "Connection limit reached, rejecting\n";
    close(client_fd);
    return;
}

active_connections++;

// On close
active_connections--;
```

**System-level mitigation:**

```bash
# Increase FD limit (in /etc/security/limits.conf)
* soft nofile 100000
* hard nofile 100000

# Or temporarily
ulimit -n 100000
```

**2. Slowloris Attack (Slow Read)**

**Attack:** Open connection, send data very slowly (1 byte/minute). Ties up server resources.

```
Attacker: Send "GET / HTTP/1.1\r\n" (1 byte per minute)
Server: epoll_wait() keeps returning this FD
Result: Server CPU wasted on slow clients ❌
```

**Mitigation: Connection Timeouts**

```cpp
struct Connection {
    std::chrono::steady_clock::time_point last_activity;
    size_t bytes_received = 0;
};

std::unordered_map<int, Connection> connections;
const auto IDLE_TIMEOUT = std::chrono::seconds(30);

// Periodic timeout check
for (auto it = connections.begin(); it != connections.end(); ) {
    auto now = std::chrono::steady_clock::now();
    
    if (now - it->second.last_activity > IDLE_TIMEOUT) {
        std::cout << "FD " << it->first << " idle timeout\n";
        epoll_ctl(epfd, EPOLL_CTL_DEL, it->first, nullptr);
        close(it->first);
        it = connections.erase(it);
    } else {
        ++it;
    }
}
```

**3. Event Flood Attack**

**Attack:** Send many small packets to cause epoll_wait() to return frequently.

```
Attacker: Send 1-byte packets at 10,000/sec
Server: epoll_wait() returns 10,000 times/sec
Result: CPU exhaustion ❌
```

**Mitigation: Rate Limiting**

```cpp
struct Connection {
    std::deque<std::chrono::steady_clock::time_point> event_times;
    bool is_rate_limited = false;
};

const int MAX_EVENTS_PER_SECOND = 100;

// On event
auto now = std::chrono::steady_clock::now();
auto& conn = connections[fd];

conn.event_times.push_back(now);

// Remove events older than 1 second
while (!conn.event_times.empty() && 
       now - conn.event_times.front() > std::chrono::seconds(1)) {
    conn.event_times.pop_front();
}

// Check rate
if (conn.event_times.size() > MAX_EVENTS_PER_SECOND) {
    if (!conn.is_rate_limited) {
        std::cerr << "FD " << fd << " rate limited (> " 
                  << MAX_EVENTS_PER_SECOND << " events/sec)\n";
        
        // Option 1: Temporary disable
        epoll_ctl(epfd, EPOLL_CTL_DEL, fd, nullptr);
        conn.is_rate_limited = true;
        
        // Schedule re-enable after 10 seconds
        
        // Option 2: Close connection
        close(fd);
        connections.erase(fd);
    }
    return;
}
```

**4. Memory Exhaustion via Large Buffers**

**Attack:** Send large amounts of data, forcing server to allocate huge buffers.

```
Attacker: Send 1 GB of data per connection × 1000 connections
Server: Allocates 1 TB of memory ❌
Result: OOM killer kills server
```

**Mitigation: Per-Connection Buffer Limits**

```cpp
const size_t MAX_BUFFER_PER_CONNECTION = 1024 * 1024;  // 1 MB

struct Connection {
    std::string read_buffer;
    std::string write_buffer;
};

// On recv
if (conn.read_buffer.size() + n > MAX_BUFFER_PER_CONNECTION) {
    std::cerr << "FD " << fd << " buffer limit exceeded\n";
    epoll_ctl(epfd, EPOLL_CTL_DEL, fd, nullptr);
    close(fd);
    connections.erase(fd);
    return;
}

conn.read_buffer.append(buf, n);
```

**5. CPU Exhaustion via Edge-Triggered Loops**

**Attack:** Send continuous data stream, causing infinite recv() loops.

```cpp
// Vulnerable code
while (true) {
    int n = recv(fd, buf, 1024, 0);
    if (n < 0 && errno == EAGAIN) break;
    
    expensive_processing(buf, n);  // Attacker controls CPU time ❌
}
```

**Mitigation: Limit Reads Per Event**

```cpp
const int MAX_READS_PER_EVENT = 10;

int reads = 0;
while (reads < MAX_READS_PER_EVENT) {
    int n = recv(fd, buf, 1024, 0);
    if (n < 0) {
        if (errno == EAGAIN) break;
        // Error
    }
    if (n == 0) break;  // EOF
    
    process(buf, n);
    reads++;
}

if (reads == MAX_READS_PER_EVENT) {
    // More data pending, re-arm epoll
    struct epoll_event ev;
    ev.events = EPOLLIN | EPOLLET | EPOLLONESHOT;
    ev.data.fd = fd;
    epoll_ctl(epfd, EPOLL_CTL_MOD, fd, &ev);  // Will fire again
}
```

**6. Privilege Escalation via FD Confusion**

**Risk:** Attacker tricks server into closing wrong FD, causing FD reuse bugs.

**Mitigation: Validate FD Ownership**

```cpp
std::unordered_set<int> valid_fds;
std::mutex fds_mutex;

// On new connection
{
    std::lock_guard<std::mutex> lock(fds_mutex);
    valid_fds.insert(client_fd);
}

// Before using FD
{
    std::lock_guard<std::mutex> lock(fds_mutex);
    if (valid_fds.find(fd) == valid_fds.end()) {
        std::cerr << "Invalid FD " << fd << " in event\n";
        return;  // Ignore
    }
}

// On close
{
    std::lock_guard<std::mutex> lock(fds_mutex);
    valid_fds.erase(fd);
}
epoll_ctl(epfd, EPOLL_CTL_DEL, fd, nullptr);
close(fd);
```

**7. Information Leak via epoll_data**

**Risk:** `epoll_data` union can leak pointers if mishandled.

```cpp
// ❌ WRONG: Leaks pointer
struct Connection *conn = new Connection();
ev.data.ptr = conn;  // Attacker might see this pointer value

// ✅ BETTER: Use FD (opaque integer)
ev.data.fd = fd;

// ✅ BEST: Use map lookup
std::unordered_map<int, Connection> connections;
// Look up by FD in event loop
```

**Comprehensive Security Checklist:**

```cpp
class SecureEpollServer {
private:
    const int MAX_CONNECTIONS = 10000;
    const size_t MAX_BUFFER_PER_CONN = 1 * 1024 * 1024;  // 1 MB
    const int MAX_EVENTS_PER_SEC = 100;
    const int MAX_READS_PER_EVENT = 10;
    const std::chrono::seconds IDLE_TIMEOUT{30};
    
    std::atomic<int> active_connections{0};
    std::unordered_map<int, Connection> connections;
    
public:
    bool accept_connection(int listen_fd, int epfd) {
        // 1. Check connection limit
        if (active_connections >= MAX_CONNECTIONS) {
            std::cerr << "[Security] Connection limit reached\n";
            int fd = accept(listen_fd, nullptr, nullptr);
            if (fd >= 0) close(fd);  // Reject immediately
            return false;
        }
        
        int client_fd = accept(listen_fd, nullptr, nullptr);
        if (client_fd < 0) return false;
        
        // 2. Set non-blocking
        int flags = fcntl(client_fd, F_GETFL, 0);
        fcntl(client_fd, F_SETFL, flags | O_NONBLOCK);
        
        // 3. Set TCP keep-alive (detect dead connections)
        int opt = 1;
        setsockopt(client_fd, SOL_SOCKET, SO_KEEPALIVE, &opt, sizeof(opt));
        
        // 4. Set receive buffer limit
        int rcvbuf = 256 * 1024;  // 256 KB
        setsockopt(client_fd, SOL_SOCKET, SO_RCVBUF, &rcvbuf, sizeof(rcvbuf));
        
        // 5. Add to epoll
        struct epoll_event ev;
        ev.events = EPOLLIN | EPOLLET;
        ev.data.fd = client_fd;
        epoll_ctl(epfd, EPOLL_CTL_ADD, client_fd, &ev);
        
        // 6. Track connection
        Connection conn;
        conn.connected_at = std::chrono::steady_clock::now();
        conn.last_activity = std::chrono::steady_clock::now();
        connections[client_fd] = conn;
        
        active_connections++;
        return true;
    }
    
    void handle_read(int fd, int epfd) {
        auto& conn = connections[fd];
        
        // 1. Rate limiting check
        if (is_rate_limited(conn)) {
            std::cerr << "[Security] FD " << fd << " rate limited\n";
            close_connection(fd, epfd);
            return;
        }
        
        // 2. Limited reads per event
        char buf[4096];
        int reads = 0;
        
        while (reads < MAX_READS_PER_EVENT) {
            int n = recv(fd, buf, sizeof(buf), 0);
            
            if (n < 0) {
                if (errno == EAGAIN) break;
                close_connection(fd, epfd);
                return;
            }
            
            if (n == 0) {
                close_connection(fd, epfd);
                return;
            }
            
            // 3. Buffer size limit
            if (conn.read_buffer.size() + n > MAX_BUFFER_PER_CONN) {
                std::cerr << "[Security] FD " << fd << " buffer limit exceeded\n";
                close_connection(fd, epfd);
                return;
            }
            
            conn.read_buffer.append(buf, n);
            conn.bytes_received += n;
            conn.last_activity = std::chrono::steady_clock::now();
            
            reads++;
        }
        
        // Process data (with additional input validation)
        process_data_securely(fd, conn);
    }
    
    void check_timeouts(int epfd) {
        auto now = std::chrono::steady_clock::now();
        
        for (auto it = connections.begin(); it != connections.end(); ) {
            if (now - it->second.last_activity > IDLE_TIMEOUT) {
                std::cout << "[Security] FD " << it->first << " idle timeout\n";
                close_connection(it->first, epfd);
                it = connections.erase(it);
            } else {
                ++it;
            }
        }
    }
    
    void close_connection(int fd, int epfd) {
        epoll_ctl(epfd, EPOLL_CTL_DEL, fd, nullptr);
        close(fd);
        connections.erase(fd);
        active_connections--;
    }
};
```

**System-Level Hardening:**

```bash
# 1. Increase limits (but not unlimited)
ulimit -n 100000

# 2. Enable SYN cookies (prevent SYN flood)
sysctl -w net.ipv4.tcp_syncookies=1

# 3. Reduce TIME_WAIT timeout
sysctl -w net.ipv4.tcp_fin_timeout=15

# 4. Enable TCP fast recycling
sysctl -w net.ipv4.tcp_tw_reuse=1

# 5. Limit backlog
listen(fd, 128);  // Not 4096
```

**Best Practices Summary:**

1. ✅ Connection limits
2. ✅ Idle timeouts (detect Slowloris)
3. ✅ Rate limiting (detect floods)
4. ✅ Buffer limits (prevent memory exhaustion)
5. ✅ Limit reads per event (prevent CPU starvation)
6. ✅ TCP keep-alive (detect dead connections)
7. ✅ Input validation (prevent injection attacks)
8. ✅ FD validation (prevent confusion attacks)

---

#### Q18: How do you measure and optimize epoll performance? What metrics matter?

**Answer:**

**Key Performance Metrics:**

**1. Throughput (Events/Second)**

```cpp
auto start = std::chrono::steady_clock::now();
size_t events_processed = 0;

while (running) {
    int n = epoll_wait(epfd, events, 128, 1000);  // 1s timeout
    events_processed += n;
    
    // Print metrics every second
    auto now = std::chrono::steady_clock::now();
    if (std::chrono::duration_cast<std::chrono::seconds>(now - start).count() >= 1) {
        std::cout << "Events/sec: " << events_processed << "\n";
        events_processed = 0;
        start = now;
    }
    
    for (int i = 0; i < n; i++) {
        handle_event(events[i]);
    }
}
```

**2. Latency (Time from Event to Processing)**

```cpp
// Mark timestamp when data arrives
struct Connection {
    std::chrono::steady_clock::time_point event_arrival;
};

// Measure latency
if (events[i].events & EPOLLIN) {
    auto arrival = std::chrono::steady_clock::now();
    
    // Process event
    handle_read(fd);
    
    auto processed = std::chrono::steady_clock::now();
    auto latency_us = std::chrono::duration_cast<std::chrono::microseconds>(processed - arrival).count();
    
    // Track p50, p95, p99
    latency_histogram.add(latency_us);
}
```

**3. CPU Usage**

```bash
# Monitor CPU usage
top -p <pid>

# Profile CPU hotspots
perf record -g -p <pid>
perf report

# Check syscall overhead
strace -c -p <pid>

# Example output:
% time     seconds  usecs/call     calls    errors syscall
------ ----------- ----------- --------- --------- ----------------
 60.00    0.120000          10     12000           epoll_wait
 30.00    0.060000           5     12000           recv
 10.00    0.020000           2     10000           send
```

**4. Memory Usage**

```cpp
// Track per-connection memory
struct MemoryStats {
    size_t read_buffer_bytes = 0;
    size_t write_buffer_bytes = 0;
    size_t num_connections = 0;
};

MemoryStats stats;

for (const auto& [fd, conn] : connections) {
    stats.read_buffer_bytes += conn.read_buffer.capacity();
    stats.write_buffer_bytes += conn.write_buffer.capacity();
    stats.num_connections++;
}

std::cout << "Memory usage:\n"
          << "  Connections: " << stats.num_connections << "\n"
          << "  Read buffers: " << (stats.read_buffer_bytes / 1024) << " KB\n"
          << "  Write buffers: " << (stats.write_buffer_bytes / 1024) << " KB\n"
          << "  Avg per conn: " << ((stats.read_buffer_bytes + stats.write_buffer_bytes) / stats.num_connections / 1024) << " KB\n";
```

**5. Event Batch Size (maxevents Efficiency)**

```cpp
std::vector<int> batch_sizes;

while (running) {
    int n = epoll_wait(epfd, events, 128, -1);
    batch_sizes.push_back(n);
    
    // Print histogram every 10 seconds
    if (batch_sizes.size() >= 10000) {
        std::sort(batch_sizes.begin(), batch_sizes.end());
        
        std::cout << "Event batch size:\n"
                  << "  p50: " << batch_sizes[batch_sizes.size() / 2] << "\n"
                  << "  p95: " << batch_sizes[batch_sizes.size() * 95 / 100] << "\n"
                  << "  p99: " << batch_sizes[batch_sizes.size() * 99 / 100] << "\n"
                  << "  max: " << batch_sizes.back() << "\n";
        
        batch_sizes.clear();
    }
}
```

**Optimization Techniques:**

**1. Tune maxevents**

```cpp
// Start with 128, measure batch sizes
int maxevents = 128;
struct epoll_event *events = new epoll_event[maxevents];

// If consistently hitting limit, increase
// If rarely using more than 25%, decrease
```

**2. Edge-Triggered Mode**

```cpp
// Level-triggered: More wake-ups
ev.events = EPOLLIN;

// Edge-triggered: Fewer wake-ups ✅
ev.events = EPOLLIN | EPOLLET;

// Benchmark difference
// Level-triggered: 100,000 events/sec, 100,000 wake-ups
// Edge-triggered: 100,000 events/sec, 10,000 wake-ups (10x fewer)
```

**3. Batch Processing**

```cpp
// ❌ SLOW: Process one event at a time
for (int i = 0; i < nready; i++) {
    handle_event(events[i]);
}

// ✅ FAST: Batch similar operations
std::vector<int> read_fds;
std::vector<int> write_fds;

for (int i = 0; i < nready; i++) {
    if (events[i].events & EPOLLIN) read_fds.push_back(events[i].data.fd);
    if (events[i].events & EPOLLOUT) write_fds.push_back(events[i].data.fd);
}

// Process all reads, then all writes (better cache locality)
for (int fd : read_fds) handle_read(fd);
for (int fd : write_fds) handle_write(fd);
```

**4. Reduce Syscalls**

```cpp
// ❌ SLOW: One recv() per event
int n = recv(fd, buf, 1024, 0);

// ✅ FAST: Loop until EAGAIN (edge-triggered)
while (true) {
    int n = recv(fd, buf, 4096, 0);  // Larger buffer
    if (n < 0 && errno == EAGAIN) break;
    process(buf, n);
}

// Result: 1 syscall instead of 10
```

**5. Zero-Copy with sendfile()**

```cpp
// ❌ SLOW: read() + send()
char buf[4096];
int n = read(file_fd, buf, sizeof(buf));
send(socket_fd, buf, n, 0);

// ✅ FAST: sendfile() (zero-copy)
#include <sys/sendfile.h>

off_t offset = 0;
sendfile(socket_fd, file_fd, &offset, file_size);  // No userspace copy ✅
```

**6. Avoid epoll_ctl() in Hot Path**

```cpp
// ❌ SLOW: Modify events frequently
epoll_ctl(epfd, EPOLL_CTL_MOD, fd, &ev);  // Expensive

// ✅ FAST: Use EPOLLONESHOT + re-arm only when needed
ev.events = EPOLLIN | EPOLLONESHOT;
epoll_ctl(epfd, EPOLL_CTL_ADD, fd, &ev);  // Once

// Re-arm only after processing
epoll_ctl(epfd, EPOLL_CTL_MOD, fd, &ev);  // Only when done
```

**7. Memory Pool for Buffers**

```cpp
// ❌ SLOW: Allocate per connection
struct Connection {
    std::string read_buffer;  // Heap allocation
};

// ✅ FAST: Pre-allocated pool
class BufferPool {
    std::vector<char*> free_buffers;
    const size_t BUFFER_SIZE = 4096;
    
public:
    BufferPool(size_t count) {
        for (size_t i = 0; i < count; i++) {
            free_buffers.push_back(new char[BUFFER_SIZE]);
        }
    }
    
    char* acquire() {
        if (free_buffers.empty()) return new char[BUFFER_SIZE];
        char *buf = free_buffers.back();
        free_buffers.pop_back();
        return buf;
    }
    
    void release(char *buf) {
        free_buffers.push_back(buf);
    }
};
```

**Benchmark Example:**

```cpp
#include <chrono>

void benchmark_epoll(int num_connections, int num_events) {
    // Setup
    int epfd = epoll_create1(0);
    std::vector<int> fds;
    
    for (int i = 0; i < num_connections; i++) {
        int fd = socket(AF_INET, SOCK_STREAM, 0);
        // ... connect ...
        
        struct epoll_event ev;
        ev.events = EPOLLIN | EPOLLET;
        ev.data.fd = fd;
        epoll_ctl(epfd, EPOLL_CTL_ADD, fd, &ev);
        
        fds.push_back(fd);
    }
    
    // Benchmark
    auto start = std::chrono::steady_clock::now();
    size_t events_processed = 0;
    
    while (events_processed < num_events) {
        struct epoll_event events[128];
        int n = epoll_wait(epfd, events, 128, -1);
        
        for (int i = 0; i < n; i++) {
            char buf[4096];
            recv(events[i].data.fd, buf, sizeof(buf), 0);
            events_processed++;
        }
    }
    
    auto end = std::chrono::steady_clock::now();
    auto duration_ms = std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count();
    
    std::cout << "Benchmark Results:\n"
              << "  Connections: " << num_connections << "\n"
              << "  Events: " << num_events << "\n"
              << "  Duration: " << duration_ms << " ms\n"
              << "  Events/sec: " << (num_events * 1000 / duration_ms) << "\n"
              << "  Latency: " << (duration_ms * 1000.0 / num_events) << " us/event\n";
    
    // Cleanup
    for (int fd : fds) close(fd);
    close(epfd);
}

// Run
benchmark_epoll(10000, 1000000);
```

**Expected Results:**

```
Benchmark Results:
  Connections: 10000
  Events: 1000000
  Duration: 2500 ms
  Events/sec: 400000
  Latency: 2.5 us/event
```

**Profiling Tools:**

```bash
# 1. perf (CPU profiling)
perf record -g ./server
perf report

# 2. flamegraph (visualize hotspots)
perf record -F 99 -g -p <pid>
perf script | ./flamegraph.pl > flame.svg

# 3. strace (syscall overhead)
strace -c -p <pid>

# 4. ltrace (library calls)
ltrace -c -p <pid>

# 5. valgrind (memory profiling)
valgrind --tool=massif ./server
ms_print massif.out.<pid>

# 6. sar (system metrics)
sar -n DEV 1  # Network throughput
sar -u 1       # CPU usage
```

**Target Metrics (High-Performance Server):**

| Metric | Target |
|--------|--------|
| Events/sec | > 100,000 |
| Latency p99 | < 10 ms |
| CPU usage | < 80% |
| Memory per conn | < 10 KB |
| Syscalls per event | < 2 |
| Batch size p50 | > 10 |

---

#### Q19: Can multiple threads/processes call epoll_wait() on the same epoll FD simultaneously? What happens?

**Answer:**

**Short Answer:** Yes, multiple threads/processes CAN call `epoll_wait()` on the same epoll FD simultaneously, but you probably shouldn't without understanding the implications.

**What Happens:**

```cpp
// Thread A and Thread B both call:
int n = epoll_wait(epfd, events, 128, -1);
```

**Behavior:**

1. **Both threads block** waiting for events
2. **When an event arrives**, kernel wakes **ALL threads** (thundering herd) ❌
3. **Each thread receives the same events** (duplicate processing risk)
4. **Each thread must handle race conditions**

**Example Timeline:**

```
T1: Thread A calls epoll_wait() → blocks
T2: Thread B calls epoll_wait() → blocks
T3: FD 5 becomes ready (data arrives)
T4: Kernel wakes Thread A and Thread B ❌ (both wake up)
T5: Thread A: epoll_wait() returns {FD 5}
T6: Thread B: epoll_wait() returns {FD 5}  ← Duplicate!
T7: Thread A: recv(FD 5) → 1024 bytes
T8: Thread B: recv(FD 5) → EAGAIN (no more data) or partial read ❌
```

**Problem: Race Conditions**

```cpp
// Thread A and B both wake up for FD 5
// Thread A
char buf[1024];
int n = recv(5, buf, 1024, 0);  // Gets 1024 bytes

// Thread B (simultaneous)
char buf[1024];
int n = recv(5, buf, 1024, 0);  // Gets next 1024 bytes ❌

// Result: Data processed out of order or by wrong handlers!
```

**Solution 1: EPOLLONESHOT (Recommended for Multi-threaded)**

```cpp
// Register FD with EPOLLONESHOT
struct epoll_event ev;
ev.events = EPOLLIN | EPOLLONESHOT;  // ✅ One thread at a time
ev.data.fd = fd;
epoll_ctl(epfd, EPOLL_CTL_ADD, fd, &ev);

// Thread A: epoll_wait() returns FD 5, starts processing
// Thread B: epoll_wait() does NOT return FD 5 (disabled) ✅

// Thread A: After processing, re-arm
epoll_ctl(epfd, EPOLL_CTL_MOD, fd, &ev);  // Enable again
```

**Solution 2: EPOLLEXCLUSIVE (Linux 4.5+, Multi-process)**

```cpp
// Each process registers listen socket with EPOLLEXCLUSIVE
struct epoll_event ev;
ev.events = EPOLLIN | EPOLLEXCLUSIVE;  // ✅ Wake only one process
ev.data.fd = listen_fd;
epoll_ctl(epfd, EPOLL_CTL_ADD, listen_fd, &ev);

// When connection arrives:
// - Kernel wakes only ONE process ✅
// - Other processes stay asleep
```

**Solution 3: Single epoll_wait() Thread + Worker Pool**

```cpp
// Main thread: epoll_wait()
// Worker threads: process events

std::queue<struct epoll_event> event_queue;
std::mutex queue_mutex;
std::condition_variable queue_cv;

// Main thread
void epoll_thread() {
    while (running) {
        struct epoll_event events[128];
        int n = epoll_wait(epfd, events, 128, -1);
        
        {
            std::lock_guard<std::mutex> lock(queue_mutex);
            for (int i = 0; i < n; i++) {
                event_queue.push(events[i]);
            }
        }
        queue_cv.notify_all();  // Wake worker threads
    }
}

// Worker threads
void worker_thread() {
    while (running) {
        struct epoll_event ev;
        
        {
            std::unique_lock<std::mutex> lock(queue_mutex);
            queue_cv.wait(lock, [] { return !event_queue.empty(); });
            
            ev = event_queue.front();
            event_queue.pop();
        }
        
        // Process event (no race with other workers)
        handle_event(ev);
    }
}
```

**Multi-Process Scenario (fork after epoll_create):**

```cpp
int epfd = epoll_create1(0);
int listen_fd = socket(...);

struct epoll_event ev;
ev.events = EPOLLIN;
ev.data.fd = listen_fd;
epoll_ctl(epfd, EPOLL_CTL_ADD, listen_fd, &ev);

// Fork 4 worker processes
for (int i = 0; i < 4; i++) {
    if (fork() == 0) {
        // Child process
        while (true) {
            struct epoll_event events[128];
            int n = epoll_wait(epfd, events, 128, -1);  // All 4 children call this
            
            // ❌ All 4 wake up for one connection (thundering herd)
            for (int j = 0; j < n; j++) {
                int client = accept(listen_fd, ...);  // Only one succeeds
                // Others get EAGAIN
            }
        }
    }
}
```

**With EPOLLEXCLUSIVE:**

```cpp
// Each child sets EPOLLEXCLUSIVE
ev.events = EPOLLIN | EPOLLEXCLUSIVE;
epoll_ctl(epfd, EPOLL_CTL_ADD, listen_fd, &ev);

// Now only ONE child wakes per connection ✅
```

**Thread Safety of epoll Operations:**

| Operation | Multiple Threads | Behavior |
|-----------|------------------|----------|
| `epoll_wait()` | ✅ Allowed | All wake up (thundering herd) |
| `epoll_ctl(ADD)` | ✅ Allowed | Internally synchronized |
| `epoll_ctl(MOD)` | ✅ Allowed | Internally synchronized |
| `epoll_ctl(DEL)` | ✅ Allowed | Internally synchronized |
| `close(epfd)` | ⚠️ Dangerous | Must ensure no threads in epoll_wait() |

**Real-World Pattern: epoll + Thread Pool**

```cpp
class EpollThreadPool {
private:
    int epfd;
    std::vector<std::thread> workers;
    std::atomic<bool> running{true};
    
public:
    EpollThreadPool(int num_threads) {
        epfd = epoll_create1(0);
        
        for (int i = 0; i < num_threads; i++) {
            workers.emplace_back([this]() { this->worker(); });
        }
    }
    
    void worker() {
        while (running) {
            struct epoll_event events[128];
            int n = epoll_wait(epfd, events, 128, 1000);  // 1s timeout
            
            if (n < 0) {
                if (errno == EINTR) continue;
                break;
            }
            
            // With EPOLLONESHOT, only one thread gets each FD
            for (int i = 0; i < n; i++) {
                int fd = events[i].data.fd;
                
                // Process event
                handle_event(fd);
                
                // Re-arm EPOLLONESHOT
                struct epoll_event ev;
                ev.events = EPOLLIN | EPOLLONESHOT;
                ev.data.fd = fd;
                epoll_ctl(epfd, EPOLL_CTL_MOD, fd, &ev);
            }
        }
    }
    
    void add_fd(int fd) {
        struct epoll_event ev;
        ev.events = EPOLLIN | EPOLLONESHOT;  // ✅ Critical for thread safety
        ev.data.fd = fd;
        epoll_ctl(epfd, EPOLL_CTL_ADD, fd, &ev);
    }
    
    ~EpollThreadPool() {
        running = false;
        for (auto& t : workers) t.join();
        close(epfd);
    }
};
```

**Performance Comparison:**

| Pattern | Thundering Herd | Complexity | Performance |
|---------|-----------------|------------|-------------|
| **Multiple epoll_wait() without flags** | ❌ Yes | Low | Poor (wasted wake-ups) |
| **Multiple epoll_wait() + EPOLLONESHOT** | ✅ No | Medium | Good |
| **Multiple epoll_wait() + EPOLLEXCLUSIVE** | ✅ No | Medium | Good |
| **Single epoll_wait() + worker queue** | ✅ No | High | Excellent |

**Recommendation:**

1. **Single-threaded:** One epoll_wait() loop (simplest)
2. **Multi-threaded (sockets):** EPOLLONESHOT + multiple epoll_wait() threads
3. **Multi-process (pre-fork):** EPOLLEXCLUSIVE or SO_REUSEPORT
4. **High-performance:** Single epoll_wait() + lock-free worker queue

---

#### Q20: What are the differences between epoll_create() and epoll_create1()? Why should you use epoll_create1()?

**Answer:**

**epoll_create()** (Deprecated):

```cpp
int epoll_create(int size);

// Example:
int epfd = epoll_create(1024);  // "size" hint (ignored since Linux 2.6.8)
```

**epoll_create1()** (Modern):

```cpp
int epoll_create1(int flags);

// Example:
int epfd = epoll_create1(0);  // No flags
int epfd = epoll_create1(EPOLL_CLOEXEC);  // Close-on-exec
```

**Key Differences:**

| Feature | epoll_create() | epoll_create1() |
|---------|----------------|-----------------|
| **Introduced** | Linux 2.6 (2003) | Linux 2.6.27 (2008) |
| **size parameter** | Required (but ignored since 2.6.8) | No size parameter ✅ |
| **Flags support** | No | Yes (EPOLL_CLOEXEC) |
| **Close-on-exec** | Must set manually | Built-in flag ✅ |
| **Status** | Deprecated | **Recommended** ✅ |

**Why size is Meaningless in epoll_create():**

Originally (pre-2.6.8), `size` hinted how many FDs you'd monitor. Kernel pre-allocated hash table.

```cpp
// Old behavior (Linux < 2.6.8)
int epfd = epoll_create(1000);  // Pre-allocate for 1000 FDs
```

Since Linux 2.6.8, kernel uses dynamic red-black tree. Size ignored.

```cpp
// Modern behavior (Linux >= 2.6.8)
int epfd = epoll_create(1);      // Works fine
int epfd = epoll_create(100000); // Same performance as above
```

**Problem: Confusing API**

```cpp
// ❌ Misleading: size has no effect
int epfd = epoll_create(10);  // Suggests only 10 FDs?
epoll_ctl(epfd, EPOLL_CTL_ADD, fd_100, &ev);  // Works fine! ✅
```

**EPOLL_CLOEXEC Flag:**

Without EPOLL_CLOEXEC:

```cpp
int epfd = epoll_create(1);

if (fork() == 0) {
    // Child process inherits epfd ❌
    exec("./other_program");
    // other_program has epfd (file descriptor leak!)
}
```

With EPOLL_CLOEXEC:

```cpp
int epfd = epoll_create1(EPOLL_CLOEXEC);  // ✅ Close-on-exec set

if (fork() == 0) {
    exec("./other_program");
    // epfd automatically closed before exec() ✅
}
```

**Manual CLOEXEC with epoll_create():**

```cpp
int epfd = epoll_create(1);

// Set close-on-exec manually
int flags = fcntl(epfd, F_GETFD);
fcntl(epfd, F_SETFD, flags | FD_CLOEXEC);

// ❌ Race condition between epoll_create() and fcntl()!
// If fork() happens between them, FD leaks
```

**Race-Free with epoll_create1():**

```cpp
int epfd = epoll_create1(EPOLL_CLOEXEC);  // ✅ Atomic
```

**Why EPOLL_CLOEXEC Matters:**

**Security:** Prevent FD leaks to child processes

```cpp
// Server code
int epfd = epoll_create1(EPOLL_CLOEXEC);
int client_fd = accept(...);
epoll_ctl(epfd, EPOLL_CTL_ADD, client_fd, &ev);

// Spawn CGI process
if (fork() == 0) {
    exec("/usr/bin/php-cgi");
    // Without CLOEXEC: php-cgi inherits epfd, client_fd ❌
    // Attacker could exploit this
}
```

**Resource Leaks:**

```cpp
// Parent has 10,000 FDs in epoll
for (int i = 0; i < 10000; i++) {
    // ...
}

// Fork worker
if (fork() == 0) {
    // Child doesn't use epoll, but inherits all 10,000 FDs ❌
    // Wasted kernel memory
}
```

**Migration Guide:**

```cpp
// ❌ OLD: epoll_create()
int epfd = epoll_create(1024);  // size meaningless

// Set close-on-exec manually (race condition)
int flags = fcntl(epfd, F_GETFD);
fcntl(epfd, F_SETFD, flags | FD_CLOEXEC);

// ✅ NEW: epoll_create1()
int epfd = epoll_create1(EPOLL_CLOEXEC);  // Done!
```

**When to Use Each:**

| Scenario | Use |
|----------|-----|
| **New code** | `epoll_create1(EPOLL_CLOEXEC)` ✅ |
| **Old kernels (< 2.6.27)** | `epoll_create(1) + fcntl()` |
| **No fork/exec** | `epoll_create1(0)` is fine |
| **Security-critical** | `EPOLL_CLOEXEC` required |

**Portability:**

```cpp
// Fallback for old kernels
int create_epoll() {
#ifdef __linux__
    #if defined(EPOLL_CLOEXEC)
        int epfd = epoll_create1(EPOLL_CLOEXEC);
        if (epfd >= 0) return epfd;
    #endif
    
    // Fallback
    int epfd = epoll_create(1);
    if (epfd < 0) return -1;
    
    int flags = fcntl(epfd, F_GETFD);
    fcntl(epfd, F_SETFD, flags | FD_CLOEXEC);
    return epfd;
#else
    // Non-Linux
    return -1;
#endif
}
```

**Best Practice:**

```cpp
// ✅ Always use epoll_create1() in modern code
int epfd = epoll_create1(EPOLL_CLOEXEC);

if (epfd < 0) {
    perror("epoll_create1");
    return 1;
}
```

**Summary:**

- **epoll_create():** Deprecated, confusing API, manual CLOEXEC
- **epoll_create1():** Modern, clean API, atomic CLOEXEC ✅
- **Always use** `epoll_create1(EPOLL_CLOEXEC)` unless you need Linux < 2.6.27 compatibility

---


---
