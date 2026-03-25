# Chapter 18: Network Programming

## TOPIC: epoll() - High-Performance I/O for Linux

### THEORY_SECTION: Beyond poll() - Linux's Scalable Event Notification

#### The Problem with poll()

In Topic 4, we learned poll() solves select()'s FD_SETSIZE limitation. However, poll() still has O(n) complexity:

**poll()'s limitations**:
```cpp
// With 10,000 connections
std::vector<struct pollfd> fds(10000);

// ❌ Kernel must check ALL 10,000 FDs every call
int ready = poll(fds.data(), fds.size(), -1);

// ❌ Userspace must iterate ALL 10,000 FDs
for (auto& pfd : fds) {
    if (pfd.revents & POLLIN) {
        handle_read(pfd.fd);
    }
}

// Total: O(10000) in kernel + O(10000) in userspace = O(20000) operations
```

**Real-world impact**:
- 10,000 connections, 100 active: poll() checks all 10,000 (99% wasted)
- CPU usage scales linearly with total FDs, not active FDs
- High latency under load

---

#### What is epoll()?

`epoll()` is a Linux-specific I/O event notification mechanism (since Linux 2.5.44, 2002) that provides **O(1) event registration** and **O(num_active) event retrieval**.

**Key innovation**: Instead of passing the entire FD set every time, you **register FDs once** and the kernel maintains an internal data structure. Only **ready FDs** are returned.

**Function signatures**:
```cpp
#include <sys/epoll.h>

// Create epoll instance
int epoll_create1(int flags);

// Control operations (add, modify, delete)
int epoll_ctl(int epfd, int op, int fd, struct epoll_event *event);

// Wait for events
int epoll_wait(int epfd, struct epoll_event *events,
               int maxevents, int timeout);
```

**Comparison**:

| Operation | poll() | epoll() |
|-----------|--------|---------|
| **Setup** | Create array | `epoll_create1(0)` |
| **Add FD** | `push_back()` (O(1)) | `epoll_ctl(ADD)` (O(log n)) |
| **Remove FD** | `erase()` (O(n)) | `epoll_ctl(DEL)` (O(log n)) |
| **Wait** | `poll()` checks all (O(n)) | `epoll_wait()` returns ready (O(num_ready)) |
| **Total complexity** | O(n) every wait | O(num_ready) |

---

#### How epoll() Works Internally

**Data structures**:

```
┌─────────────────────────────────────────┐
│         epoll Instance (epfd)           │
├─────────────────────────────────────────┤
│  Red-Black Tree (Interest List)        │
│  ┌─────────────────────────────┐       │
│  │  FD 4: EPOLLIN              │       │
│  │  FD 5: EPOLLIN | EPOLLOUT   │       │
│  │  FD 8: EPOLLIN              │       │
│  │  ... (all registered FDs)    │       │
│  └─────────────────────────────┘       │
│                                         │
│  Ready List (Linked List)               │
│  ┌─────────────────────────────┐       │
│  │  FD 5: EPOLLIN | EPOLLOUT   │       │
│  │  FD 8: EPOLLIN              │       │
│  │  ... (only ready FDs)        │       │
│  └─────────────────────────────┘       │
└─────────────────────────────────────────┘
```

**How it works**:
1. **epoll_create1()**: Kernel allocates red-black tree + ready list
2. **epoll_ctl(ADD)**: Insert FD into tree (O(log n))
3. **When data arrives**: Kernel moves FD from tree to ready list (O(1))
4. **epoll_wait()**: Return FDs from ready list (O(num_ready))

**Why it's fast**:
- Kernel maintains state (no copying entire FD set)
- Only ready FDs returned (no scanning inactive FDs)
- O(1) notification when FD becomes ready

---

#### epoll API in Detail

**1. epoll_create1() - Create Instance**

```cpp
int epfd = epoll_create1(0);

// flags:
//   0: Default behavior
//   EPOLL_CLOEXEC: Close-on-exec
```

**Returns**: epoll file descriptor (just like a socket FD)

**2. epoll_ctl() - Control Operations**

```cpp
int epoll_ctl(int epfd, int op, int fd, struct epoll_event *event);

// op (operation):
//   EPOLL_CTL_ADD: Add FD to interest list
//   EPOLL_CTL_MOD: Modify existing FD's events
//   EPOLL_CTL_DEL: Remove FD from interest list

// event: What events to monitor
struct epoll_event {
    uint32_t events;    // Event flags (EPOLLIN, EPOLLOUT, etc.)
    epoll_data_t data;  // User data (usually stores FD)
};

typedef union epoll_data {
    void *ptr;
    int fd;
    uint32_t u32;
    uint64_t u64;
} epoll_data_t;
```

**Adding a FD**:
```cpp
struct epoll_event ev;
ev.events = EPOLLIN;        // Monitor reads
ev.data.fd = client_fd;     // Store FD for retrieval

epoll_ctl(epfd, EPOLL_CTL_ADD, client_fd, &ev);
```

**Modifying events**:
```cpp
ev.events = EPOLLIN | EPOLLOUT;  // Now also monitor writes
epoll_ctl(epfd, EPOLL_CTL_MOD, client_fd, &ev);
```

**Removing a FD**:
```cpp
epoll_ctl(epfd, EPOLL_CTL_DEL, client_fd, NULL);  // event can be NULL
```

**3. epoll_wait() - Wait for Events**

```cpp
struct epoll_event events[MAX_EVENTS];

int nready = epoll_wait(epfd, events, MAX_EVENTS, timeout_ms);

// timeout_ms:
//   -1: Block forever
//   0: Non-blocking (return immediately)
//   >0: Timeout in milliseconds

// Returns:
//   >0: Number of ready FDs (filled in events array)
//   0: Timeout
//   -1: Error
```

**Processing events**:
```cpp
for (int i = 0; i < nready; i++) {
    int fd = events[i].data.fd;

    if (events[i].events & EPOLLIN) {
        // Read ready
        handle_read(fd);
    }

    if (events[i].events & EPOLLOUT) {
        // Write ready
        handle_write(fd);
    }
}
```

---

#### Level-Triggered vs Edge-Triggered

epoll() supports **two notification modes** - the most important concept to understand.

**Level-Triggered (default)**:

```cpp
// Behavior: "FD is ready" (same as poll/select)

ev.events = EPOLLIN;  // Default is level-triggered
epoll_ctl(epfd, EPOLL_CTL_ADD, fd, &ev);

// 1000 bytes arrive
epoll_wait(...);  // Returns: fd ready

recv(fd, buf, 100, 0);  // Read 100 bytes (900 remain)

epoll_wait(...);  // ✅ Returns again (still readable)

recv(fd, buf, 900, 0);  // Read remaining 900 bytes

epoll_wait(...);  // Blocks (no more data)
```

**Edge-Triggered** (EPOLLET flag):

```cpp
// Behavior: "FD became ready" (only notified on state change)

ev.events = EPOLLIN | EPOLLET;  // Enable edge-triggered
epoll_ctl(epfd, EPOLL_CTL_ADD, fd, &ev);

// 1000 bytes arrive
epoll_wait(...);  // Returns: fd ready

recv(fd, buf, 100, 0);  // Read 100 bytes (900 remain)

epoll_wait(...);  // ❌ Blocks! No new data arrived

// Data is lost unless you read until EAGAIN
```

**Edge-triggered requirements**:
```cpp
// 1. Socket MUST be non-blocking
int flags = fcntl(fd, F_GETFL, 0);
fcntl(fd, F_SETFL, flags | O_NONBLOCK);

// 2. MUST read until EAGAIN
while (true) {
    int n = recv(fd, buf, sizeof(buf), 0);

    if (n < 0) {
        if (errno == EAGAIN || errno == EWOULDBLOCK) {
            break;  // ✅ No more data
        }
        // Error
    }

    if (n == 0) {
        // EOF
        break;
    }

    process_data(buf, n);
}
```

**Comparison**:

| Aspect | Level-Triggered | Edge-Triggered |
|--------|-----------------|----------------|
| **Notification** | "Is ready" | "Became ready" |
| **Repeat** | Every epoll_wait() | Only on state change |
| **Partial read** | Still notified | NOT notified |
| **Complexity** | Simpler | More complex |
| **Performance** | Slightly slower | Slightly faster |
| **Use case** | Most applications | High-performance servers |

**When to use edge-triggered**:
- ✅ Extremely high connection count (>100k)
- ✅ Can ensure complete reads/writes
- ✅ Want to avoid wakeup storms (thundering herd)
- ❌ Easier to make mistakes (data loss)

**Recommendation**: Start with level-triggered. Only use edge-triggered after profiling shows it's needed.

---

#### Event Flags

**Input flags** (set in events field):

```cpp
EPOLLIN        // Data available for reading
EPOLLOUT       // Can write without blocking
EPOLLPRI       // High-priority data (OOB)
EPOLLERR       // Error condition (always monitored)
EPOLLHUP       // Hang up (always monitored)
EPOLLET        // Edge-triggered mode
EPOLLONESHOT   // One-shot mode (disable after event)
EPOLLRDHUP     // Peer shutdown write half (since Linux 2.6.17)
```

**EPOLLET - Edge-Triggered**:
```cpp
ev.events = EPOLLIN | EPOLLET;
```

**EPOLLONESHOT - One-Shot Mode**:
```cpp
// Used with thread pools: Disable FD after event until re-armed

ev.events = EPOLLIN | EPOLLONESHOT;
epoll_ctl(epfd, EPOLL_CTL_ADD, fd, &ev);

// After event
epoll_wait(...);  // Returns fd

// FD now disabled (won't get more events)
// Worker thread processes FD

// Re-arm after processing
ev.events = EPOLLIN | EPOLLONESHOT;
epoll_ctl(epfd, EPOLL_CTL_MOD, fd, &ev);
```

**EPOLLRDHUP - Peer Shutdown**:
```cpp
// Detect half-closed connections (peer called shutdown(SHUT_WR))

ev.events = EPOLLIN | EPOLLRDHUP;

if (events[i].events & EPOLLRDHUP) {
    // Peer shutdown write side (but might still be reading)
}
```

---

#### Performance Characteristics

**Time complexity**:

| Operation | poll() | epoll() |
|-----------|--------|---------|
| **Add FD** | O(1) | O(log n) |
| **Remove FD** | O(n) | O(log n) |
| **Wait** | O(n) | O(num_ready) |
| **Modify events** | O(1) | O(log n) |

**Real-world performance**:

```
Scenario: 10,000 connections, 100 active

poll():
- poll() call: 10ms (check all 10k FDs)
- Iterate results: 10ms (scan all 10k)
- Total: 20ms per iteration

epoll():
- epoll_wait() call: 0.2ms (return 100 ready)
- Process results: 0.1ms (process 100)
- Total: 0.3ms per iteration

Speedup: 66x faster!
```

**Scalability**:

| Connections | Active | poll() latency | epoll() latency | Speedup |
|-------------|--------|----------------|-----------------|---------|
| 1,000 | 100 | 2 ms | 0.3 ms | 6.7x |
| 10,000 | 100 | 20 ms | 0.3 ms | 66x |
| 100,000 | 1,000 | 200 ms | 3 ms | 66x |
| 1,000,000 | 10,000 | 2,000 ms | 30 ms | 66x |

**Key insight**: epoll() performance scales with **active** connections, not total connections.

---

#### When to Use epoll()

**Use epoll() when**:

✅ **>1000 concurrent connections**
```cpp
// epoll() shines with high connection counts
```

✅ **Most connections idle** (<1% active)
```cpp
// Long-polling, webhooks, monitoring
```

✅ **Linux-only deployment**
```cpp
// epoll() is Linux-specific
```

✅ **Need maximum performance**
```cpp
// Web servers, proxies, load balancers
```

✅ **C10K problem** (10,000+ concurrent connections)

**Don't use epoll() when**:

❌ **<1000 connections**
```cpp
// poll() overhead negligible
```

❌ **Need portability** (Windows, BSD, macOS)
```cpp
// Use poll() or abstraction library (libevent, Boost.Asio)
```

❌ **Most connections active** (>50%)
```cpp
// epoll() advantage minimal
```

❌ **Simplicity preferred over performance**
```cpp
// poll() easier to get right
```

---

#### Limitations and Gotchas

**1. Linux-only**:
```cpp
// epoll() not available on:
// - Windows (use IOCP)
// - BSD/macOS (use kqueue)
// - Solaris (use /dev/poll)
```

**2. Regular files don't work**:
```cpp
int file_fd = open("file.txt", O_RDONLY);

// ❌ Always returns ready (can't epoll regular files)
epoll_ctl(epfd, EPOLL_CTL_ADD, file_fd, &ev);
epoll_wait(...);  // Returns immediately
```

**3. Edge-triggered complexity**:
```cpp
// Easy to lose data if not careful
// Must read until EAGAIN
// Must use non-blocking sockets
```

**4. EPOLLONESHOT re-arming overhead**:
```cpp
// epoll_ctl(MOD) is O(log n)
// Can be expensive with many threads
```

**5. FD reuse after close()**:
```cpp
// If FD number reused, old registrations may interfere
close(fd);  // FD 4 closed

int new_fd = accept(...);  // new_fd might be 4 again
// Old epoll registration for FD 4 still exists!

// Solution: Always epoll_ctl(DEL) before close()
epoll_ctl(epfd, EPOLL_CTL_DEL, fd, NULL);
close(fd);
```

---

### EDGE_CASES: Production Gotchas and Solutions

#### Edge Case 1: Edge-Triggered EAGAIN Handling

**Problem**: Forgetting to read until EAGAIN loses data in edge-triggered mode.

```cpp
// ❌ WRONG: Only one recv() call
ev.events = EPOLLIN | EPOLLET;
epoll_ctl(epfd, EPOLL_CTL_ADD, fd, &ev);

if (events[i].events & EPOLLIN) {
    char buf[1024];
    recv(fd, buf, sizeof(buf), 0);  // ❌ If 2000 bytes arrived, 1000 lost!
}
```

**Why it's wrong**:
1. 2000 bytes arrive
2. epoll_wait() returns fd
3. recv() reads 1024 bytes
4. 976 bytes remain in buffer
5. epoll_wait() won't return again (edge-triggered)
6. **976 bytes lost forever**

**Solution**: Read until EAGAIN
```cpp
// ✅ Correct: Read loop until EAGAIN
if (events[i].events & EPOLLIN) {
    while (true) {
        char buf[1024];
        int n = recv(fd, buf, sizeof(buf), 0);

        if (n < 0) {
            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                break;  // ✅ No more data
            }

            // Real error
            perror("recv");
            close(fd);
            break;
        }

        if (n == 0) {
            // EOF
            close(fd);
            break;
        }

        process_data(buf, n);
    }
}
```

**Testing for this bug**:
```bash
# Send large data to trigger partial read
dd if=/dev/zero bs=1M count=10 | nc localhost 8080

# Check server received all data (not just first recv)
```

---

#### Edge Case 2: EPOLLONESHOT Re-arming Race

**Problem**: Not re-arming EPOLLONESHOT FD allows events to be lost.

```cpp
// ❌ Worker thread doesn't re-arm
void worker_thread() {
    while (true) {
        int fd = work_queue.pop();

        // Process FD
        handle_client(fd);

        // ❌ Forgot to re-arm! FD now permanently disabled
    }
}
```

**Why it happens**:
1. Main thread: epoll_wait() returns fd
2. Main thread: Adds fd to work queue
3. FD now disabled (EPOLLONESHOT)
4. Worker processes fd
5. **FD never re-armed - future events lost**

**Solution**: Always re-arm after processing
```cpp
// ✅ Correct: Re-arm in worker
void worker_thread() {
    while (true) {
        int fd = work_queue.pop();

        // Process FD
        handle_client(fd);

        // ✅ Re-arm for next event
        struct epoll_event ev;
        ev.events = EPOLLIN | EPOLLONESHOT;
        ev.data.fd = fd;
        epoll_ctl(epfd, EPOLL_CTL_MOD, fd, &ev);
    }
}
```

**Alternative**: Use separate epoll instance per thread (no EPOLLONESHOT needed).

---

#### Edge Case 3: FD Reuse After close()

**Problem**: FD numbers are reused by kernel, causing epoll confusion.

```cpp
// ❌ Dangerous sequence
int fd = accept(...);  // FD 5 accepted

epoll_ctl(epfd, EPOLL_CTL_ADD, 5, &ev);  // Register FD 5

close(5);  // Close FD 5 (but still registered in epoll!)

// Later...
int new_fd = accept(...);  // new_fd might be 5 again!

// epoll still thinks FD 5 is the old connection!
// Events for new connection go to old handlers
```

**Why it's dangerous**:
- Kernel reuses lowest available FD number
- epoll registrations survive close()
- New FD gets events meant for old FD

**Solution**: Always DEL before close()
```cpp
// ✅ Correct order
epoll_ctl(epfd, EPOLL_CTL_DEL, fd, NULL);  // ✅ Remove from epoll first
close(fd);                                  // ✅ Then close
```

**Kernel behavior** (since Linux 2.6.9):
- close() automatically removes FD from epoll in recent kernels
- But explicit DEL is clearer and works on all versions

---

#### Edge Case 4: Large maxevents vs Small maxevents

**Problem**: Choosing wrong maxevents causes performance issues.

```cpp
// ❌ maxevents too small - starvation
struct epoll_event events[10];
int nready = epoll_wait(epfd, events, 10, -1);  // Only get 10 events

// With 1000 FDs ready, only 10 processed per iteration
// Other 990 FDs starve
```

**Impact**:
- maxevents=10, 1000 ready: Need 100 iterations to process all
- High latency for connections at end of queue
- Unfair scheduling

**Solution 1: Reasonable maxevents**
```cpp
// ✅ Good default
const int MAX_EVENTS = 128;
struct epoll_event events[MAX_EVENTS];
```

**Solution 2: Process until empty**
```cpp
while (true) {
    int nready = epoll_wait(epfd, events, MAX_EVENTS, 0);  // Non-blocking

    if (nready <= 0) break;  // No more ready FDs

    for (int i = 0; i < nready; i++) {
        handle_event(events[i]);
    }
}
```

**Opposite problem: maxevents too large**
```cpp
// ❌ Wastes memory
struct epoll_event events[100000];  // 800 KB on stack!

// Only 100 FDs typically ready at once
```

**Recommendation**: maxevents = 128 to 1024 (good balance).

---

#### Edge Case 5: Level-Triggered Starvation

**Problem**: One FD always ready prevents others from being processed.

```cpp
// ❌ Level-triggered busy loop
while (true) {
    int nready = epoll_wait(epfd, events, 128, -1);

    for (int i = 0; i < nready; i++) {
        int fd = events[i].data.fd;

        if (events[i].events & EPOLLIN) {
            char buf[1024];
            int n = recv(fd, buf, sizeof(buf), 0);
            // Only read 1024 bytes, not all data
        }
    }
}

// If FD has 1 MB queued:
// - epoll_wait() returns FD every iteration
// - Other FDs starve
```

**Why it happens**:
- Level-triggered: FD reported while data remains
- If you don't read all data, FD stays ready
- epoll_wait() keeps returning same FD

**Solution 1: Read until would block**
```cpp
// ✅ Read all data
while (true) {
    int n = recv(fd, buf, sizeof(buf), MSG_DONTWAIT);
    if (n <= 0) break;
    process(buf, n);
}
```

**Solution 2: Use edge-triggered**
```cpp
// Edge-triggered forces complete read
ev.events = EPOLLIN | EPOLLET;
```

**Solution 3: Round-robin fairness**
```cpp
// Process each FD's first packet, then next iteration
for (int i = 0; i < nready; i++) {
    int n = recv(fd, buf, sizeof(buf), MSG_DONTWAIT);
    if (n > 0) {
        process(buf, n);
        // Don't loop - give other FDs a chance
    }
}
```

---

### CODE_EXAMPLES: Complete Working Implementations

#### Example 1: Basic Echo Server with epoll (Level-Triggered)

**Purpose**: Minimal echo server using epoll in level-triggered mode.

**Concepts**: epoll_create1, epoll_ctl, epoll_wait, level-triggered behavior.

```cpp
#include <iostream>
#include <sys/epoll.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
#include <cstring>
#include <fcntl.h>

const int PORT = 8080;
const int MAX_EVENTS = 128;
const int BUFFER_SIZE = 1024;

void set_nonblocking(int fd) {
    int flags = fcntl(fd, F_GETFL, 0);
    fcntl(fd, F_SETFL, flags | O_NONBLOCK);
}

int main() {
    // Create server socket
    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (server_fd < 0) {
        perror("socket");
        return 1;
    }

    int opt = 1;
    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    struct sockaddr_in server_addr;
    server_addr.sin_family = AF_INET;
    server_addr.sin_addr.s_addr = INADDR_ANY;
    server_addr.sin_port = htons(PORT);

    if (bind(server_fd, (struct sockaddr*)&server_addr, sizeof(server_addr)) < 0) {
        perror("bind");
        close(server_fd);
        return 1;
    }

    if (listen(server_fd, 128) < 0) {
        perror("listen");
        close(server_fd);
        return 1;
    }

    set_nonblocking(server_fd);

    std::cout << "Echo server listening on port " << PORT << " (epoll level-triggered)\n";

    // Create epoll instance
    int epfd = epoll_create1(0);
    if (epfd < 0) {
        perror("epoll_create1");
        close(server_fd);
        return 1;
    }

    // Add server socket to epoll
    struct epoll_event ev, events[MAX_EVENTS];
    ev.events = EPOLLIN;
    ev.data.fd = server_fd;

    if (epoll_ctl(epfd, EPOLL_CTL_ADD, server_fd, &ev) < 0) {
        perror("epoll_ctl");
        close(server_fd);
        close(epfd);
        return 1;
    }

    // Event loop
    while (true) {
        int nready = epoll_wait(epfd, events, MAX_EVENTS, -1);

        if (nready < 0) {
            perror("epoll_wait");
            break;
        }

        for (int i = 0; i < nready; i++) {
            int fd = events[i].data.fd;

            if (fd == server_fd) {
                // New connection
                struct sockaddr_in client_addr;
                socklen_t addr_len = sizeof(client_addr);
                int client_fd = accept(server_fd, (struct sockaddr*)&client_addr, &addr_len);

                if (client_fd < 0) {
                    perror("accept");
                    continue;
                }

                set_nonblocking(client_fd);

                // Add to epoll
                ev.events = EPOLLIN;
                ev.data.fd = client_fd;
                epoll_ctl(epfd, EPOLL_CTL_ADD, client_fd, &ev);

                std::cout << "Client " << client_fd << " connected\n";
            }
            else {
                // Client data
                if (events[i].events & EPOLLIN) {
                    char buffer[BUFFER_SIZE];
                    int n = recv(fd, buffer, sizeof(buffer), 0);

                    if (n <= 0) {
                        // Client disconnected or error
                        if (n == 0) {
                            std::cout << "Client " << fd << " disconnected\n";
                        } else {
                            perror("recv");
                        }

                        epoll_ctl(epfd, EPOLL_CTL_DEL, fd, NULL);
                        close(fd);
                    }
                    else {
                        // Echo back
                        buffer[n] = '\0';
                        std::cout << "Client " << fd << ": " << buffer;
                        send(fd, buffer, n, 0);
                    }
                }

                if (events[i].events & (EPOLLHUP | EPOLLERR)) {
                    std::cout << "Client " << fd << " error/hangup\n";
                    epoll_ctl(epfd, EPOLL_CTL_DEL, fd, NULL);
                    close(fd);
                }
            }
        }
    }

    close(epfd);
    close(server_fd);
    return 0;
}
```

**Compilation and Testing**:
```bash
g++ -std=c++11 epoll_echo_server.cpp -o epoll_echo_server
./epoll_echo_server

# Test with telnet
telnet localhost 8080
Hello
Hello  # echoed back
```

**Key points**:
- Level-triggered (default)
- Non-blocking sockets
- Single recv() per event (level-triggered allows this)

---

#### Example 2: Edge-Triggered Echo Server

**Purpose**: Demonstrate edge-triggered mode with proper EAGAIN handling.

**Concepts**: EPOLLET flag, read-until-EAGAIN loop, non-blocking requirements.

```cpp
#include <iostream>
#include <sys/epoll.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
#include <fcntl.h>
#include <cstring>
#include <errno.h>

const int PORT = 8080;
const int MAX_EVENTS = 128;
const int BUFFER_SIZE = 1024;

void set_nonblocking(int fd) {
    int flags = fcntl(fd, F_GETFL, 0);
    fcntl(fd, F_SETFL, flags | O_NONBLOCK);
}

int main() {
    // Create server (same as Example 1)
    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    int opt = 1;
    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    struct sockaddr_in server_addr;
    server_addr.sin_family = AF_INET;
    server_addr.sin_addr.s_addr = INADDR_ANY;
    server_addr.sin_port = htons(PORT);

    bind(server_fd, (struct sockaddr*)&server_addr, sizeof(server_addr));
    listen(server_fd, 128);
    set_nonblocking(server_fd);

    std::cout << "Echo server on port " << PORT << " (EDGE-TRIGGERED)\n";

    // Create epoll with edge-triggered
    int epfd = epoll_create1(0);
    struct epoll_event ev, events[MAX_EVENTS];

    // Add server with EPOLLET
    ev.events = EPOLLIN | EPOLLET;
    ev.data.fd = server_fd;
    epoll_ctl(epfd, EPOLL_CTL_ADD, server_fd, &ev);

    while (true) {
        int nready = epoll_wait(epfd, events, MAX_EVENTS, -1);

        for (int i = 0; i < nready; i++) {
            int fd = events[i].data.fd;

            if (fd == server_fd) {
                // Accept ALL pending connections (edge-triggered)
                while (true) {
                    struct sockaddr_in client_addr;
                    socklen_t addr_len = sizeof(client_addr);
                    int client_fd = accept(server_fd, (struct sockaddr*)&client_addr, &addr_len);

                    if (client_fd < 0) {
                        if (errno == EAGAIN || errno == EWOULDBLOCK) {
                            break;  // No more pending connections
                        }
                        perror("accept");
                        break;
                    }

                    set_nonblocking(client_fd);

                    // Add with edge-triggered
                    ev.events = EPOLLIN | EPOLLET;
                    ev.data.fd = client_fd;
                    epoll_ctl(epfd, EPOLL_CTL_ADD, client_fd, &ev);

                    std::cout << "Client " << client_fd << " connected\n";
                }
            }
            else {
                if (events[i].events & EPOLLIN) {
                    // Read ALL available data (critical for edge-triggered!)
                    while (true) {
                        char buffer[BUFFER_SIZE];
                        int n = recv(fd, buffer, sizeof(buffer), 0);

                        if (n < 0) {
                            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                                break;  // ✅ All data read
                            }

                            // Real error
                            perror("recv");
                            epoll_ctl(epfd, EPOLL_CTL_DEL, fd, NULL);
                            close(fd);
                            break;
                        }

                        if (n == 0) {
                            // EOF
                            std::cout << "Client " << fd << " disconnected\n";
                            epoll_ctl(epfd, EPOLL_CTL_DEL, fd, NULL);
                            close(fd);
                            break;
                        }

                        // Echo back
                        buffer[n] = '\0';
                        std::cout << "Client " << fd << ": " << buffer;
                        send(fd, buffer, n, MSG_NOSIGNAL);
                    }
                }

                if (events[i].events & (EPOLLHUP | EPOLLERR)) {
                    epoll_ctl(epfd, EPOLL_CTL_DEL, fd, NULL);
                    close(fd);
                }
            }
        }
    }

    close(epfd);
    close(server_fd);
    return 0;
}
```

**Key differences from level-triggered**:
- `EPOLLET` flag on all FDs
- Loop until EAGAIN on accept()
- Loop until EAGAIN on recv()
- Must be non-blocking or data loss occurs

**Testing**:
```bash
g++ -std=c++11 epoll_edge_triggered.cpp -o epoll_edge_triggered
./epoll_edge_triggered

# Send large data to test EAGAIN loop
dd if=/dev/urandom bs=1M count=10 | nc localhost 8080
```

---

#### Example 3: Chat Server with epoll

**Purpose**: Multi-client chat with broadcast using epoll.

**Concepts**: Client tracking, broadcasting to multiple FDs, epoll with metadata.

```cpp
#include <iostream>
#include <map>
#include <string>
#include <sys/epoll.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <fcntl.h>
#include <cstring>

const int PORT = 8080;
const int MAX_EVENTS = 128;
const int BUFFER_SIZE = 1024;

struct ClientInfo {
    std::string name;
    std::string address;
};

std::map<int, ClientInfo> clients;

void set_nonblocking(int fd) {
    int flags = fcntl(fd, F_GETFL, 0);
    fcntl(fd, F_SETFL, flags | O_NONBLOCK);
}

void broadcast(const std::string& message, int sender_fd, int server_fd) {
    for (auto& pair : clients) {
        int fd = pair.first;
        if (fd != sender_fd && fd != server_fd) {
            send(fd, message.c_str(), message.size(), MSG_NOSIGNAL);
        }
    }
}

int main() {
    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    int opt = 1;
    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    struct sockaddr_in server_addr;
    server_addr.sin_family = AF_INET;
    server_addr.sin_addr.s_addr = INADDR_ANY;
    server_addr.sin_port = htons(PORT);

    bind(server_fd, (struct sockaddr*)&server_addr, sizeof(server_addr));
    listen(server_fd, 128);
    set_nonblocking(server_fd);

    std::cout << "Chat server on port " << PORT << "\n";

    int epfd = epoll_create1(0);
    struct epoll_event ev, events[MAX_EVENTS];

    ev.events = EPOLLIN;
    ev.data.fd = server_fd;
    epoll_ctl(epfd, EPOLL_CTL_ADD, server_fd, &ev);

    while (true) {
        int nready = epoll_wait(epfd, events, MAX_EVENTS, -1);

        for (int i = 0; i < nready; i++) {
            int fd = events[i].data.fd;

            if (fd == server_fd) {
                // New connection
                struct sockaddr_in client_addr;
                socklen_t addr_len = sizeof(client_addr);
                int client_fd = accept(server_fd, (struct sockaddr*)&client_addr, &addr_len);

                if (client_fd >= 0) {
                    set_nonblocking(client_fd);

                    ClientInfo info;
                    info.name = "User" + std::to_string(client_fd);
                    info.address = inet_ntoa(client_addr.sin_addr);
                    clients[client_fd] = info;

                    ev.events = EPOLLIN;
                    ev.data.fd = client_fd;
                    epoll_ctl(epfd, EPOLL_CTL_ADD, client_fd, &ev);

                    std::string welcome = "Welcome! You are " + info.name + "\n";
                    send(client_fd, welcome.c_str(), welcome.size(), 0);

                    std::string join_msg = info.name + " joined the chat\n";
                    std::cout << join_msg;
                    broadcast(join_msg, client_fd, server_fd);
                }
            }
            else {
                if (events[i].events & EPOLLIN) {
                    char buffer[BUFFER_SIZE];
                    int n = recv(fd, buffer, sizeof(buffer), 0);

                    if (n <= 0) {
                        // Disconnected
                        std::string goodbye = clients[fd].name + " left the chat\n";
                        std::cout << goodbye;
                        broadcast(goodbye, fd, server_fd);

                        epoll_ctl(epfd, EPOLL_CTL_DEL, fd, NULL);
                        clients.erase(fd);
                        close(fd);
                    }
                    else {
                        buffer[n] = '\0';
                        std::string message = clients[fd].name + ": " + buffer;
                        std::cout << message;
                        broadcast(message, fd, server_fd);
                    }
                }

                if (events[i].events & (EPOLLHUP | EPOLLERR)) {
                    if (clients.count(fd)) {
                        std::string goodbye = clients[fd].name + " disconnected\n";
                        std::cout << goodbye;
                        broadcast(goodbye, fd, server_fd);
                        clients.erase(fd);
                    }

                    epoll_ctl(epfd, EPOLL_CTL_DEL, fd, NULL);
                    close(fd);
                }
            }
        }
    }

    close(epfd);
    close(server_fd);
    return 0;
}
```

**Testing**:
```bash
# Terminal 1
telnet localhost 8080
# Welcome! You are User4

# Terminal 2
telnet localhost 8080
# Welcome! You are User5
# User4 joined the chat  ← Sees User4's join

# Terminal 1 types:
hello everyone
# Terminal 2 sees:
# User4: hello everyone
```

---

#### Example 4: EPOLLOUT for Write Queues

**Purpose**: Handle partial sends with EPOLLOUT and write queues.

**Concepts**: Dynamic event modification, EPOLLOUT monitoring, queue management.

```cpp
#include <iostream>
#include <map>
#include <queue>
#include <string>
#include <sys/epoll.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>

const int PORT = 8080;
const int MAX_EVENTS = 128;

std::map<int, std::queue<std::string>> write_queues;
int epfd;  // Global for update_events

void set_nonblocking(int fd) {
    int flags = fcntl(fd, F_GETFL, 0);
    fcntl(fd, F_SETFL, flags | O_NONBLOCK);
}

void update_events(int fd) {
    struct epoll_event ev;
    ev.data.fd = fd;

    if (write_queues[fd].empty()) {
        // No data to send - only monitor reads
        ev.events = EPOLLIN;
    } else {
        // Data pending - monitor reads AND writes
        ev.events = EPOLLIN | EPOLLOUT;
    }

    epoll_ctl(epfd, EPOLL_CTL_MOD, fd, &ev);
}

void queue_send(int fd, const std::string& data) {
    bool was_empty = write_queues[fd].empty();
    write_queues[fd].push(data);

    if (was_empty) {
        update_events(fd);  // Start monitoring EPOLLOUT
    }
}

int main() {
    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    int opt = 1;
    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    struct sockaddr_in server_addr;
    server_addr.sin_family = AF_INET;
    server_addr.sin_addr.s_addr = INADDR_ANY;
    server_addr.sin_port = htons(PORT);

    bind(server_fd, (struct sockaddr*)&server_addr, sizeof(server_addr));
    listen(server_fd, 128);
    set_nonblocking(server_fd);

    std::cout << "Server with EPOLLOUT on port " << PORT << "\n";

    epfd = epoll_create1(0);
    struct epoll_event ev, events[MAX_EVENTS];

    ev.events = EPOLLIN;
    ev.data.fd = server_fd;
    epoll_ctl(epfd, EPOLL_CTL_ADD, server_fd, &ev);

    while (true) {
        int nready = epoll_wait(epfd, events, MAX_EVENTS, -1);

        for (int i = 0; i < nready; i++) {
            int fd = events[i].data.fd;

            if (fd == server_fd) {
                int client_fd = accept(server_fd, NULL, NULL);
                if (client_fd >= 0) {
                    set_nonblocking(client_fd);

                    ev.events = EPOLLIN;
                    ev.data.fd = client_fd;
                    epoll_ctl(epfd, EPOLL_CTL_ADD, client_fd, &ev);

                    write_queues[client_fd] = std::queue<std::string>();
                    std::cout << "Client " << client_fd << " connected\n";
                }
            }
            else {
                if (events[i].events & EPOLLIN) {
                    char buffer[1024];
                    int n = recv(fd, buffer, sizeof(buffer), 0);

                    if (n <= 0) {
                        epoll_ctl(epfd, EPOLL_CTL_DEL, fd, NULL);
                        write_queues.erase(fd);
                        close(fd);
                    }
                    else {
                        // Queue large response (simulating heavy load)
                        buffer[n] = '\0';
                        std::string response = "ECHO: " + std::string(buffer);

                        // Multiply by 100 to test partial sends
                        std::string large_response;
                        for (int j = 0; j < 100; j++) {
                            large_response += response;
                        }

                        queue_send(fd, large_response);
                        std::cout << "Queued " << large_response.size()
                                  << " bytes for client " << fd << "\n";
                    }
                }

                if (events[i].events & EPOLLOUT) {
                    if (!write_queues[fd].empty()) {
                        std::string& data = write_queues[fd].front();

                        ssize_t sent = send(fd, data.c_str(), data.size(), MSG_NOSIGNAL);

                        if (sent > 0) {
                            std::cout << "Sent " << sent << " bytes to " << fd << "\n";

                            if (static_cast<size_t>(sent) < data.size()) {
                                // Partial send
                                data.erase(0, sent);
                            } else {
                                // Complete send
                                write_queues[fd].pop();
                            }

                            update_events(fd);  // Update based on queue state
                        }
                        else if (sent < 0 && errno != EAGAIN && errno != EWOULDBLOCK) {
                            epoll_ctl(epfd, EPOLL_CTL_DEL, fd, NULL);
                            write_queues.erase(fd);
                            close(fd);
                        }
                    }
                }

                if (events[i].events & (EPOLLHUP | EPOLLERR)) {
                    epoll_ctl(epfd, EPOLL_CTL_DEL, fd, NULL);
                    write_queues.erase(fd);
                    close(fd);
                }
            }
        }
    }

    close(epfd);
    close(server_fd);
    return 0;
}
```

**Key points**:
- Only monitor EPOLLOUT when write queue has data
- Use `epoll_ctl(MOD)` to dynamically change events
- Handle partial sends by keeping remainder in queue

---

**🎉 Break 1 Complete!**

Topic 5 now has:
- ✅ THEORY_SECTION (comprehensive epoll coverage)
- ✅ 5 EDGE_CASES (EAGAIN handling, EPOLLONESHOT, FD reuse, maxevents, starvation)
- ✅ 4 CODE_EXAMPLES (level-triggered echo, edge-triggered echo, chat server, EPOLLOUT handling)

**Remaining for full completion**:
- ⏳ 2 more examples (EPOLLONESHOT with thread pool, production-grade server)
- ⏳ Break 2: INTERVIEW_QA (20 questions)
- ⏳ Break 3: PRACTICE_TASKS + QUICK_REFERENCE

Continuing with final 2 examples to complete Break 1...

---

---

#### Example 5: EPOLLONESHOT with Thread Pool

**Why:** EPOLLONESHOT prevents multiple threads from processing the same FD simultaneously. Critical for thread-safe multi-threaded servers.

**Problem:** With normal epoll, if thread A is processing FD 5 and new data arrives, thread B might also get notified and race with A.

**Solution:** EPOLLONESHOT disables FD after event delivery. Must re-arm with `epoll_ctl(MOD)` after processing.

```cpp
#include <sys/epoll.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>
#include <cstring>
#include <iostream>
#include <thread>
#include <vector>
#include <queue>
#include <mutex>
#include <condition_variable>

// Thread-safe task queue
class TaskQueue {
private:
    std::queue<std::pair<int, uint32_t>> tasks;  // {fd, events}
    std::mutex mtx;
    std::condition_variable cv;
    bool shutdown = false;

public:
    void push(int fd, uint32_t events) {
        std::lock_guard<std::mutex> lock(mtx);
        tasks.push({fd, events});
        cv.notify_one();
    }

    bool pop(int& fd, uint32_t& events) {
        std::unique_lock<std::mutex> lock(mtx);
        cv.wait(lock, [this] { return !tasks.empty() || shutdown; });

        if (shutdown && tasks.empty()) return false;

        auto task = tasks.front();
        tasks.pop();
        fd = task.first;
        events = task.second;
        return true;
    }

    void stop() {
        {
            std::lock_guard<std::mutex> lock(mtx);
            shutdown = true;
        }
        cv.notify_all();
    }
};

// Worker thread function
void worker(int epfd, TaskQueue& queue) {
    char buf[1024];

    while (true) {
        int fd;
        uint32_t events;

        if (!queue.pop(fd, events)) break;  // Shutdown

        // Process the event
        if (events & EPOLLIN) {
            int n = recv(fd, buf, sizeof(buf) - 1, 0);

            if (n > 0) {
                buf[n] = '\0';
                std::cout << "[Thread " << std::this_thread::get_id() 
                          << "] FD " << fd << ": " << buf;

                // Echo back
                send(fd, buf, n, 0);

                // ✅ Re-arm EPOLLONESHOT after processing
                struct epoll_event ev;
                ev.events = EPOLLIN | EPOLLONESHOT | EPOLLET;
                ev.data.fd = fd;

                if (epoll_ctl(epfd, EPOLL_CTL_MOD, fd, &ev) < 0) {
                    perror("epoll_ctl MOD");
                }
            } else if (n == 0) {
                std::cout << "[Thread " << std::this_thread::get_id() 
                          << "] FD " << fd << " closed\n";
                epoll_ctl(epfd, EPOLL_CTL_DEL, fd, nullptr);
                close(fd);
            } else {
                if (errno != EAGAIN) {
                    perror("recv");
                    epoll_ctl(epfd, EPOLL_CTL_DEL, fd, nullptr);
                    close(fd);
                }
            }
        }
    }
}

int main() {
    // Create server socket
    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    int opt = 1;
    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons(8080);

    bind(server_fd, (sockaddr*)&addr, sizeof(addr));
    listen(server_fd, 128);

    // Create epoll
    int epfd = epoll_create1(0);

    // Add server socket (no ONESHOT needed for listen socket)
    struct epoll_event ev;
    ev.events = EPOLLIN;
    ev.data.fd = server_fd;
    epoll_ctl(epfd, EPOLL_CTL_ADD, server_fd, &ev);

    // Create thread pool
    const int NUM_THREADS = 4;
    TaskQueue queue;
    std::vector<std::thread> workers;

    for (int i = 0; i < NUM_THREADS; i++) {
        workers.emplace_back(worker, epfd, std::ref(queue));
    }

    std::cout << "Thread pool echo server with EPOLLONESHOT on :8080\n";
    std::cout << "Workers: " << NUM_THREADS << "\n";

    struct epoll_event events[128];

    while (true) {
        int nready = epoll_wait(epfd, events, 128, -1);

        for (int i = 0; i < nready; i++) {
            int fd = events[i].data.fd;

            if (fd == server_fd) {
                // Accept new connections
                int client_fd = accept(server_fd, nullptr, nullptr);

                if (client_fd < 0) continue;

                // Set non-blocking
                int flags = fcntl(client_fd, F_GETFL, 0);
                fcntl(client_fd, F_SETFL, flags | O_NONBLOCK);

                // Add with EPOLLONESHOT
                struct epoll_event cev;
                cev.events = EPOLLIN | EPOLLONESHOT | EPOLLET;
                cev.data.fd = client_fd;
                epoll_ctl(epfd, EPOLL_CTL_ADD, client_fd, &cev);

                std::cout << "[Main] New connection: FD " << client_fd << "\n";
            } else {
                // Client event → push to worker queue
                queue.push(fd, events[i].events);
            }
        }
    }

    // Cleanup (unreachable in this example)
    queue.stop();
    for (auto& t : workers) t.join();
    close(epfd);
    close(server_fd);

    return 0;
}
```

**Explanation:**

1. **EPOLLONESHOT flag:** FD is automatically disabled after event delivery
2. **Thread pool:** 4 worker threads process events from shared queue
3. **Re-arming:** Worker must call `epoll_ctl(MOD)` to re-enable FD after processing
4. **Safety:** No race conditions - only one thread processes FD at a time
5. **Listen socket:** Does NOT use EPOLLONESHOT (multiple threads can accept)

**Why EPOLLONESHOT is Critical:**

Without EPOLLONESHOT:
```
Time | Thread A         | Thread B
-----|------------------|------------------
T1   | recv(fd5, ...)   |
T2   | processing...    | epoll_wait() returns fd5! ❌
T3   | processing...    | recv(fd5, ...) ← RACE!
```

With EPOLLONESHOT:
```
Time | Thread A         | Thread B
-----|------------------|------------------
T1   | recv(fd5, ...)   |
T2   | processing...    | epoll_wait() does NOT return fd5 ✅
T3   | epoll_ctl(MOD)   | (fd5 now re-enabled)
T4   | done             | Can now receive fd5 events
```

---

#### Example 6: Production-Grade epoll Server

**Why:** Real-world servers need connection limits, graceful shutdown, metrics, and error handling. This example shows production patterns.

```cpp
#include <sys/epoll.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <fcntl.h>
#include <unistd.h>
#include <signal.h>
#include <errno.h>
#include <cstring>
#include <iostream>
#include <chrono>
#include <atomic>
#include <unordered_map>

// Global state for signal handling
std::atomic<bool> g_running{true};

void signal_handler(int sig) {
    std::cout << "\n[Signal] Received " << sig << ", shutting down gracefully...\n";
    g_running = false;
}

// Per-connection state
struct Connection {
    int fd;
    std::chrono::steady_clock::time_point connected_at;
    size_t bytes_received = 0;
    size_t bytes_sent = 0;
    std::string read_buffer;
    std::string write_buffer;
};

// Server metrics
struct Metrics {
    std::atomic<size_t> total_connections{0};
    std::atomic<size_t> active_connections{0};
    std::atomic<size_t> total_bytes_received{0};
    std::atomic<size_t> total_bytes_sent{0};
    std::atomic<size_t> total_errors{0};

    void print() const {
        std::cout << "\n=== Server Metrics ===\n"
                  << "Total connections: " << total_connections << "\n"
                  << "Active connections: " << active_connections << "\n"
                  << "Total bytes received: " << total_bytes_received << "\n"
                  << "Total bytes sent: " << total_bytes_sent << "\n"
                  << "Total errors: " << total_errors << "\n";
    }
};

int set_nonblocking(int fd) {
    int flags = fcntl(fd, F_GETFL, 0);
    if (flags < 0) return -1;
    return fcntl(fd, F_SETFL, flags | O_NONBLOCK);
}

int set_tcp_nodelay(int fd) {
    int flag = 1;
    return setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &flag, sizeof(flag));
}

void handle_client_read(int epfd, Connection& conn, Metrics& metrics) {
    char buf[4096];

    while (true) {
        int n = recv(conn.fd, buf, sizeof(buf), 0);

        if (n > 0) {
            conn.bytes_received += n;
            metrics.total_bytes_received += n;

            // Echo: Add to write buffer
            conn.write_buffer.append(buf, n);

            // Start monitoring EPOLLOUT
            struct epoll_event ev;
            ev.events = EPOLLIN | EPOLLOUT | EPOLLET;
            ev.data.fd = conn.fd;
            epoll_ctl(epfd, EPOLL_CTL_MOD, conn.fd, &ev);

            break;  // Level-triggered, will get more events if data remains
        } else if (n == 0) {
            // Graceful close
            std::cout << "[FD " << conn.fd << "] Client disconnected\n";
            return;
        } else {
            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                break;  // No more data
            }
            // Error
            perror("recv");
            metrics.total_errors++;
            return;
        }
    }
}

void handle_client_write(int epfd, Connection& conn, Metrics& metrics) {
    while (!conn.write_buffer.empty()) {
        int n = send(conn.fd, conn.write_buffer.data(), conn.write_buffer.size(), 0);

        if (n > 0) {
            conn.bytes_sent += n;
            metrics.total_bytes_sent += n;
            conn.write_buffer.erase(0, n);
        } else {
            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                break;  // Socket buffer full, try later
            }
            perror("send");
            metrics.total_errors++;
            return;
        }
    }

    // If write buffer empty, stop monitoring EPOLLOUT
    if (conn.write_buffer.empty()) {
        struct epoll_event ev;
        ev.events = EPOLLIN | EPOLLET;
        ev.data.fd = conn.fd;
        epoll_ctl(epfd, EPOLL_CTL_MOD, conn.fd, &ev);
    }
}

int main() {
    // Setup signal handling
    signal(SIGINT, signal_handler);
    signal(SIGTERM, signal_handler);

    // Configuration
    const int PORT = 8080;
    const int MAX_CONNECTIONS = 10000;
    const int MAX_EVENTS = 128;

    // Create server socket
    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (server_fd < 0) {
        perror("socket");
        return 1;
    }

    int opt = 1;
    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
    set_nonblocking(server_fd);

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons(PORT);

    if (bind(server_fd, (sockaddr*)&addr, sizeof(addr)) < 0) {
        perror("bind");
        close(server_fd);
        return 1;
    }

    if (listen(server_fd, 128) < 0) {
        perror("listen");
        close(server_fd);
        return 1;
    }

    // Create epoll
    int epfd = epoll_create1(0);
    if (epfd < 0) {
        perror("epoll_create1");
        close(server_fd);
        return 1;
    }

    // Add server socket
    struct epoll_event ev;
    ev.events = EPOLLIN | EPOLLET;
    ev.data.fd = server_fd;
    epoll_ctl(epfd, EPOLL_CTL_ADD, server_fd, &ev);

    std::unordered_map<int, Connection> connections;
    Metrics metrics;

    std::cout << "=== Production epoll Server ===\n"
              << "Listening on ::" << PORT << "\n"
              << "Max connections: " << MAX_CONNECTIONS << "\n"
              << "Max events per iteration: " << MAX_EVENTS << "\n";

    struct epoll_event events[MAX_EVENTS];
    auto last_metrics_print = std::chrono::steady_clock::now();

    while (g_running) {
        int timeout_ms = 1000;  // 1 second timeout for graceful shutdown
        int nready = epoll_wait(epfd, events, MAX_EVENTS, timeout_ms);

        if (nready < 0) {
            if (errno == EINTR) continue;  // Interrupted by signal
            perror("epoll_wait");
            break;
        }

        for (int i = 0; i < nready; i++) {
            int fd = events[i].data.fd;
            uint32_t ev_flags = events[i].events;

            // Error or hangup
            if (ev_flags & (EPOLLERR | EPOLLHUP)) {
                std::cerr << "[FD " << fd << "] Error/Hangup\n";
                epoll_ctl(epfd, EPOLL_CTL_DEL, fd, nullptr);
                connections.erase(fd);
                metrics.active_connections--;
                close(fd);
                continue;
            }

            // Server socket: Accept new connections
            if (fd == server_fd) {
                while (true) {
                    int client_fd = accept(server_fd, nullptr, nullptr);

                    if (client_fd < 0) {
                        if (errno == EAGAIN || errno == EWOULDBLOCK) {
                            break;  // No more connections
                        }
                        perror("accept");
                        metrics.total_errors++;
                        break;
                    }

                    // Connection limit
                    if (metrics.active_connections >= MAX_CONNECTIONS) {
                        std::cerr << "[LIMIT] Max connections reached, rejecting FD " 
                                  << client_fd << "\n";
                        close(client_fd);
                        continue;
                    }

                    set_nonblocking(client_fd);
                    set_tcp_nodelay(client_fd);

                    // Add to epoll
                    struct epoll_event cev;
                    cev.events = EPOLLIN | EPOLLET;
                    cev.data.fd = client_fd;
                    epoll_ctl(epfd, EPOLL_CTL_ADD, client_fd, &cev);

                    // Track connection
                    Connection conn;
                    conn.fd = client_fd;
                    conn.connected_at = std::chrono::steady_clock::now();
                    connections[client_fd] = conn;

                    metrics.total_connections++;
                    metrics.active_connections++;

                    std::cout << "[FD " << client_fd << "] New connection (active: " 
                              << metrics.active_connections << ")\n";
                }
                continue;
            }

            // Client socket: Handle I/O
            auto it = connections.find(fd);
            if (it == connections.end()) continue;

            Connection& conn = it->second;

            if (ev_flags & EPOLLIN) {
                handle_client_read(epfd, conn, metrics);

                // Check if connection should be closed
                if (conn.write_buffer.empty() && conn.bytes_received == 0) {
                    epoll_ctl(epfd, EPOLL_CTL_DEL, fd, nullptr);
                    connections.erase(fd);
                    metrics.active_connections--;
                    close(fd);
                }
            }

            if (ev_flags & EPOLLOUT) {
                handle_client_write(epfd, conn, metrics);
            }
        }

        // Print metrics every 10 seconds
        auto now = std::chrono::steady_clock::now();
        if (std::chrono::duration_cast<std::chrono::seconds>(now - last_metrics_print).count() >= 10) {
            metrics.print();
            last_metrics_print = now;
        }
    }

    // Graceful shutdown
    std::cout << "\n=== Shutting down ===\n";

    for (auto& [fd, conn] : connections) {
        auto duration = std::chrono::steady_clock::now() - conn.connected_at;
        auto seconds = std::chrono::duration_cast<std::chrono::seconds>(duration).count();

        std::cout << "[FD " << fd << "] Closing (duration: " << seconds << "s, "
                  << "rx: " << conn.bytes_received << " bytes, "
                  << "tx: " << conn.bytes_sent << " bytes)\n";

        epoll_ctl(epfd, EPOLL_CTL_DEL, fd, nullptr);
        close(fd);
    }

    close(epfd);
    close(server_fd);

    metrics.print();
    std::cout << "\n=== Server stopped ===\n";

    return 0;
}
```

**Production Features:**

1. **Connection Limits:** Rejects connections when `MAX_CONNECTIONS` reached
2. **Graceful Shutdown:** SIGINT/SIGTERM closes all connections cleanly
3. **Metrics Tracking:** Bytes sent/received, connection count, errors
4. **TCP_NODELAY:** Disables Nagle algorithm for low latency
5. **Non-blocking Accept:** Loops until EAGAIN in edge-triggered mode
6. **Write Buffering:** Only monitors EPOLLOUT when data pending
7. **Connection State:** Tracks per-connection lifetime and stats
8. **Error Handling:** EPOLLERR, EPOLLHUP, and errno checks
9. **Periodic Reporting:** Prints metrics every 10 seconds

**Compile & Test:**

```bash
# Compile
g++ -std=c++17 -O2 -o epoll_production epoll_production.cpp -pthread

# Run
./epoll_production

# Test with multiple clients
for i in {1..100}; do
    echo "Client $i" | nc localhost 8080 &
done

# Watch metrics print every 10 seconds
# Press Ctrl+C for graceful shutdown
```

**Expected Output:**

```
=== Production epoll Server ===
Listening on ::8080
Max connections: 10000
Max events per iteration: 128
[FD 4] New connection (active: 1)
[FD 5] New connection (active: 2)
...
[FD 103] New connection (active: 100)

=== Server Metrics ===
Total connections: 100
Active connections: 100
Total bytes received: 900
Total bytes sent: 900
Total errors: 0

^C
[Signal] Received 2, shutting down gracefully...

=== Shutting down ===
[FD 4] Closing (duration: 45s, rx: 9 bytes, tx: 9 bytes)
[FD 5] Closing (duration: 44s, rx: 9 bytes, tx: 9 bytes)
...

=== Server stopped ===
```

This production server demonstrates all patterns needed for high-performance, reliable network services using epoll().

---


---

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

### PRACTICE_TASKS: Output Prediction and Code Analysis
#### Q1

**Difficulty:** ⭐⭐☆☆☆

**Description:** Implement a level-triggered epoll echo server that handles multiple clients.

**Requirements:**
1. Create TCP server on port 8080
2. Use `epoll_create1()` with CLOEXEC
3. Level-triggered mode (default EPOLLIN)
4. Non-blocking sockets
5. Echo all data back to client
6. Handle client disconnections gracefully

**Expected Behavior:**
```bash
# Terminal 1
$ ./echo_server
Server listening on :8080

# Terminal 2
$ nc localhost 8080
Hello
Hello
World
World
^C

# Terminal 1
Client FD 5 connected
Client FD 5 disconnected
```

**Hints:**
- Use `accept()` in a loop until EAGAIN
- Check `recv()` return value: 0 means EOF
- Always call `epoll_ctl(DEL)` before `close()`

---

#### Q2

**Difficulty:** ⭐⭐⭐☆☆

**Description:** Build a server that sends files using edge-triggered epoll.

**Requirements:**
1. Edge-triggered mode (EPOLLIN | EPOLLET)
2. Client sends filename, server sends file contents
3. Handle partial reads/writes with EAGAIN
4. Support multiple simultaneous downloads
5. Use write queues for EPOLLOUT
6. Handle large files (>10MB)

**Protocol:**
```
Client → Server: "GET /path/to/file.txt\n"
Server → Client: "OK <file_size>\n<file_contents>"
or
Server → Client: "ERROR File not found\n"
```

**Expected Behavior:**
```bash
# Server
$ ./file_server
Serving files from ./files/
Listening on :9000

# Client
$ echo "GET /test.txt" | nc localhost 9000
OK 26
This is the file content.
```

**Hints:**
- Must read until EAGAIN in edge-triggered mode
- Monitor EPOLLOUT only when write queue has data
- Use `sendfile()` for efficient file transfer (bonus)

---

#### Q3

**Difficulty:** ⭐⭐⭐⭐☆

**Description:** Implement a multi-threaded chat server using EPOLLONESHOT.

**Requirements:**
1. Multi-threaded design (4 worker threads)
2. EPOLLONESHOT to prevent race conditions
3. Client commands: `/nick <name>`, `/msg <user> <text>`, `/quit`
4. Broadcast public messages to all users
5. Private messages between users
6. Thread-safe client tracking

**Expected Behavior:**
```bash
# Server
$ ./chat_server
Chat server on :7000 with 4 threads

# Client 1
$ nc localhost 7000
Welcome! Type /nick <name> to set your name.
/nick Alice
Nick set to: Alice
Hello everyone!
[Alice] Hello everyone!

# Client 2
$ nc localhost 7000
Welcome! Type /nick <name> to set your name.
/nick Bob
Nick set to: Bob
[Alice] Hello everyone!  ← Sees Alice's message
/msg Alice Hi there!
[Private to Alice] Hi there!
```

**Hints:**
- Use `std::unordered_map<int, Client>` protected by mutex
- Re-arm EPOLLONESHOT after processing each event
- Parse commands in worker threads

---

#### Q4

**Difficulty:** ⭐⭐⭐⭐☆

**Description:** Build a minimal HTTP/1.1 server with connection timeouts.

**Requirements:**
1. Parse HTTP requests (GET only)
2. Serve static files from a directory
3. Implement idle timeout (30 seconds)
4. Support HTTP keep-alive
5. Log all requests with timestamps
6. Handle 404 Not Found errors

**Expected Behavior:**
```bash
# Server
$ ./http_server ./www
HTTP server on :8000
Serving files from: ./www
Idle timeout: 30s

# Client
$ curl -v http://localhost:8000/index.html
> GET /index.html HTTP/1.1
> 
< HTTP/1.1 200 OK
< Content-Length: 145
< Connection: keep-alive
<
<html>...</html>

# Server logs
[2025-01-15 12:34:56] 127.0.0.1:54321 GET /index.html 200 145 bytes
[2025-01-15 12:35:26] 127.0.0.1:54321 idle timeout, closing
```

**Hints:**
- Use `timerfd_create()` for periodic timeout checks
- Parse HTTP with simple string operations
- Support `Connection: keep-alive` header
- Read HTTP request line-by-line until `\r\n\r\n`

---

#### Q5

**Difficulty:** ⭐⭐⭐⭐⭐

**Description:** Implement a production-grade echo server with rate limiting and metrics.

**Requirements:**
1. Connection limit (max 1000 clients)
2. Rate limiting (max 100 events/sec per client)
3. Per-client bandwidth tracking
4. Metrics endpoint (HTTP on separate port)
5. Graceful shutdown (SIGINT/SIGTERM)
6. Configurable via command-line args

**Metrics to Track:**
- Total connections (lifetime)
- Active connections (current)
- Total bytes received/sent
- Events per second
- Rate-limited clients count
- Error count

**Expected Behavior:**
```bash
# Server
$ ./rate_limited_server --port 8080 --metrics-port 9090 --max-connections 1000
Echo server on :8080 (max 1000 connections)
Metrics on :9090
Rate limit: 100 events/sec per client

# Metrics endpoint
$ curl http://localhost:9090/metrics
{
  "total_connections": 1523,
  "active_connections": 42,
  "total_bytes_received": 15728640,
  "total_bytes_sent": 15728640,
  "events_per_second": 3421,
  "rate_limited_clients": 2,
  "error_count": 5
}

# Rate limiting in action
$ while true; do echo "spam" | nc localhost 8080; done
(after 100 requests/sec)
ERROR: Rate limit exceeded

# Graceful shutdown
^C
Shutting down gracefully...
Closing 42 active connections...
Done.
```

**Hints:**
- Use `std::deque<timestamp>` to track event times per client
- Separate epoll instances for echo server and metrics server
- Use atomic variables for thread-safe metrics
- Implement signal handler for graceful shutdown

---

#### Q6

**Difficulty:** ⭐⭐⭐⭐⭐

**Description:** Build a file proxy that uses `splice()` for zero-copy transfers.

**Requirements:**
1. Client connects and requests a file
2. Server opens file and pipes data to client socket
3. Use `splice()` for kernel-level zero-copy
4. No data passes through userspace
5. Support multiple concurrent transfers
6. Track transfer progress and speed

**Expected Behavior:**
```bash
# Server
$ ./file_proxy ./files
File proxy on :8080
Zero-copy with splice()

# Client
$ echo "GET largefile.bin" | nc localhost 8080 > output.bin

# Server logs
[FD 5] Transfer started: largefile.bin (100 MB)
[FD 5] Progress: 25 MB (32.5 MB/s)
[FD 5] Progress: 50 MB (35.2 MB/s)
[FD 5] Progress: 75 MB (34.8 MB/s)
[FD 5] Transfer complete: 100 MB in 2.87s (34.8 MB/s)
```

**Hints:**
- Use `pipe()` to create pipe FD pairs
- `splice(file_fd, NULL, pipe_write, NULL, len, 0)` → file to pipe
- `splice(pipe_read, NULL, socket_fd, NULL, len, 0)` → pipe to socket
- Add pipe FDs to epoll for flow control
- Monitor EPOLLOUT on socket when pipe is full

---

#### Q7

**Difficulty:** ⭐⭐⭐⭐⭐

**Description:** Build a server that uses epoll for sockets and io_uring for file I/O.

**Requirements:**
1. epoll for network events (socket I/O)
2. io_uring for disk I/O (file reads/writes)
3. Serve static files from disk
4. Log requests to file asynchronously
5. Combine both event loops in one thread
6. Compare performance with pure epoll

**Architecture:**
```
Client Request → epoll (socket) → Queue file read → io_uring (disk)
                                                        ↓
Client Response ← epoll (socket) ← File data ready ← io_uring completion
```

**Expected Behavior:**
```bash
# Server
$ ./hybrid_server ./www
Hybrid server on :8080
Using: epoll (sockets) + io_uring (files)

# Benchmark
$ ab -n 10000 -c 100 http://localhost:8080/largefile.bin
Requests per second: 12500
(vs pure epoll: 8000 req/sec) ← 56% improvement
```

**Hints:**
- Use `io_uring_get_sqe()` to submit file reads
- Use `io_uring_peek_cqe()` to poll completions
- Integrate io_uring eventfd with epoll
- Pre-allocate buffers for file data

---

### QUICK_REFERENCE: Key Takeaways and Comparison Tables
#### API Summary

```cpp
// Create epoll instance
int epoll_create1(int flags);
  flags: 0 or EPOLL_CLOEXEC

// Control epoll
int epoll_ctl(int epfd, int op, int fd, struct epoll_event *event);
  op: EPOLL_CTL_ADD, EPOLL_CTL_MOD, EPOLL_CTL_DEL

// Wait for events
int epoll_wait(int epfd, struct epoll_event *events, 
               int maxevents, int timeout);
  timeout: -1 (infinite), 0 (non-blocking), >0 (milliseconds)

// Event structure
struct epoll_event {
    uint32_t events;    // Event flags
    epoll_data_t data;  // User data
};

union epoll_data {
    void *ptr;
    int fd;
    uint32_t u32;
    uint64_t u64;
};
```

#### Event Flags

| Flag | Meaning |
|------|---------|
| **EPOLLIN** | Data available for read |
| **EPOLLOUT** | Socket ready for write |
| **EPOLLRDHUP** | Peer closed write side (FIN) |
| **EPOLLPRI** | Urgent data (TCP out-of-band) |
| **EPOLLERR** | Error condition (always monitored) |
| **EPOLLHUP** | Hang up (always monitored) |
| **EPOLLET** | Edge-triggered mode |
| **EPOLLONESHOT** | One-shot mode (auto-disable after event) |
| **EPOLLEXCLUSIVE** | Wake only one waiter (Linux 4.5+) |

#### Common Patterns

**1. Basic Setup**

```cpp
int epfd = epoll_create1(EPOLL_CLOEXEC);

struct epoll_event ev;
ev.events = EPOLLIN;
ev.data.fd = listen_fd;
epoll_ctl(epfd, EPOLL_CTL_ADD, listen_fd, &ev);
```

**2. Event Loop (Level-Triggered)**

```cpp
struct epoll_event events[128];

while (true) {
    int n = epoll_wait(epfd, events, 128, -1);
    
    for (int i = 0; i < n; i++) {
        int fd = events[i].data.fd;
        
        if (fd == listen_fd) {
            int client = accept(listen_fd, NULL, NULL);
            
            struct epoll_event cev;
            cev.events = EPOLLIN;
            cev.data.fd = client;
            epoll_ctl(epfd, EPOLL_CTL_ADD, client, &cev);
        } else {
            char buf[1024];
            int n = recv(fd, buf, sizeof(buf), 0);
            
            if (n <= 0) {
                epoll_ctl(epfd, EPOLL_CTL_DEL, fd, NULL);
                close(fd);
            } else {
                send(fd, buf, n, 0);
            }
        }
    }
}
```

**3. Edge-Triggered with EAGAIN**

```cpp
ev.events = EPOLLIN | EPOLLET;  // Edge-triggered
epoll_ctl(epfd, EPOLL_CTL_ADD, fd, &ev);

// Must read until EAGAIN
while (true) {
    int n = recv(fd, buf, sizeof(buf), 0);
    
    if (n < 0) {
        if (errno == EAGAIN || errno == EWOULDBLOCK) {
            break;  // All data consumed ✅
        }
        // Error
    }
    
    if (n == 0) break;  // EOF
    
    process_data(buf, n);
}
```

**4. EPOLLOUT for Write Queues**

```cpp
// Initially monitor only EPOLLIN
ev.events = EPOLLIN;

// When data needs to be sent
write_queue[fd].push(data);

// Enable EPOLLOUT
ev.events = EPOLLIN | EPOLLOUT;
epoll_ctl(epfd, EPOLL_CTL_MOD, fd, &ev);

// In event loop
if (events[i].events & EPOLLOUT) {
    send_from_queue(fd);
    
    if (write_queue[fd].empty()) {
        // Disable EPOLLOUT
        ev.events = EPOLLIN;
        epoll_ctl(epfd, EPOLL_CTL_MOD, fd, &ev);
    }
}
```

**5. EPOLLONESHOT for Thread Pools**

```cpp
// Register with EPOLLONESHOT
ev.events = EPOLLIN | EPOLLONESHOT;
epoll_ctl(epfd, EPOLL_CTL_ADD, fd, &ev);

// Worker thread
void worker() {
    while (true) {
        epoll_wait(epfd, events, 128, -1);
        
        for (int i = 0; i < nready; i++) {
            int fd = events[i].data.fd;
            
            // Process event (no other thread will get this FD)
            handle_event(fd);
            
            // Re-arm
            ev.events = EPOLLIN | EPOLLONESHOT;
            epoll_ctl(epfd, EPOLL_CTL_MOD, fd, &ev);
        }
    }
}
```

**6. Timeout Handling**

```cpp
std::unordered_map<int, time_point> last_activity;
const auto TIMEOUT = std::chrono::seconds(30);

// Set timeout in epoll_wait
int n = epoll_wait(epfd, events, 128, 1000);  // 1 second

// Check timeouts
auto now = std::chrono::steady_clock::now();
for (auto it = last_activity.begin(); it != last_activity.end(); ) {
    if (now - it->second > TIMEOUT) {
        epoll_ctl(epfd, EPOLL_CTL_DEL, it->first, NULL);
        close(it->first);
        it = last_activity.erase(it);
    } else {
        ++it;
    }
}
```

#### Performance Tips

1. **Use edge-triggered mode** for high-throughput servers (>1000 connections)
2. **Set maxevents between 128-512** for balanced performance
3. **Monitor EPOLLOUT only when needed** (write queue not empty)
4. **Read until EAGAIN** in edge-triggered mode
5. **Use non-blocking sockets** (mandatory for edge-triggered)
6. **Batch similar operations** for better cache locality
7. **Consider io_uring** for mixed file/socket I/O (Linux 5.1+)

#### Debugging Commands

```bash
# Check epoll contents
cat /proc/<pid>/fdinfo/<epfd>

# List all FDs
lsof -p <pid>

# Trace epoll syscalls
strace -e trace=epoll_create1,epoll_ctl,epoll_wait -p <pid>

# Profile CPU
perf record -g -p <pid>
perf report
```

#### Common Mistakes

| Mistake | Consequence | Fix |
|---------|-------------|-----|
| Edge-triggered + blocking socket | Deadlock | Use O_NONBLOCK |
| Forget EAGAIN loop | Lost data | Loop until EAGAIN |
| Always monitor EPOLLOUT | CPU waste | Only when write pending |
| No DEL before close() | FD reuse bugs | Always DEL first |
| maxevents=1 | Too many syscalls | Use 128-512 |
| Wrong errno check | Silent failures | Check EAGAIN/EWOULDBLOCK |

#### Comparison with Alternatives

| Feature | epoll | select() | poll() | io_uring |
|---------|-------|----------|--------|----------|
| **Max FDs** | Unlimited | 1024 | Unlimited | Unlimited |
| **Scalability** | Excellent | Poor | Good | Excellent |
| **Portability** | Linux | POSIX | POSIX | Linux 5.1+ |
| **Edge-triggered** | Yes | No | No | N/A (async) |
| **File I/O** | No | No | No | Yes |
| **Learning curve** | Medium | Easy | Easy | Hard |
| **Best for** | Linux servers | <64 FDs | Portability | Modern Linux |

---

**Topic 5: epoll() - High-Performance I/O for Linux COMPLETE!** 🎉

**Total Content:**
- ✅ THEORY_SECTION (479 lines)
- ✅ 5 EDGE_CASES
- ✅ 6 CODE_EXAMPLES
- ✅ 20 INTERVIEW_QA
- ✅ 7 PRACTICE_TASKS
- ✅ QUICK_REFERENCE

**Next Topic:** Advanced Network Patterns (Topic 6)

