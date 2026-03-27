## TOPIC: TCP/IP Socket Fundamentals - Building Network Applications

### INTERVIEW_QA: Comprehensive Questions and Answers

#### Q1: What is the difference between TCP and UDP? When would you use each?

**Difficulty:** #beginner
**Category:** #fundamentals #protocols
**Concepts:** #tcp #udp #reliability

**Answer:** TCP is connection-oriented and reliable; UDP is connectionless and unreliable.

**Explanation:**

**TCP (Transmission Control Protocol)**:
- Connection-oriented: 3-way handshake establishes connection before data transfer
- Reliable: Guarantees delivery with acknowledgments and retransmissions
- Ordered: Data arrives in the order sent (sequence numbers)
- Flow control: Prevents sender from overwhelming receiver
- Overhead: Higher latency and bandwidth usage due to reliability mechanisms

**UDP (User Datagram Protocol)**:
- Connectionless: No handshake, just send packets
- Unreliable: No delivery guarantee, packets may be lost or arrive out of order
- No flow control: Sender can overwhelm receiver
- Low overhead: Minimal headers, lower latency

**When to use TCP**:
- File transfers (FTP, HTTP)
- Email (SMTP)
- Remote shell (SSH)
- Any application where reliability is critical

**When to use UDP**:
- Real-time video/audio streaming (acceptable to drop frames)
- Online gaming (position updates, occasional loss is fine)
- DNS queries (lightweight, retry if needed)
- Sensor data streaming where latest data matters more than old data

**Autonomous vehicle example**:
- TCP: Downloading HD maps, receiving navigation routes
- UDP: Streaming lidar point clouds, broadcasting vehicle position to nearby vehicles

#### Q2: Explain the server socket lifecycle. What does each system call do?

**Difficulty:** #beginner
**Category:** #fundamentals #api
**Concepts:** #socket #bind #listen #accept

**Answer:** socket() → bind() → listen() → accept() → recv()/send() → close()

**Explanation:**

**socket()**: Creates a socket endpoint
```cpp
int fd = socket(AF_INET, SOCK_STREAM, 0);
```
- AF_INET: IPv4 address family
- SOCK_STREAM: TCP socket (SOCK_DGRAM for UDP)
- Returns file descriptor or -1 on error

**bind()**: Assigns address (IP + port) to socket
```cpp
bind(fd, (sockaddr*)&addr, sizeof(addr));
```
- Associates the socket with a specific network interface and port
- Server must bind to know which port to listen on
- Fails with EADDRINUSE if port already in use

**listen()**: Marks socket as passive (accepting connections)
```cpp
listen(fd, backlog);
```
- Converts socket to listening state
- backlog: Maximum number of pending connections in queue
- Clients can connect even before accept() is called (queued)

**accept()**: Accepts incoming connection
```cpp
int client_fd = accept(server_fd, (sockaddr*)&client_addr, &len);
```
- Blocks until client connects (unless non-blocking)
- Returns new socket for communication with this specific client
- Original server_fd continues listening for more clients

**recv()/send()**: Exchange data
```cpp
recv(client_fd, buffer, size, flags);
send(client_fd, data, size, flags);
```
- Operate on client_fd returned by accept()
- May transfer less than requested (partial I/O)

**close()**: Cleanup
```cpp
close(client_fd);  // Close client connection
close(server_fd);  // Close listening socket
```

**Critical detail**: accept() returns a **new socket** for each client. The original listening socket remains open to accept more clients.

#### Q3: What is SIGPIPE and how do you handle it?

**Difficulty:** #intermediate
**Category:** #error_handling #signals
**Concepts:** #sigpipe #send #msg_nosignal

**Answer:** SIGPIPE is sent when writing to a closed socket; handle by ignoring the signal or using MSG_NOSIGNAL.

**Explanation:**

When you write to a TCP socket whose peer has already closed the connection:
1. First write: Returns -1 with errno = EPIPE (broken pipe)
2. Second write: Kernel sends SIGPIPE signal to your process
3. Default SIGPIPE handler: **Terminate the process**

This is a common production bug where a single client disconnect crashes your entire server!

**Solution 1: Ignore SIGPIPE globally**
```cpp
signal(SIGPIPE, SIG_IGN);  // At program startup
```
Now send() returns -1 with errno = EPIPE instead of crashing.

**Solution 2: Use MSG_NOSIGNAL flag**
```cpp
send(fd, data, size, MSG_NOSIGNAL);
```
Prevents SIGPIPE for this specific send() call.

**Why this happens**: TCP sends RST (reset) when you write to a closed connection. The kernel knows the connection is dead and signals your application. The default action is termination because writing to a closed connection often indicates a programming error.

**Production recommendation**: Always use MSG_NOSIGNAL or ignore SIGPIPE globally. Check return values and handle EPIPE errors gracefully.

#### Q4: Why must you convert port numbers to network byte order with htons()?

**Difficulty:** #intermediate
**Category:** #portability #byte_order
**Concepts:** #htons #endianness #network_order

**Answer:** Network protocols use big-endian byte order; htons() converts from host to network order.

**Explanation:**

Multi-byte integers can be stored two ways in memory:
- **Big-endian**: Most significant byte first (0x1234 → [0x12] [0x34])
- **Little-endian**: Least significant byte first (0x1234 → [0x34] [0x12])

x86/x64 processors use little-endian. ARM can be either (usually little). Network protocols mandate **big-endian**.

**Example bug**:
```cpp
server_addr.sin_port = 5000;  // ❌ WRONG
```

On x86 (little-endian):
- 5000 decimal = 0x1388 hex
- Stored as: [0x88] [0x13] (little-endian)
- Network interprets as: 0x8813 = 34835 decimal
- Your server binds to port 34835 instead of 5000!

**Correct approach**:
```cpp
server_addr.sin_port = htons(5000);  // ✅ CORRECT
```

**Conversion functions**:
- htons(): host to network short (16-bit port)
- htonl(): host to network long (32-bit IP address)
- ntohs(): network to host short
- ntohl(): network to host long

**Mnemonic**: "h" = host, "n" = network, "s" = short (16-bit), "l" = long (32-bit)

**Why it's easy to miss**: On big-endian machines, htons() is a no-op, code works without it. But on little-endian (most modern systems), it's required. Always use conversion functions for portable code.

#### Q5: What happens if send() returns a value less than the requested length?

**Difficulty:** #intermediate
**Category:** #edge_cases #io
**Concepts:** #partial_send #send_all

**Answer:** Partial send occurred; must loop to send remaining data.

**Explanation:**

send() does **not** guarantee to send all requested bytes in one call. It returns the number of bytes actually sent, which may be less due to:
- Network buffer space limitations
- TCP send buffer full
- Network congestion
- Slow receiver

**Example bug**:
```cpp
char data[10000];
send(fd, data, 10000, 0);  // ❌ Assumes all 10000 bytes sent
```

Actual behavior:
```cpp
ssize_t sent = send(fd, data, 10000, 0);
// sent might be 6144, not 10000!
// Remaining 3856 bytes were NOT sent
```

**Correct pattern**:
```cpp
size_t total_sent = 0;
while (total_sent < length) {
    ssize_t bytes = send(fd, data + total_sent, length - total_sent, MSG_NOSIGNAL);
    if (bytes < 0) {
        if (errno == EINTR) continue;  // Interrupted, retry
        return -1;  // Real error
    }
    if (bytes == 0) break;  // Connection closed
    total_sent += bytes;
}
```

**Same applies to recv()**: May return less than requested, must loop to receive exact amount.

**Why this happens**: TCP uses sliding window flow control. If the receiver's buffer is full, send() can only send what fits in available buffer space.

**Production tip**: Always wrap send()/recv() in send_all()/recv_all() helpers that loop until complete.

#### Q6: What is SO_REUSEADDR and why is it important for servers?

**Difficulty:** #intermediate
**Category:** #socket_options #production
**Concepts:** #so_reuseaddr #time_wait #port_reuse

**Answer:** Allows binding to a port in TIME_WAIT state; essential for quick server restarts.

**Explanation:**

After closing a TCP connection, the port enters **TIME_WAIT** state (typically 60 seconds on Linux). This prevents delayed packets from old connections from interfering with new connections using the same port.

**Problem**:
```cpp
// Server crashes or restarts
bind(fd, ...);  // ❌ Error: Address already in use (EADDRINUSE)
```

You must wait 60 seconds before restarting your server on the same port!

**Solution**:
```cpp
int opt = 1;
setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
bind(fd, ...);  // ✅ Now succeeds immediately
```

**What SO_REUSEADDR does**:
- Allows binding to a port in TIME_WAIT state
- Allows multiple sockets to bind to same port (with SO_REUSEPORT)
- Does **not** allow binding if an active connection exists on that port

**When to use**:
- Always set on server listening sockets before bind()
- Critical for development (fast restart cycles)
- Essential for production (automated restarts, deployments)

**Security consideration**: On some systems, SO_REUSEADDR allows port hijacking if not careful. Modern systems require same user ID for reuse.

**TIME_WAIT exists for good reason**: Ensures old duplicate packets don't corrupt new connections. SO_REUSEADDR carefully bypasses this only when safe.

#### Q7: How do you handle multiple clients with a single-threaded server?

**Difficulty:** #advanced
**Category:** #concurrency #io_multiplexing
**Concepts:** #select #poll #epoll

**Answer:** Use I/O multiplexing (select, poll, epoll) to monitor multiple sockets in one thread.

**Explanation:**

**Problem**: accept() and recv() block, preventing handling other clients.

**Solutions**:

**1. Multi-threaded/Multi-process**:
- One thread/process per client
- Simple but doesn't scale (C10K problem - 10,000 connections = 10,000 threads)
- High memory usage, context switching overhead

**2. I/O Multiplexing** (better for high scale):

**select()**:
```cpp
fd_set read_fds;
FD_ZERO(&read_fds);
FD_SET(server_fd, &read_fds);
FD_SET(client_fd1, &read_fds);
FD_SET(client_fd2, &read_fds);

select(max_fd + 1, &read_fds, NULL, NULL, NULL);

if (FD_ISSET(server_fd, &read_fds)) {
    // New client connecting
    accept(server_fd, ...);
}
if (FD_ISSET(client_fd1, &read_fds)) {
    // Data from client1
    recv(client_fd1, ...);
}
```

**poll()** (similar to select but no FD_SETSIZE limit):
```cpp
struct pollfd fds[100];
fds[0].fd = server_fd;
fds[0].events = POLLIN;
// ... add client fds

poll(fds, num_fds, -1);

for (int i = 0; i < num_fds; i++) {
    if (fds[i].revents & POLLIN) {
        // Socket fds[i].fd has data
    }
}
```

**epoll()** (Linux, most scalable):
```cpp
int epoll_fd = epoll_create1(0);
epoll_ctl(epoll_fd, EPOLL_CTL_ADD, server_fd, &event);

struct epoll_event events[MAX_EVENTS];
int ready = epoll_wait(epoll_fd, events, MAX_EVENTS, -1);

for (int i = 0; i < ready; i++) {
    int fd = events[i].data.fd;
    // Handle ready socket
}
```

**Comparison**:
- select: O(n) scan, FD_SETSIZE limit (1024), portable
- poll: O(n) scan, no limit, portable
- epoll: O(1), no limit, Linux-only, highest performance

High-performance servers (nginx, Redis) use epoll on Linux. We'll explore these in detail in upcoming topics.

#### Q8: What is the listen() backlog parameter and how does it affect connection handling?

**Difficulty:** #intermediate
**Category:** #fundamentals #performance
**Concepts:** #listen #backlog #connection_queue

**Answer:** Backlog sets the maximum number of pending connections in the SYN queue.

**Explanation:**

```cpp
listen(server_fd, backlog);
```

The backlog parameter controls the **completed connection queue** size—connections that have completed the 3-way handshake but haven't been accept()ed yet.

**Connection flow**:
1. Client sends SYN
2. Server sends SYN-ACK
3. Client sends ACK → connection moves to **completed queue**
4. accept() removes connection from queue

**If queue is full**: New connections are **refused** (client gets connection refused error).

**Typical values**:
- Small servers: 5-10
- Medium servers: 128
- High-traffic servers: 1024 or SOMAXCONN

**Real-world scenario**:
```cpp
listen(fd, 5);  // Backlog of 5

// 6 clients connect rapidly
// Clients 1-5: Queued, waiting for accept()
// Client 6: Connection refused (queue full)
```

**Tuning consideration**:
- Too small: Connection refused errors during traffic bursts
- Too large: Memory usage, longer SYN flood attack surface

**Production tip**: Set backlog to at least 128 for production servers. Use SOMAXCONN constant for system maximum:
```cpp
listen(fd, SOMAXCONN);
```

**Historical note**: Modern Linux interprets backlog as sum of SYN queue + completed queue. Actual behavior is system-dependent.

#### Q9: How would you implement a timeout for connect()?

**Difficulty:** #advanced
**Category:** #timeouts #non_blocking
**Concepts:** #connect #select #timeout

**Answer:** Use non-blocking socket + select() with timeout.

**Explanation:**

**Problem**: connect() can block for 75+ seconds if server is unreachable.

```cpp
connect(fd, ...);  // ⏸️ Blocks up to 75 seconds!
```

**Solution**: Non-blocking connect + select()

```cpp
#include <fcntl.h>
#include <sys/select.h>

bool connect_with_timeout(int fd, sockaddr_in* addr, int timeout_sec) {
    // Make socket non-blocking
    int flags = fcntl(fd, F_GETFL, 0);
    fcntl(fd, F_SETFL, flags | O_NONBLOCK);

    // Attempt connection
    int result = connect(fd, (sockaddr*)addr, sizeof(*addr));

    if (result < 0) {
        if (errno != EINPROGRESS) {
            return false;  // Real error
        }

        // Connection in progress, wait with timeout
        fd_set write_fds;
        FD_ZERO(&write_fds);
        FD_SET(fd, &write_fds);

        struct timeval timeout;
        timeout.tv_sec = timeout_sec;
        timeout.tv_usec = 0;

        result = select(fd + 1, NULL, &write_fds, NULL, &timeout);

        if (result == 0) {
            errno = ETIMEDOUT;
            return false;  // Timeout
        }

        if (result < 0) {
            return false;  // select error
        }

        // Check if connection succeeded
        int error;
        socklen_t len = sizeof(error);
        getsockopt(fd, SOL_SOCKET, SO_ERROR, &error, &len);

        if (error != 0) {
            errno = error;
            return false;  // Connection failed
        }
    }

    // Restore blocking mode
    fcntl(fd, F_SETFL, flags);
    return true;  // Success
}
```

**How it works**:
1. Set socket non-blocking
2. Call connect() - returns immediately with EINPROGRESS
3. Use select() to wait for socket to become writable (connection complete)
4. Check SO_ERROR to verify connection succeeded
5. Restore blocking mode

**Autonomous vehicle use case**: When connecting to cloud services, don't block vehicle control systems waiting for network. Use 5-second timeout to fail fast.

#### Q10: Explain the difference between close() and shutdown(). When would you use each?

**Difficulty:** #intermediate
**Category:** #connection_management #api
**Concepts:** #close #shutdown #half_close

**Answer:** close() releases the file descriptor; shutdown() closes one or both directions of a connection.

**Explanation:**

**close(fd)**:
- Decrements reference count on file descriptor
- If reference count reaches 0, sends FIN to peer
- Closes both sending and receiving
- File descriptor becomes invalid

**shutdown(fd, how)**:
- Closes one or both directions **without** releasing FD
- `how` parameter:
  - SHUT_RD (0): No more receives (read side closed)
  - SHUT_WR (1): No more sends (write side closed, sends FIN)
  - SHUT_RDWR (2): Both directions closed

**Key difference**: shutdown() allows **half-close** (close writing but keep reading).

**Example use case - HTTP**:
```cpp
// Send HTTP request
send(fd, request, len, 0);

// Signal "I'm done sending" but keep receiving
shutdown(fd, SHUT_WR);  // Sends FIN

// Continue receiving response
while ((bytes = recv(fd, buffer, sizeof(buffer), 0)) > 0) {
    // Process response
}

// Finally release FD
close(fd);
```

**When to use shutdown()**:
- Implementing graceful shutdown protocols
- HTTP clients (send request, signal done, receive full response)
- Half-duplex communication patterns
- When multiple processes share the socket (dup2, fork)

**When to use close()**:
- Normal case: done with both send and receive
- Cleanup in error cases
- Simple request-response patterns

**Socket descriptor sharing**:
```cpp
int fd = socket(...);
if (fork() == 0) {
    // Child process
    close(fd);  // Only decrements ref count, socket still open in parent
}
```

After fork(), socket has ref count 2. close() in child decrements to 1, socket remains open in parent.

#### Q11: What causes EINTR errors and how should you handle them?

**Difficulty:** #intermediate
**Category:** #error_handling #signals
**Concepts:** #eintr #signals #system_calls

**Answer:** EINTR occurs when a signal interrupts a blocking system call; retry the operation.

**Explanation:**

When a signal (SIGCHLD, SIGALRM, etc.) is delivered while a system call like recv() or accept() is blocking, the system call returns early with errno = EINTR (Interrupted system call).

**Example**:
```cpp
ssize_t bytes = recv(fd, buffer, size, 0);  // Blocking
// Signal arrives (e.g., SIGCHLD from child process)
// recv() returns -1, errno = EINTR
```

**Incorrect handling**:
```cpp
if (recv(fd, buffer, size, 0) < 0) {
    perror("recv failed");  // ❌ Treats EINTR as fatal error
    return;
}
```

**Correct handling**:
```cpp
ssize_t bytes;
do {
    bytes = recv(fd, buffer, size, 0);
} while (bytes < 0 && errno == EINTR);  // ✅ Retry on EINTR

if (bytes < 0) {
    perror("recv failed");  // Real error
    return;
}
```

**Which system calls can return EINTR**:
- recv(), send(), accept(), connect()
- read(), write()
- select(), poll(), epoll_wait()
- Any blocking system call

**Modern Linux behavior**: Since Linux 2.6, system calls are automatically restarted for most signals (SA_RESTART flag). However, portable code should still handle EINTR explicitly.

**Production pattern**:
```cpp
ssize_t safe_recv(int fd, void* buf, size_t len) {
    ssize_t bytes;
    do {
        bytes = recv(fd, buf, len, 0);
    } while (bytes < 0 && errno == EINTR);
    return bytes;
}
```

#### Q12: How do you detect if a peer has closed the connection?

**Difficulty:** #beginner
**Category:** #connection_management #io
**Concepts:** #recv #eof #connection_close

**Answer:** recv() returns 0 when peer closes connection gracefully.

**Explanation:**

**Normal recv()**:
```cpp
ssize_t bytes = recv(fd, buffer, size, 0);
```

**Return values**:
- **> 0**: Number of bytes received (success)
- **0**: Peer closed connection (EOF - End Of File)
- **< 0**: Error (check errno)

**Example**:
```cpp
while (true) {
    ssize_t bytes = recv(client_fd, buffer, sizeof(buffer), 0);

    if (bytes > 0) {
        // Normal data received
        process_data(buffer, bytes);
    } else if (bytes == 0) {
        std::cout << "Client disconnected gracefully\n";
        break;  // Exit loop
    } else {
        if (errno == EINTR) continue;  // Retry
        perror("recv error");  // Real error
        break;
    }
}
close(client_fd);
```

**Graceful close sequence**:
1. Client calls close() or shutdown(SHUT_WR)
2. TCP sends FIN packet to server
3. Server's recv() returns 0
4. Server calls close() to complete shutdown

**Abrupt close (peer crashes)**:
- TCP sends RST (reset) packet
- Server's recv() returns -1 with errno = ECONNRESET

**Detecting write to closed connection**:
```cpp
send(fd, data, size, MSG_NOSIGNAL);  // Returns -1
// errno == EPIPE (broken pipe) or ECONNRESET
```

**Production tip**: Always check for 0 return from recv() to detect graceful disconnection. Don't treat it as an error—it's normal connection termination.

#### Q13: What is the C10K problem and how is it solved?

**Difficulty:** #advanced
**Category:** #scalability #performance
**Concepts:** #c10k #epoll #io_multiplexing

**Answer:** C10K is handling 10,000 concurrent connections; solved with epoll/kqueue and event-driven architecture.

**Explanation:**

**The Problem (circa 1999)**:
Web servers couldn't handle 10,000+ concurrent connections efficiently. Why?

**Thread-per-connection model**:
```
10,000 connections = 10,000 threads
10,000 threads × 8MB stack = 80GB memory!
Context switching overhead kills performance
```

**select/poll limitations**:
- O(n) complexity: Must scan all FDs on every call
- FD_SETSIZE limit: 1024 FDs maximum (select)
- Must rebuild FD set each call
- Performance degrades linearly with connection count

**Solution: epoll (Linux) / kqueue (BSD)**

**epoll advantages**:
- O(1) complexity: Kernel maintains interest list
- No FD limit: Scales to hundreds of thousands
- Edge-triggered mode: Only notified on state changes
- Event-driven: Returns only ready FDs

**Performance comparison** (10,000 connections, 100 active):
```
select/poll: O(10,000) - scans all 10,000 FDs
epoll:       O(100)    - returns only 100 active FDs
```

**Modern architecture**:
```cpp
int epoll_fd = epoll_create1(0);

// Add listening socket
epoll_ctl(epoll_fd, EPOLL_CTL_ADD, server_fd, &event);

struct epoll_event events[MAX_EVENTS];
while (true) {
    int ready = epoll_wait(epoll_fd, events, MAX_EVENTS, -1);

    for (int i = 0; i < ready; i++) {
        // Process only ready connections
        handle_event(&events[i]);
    }
}
```

**Real-world examples**:
- nginx: Handles 100,000+ connections per server using epoll
- Redis: Event loop with epoll achieves millions of ops/sec
- Node.js: Built on epoll (Linux) / kqueue (macOS)

**Additional optimizations**:
- Non-blocking I/O
- Zero-copy (sendfile)
- Thread pools for CPU work
- Connection pooling

**Today's challenge**: C10M (10 million connections) for IoT and edge computing.

#### Q14: What is the purpose of inet_pton() and inet_ntop()? Why not use inet_addr()?

**Difficulty:** #intermediate
**Category:** #address_conversion #api
**Concepts:** #inet_pton #inet_ntop #ipv6

**Answer:** inet_pton/ntop support IPv6 and have better error handling; inet_addr is deprecated.

**Explanation:**

**Old API (deprecated)**:
```cpp
unsigned long ip = inet_addr("192.168.1.1");  // ❌ Deprecated
// Returns INADDR_NONE on error (which is also a valid IP: 255.255.255.255!)
```

**Modern API**:
```cpp
// inet_pton: Presentation to Network (text → binary)
struct sockaddr_in addr;
inet_pton(AF_INET, "192.168.1.1", &addr.sin_addr);

// inet_ntop: Network to Presentation (binary → text)
char ip_str[INET_ADDRSTRLEN];
inet_ntop(AF_INET, &addr.sin_addr, ip_str, sizeof(ip_str));
```

**Mnemonic**:
- **p** = presentation (human-readable string)
- **n** = network (binary format)
- pton = "printable to network"
- ntop = "network to printable"

**Why inet_pton/ntop is better**:

**1. IPv6 support**:
```cpp
struct sockaddr_in6 addr6;
inet_pton(AF_INET6, "2001:db8::1", &addr6.sin6_addr);  // ✅ Works
inet_addr("2001:db8::1");  // ❌ Doesn't support IPv6
```

**2. Better error handling**:
```cpp
if (inet_pton(AF_INET, ip_string, &addr.sin_addr) <= 0) {
    // Invalid IP address
}
```

**3. Thread-safe**: inet_ntop uses caller-provided buffer, not static buffer

**4. More explicit**:
```cpp
char buffer[INET_ADDRSTRLEN];   // IPv4: 16 bytes ("255.255.255.255" + null)
char buffer6[INET6_ADDRSTRLEN]; // IPv6: 46 bytes
```

**Common usage pattern**:
```cpp
// Client: Convert user input to binary
sockaddr_in server_addr{};
if (inet_pton(AF_INET, "192.168.1.100", &server_addr.sin_addr) <= 0) {
    std::cerr << "Invalid IP address\n";
    return 1;
}

// Server: Log client IP in readable form
char client_ip[INET_ADDRSTRLEN];
inet_ntop(AF_INET, &client_addr.sin_addr, client_ip, sizeof(client_ip));
std::cout << "Client: " << client_ip << "\n";
```

**Production tip**: Always use inet_pton/ntop for future IPv6 compatibility, even if you only support IPv4 today.

#### Q15: How would you implement a simple protocol for sending variable-length messages?

**Difficulty:** #advanced
**Category:** #protocol_design #framing
**Concepts:** #message_framing #protocol #length_prefix

**Answer:** Use length-prefixed framing: send fixed-size length header, then variable-size payload.

**Explanation:**

**Problem**: TCP is a stream protocol—it doesn't preserve message boundaries.

**Example**:
```cpp
send(fd, "HELLO", 5);
send(fd, "WORLD", 5);

// Receiver might get:
recv() → "HELLO"    (lucky - message boundary preserved)
recv() → "WORLD"

// Or might get:
recv() → "HELLOW"   (messages merged - boundary lost!)
recv() → "ORLD"
```

**Solution: Length-Prefixed Framing**

**Protocol design**:
```
[4-byte length][variable payload]
```

**Sender**:
```cpp
void send_message(int fd, const std::string& msg) {
    // Prepare header (length in network byte order)
    uint32_t length = htonl(msg.size());

    // Send header
    if (send_all(fd, &length, sizeof(length)) != sizeof(length)) {
        throw std::runtime_error("Failed to send header");
    }

    // Send payload
    if (send_all(fd, msg.data(), msg.size()) != msg.size()) {
        throw std::runtime_error("Failed to send payload");
    }
}
```

**Receiver**:
```cpp
std::string receive_message(int fd) {
    // Receive header (fixed 4 bytes)
    uint32_t length;
    if (recv_all(fd, &length, sizeof(length)) != sizeof(length)) {
        throw std::runtime_error("Failed to receive header");
    }

    // Convert from network byte order
    length = ntohl(length);

    // Validate length (prevent attacks)
    if (length > MAX_MESSAGE_SIZE) {
        throw std::runtime_error("Message too large");
    }

    // Receive payload (variable length)
    std::vector<char> buffer(length);
    if (recv_all(fd, buffer.data(), length) != length) {
        throw std::runtime_error("Failed to receive payload");
    }

    return std::string(buffer.begin(), buffer.end());
}
```

**Usage**:
```cpp
// Send
send_message(fd, "Hello");
send_message(fd, "This is a longer message");

// Receive (always gets complete messages)
std::string msg1 = receive_message(fd);  // "Hello"
std::string msg2 = receive_message(fd);  // "This is a longer message"
```

**Alternative framing strategies**:

**1. Delimiter-based** (like HTTP headers):
```
Message1\r\nMessage2\r\n
```
- Pros: Human-readable
- Cons: Must escape delimiters in payload, scanning overhead

**2. Fixed-length messages**:
```
[100 bytes][100 bytes][100 bytes]
```
- Pros: Simple
- Cons: Wastes space, inflexible

**3. Type-Length-Value (TLV)**:
```
[1-byte type][4-byte length][variable payload]
```
- Pros: Extensible, supports multiple message types
- Cons: More complex

**Production considerations**:
- Add CRC/checksum for integrity
- Add version field for protocol evolution
- Set MAX_MESSAGE_SIZE to prevent DoS
- Consider compression for large messages

**Real-world protocols using length-prefixing**:
- Protocol Buffers
- MessagePack
- Redis protocol (RESP)
- Many RPC frameworks

#### Q16: What are the advantages and disadvantages of non-blocking sockets?

**Difficulty:** #intermediate
**Category:** #io_modes #performance
**Concepts:** #non_blocking #blocking #event_driven

**Answer:** Non-blocking sockets allow concurrent operations but require complex event-driven code.

**Explanation:**

**Blocking sockets** (default):
```cpp
char buffer[1024];
recv(fd, buffer, sizeof(buffer), 0);  // ⏸️ Waits until data arrives
```

**Non-blocking sockets**:
```cpp
fcntl(fd, F_SETFL, O_NONBLOCK);
int bytes = recv(fd, buffer, sizeof(buffer), 0);
if (bytes < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) {
    // No data available right now, do other work
}
```

**Advantages of non-blocking**:

**1. Handle multiple connections in one thread**:
```cpp
// Check all clients without blocking
for (int client_fd : clients) {
    int bytes = recv(client_fd, buffer, size, 0);
    if (bytes > 0) process_data(client_fd, buffer, bytes);
}
```

**2. Responsive to user input**: Can check network and UI events in same loop

**3. Better resource utilization**: No threads blocked waiting for I/O

**4. Scalability**: One thread handles thousands of connections (with epoll)

**Disadvantages of non-blocking**:

**1. Complex code**:
```cpp
// Blocking: simple
connect(fd, ...);  // Wait until connected

// Non-blocking: complex
connect(fd, ...);  // Returns immediately
// Must use select/epoll to know when connected
// Must check SO_ERROR for success/failure
```

**2. Busy-waiting if not careful**:
```cpp
// ❌ BAD: Wastes CPU
while (true) {
    bytes = recv(fd, buffer, size, 0);
    if (bytes < 0 && errno == EAGAIN) {
        continue;  // Spins, consuming 100% CPU!
    }
}
```

**3. Must use I/O multiplexing**: Requires select/poll/epoll knowledge

**4. Partial operations**:
```cpp
// send() may only send part of data
int sent = send(fd, data, 10000, 0);  // Might send only 4096 bytes
// Must track state and retry later
```

**When to use blocking**:
- Simple client applications
- One connection per thread
- Straightforward request-response patterns

**When to use non-blocking**:
- High-performance servers
- Multiple connections in one thread
- Event-driven architectures (GUI apps, game engines)
- Combined with epoll/kqueue

**Hybrid approach** (common in production):
```cpp
// Accept connections non-blocking (main thread)
// Process data in thread pool with blocking I/O
```

**Modern frameworks** (libuv, boost::asio, Rust tokio) abstract non-blocking complexity with async/await.

#### Q17: Explain the TCP 3-way handshake. What happens during connect() and accept()?

**Difficulty:** #intermediate
**Category:** #protocols #fundamentals
**Concepts:** #tcp #three_way_handshake #connection_establishment

**Answer:** Client sends SYN, server responds with SYN-ACK, client sends ACK; connect() and accept() handle this automatically.

**Explanation:**

**3-Way Handshake** establishes TCP connection:

```
Client                                  Server
  |                                       |
  | ─────── SYN (seq=X) ────────────────> |  connect() called
  |                                       |  (blocks here)
  | <────── SYN-ACK (seq=Y, ack=X+1) ──── |  listen() → accept() called
  |                                       |  (waiting)
  | ─────── ACK (ack=Y+1) ───────────────> |
  |                                       |  accept() returns
  | <═══ Connection Established ════════> |
  |                                       |
```

**Step-by-step**:

**1. Client: SYN** (Synchronize)
```cpp
connect(client_fd, &server_addr, sizeof(server_addr));  // Blocks here
```
- Client sends SYN packet with initial sequence number X
- Enters SYN_SENT state

**2. Server: SYN-ACK** (Synchronize-Acknowledge)
```cpp
listen(server_fd, backlog);  // Listening
int client_fd = accept(server_fd, ...);  // Blocks here
```
- Server responds with SYN-ACK (acknowledges X+1, sends own sequence Y)
- Connection enters SYN_RECEIVED state
- Connection moves to completed queue (waiting for client's ACK)

**3. Client: ACK** (Acknowledge)
- Client sends ACK (acknowledges Y+1)
- Client's connect() returns (connection established)
- Server's accept() returns (pulls connection from queue)

**Why 3 steps?**:
- Prevents old duplicate packets from creating false connections
- Both sides agree on initial sequence numbers (for ordering)
- Both sides confirm ability to send/receive

**What can go wrong**:

**1. Server unreachable**:
```cpp
connect(fd, ...);  // Retries SYN, timeouts after ~75 seconds
// Returns -1, errno = ETIMEDOUT
```

**2. Server refuses connection**:
```cpp
// No process listening on port
connect(fd, ...);  // Gets RST response
// Returns -1, errno = ECONNREFUSED
```

**3. Backlog queue full**:
```cpp
listen(fd, 5);  // Backlog = 5
// 6th client connects while 5 are queued
// Client gets connection refused (or SYN drop with silent retry)
```

**4. Firewall blocks**:
```cpp
// SYN packet dropped by firewall
connect(fd, ...);  // Retries, eventually times out
```

**Connection teardown (4-way handshake)**:
```
Client               Server
  | ── FIN ─────────> |  close() called
  | <─ ACK ────────── |
  | <─ FIN ────────── |  close() called
  | ── ACK ─────────> |
```

**Production insight**: SYN flood attacks send many SYN packets without completing handshake, filling backlog queue. Defense: SYN cookies.

#### Q18: How do you implement keep-alive for long-lived connections?

**Difficulty:** #advanced
**Category:** #connection_management #reliability
**Concepts:** #keepalive #so_keepalive #heartbeat

**Answer:** Use SO_KEEPALIVE socket option or application-level heartbeat messages.

**Explanation:**

**Problem**: How to detect if peer has crashed or network is severed without sending data?

**Solution 1: TCP Keep-Alive** (OS-level):

```cpp
int enable = 1;
setsockopt(fd, SOL_SOCKET, SO_KEEPALIVE, &enable, sizeof(enable));

// Fine-tune keep-alive parameters (Linux)
int idle = 60;        // Start probing after 60 seconds idle
int interval = 10;    // Send probe every 10 seconds
int count = 5;        // 5 failed probes = connection dead

setsockopt(fd, IPPROTO_TCP, TCP_KEEPIDLE, &idle, sizeof(idle));
setsockopt(fd, IPPROTO_TCP, TCP_KEEPINTVL, &interval, sizeof(interval));
setsockopt(fd, IPPROTO_TCP, TCP_KEEPCNT, &count, sizeof(count));
```

**How it works**:
- After `idle` seconds of inactivity, TCP sends keep-alive probe
- If no response, retry every `interval` seconds
- After `count` failures, connection is considered dead
- recv()/send() returns error (ETIMEDOUT)

**Pros**:
- Automatic, no application code needed
- Detects dead connections

**Cons**:
- Long timeouts (default: 2 hours idle, 75 seconds per probe)
- Cannot send data over keep-alive probes
- Not portable (parameters vary by OS)

**Solution 2: Application-Level Heartbeat** (better control):

```cpp
// Message types
enum MessageType {
    MSG_HEARTBEAT = 0,
    MSG_DATA = 1
};

// Sender thread: Send heartbeat every 30 seconds
void heartbeat_sender(int fd) {
    while (true) {
        sleep(30);

        uint32_t msg_type = htonl(MSG_HEARTBEAT);
        if (send_all(fd, &msg_type, sizeof(msg_type)) < 0) {
            // Connection dead
            break;
        }
    }
}

// Receiver: Track last received time
time_t last_received = time(nullptr);

void receive_loop(int fd) {
    while (true) {
        uint32_t msg_type;
        if (recv_all(fd, &msg_type, sizeof(msg_type)) != sizeof(msg_type)) {
            break;  // Connection closed
        }

        msg_type = ntohl(msg_type);
        last_received = time(nullptr);

        if (msg_type == MSG_HEARTBEAT) {
            // Just update last_received time
            continue;
        }

        // Process data message...
    }
}

// Monitor thread: Check for timeout
void timeout_monitor(int fd, time_t& last_received) {
    while (true) {
        sleep(10);

        if (time(nullptr) - last_received > 90) {  // 90 second timeout
            std::cerr << "Heartbeat timeout, closing connection\n";
            close(fd);
            break;
        }
    }
}
```

**Pros**:
- Fine-grained control (short timeouts)
- Can send data in heartbeat (e.g., metrics)
- Portable across all systems
- Application knows exact connection state

**Cons**:
- Must implement in application code
- Extra network traffic
- More complex

**Hybrid approach**:
```cpp
// Enable TCP keep-alive as backup (2-hour timeout)
setsockopt(fd, SOL_SOCKET, SO_KEEPALIVE, &enable, sizeof(enable));

// Application heartbeat for fast detection (30 second timeout)
send_heartbeat_every_10_seconds();
check_timeout_every_15_seconds();
```

**Real-world usage**:
- WebSocket: Uses Ping/Pong frames (application-level)
- Redis: Supports timeout parameter for detecting dead clients
- gRPC: Configurable keep-alive with HTTP/2 PING frames
- MQTT: PINGREQ/PINGRESP messages

**Autonomous vehicle scenario**: Vehicle-to-cloud connection uses 10-second heartbeat to quickly detect network failures and switch to backup connection.

#### Q19: What is the difference between recv() and recvfrom()? When do you use each?

**Difficulty:** #beginner
**Category:** #api #fundamentals
**Concepts:** #recv #recvfrom #udp #tcp

**Answer:** recv() for TCP (connected sockets); recvfrom() for UDP (source address needed for each packet).

**Explanation:**

**recv()** - For connection-oriented protocols (TCP):
```cpp
ssize_t recv(int socket_fd, void* buffer, size_t length, int flags);
```
- Used with connected sockets (TCP)
- Source address is known (established connection)
- Returns received data length

**recvfrom()** - For connectionless protocols (UDP):
```cpp
ssize_t recvfrom(int socket_fd, void* buffer, size_t length, int flags,
                 struct sockaddr* src_addr, socklen_t* addrlen);
```
- Returns data **and** source address
- Needed because each UDP packet can come from different sender
- Commonly used with UDP sockets

**TCP example (recv)**:
```cpp
// Server accepted connection from specific client
int client_fd = accept(server_fd, ...);

// All data on client_fd comes from this client
char buffer[1024];
ssize_t bytes = recv(client_fd, buffer, sizeof(buffer), 0);
// We already know who sent this (the connected client)
```

**UDP example (recvfrom)**:
```cpp
// UDP server - no connections
int udp_fd = socket(AF_INET, SOCK_DGRAM, 0);
bind(udp_fd, ...);

sockaddr_in sender_addr;
socklen_t addr_len = sizeof(sender_addr);
char buffer[1024];

// Each packet might be from different sender!
ssize_t bytes = recvfrom(udp_fd, buffer, sizeof(buffer), 0,
                         (sockaddr*)&sender_addr, &addr_len);

// Now we know who sent it
char sender_ip[INET_ADDRSTRLEN];
inet_ntop(AF_INET, &sender_addr.sin_addr, sender_ip, sizeof(sender_ip));
std::cout << "Received from " << sender_ip << "\n";

// Reply to this specific sender
sendto(udp_fd, reply, reply_len, 0,
       (sockaddr*)&sender_addr, addr_len);
```

**Can you use recvfrom() with TCP?**

Yes! recvfrom() works with TCP too:
```cpp
sockaddr_in peer_addr;
socklen_t peer_len = sizeof(peer_addr);
ssize_t bytes = recvfrom(tcp_fd, buffer, size, 0,
                         (sockaddr*)&peer_addr, &peer_len);
```
But it's redundant—TCP connections already know the peer address (use getpeername() if needed).

**Similarly**: send() vs sendto()
- **send()**: TCP, destination known from connection
- **sendto()**: UDP, specify destination for each packet

**Summary**:
| Function | Protocol | Use Case |
|----------|----------|----------|
| recv() | TCP | Connected socket, peer known |
| recvfrom() | UDP | Datagram socket, need sender address |
| send() | TCP | Connected socket |
| sendto() | UDP | Datagram socket, specify destination |

#### Q20: What is the file descriptor limit and how do you handle it in server applications?

**Difficulty:** #advanced
**Category:** #resource_management #scalability
**Concepts:** #file_descriptors #ulimit #emfile

**Answer:** System limits open file descriptors (default ~1024); increase with ulimit or setrlimit(), handle EMFILE errors gracefully.

**Explanation:**

**The Problem**:

Each process has a **maximum number of file descriptors** (FDs) it can open. Sockets are file descriptors!

```bash
$ ulimit -n
1024    # Default soft limit on many systems
```

**What happens when limit is reached**:
```cpp
int client_fd = accept(server_fd, ...);
// Returns -1, errno = EMFILE (Too many open files)
```

Your server stops accepting new connections but doesn't crash—**silent failure**!

**Checking current FD count**:
```bash
# Count open FDs for process 1234
ls /proc/1234/fd | wc -l

# Real-time monitoring
watch -n 1 "ls /proc/$(pidof myserver)/fd | wc -l"
```

**Solution 1: Increase system limits**

**Temporary** (current session):
```bash
ulimit -n 65536  # Soft limit
ulimit -Hn 65536  # Hard limit
```

**Permanent** (edit /etc/security/limits.conf):
```
myuser  soft  nofile  65536
myuser  hard  nofile  65536
```

**Programmatic** (from application):
```cpp
#include <sys/resource.h>

bool increase_fd_limit(rlim_t limit) {
    struct rlimit rl;

    // Get current limits
    if (getrlimit(RLIMIT_NOFILE, &rl) < 0) {
        perror("getrlimit");
        return false;
    }

    std::cout << "Current FD limit: " << rl.rlim_cur << "\n";

    // Set new limits
    rl.rlim_cur = limit;  // Soft limit
    rl.rlim_max = limit;  // Hard limit (requires root if increasing)

    if (setrlimit(RLIMIT_NOFILE, &rl) < 0) {
        perror("setrlimit");
        return false;
    }

    std::cout << "New FD limit: " << limit << "\n";
    return true;
}

int main() {
    increase_fd_limit(65536);
    // ... start server
}
```

**Solution 2: Handle EMFILE gracefully**

```cpp
int client_fd = accept(server_fd, &client_addr, &client_len);

if (client_fd < 0) {
    if (errno == EMFILE || errno == ENFILE) {
        // Out of file descriptors!
        std::cerr << "FD limit reached, closing idle connections...\n";

        // Close least recently used idle connections
        close_idle_connections();

        // Retry accept after cleanup
        client_fd = accept(server_fd, &client_addr, &client_len);
    } else {
        perror("accept");
    }
}
```

**Solution 3: Reserve emergency FD**

```cpp
int emergency_fd = open("/dev/null", O_RDONLY);  // Reserve one FD

// When EMFILE occurs:
close(emergency_fd);  // Free up one FD
int client_fd = accept(server_fd, ...);  // Now succeeds
close(client_fd);  // Immediately close to reject connection
emergency_fd = open("/dev/null", O_RDONLY);  // Re-reserve
```

This allows you to accept() the connection, send an error message, then close it gracefully.

**Solution 4: Connection pooling**

```cpp
class ConnectionPool {
    static constexpr int MAX_CONNECTIONS = 10000;
    std::set<int> active_connections;

public:
    bool add_connection(int fd) {
        if (active_connections.size() >= MAX_CONNECTIONS) {
            std::cerr << "Connection pool full\n";
            return false;
        }
        active_connections.insert(fd);
        return true;
    }

    void remove_connection(int fd) {
        close(fd);
        active_connections.erase(fd);
    }
};
```

**Best practices**:

1. **Monitor FD usage** in production (metrics/alerts)
2. **Close connections properly** (avoid leaks)
3. **Set reasonable limits** based on server capacity
4. **Use RAII** (SocketGuard class) to prevent leaks
5. **Implement idle timeout** to reclaim FDs from inactive connections

**Production example** (nginx):
```
worker_rlimit_nofile 100000;  # FD limit per worker
worker_connections 10000;      # Max connections per worker
```

**Autonomous vehicle backend**: Cloud server handling 50,000 vehicles needs 100,000+ FDs (2 FDs per vehicle: control + telemetry channels).

---
