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
