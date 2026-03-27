## TOPIC: I/O Multiplexing with select() - Event-Driven Architecture

### INTERVIEW_QA: Technical Deep Dive

#### Q1: What is select() and what problem does it solve? [BEGINNER]

**Tags**: #fundamentals #io-multiplexing #event-driven

**Answer**: select() is a system call that monitors multiple file descriptors and blocks until one or more become "ready" for I/O operations without blocking.

**Detailed explanation**:

**Problem it solves**:
Without select(), handling multiple clients requires either:
1. **Blocking approach**: One thread per client (expensive, limited scalability)
2. **Polling approach**: Loop through all sockets checking if data available (wastes CPU)

**How select() helps**:
```cpp
// Instead of this (thread per client):
while (true) {
    int client = accept(server_fd, ...);
    std::thread t(handle_client, client);  // New thread for each client
    t.detach();
}

// Use this (single thread, multiple clients):
fd_set read_fds;
FD_ZERO(&read_fds);
FD_SET(server_fd, &read_fds);
FD_SET(client1_fd, &read_fds);
FD_SET(client2_fd, &read_fds);

select(max_fd + 1, &read_fds, NULL, NULL, NULL);  // Blocks until ANY ready

// Now check which ones are ready
if (FD_ISSET(server_fd, &read_fds)) { /* new connection */ }
if (FD_ISSET(client1_fd, &read_fds)) { /* client 1 has data */ }
if (FD_ISSET(client2_fd, &read_fds)) { /* client 2 has data */ }
```

**Key advantages**:
- Single thread monitors hundreds of connections
- No context switching overhead
- Only processes FDs that are actually ready
- Efficient for idle connections (chat, long-polling)

**Interview tip**: Mention that select() enables **event-driven programming** - instead of constantly checking for work, the kernel notifies you when work is available.

---

#### Q2: Explain the master set pattern and why it's necessary. [INTERMEDIATE]

**Tags**: #design-pattern #fd-set #state-management

**Answer**: The master set pattern maintains a permanent copy of the fd_set because select() modifies the set in place, removing non-ready file descriptors.

**Detailed explanation**:

**The problem**:
```cpp
fd_set fds;
FD_SET(server_fd, &fds);
FD_SET(client1_fd, &fds);
FD_SET(client2_fd, &fds);

select(max_fd + 1, &fds, NULL, NULL, NULL);

// ❌ After select() returns, fds only contains READY FDs
// If only client1_fd was ready:
//   - fds now only has client1_fd
//   - server_fd and client2_fd are removed
// Next select() call won't monitor server_fd or client2_fd!
```

**The solution**:
```cpp
fd_set master_fds;  // Permanent copy - never modified
fd_set read_fds;    // Working copy - modified by select()

FD_ZERO(&master_fds);
FD_SET(server_fd, &master_fds);
FD_SET(client1_fd, &master_fds);
FD_SET(client2_fd, &master_fds);

while (true) {
    read_fds = master_fds;  // ✅ Restore from master

    select(max_fd + 1, &read_fds, NULL, NULL, NULL);

    // Check ready_fds (modified)
    // Next iteration: restore from master_fds again
}
```

**Why this works**:
1. **master_fds**: Never passed to select(), stays pristine
2. **read_fds**: Copied from master before each select() call
3. **After select()**: read_fds modified (only ready FDs remain)
4. **Next iteration**: Restore read_fds from master_fds

**Real-world analogy**: master_fds is like a backup copy. select() damages the working copy, so you restore from backup each time.

**Interview tip**: Mention that forgetting this pattern causes **connections to become unresponsive** - one of the most common select() bugs.

---

#### Q3: What are the three timeout modes of select() and when would you use each? [INTERMEDIATE]

**Tags**: #timeout #blocking #polling

**Answer**: select() supports three timeout modes: NULL (block forever), {0, 0} (non-blocking poll), and {sec, usec} (timed wait).

**Detailed explanation**:

**Mode 1: NULL - Block forever**
```cpp
int ready = select(max_fd + 1, &read_fds, NULL, NULL, NULL);
```
- Blocks until at least one FD ready
- Most common mode for pure I/O servers
- **Use when**: Server only responds to network events (no periodic tasks)

**Mode 2: {0, 0} - Non-blocking poll**
```cpp
struct timeval timeout = {0, 0};
int ready = select(max_fd + 1, &read_fds, NULL, NULL, &timeout);

if (ready == 0) {
    // No FDs ready - do other work
    process_background_jobs();
}
```
- Returns immediately (never blocks)
- **Use when**: Interleaving I/O with CPU work (game loop, data processing)
- **Warning**: Can consume 100% CPU if not rate-limited

**Mode 3: {sec, usec} - Timed wait**
```cpp
struct timeval timeout;
timeout.tv_sec = 5;
timeout.tv_usec = 0;

int ready = select(max_fd + 1, &read_fds, NULL, NULL, &timeout);

if (ready == 0) {
    // Timeout - no activity for 5 seconds
    send_heartbeat_to_all_clients();
}
```
- Blocks up to specified time
- **Use when**: Periodic tasks (heartbeats, timeouts, monitoring)

**Comparison table**:

| Mode | Blocks? | Returns when | Use case |
|------|---------|--------------|----------|
| NULL | Forever | FD ready | Pure I/O server |
| {0,0} | Never | Immediately | Game loops, background processing |
| {sec,usec} | Up to timeout | FD ready OR timeout | Heartbeats, idle detection |

**Production example**:
```cpp
// Heartbeat every 30 seconds
struct timeval timeout = {30, 0};
int ready = select(max_fd + 1, &read_fds, NULL, NULL, &timeout);

if (ready == 0) {
    // 30 seconds of inactivity - send keepalive
    send_heartbeat();
    disconnect_idle_clients();
}
```

**Interview tip**: Emphasize that timeout is **reset on each call** - you must set it every time.

---

#### Q4: What is FD_SETSIZE and what happens if you exceed it? [INTERMEDIATE]

**Tags**: #limitations #fd-setsize #scalability

**Answer**: FD_SETSIZE is a compile-time constant (typically 1024) defining the maximum number of file descriptors that can be stored in an fd_set. Exceeding it causes undefined behavior.

**Detailed explanation**:

**Why the limit exists**:
```cpp
// Simplified fd_set implementation
typedef struct {
    uint32_t bits[32];  // 32 * 32 bits = 1024 FDs
} fd_set;

// FD_SET(fd, &fds) sets bit 'fd' to 1
// If fd >= 1024, writes beyond array bounds → memory corruption
```

**What happens when exceeded**:
```cpp
int new_client = accept(server_fd, NULL, NULL);
// new_client = 1050 (FD number can be anything)

FD_SET(new_client, &master_fds);  // ❌ Buffer overflow!
```

**Consequences**:
1. **Memory corruption**: Writes beyond fd_set bounds
2. **Segmentation fault**: May crash immediately
3. **Silent data corruption**: May corrupt adjacent memory
4. **Unpredictable behavior**: Hard-to-debug issues

**How to protect**:
```cpp
// Method 1: Check FD number
int new_client = accept(server_fd, NULL, NULL);

if (new_client >= FD_SETSIZE) {
    const char* msg = "503 Service Unavailable\r\n\r\n";
    send(new_client, msg, strlen(msg), 0);
    close(new_client);
    std::cerr << "FD " << new_client << " exceeds FD_SETSIZE\n";
} else {
    FD_SET(new_client, &master_fds);
}
```

```cpp
// Method 2: Track connection count
std::atomic<int> active_clients{0};
const int MAX_CLIENTS = 900;  // Safety margin below FD_SETSIZE

if (active_clients >= MAX_CLIENTS) {
    send_rejection(new_client);
    close(new_client);
} else {
    FD_SET(new_client, &master_fds);
    active_clients++;
}
```

**Why FD numbers can exceed FD_SETSIZE**:
- FD numbers are assigned sequentially by kernel
- If you open/close many files, FD numbers increment
- Even with 100 active connections, FD number might be 1100

**Solutions for >1024 connections**:
1. **poll()**: No FD_SETSIZE limit (Topic 4)
2. **epoll()**: Scales to millions of connections (Topic 5)
3. **Multiple processes**: Shard connections across processes

**Interview tip**: Mention that FD_SETSIZE is a **hard limit** - recompiling with larger value is not portable and not recommended.

---

#### Q5: How does select() indicate which file descriptors are ready? [BEGINNER]

**Tags**: #fundamentals #fd-isset #api-usage

**Answer**: select() modifies the fd_set in place to contain only ready file descriptors, then returns the count of ready FDs. Use FD_ISSET() to check if a specific FD is ready.

**Detailed explanation**:

**Before select()**:
```cpp
fd_set read_fds;
FD_SET(3, &read_fds);  // Server socket
FD_SET(5, &read_fds);  // Client 1
FD_SET(8, &read_fds);  // Client 2

// read_fds now contains: {3, 5, 8}
```

**After select() returns**:
```cpp
int ready = select(9, &read_fds, NULL, NULL, NULL);
// ready = 2 (two FDs are ready)
// read_fds now contains: {5, 8} (only ready FDs)
// FD 3 (server) was removed because no incoming connection
```

**Checking which FDs are ready**:
```cpp
for (int fd = 0; fd <= max_fd; fd++) {
    if (FD_ISSET(fd, &read_fds)) {
        // This FD is ready
        if (fd == server_fd) {
            // New connection available
            int new_client = accept(fd, NULL, NULL);
        } else {
            // Data available from client
            recv(fd, buffer, sizeof(buffer), 0);
        }
    }
}
```

**Return value meanings**:
```cpp
int ready = select(...);

if (ready > 0) {
    // ready FDs are available
    // Example: ready = 3 means 3 FDs are ready
}
else if (ready == 0) {
    // Timeout expired (no FDs ready)
}
else {  // ready < 0
    // Error occurred (check errno)
    if (errno == EINTR) {
        // Interrupted by signal (not an error)
    }
}
```

**Common mistake**:
```cpp
// ❌ Wrong: Checking before copying master set
select(max_fd + 1, &master_fds, NULL, NULL, NULL);
if (FD_ISSET(client_fd, &master_fds)) {  // master_fds is now modified!
    // ...
}

// ✅ Correct: Check working copy after select()
read_fds = master_fds;
select(max_fd + 1, &read_fds, NULL, NULL, NULL);
if (FD_ISSET(client_fd, &read_fds)) {  // Check working copy
    // ...
}
```

**Interview tip**: Emphasize that you must **iterate through all FDs** to check which are ready - select() doesn't give you a list, you must test each one.

---

#### Q6: Why must we pass (max_fd + 1) as the first argument to select()? [INTERMEDIATE]

**Tags**: #api-design #performance #nfds-parameter

**Answer**: The nfds parameter tells select() the highest file descriptor number to check, plus one. This allows select() to avoid scanning the entire fd_set (1024 bits).

**Detailed explanation**:

**Why +1?**
- C convention: nfds is the "one past the end" value
- Similar to array bounds: `arr[0]` to `arr[n-1]`, length is `n`
- select() checks FDs from `0` to `nfds-1` inclusive

**Performance optimization**:
```cpp
// If you have 3 FDs: 3, 5, 8
FD_SET(3, &fds);
FD_SET(5, &fds);
FD_SET(8, &fds);

// max_fd = 8, so pass 9
select(9, &fds, NULL, NULL, NULL);

// select() only checks bits 0-8 (9 bits)
// Skips checking bits 9-1023 (saves time)
```

**Without this optimization**:
```cpp
// If select() always checked all 1024 bits:
for (int fd = 0; fd < FD_SETSIZE; fd++) {  // Always 1024 iterations
    if (FD_ISSET(fd, &fds)) {
        // ...
    }
}
```

**With nfds parameter**:
```cpp
// select() only checks up to nfds:
for (int fd = 0; fd < nfds; fd++) {  // Only 9 iterations
    if (FD_ISSET(fd, &fds)) {
        // ...
    }
}
```

**Common mistakes**:

**Mistake 1: Passing count instead of max**
```cpp
// ❌ Wrong: Passing number of FDs
int num_fds = 3;  // 3 FDs
select(num_fds, &fds, NULL, NULL, NULL);  // Only checks FDs 0, 1, 2!

// ✅ Correct: Passing highest FD + 1
int max_fd = 8;  // Highest FD is 8
select(max_fd + 1, &fds, NULL, NULL, NULL);  // Checks FDs 0-8
```

**Mistake 2: Not updating max_fd**
```cpp
int max_fd = server_fd;  // Initially 3

int new_client = accept(server_fd, NULL, NULL);  // Returns 15
FD_SET(new_client, &fds);
// ❌ Forgot to update max_fd

select(max_fd + 1, &fds, NULL, NULL, NULL);  // Still checks only 0-3, misses FD 15!

// ✅ Correct:
if (new_client > max_fd) {
    max_fd = new_client;
}
```

**Tracking max_fd**:
```cpp
int max_fd = server_fd;

// When adding FD:
FD_SET(new_fd, &master_fds);
if (new_fd > max_fd) max_fd = new_fd;

// When removing FD:
FD_CLR(old_fd, &master_fds);
// Note: Don't decrement max_fd (would need to recalculate)
// Slight inefficiency, but safe
```

**Interview tip**: Mention that this is an **O(n) optimization** - without nfds, select() would be O(FD_SETSIZE) regardless of actual FDs.

---

#### Q7: What happens if you forget to check for zero-byte reads (EOF)? [INTERMEDIATE]

**Tags**: #edge-cases #busy-loop #disconnection

**Answer**: Forgetting to check for zero-byte reads causes an infinite busy loop consuming 100% CPU because select() continuously reports the disconnected socket as "ready" for reading.

**Detailed explanation**:

**The bug**:
```cpp
if (FD_ISSET(client_fd, &read_fds)) {
    char buffer[1024];
    int n = recv(client_fd, buffer, sizeof(buffer), 0);

    // ❌ No check for n == 0

    std::cout << "Received: " << std::string(buffer, n) << "\n";
    send(client_fd, buffer, n, 0);
}
// FD still in master_fds - not removed!
```

**What happens**:
1. Client closes connection
2. Socket enters EOF state
3. `select()` returns immediately (socket is "readable")
4. `recv()` returns 0 (EOF indicator)
5. Code doesn't remove FD from master_fds
6. **Next iteration**: `select()` returns immediately again (still "readable")
7. Loop continues forever at 100% CPU

**Why EOF is "readable"**:
- select() indicates "ready for reading" means `recv()` won't block
- EOF condition: `recv()` returns 0 immediately (doesn't block)
- Therefore, EOF is considered "readable"

**The fix**:
```cpp
if (FD_ISSET(client_fd, &read_fds)) {
    char buffer[1024];
    int n = recv(client_fd, buffer, sizeof(buffer), 0);

    if (n == 0) {
        // ✅ Client disconnected - clean up
        std::cout << "Client " << client_fd << " disconnected\n";
        close(client_fd);
        FD_CLR(client_fd, &master_fds);  // Remove from set
    }
    else if (n < 0) {
        // ✅ Error - clean up
        perror("recv");
        close(client_fd);
        FD_CLR(client_fd, &master_fds);
    }
    else {
        // ✅ Normal data
        std::cout << "Received: " << std::string(buffer, n) << "\n";
        send(client_fd, buffer, n, 0);
    }
}
```

**Debugging symptoms**:
- `top` shows 100% CPU usage
- `strace` shows select() returning immediately
- Server becomes unresponsive (spending all time in loop)

**Real-world impact**:
```cpp
// With 1 disconnected client:
// - select() called millions of times per second
// - CPU at 100%
// - Other clients can't be serviced (starvation)
```

**Interview tip**: This is one of the most common select() bugs in production. Always mention checking **both n == 0 and n < 0**.

---

#### Q8: How do you handle partial sends with select()? [ADVANCED]

**Tags**: #partial-send #writefds #buffering

**Answer**: Monitor the write file descriptor set (writefds) and maintain per-client write queues to handle partial sends when the socket send buffer is full.

**Detailed explanation**:

**The problem**:
```cpp
const char* large_msg = /* 100KB message */;
int sent = send(client_fd, large_msg, 100000, 0);
// sent might be 65536 (64KB) instead of 100000
// Remaining 34464 bytes are LOST if you don't handle it
```

**Why partial sends occur**:
- Socket send buffer has limited size (~64KB default)
- If buffer full, `send()` writes what it can and returns
- `send()` with non-blocking socket might return EWOULDBLOCK

**Solution 1: Monitor writefds**
```cpp
std::map<int, std::queue<std::string>> write_buffers;
fd_set master_write_fds;

// When sending:
int n = send(client_fd, data, len, 0);
if (n < len) {
    // Partial send - queue remainder
    std::string remainder(data + n, len - n);
    write_buffers[client_fd].push(remainder);
    FD_SET(client_fd, &master_write_fds);  // Start monitoring for write
}
```

**In select() loop**:
```cpp
fd_set read_fds = master_read_fds;
fd_set write_fds = master_write_fds;

select(max_fd + 1, &read_fds, &write_fds, NULL, NULL);

// Handle writable FDs
for (int fd = 0; fd <= max_fd; fd++) {
    if (FD_ISSET(fd, &write_fds)) {
        if (!write_buffers[fd].empty()) {
            std::string& data = write_buffers[fd].front();
            int sent = send(fd, data.c_str(), data.size(), 0);

            if (sent == data.size()) {
                // Complete - remove from queue
                write_buffers[fd].pop();

                if (write_buffers[fd].empty()) {
                    FD_CLR(fd, &master_write_fds);  // Stop monitoring
                }
            } else {
                // Still partial - update buffer
                data = data.substr(sent);
            }
        }
    }
}
```

**Solution 2: Blocking send-all helper**
```cpp
int send_all(int fd, const char* data, int len) {
    int total_sent = 0;

    while (total_sent < len) {
        int n = send(fd, data + total_sent, len - total_sent, 0);

        if (n < 0) {
            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                // Would block - could use select() here
                usleep(1000);  // Brief pause
                continue;
            }
            return -1;  // Real error
        }

        total_sent += n;
    }

    return total_sent;
}
```

**When to use each approach**:

| Approach | Pros | Cons | Use when |
|----------|------|------|----------|
| writefds monitoring | Non-blocking, efficient | More complex | High-performance servers |
| Blocking send-all | Simple | Can block thread | Low-traffic servers |

**Production pattern**:
```cpp
// Try immediate send
int sent = send(fd, data, len, 0);

if (sent == len) {
    // Complete - done
    return;
}

if (sent < 0 && errno != EWOULDBLOCK) {
    // Real error
    handle_error(fd);
    return;
}

// Partial or would block - queue remainder
std::string remainder = (sent > 0) ? std::string(data + sent, len - sent)
                                    : std::string(data, len);
write_buffers[fd].push(remainder);
FD_SET(fd, &master_write_fds);
```

**Interview tip**: Emphasize that **partial sends are normal** in production when sending large messages or during high load.

---

#### Q9: Why should you use sigaction() instead of signal() with select()? [INTERMEDIATE]

**Tags**: #signals #eintr #sa-restart

**Answer**: sigaction() with SA_RESTART flag automatically restarts select() after signal interruption, while signal() forces manual EINTR handling and has non-portable behavior.

**Detailed explanation**:

**The problem with signal()**:
```cpp
signal(SIGCHLD, sigchld_handler);

int ready = select(max_fd + 1, &read_fds, NULL, NULL, NULL);
// If SIGCHLD arrives during select(), returns -1 with errno=EINTR
```

**Manual EINTR handling (tedious)**:
```cpp
int ready;
do {
    read_fds = master_fds;
    ready = select(max_fd + 1, &read_fds, NULL, NULL, NULL);
} while (ready < 0 && errno == EINTR);

if (ready < 0) {
    perror("select");
}
```

**Solution with sigaction()**:
```cpp
struct sigaction sa;
sa.sa_handler = sigchld_handler;
sigemptyset(&sa.sa_mask);
sa.sa_flags = SA_RESTART;  // ✅ Auto-restart select() after signal
sigaction(SIGCHLD, &sa, NULL);

// Now select() automatically restarts
int ready = select(max_fd + 1, &read_fds, NULL, NULL, NULL);
// No EINTR check needed!
```

**What SA_RESTART does**:
1. Signal arrives during select()
2. Handler executes
3. select() **automatically restarts** from beginning
4. Returns as if signal never happened

**Comparison table**:

| Aspect | signal() | sigaction() with SA_RESTART |
|--------|----------|----------------------------|
| EINTR handling | Manual (do-while loop) | Automatic |
| Portability | Varies across UNIX | Consistent POSIX |
| Signal handler persistence | May reset to SIG_DFL | Stays installed |
| Code complexity | High | Low |

**When SA_RESTART doesn't work**:
- Timeout-based select(): Restarting resets timeout
- Want to detect signals: Use SA_RESTART and check separate flag

**Production pattern with graceful shutdown**:
```cpp
volatile sig_atomic_t stop_server = 0;

void signal_handler(int signum) {
    stop_server = 1;  // Set flag
}

int main() {
    struct sigaction sa;
    sa.sa_handler = signal_handler;
    sigemptyset(&sa.sa_mask);
    sa.sa_flags = SA_RESTART;  // ✅ Don't use SA_RESTART for shutdown signals!

    sigaction(SIGINT, &sa, NULL);
    sigaction(SIGTERM, &sa, NULL);

    while (!stop_server) {
        int ready = select(...);
        if (ready < 0 && errno == EINTR) {
            // Signal arrived - check stop_server flag
            if (stop_server) break;
            continue;
        }
        // ...
    }
}
```

**Interview tip**: Mention that SA_RESTART is part of **POSIX.1-1990** and is portable across all modern UNIX systems, unlike signal() which has implementation-defined behavior.

---

#### Q10: How does select() perform with 1000 file descriptors? What's the time complexity? [ADVANCED]

**Tags**: #performance #scalability #complexity

**Answer**: select() has O(n) time complexity where n is the value of nfds (highest FD + 1). With 1000 FDs, performance degrades significantly due to kernel copying fd_sets and userspace iterating all FDs.

**Detailed explanation**:

**Time complexity breakdown**:

**1. Kernel side (in select() call)**:
```cpp
// Pseudo-code of what kernel does:
select(max_fd + 1, &read_fds, &write_fds, &except_fds, &timeout) {
    // O(max_fd) - copy fd_sets from userspace to kernel
    copy_from_user(read_fds);
    copy_from_user(write_fds);
    copy_from_user(except_fds);

    // O(max_fd) - check each FD
    for (int fd = 0; fd < max_fd; fd++) {
        if (FD_ISSET(fd, read_fds)) {
            if (fd_is_ready_for_read(fd)) {
                // Keep in set
            } else {
                FD_CLR(fd, read_fds);  // Remove
            }
        }
    }

    // O(max_fd) - copy fd_sets back to userspace
    copy_to_user(read_fds);
    copy_to_user(write_fds);
}
```

**2. Userspace side (in your code)**:
```cpp
// O(max_fd) - iterate to find ready FDs
for (int fd = 0; fd <= max_fd; fd++) {
    if (FD_ISSET(fd, &read_fds)) {
        handle_client(fd);
    }
}
```

**Total per iteration**: O(max_fd) kernel + O(max_fd) userspace = **O(max_fd)**

**Real-world performance**:

| FDs | select() time | Scalability |
|-----|--------------|-------------|
| 10 | ~1 μs | Excellent |
| 100 | ~10 μs | Good |
| 500 | ~50 μs | Acceptable |
| 1000 | ~100 μs | Poor |
| 2000 | ~200 μs | Very poor |

**Why it gets slower**:
```cpp
// With max_fd = 1000 and only 3 active FDs:
// - Copies 128 bytes (1024 bits) to kernel
// - Kernel checks all 1000 FDs
// - Copies 128 bytes back to userspace
// - Userspace loops through 1000 FDs to find 3 ready ones

// Even though only 3 FDs are active, we pay O(1000) cost!
```

**Comparison with epoll (Topic 5)**:
```cpp
// epoll is O(num_ready_fds) - only returns READY FDs
epoll_wait(epfd, events, MAX_EVENTS, -1);  // Returns array of ready FDs

for (int i = 0; i < num_ready; i++) {
    handle_client(events[i].data.fd);  // Direct access, no iteration
}
```

**When select() is still acceptable**:
- Small number of FDs (<100)
- High activity ratio (most FDs are often ready)
- Portability is critical (select() is universal)

**When to use alternatives**:
- **poll()**: Same O(n) but no FD_SETSIZE limit
- **epoll()**: O(ready FDs) - scales to millions

**Measurement example**:
```cpp
#include <chrono>

auto start = std::chrono::high_resolution_clock::now();
int ready = select(max_fd + 1, &read_fds, NULL, NULL, NULL);
auto end = std::chrono::high_resolution_clock::now();

auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end - start);
std::cout << "select() took: " << duration.count() << " μs\n";
```

**Interview tip**: Mention that select() **doesn't scale** to modern web server requirements (10k+ connections), which led to the "C10K problem" and creation of epoll/kqueue.

---

#### Q11: What's the difference between level-triggered and edge-triggered I/O? Does select() support both? [ADVANCED]

**Tags**: #level-triggered #edge-triggered #event-notification

**Answer**: select() only supports level-triggered mode, where the kernel reports "FD is ready" as long as the condition remains true. Edge-triggered mode (only in epoll) reports "FD became ready" as a one-time event.

**Detailed explanation**:

**Level-triggered (select() behavior)**:
```cpp
// Client sends 1000 bytes
// select() returns: "fd is readable"
recv(fd, buffer, 100, 0);  // Read only 100 bytes

// 900 bytes remain in buffer
// select() returns AGAIN: "fd is readable"
recv(fd, buffer, 100, 0);  // Read another 100 bytes

// Repeats until all data consumed
```

**Edge-triggered (epoll only)**:
```cpp
// Client sends 1000 bytes
// epoll_wait() returns: "fd became readable" (one-time notification)
recv(fd, buffer, 100, 0);  // Read only 100 bytes

// 900 bytes remain, but epoll_wait() WILL NOT report it again
// Unless NEW data arrives!

// Must read until EAGAIN
while (true) {
    int n = recv(fd, buffer, 1024, 0);
    if (n < 0 && errno == EAGAIN) break;  // All data consumed
}
```

**Comparison table**:

| Aspect | Level-Triggered (select) | Edge-Triggered (epoll) |
|--------|-------------------------|------------------------|
| **Reports** | "FD is ready" | "FD became ready" |
| **Frequency** | Every call while ready | Only on state change |
| **Partial reads** | Safe - renotifies | Dangerous - no renotification |
| **Must read all?** | No | Yes (until EAGAIN) |
| **Complexity** | Simple | Complex |
| **Performance** | Lower (repeated notifications) | Higher (fewer syscalls) |

**Why select() can't do edge-triggered**:
```cpp
// select() modifies fd_set in place:
// - Kernel doesn't remember "last state"
// - Can't detect "transition" from not-ready → ready
// - Only knows "is ready NOW"

// epoll maintains per-FD state in kernel:
// - Remembers: was_ready vs is_ready
// - Can detect transition (edge)
```

**Example scenario**:
```cpp
// Level-triggered (select):
while (true) {
    select(...);  // Returns if ANY data available
    recv(fd, buf, 100, 0);  // Read small chunk
    // Next select() immediately returns if data remains
}

// Edge-triggered (epoll):
epoll_wait(...);  // Returns ONCE when data arrives
while (true) {
    int n = recv(fd, buf, sizeof(buf), 0);
    if (n < 0) {
        if (errno == EAGAIN) break;  // ✅ All consumed
        perror("recv");
    }
}
// Must read until EAGAIN, or data will be "lost"
```

**When to use each**:
- **Level-triggered**: Simpler code, safer (can partial read), good for most applications
- **Edge-triggered**: More efficient (fewer wakeups), required for high-performance servers

**Interview tip**: Mention that edge-triggered is **harder to use correctly** - forgetting to read all data causes silent starvation of that FD.

---

#### Q12: How do you implement connection timeout for new connections? [INTERMEDIATE]

**Tags**: #timeout #connection-management #production

**Answer**: Use select() timeout to periodically check elapsed time since accept(), and close connections that haven't sent data within a timeout period.

**Detailed explanation**:

**The problem**:
```cpp
int new_client = accept(server_fd, NULL, NULL);
// Client connects but never sends data
// Resources held forever (socket, memory, FD slot)
```

**Solution: Track connection time**:
```cpp
#include <ctime>

struct ClientInfo {
    int fd;
    time_t connected_at;
    time_t last_activity;
};

std::map<int, ClientInfo> clients;

const int CONNECTION_TIMEOUT = 30;  // 30 seconds to send first message
const int IDLE_TIMEOUT = 300;        // 5 minutes between messages
```

**Implementation**:
```cpp
void check_timeouts(fd_set& master_fds) {
    time_t now = time(NULL);
    std::vector<int> to_remove;

    for (auto& [fd, info] : clients) {
        // Check connection timeout (no data received yet)
        if (info.last_activity == info.connected_at) {
            if (now - info.connected_at > CONNECTION_TIMEOUT) {
                std::cout << "Client " << fd << " timeout: no initial data in "
                          << CONNECTION_TIMEOUT << "s\n";

                const char* msg = "408 Request Timeout\r\n\r\n";
                send(fd, msg, strlen(msg), 0);

                close(fd);
                FD_CLR(fd, &master_fds);
                to_remove.push_back(fd);
                continue;
            }
        }

        // Check idle timeout (no recent activity)
        if (now - info.last_activity > IDLE_TIMEOUT) {
            std::cout << "Client " << fd << " idle timeout: "
                      << (now - info.last_activity) << "s\n";

            const char* msg = "Connection closed due to inactivity\n";
            send(fd, msg, strlen(msg), 0);

            close(fd);
            FD_CLR(fd, &master_fds);
            to_remove.push_back(fd);
        }
    }

    for (int fd : to_remove) {
        clients.erase(fd);
    }
}
```

**Main loop with timeout checking**:
```cpp
while (true) {
    fd_set read_fds = master_fds;

    // Use timeout to periodically check for timeouts
    struct timeval timeout;
    timeout.tv_sec = 5;  // Check every 5 seconds
    timeout.tv_usec = 0;

    int ready = select(max_fd + 1, &read_fds, NULL, NULL, &timeout);

    if (ready == 0) {
        // Timeout - check for idle/connection timeouts
        check_timeouts(master_fds);
        continue;
    }

    // Handle ready FDs
    for (int fd = 0; fd <= max_fd; fd++) {
        if (!FD_ISSET(fd, &read_fds)) continue;

        if (fd == server_fd) {
            // New connection
            int new_client = accept(server_fd, NULL, NULL);
            FD_SET(new_client, &master_fds);

            ClientInfo info;
            info.fd = new_client;
            info.connected_at = time(NULL);
            info.last_activity = info.connected_at;  // Initially same
            clients[new_client] = info;

        } else {
            // Data received
            char buffer[1024];
            int n = recv(fd, buffer, sizeof(buffer), 0);

            if (n > 0) {
                // Update activity timestamp
                clients[fd].last_activity = time(NULL);
                // Process data...
            }
        }
    }
}
```

**Production improvements**:
```cpp
// Use std::chrono for higher precision
#include <chrono>

struct ClientInfo {
    std::chrono::steady_clock::time_point connected_at;
    std::chrono::steady_clock::time_point last_activity;
};

// Check timeout
auto now = std::chrono::steady_clock::now();
auto duration = std::chrono::duration_cast<std::chrono::seconds>(
    now - info.last_activity
).count();

if (duration > IDLE_TIMEOUT) {
    // Timeout
}
```

**Configurable timeouts by connection type**:
```cpp
struct ClientInfo {
    time_t connected_at;
    time_t last_activity;
    int timeout_seconds;  // Per-client timeout
};

// Set different timeouts:
// - Authenticated users: 30 minutes
// - Unauthenticated: 30 seconds
// - Admin connections: Never timeout
```

**Interview tip**: Emphasize that timeouts are essential for **preventing resource exhaustion** from slow/malicious clients (Slowloris attack).

---

#### Q13: Compare select() vs poll() - what problems does poll() solve? [INTERMEDIATE]

**Tags**: #comparison #poll #scalability

**Answer**: poll() solves select()'s FD_SETSIZE limit (1024 FDs) and awkward API, but retains O(n) complexity. Both are suitable for <1000 connections.

**Detailed explanation**:

**API comparison**:

**select()**:
```cpp
fd_set read_fds, master_fds;
FD_ZERO(&master_fds);
FD_SET(server_fd, &master_fds);
FD_SET(client1_fd, &master_fds);
int max_fd = std::max(server_fd, client1_fd);

read_fds = master_fds;  // Must copy
select(max_fd + 1, &read_fds, NULL, NULL, NULL);

// Check ready FDs
for (int fd = 0; fd <= max_fd; fd++) {
    if (FD_ISSET(fd, &read_fds)) {
        // Ready
    }
}
```

**poll()**:
```cpp
std::vector<struct pollfd> fds;
fds.push_back({server_fd, POLLIN, 0});
fds.push_back({client1_fd, POLLIN, 0});

poll(fds.data(), fds.size(), -1);  // No max_fd needed

// Check ready FDs
for (auto& pfd : fds) {
    if (pfd.revents & POLLIN) {
        // Ready
    }
}
```

**Comparison table**:

| Feature | select() | poll() |
|---------|----------|--------|
| **FD limit** | 1024 (FD_SETSIZE) | No limit |
| **Time complexity** | O(max_fd) | O(num_fds) |
| **Data structure** | Bitmask (fd_set) | Array (struct pollfd) |
| **API complexity** | High (master set pattern) | Moderate (array management) |
| **Portability** | Universal (POSIX.1-1990) | POSIX.1-2001 |
| **Must copy?** | Yes (fd_set modified) | No (revents separate) |
| **Max FD tracking?** | Yes (max_fd + 1) | No (pass array size) |

**Problems poll() solves**:

**1. No FD limit**:
```cpp
// select(): Limited to 1024 FDs
if (new_fd >= FD_SETSIZE) {  // Always need this check
    // Reject
}

// poll(): No limit (only system ulimit)
fds.push_back({new_fd, POLLIN, 0});  // Works for any FD number
```

**2. No master set copying**:
```cpp
// select(): Must copy master set every iteration
read_fds = master_fds;  // Expensive for large sets
select(max_fd + 1, &read_fds, NULL, NULL, NULL);

// poll(): Input not modified
poll(fds.data(), fds.size(), -1);
// fds[i].events unchanged, results in fds[i].revents
```

**3. Easier to add/remove FDs**:
```cpp
// select(): Must track max_fd
FD_SET(new_fd, &master_fds);
if (new_fd > max_fd) max_fd = new_fd;

// poll(): Just append to vector
fds.push_back({new_fd, POLLIN, 0});

// select(): Remove FD
FD_CLR(fd, &master_fds);
// max_fd might be stale (inefficiency)

// poll(): Remove FD
fds.erase(std::remove_if(fds.begin(), fds.end(),
    [fd](const pollfd& p) { return p.fd == fd; }), fds.end());
```

**What poll() DOESN'T solve**:
- Still O(n) complexity (iterates all FDs)
- Still copies entire array to kernel
- Still checks all FDs in kernel
- Not significantly faster than select()

**When to use each**:

| Scenario | Recommendation |
|----------|---------------|
| <100 FDs, need portability | select() (universal) |
| 100-1000 FDs, Linux/modern UNIX | poll() (no FD limit) |
| >1000 FDs, high performance | epoll()/kqueue() |
| Old embedded systems | select() (more portable) |

**Interview tip**: Mention that poll() is **evolutionary** (small improvements), while epoll() is **revolutionary** (fundamentally different design).

---

#### Q14: How does epoll() fundamentally differ from select/poll? When should you use it? [ADVANCED]

**Tags**: #epoll #scalability #performance #comparison

**Answer**: epoll() uses O(ready FDs) complexity instead of O(total FDs) by maintaining state in the kernel and only returning ready FDs, scaling to millions of connections.

**Detailed explanation**:

**Architecture comparison**:

**select()/poll() - Stateless**:
```cpp
// Every call:
while (true) {
    // 1. Copy ALL FDs to kernel (expensive)
    fd_set fds = master_fds;  // 1024 bits copied

    // 2. Kernel checks ALL FDs (O(n))
    select(max_fd + 1, &fds, NULL, NULL, NULL);

    // 3. Copy ALL FDs back to userspace

    // 4. Userspace iterates ALL FDs to find ready ones (O(n))
    for (int fd = 0; fd <= max_fd; fd++) {
        if (FD_ISSET(fd, &fds)) {  // Only 2 FDs ready
            // Handle
        }
    }
}
// Cost: O(n) every iteration, even if only 1 FD ready
```

**epoll() - Stateful**:
```cpp
// Setup (once):
int epfd = epoll_create1(0);
struct epoll_event ev;
ev.events = EPOLLIN;
ev.data.fd = server_fd;
epoll_ctl(epfd, EPOLL_CTL_ADD, server_fd, &ev);  // Register FD

// Main loop:
while (true) {
    struct epoll_event events[MAX_EVENTS];

    // Kernel only returns READY FDs (O(ready))
    int num_ready = epoll_wait(epfd, events, MAX_EVENTS, -1);

    // Iterate ONLY ready FDs (O(ready))
    for (int i = 0; i < num_ready; i++) {
        int fd = events[i].data.fd;
        // Handle ready FD
    }
}
// Cost: O(ready FDs), not O(total FDs)
```

**Key differences**:

| Aspect | select/poll | epoll |
|--------|------------|-------|
| **Kernel state** | None (stateless) | Maintains per-FD state |
| **FD registration** | Every call | Once (epoll_ctl) |
| **Data copying** | All FDs every call | Only ready FDs |
| **Userspace iteration** | All FDs | Only ready FDs |
| **Time complexity** | O(total FDs) | O(ready FDs) |
| **Max FDs** | 1024 (select), unlimited (poll) | Millions |
| **Memory usage** | O(max_fd) | O(registered FDs) |

**Performance at scale**:

| FDs | Ready | select/poll | epoll |
|-----|-------|------------|-------|
| 100 | 5 | ~10 μs | ~2 μs |
| 1,000 | 5 | ~100 μs | ~2 μs |
| 10,000 | 5 | ~1 ms | ~2 μs |
| 100,000 | 5 | ~10 ms | ~2 μs |

**Example: 10,000 idle connections, 10 active**:
```cpp
// select/poll:
// - Copies 10,000 FDs to kernel
// - Kernel checks all 10,000 FDs
// - Copies 10,000 FDs back
// - Userspace iterates 10,000 FDs to find 10 ready ones
// Cost: O(10,000)

// epoll:
// - Kernel maintains state of all 10,000 FDs
// - Only returns array of 10 ready FDs
// - Userspace processes 10 FDs directly
// Cost: O(10)
```

**epoll advantages**:
1. **O(1) per ready FD**: Constant time per active connection
2. **Edge-triggered mode**: One notification per event (reduces syscalls)
3. **No FD limit**: Can handle millions of connections
4. **No userspace iteration**: Kernel returns ready list

**epoll disadvantages**:
1. **Linux-only**: Not portable (use kqueue on BSD/macOS)
2. **More complex API**: 3 functions vs 1
3. **Edge-triggered tricky**: Must read until EAGAIN
4. **Overkill for <1000 FDs**: Setup overhead not worth it

**When to use epoll**:

**Use epoll when**:
- ✅ >1000 concurrent connections
- ✅ Most connections idle (chat, websockets, long-polling)
- ✅ Linux-only deployment
- ✅ High performance requirements

**Use select/poll when**:
- ✅ <1000 connections
- ✅ Need portability (Windows, old UNIX)
- ✅ Simple codebase more important than performance
- ✅ Embedded systems (select is simpler)

**Real-world examples**:
- **NGINX**: Uses epoll on Linux (handles 10k+ connections per worker)
- **Redis**: Uses select by default (few connections, simple)
- **HAProxy**: Uses epoll on Linux (load balancer for thousands of connections)

**Interview tip**: Mention the **C10K problem** (10,000 concurrent connections) which led to epoll's creation in Linux 2.5.44 (2002).

---

#### Q15: Explain how you would implement a production-ready select() server with logging, metrics, and monitoring. [ADVANCED]

**Tags**: #production #monitoring #best-practices

**Answer**: A production select() server needs structured logging, connection metrics, health endpoints, graceful shutdown, and monitoring integration.

**Detailed explanation**:

**Architecture**:
```cpp
Production select() Server
├── Main server loop (select())
├── Logging subsystem (syslog/log4cpp)
├── Metrics collector (StatsD/Prometheus)
├── Health check endpoint (separate port)
├── Signal handlers (graceful shutdown)
├── Configuration management (reload without restart)
└── Resource monitoring (FD usage, memory, CPU)
```

**1. Structured Logging**:
```cpp
#include <syslog.h>

class Logger {
public:
    static void init(const std::string& app_name) {
        openlog(app_name.c_str(), LOG_PID | LOG_NDELAY, LOG_DAEMON);
    }

    static void info(const std::string& msg) {
        syslog(LOG_INFO, "%s", msg.c_str());
    }

    static void error(const std::string& msg) {
        syslog(LOG_ERR, "%s", msg.c_str());
    }

    static void warn(const std::string& msg) {
        syslog(LOG_WARNING, "%s", msg.c_str());
    }

    ~Logger() {
        closelog();
    }
};

// Usage:
Logger::init("select_server");
Logger::info("Server started on port " + std::to_string(PORT));
Logger::error("Failed to accept connection: " + std::string(strerror(errno)));
```

**2. Metrics Collection**:
```cpp
class Metrics {
private:
    std::atomic<uint64_t> total_connections{0};
    std::atomic<uint64_t> active_connections{0};
    std::atomic<uint64_t> bytes_received{0};
    std::atomic<uint64_t> bytes_sent{0};
    std::atomic<uint64_t> errors{0};
    std::chrono::steady_clock::time_point start_time;

public:
    Metrics() : start_time(std::chrono::steady_clock::now()) {}

    void record_connection() { total_connections++; active_connections++; }
    void record_disconnection() { active_connections--; }
    void record_bytes_rx(uint64_t bytes) { bytes_received += bytes; }
    void record_bytes_tx(uint64_t bytes) { bytes_sent += bytes; }
    void record_error() { errors++; }

    // Export metrics (Prometheus format)
    std::string export_metrics() {
        std::ostringstream oss;
        oss << "# HELP server_connections_total Total connections\n";
        oss << "# TYPE server_connections_total counter\n";
        oss << "server_connections_total " << total_connections << "\n";

        oss << "# HELP server_connections_active Active connections\n";
        oss << "# TYPE server_connections_active gauge\n";
        oss << "server_connections_active " << active_connections << "\n";

        oss << "# HELP server_bytes_received_total Bytes received\n";
        oss << "# TYPE server_bytes_received_total counter\n";
        oss << "server_bytes_received_total " << bytes_received << "\n";

        oss << "# HELP server_bytes_sent_total Bytes sent\n";
        oss << "# TYPE server_bytes_sent_total counter\n";
        oss << "server_bytes_sent_total " << bytes_sent << "\n";

        auto uptime = std::chrono::duration_cast<std::chrono::seconds>(
            std::chrono::steady_clock::now() - start_time
        ).count();

        oss << "# HELP server_uptime_seconds Server uptime\n";
        oss << "# TYPE server_uptime_seconds counter\n";
        oss << "server_uptime_seconds " << uptime << "\n";

        return oss.str();
    }
};

Metrics g_metrics;

// Usage in main loop:
int new_client = accept(server_fd, NULL, NULL);
g_metrics.record_connection();
Logger::info("New connection: FD " + std::to_string(new_client));

int n = recv(fd, buffer, sizeof(buffer), 0);
g_metrics.record_bytes_rx(n);
```

**3. Health Check Endpoint**:
```cpp
// Separate thread for health checks
void health_check_server(int health_port) {
    int health_fd = socket(AF_INET, SOCK_STREAM, 0);

    struct sockaddr_in addr;
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons(health_port);

    bind(health_fd, (struct sockaddr*)&addr, sizeof(addr));
    listen(health_fd, 5);

    while (keep_running) {
        int client = accept(health_fd, NULL, NULL);
        if (client < 0) continue;

        // Simple HTTP response
        std::string response =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: text/plain\r\n"
            "\r\n"
            "OK\n"
            "Active connections: " + std::to_string(g_metrics.active_connections) + "\n";

        send(client, response.c_str(), response.size(), 0);
        close(client);
    }
}

// Start in main:
std::thread health_thread(health_check_server, 8081);
health_thread.detach();
```

**4. Graceful Shutdown**:
```cpp
volatile sig_atomic_t shutdown_requested = 0;
volatile sig_atomic_t reload_config = 0;

void signal_handler(int signum) {
    if (signum == SIGTERM || signum == SIGINT) {
        shutdown_requested = 1;
    } else if (signum == SIGHUP) {
        reload_config = 1;
    }
}

// Main loop:
while (!shutdown_requested) {
    if (reload_config) {
        Logger::info("Reloading configuration...");
        load_config();
        reload_config = 0;
    }

    // select() loop...
}

// Graceful shutdown
Logger::info("Shutting down gracefully...");

// 1. Stop accepting new connections
close(server_fd);
FD_CLR(server_fd, &master_fds);

// 2. Notify existing clients
for (auto& [fd, info] : clients) {
    const char* msg = "Server shutting down\n";
    send(fd, msg, strlen(msg), 0);
}

// 3. Wait briefly for pending writes
struct timeval shutdown_timeout = {5, 0};  // 5 seconds
select(max_fd + 1, NULL, &master_write_fds, NULL, &shutdown_timeout);

// 4. Close all connections
for (auto& [fd, info] : clients) {
    close(fd);
}

Logger::info("Shutdown complete");
```

**5. Resource Monitoring**:
```cpp
void log_resource_usage() {
    // FD usage
    int fd_count = 0;
    for (int i = 0; i < FD_SETSIZE; i++) {
        if (FD_ISSET(i, &master_fds)) fd_count++;
    }

    Logger::info("Resource usage: "
                 + std::to_string(fd_count) + "/"
                 + std::to_string(FD_SETSIZE) + " FDs, "
                 + std::to_string(clients.size()) + " clients");

    // Memory usage (Linux-specific)
    std::ifstream status("/proc/self/status");
    std::string line;
    while (std::getline(status, line)) {
        if (line.find("VmRSS:") == 0) {
            Logger::info("Memory: " + line);
            break;
        }
    }
}

// Call periodically:
if (time(NULL) - last_resource_log > 300) {  // Every 5 minutes
    log_resource_usage();
    last_resource_log = time(NULL);
}
```

**6. Configuration Management**:
```cpp
struct Config {
    int port;
    int max_clients;
    int heartbeat_interval;
    int idle_timeout;
    std::string log_level;

    static Config load_from_file(const std::string& path) {
        // Parse YAML/JSON config
        Config cfg;
        // ... parsing logic
        return cfg;
    }
};

Config g_config = Config::load_from_file("/etc/select_server.conf");

// Reload on SIGHUP:
if (reload_config) {
    try {
        g_config = Config::load_from_file("/etc/select_server.conf");
        Logger::info("Configuration reloaded successfully");
    } catch (const std::exception& e) {
        Logger::error("Config reload failed: " + std::string(e.what()));
    }
    reload_config = 0;
}
```

**7. Prometheus Metrics Endpoint**:
```cpp
// Add metrics endpoint to health server
if (path == "/metrics") {
    std::string metrics = g_metrics.export_metrics();
    std::string response =
        "HTTP/1.1 200 OK\r\n"
        "Content-Type: text/plain\r\n"
        "Content-Length: " + std::to_string(metrics.size()) + "\r\n"
        "\r\n" + metrics;
    send(client, response.c_str(), response.size(), 0);
}
```

**Production Checklist**:
- ✅ Structured logging (syslog integration)
- ✅ Metrics collection (Prometheus format)
- ✅ Health check endpoint (separate port)
- ✅ Graceful shutdown (SIGTERM handling)
- ✅ Configuration reload (SIGHUP)
- ✅ Resource monitoring (FD/memory tracking)
- ✅ Error handling (all syscalls checked)
- ✅ Rate limiting (per-client message limits)
- ✅ Connection limits (max_clients enforced)
- ✅ Timeout handling (idle client detection)

**Interview tip**: Mention that production servers need **observability** (logging + metrics + tracing) to diagnose issues in real-time.

---

#### Q16: How would you debug a select() server that's consuming 100% CPU? [INTERMEDIATE]

**Tags**: #debugging #troubleshooting #performance

**Answer**: 100% CPU in a select() server typically indicates a busy loop caused by not handling EOF, forgetting to copy master set, or incorrect timeout handling. Use strace, gdb, and profiling tools to diagnose.

**Detailed explanation**:

**Common causes and diagnosis**:

**1. Forgot to check for EOF (most common)**:
```cpp
// The bug:
if (FD_ISSET(fd, &read_fds)) {
    char buffer[1024];
    recv(fd, buffer, sizeof(buffer), 0);  // ❌ No check for n == 0
}
// FD stays in master_fds, select() returns immediately forever
```

**Diagnosis**:
```bash
# Use strace to see if select() returns immediately
strace -e select ./server

# Output showing busy loop:
select(10, [3 5 8], NULL, NULL, NULL) = 1 (in [8])
select(10, [3 5 8], NULL, NULL, NULL) = 1 (in [8])
select(10, [3 5 8], NULL, NULL, NULL) = 1 (in [8])
# Same FD (8) ready every time - probably EOF!
```

**Fix**:
```cpp
int n = recv(fd, buffer, sizeof(buffer), 0);
if (n == 0) {
    close(fd);
    FD_CLR(fd, &master_fds);  // ✅ Remove from set
}
```

**2. Forgot to copy master set**:
```cpp
// The bug:
fd_set master_fds;
FD_SET(server_fd, &master_fds);

while (true) {
    // ❌ Passing master set directly
    select(max_fd + 1, &master_fds, NULL, NULL, NULL);
    // master_fds now corrupted
}
```

**Diagnosis**:
```bash
# Add debug logging:
std::cout << "FDs in master_fds: ";
for (int i = 0; i <= max_fd; i++) {
    if (FD_ISSET(i, &master_fds)) {
        std::cout << i << " ";
    }
}
std::cout << "\n";

# Output:
# Iteration 1: FDs in master_fds: 3 5 8
# Iteration 2: FDs in master_fds: 5        ← Lost 3 and 8!
# Iteration 3: FDs in master_fds:          ← Lost all!
```

**Fix**:
```cpp
fd_set read_fds = master_fds;  // ✅ Copy before select()
select(max_fd + 1, &read_fds, NULL, NULL, NULL);
```

**3. Timeout handling error**:
```cpp
// The bug:
struct timeval timeout = {5, 0};

while (true) {
    // ❌ timeout gets modified by select() and becomes {0, 0}
    select(max_fd + 1, &read_fds, NULL, NULL, &timeout);
    // Now effectively timeout={0,0}, returns immediately
}
```

**Fix**:
```cpp
while (true) {
    struct timeval timeout = {5, 0};  // ✅ Reset every iteration
    select(max_fd + 1, &read_fds, NULL, NULL, &timeout);
}
```

**Debugging workflow**:

**Step 1: Confirm high CPU**:
```bash
top -p $(pidof select_server)
# %CPU should show ~100%
```

**Step 2: Use strace to see syscalls**:
```bash
strace -c -p $(pidof select_server)
# Count syscalls for 5 seconds, then Ctrl+C

# Output showing busy loop:
# % time     seconds  usecs/call     calls    errors syscall
# ------ ----------- ----------- --------- --------- ----------------
#  99.99    5.123456           1   5123456           select
#   0.01    0.000544           2       272           write
```

**Step 3: Detailed strace**:
```bash
strace -e select,recv -p $(pidof select_server) 2>&1 | head -50

# Look for patterns:
# - Same FD repeatedly ready: EOF not handled
# - select() returns 0 every call: Timeout={0,0} accidentally
# - Empty fd_set: Master set corruption
```

**Step 4: Attach with gdb**:
```bash
gdb -p $(pidof select_server)

(gdb) break main.cpp:123  # Line with select()
(gdb) continue

# When breakpoint hits:
(gdb) print/x master_fds
(gdb) print max_fd
(gdb) print timeout

# Check FD states:
(gdb) shell ls -l /proc/$(pidof select_server)/fd/
# Look for disconnected sockets
```

**Step 5: Add debug logging**:
```cpp
int ready = select(max_fd + 1, &read_fds, NULL, NULL, NULL);

// Log when select returns
std::cout << "[DEBUG] select() returned " << ready << ", checking FDs:\n";
for (int i = 0; i <= max_fd; i++) {
    if (FD_ISSET(i, &read_fds)) {
        std::cout << "  FD " << i << " is ready\n";
    }
}
```

**Prevention checklist**:
- ✅ Always check `recv()` return value for 0 (EOF)
- ✅ Always copy master set before select()
- ✅ Reset timeout struct every iteration
- ✅ Remove closed FDs from master set immediately
- ✅ Use `strace` during testing to catch busy loops early

**Interview tip**: Mention that **strace is the first tool** you should reach for when debugging syscall-heavy programs like network servers.

---

#### Q17: What are the security considerations when using select() for a public-facing server? [ADVANCED]

**Tags**: #security #dos #production

**Answer**: select() servers are vulnerable to resource exhaustion attacks (connection flooding, slowloris), must implement rate limiting, connection limits, timeouts, and input validation.

**Detailed explanation**:

**Security threats**:

**1. Connection Exhaustion (FD exhaustion)**:
```cpp
// Attack: Open 1024 connections and hold them
// Legitimate users can't connect (all FDs used)

// Defense: Limit connections
const int MAX_CLIENTS = 900;  // Leave buffer
std::atomic<int> active_clients{0};

int new_client = accept(server_fd, NULL, NULL);

if (active_clients >= MAX_CLIENTS) {
    const char* msg = "503 Service Unavailable\r\n\r\n";
    send(new_client, msg, strlen(msg), 0);
    close(new_client);
    Logger::warn("Connection limit reached, rejecting client");
    return;
}

active_clients++;
```

**2. Slowloris Attack (slow HTTP headers)**:
```cpp
// Attack: Connect, send 1 byte per minute, hold connection open
// Server waits forever, exhausts resources

// Defense: Connection timeout + idle timeout
struct ClientInfo {
    time_t connected_at;
    time_t last_activity;
    size_t bytes_received;
};

void check_timeouts() {
    time_t now = time(NULL);

    for (auto& [fd, info] : clients) {
        // Defense 1: Timeout for first byte
        if (info.bytes_received == 0 &&
            now - info.connected_at > 30) {  // 30s to send first byte
            Logger::warn("Slowloris defense: no data from FD " + std::to_string(fd));
            close_connection(fd);
        }

        // Defense 2: Idle timeout
        if (now - info.last_activity > 300) {  // 5 min idle
            Logger::warn("Idle timeout: FD " + std::to_string(fd));
            close_connection(fd);
        }
    }
}
```

**3. Large Message Flooding**:
```cpp
// Attack: Send 10MB messages continuously, exhaust memory

// Defense: Limit per-message size and rate
struct ClientInfo {
    size_t message_size_limit = 1024 * 1024;  // 1MB per message
    int messages_per_second = 10;
    std::deque<time_t> recent_messages;
};

int n = recv(fd, buffer, sizeof(buffer), 0);

clients[fd].bytes_received += n;

// Defense 1: Message size limit
if (clients[fd].bytes_received > clients[fd].message_size_limit) {
    Logger::warn("Message too large from FD " + std::to_string(fd));
    close_connection(fd);
    return;
}

// Defense 2: Rate limiting
clients[fd].recent_messages.push_back(time(NULL));

// Remove messages older than 1 second
time_t cutoff = time(NULL) - 1;
while (!clients[fd].recent_messages.empty() &&
       clients[fd].recent_messages.front() < cutoff) {
    clients[fd].recent_messages.pop_front();
}

if (clients[fd].recent_messages.size() > clients[fd].messages_per_second) {
    Logger::warn("Rate limit exceeded for FD " + std::to_string(fd));
    const char* msg = "429 Too Many Requests\r\n\r\n";
    send(fd, msg, strlen(msg), 0);
    close_connection(fd);
}
```

**4. IP Address Spoofing / Source Validation**:
```cpp
// Defense: Track and limit by source IP
std::map<std::string, int> connections_per_ip;
const int MAX_CONNECTIONS_PER_IP = 10;

int new_client = accept(server_fd, (struct sockaddr*)&client_addr, &addr_len);

std::string ip = inet_ntoa(client_addr.sin_addr);

if (connections_per_ip[ip] >= MAX_CONNECTIONS_PER_IP) {
    Logger::warn("IP " + ip + " exceeded connection limit");
    close(new_client);
    return;
}

connections_per_ip[ip]++;
```

**5. Buffer Overflow / Input Validation**:
```cpp
// Attack: Send malicious input to exploit parsing bugs

// Defense: Bounds checking and validation
char buffer[1024];
int n = recv(fd, buffer, sizeof(buffer) - 1, 0);  // Leave room for \0

if (n > 0) {
    buffer[n] = '\0';  // ✅ Null terminate

    // Validate input before processing
    if (n > 512) {  // Expected max message size
        Logger::warn("Oversized message from FD " + std::to_string(fd));
        close_connection(fd);
        return;
    }

    // Check for valid characters (if text protocol)
    for (int i = 0; i < n; i++) {
        if (!isprint(buffer[i]) && !isspace(buffer[i])) {
            Logger::warn("Invalid character in message from FD " + std::to_string(fd));
            close_connection(fd);
            return;
        }
    }

    // Process validated input
    process_message(fd, buffer, n);
}
```

**6. Resource Monitoring and Alerting**:
```cpp
void monitor_resources() {
    // Alert if approaching limits
    if (active_clients > MAX_CLIENTS * 0.8) {  // 80% capacity
        Logger::warn("High load: " + std::to_string(active_clients) +
                     "/" + std::to_string(MAX_CLIENTS) + " clients");
    }

    // Alert on high connection rate
    static time_t last_check = time(NULL);
    static int connections_since_last_check = 0;
    connections_since_last_check++;

    time_t now = time(NULL);
    if (now - last_check >= 60) {  // Check every minute
        if (connections_since_last_check > 1000) {  // >1000 conn/min
            Logger::warn("High connection rate: " +
                         std::to_string(connections_since_last_check) + " conn/min");
        }
        connections_since_last_check = 0;
        last_check = now;
    }
}
```

**7. Privilege Separation**:
```cpp
int main() {
    // Bind to port 80 (requires root)
    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    bind(server_fd, ...);
    listen(server_fd, 128);

    // Drop privileges before accepting connections
    if (getuid() == 0) {  // Running as root
        struct passwd* pw = getpwnam("nobody");
        if (pw) {
            if (setgid(pw->pw_gid) != 0 || setuid(pw->pw_uid) != 0) {
                perror("Failed to drop privileges");
                exit(1);
            }
            Logger::info("Dropped privileges to user 'nobody'");
        }
    }

    // Now accept connections with reduced privileges
    while (true) {
        // ...
    }
}
```

**Security checklist**:
- ✅ Connection limits (per-IP and global)
- ✅ Timeouts (connection, idle, request)
- ✅ Rate limiting (messages per second)
- ✅ Message size limits (prevent memory exhaustion)
- ✅ Input validation (reject malformed data)
- ✅ Resource monitoring (alert on anomalies)
- ✅ Privilege separation (drop root after bind)
- ✅ Logging (audit trail for security events)
- ✅ Graceful degradation (reject new connections under load)
- ✅ DDoS mitigation (integrate with fail2ban/iptables)

**Interview tip**: Emphasize **defense in depth** - multiple layers of protection, because no single defense is perfect.

---

#### Q18: How do you handle large file transfers efficiently with select()? [ADVANCED]

**Tags**: #performance #file-transfer #zero-copy

**Answer**: Use non-blocking I/O, monitor writefds for backpressure, leverage sendfile() for zero-copy transfers, and implement flow control to prevent memory exhaustion.

**Detailed explanation**:

**Challenge**: Transferring large files (100MB+) without blocking or exhausting memory.

**Naive approach (bad)**:
```cpp
// ❌ Loads entire file into memory
std::ifstream file("large_file.bin", std::ios::binary);
std::string content((std::istreambuf_iterator<char>(file)),
                     std::istreambuf_iterator<char>());

send(client_fd, content.c_str(), content.size(), 0);  // Blocks!
```

**Problems**:
- Loads 100MB into RAM (memory exhaustion)
- `send()` blocks until all data sent
- Other clients starved while transferring

**Solution 1: Chunked reading + write monitoring**:
```cpp
struct FileTransfer {
    int fd;              // Client FD
    int file_fd;         // Open file descriptor
    size_t total_size;
    size_t sent;
    const size_t CHUNK_SIZE = 64 * 1024;  // 64KB chunks
};

std::map<int, FileTransfer> active_transfers;

// Start transfer
void start_file_transfer(int client_fd, const std::string& path) {
    int file_fd = open(path.c_str(), O_RDONLY);
    if (file_fd < 0) {
        perror("open");
        return;
    }

    struct stat st;
    fstat(file_fd, &st);

    FileTransfer transfer;
    transfer.fd = client_fd;
    transfer.file_fd = file_fd;
    transfer.total_size = st.st_size;
    transfer.sent = 0;

    active_transfers[client_fd] = transfer;

    // Start monitoring writefds
    FD_SET(client_fd, &master_write_fds);

    Logger::info("Starting transfer of " + std::to_string(st.st_size) + " bytes");
}

// In select() loop when FD writable:
if (FD_ISSET(fd, &write_fds)) {
    if (active_transfers.find(fd) != active_transfers.end()) {
        FileTransfer& xfer = active_transfers[fd];

        // Read chunk from file
        char buffer[xfer.CHUNK_SIZE];
        ssize_t nread = read(xfer.file_fd, buffer, sizeof(buffer));

        if (nread <= 0) {
            // Transfer complete or error
            close(xfer.file_fd);
            FD_CLR(fd, &master_write_fds);
            active_transfers.erase(fd);
            Logger::info("Transfer complete");
            return;
        }

        // Send chunk
        ssize_t nsent = send(fd, buffer, nread, 0);

        if (nsent < 0) {
            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                // Socket buffer full, try again later
                lseek(xfer.file_fd, -nread, SEEK_CUR);  // Rewind
                return;
            }
            // Error
            close(xfer.file_fd);
            FD_CLR(fd, &master_write_fds);
            active_transfers.erase(fd);
            return;
        }

        xfer.sent += nsent;

        if (nsent < nread) {
            // Partial send - rewind file
            lseek(xfer.file_fd, -(nread - nsent), SEEK_CUR);
        }

        // Update progress
        double progress = (double)xfer.sent / xfer.total_size * 100.0;
        Logger::info("Transfer " + std::to_string((int)progress) + "% complete");
    }
}
```

**Solution 2: Zero-copy with sendfile() (Linux)**:
```cpp
#include <sys/sendfile.h>

void sendfile_transfer(int client_fd, const std::string& path) {
    int file_fd = open(path.c_str(), O_RDONLY);
    if (file_fd < 0) {
        perror("open");
        return;
    }

    struct stat st;
    fstat(file_fd, &st);
    off_t offset = 0;
    size_t remaining = st.st_size;

    while (remaining > 0) {
        // ✅ Zero-copy: kernel transfers directly from file to socket
        ssize_t sent = sendfile(client_fd, file_fd, &offset, remaining);

        if (sent < 0) {
            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                // Socket buffer full - wait for writable
                fd_set write_fds;
                FD_ZERO(&write_fds);
                FD_SET(client_fd, &write_fds);

                struct timeval timeout = {5, 0};  // 5 second timeout
                if (select(client_fd + 1, NULL, &write_fds, NULL, &timeout) <= 0) {
                    break;  // Timeout or error
                }
                continue;
            }
            perror("sendfile");
            break;
        }

        remaining -= sent;
    }

    close(file_fd);
}
```

**Benefits of sendfile()**:
- **Zero-copy**: No data copied to userspace
- **Faster**: Kernel does DMA transfer directly
- **Less CPU**: No context switches for read/send
- **Less memory**: No buffering in userspace

**Comparison**:

| Method | Memory usage | CPU usage | Speed | Complexity |
|--------|-------------|-----------|-------|------------|
| Load entire file | O(file size) | High | Slow | Low |
| Chunked read/send | O(chunk size) | Medium | Medium | Medium |
| sendfile() | O(1) | Low | Fast | Low |

**Flow control for multiple transfers**:
```cpp
const int MAX_CONCURRENT_TRANSFERS = 10;
std::atomic<int> active_transfer_count{0};

void start_file_transfer(int client_fd, const std::string& path) {
    if (active_transfer_count >= MAX_CONCURRENT_TRANSFERS) {
        const char* msg = "503 Too many transfers in progress\r\n";
        send(client_fd, msg, strlen(msg), 0);
        return;
    }

    active_transfer_count++;
    // Start transfer...
}

// On completion:
active_transfer_count--;
```

**Monitoring transfer health**:
```cpp
struct FileTransfer {
    // ... existing fields ...
    time_t start_time;
    time_t last_progress_time;
    size_t last_progress_bytes;
};

void check_stalled_transfers() {
    time_t now = time(NULL);

    for (auto it = active_transfers.begin(); it != active_transfers.end(); ) {
        auto& [fd, xfer] = *it;

        // Check if transfer stalled (no progress in 30 seconds)
        if (now - xfer.last_progress_time > 30) {
            Logger::warn("Transfer stalled for FD " + std::to_string(fd));
            close(xfer.file_fd);
            FD_CLR(fd, &master_write_fds);
            it = active_transfers.erase(it);
            active_transfer_count--;
        } else {
            ++it;
        }
    }
}
```

**Interview tip**: Mention that `sendfile()` is a **syscall optimization** used by high-performance servers like NGINX for static file serving.

---

#### Q19: Explain how you would implement zero-downtime restart for a select() server. [ADVANCED]

**Tags**: #deployment #availability #production

**Answer**: Use socket passing via UNIX domain sockets to transfer listening socket to new process, or use SO_REUSEPORT for gradual migration. Requires careful state transfer and client migration.

**Detailed explanation**:

**Challenge**: Restart server for updates without dropping connections or refusing new connections.

**Approach 1: Socket passing (file descriptor transfer)**

**Old process passes listening socket to new process**:

**Step 1: New process signals readiness**
```cpp
// new_process.cpp
int main() {
    // Connect to old process via UNIX socket
    int control_sock = socket(AF_UNIX, SOCK_STREAM, 0);
    struct sockaddr_un addr;
    addr.sun_family = AF_UNIX;
    strcpy(addr.sun_path, "/tmp/server_control.sock");

    connect(control_sock, (struct sockaddr*)&addr, sizeof(addr));

    // Receive listening socket FD from old process
    int server_fd = recv_fd(control_sock);

    Logger::info("Received listening socket FD " + std::to_string(server_fd));

    // Start accepting connections on inherited socket
    start_server_loop(server_fd);
}
```

**Step 2: Old process sends FD**
```cpp
// Helper: Send FD over UNIX socket
int send_fd(int sock, int fd) {
    struct msghdr msg = {0};
    char buf[CMSG_SPACE(sizeof(int))];
    memset(buf, 0, sizeof(buf));

    struct iovec io = {.iov_base = (void*)"X", .iov_len = 1};

    msg.msg_iov = &io;
    msg.msg_iovlen = 1;
    msg.msg_control = buf;
    msg.msg_controllen = sizeof(buf);

    struct cmsghdr* cmsg = CMSG_FIRSTHDR(&msg);
    cmsg->cmsg_level = SOL_SOCKET;
    cmsg->cmsg_type = SCM_RIGHTS;
    cmsg->cmsg_len = CMSG_LEN(sizeof(int));

    memcpy(CMSG_DATA(cmsg), &fd, sizeof(int));

    return sendmsg(sock, &msg, 0);
}

// old_process.cpp
void handle_reload_signal() {
    Logger::info("Reload requested, starting new process...");

    // Fork new process
    pid_t pid = fork();

    if (pid == 0) {
        // Child: exec new binary
        execl("/path/to/new_server", "new_server", NULL);
        exit(1);
    }

    // Parent: Wait for new process to connect
    int control_sock = accept(control_listen_fd, NULL, NULL);

    // Send listening socket to new process
    send_fd(control_sock, server_fd);

    Logger::info("Transferred listening socket to new process");

    // Stop accepting new connections
    FD_CLR(server_fd, &master_fds);

    // Handle existing connections until complete
    while (!clients.empty()) {
        // Continue servicing existing clients
        select(...);
        // ...
    }

    Logger::info("All clients migrated, exiting old process");
    exit(0);
}
```

**Approach 2: SO_REUSEPORT (Linux 3.9+)**

**Multiple processes listen on same port**:

**Old and new processes both listen**:
```cpp
int server_fd = socket(AF_INET, SOCK_STREAM, 0);

// ✅ Allow multiple processes to bind to same port
int opt = 1;
setsockopt(server_fd, SOL_SOCKET, SO_REUSEPORT, &opt, sizeof(opt));

struct sockaddr_in addr;
addr.sin_family = AF_INET;
addr.sin_addr.s_addr = INADDR_ANY;
addr.sin_port = htons(PORT);

bind(server_fd, (struct sockaddr*)&addr, sizeof(addr));
listen(server_fd, 128);

// Both old and new process accept() from same port
// Kernel load-balances new connections
```

**Deployment process**:
```bash
# Step 1: Start new server (still in testing mode)
./new_server --port 8080 &

# Step 2: Health check new server
curl http://localhost:8080/health
# 200 OK

# Step 3: Signal old server to stop accepting new connections
kill -SIGUSR1 $(pidof old_server)

# Old server drains existing connections, new server accepts new ones

# Step 4: Wait for old server to finish
wait $(pidof old_server)

# Step 5: New server now handles all traffic
```

**Graceful drain in old process**:
```cpp
volatile sig_atomic_t drain_mode = 0;

void signal_handler(int sig) {
    if (sig == SIGUSR1) {
        drain_mode = 1;  // Stop accepting new connections
    }
}

while (true) {
    if (drain_mode) {
        // Remove listening socket from select()
        FD_CLR(server_fd, &master_fds);
        close(server_fd);
        Logger::info("Drain mode: stopped accepting new connections");

        // Continue servicing existing clients
        if (clients.empty()) {
            Logger::info("All clients drained, exiting");
            break;
        }
    }

    // Normal select() loop
    select(...);
    // ...
}
```

**Approach 3: Load balancer-assisted**

**Use external load balancer for zero-downtime**:
```bash
# Step 1: Start new server on different port
./new_server --port 8081 &

# Step 2: Load balancer starts sending traffic to both
curl -X POST http://lb/add_backend -d "host=localhost:8081"

# Step 3: Load balancer stops sending to old server
curl -X POST http://lb/drain_backend -d "host=localhost:8080"

# Step 4: Wait for old server connections to drain
# Load balancer monitors connection count

# Step 5: Stop old server
kill $(pidof old_server)
```

**State transfer for stateful servers**:
```cpp
// Serialize client state to shared memory or file
struct ClientState {
    int fd;
    std::string session_id;
    time_t last_activity;
    // ... other state
};

void serialize_state(const std::string& path) {
    std::ofstream out(path, std::ios::binary);

    size_t count = clients.size();
    out.write((char*)&count, sizeof(count));

    for (const auto& [fd, info] : clients) {
        // Write client state
        out.write((char*)&info, sizeof(info));
    }

    Logger::info("Serialized state for " + std::to_string(count) + " clients");
}

// New process loads state
void deserialize_state(const std::string& path) {
    std::ifstream in(path, std::ios::binary);

    size_t count;
    in.read((char*)&count, sizeof(count));

    for (size_t i = 0; i < count; i++) {
        ClientState state;
        in.read((char*)&state, sizeof(state));
        // Restore client state
    }

    Logger::info("Loaded state for " + std::to_string(count) + " clients");
}
```

**Comparison of approaches**:

| Approach | Complexity | Downtime | Connection loss | State transfer |
|----------|-----------|----------|----------------|----------------|
| Socket passing | High | None | None | Required |
| SO_REUSEPORT | Medium | None | None | Optional |
| Load balancer | Low | None | None | Not needed |
| Rolling restart | Low | Minimal | New connections during restart | Not needed |

**Interview tip**: Mention that **zero-downtime deploys** are critical for high-availability services, and the approach depends on stateful vs stateless servers.

---

#### Q20: How would you profile and optimize a select() server for maximum throughput? [ADVANCED]

**Tags**: #performance #profiling #optimization

**Answer**: Use perf, flamegraphs, and strace to identify bottlenecks. Optimize hot paths, reduce syscalls, leverage zero-copy, and tune kernel parameters.

**Detailed explanation**:

**Profiling workflow**:

**Step 1: Establish baseline**:
```bash
# Measure current throughput
ab -n 100000 -c 100 http://localhost:8080/

# Results:
# Requests per second: 5000 [#/sec]
# Time per request: 20.000 [ms] (mean)
```

**Step 2: CPU profiling with perf**:
```bash
# Record CPU profile for 30 seconds
perf record -g -p $(pidof select_server) -- sleep 30

# Analyze
perf report

# Example output:
# 45.00%  select_server  [kernel]  [k] select
# 20.00%  select_server  libc      [.] recv
# 15.00%  select_server  libc      [.] send
#  8.00%  select_server  select_server  [.] process_message
#  5.00%  select_server  select_server  [.] FD_ISSET
#  7.00%  select_server  select_server  [.] other
```

**Insight**: 45% time in select(), 35% in recv/send - optimize I/O path.

**Step 3: Generate flamegraph**:
```bash
perf script | stackcollapse-perf.pl | flamegraph.pl > flame.svg

# Visualize hot paths
firefox flame.svg
```

**Step 4: Syscall analysis with strace**:
```bash
strace -c -p $(pidof select_server)

# Count syscalls for 10 seconds
# Results:
# % time     seconds  usecs/call     calls    errors syscall
# ------ ----------- ----------- --------- --------- ----------------
#  50.00    0.500000          10     50000           select
#  25.00    0.250000           5     50000           recv
#  20.00    0.200000           4     50000           send
#   5.00    0.050000          50      1000           accept
```

**Optimization strategies**:

**1. Reduce select() overhead**:
```cpp
// Before: Check all FDs up to max_fd
for (int fd = 0; fd <= max_fd; fd++) {
    if (FD_ISSET(fd, &read_fds)) {
        handle_client(fd);
    }
}
// Complexity: O(max_fd)

// After: Track active FDs in set
std::set<int> active_fds;

for (int fd : active_fds) {
    if (FD_ISSET(fd, &read_fds)) {
        handle_client(fd);
    }
}
// Complexity: O(active_fds)

// Improvement: 10x faster when max_fd=1000 but only 100 active
```

**2. Batch recv() calls**:
```cpp
// Before: Small buffer, many recv() calls
char buffer[1024];
int n = recv(fd, buffer, sizeof(buffer), 0);
// 1000 bytes needs 1 recv()

// After: Large buffer, fewer recv() calls
char buffer[64 * 1024];  // 64KB
int n = recv(fd, buffer, sizeof(buffer), 0);
// 64000 bytes in 1 recv()

// Improvement: 64x fewer syscalls
```

**3. Use MSG_DONTWAIT instead of fcntl()**:
```cpp
// Before: Set non-blocking mode
fcntl(fd, F_SETFL, O_NONBLOCK);
int n = recv(fd, buffer, sizeof(buffer), 0);

// After: Use MSG_DONTWAIT flag
int n = recv(fd, buffer, sizeof(buffer), MSG_DONTWAIT);

// Improvement: Saves 1 syscall per recv()
```

**4. Minimize fd_set copying**:
```cpp
// Before: Copy entire fd_set every iteration
fd_set read_fds;
memcpy(&read_fds, &master_fds, sizeof(fd_set));  // 128 bytes

// After: Use struct assignment (compiler optimization)
fd_set read_fds = master_fds;  // Optimized by compiler

// Improvement: 2x faster memcpy
```

**5. Kernel parameter tuning**:
```bash
# Increase socket buffer sizes
sysctl -w net.core.rmem_max=16777216
sysctl -w net.core.wmem_max=16777216

# Increase socket listen backlog
sysctl -w net.core.somaxconn=4096

# Enable TCP fast open
sysctl -w net.ipv4.tcp_fastopen=3

# Reduce TIME_WAIT timeout
sysctl -w net.ipv4.tcp_fin_timeout=30
```

**6. Connection pooling**:
```cpp
// Reuse FD slots instead of close/open
std::queue<int> available_fds;

void close_connection(int fd) {
    close(fd);
    available_fds.push(fd);  // Reuse slot
}

int get_next_fd() {
    if (!available_fds.empty()) {
        int fd = available_fds.front();
        available_fds.pop();
        return fd;
    }
    return -1;  // No reusable FD
}
```

**7. Zero-copy with splice() (Linux)**:
```cpp
// Proxy: recv from client, send to backend
// Traditional:
char buffer[4096];
int n = recv(client_fd, buffer, sizeof(buffer), 0);
send(backend_fd, buffer, n, 0);  // 2 copies

// Zero-copy with splice:
splice(client_fd, NULL, pipe_fd[1], NULL, 4096, SPLICE_F_MOVE);
splice(pipe_fd[0], NULL, backend_fd, NULL, 4096, SPLICE_F_MOVE);
// 0 copies to userspace
```

**Performance measurement after optimization**:
```bash
ab -n 100000 -c 100 http://localhost:8080/

# Results:
# Requests per second: 25000 [#/sec]  ← 5x improvement!
# Time per request: 4.000 [ms] (mean)
```

**Optimization checklist**:
- ✅ Use large buffers (64KB) to reduce syscalls
- ✅ Track active FDs in set (avoid scanning all FDs)
- ✅ Use MSG_DONTWAIT instead of fcntl()
- ✅ Minimize fd_set copying
- ✅ Tune kernel parameters (socket buffers, backlog)
- ✅ Use zero-copy APIs (sendfile, splice)
- ✅ Batch operations when possible
- ✅ Profile with perf/flamegraphs to find hotspots

**Interview tip**: Emphasize that **measurement drives optimization** - always profile before optimizing, and measure improvements after.

---
