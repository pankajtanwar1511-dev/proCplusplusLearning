## TOPIC: poll() - Scalable I/O Multiplexing Without FD Limits

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Q1
```cpp
#include <poll.h>
#include <sys/socket.h>
#include <vector>

int main() {
    std::vector<struct pollfd> fds;
    fds.push_back({server_fd, POLLIN, 0});

    while (true) {
        int ready = poll(fds.data(), fds.size(), -1);

        if (fds[0].revents & POLLIN) {
            int client_fd = accept(server_fd, NULL, NULL);
            fds.push_back({client_fd, POLLIN, 0});  // Bug: server_fd index no longer 0!
        }

        // Handle client fds[1..n] data
        for (size_t i = 1; i < fds.size(); i++) {
            if (fds[i].revents & POLLIN) {
                char buffer[1024];
                recv(fds[i].fd, buffer, sizeof(buffer), 0);
            }
        }
    }
}
```

**Answer:**
```
Vector reallocation invalidates index assumptions - fds[0] may no longer be server_fd after push_back
```

**Explanation:**
- `fds.push_back()` may reallocate vector storage
- After reallocation, element addresses change but logic assumes `fds[0] == server_fd`
- If vector grows, hardcoded index 0 no longer guaranteed to be server
- Better: check `fds[i].fd == server_fd` instead of assuming index
- **Key Concept:** Never assume vector indices remain constant across push_back(); reallocation invalidates index-based assumptions

**Fixed Version:**
```cpp
for (size_t i = 0; i < fds.size(); i++) {
    if (fds[i].revents & POLLIN) {
        if (fds[i].fd == server_fd) {  // Check FD, not index!
            int client_fd = accept(server_fd, NULL, NULL);
            fds.push_back({client_fd, POLLIN, 0});
        } else {
            char buffer[1024];
            recv(fds[i].fd, buffer, sizeof(buffer), 0);
        }
    }
}
```

---

#### Q2
```cpp
#include <poll.h>
#include <sys/socket.h>
#include <vector>
#include <unistd.h>

int main() {
    std::vector<struct pollfd> fds;
    fds.push_back({server_fd, POLLIN, 0});

    while (true) {
        poll(fds.data(), fds.size(), -1);

        for (size_t i = 0; i < fds.size(); i++) {
            if (fds[i].revents & POLLIN) {
                if (fds[i].fd == server_fd) {
                    int client_fd = accept(server_fd, NULL, NULL);
                    fds.push_back({client_fd, POLLIN, 0});
                } else {
                    char buffer[1024];
                    int n = recv(fds[i].fd, buffer, sizeof(buffer), 0);
                    if (n == 0) {
                        close(fds[i].fd);
                        fds.erase(fds.begin() + i);  // Bug: iterator invalidation!
                    }
                }
            }
        }
    }
}
```

**Answer:**
```
Iterator invalidation - erase() shifts elements, loop skips next client
```

**Explanation:**
- `fds.erase(fds.begin() + i)` removes element at index i
- Elements after i shift left: fds[i+1] becomes fds[i]
- Loop increments i, skipping the element that shifted into position i
- Next client never processed if previous client disconnects
- **Key Concept:** Decrement loop counter after erase() or iterate backwards to avoid skipping shifted elements

**Fixed Version:**
```cpp
for (size_t i = 0; i < fds.size(); ) {  // No i++ here!
    if (fds[i].revents & POLLIN) {
        if (fds[i].fd == server_fd) {
            int client_fd = accept(server_fd, NULL, NULL);
            fds.push_back({client_fd, POLLIN, 0});
            i++;
        } else {
            char buffer[1024];
            int n = recv(fds[i].fd, buffer, sizeof(buffer), 0);
            if (n == 0) {
                close(fds[i].fd);
                fds.erase(fds.begin() + i);  // Don't increment i!
            } else {
                i++;
            }
        }
    } else {
        i++;
    }
}
```

---

#### Q3
```cpp
#include <poll.h>
#include <sys/socket.h>
#include <vector>

int main() {
    std::vector<struct pollfd> fds;
    fds.push_back({server_fd, POLLIN, 0});
    const int MAX_CLIENTS = 5;
    int client_count = 0;

    while (true) {
        poll(fds.data(), fds.size(), -1);

        for (auto& pfd : fds) {
            if (pfd.revents & POLLIN) {
                if (pfd.fd == server_fd) {
                    int client_fd = accept(server_fd, NULL, NULL);

                    client_count++;  // Increment before check!

                    if (client_count > MAX_CLIENTS) {
                        send(client_fd, "503 Server Full\r\n", 17, 0);
                        close(client_fd);
                        // Bug: client_count not decremented!
                    } else {
                        fds.push_back({client_fd, POLLIN, 0});
                    }
                }
            }
        }
    }
}
```

**Answer:**
```
Counter incremented but not decremented on rejection - permanently blocks after 5 rejections
```

**Explanation:**
- `client_count++` increments before validation check
- Rejected connections increment counter but never decrement it
- After 5 rejections, `client_count > MAX_CLIENTS` forever
- All subsequent connections rejected even if no clients connected
- **Key Concept:** Increment counters only after successful resource allocation; pre-increment causes permanent blocking after failed attempts

**Fixed Version:**
```cpp
if (pfd.fd == server_fd) {
    int client_fd = accept(server_fd, NULL, NULL);

    if (client_count >= MAX_CLIENTS) {  // Check BEFORE increment!
        send(client_fd, "503 Server Full\r\n", 17, 0);
        close(client_fd);
    } else {
        client_count++;  // Increment only on success!
        fds.push_back({client_fd, POLLIN, 0});
    }
}

// Also: decrement on disconnect
// if (n == 0) { client_count--; ... }
```

---

#### Q4
```cpp
#include <poll.h>
#include <sys/socket.h>
#include <map>
#include <time.h>

std::map<int, time_t> last_activity;

void kick_idle_clients(std::vector<struct pollfd>& fds) {
    time_t now = time(NULL);

    for (auto& [fd, last_seen] : last_activity) {
        if (now - last_seen > 30) {
            send(fd, "Timeout\n", 8, 0);
            close(fd);

            // Bug: remove from fds vector!
            for (size_t i = 0; i < fds.size(); i++) {
                if (fds[i].fd == fd) {
                    fds.erase(fds.begin() + i);
                    break;
                }
            }

            last_activity.erase(fd);  // Iterator invalidation!
        }
    }
}
```

**Answer:**
```
Iterator invalidation - erase() during iteration causes undefined behavior
```

**Explanation:**
- Range-based for loop uses iterators over `last_activity` map
- `last_activity.erase(fd)` invalidates the current iterator
- Continuing loop after invalidation is undefined behavior
- May crash, skip entries, or corrupt map
- **Key Concept:** Never modify container while iterating with range-based for; collect keys to erase then erase after iteration completes

**Fixed Version:**
```cpp
void kick_idle_clients(std::vector<struct pollfd>& fds) {
    time_t now = time(NULL);
    std::vector<int> to_kick;

    // Collect FDs to kick
    for (auto& [fd, last_seen] : last_activity) {
        if (now - last_seen > 30) {
            to_kick.push_back(fd);
        }
    }

    // Kick after iteration
    for (int fd : to_kick) {
        send(fd, "Timeout\n", 8, 0);
        close(fd);

        for (size_t i = 0; i < fds.size(); i++) {
            if (fds[i].fd == fd) {
                fds.erase(fds.begin() + i);
                break;
            }
        }

        last_activity.erase(fd);  // Safe now
    }
}
```

---

#### Q5
```cpp
#include <poll.h>
#include <sys/socket.h>
#include <fcntl.h>
#include <map>
#include <queue>

std::map<int, std::queue<std::string>> write_queues;

void queue_send(int fd, const std::string& data, std::vector<struct pollfd>& fds) {
    write_queues[fd].push(data);

    // Enable POLLOUT monitoring
    for (auto& pfd : fds) {
        if (pfd.fd == fd) {
            pfd.events |= POLLOUT;  // Bug: already has POLLIN, OR is correct BUT...
            break;
        }
    }
}

int main() {
    while (true) {
        poll(fds.data(), fds.size(), -1);

        for (auto& pfd : fds) {
            if (pfd.revents & POLLOUT) {
                auto& queue = write_queues[pfd.fd];
                std::string& data = queue.front();

                int sent = send(pfd.fd, data.c_str(), data.size(), 0);
                data = data.substr(sent);

                if (data.empty()) {
                    queue.pop();
                }

                if (queue.empty()) {
                    // Bug: forgot to remove POLLOUT!
                }
            }
        }
    }
}
```

**Answer:**
```
POLLOUT not disabled when queue empty - busy loop (poll() always returns immediately for writable sockets)
```

**Explanation:**
- Writable sockets always trigger POLLOUT event
- After queue empties, POLLOUT still monitored
- poll() returns immediately saying socket writable - busy loop
- Must clear POLLOUT bit: `pfd.events &= ~POLLOUT;`
- **Key Concept:** Always disable POLLOUT monitoring when no data to send; writable sockets cause busy loop if continuously monitored

**Fixed Version:**
```cpp
if (queue.empty()) {
    // Disable POLLOUT monitoring
    for (auto& pfd : fds) {
        if (pfd.fd == fd) {
            pfd.events &= ~POLLOUT;  // Clear POLLOUT bit!
            break;
        }
    }
}
```

---

#### Q6
```cpp
#include <poll.h>
#include <sys/socket.h>
#include <map>
#include <time.h>

struct ClientState {
    size_t bytes_sent_this_second = 0;
    time_t second_start = 0;
};

std::map<int, ClientState> clients;
const size_t MAX_RATE = 10240;  // 10 KB/s

void handle_send(int fd, const std::string& data) {
    ClientState& client = clients[fd];
    time_t now = time(NULL);

    if (now > client.second_start) {
        client.second_start = now;
        client.bytes_sent_this_second = 0;  // Reset counter
    }

    if (client.bytes_sent_this_second >= MAX_RATE) {
        // Rate limit exceeded - skip send
        return;  // Bug: data lost!
    }

    int sent = send(fd, data.c_str(), data.size(), 0);
    client.bytes_sent_this_second += sent;
}
```

**Answer:**
```
Data lost when rate limited - should queue data, not drop it
```

**Explanation:**
- When rate limit exceeded, function returns without queuing data
- Data permanently lost - client never receives it
- Should queue data and enable POLLOUT for next second
- Alternative: sleep/delay (blocks) or return partial success
- **Key Concept:** Rate limiting should defer data (queue it), not drop it; dropping causes data loss and protocol violations

**Fixed Version:**
```cpp
std::map<int, std::queue<std::string>> write_queues;

void handle_send(int fd, const std::string& data, std::vector<struct pollfd>& fds) {
    ClientState& client = clients[fd];
    time_t now = time(NULL);

    if (now > client.second_start) {
        client.second_start = now;
        client.bytes_sent_this_second = 0;
    }

    if (client.bytes_sent_this_second >= MAX_RATE) {
        // Queue for later
        write_queues[fd].push(data);
        enable_pollout(fd, fds);
        return;
    }

    int sent = send(fd, data.c_str(), data.size(), 0);
    if (sent < data.size()) {
        // Partial send - queue remainder
        write_queues[fd].push(data.substr(sent));
        enable_pollout(fd, fds);
    }
    client.bytes_sent_this_second += sent;
}
```

---

#### Q7
```cpp
#include <poll.h>
#include <sys/socket.h>
#include <map>
#include <string>

std::map<int, std::string> request_buffers;

void handle_client_data(int fd) {
    char buffer[1024];
    int n = recv(fd, buffer, sizeof(buffer), 0);

    request_buffers[fd].append(buffer, n);  // Bug: n could be -1 or 0!

    size_t pos = request_buffers[fd].find("\r\n\r\n");
    if (pos != std::string::npos) {
        std::string request = request_buffers[fd].substr(0, pos);
        process_request(fd, request);
        request_buffers[fd].clear();
    }
}
```

**Answer:**
```
Buffer corruption when recv() returns 0 or -1 - undefined behavior (negative size or wrong data)
```

**Explanation:**
- `recv()` returns 0 on EOF, -1 on error
- `append(buffer, -1)` or `append(buffer, 0)` is undefined behavior
- Negative size treated as very large unsigned value - memory corruption
- Must check `n > 0` before appending
- **Key Concept:** Always validate recv() return value before using it; negative/zero values cause undefined behavior when used as size

**Fixed Version:**
```cpp
void handle_client_data(int fd, std::vector<struct pollfd>& fds) {
    char buffer[1024];
    int n = recv(fd, buffer, sizeof(buffer), 0);

    if (n > 0) {
        request_buffers[fd].append(buffer, n);

        size_t pos = request_buffers[fd].find("\r\n\r\n");
        if (pos != std::string::npos) {
            std::string request = request_buffers[fd].substr(0, pos);
            process_request(fd, request);
            request_buffers[fd].clear();
        }
    } else if (n == 0) {
        // EOF - client disconnected
        request_buffers.erase(fd);
        remove_from_fds(fd, fds);
        close(fd);
    } else {
        // Error
        perror("recv");
    }
}
```

---

#### Q8
```cpp
#include <poll.h>
#include <sys/socket.h>
#include <atomic>

std::atomic<uint64_t> total_connections{0};
std::atomic<uint64_t> bytes_sent{0};

void metrics_endpoint(int client_fd) {
    std::ostringstream response;
    response << "total_connections " << total_connections << "\n";
    response << "bytes_sent " << bytes_sent << "\n";

    std::string data = response.str();
    send(client_fd, data.c_str(), data.size(), 0);
    close(client_fd);
}

int main() {
    int metrics_server = create_listening_socket(9090);
    int app_server = create_listening_socket(8080);

    std::vector<struct pollfd> fds;
    fds.push_back({app_server, POLLIN, 0});
    fds.push_back({metrics_server, POLLIN, 0});

    while (true) {
        poll(fds.data(), fds.size(), -1);

        for (auto& pfd : fds) {
            if (pfd.revents & POLLIN) {
                if (pfd.fd == metrics_server) {
                    int client = accept(metrics_server, NULL, NULL);
                    metrics_endpoint(client);  // Blocking call!
                }
                // Handle app_server...
            }
        }
    }
}
```

**Answer:**
```
Blocking metrics_endpoint() starves application server - clients cannot connect during metrics query
```

**Explanation:**
- `metrics_endpoint()` sends data and doesn't return until complete
- If metrics response is large or client slow, blocks entire event loop
- Application server cannot accept new connections while blocked
- poll() multiplexing defeated by blocking operation
- **Key Concept:** Never block in poll() event loop; add metrics clients to poll array for non-blocking send

**Fixed Version:**
```cpp
if (pfd.fd == metrics_server) {
    int client = accept(metrics_server, NULL, NULL);

    // Prepare response
    std::string response = generate_metrics();

    // Queue for non-blocking send
    write_queues[client].push(response);
    fds.push_back({client, POLLOUT, 0});  // Add to poll array
}

// Later, when POLLOUT triggered, send data
if (pfd.revents & POLLOUT) {
    // Send data from write_queues[pfd.fd]
    // Close when queue empty
}
```

---

#### Q9
```cpp
#include <poll.h>
#include <signal.h>
#include <atomic>

std::atomic<bool> keep_running{true};

void sigint_handler(int sig) {
    keep_running = false;
}

int main() {
    signal(SIGINT, sigint_handler);

    while (keep_running) {
        int ready = poll(fds.data(), fds.size(), -1);  // Blocks indefinitely!

        // Handle events...
    }

    // Graceful shutdown
    for (auto& pfd : fds) {
        if (pfd.fd != server_fd) {
            send(pfd.fd, "Server shutting down\n", 21, 0);
            close(pfd.fd);
        }
    }
}
```

**Answer:**
```
poll() blocks indefinitely after signal - shutdown delayed until next event
```

**Explanation:**
- Signal sets `keep_running = false`
- But poll() remains blocked waiting for events
- Loop condition not checked until poll() returns
- Server doesn't shut down until client connects/sends data
- **Key Concept:** Use poll() timeout (not -1) for timely signal response; blocking poll() delays signal handling until event occurs

**Fixed Version:**
```cpp
while (keep_running) {
    int ready = poll(fds.data(), fds.size(), 1000);  // 1 second timeout

    if (ready < 0 && errno == EINTR) {
        continue;  // Signal interrupted
    }

    // Handle events...
}
```

**Alternative (ppoll with signal mask):**
```cpp
sigset_t mask, oldmask;
sigemptyset(&mask);
sigaddset(&mask, SIGINT);
sigprocmask(SIG_BLOCK, &mask, &oldmask);

while (keep_running) {
    struct timespec timeout = {1, 0};
    int ready = ppoll(fds.data(), fds.size(), &timeout, &oldmask);
    // Signal can interrupt ppoll atomically
}
```

---

#### Q10
```cpp
#include <poll.h>
#include <sys/socket.h>
#include <fcntl.h>
#include <unistd.h>

void send_file(int client_fd, const char* filename) {
    int file_fd = open(filename, O_RDONLY);

    char buffer[65536];
    while (true) {
        ssize_t bytes_read = read(file_fd, buffer, sizeof(buffer));
        if (bytes_read <= 0) break;

        send(client_fd, buffer, bytes_read, 0);  // Blocks if client slow!
    }

    close(file_fd);
    send(client_fd, "\r\n--EOF--\r\n", 11, 0);
}

int main() {
    // poll() loop
    if (command == "SEND") {
        send_file(client_fd, filename);  // Blocks entire server!
    }
}
```

**Answer:**
```
Blocking send() starves other clients - defeats poll() multiplexing
```

**Explanation:**
- `send()` blocks if client TCP receive buffer full
- Slow client (or network) causes send() to block
- While blocked, cannot process other clients - defeats poll()
- Must use non-blocking sockets and POLLOUT monitoring
- **Key Concept:** Use non-blocking I/O in poll() loops; blocking send() defeats multiplexing - queue data and use POLLOUT

**Fixed Version:**
```cpp
struct FileTransfer {
    int file_fd;
    std::string buffer;
    bool eof = false;
};

std::map<int, FileTransfer> transfers;

void start_file_transfer(int client_fd, const char* filename, std::vector<struct pollfd>& fds) {
    int file_fd = open(filename, O_RDONLY);
    fcntl(client_fd, F_SETFL, O_NONBLOCK);  // Non-blocking!

    transfers[client_fd] = {file_fd, "", false};

    // Enable POLLOUT monitoring
    for (auto& pfd : fds) {
        if (pfd.fd == client_fd) {
            pfd.events |= POLLOUT;
            break;
        }
    }
}

// In poll loop
if (pfd.revents & POLLOUT) {
    auto& transfer = transfers[pfd.fd];

    if (transfer.buffer.empty() && !transfer.eof) {
        char buffer[65536];
        ssize_t n = read(transfer.file_fd, buffer, sizeof(buffer));
        if (n > 0) {
            transfer.buffer.assign(buffer, n);
        } else {
            transfer.buffer = "\r\n--EOF--\r\n";
            transfer.eof = true;
            close(transfer.file_fd);
        }
    }

    int sent = send(pfd.fd, transfer.buffer.c_str(), transfer.buffer.size(), 0);
    if (sent > 0) {
        transfer.buffer = transfer.buffer.substr(sent);
        if (transfer.buffer.empty() && transfer.eof) {
            // Transfer complete
            transfers.erase(pfd.fd);
            pfd.events &= ~POLLOUT;
        }
    }
}
```

---

#### Q11
```cpp
#include <poll.h>
#include <sys/socket.h>
#include <sys/sendfile.h>
#include <fcntl.h>

void send_file_optimized(int client_fd, const char* filename) {
    int file_fd = open(filename, O_RDONLY);
    struct stat st;
    fstat(file_fd, &st);

    off_t offset = 0;
    while (offset < st.st_size) {
        ssize_t sent = sendfile(client_fd, file_fd, &offset, st.st_size - offset);
        // Bug: no error checking for EAGAIN!
        if (sent < 0) {
            perror("sendfile");
            break;
        }
    }

    close(file_fd);
}
```

**Answer:**
```
sendfile() EAGAIN not handled - fails on non-blocking sockets
```

**Explanation:**
- `sendfile()` returns -1 with EAGAIN when socket would block
- Code treats EAGAIN as error and breaks loop
- File transfer incomplete - client receives partial data
- Must check `errno == EAGAIN` and retry with POLLOUT
- **Key Concept:** sendfile() on non-blocking sockets returns EAGAIN; must check errno and retry with POLLOUT monitoring like regular send()

**Fixed Version:**
```cpp
while (offset < st.st_size) {
    ssize_t sent = sendfile(client_fd, file_fd, &offset, st.st_size - offset);

    if (sent < 0) {
        if (errno == EAGAIN || errno == EWOULDBLOCK) {
            // Save state and resume via POLLOUT
            file_transfers[client_fd] = {file_fd, offset, st.st_size};
            enable_pollout(client_fd, fds);
            return;
        }
        perror("sendfile");
        close(file_fd);
        return;
    }
}

close(file_fd);
```

---

#### Q12
```cpp
#include <poll.h>
#include <sys/socket.h>
#include <vector>

int main() {
    std::vector<struct pollfd> fds;

    while (true) {
        poll(fds.data(), fds.size(), 1000);

        // Process events...

        // Check for POLLHUP
        for (size_t i = 0; i < fds.size(); i++) {
            if (fds[i].revents & POLLHUP) {
                close(fds[i].fd);
                fds.erase(fds.begin() + i);
                i--;  // Adjust index
            }
        }
    }
}
```

**Answer:**
```
POLLHUP processed before POLLIN - loses final data from client
```

**Explanation:**
- Client closes connection after sending final message
- poll() returns POLLHUP | POLLIN (both events set)
- Code processes POLLHUP first, closes FD before reading data
- Final message lost - never recv()'d
- Must check POLLIN before POLLHUP to drain receive buffer
- **Key Concept:** Check POLLIN before POLLHUP; client may send final data then close - process POLLHUP first loses buffered data

**Fixed Version:**
```cpp
for (size_t i = 0; i < fds.size(); ) {
    // Process POLLIN first!
    if (fds[i].revents & POLLIN) {
        char buffer[1024];
        int n = recv(fds[i].fd, buffer, sizeof(buffer), 0);
        if (n > 0) {
            process_data(fds[i].fd, buffer, n);
        }
    }

    // Then check for disconnect
    if ((fds[i].revents & POLLHUP) || (fds[i].revents & POLLERR)) {
        close(fds[i].fd);
        fds.erase(fds.begin() + i);
        // Don't increment i
    } else {
        i++;
    }
}
```

---
