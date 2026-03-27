## TOPIC: I/O Multiplexing with select() - Event-Driven Architecture

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Q1
```cpp
#include <sys/select.h>
#include <sys/socket.h>
#include <iostream>

int main() {
    int server_fd = create_listening_socket(8080);
    fd_set master_fds;

    FD_ZERO(&master_fds);
    FD_SET(server_fd, &master_fds);

    while (true) {
        fd_set read_fds = master_fds;
        select(server_fd + 1, &read_fds, NULL, NULL, NULL);

        if (FD_ISSET(server_fd, &read_fds)) {
            int client_fd = accept(server_fd, NULL, NULL);
            FD_SET(client_fd, &master_fds);  // Bug: master_fds not used for select range
        }
    }
}
```

**Answer:**
```
select() max_fd parameter not updated - only monitors server_fd, new clients ignored
```

**Explanation:**
- `select(server_fd + 1, ...)` hardcodes max FD to server_fd + 1
- After accepting client_fd (e.g., FD 5), select() range is still server_fd + 1 (e.g., 4)
- Client FD 5 > server_fd + 1, so select() never monitors it
- Must track `max_fd` and update: `select(max_fd + 1, ...)`
- **Key Concept:** select() first parameter must be max FD in all sets + 1; hardcoding prevents monitoring dynamically added FDs

**Fixed Version:**
```cpp
int max_fd = server_fd;

while (true) {
    fd_set read_fds = master_fds;
    select(max_fd + 1, &read_fds, NULL, NULL, NULL);

    if (FD_ISSET(server_fd, &read_fds)) {
        int client_fd = accept(server_fd, NULL, NULL);
        FD_SET(client_fd, &master_fds);
        if (client_fd > max_fd) max_fd = client_fd;  // Update max!
    }
}
```

---

#### Q2
```cpp
#include <sys/select.h>
#include <sys/socket.h>
#include <vector>

int main() {
    int server_fd = create_listening_socket(8080);
    std::vector<int> clients;
    fd_set master_fds;

    FD_ZERO(&master_fds);
    FD_SET(server_fd, &master_fds);

    while (true) {
        select(FD_SETSIZE, &master_fds, NULL, NULL, NULL);  // Bug: modifies master_fds!

        if (FD_ISSET(server_fd, &master_fds)) {
            int client_fd = accept(server_fd, NULL, NULL);
            clients.push_back(client_fd);
            FD_SET(client_fd, &master_fds);
        }

        for (int client_fd : clients) {
            if (FD_ISSET(client_fd, &master_fds)) {
                char buffer[1024];
                recv(client_fd, buffer, sizeof(buffer), 0);
            }
        }
    }
}
```

**Answer:**
```
select() modifies fd_set - master_fds overwritten each iteration, loses all client FDs
```

**Explanation:**
- `select()` modifies the fd_set to indicate which FDs are ready
- After first select(), master_fds no longer contains all monitored FDs
- Second iteration: master_fds is corrupted, select() monitors nothing
- Must copy master_fds before each select(): `fd_set read_fds = master_fds;`
- **Key Concept:** select() modifies fd_set parameters; always copy master set before calling select() to preserve FD list

**Fixed Version:**
```cpp
while (true) {
    fd_set read_fds = master_fds;  // Copy master set!
    select(FD_SETSIZE, &read_fds, NULL, NULL, NULL);

    if (FD_ISSET(server_fd, &read_fds)) {
        int client_fd = accept(server_fd, NULL, NULL);
        clients.push_back(client_fd);
        FD_SET(client_fd, &master_fds);
    }

    for (int client_fd : clients) {
        if (FD_ISSET(client_fd, &read_fds)) {  // Check read_fds, not master_fds
            char buffer[1024];
            recv(client_fd, buffer, sizeof(buffer), 0);
        }
    }
}
```

---

#### Q3
```cpp
#include <sys/select.h>
#include <sys/socket.h>
#include <unistd.h>

int main() {
    int server_fd = create_listening_socket(8080);
    fd_set master_fds;
    FD_ZERO(&master_fds);
    FD_SET(server_fd, &master_fds);
    int max_fd = server_fd;

    while (true) {
        fd_set read_fds = master_fds;
        select(max_fd + 1, &read_fds, NULL, NULL, NULL);

        for (int fd = 0; fd <= max_fd; fd++) {
            if (FD_ISSET(fd, &read_fds)) {
                if (fd == server_fd) {
                    int client_fd = accept(server_fd, NULL, NULL);
                    FD_SET(client_fd, &master_fds);
                    if (client_fd > max_fd) max_fd = client_fd;
                } else {
                    char buffer[1024];
                    int n = recv(fd, buffer, sizeof(buffer), 0);
                    if (n == 0) {
                        close(fd);  // Bug: forgot FD_CLR!
                    }
                }
            }
        }
    }
}
```

**Answer:**
```
Closed FD not removed from master_fds - select() monitors closed FD forever (busy loop or errors)
```

**Explanation:**
- `close(fd)` releases FD, but `master_fds` still contains it
- Next select() returns immediately saying FD is ready (EOF condition persists)
- Infinite loop: select() → FD ready → recv() returns 0 → close() → select() → repeat
- Must call `FD_CLR(fd, &master_fds)` before close()
- **Key Concept:** Always FD_CLR() closed FDs from master set; failing to remove causes select() to immediately return for closed FD

**Fixed Version:**
```cpp
if (n == 0) {
    FD_CLR(fd, &master_fds);  // Remove from master set!
    close(fd);
    // Also recalculate max_fd if fd == max_fd
}
```

---

#### Q4
```cpp
#include <sys/select.h>
#include <sys/socket.h>

int main() {
    int server_fd = create_listening_socket(8080);

    if (server_fd >= FD_SETSIZE) {
        std::cerr << "Server FD too large!\n";
        return 1;
    }

    fd_set master_fds;
    FD_ZERO(&master_fds);
    FD_SET(server_fd, &master_fds);

    while (true) {
        fd_set read_fds = master_fds;
        select(FD_SETSIZE, &read_fds, NULL, NULL, NULL);

        if (FD_ISSET(server_fd, &read_fds)) {
            int client_fd = accept(server_fd, NULL, NULL);
            // No check for FD_SETSIZE!
            FD_SET(client_fd, &master_fds);  // Bug: overflow if client_fd >= FD_SETSIZE
        }
    }
}
```

**Answer:**
```
Buffer overflow if client_fd >= FD_SETSIZE - corrupts memory or crashes
```

**Explanation:**
- `FD_SETSIZE` is typically 1024 on Linux
- If client_fd >= 1024, `FD_SET()` writes beyond fd_set buffer bounds
- Causes memory corruption, crashes, or undefined behavior
- Must check `if (client_fd >= FD_SETSIZE)` and reject connection
- **Key Concept:** select() and fd_set limited to FD_SETSIZE (typically 1024); always check FD < FD_SETSIZE before FD_SET to prevent buffer overflow

**Fixed Version:**
```cpp
if (FD_ISSET(server_fd, &read_fds)) {
    int client_fd = accept(server_fd, NULL, NULL);

    if (client_fd >= FD_SETSIZE) {
        std::cerr << "FD " << client_fd << " exceeds FD_SETSIZE\n";
        send(client_fd, "503 Server Full\r\n", 17, 0);
        close(client_fd);
    } else {
        FD_SET(client_fd, &master_fds);
        if (client_fd > max_fd) max_fd = client_fd;
    }
}
```

---

#### Q5
```cpp
#include <sys/select.h>
#include <sys/time.h>
#include <time.h>
#include <iostream>

int main() {
    fd_set master_fds;
    FD_ZERO(&master_fds);

    struct timeval timeout;
    timeout.tv_sec = 10;
    timeout.tv_usec = 0;

    while (true) {
        fd_set read_fds = master_fds;
        int ready = select(max_fd + 1, &read_fds, NULL, NULL, &timeout);

        if (ready == 0) {
            std::cout << "10 seconds elapsed\n";
            send_pings_to_all_clients();
        }

        // Handle ready FDs...
    }
}
```

**Answer:**
```
timeout not reset each iteration - after first timeout, select() polls (timeout becomes {0,0})
```

**Explanation:**
- On Linux, `select()` modifies timeout to remaining time
- After first 10s timeout, timeout becomes {0, 0}
- Subsequent select() calls poll (return immediately) - busy loop
- Must reset timeout before each select(): `timeout = {10, 0};`
- **Key Concept:** select() modifies timeout on Linux to show remaining time; reset timeout before each select() to maintain consistent interval

**Fixed Version:**
```cpp
while (true) {
    struct timeval timeout;  // Declare inside loop!
    timeout.tv_sec = 10;
    timeout.tv_usec = 0;

    fd_set read_fds = master_fds;
    int ready = select(max_fd + 1, &read_fds, NULL, NULL, &timeout);

    if (ready == 0) {
        std::cout << "10 seconds elapsed\n";
        send_pings_to_all_clients();
    }
}
```

---

#### Q6
```cpp
#include <sys/select.h>
#include <sys/socket.h>
#include <map>
#include <string>

std::map<int, std::string> write_buffers;

void broadcast(const std::string& message, fd_set& master_write_fds) {
    for (auto& [fd, buffer] : write_buffers) {
        int sent = send(fd, message.c_str(), message.size(), 0);

        if (sent < message.size()) {
            buffer += message.substr(sent);  // Queue remainder
            FD_SET(fd, &master_write_fds);    // Monitor for writability
        }
    }
}

int main() {
    // ... select() loop

    for (int fd : ready_write_fds) {
        std::string& buffer = write_buffers[fd];
        int sent = send(fd, buffer.c_str(), buffer.size(), 0);

        buffer = buffer.substr(sent);  // Remove sent portion

        // Bug: forgot to FD_CLR when buffer empty!
    }
}
```

**Answer:**
```
FD never removed from master_write_fds after buffer empty - busy loop (select() always returns FD as writable)
```

**Explanation:**
- After buffer empties, FD remains in master_write_fds
- Sockets are almost always writable - select() returns immediately
- Infinite busy loop: select() → FD writable → buffer empty → select() → repeat
- Must `FD_CLR(fd, &master_write_fds)` when buffer becomes empty
- **Key Concept:** Writable sockets always trigger select(); FD_CLR from writefds when no data to send to prevent busy loop

**Fixed Version:**
```cpp
for (int fd : ready_write_fds) {
    std::string& buffer = write_buffers[fd];
    int sent = send(fd, buffer.c_str(), buffer.size(), 0);

    buffer = buffer.substr(sent);

    if (buffer.empty()) {
        FD_CLR(fd, &master_write_fds);  // No more data to send!
    }
}
```

---

#### Q7
```cpp
#include <sys/select.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <map>
#include <string>

std::map<std::string, int> connections_per_ip;

int main() {
    while (true) {
        // ... select() detects server_fd ready

        sockaddr_in client_addr;
        socklen_t addr_len = sizeof(client_addr);
        int client_fd = accept(server_fd, (sockaddr*)&client_addr, &addr_len);

        std::string ip = inet_ntoa(client_addr.sin_addr);

        connections_per_ip[ip]++;  // Track connections

        if (connections_per_ip[ip] > 5) {
            send(client_fd, "429 Too Many Requests\r\n", 23, 0);
            close(client_fd);
            // Bug: forgot to decrement counter!
        }
    }
}
```

**Answer:**
```
Counter incremented but not decremented on rejection - IP permanently blocked after 5 rejections
```

**Explanation:**
- `connections_per_ip[ip]++` increments counter before validation
- Rejection closes connection but counter stays incremented
- After 5 rejections, counter = 5, future connections always rejected
- Should increment only if connection accepted
- **Key Concept:** Increment connection counters only after accepting connection; otherwise rejected connections permanently count against limit

**Fixed Version:**
```cpp
std::string ip = inet_ntoa(client_addr.sin_addr);

if (connections_per_ip[ip] >= 5) {
    send(client_fd, "429 Too Many Requests\r\n", 23, 0);
    close(client_fd);
} else {
    connections_per_ip[ip]++;  // Increment only on accept!
    FD_SET(client_fd, &master_fds);
}

// Also: decrement on disconnect
// connections_per_ip[client_ips[fd]]--;
```

---

#### Q8
```cpp
#include <sys/select.h>
#include <sys/socket.h>
#include <map>
#include <string>

std::map<int, std::string> partial_messages;

void handle_client_data(int fd) {
    char buffer[1024];
    int n = recv(fd, buffer, sizeof(buffer), 0);

    if (n > 0) {
        partial_messages[fd].append(buffer, n);  // Accumulate data

        size_t pos;
        while ((pos = partial_messages[fd].find('\n')) != std::string::npos) {
            std::string line = partial_messages[fd].substr(0, pos);
            process_command(line);
            partial_messages[fd].erase(0, pos + 1);
        }
    } else if (n == 0) {
        close(fd);
        FD_CLR(fd, &master_fds);
        // Bug: forgot to clean up partial_messages!
    }
}
```

**Answer:**
```
Memory leak - partial_messages[fd] never erased on disconnect
```

**Explanation:**
- Each client's partial data stored in `partial_messages[fd]`
- On disconnect, FD closed and removed from master_fds
- But `partial_messages[fd]` entry remains forever - memory leak
- After 10,000 clients, map has 10,000 entries with orphaned strings
- **Key Concept:** Clean up all per-client state (buffers, maps, metadata) on disconnect to prevent memory leaks

**Fixed Version:**
```cpp
} else if (n == 0) {
    partial_messages.erase(fd);  // Clean up buffer!
    write_buffers.erase(fd);      // Clean up any other state
    FD_CLR(fd, &master_fds);
    close(fd);
}
```

---

#### Q9
```cpp
#include <sys/select.h>
#include <signal.h>
#include <atomic>

std::atomic<bool> keep_running{true};

void sigint_handler(int sig) {
    keep_running = false;
}

int main() {
    signal(SIGINT, sigint_handler);

    while (keep_running) {
        fd_set read_fds = master_fds;
        select(max_fd + 1, &read_fds, NULL, NULL, NULL);  // Blocks!

        // Handle ready FDs...
    }

    // Graceful shutdown
    for (int fd : active_clients) {
        send(fd, "Server shutting down\n", 21, 0);
        close(fd);
    }
}
```

**Answer:**
```
select() blocks indefinitely even after signal - shutdown delayed until next FD activity
```

**Explanation:**
- `keep_running = false` set by signal handler
- But select() remains blocked waiting for FD activity
- Loop condition `while (keep_running)` not checked until select() returns
- Server doesn't shut down until a client connects or sends data
- **Key Concept:** Use select() timeout or pselect() with signal mask for timely signal response; blocking select() delays signal handling until FD activity

**Fixed Version:**
```cpp
while (keep_running) {
    struct timeval timeout = {1, 0};  // 1 second timeout
    fd_set read_fds = master_fds;
    int ready = select(max_fd + 1, &read_fds, NULL, NULL, &timeout);

    if (ready < 0 && errno == EINTR) continue;  // Signal interrupted

    // Handle ready FDs...
}
```

**Alternative (pselect):**
```cpp
sigset_t mask, oldmask;
sigemptyset(&mask);
sigaddset(&mask, SIGINT);
sigprocmask(SIG_BLOCK, &mask, &oldmask);

while (keep_running) {
    fd_set read_fds = master_fds;
    struct timespec timeout = {1, 0};
    pselect(max_fd + 1, &read_fds, NULL, NULL, &timeout, &oldmask);
    // Signal can interrupt pselect atomically
}
```

---

#### Q10
```cpp
#include <sys/select.h>
#include <sys/socket.h>
#include <sys/sendfile.h>
#include <fcntl.h>

void send_file(int client_fd, const char* filename) {
    int file_fd = open(filename, O_RDONLY);
    off_t offset = 0;
    struct stat st;
    fstat(file_fd, &st);
    size_t remaining = st.st_size;

    while (remaining > 0) {
        ssize_t sent = sendfile(client_fd, file_fd, &offset, remaining);

        if (sent < 0) {
            perror("sendfile");
            break;  // Bug: file_fd not closed on error!
        }

        remaining -= sent;
    }

    close(file_fd);
}

int main() {
    // ... select() loop

    if (command == "GET") {
        send_file(client_fd, filename);  // Blocks if client slow!
    }
}
```

**Answer:**
```
sendfile() blocks if client slow - starves other clients (defeats select() purpose)
```

**Explanation:**
- `sendfile()` blocks until data sent to kernel buffer
- Slow client (or full TCP window) causes sendfile() to block
- While blocked, server cannot handle other clients - defeats select() multiplexing
- Must use non-blocking sockets and handle EAGAIN/EWOULDBLOCK
- **Key Concept:** Use non-blocking I/O with select(); blocking sendfile() defeats multiplexing - must handle EAGAIN and resume via writefds monitoring

**Fixed Version:**
```cpp
int flags = fcntl(client_fd, F_GETFL, 0);
fcntl(client_fd, F_SETFL, flags | O_NONBLOCK);  // Non-blocking!

while (remaining > 0) {
    ssize_t sent = sendfile(client_fd, file_fd, &offset, remaining);

    if (sent < 0) {
        if (errno == EAGAIN || errno == EWOULDBLOCK) {
            // Would block - add to writefds and return
            FD_SET(client_fd, &master_write_fds);
            // Save state to resume later
            file_states[client_fd] = {file_fd, offset, remaining};
            return;
        }
        perror("sendfile");
        close(file_fd);
        return;
    }

    remaining -= sent;
}

close(file_fd);
```

---

#### Q11
```cpp
#include <sys/select.h>
#include <sys/socket.h>
#include <map>

std::map<int, std::string> write_buffers;

void broadcast(const std::string& message) {
    for (auto& [fd, buffer] : write_buffers) {
        buffer += message;  // Append to buffer
        // Will be sent when select() says FD writable
    }
}

int main() {
    while (true) {
        // ... lots of broadcast() calls

        broadcast("PING\n");
        broadcast("UPDATE: ...\n");
        broadcast("ALERT: ...\n");

        // Buffers grow unbounded!
    }
}
```

**Answer:**
```
Unbounded buffer growth - slow client causes memory exhaustion (OOM killer or crash)
```

**Explanation:**
- Fast broadcasts append to `write_buffers[fd]` faster than send()
- Slow client (or network congestion) prevents buffer draining
- Buffer grows: 1KB → 1MB → 100MB → OOM
- Must limit per-client buffer size and disconnect on overflow
- **Key Concept:** Limit per-client send buffer size; disconnect slow clients exceeding limit to prevent memory exhaustion from unbounded queuing

**Fixed Version:**
```cpp
const size_t MAX_WRITE_BUFFER = 1024 * 1024;  // 1MB per client

void broadcast(const std::string& message) {
    for (auto& [fd, buffer] : write_buffers) {
        if (buffer.size() + message.size() > MAX_WRITE_BUFFER) {
            std::cerr << "Client " << fd << " buffer full, disconnecting\n";
            FD_CLR(fd, &master_fds);
            FD_CLR(fd, &master_write_fds);
            close(fd);
            write_buffers.erase(fd);
        } else {
            buffer += message;
            FD_SET(fd, &master_write_fds);
        }
    }
}
```

---

#### Q12
```cpp
#include <sys/select.h>
#include <sys/socket.h>
#include <time.h>
#include <map>

std::map<int, time_t> last_activity;

void disconnect_idle_clients(fd_set& master_fds) {
    time_t now = time(NULL);

    for (auto& [fd, last_seen] : last_activity) {
        if (now - last_seen > 60) {  // 60 seconds idle
            send(fd, "Timeout\n", 8, 0);
            close(fd);
            FD_CLR(fd, &master_fds);
            last_activity.erase(fd);  // Bug: iterator invalidation!
        }
    }
}
```

**Answer:**
```
Iterator invalidation - erase() during iteration causes undefined behavior (crash or corruption)
```

**Explanation:**
- Range-based for loop uses iterators internally
- `last_activity.erase(fd)` invalidates current iterator
- Continuing iteration after invalidation is undefined behavior
- May crash, skip entries, or corrupt map
- **Key Concept:** Never modify container while iterating; collect items to remove first, then erase after iteration

**Fixed Version:**
```cpp
void disconnect_idle_clients(fd_set& master_fds) {
    time_t now = time(NULL);
    std::vector<int> to_disconnect;

    // Collect FDs to disconnect
    for (auto& [fd, last_seen] : last_activity) {
        if (now - last_seen > 60) {
            to_disconnect.push_back(fd);
        }
    }

    // Disconnect after iteration
    for (int fd : to_disconnect) {
        send(fd, "Timeout\n", 8, 0);
        close(fd);
        FD_CLR(fd, &master_fds);
        last_activity.erase(fd);  // Safe - not iterating
    }
}
```

---
