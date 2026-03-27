## TOPIC: TCP/IP Socket Fundamentals - Building Network Applications

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Q1
```cpp
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <iostream>

int main() {
    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = 8080;  // Missing htons()
    addr.sin_addr.s_addr = INADDR_ANY;

    int fd = socket(AF_INET, SOCK_STREAM, 0);
    bind(fd, (sockaddr*)&addr, sizeof(addr));
    listen(fd, 5);

    std::cout << "Server listening on port: " << ntohs(addr.sin_port) << "\n";
}
```

**Answer:**
```
Server listening on port: 31280 (or similar large number on little-endian systems)
```

**Explanation:**
- `addr.sin_port = 8080` assigns port without byte order conversion
- Network byte order is big-endian, but x86/x64 are little-endian
- 8080 in decimal = 0x1F90, stored as 0x90 0x1F on little-endian
- Network interprets as 0x1F90 reversed = 0x901F = 36895 decimal
- `ntohs()` converts back: ntohs(0x901F) = 0x1F90 = 8080 would be correct if properly stored
- **Key Concept:** Always use htons() for ports and htonl() for IPs; network byte order differs from host byte order

**Fixed Version:**
```cpp
addr.sin_port = htons(8080);  // Correct: converts to network byte order
```

#### Q2
```cpp
#include <sys/socket.h>
#include <netinet/in.h>
#include <iostream>

int main() {
    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(5000);
    addr.sin_addr.s_addr = INADDR_ANY;

    bind(server_fd, (sockaddr*)&addr, sizeof(addr));
    listen(server_fd, 5);

    // Server crashes here
    // ... restart immediately

    bind(server_fd, (sockaddr*)&addr, sizeof(addr));  // What happens?
}
```

**Answer:**
```
bind() fails with "Address already in use" (EADDRINUSE)
```

**Explanation:**
- When server crashes, socket enters TIME_WAIT state (2-4 minutes)
- OS keeps port reserved to handle delayed packets from previous connection
- Second bind() on same port fails immediately with EADDRINUSE
- Solution: set SO_REUSEADDR socket option before bind()
- **Key Concept:** Use SO_REUSEADDR to allow immediate port reuse after server restart; prevents "Address already in use" errors

**Fixed Version:**
```cpp
int reuse = 1;
setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &reuse, sizeof(reuse));
bind(server_fd, (sockaddr*)&addr, sizeof(addr));  // Now succeeds
```

#### Q3
```cpp
#include <sys/socket.h>
#include <cstring>
#include <iostream>

int main() {
    int client_fd = accept(server_fd, NULL, NULL);
    char message[] = "Hello Client";
    int bytes = send(client_fd, message, strlen(message), 0);
    std::cout << "Sent " << bytes << " bytes\n";

    // Client closes connection here

    bytes = send(client_fd, message, strlen(message), 0);
    std::cout << "Sent " << bytes << " more bytes\n";  // Will this execute?
}
```

**Answer:**
```
First send succeeds. Second send returns -1 (error), or triggers SIGPIPE (crash)
```

**Explanation:**
- First `send()` succeeds - data enters kernel buffer
- Client closes connection - sends FIN packet to server
- Second `send()` on closed connection triggers SIGPIPE signal
- Default SIGPIPE handler terminates program - never reaches cout
- Use MSG_NOSIGNAL flag to prevent SIGPIPE, returns -1/EPIPE instead
- **Key Concept:** Writing to closed socket triggers SIGPIPE by default; use MSG_NOSIGNAL to handle gracefully

**Fixed Version:**
```cpp
bytes = send(client_fd, message, strlen(message), MSG_NOSIGNAL);
if (bytes < 0) {
    std::cerr << "Send failed: connection closed\n";
}
```

#### Q4
```cpp
#include <sys/socket.h>
#include <cstring>
#include <iostream>

int main() {
    char data[10000];
    memset(data, 'A', sizeof(data));

    int sent = send(socket_fd, data, 10000, MSG_NOSIGNAL);
    if (sent == 10000) {
        std::cout << "All data sent successfully\n";
    } else {
        std::cout << "Only sent " << sent << " bytes\n";
    }
}
```

**Answer:**
```
Incorrect - send() can return less than 10000 even on success
```

**Explanation:**
- `send()` returns number of bytes actually queued to send buffer
- Send buffer might be full - `send()` returns partial count (e.g., 6000)
- Not an error - just means "try again later for remaining bytes"
- Must loop until all data sent: while (total_sent < 10000) { ... }
- **Key Concept:** send() may send partial data; always loop until all bytes sent or error occurs

**Fixed Version:**
```cpp
size_t total_sent = 0;
while (total_sent < 10000) {
    int sent = send(socket_fd, data + total_sent, 10000 - total_sent, MSG_NOSIGNAL);
    if (sent < 0) {
        perror("send failed");
        break;
    }
    total_sent += sent;
}
std::cout << "Sent " << total_sent << " bytes total\n";
```

#### Q5
```cpp
#include <sys/socket.h>
#include <errno.h>
#include <iostream>

int main() {
    int client_fd = connect_to_server();

    int bytes = recv(client_fd, buffer, 1024, 0);  // Blocks
    // Signal arrives (SIGALRM)
    // What does recv() return?

    if (bytes < 0 && errno == EINTR) {
        // Should we retry recv()?
        bytes = recv(client_fd, buffer, 1024, 0);  // Retry
    }
}
```

**Answer:**
```
recv() returns -1 with errno = EINTR (interrupted system call)
```

**Explanation:**
- Blocking syscalls like `recv()` can be interrupted by signals
- When interrupted, returns -1 and sets errno to EINTR
- Not a real error - just means "signal arrived, try again"
- Must check `errno == EINTR` and retry the recv() call
- **Key Concept:** Check for EINTR when syscalls return -1; it means interrupted by signal, not actual error - retry the operation

#### Q6
```cpp
#include <sys/socket.h>
#include <iostream>

int main() {
    char buffer[100];
    int bytes = recv(client_fd, buffer, 100, 0);
    buffer[bytes] = '\0';  // Null-terminate
    std::cout << "Received: " << buffer << "\n";
}
```

**Answer:**
```
Buffer overflow if recv() returns -1 (buffer[-1] out of bounds)
```

**Explanation:**
- `recv()` returns -1 on error (connection closed, timeout, etc.)
- `buffer[bytes]` becomes `buffer[-1]` - writes before array bounds
- Undefined behavior: corruption, crash, or security vulnerability
- Must check if `bytes > 0` before null-terminating
- **Key Concept:** Always check recv() return value before using it; negative means error, zero means connection closed, positive is bytes received

**Fixed Version:**
```cpp
int bytes = recv(client_fd, buffer, 99, 0);  // Leave room for null
if (bytes > 0) {
    buffer[bytes] = '\0';
    std::cout << "Received: " << buffer << "\n";
} else if (bytes == 0) {
    std::cout << "Connection closed\n";
} else {
    perror("recv error");
}
```

#### Q7
```cpp
#include <arpa/inet.h>
#include <iostream>

int main() {
    sockaddr_in server_addr{};
    server_addr.sin_family = AF_INET;
    server_addr.sin_port = htons(5000);
    server_addr.sin_addr.s_addr = inet_addr("192.168.1.100");  // Old API

    if (server_addr.sin_addr.s_addr == INADDR_NONE) {
        std::cerr << "Invalid IP\n";
    }
}
```

**Answer:**
```
inet_addr() is deprecated - cannot distinguish "255.255.255.255" from error
```

**Explanation:**
- `inet_addr()` returns INADDR_NONE (0xFFFFFFFF = 255.255.255.255) on error
- But "255.255.255.255" is a valid broadcast address - ambiguous!
- Cannot detect if input was invalid or legitimate 255.255.255.255
- Modern replacement: `inet_pton()` returns success/failure separately
- **Key Concept:** Use inet_pton() instead of inet_addr(); it properly distinguishes errors from valid IPs including 255.255.255.255

**Fixed Version:**
```cpp
if (inet_pton(AF_INET, "192.168.1.100", &server_addr.sin_addr) != 1) {
    std::cerr << "Invalid IP address\n";
}
```

#### Q8
```cpp
#include <sys/socket.h>
#include <iostream>

int main() {
    for (int i = 0; i < 1000; i++) {
        int client_fd = accept(server_fd, NULL, NULL);
        handle_client(client_fd);
        // Forgot to close(client_fd)
    }
}
```

**Answer:**
```
Fails after ~1000 iterations with "Too many open files" (EMFILE)
```

**Explanation:**
- Each `accept()` creates new file descriptor
- Process has FD limit (typically 1024 by default via ulimit)
- Forgetting `close()` leaks FDs - never freed
- After ~1000 accepts, hits limit - `accept()` returns -1/EMFILE
- **Key Concept:** Always close() file descriptors when done; leaking FDs exhausts process limit causing accept() failures

**Fixed Version:**
```cpp
for (int i = 0; i < 1000; i++) {
    int client_fd = accept(server_fd, NULL, NULL);
    handle_client(client_fd);
    close(client_fd);  // Essential!
}
```

#### Q9
```cpp
#include <sys/socket.h>

int main() {
    int listen_fd = socket(AF_INET, SOCK_STREAM, 0);
    bind(listen_fd, &addr, sizeof(addr));
    listen(listen_fd, 3);  // Backlog = 3

    // 5 clients connect simultaneously before any accept()
    // How many connections will be accepted?
    // What happens to client 4 and 5?
}
```

**Answer:**
```
3 connections queued successfully; clients 4 and 5 either wait or get connection refused
```

**Explanation:**
- Backlog parameter limits completed connection queue size
- First 3 clients: SYN → SYN-ACK → ACK completes, queued for accept()
- Clients 4-5: Server may ignore SYN (client retries) or send RST (refused)
- Behavior OS-dependent - Linux may queue more than backlog
- Modern practice: use larger backlog (SOMAXCONN = 128+)
- **Key Concept:** listen() backlog limits pending connection queue; low values cause connection refusals under high load

#### Q10
```cpp
#include <sys/socket.h>
#include <arpa/inet.h>
#include <cstdint>
#include <string>
#include <vector>

void send_message(int fd, const std::string& msg) {
    uint32_t length = msg.size();  // Forgot htonl()
    send(fd, &length, sizeof(length), 0);
    send(fd, msg.data(), msg.size(), 0);
}

void receive_message(int fd) {
    uint32_t length;
    recv(fd, &length, sizeof(length), 0);
    length = ntohl(length);

    std::vector<char> buffer(length);
    recv(fd, buffer.data(), length, 0);
}
```

**Answer:**
```
Sender sends length in host byte order, receiver expects network order - length mismatch
```

**Explanation:**
- Sender sends uint32_t without `htonl()` conversion
- If sender is little-endian, sends 0x05 0x00 0x00 0x00 for length 5
- Receiver calls `ntohl()` expecting network order, interprets as 83886080!
- Allocates huge buffer, crashes or hangs waiting for 83MB of data
- Both sides must agree on byte order - use htonl/ntohl consistently
- **Key Concept:** Always use htonl() when sending multi-byte integers; endianness differences cause catastrophic protocol mismatches

**Fixed Version:**
```cpp
void send_message(int fd, const std::string& msg) {
    uint32_t length = htonl(msg.size());  // Convert to network byte order
    send(fd, &length, sizeof(length), 0);
    send(fd, msg.data(), msg.size(), 0);
}
```

---
#### Q11
```cpp
#include <sys/socket.h>
#include <unistd.h>
#include <iostream>

int main() {
    int fd = socket(AF_INET, SOCK_STREAM, 0);
    connect(fd, &server_addr, sizeof(server_addr));

    send(fd, "Hello", 5, 0);
    shutdown(fd, SHUT_WR);

    char buffer[100];
    int bytes = recv(fd, buffer, 100, 0);  // Will this work?
}
```

**Answer:**
```
recv() works (can still receive); send() would fail
```

**Explanation:**
- `shutdown(SHUT_WR)` closes write half of connection only
- Send FIN to peer indicating "no more data from me"
- Receive half still open - can read peer's response
- Subsequent `send()` would return -1/EPIPE
- Useful for half-close pattern: "I'm done sending, waiting for your response"
- **Key Concept:** shutdown(SHUT_WR) enables half-close - send FIN but continue receiving; allows graceful request-response pattern

#### Q12
```cpp
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <iostream>

int main() {
    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(0);  // Port = 0
    addr.sin_addr.s_addr = INADDR_ANY;

    bind(listen_fd, (sockaddr*)&addr, sizeof(addr));
    listen(listen_fd, 5);

    // What port is the server actually listening on?
    socklen_t len = sizeof(addr);
    getsockname(listen_fd, (sockaddr*)&addr, &len);
    std::cout << "Listening on port: " << ntohs(addr.sin_port) << "\n";
}
```

**Answer:**
```
OS assigns ephemeral port (typically 32768-60999 on Linux)
```

**Explanation:**
- `htons(0)` tells OS "assign any available port"
- OS chooses from ephemeral port range (differs by OS)
- Useful for dynamic port allocation when exact port doesn't matter
- Retrieve actual port with `getsockname()` after bind()
- **Key Concept:** Binding to port 0 requests OS to assign ephemeral port; use getsockname() to discover assigned port

#### Q13
```cpp
#include <sys/socket.h>
#include <iostream>

int main() {
    int udp_fd = socket(AF_INET, SOCK_DGRAM, 0);
    bind(udp_fd, &addr, sizeof(addr));

    int client_fd = accept(udp_fd, NULL, NULL);  // What happens?
    if (client_fd < 0) {
        perror("accept");
    }
}
```

**Answer:**
```
accept() fails with EOPNOTSUPP (Operation not supported on socket)
```

**Explanation:**
- `accept()` only works on SOCK_STREAM (TCP) sockets
- UDP (SOCK_DGRAM) is connectionless - no concept of "accepting" connections
- Returns -1 with errno = EOPNOTSUPP or EINVAL
- UDP uses `recvfrom()` to receive from any sender without accepting
- **Key Concept:** accept() is only for connection-oriented protocols (TCP); UDP is connectionless and uses recvfrom()/sendto()

#### Q14
```cpp
#include <sys/socket.h>
#include <iostream>

int main() {
    char buffer[10];
    int bytes = recv(socket_fd, buffer, sizeof(buffer), 0);

    if (bytes == 0) {
        std::cout << "No data received\n";
    } else if (bytes > 0) {
        std::cout << "Received " << bytes << " bytes\n";
    }
}
```

**Answer:**
```
bytes == 0 means "connection closed by peer", not "no data"
```

**Explanation:**
- `recv()` returns 0 specifically when peer closed connection (received FIN)
- Does NOT mean "no data available" - that would block or return EAGAIN
- Critical distinction: 0 = EOF (connection closed), not empty read
- Must close socket and cleanup when recv() returns 0
- **Key Concept:** recv() returning 0 means peer closed connection (EOF); must close socket and cleanup - not a temporary "no data" condition

**Fixed Version:**
```cpp
if (bytes == 0) {
    std::cout << "Connection closed by peer\n";
    close(socket_fd);
} else if (bytes > 0) {
    std::cout << "Received " << bytes << " bytes\n";
} else {
    perror("recv error");
}
```

#### Q15
```cpp
#include <sys/socket.h>
#include <fcntl.h>
#include <errno.h>
#include <iostream>

int main() {
    fcntl(socket_fd, F_SETFL, O_NONBLOCK);

    int bytes = recv(socket_fd, buffer, 1024, 0);
    if (bytes < 0) {
        perror("recv failed");  // Always an error?
    }
}
```

**Answer:**
```
No - EAGAIN/EWOULDBLOCK means "no data available now, try later"
```

**Explanation:**
- Non-blocking `recv()` returns -1 with EAGAIN if no data ready
- EAGAIN/EWOULDBLOCK is not an error - means "try again later"
- Must check `errno` to distinguish real errors from "no data yet"
- Other errnos (ECONNRESET, etc.) are actual errors
- **Key Concept:** On non-blocking sockets, recv() returning -1 with EAGAIN/EWOULDBLOCK is normal - means no data available, not an error

**Fixed Version:**
```cpp
int bytes = recv(socket_fd, buffer, 1024, 0);
if (bytes < 0) {
    if (errno == EAGAIN || errno == EWOULDBLOCK) {
        // No data available yet, not an error
        std::cout << "No data ready, try later\n";
    } else {
        perror("recv error");
    }
}
```

#### Q16
```cpp
#include <sys/socket.h>
#include <sys/time.h>
#include <iostream>

int main() {
    int socket_fd = socket(AF_INET, SOCK_STREAM, 0);

    struct timeval timeout;
    timeout.tv_sec = 5;
    timeout.tv_usec = 0;
    setsockopt(socket_fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));

    int bytes = recv(socket_fd, buffer, 1024, 0);  // Blocks for 5 seconds max
    // After 5 seconds with no data, what does recv() return?
    if (bytes < 0) {
        std::cerr << "Error: " << errno << "\n";
    }
}
```

**Answer:**
```
recv() returns -1 with errno = EAGAIN or EWOULDBLOCK (timeout)
```

**Explanation:**
- SO_RCVTIMEO sets receive timeout - `recv()` waits max 5 seconds
- If no data arrives within timeout, returns -1 with EAGAIN/EWOULDBLOCK
- Same errno as non-blocking socket with no data (platform dependent)
- Different from actual errors (ECONNRESET, etc.)
- **Key Concept:** SO_RCVTIMEO timeout causes recv() to return -1 with EAGAIN/EWOULDBLOCK; check errno to distinguish timeout from other errors

#### Q17
```cpp
#include <sys/socket.h>
#include <iostream>

int main() {
    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    bind(server_fd, &addr, sizeof(addr));
    listen(server_fd, 5);

    int client1 = accept(server_fd, NULL, NULL);
    int client2 = accept(server_fd, NULL, NULL);

    send(server_fd, "Hello", 5, 0);  // Bug! What's wrong?
}
```

**Answer:**
```
Cannot send on listening socket; must send on accepted client FDs
```

**Explanation:**
- `server_fd` is listening socket - only accepts connections
- Sending on listening socket returns -1/EPIPE or ENOTCONN
- Must send on connected client sockets (client1, client2)
- Common mistake: confusing listening socket with client connections
- **Key Concept:** Listening socket only accepts connections; data transfer happens on client FDs returned by accept()

**Fixed Version:**
```cpp
send(client1, "Hello", 5, 0);  // Send to client 1
send(client2, "Hello", 5, 0);  // Send to client 2
```

#### Q18
```cpp
#include <sys/socket.h>
#include <unistd.h>

int main() {
    if (fork() == 0) {
        // Child process
        int client_fd = accept(server_fd, NULL, NULL);
        handle_client(client_fd);
        close(client_fd);
        exit(0);
    }
    // Parent continues
}
```

**Answer:**
```
Connection NOT closed until parent also closes client_fd
```

**Explanation:**
- `fork()` duplicates file descriptors - both parent and child have client_fd
- Socket has reference count = 2 (parent + child)
- Child's `close()` decrements count to 1, but socket remains open
- Connection actually closes when both close() or when both processes exit
- Parent should also close(client_fd) if not using it
- **Key Concept:** fork() duplicates FDs; socket closes only when all references closed - child close() not enough if parent still has FD

**Fixed Version:**
```cpp
int client_fd = accept(server_fd, NULL, NULL);
if (fork() == 0) {
    // Child
    close(server_fd);  // Child doesn't need listening socket
    handle_client(client_fd);
    close(client_fd);
    exit(0);
}
// Parent
close(client_fd);  // Parent doesn't need this client connection
```

#### Q19
```cpp
#include <sys/socket.h>
#include <netinet/in.h>
#include <iostream>

int main() {
    sockaddr_in addr;
    socklen_t len = sizeof(addr);
    int client_fd = accept(server_fd, (sockaddr*)&addr, &len);

    std::cout << "Client port: " << addr.sin_port << "\n";  // Bug!
}
```

**Answer:**
```
Prints port in network byte order (big-endian) - wrong value
```

**Explanation:**
- `accept()` fills addr.sin_port with network byte order value
- Printing directly shows big-endian representation (e.g., 0x1F90 = 8080)
- On little-endian system, prints as integer 36895 instead of 8080
- Must use `ntohs()` to convert to host byte order before printing
- **Key Concept:** sockaddr_in stores port in network byte order; always use ntohs() when reading port for display or comparison

**Fixed Version:**
```cpp
std::cout << "Client port: " << ntohs(addr.sin_port) << "\n";
```

#### Q20
```cpp
#include <sys/socket.h>
#include <vector>
#include <iostream>

int main() {
    std::vector<int> clients;

    for (int client_fd : clients) {
        char buffer[1024];
        int bytes = recv(client_fd, buffer, sizeof(buffer), 0);  // Blocks!

        if (bytes > 0) {
            process_data(client_fd, buffer, bytes);
        }
    }
}
```

**Answer:**
```
Blocks on first client with no data - can't serve other clients (head-of-line blocking)
```

**Explanation:**
- `recv()` blocks until data arrives from first client
- While blocked, cannot check other clients - starvation
- If client1 never sends data, clients 2-N are stuck waiting
- Solution: use select(), poll(), or epoll() to multiplex multiple sockets
- Or use non-blocking sockets with event loop
- **Key Concept:** Blocking recv() in loop causes head-of-line blocking; use select/poll/epoll to multiplex multiple clients without blocking

**Fixed Version (using select):**
```cpp
fd_set readfds;
FD_ZERO(&readfds);

int max_fd = 0;
for (int client_fd : clients) {
    FD_SET(client_fd, &readfds);
    max_fd = std::max(max_fd, client_fd);
}

select(max_fd + 1, &readfds, NULL, NULL, NULL);

for (int client_fd : clients) {
    if (FD_ISSET(client_fd, &readfds)) {
        char buffer[1024];
        int bytes = recv(client_fd, buffer, sizeof(buffer), 0);
        if (bytes > 0) {
            process_data(client_fd, buffer, bytes);
        }
    }
}
```

---
