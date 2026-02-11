## TOPIC: TCP/IP Socket Fundamentals - Building Network Applications

### THEORY_SECTION: Core Concepts and Foundations

#### What is Network Programming?

Network programming is the art of making different computers talk to each other over a network. Just like how you make a phone call to talk to someone far away, network programming allows programs running on different machines to communicate and share data. In C++, we use **sockets** as the fundamental building block for network communication.

Think of a socket as a telephone: you pick it up, dial a number (connect), talk (send/receive data), and hang up (close). The socket API provides these exact operations for programs to communicate over networks.

#### Understanding TCP/IP - The Foundation

TCP/IP is actually two protocols working together:

**IP (Internet Protocol)** is like the postal service. It knows how to find the destination address and route your data packet there. IP doesn't guarantee delivery—it's like dropping a postcard in a mailbox. It might arrive, it might not, and if you send multiple postcards, they might arrive out of order.

**TCP (Transmission Control Protocol)** sits on top of IP and adds reliability. TCP is like sending a registered letter with tracking and confirmation. It ensures:
- Your data arrives intact (error checking)
- Data arrives in the correct order (sequencing)
- The receiver acknowledges receipt (acknowledgments)
- Lost packets are automatically resent (retransmission)

For autonomous vehicles communicating with cloud services, TCP/IP ensures critical data like HD maps, traffic updates, and trajectory planning commands arrive reliably and in order.

#### The Socket API - Your Network Toolkit

A socket is an endpoint for sending or receiving data across a network. Every networked application uses sockets. When you browse the web, your browser creates a socket to talk to the web server. When you stream video, a socket carries that data. Understanding sockets is understanding how all networked software works.

The socket API provides these key operations:

**socket()** - Creates a new socket (like buying a new phone)
**bind()** - Assigns an address to the socket (like getting a phone number)
**listen()** - Prepares to accept connections (like turning on your phone's ringer)
**accept()** - Accepts an incoming connection (like answering the phone)
**connect()** - Initiates a connection to a server (like making a call)
**send()/recv()** - Sends and receives data (like talking)
**close()** - Closes the connection (like hanging up)

#### Server vs Client Architecture

Network applications typically use a client-server model:

**Server**: Listens for incoming connections, waits for clients to connect, serves requests. Servers run continuously, waiting for work. Think of a server as a restaurant kitchen—always open, waiting for orders.

**Client**: Initiates connections, sends requests, receives responses. Clients are active when needed. Think of a client as a customer—comes in, orders food, eats, leaves.

For autonomous vehicles:
- **Vehicle (Client)**: Connects to cloud services, requests HD map updates, sends telemetry
- **Cloud Server (Server)**: Waits for vehicle connections, provides map data, processes route calculations

#### Address Structures - Finding Your Way on the Network

Every device on a network needs an address. In TCP/IP, we use IP addresses and port numbers together to identify a specific application on a specific machine.

**sockaddr_in** structure contains:
- **sin_family**: Address family (AF_INET for IPv4)
- **sin_port**: Port number (16-bit, identifies the application)
- **sin_addr**: IP address (32-bit, identifies the machine)

**IP Address**: Identifies the computer (like a street address)
**Port Number**: Identifies the specific application (like an apartment number)

Example: `192.168.1.100:8080`
- `192.168.1.100` = which computer
- `8080` = which application on that computer

Common ports:
- 80: HTTP (web servers)
- 443: HTTPS (secure web)
- 22: SSH (secure shell)
- 5000-9000: Custom applications (like your autonomous vehicle service)

#### Network Byte Order - Speaking the Same Language

Different computer architectures store multi-byte numbers differently:
- **Big-endian**: Stores most significant byte first (network standard)
- **Little-endian**: Stores least significant byte first (Intel x86/x64)

Example: The number 0x1234 in memory:
- Big-endian: [0x12] [0x34]
- Little-endian: [0x34] [0x12]

Network protocols mandate big-endian (network byte order). Use these conversion functions:
- **htons()**: Host to network short (16-bit port numbers)
- **htonl()**: Host to network long (32-bit IP addresses)
- **ntohs()**: Network to host short
- **ntohl()**: Network to host long

**Always convert to network byte order before sending, convert back after receiving.** Forgetting this causes subtle bugs where connections fail only between different architectures.

#### Blocking vs Non-Blocking Sockets

**Blocking sockets** (default behavior):
When you call recv() or send(), your program **stops and waits** until the operation completes. It's like waiting at a red light—you can't do anything else until it turns green.

```cpp
char buffer[1024];
int bytes = recv(socket_fd, buffer, sizeof(buffer), 0);  // ⏸️ Blocks here until data arrives
```

**Non-blocking sockets**:
Operations return immediately, even if they can't complete. You get an error code like EAGAIN (try again later). It's like checking if a parking spot is free—if not, you move on immediately rather than waiting.

Blocking sockets are simpler for single-connection scenarios. Non-blocking sockets are essential for high-performance servers handling thousands of connections (we'll explore this with select/poll/epoll).

#### Socket Lifecycle - The Complete Journey

**Server lifecycle**:
```
socket() → Create a communication endpoint
   ↓
bind() → Assign an address (IP + port)
   ↓
listen() → Mark as passive socket (ready to accept connections)
   ↓
accept() → Block until client connects, returns new socket for communication
   ↓
recv()/send() → Exchange data with client
   ↓
close() → Clean up resources
```

**Client lifecycle**:
```
socket() → Create a communication endpoint
   ↓
connect() → Initiate connection to server
   ↓
send()/recv() → Exchange data with server
   ↓
close() → Clean up resources
```

#### Why Socket Programming Matters for Systems Engineers

Understanding sockets is fundamental because:

1. **Distributed Systems**: Microservices communicate via network protocols
2. **Real-Time Communication**: WebSockets, game servers, chat applications
3. **IoT and Embedded**: Devices communicating with cloud services
4. **Performance Tuning**: Network I/O is often the bottleneck—understanding sockets helps optimize
5. **Debugging**: Network issues are common in production—socket knowledge is essential for troubleshooting

In autonomous driving:
- Vehicles stream sensor data (lidar, camera) to edge compute servers
- Real-time map updates from cloud to vehicle
- Vehicle-to-vehicle (V2V) communication for cooperative perception
- OTA (over-the-air) software updates
- Fleet management and telemetry

All of these use sockets under the hood.

---

### EDGE_CASES: Tricky Scenarios and Deep Internals

#### Edge Case 1: SIGPIPE - The Silent Killer

```cpp
int socket_fd = /* connected socket */;
char message[] = "Hello";

// Client closes connection
// Server writes to closed socket
int bytes = send(socket_fd, message, 5, 0);  // ❌ SIGPIPE signal kills process!
```

When you write to a socket whose peer has closed the connection, the kernel sends a **SIGPIPE signal** to your process. The default action is **process termination**, which crashes your server!

**Why this happens**: TCP has already sent a RST (reset) packet from the closed peer. When you try to send again, the kernel knows the connection is dead and sends SIGPIPE to notify your program.

**Solution 1**: Ignore SIGPIPE and check return values
```cpp
#include <signal.h>

int main() {
    signal(SIGPIPE, SIG_IGN);  // ✅ Ignore SIGPIPE

    // send() now returns -1 with errno = EPIPE instead of crashing
    int bytes = send(socket_fd, message, 5, 0);
    if (bytes < 0 && errno == EPIPE) {
        std::cerr << "Client disconnected\n";
        close(socket_fd);
    }
}
```

**Solution 2**: Use MSG_NOSIGNAL flag
```cpp
int bytes = send(socket_fd, message, 5, MSG_NOSIGNAL);  // ✅ Never generates SIGPIPE
if (bytes < 0 && errno == EPIPE) {
    // Handle disconnection
}
```

For production servers, always use MSG_NOSIGNAL or ignore SIGPIPE globally. Otherwise, a single client disconnect can crash your entire server.

#### Edge Case 2: Partial Sends and Receives

```cpp
char buffer[10000];
memset(buffer, 'A', sizeof(buffer));

int bytes_sent = send(socket_fd, buffer, 10000, 0);
std::cout << "Sent: " << bytes_sent << " bytes\n";  // ❌ Might be only 6144!
```

**send() and recv() do not guarantee to transfer all requested bytes in one call.** They return the number of bytes actually transferred, which might be less than requested due to:
- Network buffer space limitations
- Kernel buffer size
- Network congestion
- Receiver's processing speed

**Correct pattern for sending all data**:
```cpp
ssize_t send_all(int fd, const char* buffer, size_t length) {
    size_t total_sent = 0;
    while (total_sent < length) {
        ssize_t bytes = send(fd, buffer + total_sent, length - total_sent, MSG_NOSIGNAL);
        if (bytes < 0) {
            if (errno == EINTR) continue;  // Interrupted by signal, retry
            return -1;  // Real error
        }
        if (bytes == 0) return total_sent;  // Connection closed
        total_sent += bytes;
    }
    return total_sent;
}
```

**Similarly for receiving**:
```cpp
ssize_t recv_all(int fd, char* buffer, size_t length) {
    size_t total_received = 0;
    while (total_received < length) {
        ssize_t bytes = recv(fd, buffer + total_received, length - total_received, 0);
        if (bytes < 0) {
            if (errno == EINTR) continue;
            return -1;
        }
        if (bytes == 0) return total_received;  // EOF - connection closed
        total_received += bytes;
    }
    return total_received;
}
```

**Key insight**: Always loop until all data is sent/received, or use message framing protocols.

#### Edge Case 3: Port Already in Use (EADDRINUSE)

```cpp
int server_fd = socket(AF_INET, SOCK_STREAM, 0);
bind(server_fd, (sockaddr*)&addr, sizeof(addr));  // ❌ bind: Address already in use
```

After a server crashes or restarts, the port enters **TIME_WAIT** state (typically 60 seconds on Linux). The kernel keeps the port reserved to handle any delayed packets from previous connections. This prevents immediate restart of your server!

**Solution**: Use SO_REUSEADDR socket option
```cpp
int server_fd = socket(AF_INET, SOCK_STREAM, 0);

int opt = 1;
setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));  // ✅ Reuse port

bind(server_fd, (sockaddr*)&addr, sizeof(addr));  // Now succeeds
```

SO_REUSEADDR allows:
- Binding to a port in TIME_WAIT state
- Multiple sockets binding to the same port (with SO_REUSEPORT)
- Faster development cycle (no waiting for port release)

**Critical for production**: Always set SO_REUSEADDR on server sockets before binding.

#### Edge Case 4: Forgetting to Convert Byte Order

```cpp
sockaddr_in server_addr{};
server_addr.sin_port = 5000;  // ❌ WRONG! Host byte order

// On little-endian (x86), 5000 = 0x1388
// Stored as: [0x88] [0x13]
// Network expects: [0x13] [0x88]
// Actual port used: 0x8813 = 34835 (wrong port!)
```

This is a sneaky bug because:
- On big-endian machines (rare nowadays), it works accidentally
- On little-endian machines (x86/x64), ports get scrambled
- Error messages say "connection refused" without mentioning byte order

**Correct approach**:
```cpp
server_addr.sin_port = htons(5000);  // ✅ Convert to network byte order
server_addr.sin_addr.s_addr = htonl(INADDR_ANY);  // ✅ For IP addresses too
```

**Debugging tip**: If your server listens on port 5000 but you see it on port 34835 (`netstat` output), you forgot htons().

#### Edge Case 5: Zombie Sockets and File Descriptor Leaks

```cpp
void handle_client(int client_fd) {
    if (some_error) {
        return;  // ❌ Forgot close(client_fd) - FD leak!
    }
    // ... handle client ...
    close(client_fd);  // ✅ Only reached on success path
}
```

Each process has a **limited number of file descriptors** (typically 1024 by default, check with `ulimit -n`). If you forget to close sockets:
- File descriptors are exhausted
- New connections fail with EMFILE (too many open files)
- Server stops accepting connections but doesn't crash (silent failure)

**Leak accumulation example**:
```
Client 1 connects: FD 3 (not closed properly)
Client 2 connects: FD 4 (not closed)
...
Client 1021 connects: FD 1023 (last available FD)
Client 1022 connects: accept() returns -1, errno = EMFILE
```

**Solution**: Use RAII to ensure cleanup
```cpp
class SocketGuard {
    int fd_;
public:
    explicit SocketGuard(int fd) : fd_(fd) {}
    ~SocketGuard() { if (fd_ >= 0) close(fd_); }
    SocketGuard(const SocketGuard&) = delete;
    int get() const { return fd_; }
};

void handle_client(int client_fd) {
    SocketGuard guard(client_fd);  // ✅ Automatically closed on any return path

    if (some_error) {
        return;  // close() called automatically
    }
    // ... handle client ...
}  // close() called automatically
```

**Monitoring tip**: Watch `/proc/<pid>/fd/` to see open file descriptors. If count keeps growing, you have a leak.

---

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Simple Echo Server (Single Client)

```cpp
#include <iostream>
#include <cstring>
#include <unistd.h>
#include <arpa/inet.h>
#include <sys/socket.h>

int main() {
    // Step 1: Create socket
    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (server_fd < 0) {
        perror("socket failed");
        return 1;
    }

    // Step 2: Set socket options (reuse address)
    int opt = 1;
    if (setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt)) < 0) {
        perror("setsockopt failed");
        close(server_fd);
        return 1;
    }

    // Step 3: Bind to address
    sockaddr_in server_addr{};
    server_addr.sin_family = AF_INET;
    server_addr.sin_addr.s_addr = INADDR_ANY;  // Listen on all interfaces
    server_addr.sin_port = htons(5000);  // Port 5000

    if (bind(server_fd, (sockaddr*)&server_addr, sizeof(server_addr)) < 0) {
        perror("bind failed");
        close(server_fd);
        return 1;
    }

    // Step 4: Listen for connections
    if (listen(server_fd, 5) < 0) {  // Backlog of 5
        perror("listen failed");
        close(server_fd);
        return 1;
    }

    std::cout << "Echo server listening on port 5000...\n";

    // Step 5: Accept client connection
    sockaddr_in client_addr{};
    socklen_t client_len = sizeof(client_addr);
    int client_fd = accept(server_fd, (sockaddr*)&client_addr, &client_len);
    if (client_fd < 0) {
        perror("accept failed");
        close(server_fd);
        return 1;
    }

    char client_ip[INET_ADDRSTRLEN];
    inet_ntop(AF_INET, &client_addr.sin_addr, client_ip, INET_ADDRSTRLEN);
    std::cout << "Client connected from " << client_ip
              << ":" << ntohs(client_addr.sin_port) << "\n";

    // Step 6: Echo loop
    char buffer[1024];
    while (true) {
        int bytes_received = recv(client_fd, buffer, sizeof(buffer) - 1, 0);
        if (bytes_received < 0) {
            perror("recv failed");
            break;
        }
        if (bytes_received == 0) {
            std::cout << "Client disconnected\n";
            break;
        }

        buffer[bytes_received] = '\0';
        std::cout << "Received: " << buffer << "\n";

        // Echo back to client
        int bytes_sent = send(client_fd, buffer, bytes_received, MSG_NOSIGNAL);
        if (bytes_sent < 0) {
            perror("send failed");
            break;
        }
    }

    // Step 7: Cleanup
    close(client_fd);
    close(server_fd);
    return 0;
}
```

This demonstrates the complete server lifecycle. The server accepts one client, echoes received messages back, and exits when the client disconnects. Notice error checking on every system call—essential for production code.

#### Example 2: Simple TCP Client

```cpp
#include <iostream>
#include <cstring>
#include <unistd.h>
#include <arpa/inet.h>
#include <sys/socket.h>

int main() {
    // Step 1: Create socket
    int client_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (client_fd < 0) {
        perror("socket failed");
        return 1;
    }

    // Step 2: Specify server address
    sockaddr_in server_addr{};
    server_addr.sin_family = AF_INET;
    server_addr.sin_port = htons(5000);  // Server port

    // Convert IP address from text to binary
    if (inet_pton(AF_INET, "127.0.0.1", &server_addr.sin_addr) <= 0) {
        perror("invalid address");
        close(client_fd);
        return 1;
    }

    // Step 3: Connect to server
    if (connect(client_fd, (sockaddr*)&server_addr, sizeof(server_addr)) < 0) {
        perror("connection failed");
        close(client_fd);
        return 1;
    }

    std::cout << "Connected to server\n";

    // Step 4: Send message
    const char* message = "Hello from client";
    int bytes_sent = send(client_fd, message, strlen(message), MSG_NOSIGNAL);
    if (bytes_sent < 0) {
        perror("send failed");
        close(client_fd);
        return 1;
    }

    std::cout << "Sent: " << message << "\n";

    // Step 5: Receive response
    char buffer[1024];
    int bytes_received = recv(client_fd, buffer, sizeof(buffer) - 1, 0);
    if (bytes_received < 0) {
        perror("recv failed");
        close(client_fd);
        return 1;
    }

    buffer[bytes_received] = '\0';
    std::cout << "Received: " << buffer << "\n";

    // Step 6: Cleanup
    close(client_fd);
    return 0;
}
```

Client is simpler: create socket, connect, send/receive, close. The connect() call blocks until the connection is established or fails. For autonomous vehicles, the client might send GPS coordinates and receive navigation waypoints.

#### Example 3: Robust send_all Function

```cpp
#include <sys/socket.h>
#include <errno.h>

// Send exactly 'length' bytes, handling partial sends and interrupts
ssize_t send_all(int socket_fd, const void* buffer, size_t length) {
    const char* ptr = static_cast<const char*>(buffer);
    size_t total_sent = 0;

    while (total_sent < length) {
        ssize_t bytes = send(socket_fd, ptr + total_sent,
                            length - total_sent, MSG_NOSIGNAL);

        if (bytes < 0) {
            if (errno == EINTR) {
                // Interrupted by signal, retry
                continue;
            }
            // Real error (EPIPE, ECONNRESET, etc.)
            return -1;
        }

        if (bytes == 0) {
            // Connection closed by peer
            return total_sent;
        }

        total_sent += bytes;
    }

    return total_sent;  // Successfully sent all data
}

// Usage example
void send_message(int client_fd) {
    const char* message = "This is a long message that might require multiple send() calls";
    ssize_t result = send_all(client_fd, message, strlen(message));

    if (result < 0) {
        perror("send_all failed");
    } else if (result < strlen(message)) {
        std::cerr << "Connection closed, only sent " << result << " bytes\n";
    } else {
        std::cout << "Successfully sent all " << result << " bytes\n";
    }
}
```

This handles partial sends and interrupted system calls (EINTR). Production code should always use send_all rather than raw send() for reliable data transfer.

#### Example 4: Receiving Fixed-Length Messages

```cpp
// Receive exactly 'length' bytes, handling partial receives
ssize_t recv_all(int socket_fd, void* buffer, size_t length) {
    char* ptr = static_cast<char*>(buffer);
    size_t total_received = 0;

    while (total_received < length) {
        ssize_t bytes = recv(socket_fd, ptr + total_received,
                            length - total_received, 0);

        if (bytes < 0) {
            if (errno == EINTR) {
                // Interrupted by signal, retry
                continue;
            }
            // Real error
            return -1;
        }

        if (bytes == 0) {
            // Connection closed (EOF)
            return total_received;  // Return what we received so far
        }

        total_received += bytes;
    }

    return total_received;
}

// Example: Receiving a structured message
struct MessageHeader {
    uint32_t message_id;
    uint32_t payload_length;
};

bool receive_message(int socket_fd) {
    MessageHeader header;

    // Receive fixed-size header
    ssize_t bytes = recv_all(socket_fd, &header, sizeof(header));
    if (bytes != sizeof(header)) {
        std::cerr << "Failed to receive complete header\n";
        return false;
    }

    // Convert from network byte order
    header.message_id = ntohl(header.message_id);
    header.payload_length = ntohl(header.payload_length);

    std::cout << "Message ID: " << header.message_id
              << ", Payload length: " << header.payload_length << "\n";

    // Receive variable-length payload
    std::vector<char> payload(header.payload_length);
    bytes = recv_all(socket_fd, payload.data(), header.payload_length);
    if (bytes != header.payload_length) {
        std::cerr << "Failed to receive complete payload\n";
        return false;
    }

    std::cout << "Received payload: "
              << std::string(payload.begin(), payload.end()) << "\n";
    return true;
}
```

This demonstrates message framing: sending a header with length information, then the payload. Essential for protocols where messages have variable length.

#### Example 5: Non-Blocking Socket with Error Handling

```cpp
#include <fcntl.h>
#include <sys/socket.h>
#include <errno.h>
#include <iostream>

// Make socket non-blocking
bool set_nonblocking(int socket_fd) {
    int flags = fcntl(socket_fd, F_GETFL, 0);
    if (flags < 0) {
        perror("fcntl F_GETFL");
        return false;
    }

    if (fcntl(socket_fd, F_SETFL, flags | O_NONBLOCK) < 0) {
        perror("fcntl F_SETFL");
        return false;
    }

    return true;
}

void non_blocking_example(int socket_fd) {
    set_nonblocking(socket_fd);

    char buffer[1024];

    while (true) {
        ssize_t bytes = recv(socket_fd, buffer, sizeof(buffer), 0);

        if (bytes < 0) {
            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                // No data available right now, do other work
                std::cout << "No data available, doing other work...\n";
                usleep(100000);  // Sleep 100ms, then try again
                continue;
            }
            // Real error
            perror("recv error");
            break;
        }

        if (bytes == 0) {
            std::cout << "Connection closed\n";
            break;
        }

        // Process received data
        buffer[bytes] = '\0';
        std::cout << "Received: " << buffer << "\n";
    }
}
```

Non-blocking sockets return immediately with EAGAIN/EWOULDBLOCK if no data is available. This allows your program to do other work instead of waiting. Essential for servers handling multiple connections efficiently.

#### Example 6: Socket Timeouts (Handling Slow Clients)

```cpp
#include <sys/socket.h>
#include <sys/time.h>
#include <iostream>

bool set_recv_timeout(int socket_fd, int seconds) {
    struct timeval timeout;
    timeout.tv_sec = seconds;
    timeout.tv_usec = 0;

    if (setsockopt(socket_fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout)) < 0) {
        perror("setsockopt SO_RCVTIMEO");
        return false;
    }
    return true;
}

bool set_send_timeout(int socket_fd, int seconds) {
    struct timeval timeout;
    timeout.tv_sec = seconds;
    timeout.tv_usec = 0;

    if (setsockopt(socket_fd, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout)) < 0) {
        perror("setsockopt SO_SNDTIMEO");
        return false;
    }
    return true;
}

void handle_client_with_timeout(int client_fd) {
    // Set 5-second timeout for receives
    set_recv_timeout(client_fd, 5);

    // Set 10-second timeout for sends
    set_send_timeout(client_fd, 10);

    char buffer[1024];
    ssize_t bytes = recv(client_fd, buffer, sizeof(buffer), 0);

    if (bytes < 0) {
        if (errno == EAGAIN || errno == EWOULDBLOCK) {
            std::cerr << "Client timeout - no data received in 5 seconds\n";
            close(client_fd);
            return;
        }
        perror("recv error");
        close(client_fd);
        return;
    }

    // Process data...
    buffer[bytes] = '\0';
    std::cout << "Received within timeout: " << buffer << "\n";
}
```

Timeouts prevent your server from hanging indefinitely on slow or stalled clients. Critical for production servers to maintain responsiveness.

#### Example 7: Getting Peer Information

```cpp
#include <arpa/inet.h>
#include <sys/socket.h>
#include <iostream>
#include <cstring>

void print_peer_info(int socket_fd) {
    sockaddr_in peer_addr;
    socklen_t peer_len = sizeof(peer_addr);

    // Get peer address
    if (getpeername(socket_fd, (sockaddr*)&peer_addr, &peer_len) < 0) {
        perror("getpeername failed");
        return;
    }

    char ip_str[INET_ADDRSTRLEN];
    inet_ntop(AF_INET, &peer_addr.sin_addr, ip_str, INET_ADDRSTRLEN);

    std::cout << "Peer IP: " << ip_str << "\n";
    std::cout << "Peer Port: " << ntohs(peer_addr.sin_port) << "\n";
}

void print_local_info(int socket_fd) {
    sockaddr_in local_addr;
    socklen_t local_len = sizeof(local_addr);

    // Get local address
    if (getsockname(socket_fd, (sockaddr*)&local_addr, &local_len) < 0) {
        perror("getsockname failed");
        return;
    }

    char ip_str[INET_ADDRSTRLEN];
    inet_ntop(AF_INET, &local_addr.sin_addr, ip_str, INET_ADDRSTRLEN);

    std::cout << "Local IP: " << ip_str << "\n";
    std::cout << "Local Port: " << ntohs(local_addr.sin_port) << "\n";
}

// Usage in server
void handle_client(int client_fd) {
    std::cout << "=== Connection Info ===\n";
    print_local_info(client_fd);   // Server's local address
    print_peer_info(client_fd);    // Client's address
    std::cout << "=====================\n";

    // Handle client...
}
```

Useful for logging, access control, and debugging. In autonomous vehicles, you might want to verify connections come from authorized cloud servers.

#### Example 8: UDP Socket for Comparison

```cpp
#include <iostream>
#include <cstring>
#include <arpa/inet.h>
#include <sys/socket.h>
#include <unistd.h>

// UDP Server (connectionless)
void udp_server_example() {
    // Create UDP socket (SOCK_DGRAM instead of SOCK_STREAM)
    int udp_fd = socket(AF_INET, SOCK_DGRAM, 0);
    if (udp_fd < 0) {
        perror("socket failed");
        return;
    }

    sockaddr_in server_addr{};
    server_addr.sin_family = AF_INET;
    server_addr.sin_addr.s_addr = INADDR_ANY;
    server_addr.sin_port = htons(6000);

    if (bind(udp_fd, (sockaddr*)&server_addr, sizeof(server_addr)) < 0) {
        perror("bind failed");
        close(udp_fd);
        return;
    }

    std::cout << "UDP server listening on port 6000...\n";

    char buffer[1024];
    sockaddr_in client_addr;
    socklen_t client_len = sizeof(client_addr);

    while (true) {
        // No accept() needed - UDP is connectionless
        ssize_t bytes = recvfrom(udp_fd, buffer, sizeof(buffer) - 1, 0,
                                (sockaddr*)&client_addr, &client_len);

        if (bytes < 0) {
            perror("recvfrom failed");
            continue;
        }

        buffer[bytes] = '\0';

        char client_ip[INET_ADDRSTRLEN];
        inet_ntop(AF_INET, &client_addr.sin_addr, client_ip, INET_ADDRSTRLEN);

        std::cout << "Received from " << client_ip << ": " << buffer << "\n";

        // Echo back to sender
        sendto(udp_fd, buffer, bytes, 0,
               (sockaddr*)&client_addr, client_len);
    }

    close(udp_fd);
}

// UDP Client
void udp_client_example() {
    int udp_fd = socket(AF_INET, SOCK_DGRAM, 0);
    if (udp_fd < 0) {
        perror("socket failed");
        return;
    }

    sockaddr_in server_addr{};
    server_addr.sin_family = AF_INET;
    server_addr.sin_port = htons(6000);
    inet_pton(AF_INET, "127.0.0.1", &server_addr.sin_addr);

    const char* message = "Hello UDP";

    // No connect() needed for UDP (optional)
    ssize_t bytes = sendto(udp_fd, message, strlen(message), 0,
                          (sockaddr*)&server_addr, sizeof(server_addr));

    if (bytes < 0) {
        perror("sendto failed");
        close(udp_fd);
        return;
    }

    std::cout << "Sent: " << message << "\n";

    // Receive response
    char buffer[1024];
    socklen_t server_len = sizeof(server_addr);
    bytes = recvfrom(udp_fd, buffer, sizeof(buffer) - 1, 0,
                     (sockaddr*)&server_addr, &server_len);

    if (bytes >= 0) {
        buffer[bytes] = '\0';
        std::cout << "Received: " << buffer << "\n";
    }

    close(udp_fd);
}
```

**TCP vs UDP Comparison**:
- **TCP**: Connection-oriented, reliable, ordered delivery, use for critical data (HD maps, commands)
- **UDP**: Connectionless, unreliable, faster, use for sensor streams where occasional loss is acceptable (lidar point clouds)

---

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

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Q1
```cpp
sockaddr_in addr{};
addr.sin_family = AF_INET;
addr.sin_port = 8080;  // Missing htons()
addr.sin_addr.s_addr = INADDR_ANY;

int fd = socket(AF_INET, SOCK_STREAM, 0);
bind(fd, (sockaddr*)&addr, sizeof(addr));
listen(fd, 5);

std::cout << "Server listening on port: " << ntohs(addr.sin_port) << "\n";
```
What port number will actually be printed? What's wrong with this code?

#### Q2
```cpp
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
```
Will the second bind() succeed? Why or why not?

#### Q3
```cpp
int client_fd = accept(server_fd, NULL, NULL);
char message[] = "Hello Client";
int bytes = send(client_fd, message, strlen(message), 0);
std::cout << "Sent " << bytes << " bytes\n";

// Client closes connection here

bytes = send(client_fd, message, strlen(message), 0);
std::cout << "Sent " << bytes << " more bytes\n";  // Will this execute?
```
What happens when the second send() is called? Will the program crash?

#### Q4
```cpp
char data[10000];
memset(data, 'A', sizeof(data));

int sent = send(socket_fd, data, 10000, MSG_NOSIGNAL);
if (sent == 10000) {
    std::cout << "All data sent successfully\n";
} else {
    std::cout << "Only sent " << sent << " bytes\n";
}
```
Is this correct code for sending all data? What could go wrong?

#### Q5
```cpp
int client_fd = connect_to_server();

recv(client_fd, buffer, 1024, 0);  // Assume this blocks
// Signal arrives (SIGALRM)
// What does recv() return?

if (/* some condition */) {
    // Should we retry recv()?
}
```
What condition should you check before retrying recv()? What errno value?

#### Q6
```cpp
int bytes = recv(client_fd, buffer, 100, 0);
buffer[bytes] = '\0';  // Null-terminate
std::cout << "Received: " << buffer << "\n";
```
What's potentially wrong with this code? When will it fail?

#### Q7
```cpp
sockaddr_in server_addr{};
server_addr.sin_family = AF_INET;
server_addr.sin_port = htons(5000);
server_addr.sin_addr.s_addr = inet_addr("192.168.1.100");  // Old API

if (server_addr.sin_addr.s_addr == INADDR_NONE) {
    std::cerr << "Invalid IP\n";
}
```
What's the problem with using inet_addr()? What modern API should be used?

#### Q8
```cpp
for (int i = 0; i < 1000; i++) {
    int client_fd = accept(server_fd, NULL, NULL);
    handle_client(client_fd);
    // Forgot to close(client_fd)
}
```
After how many iterations might this fail? What error will occur?

#### Q9
```cpp
int listen_fd = socket(AF_INET, SOCK_STREAM, 0);
bind(listen_fd, ...);
listen(listen_fd, 3);  // Backlog = 3

// 5 clients connect simultaneously before any accept()
// How many connections will be accepted?
// What happens to client 4 and 5?
```

#### Q10
```cpp
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
What happens when sender and receiver have different endianness? Where's the bug?

#### Q11
```cpp
int fd = socket(AF_INET, SOCK_STREAM, 0);
connect(fd, &server_addr, sizeof(server_addr));

send(fd, "Hello", 5, 0);
shutdown(fd, SHUT_WR);

char buffer[100];
int bytes = recv(fd, buffer, 100, 0);  // Will this work?
```
Will recv() work after shutdown(SHUT_WR)? What about send()?

#### Q12
```cpp
sockaddr_in addr{};
addr.sin_family = AF_INET;
addr.sin_port = htons(0);  // Port = 0
addr.sin_addr.s_addr = INADDR_ANY;

bind(listen_fd, (sockaddr*)&addr, sizeof(addr));
listen(listen_fd, 5);

// What port is the server actually listening on?
```

#### Q13
```cpp
int udp_fd = socket(AF_INET, SOCK_DGRAM, 0);
bind(udp_fd, &addr, sizeof(addr));

int client_fd = accept(udp_fd, NULL, NULL);  // What happens?
```
Will accept() work on a UDP socket? What error will you get?

#### Q14
```cpp
char buffer[10];
int bytes = recv(socket_fd, buffer, sizeof(buffer), 0);

if (bytes == 0) {
    std::cout << "No data received\n";
} else if (bytes > 0) {
    std::cout << "Received " << bytes << " bytes\n";
}
```
What does bytes == 0 actually mean? Is the message correct?

#### Q15
```cpp
fcntl(socket_fd, F_SETFL, O_NONBLOCK);

int bytes = recv(socket_fd, buffer, 1024, 0);
if (bytes < 0) {
    perror("recv failed");  // Always an error?
}
```
Is every bytes < 0 an actual error for non-blocking sockets? What should you check?

#### Q16
```cpp
int socket_fd = socket(AF_INET, SOCK_STREAM, 0);

struct timeval timeout;
timeout.tv_sec = 5;
timeout.tv_usec = 0;
setsockopt(socket_fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));

recv(socket_fd, buffer, 1024, 0);  // Blocks for 5 seconds max
// After 5 seconds with no data, what does recv() return?
```

#### Q17
```cpp
int server_fd = socket(AF_INET, SOCK_STREAM, 0);
bind(server_fd, &addr, sizeof(addr));
listen(server_fd, 5);

int client1 = accept(server_fd, NULL, NULL);
int client2 = accept(server_fd, NULL, NULL);

send(server_fd, "Hello", 5, 0);  // Bug! What's wrong?
```
Why is sending data on server_fd wrong? Which FD should you use?

#### Q18
```cpp
if (fork() == 0) {
    // Child process
    int client_fd = accept(server_fd, NULL, NULL);
    handle_client(client_fd);
    close(client_fd);
    exit(0);
}
// Parent continues
```
After child calls close(client_fd), is the client connection actually closed? Why or why not?

#### Q19
```cpp
sockaddr_in addr;
socklen_t len = sizeof(addr);
int client_fd = accept(server_fd, (sockaddr*)&addr, &len);

std::cout << "Client port: " << addr.sin_port << "\n";  // Bug!
```
What's wrong with this line? What will be printed?

#### Q20
```cpp
std::vector<int> clients;

for (int client_fd : clients) {
    char buffer[1024];
    int bytes = recv(client_fd, buffer, sizeof(buffer), 0);  // Blocks!

    if (bytes > 0) {
        process_data(client_fd, buffer, bytes);
    }
}
```
What's the problem with this multi-client handling approach? How should it be fixed?

---

### QUICK_REFERENCE: Answer Key and Summary Tables

#### Answer Key for Practice Questions

**Q1:** Will print **31,744** (0x7C00 in hex, which is 8080 in little-endian read as big-endian). Bug: Missing htons(8080). Server actually binds to port 31,744 instead of 8080.

**Q2:** Second bind() **fails** with errno = EADDRINUSE (Address already in use). Port is in TIME_WAIT state for ~60 seconds. Solution: Set SO_REUSEADDR before first bind().

**Q3:** First send() succeeds. Second send() **returns -1** with errno = EPIPE. Program does NOT crash if MSG_NOSIGNAL was used or SIGPIPE is ignored. Without MSG_NOSIGNAL, program **crashes** with SIGPIPE signal.

**Q4:** **Not correct**. Even if sent == 10000, it doesn't guarantee all data was sent—just that the first send() call sent 10000 bytes. For large data, may need multiple send() calls. Should check sent > 0 and loop if needed (use send_all()).

**Q5:** recv() returns **-1**. Check `errno == EINTR`. If true, retry recv(). EINTR means system call was interrupted by signal, not a real error.

**Q6:** Bug: **recv() can return -1 or 0**. If bytes == -1 (error) or bytes == 0 (connection closed), buffer[bytes] accesses invalid memory (buffer[-1] or buffer[0] when no data received). Always check bytes > 0 before accessing buffer.

**Q7:** Problem: inet_addr() is **deprecated**, doesn't support IPv6, returns INADDR_NONE on error (which is also valid IP 255.255.255.255). Use **inet_pton(AF_INET, "192.168.1.100", &server_addr.sin_addr)** instead.

**Q8:** Depends on FD limit (ulimit -n). Typically **fails around iteration 1020** (default limit 1024 minus 3 for stdin/stdout/stderr/listen_fd). Error: **EMFILE** (Too many open files). Fix: close(client_fd) after handle_client().

**Q9:** With backlog=3, typically **3-4 connections** accepted (varies by OS). Clients 4 and 5 either get **connection refused** or SYN is silently dropped (client retries). Modern kernels may accept 4-5 with backlog=3 (backlog is not exact limit).

**Q10:** Bug in send_message(): length is sent in **host byte order** instead of network byte order. Receiver converts using ntohl(), so on little-endian sender + big-endian receiver (or vice versa), length is scrambled. Fix: `uint32_t length = htonl(msg.size())`.

**Q11:** recv() **works** after shutdown(SHUT_WR). SHUT_WR closes write side only (half-close). Can still receive data. send() will **fail** with errno = EPIPE.

**Q12:** Port 0 means **"assign any available port"**. Kernel chooses an ephemeral port (typically 32768-61000). Use getsockname() after bind() to discover actual port.

**Q13:** accept() **fails** with errno = EOPNOTSUPP (Operation not supported). accept() only works on connection-oriented sockets (SOCK_STREAM/TCP). UDP (SOCK_DGRAM) is connectionless—use recvfrom() instead.

**Q14:** bytes == 0 means **peer closed connection gracefully** (EOF), NOT "no data". Message is misleading. Should say "Connection closed" or "Peer disconnected".

**Q15:** No! For non-blocking sockets, bytes < 0 with errno == EAGAIN or errno == EWOULDBLOCK means "no data available, try later" (not an error). Check: `if (bytes < 0 && errno != EAGAIN && errno != EWOULDBLOCK)` for real errors.

**Q16:** recv() returns **-1** with errno = EAGAIN or errno = EWOULDBLOCK (timeout). Not a real error—just means no data arrived within 5 seconds.

**Q17:** Bug: server_fd is **listening socket**, not connected to any client. Cannot send data on it. Should send on client1 or client2 (sockets returned by accept()).

**Q18:** Connection is **NOT closed** immediately. After fork(), both parent and child have references to client_fd (reference count = 2). Child's close() decrements to 1—socket remains open in parent. Connection actually closes when parent also closes it (or parent exits).

**Q19:** Bug: Forgot **ntohs()**. Will print port in network byte order (big-endian). On little-endian system, port 5000 (0x1388) prints as 34835 (0x8813). Fix: `ntohs(addr.sin_port)`.

**Q20:** Problem: **recv() blocks**. If first client has no data, loop hangs and other clients aren't served. Solution: Use **I/O multiplexing** (select/poll/epoll) or non-blocking sockets to check all clients without blocking.

#### Socket API Cheat Sheet

| Function | Purpose | Typical Usage |
|----------|---------|---------------|
| `socket()` | Create socket endpoint | `int fd = socket(AF_INET, SOCK_STREAM, 0);` |
| `bind()` | Assign address to socket | `bind(fd, (sockaddr*)&addr, sizeof(addr));` |
| `listen()` | Mark socket as passive | `listen(fd, backlog);` |
| `accept()` | Accept incoming connection | `int client = accept(fd, &addr, &len);` |
| `connect()` | Connect to server | `connect(fd, (sockaddr*)&addr, sizeof(addr));` |
| `send()` | Send data (TCP) | `send(fd, data, len, MSG_NOSIGNAL);` |
| `recv()` | Receive data (TCP) | `recv(fd, buffer, size, 0);` |
| `sendto()` | Send datagram (UDP) | `sendto(fd, data, len, 0, &addr, addrlen);` |
| `recvfrom()` | Receive datagram (UDP) | `recvfrom(fd, buf, size, 0, &addr, &len);` |
| `close()` | Close socket | `close(fd);` |
| `shutdown()` | Shutdown one direction | `shutdown(fd, SHUT_WR);` |
| `setsockopt()` | Set socket option | `setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));` |
| `getsockopt()` | Get socket option | `getsockopt(fd, SOL_SOCKET, SO_ERROR, &err, &len);` |
| `getpeername()` | Get peer address | `getpeername(fd, (sockaddr*)&addr, &len);` |
| `getsockname()` | Get local address | `getsockname(fd, (sockaddr*)&addr, &len);` |

#### Byte Order Conversion Functions

| Function | Converts | Bits | Example |
|----------|----------|------|---------|
| `htons()` | Host to Network Short | 16 | `sin_port = htons(5000);` |
| `htonl()` | Host to Network Long | 32 | `sin_addr.s_addr = htonl(INADDR_ANY);` |
| `ntohs()` | Network to Host Short | 16 | `port = ntohs(addr.sin_port);` |
| `ntohl()` | Network to Host Long | 32 | `length = ntohl(header.length);` |

**Mnemonic:** h=host, n=network, s=short(16-bit), l=long(32-bit)

**Always convert:** Port numbers, IP addresses, protocol headers before sending; convert back after receiving.

#### IP Address Conversion Functions

| Function | Converts | IPv6 Support | Example |
|----------|----------|--------------|---------|
| `inet_pton()` | Text → Binary | Yes | `inet_pton(AF_INET, "192.168.1.1", &addr.sin_addr);` |
| `inet_ntop()` | Binary → Text | Yes | `inet_ntop(AF_INET, &addr.sin_addr, str, INET_ADDRSTRLEN);` |
| `inet_addr()` | Text → Binary | No | **Deprecated** - use inet_pton() |
| `inet_ntoa()` | Binary → Text | No | **Deprecated** - use inet_ntop() |

#### Common Socket Options

| Option | Level | Purpose | Example Value |
|--------|-------|---------|---------------|
| `SO_REUSEADDR` | SOL_SOCKET | Reuse address in TIME_WAIT | 1 (enable) |
| `SO_REUSEPORT` | SOL_SOCKET | Multiple sockets on same port | 1 (enable) |
| `SO_KEEPALIVE` | SOL_SOCKET | Enable TCP keep-alive | 1 (enable) |
| `SO_RCVTIMEO` | SOL_SOCKET | Receive timeout | struct timeval |
| `SO_SNDTIMEO` | SOL_SOCKET | Send timeout | struct timeval |
| `SO_SNDBUF` | SOL_SOCKET | Send buffer size | bytes (int) |
| `SO_RCVBUF` | SOL_SOCKET | Receive buffer size | bytes (int) |
| `TCP_NODELAY` | IPPROTO_TCP | Disable Nagle's algorithm | 1 (disable) |
| `TCP_KEEPIDLE` | IPPROTO_TCP | Keep-alive idle time | seconds (int) |
| `TCP_KEEPINTVL` | IPPROTO_TCP | Keep-alive interval | seconds (int) |
| `TCP_KEEPCNT` | IPPROTO_TCP | Keep-alive probe count | count (int) |

#### Error Codes Reference

| errno | Constant | Meaning | When It Occurs |
|-------|----------|---------|----------------|
| EADDRINUSE | Address in use | Port already bound | bind() when port in use |
| EADDRNOTAVAIL | Address not available | Invalid local address | bind() with wrong IP |
| ECONNREFUSED | Connection refused | No listener on port | connect() to closed port |
| ECONNRESET | Connection reset | Peer crashed/reset | recv() after RST packet |
| ETIMEDOUT | Timed out | Connection timeout | connect() timeout |
| EHOSTUNREACH | Host unreachable | Network routing issue | connect() to unreachable host |
| EINPROGRESS | In progress | Non-blocking connect started | connect() on non-blocking socket |
| EINTR | Interrupted | Signal interrupted syscall | Any blocking call during signal |
| EAGAIN/EWOULDBLOCK | Would block | No data on non-blocking | recv() on non-blocking socket |
| EPIPE | Broken pipe | Write to closed socket | send() to closed connection |
| EMFILE | Too many files | FD limit reached | accept() when out of FDs |
| ENFILE | Too many files (system) | System FD limit | accept() when system limit reached |

#### Common Flags

**send() flags:**
- `MSG_NOSIGNAL` - Don't generate SIGPIPE
- `MSG_DONTWAIT` - Non-blocking operation
- `MSG_MORE` - More data coming (don't send yet)

**recv() flags:**
- `MSG_PEEK` - Peek at data without removing
- `MSG_WAITALL` - Wait for full request or error
- `MSG_DONTWAIT` - Non-blocking operation

#### Socket States (TCP)

| State | Meaning |
|-------|---------|
| CLOSED | No connection |
| LISTEN | Server waiting for connections |
| SYN_SENT | Client sent SYN, waiting for SYN-ACK |
| SYN_RECEIVED | Server received SYN, sent SYN-ACK |
| ESTABLISHED | Connection established, data transfer |
| FIN_WAIT_1 | Closing, sent FIN, waiting for ACK |
| FIN_WAIT_2 | Closing, received ACK of FIN |
| CLOSE_WAIT | Peer sent FIN, waiting for local close |
| CLOSING | Both sides closing simultaneously |
| LAST_ACK | Sent FIN, waiting for final ACK |
| TIME_WAIT | Closed, waiting 2*MSL for delayed packets |

**TIME_WAIT duration:** Typically 60 seconds (2 * MSL where MSL=30s)

#### TCP vs UDP Quick Comparison

| Feature | TCP (SOCK_STREAM) | UDP (SOCK_DGRAM) |
|---------|-------------------|------------------|
| Connection | Connection-oriented | Connectionless |
| Reliability | Reliable (guaranteed delivery) | Unreliable (best effort) |
| Ordering | Ordered packets | No ordering guarantee |
| Speed | Slower (overhead) | Faster (minimal overhead) |
| Use case | File transfer, web, email | Streaming, gaming, DNS |
| API | socket→bind→listen→accept | socket→bind→recvfrom |
| Header size | 20+ bytes | 8 bytes |
| Flow control | Yes (sliding window) | No |
| Congestion control | Yes | No |

#### Performance Tuning Quick Wins

1. **Always set SO_REUSEADDR** on server listening sockets
2. **Use MSG_NOSIGNAL** or ignore SIGPIPE globally
3. **Implement send_all() and recv_all()** wrappers
4. **Use RAII (SocketGuard)** to prevent FD leaks
5. **Set reasonable backlog** (128+ for production)
6. **Increase FD limits** for high-connection servers
7. **Use non-blocking + epoll** for C10K scalability
8. **Enable TCP_NODELAY** for low-latency protocols
9. **Tune SO_SNDBUF/SO_RCVBUF** for high-throughput
10. **Implement connection timeouts** to prevent hangs

#### Interview Tips

**Beginner topics to master:**
- TCP vs UDP differences
- Socket lifecycle (socket→bind→listen→accept)
- What each syscall does
- recv() returning 0 means connection closed
- Basic error handling

**Intermediate topics:**
- SIGPIPE and MSG_NOSIGNAL
- Partial send/recv and send_all pattern
- SO_REUSEADDR for server restart
- Byte order (htons/htonl)
- Non-blocking sockets basics

**Advanced topics:**
- I/O multiplexing (select/poll/epoll)
- C10K problem and solutions
- TCP 3-way handshake internals
- Keep-alive strategies
- File descriptor limits
- Zero-copy techniques
- Connection pooling

**Red flags in interviews:**
- Not checking return values
- Forgetting to close() sockets
- Not handling EINTR
- Assuming send() sends all data
- Using deprecated APIs (inet_addr)
- Forgetting byte order conversion

---

**End of Topic 1: TCP/IP Socket Fundamentals**
