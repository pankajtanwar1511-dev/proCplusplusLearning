## TOPIC: Multi-Client Server Patterns - Scaling Beyond One Connection

### THEORY_SECTION: Core Concepts and Foundations

#### The Single-Client Problem

In Topic 1, we built servers that handle one client at a time. This is like a restaurant with one table—customers must wait in line until the previous customer finishes eating. For most real-world applications, this is unacceptable.

```cpp
while (true) {
    int client_fd = accept(server_fd, ...);  // Accept one client
    handle_client(client_fd);                // Blocks here until done
    close(client_fd);                        // Only then can we accept next client
}
```

**Problem**: While handling one client, all other clients are blocked. If `handle_client()` takes 10 seconds, the second client waits 10 seconds, the third waits 20 seconds, and so on.

In autonomous vehicle systems, imagine a cloud server that can only handle one vehicle's request at a time. If 1,000 vehicles need map updates simultaneously, the last vehicle waits over 2 hours!

#### Multi-Client Server Strategies

There are several approaches to handle multiple clients concurrently:

1. **Fork-based (Process per client)** - Create new process for each client
2. **Thread-based (Thread per client)** - Create new thread for each client
3. **Thread Pool** - Pre-create threads, assign clients to available threads
4. **I/O Multiplexing** - Single thread monitors multiple connections (Topics 3-5)

Each strategy has trade-offs in complexity, scalability, and resource usage.

#### Strategy 1: Fork-Based Server (Process Per Client)

**Concept**: When a client connects, fork() creates a child process to handle that client. The parent continues accepting new clients.

```
Parent Process                     Child Processes
     |                                   |
accept() ──> fork() ──> Child 1 ──> handle_client() ──> exit
     |                                   |
accept() ──> fork() ──> Child 2 ──> handle_client() ──> exit
     |                                   |
accept() ──> fork() ──> Child 3 ──> handle_client() ──> exit
```

**How it works**:
- Parent listens for connections
- On new client, fork() creates identical copy of process
- Child process handles client, then exits
- Parent immediately accepts next client (no blocking)

**Advantages**:
- **Simple**: Each child is independent, straightforward code
- **Isolation**: One client crash doesn't affect others (separate memory spaces)
- **Robust**: Parent can monitor and restart crashed children

**Disadvantages**:
- **Heavy**: Each process consumes significant memory (separate address space)
- **Slow creation**: fork() is expensive (copy memory, file descriptors)
- **Limited scalability**: OS limits on process count (~1000-10000)
- **IPC complexity**: Processes need shared memory/pipes to communicate

**When to use**:
- Small number of concurrent clients (< 100)
- Long-lived connections
- Need strong isolation between clients
- Security-critical applications (compromised child can't affect parent)

**Real-world example**: Traditional Apache web server (MPM prefork mode)

#### Strategy 2: Thread-Based Server (Thread Per Client)

**Concept**: When a client connects, create a new thread to handle that client. All threads share the same process memory.

```
Main Thread                        Worker Threads
     |                                   |
accept() ──> pthread_create() ──> Thread 1 ──> handle_client()
     |                                   |
accept() ──> pthread_create() ──> Thread 2 ──> handle_client()
     |                                   |
accept() ──> pthread_create() ──> Thread 3 ──> handle_client()
```

**How it works**:
- Main thread listens for connections
- On new client, pthread_create() or std::thread creates worker thread
- Worker thread handles client, then exits
- Main thread immediately accepts next client

**Advantages**:
- **Lighter than processes**: Threads share memory, lower overhead
- **Faster creation**: Thread creation faster than fork()
- **Easy communication**: Shared memory makes data sharing simple
- **Better scalability**: Can handle more clients than fork-based

**Disadvantages**:
- **Shared memory bugs**: Race conditions, deadlocks if not careful
- **No isolation**: One thread crash can crash entire process
- **Thread limit**: Still limited by OS (typically 1000-10000 threads)
- **Context switching**: Too many threads degrades performance

**When to use**:
- Moderate number of concurrent clients (100-1000)
- Need to share data between clients (e.g., chat server)
- Shorter connections
- Performance matters more than isolation

**Real-world example**: Many game servers, chat servers

#### Strategy 3: Thread Pool Pattern

**Concept**: Pre-create a fixed number of worker threads. When client connects, assign to available thread from pool. Threads are reused, not created/destroyed per client.

```
Main Thread              Thread Pool                 Connection Queue
     |                      |                              |
accept() ──> enqueue() ──> [Thread 1] ──> dequeue() ──> handle_client()
     |                      [Thread 2] ──> dequeue() ──> handle_client()
accept() ──> enqueue() ──> [Thread 3] ──> dequeue() ──> handle_client()
     |                      [Thread 4] ──> dequeue() ──> handle_client()
accept() ──> enqueue() ──>   ...
```

**How it works**:
- Create fixed number of worker threads at startup (e.g., 10 threads)
- Threads wait on a queue for work
- When client connects, add connection to queue
- Available thread picks up connection from queue and handles it
- After handling, thread returns to pool (not destroyed)

**Advantages**:
- **No creation overhead**: Threads created once, reused many times
- **Bounded resources**: Fixed thread count prevents resource exhaustion
- **Better performance**: Optimal thread count for CPU cores (e.g., 8 threads for 8 cores)
- **Graceful degradation**: Queue buffers bursts, clients wait but aren't rejected

**Disadvantages**:
- **More complex**: Need thread-safe queue, synchronization
- **Queue management**: Must handle queue full scenarios
- **Tuning required**: Thread count affects performance (too few = bottleneck, too many = overhead)

**When to use**:
- High-throughput servers (thousands of short-lived connections)
- Known workload characteristics
- Production systems where predictable resource usage matters
- When clients can tolerate brief queuing

**Optimal thread count**: Typically number of CPU cores for CPU-bound work, or 2-4x CPU cores for I/O-bound work.

**Real-world example**: Web servers (nginx with thread pools), database connection pools

#### Strategy Comparison Table

| Aspect | Fork-Based | Thread-Based | Thread Pool | I/O Multiplexing |
|--------|------------|--------------|-------------|------------------|
| **Creation cost** | High (fork) | Medium (thread create) | Low (reuse) | None |
| **Memory usage** | High (separate address space) | Medium (shared memory) | Low (fixed threads) | Very low (single thread) |
| **Max clients** | ~100-1000 | ~1000-10000 | Limited by queue | 100,000+ |
| **Complexity** | Simple | Moderate | High | Very high |
| **Isolation** | Strong | None | None | None |
| **Performance** | Lowest | Medium | High | Highest |
| **Use case** | Small scale, security | Medium scale | High throughput | Massive scale |

#### Zombie Processes and SIGCHLD

When using fork(), child processes become **zombies** after exit if parent doesn't wait() for them.

**Zombie process**: Process that finished execution but still has entry in process table (waiting for parent to read exit status).

**Problem**:
```cpp
// Parent keeps forking
while (true) {
    int pid = fork();
    if (pid == 0) {
        handle_client(client_fd);
        exit(0);  // Child exits, becomes zombie
    }
    // Parent never calls wait() - zombies accumulate!
}
```

Check zombies: `ps aux | grep defunct`

**Solution 1**: Install SIGCHLD handler to reap zombies
```cpp
void sigchld_handler(int sig) {
    while (waitpid(-1, NULL, WNOHANG) > 0);  // Reap all dead children
}

signal(SIGCHLD, sigchld_handler);
```

**Solution 2**: Double fork trick (child orphans grandchild, init reaps it)

**Why it matters**: Process table has finite size. Too many zombies → can't create new processes (fork() fails with EAGAIN).

#### Thread Safety and Race Conditions

When multiple threads share data, **race conditions** occur when operations interleave unpredictably.

**Example race condition**:
```cpp
int client_count = 0;  // Shared by all threads

void handle_client() {
    client_count++;  // ❌ Not atomic! Race condition
    // ...
}
```

**Why it's a bug**: `client_count++` is actually three operations:
1. Read client_count from memory → register
2. Increment register
3. Write register → memory

If two threads execute simultaneously:
```
Thread 1: Read client_count (0) → register
Thread 2: Read client_count (0) → register  // Both read 0!
Thread 1: Increment register (1)
Thread 2: Increment register (1)            // Both get 1!
Thread 1: Write (1) → client_count
Thread 2: Write (1) → client_count          // Final value = 1 (should be 2!)
```

**Solution**: Use mutex (mutual exclusion)
```cpp
std::mutex client_mutex;
int client_count = 0;

void handle_client() {
    {
        std::lock_guard<std::mutex> lock(client_mutex);  // ✅ Protected
        client_count++;
    }  // Mutex automatically released
}
```

**Critical section**: Code that accesses shared data. Only one thread should execute critical section at a time.

#### Why Multi-Client Servers Matter for Systems Engineers

Understanding concurrency patterns is fundamental because:

1. **Real-world servers are concurrent**: No production system handles one request at a time
2. **Performance vs complexity trade-off**: Must choose right pattern for scale requirements
3. **Resource management**: CPU, memory, and file descriptors are limited
4. **Debugging concurrent bugs**: Race conditions, deadlocks are common in production
5. **Interview relevance**: Concurrency questions are common for backend/systems roles

In autonomous vehicles:
- **Cloud gateway**: Thousands of vehicles connecting simultaneously
- **Map server**: Vehicles requesting HD map tiles (must handle burst traffic)
- **Telemetry collector**: Ingesting sensor data from entire fleet
- **OTA update server**: Rolling out software updates to vehicles efficiently

All require multi-client handling strategies.

---

### EDGE_CASES: Tricky Scenarios and Deep Internals

#### Edge Case 1: Zombie Process Accumulation

```cpp
void start_server() {
    int server_fd = create_listening_socket(5000);

    while (true) {
        int client_fd = accept(server_fd, NULL, NULL);

        pid_t pid = fork();
        if (pid == 0) {
            // Child process
            close(server_fd);  // Child doesn't need listening socket
            handle_client(client_fd);
            close(client_fd);
            exit(0);  // Child exits cleanly
        }

        // Parent process
        close(client_fd);  // Parent doesn't need client socket
        // ❌ BUG: Never reaps child - zombie accumulates!
    }
}
```

**After 100 clients connect**:
```bash
$ ps aux | grep defunct
1001  12345  0.0  0.0     0     0  ?  Z  10:00  0:00 [server] <defunct>
1001  12346  0.0  0.0     0     0  ?  Z  10:00  0:00 [server] <defunct>
... 98 more zombies ...
```

**Why zombies are bad**:
- Consume process table entries (finite resource)
- Eventually fork() fails with EAGAIN
- Server can't accept new clients
- Reboot required to clear (zombies can't be killed with kill -9!)

**Solution**:
```cpp
#include <signal.h>
#include <sys/wait.h>

void sigchld_handler(int signum) {
    // Reap all dead children
    int saved_errno = errno;  // save errno
    while (waitpid(-1, NULL, WNOHANG) > 0);
    errno = saved_errno;  // restore errno
}

void start_server() {
    // Install SIGCHLD handler before forking
    struct sigaction sa;
    sa.sa_handler = sigchld_handler;
    sigemptyset(&sa.sa_mask);
    sa.sa_flags = SA_RESTART;  // Restart interrupted system calls
    sigaction(SIGCHLD, &sa, NULL);

    // Now server code is safe
    while (true) {
        int client_fd = accept(server_fd, NULL, NULL);
        // ... fork and handle client
    }
}
```

**WNOHANG flag**: Non-blocking wait. Returns immediately if no child has exited.

**SA_RESTART flag**: Automatically restart system calls (accept, recv) interrupted by SIGCHLD.

#### Edge Case 2: File Descriptor Leaks in Fork

```cpp
while (true) {
    int client_fd = accept(server_fd, NULL, NULL);

    if (fork() == 0) {
        // Child: handle client
        handle_client(client_fd);
        close(client_fd);
        exit(0);
    }

    // Parent: ❌ FORGOT to close client_fd
    // Parent now has copy of client_fd that never gets closed!
}
```

**What happens**:
- fork() duplicates all file descriptors to child
- Both parent and child have reference to client_fd
- Reference count = 2
- Child closes client_fd (ref count = 1)
- Connection stays open because parent still has reference!

**Symptoms**:
- Connections don't close cleanly
- File descriptor leak in parent (eventually hits EMFILE)
- Client may see timeout instead of clean disconnect

**Correct pattern**:
```cpp
while (true) {
    int client_fd = accept(server_fd, NULL, NULL);

    pid_t pid = fork();
    if (pid == 0) {
        // Child
        close(server_fd);  // Child doesn't need listening socket
        handle_client(client_fd);
        close(client_fd);
        exit(0);
    }

    // Parent
    close(client_fd);  // ✅ Parent must close its copy
}
```

**General rule**: After fork(), close file descriptors you don't need in each process.

#### Edge Case 3: Thread Detachment and Memory Leaks

```cpp
void start_server() {
    while (true) {
        int client_fd = accept(server_fd, NULL, NULL);

        std::thread t(handle_client, client_fd);
        // ❌ BUG: Thread not joined or detached - memory leak!
    }
}
```

**Problem**: std::thread destructor calls std::terminate() if thread is not joined or detached before destruction.

**Two options**:

**Option 1: Detach thread** (runs independently, resources auto-cleaned)
```cpp
std::thread t(handle_client, client_fd);
t.detach();  // ✅ Thread continues independently
// Thread resources freed when function exits
```

**Option 2: Join thread** (wait for completion)
```cpp
std::thread t(handle_client, client_fd);
t.join();  // ❌ Blocks until thread finishes - defeats purpose!
```

For multi-client servers, **detach is usually correct** because we don't want to wait.

**Memory leak without detach**:
- Each thread consumes stack memory (~8MB default)
- Thread handle stored in std::thread object
- Without join/detach, resources never freed
- 1000 clients = 8GB memory leaked!

#### Edge Case 4: Shared State Without Synchronization

```cpp
std::vector<int> active_clients;  // Shared by all threads

void handle_client(int client_fd) {
    active_clients.push_back(client_fd);  // ❌ Race condition!

    // Handle client...

    // Remove from list
    auto it = std::find(active_clients.begin(), active_clients.end(), client_fd);
    active_clients.erase(it);  // ❌ Race condition!
}
```

**Problem**: std::vector is NOT thread-safe. Multiple threads modifying simultaneously causes:
- **Corruption**: Internal vector state becomes invalid
- **Crashes**: Segmentation fault from corrupted pointers
- **Data loss**: Some insertions/deletions lost

**Example corruption**:
```
Thread 1: active_clients.push_back(5)
  - Checks capacity: size=10, capacity=10, needs resize
  - Allocates new array (capacity=20)
Thread 2: active_clients.push_back(7)  // Happens during Thread 1's resize!
  - Writes to old array (about to be freed)
Thread 1: Copies elements to new array
  - Frees old array
Thread 2's write is now in freed memory - CORRUPTION!
```

**Solution**:
```cpp
std::mutex clients_mutex;
std::vector<int> active_clients;

void handle_client(int client_fd) {
    {
        std::lock_guard<std::mutex> lock(clients_mutex);
        active_clients.push_back(client_fd);  // ✅ Protected
    }

    // Handle client...

    {
        std::lock_guard<std::mutex> lock(clients_mutex);
        auto it = std::find(active_clients.begin(), active_clients.end(), client_fd);
        active_clients.erase(it);  // ✅ Protected
    }
}
```

**Critical sections should be small**: Lock only when accessing shared data, release ASAP.

#### Edge Case 5: Thread Pool Queue Full

```cpp
class ThreadPool {
    std::queue<int> client_queue;  // Bounded queue
    static constexpr size_t MAX_QUEUE_SIZE = 100;

public:
    void add_client(int client_fd) {
        std::lock_guard<std::mutex> lock(queue_mutex);

        if (client_queue.size() >= MAX_QUEUE_SIZE) {
            // ❌ Queue full! What to do?
            // Option 1: Block accept() (bad - main thread hangs)
            // Option 2: Drop client (bad - silent failure)
            // Option 3: Reject gracefully (good!)
        }

        client_queue.push(client_fd);
    }
};
```

**Problem**: Under heavy load, queue fills up. Must handle gracefully.

**Wrong solution 1: Block forever**
```cpp
while (client_queue.size() >= MAX_QUEUE_SIZE) {
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
}
```
Main thread blocks, server stops accepting, clients timeout.

**Wrong solution 2: Drop silently**
```cpp
if (client_queue.size() >= MAX_QUEUE_SIZE) {
    close(client_fd);  // Drop connection
    return;
}
```
Client thinks connection succeeded, then times out waiting for response.

**Correct solution: Reject with error message**
```cpp
if (client_queue.size() >= MAX_QUEUE_SIZE) {
    const char* error = "HTTP/1.1 503 Service Unavailable\r\n\r\nServer overloaded\r\n";
    send(client_fd, error, strlen(error), MSG_NOSIGNAL);
    close(client_fd);
    return;
}
```
Client receives explicit error, can retry or failover.

**Even better: Backpressure**
```cpp
if (client_queue.size() > MAX_QUEUE_SIZE * 0.9) {
    // 90% full - send warning header
    const char* warning = "X-Queue-Depth: High\r\n";
    send(client_fd, warning, strlen(warning), MSG_NOSIGNAL);
}
```

**Production strategy**: Combine queue limits + metrics + auto-scaling.

---

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Fork-Based Echo Server

```cpp
#include <iostream>
#include <cstring>
#include <unistd.h>
#include <signal.h>
#include <sys/wait.h>
#include <sys/socket.h>
#include <arpa/inet.h>

// SIGCHLD handler to reap zombie processes
void sigchld_handler(int signum) {
    int saved_errno = errno;
    // Reap all dead children without blocking
    while (waitpid(-1, NULL, WNOHANG) > 0);
    errno = saved_errno;
}

void handle_client(int client_fd) {
    char buffer[1024];

    while (true) {
        ssize_t bytes = recv(client_fd, buffer, sizeof(buffer) - 1, 0);

        if (bytes <= 0) {
            if (bytes < 0) perror("recv");
            break;  // Connection closed or error
        }

        buffer[bytes] = '\0';
        std::cout << "Child PID " << getpid() << " received: " << buffer << "\n";

        // Echo back
        send(client_fd, buffer, bytes, MSG_NOSIGNAL);
    }

    std::cout << "Child PID " << getpid() << " closing connection\n";
}

int main() {
    // Install SIGCHLD handler
    struct sigaction sa;
    sa.sa_handler = sigchld_handler;
    sigemptyset(&sa.sa_mask);
    sa.sa_flags = SA_RESTART;  // Restart interrupted syscalls
    if (sigaction(SIGCHLD, &sa, NULL) < 0) {
        perror("sigaction");
        return 1;
    }

    // Create listening socket
    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (server_fd < 0) {
        perror("socket");
        return 1;
    }

    int opt = 1;
    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons(5000);

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

    std::cout << "Fork-based server listening on port 5000...\n";

    while (true) {
        sockaddr_in client_addr{};
        socklen_t client_len = sizeof(client_addr);
        int client_fd = accept(server_fd, (sockaddr*)&client_addr, &client_len);

        if (client_fd < 0) {
            if (errno == EINTR) continue;  // Interrupted by SIGCHLD, retry
            perror("accept");
            continue;
        }

        std::cout << "Parent: Accepted connection, forking...\n";

        pid_t pid = fork();

        if (pid < 0) {
            perror("fork");
            close(client_fd);
            continue;
        }

        if (pid == 0) {
            // Child process
            close(server_fd);  // Child doesn't need listening socket
            handle_client(client_fd);
            close(client_fd);
            exit(0);  // Child exits cleanly
        }

        // Parent process
        close(client_fd);  // Parent doesn't need client socket
        std::cout << "Parent: Forked child PID " << pid << "\n";
    }

    close(server_fd);
    return 0;
}
```

**Key points**:
- SIGCHLD handler reaps zombies automatically
- Parent closes client_fd, child closes server_fd (no leaks)
- SA_RESTART flag ensures accept() resumes after signal
- Each child is isolated process

#### Example 2: Thread-Based Echo Server

```cpp
#include <iostream>
#include <thread>
#include <atomic>
#include <cstring>
#include <unistd.h>
#include <sys/socket.h>
#include <arpa/inet.h>

std::atomic<int> active_threads{0};  // Thread-safe counter

void handle_client(int client_fd) {
    active_threads++;
    std::cout << "Thread " << std::this_thread::get_id()
              << " handling client (active: " << active_threads << ")\n";

    char buffer[1024];

    while (true) {
        ssize_t bytes = recv(client_fd, buffer, sizeof(buffer) - 1, 0);

        if (bytes <= 0) {
            if (bytes < 0) perror("recv");
            break;
        }

        buffer[bytes] = '\0';
        std::cout << "Thread " << std::this_thread::get_id()
                  << " received: " << buffer << "\n";

        send(client_fd, buffer, bytes, MSG_NOSIGNAL);
    }

    close(client_fd);
    active_threads--;
    std::cout << "Thread " << std::this_thread::get_id()
              << " closing (active: " << active_threads << ")\n";
}

int main() {
    // Create listening socket
    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (server_fd < 0) {
        perror("socket");
        return 1;
    }

    int opt = 1;
    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons(5000);

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

    std::cout << "Thread-based server listening on port 5000...\n";

    while (true) {
        int client_fd = accept(server_fd, NULL, NULL);

        if (client_fd < 0) {
            perror("accept");
            continue;
        }

        std::cout << "Main: Accepted connection, creating thread...\n";

        // Create detached thread to handle client
        std::thread t(handle_client, client_fd);
        t.detach();  // Thread runs independently
    }

    close(server_fd);
    return 0;
}
```

**Key points**:
- std::atomic for thread-safe counter (no mutex needed for simple increment)
- t.detach() allows thread to run independently
- Lighter than fork (shared memory)
- No zombie processes to worry about

#### Example 3: Thread Pool Server (Production Pattern)

```cpp
#include <iostream>
#include <thread>
#include <queue>
#include <mutex>
#include <condition_variable>
#include <vector>
#include <atomic>
#include <cstring>
#include <unistd.h>
#include <sys/socket.h>
#include <arpa/inet.h>

class ThreadPool {
private:
    std::vector<std::thread> workers;
    std::queue<int> client_queue;
    std::mutex queue_mutex;
    std::condition_variable condition;
    std::atomic<bool> stop{false};
    std::atomic<int> active_clients{0};

    void worker_thread() {
        while (true) {
            int client_fd;

            {
                std::unique_lock<std::mutex> lock(queue_mutex);

                // Wait for work or stop signal
                condition.wait(lock, [this] {
                    return stop || !client_queue.empty();
                });

                if (stop && client_queue.empty()) {
                    return;  // Thread exits
                }

                client_fd = client_queue.front();
                client_queue.pop();
            }

            // Handle client outside lock
            handle_client(client_fd);
        }
    }

    void handle_client(int client_fd) {
        active_clients++;
        std::cout << "Thread " << std::this_thread::get_id()
                  << " handling client (active: " << active_clients << ")\n";

        char buffer[1024];

        while (true) {
            ssize_t bytes = recv(client_fd, buffer, sizeof(buffer) - 1, 0);

            if (bytes <= 0) {
                if (bytes < 0) perror("recv");
                break;
            }

            buffer[bytes] = '\0';
            send(client_fd, buffer, bytes, MSG_NOSIGNAL);
        }

        close(client_fd);
        active_clients--;
        std::cout << "Thread " << std::this_thread::get_id()
                  << " finished (active: " << active_clients << ")\n";
    }

public:
    ThreadPool(size_t num_threads) {
        for (size_t i = 0; i < num_threads; i++) {
            workers.emplace_back([this] { worker_thread(); });
        }
        std::cout << "Thread pool created with " << num_threads << " workers\n";
    }

    ~ThreadPool() {
        stop = true;
        condition.notify_all();

        for (std::thread& worker : workers) {
            if (worker.joinable()) {
                worker.join();
            }
        }
    }

    bool add_client(int client_fd) {
        {
            std::lock_guard<std::mutex> lock(queue_mutex);

            // Check queue size limit
            if (client_queue.size() >= 100) {
                std::cerr << "Queue full, rejecting client\n";
                const char* error = "HTTP/1.1 503 Service Unavailable\r\n\r\n";
                send(client_fd, error, strlen(error), MSG_NOSIGNAL);
                close(client_fd);
                return false;
            }

            client_queue.push(client_fd);
        }

        condition.notify_one();  // Wake up one worker
        return true;
    }

    size_t queue_size() const {
        std::lock_guard<std::mutex> lock(queue_mutex);
        return client_queue.size();
    }

    int get_active_clients() const {
        return active_clients;
    }
};

int main() {
    // Create thread pool with optimal size (e.g., CPU cores)
    size_t num_threads = std::thread::hardware_concurrency();
    if (num_threads == 0) num_threads = 4;  // Fallback
    ThreadPool pool(num_threads);

    // Create listening socket
    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (server_fd < 0) {
        perror("socket");
        return 1;
    }

    int opt = 1;
    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons(5000);

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

    std::cout << "Thread pool server listening on port 5000...\n";
    std::cout << "Using " << num_threads << " worker threads\n";

    while (true) {
        int client_fd = accept(server_fd, NULL, NULL);

        if (client_fd < 0) {
            perror("accept");
            continue;
        }

        std::cout << "Accepted connection, adding to pool (queue: "
                  << pool.queue_size() << ", active: "
                  << pool.get_active_clients() << ")\n";

        pool.add_client(client_fd);
    }

    close(server_fd);
    return 0;
}
```

**Key points**:
- Fixed number of worker threads (optimal = CPU cores)
- std::condition_variable for efficient waiting (no busy-waiting)
- Queue bounded to prevent memory exhaustion
- Rejects clients gracefully when overloaded
- Threads reused, not created per client
- Production-ready pattern

#### Example 4: Comparing Performance (Benchmark)

```cpp
#include <iostream>
#include <chrono>
#include <sys/socket.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <sys/wait.h>
#include <thread>

// Simulate work (e.g., processing request)
void simulate_work() {
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
}

// Fork-based: Handle N clients
void benchmark_fork(int num_clients) {
    auto start = std::chrono::steady_clock::now();

    for (int i = 0; i < num_clients; i++) {
        pid_t pid = fork();
        if (pid == 0) {
            // Child
            simulate_work();
            exit(0);
        }
    }

    // Parent waits for all children
    for (int i = 0; i < num_clients; i++) {
        wait(NULL);
    }

    auto end = std::chrono::steady_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);
    std::cout << "Fork-based: " << num_clients << " clients in "
              << duration.count() << "ms\n";
}

// Thread-based: Handle N clients
void benchmark_threads(int num_clients) {
    auto start = std::chrono::steady_clock::now();

    std::vector<std::thread> threads;
    for (int i = 0; i < num_clients; i++) {
        threads.emplace_back(simulate_work);
    }

    for (std::thread& t : threads) {
        t.join();
    }

    auto end = std::chrono::steady_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);
    std::cout << "Thread-based: " << num_clients << " clients in "
              << duration.count() << "ms\n";
}

int main() {
    std::cout << "Benchmarking server strategies:\n\n";

    std::cout << "Small scale (10 clients):\n";
    benchmark_fork(10);
    benchmark_threads(10);

    std::cout << "\nMedium scale (100 clients):\n";
    benchmark_fork(100);
    benchmark_threads(100);

    // Note: Don't run fork with 1000 clients - will exhaust resources!
    std::cout << "\nLarge scale (1000 clients):\n";
    std::cout << "Fork-based: Skipped (resource intensive)\n";
    benchmark_threads(1000);

    return 0;
}
```

**Typical output**:
```
Small scale (10 clients):
Fork-based: 10 clients in 250ms
Thread-based: 10 clients in 150ms

Medium scale (100 clients):
Fork-based: 100 clients in 2500ms
Thread-based: 100 clients in 1200ms

Large scale (1000 clients):
Fork-based: Skipped (resource intensive)
Thread-based: 1000 clients in 11000ms
```

**Observations**:
- Thread creation ~2-3x faster than fork
- Performance gap widens with more clients
- Fork becomes impractical beyond ~500 clients
- Thread pool would be even faster (no creation overhead)

#### Example 5: Shared State with Mutex Protection

```cpp
#include <iostream>
#include <thread>
#include <mutex>
#include <map>
#include <string>
#include <unistd.h>
#include <sys/socket.h>
#include <arpa/inet.h>

// Global client registry (shared by all threads)
std::mutex registry_mutex;
std::map<int, std::string> client_registry;  // fd -> username

void register_client(int client_fd, const std::string& username) {
    std::lock_guard<std::mutex> lock(registry_mutex);
    client_registry[client_fd] = username;
    std::cout << "Registered: " << username << " (fd=" << client_fd << ")\n";
}

void unregister_client(int client_fd) {
    std::lock_guard<std::mutex> lock(registry_mutex);
    auto it = client_registry.find(client_fd);
    if (it != client_registry.end()) {
        std::cout << "Unregistered: " << it->second << " (fd=" << client_fd << ")\n";
        client_registry.erase(it);
    }
}

void broadcast_message(int sender_fd, const std::string& message) {
    std::lock_guard<std::mutex> lock(registry_mutex);

    std::string sender_name = "Unknown";
    auto it = client_registry.find(sender_fd);
    if (it != client_registry.end()) {
        sender_name = it->second;
    }

    std::string full_message = sender_name + ": " + message;

    // Send to all clients except sender
    for (const auto& [fd, username] : client_registry) {
        if (fd != sender_fd) {
            send(fd, full_message.c_str(), full_message.size(), MSG_NOSIGNAL);
        }
    }
}

void handle_client(int client_fd) {
    // Read username
    char buffer[256];
    ssize_t bytes = recv(client_fd, buffer, sizeof(buffer) - 1, 0);
    if (bytes <= 0) {
        close(client_fd);
        return;
    }

    buffer[bytes] = '\0';
    std::string username(buffer);

    // Register client
    register_client(client_fd, username);

    // Chat loop
    while (true) {
        bytes = recv(client_fd, buffer, sizeof(buffer) - 1, 0);

        if (bytes <= 0) {
            break;  // Connection closed
        }

        buffer[bytes] = '\0';
        std::string message(buffer);

        // Broadcast to all other clients
        broadcast_message(client_fd, message);
    }

    // Cleanup
    unregister_client(client_fd);
    close(client_fd);
}

int main() {
    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    int opt = 1;
    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons(5000);

    bind(server_fd, (sockaddr*)&addr, sizeof(addr));
    listen(server_fd, 128);

    std::cout << "Chat server listening on port 5000...\n";

    while (true) {
        int client_fd = accept(server_fd, NULL, NULL);
        if (client_fd < 0) continue;

        std::thread t(handle_client, client_fd);
        t.detach();
    }

    return 0;
}
```

**Key points**:
- Shared std::map protected by mutex
- Lock held only during critical sections (map access)
- Demonstrates practical use case (chat server)
- All modifications to shared state are synchronized

#### Example 6: Graceful Shutdown

```cpp
#include <iostream>
#include <thread>
#include <atomic>
#include <vector>
#include <signal.h>
#include <unistd.h>
#include <sys/socket.h>
#include <arpa/inet.h>

std::atomic<bool> shutdown_requested{false};
std::vector<int> active_connections;
std::mutex connections_mutex;

void signal_handler(int signum) {
    std::cout << "\nShutdown signal received...\n";
    shutdown_requested = true;
}

void handle_client(int client_fd) {
    // Add to active connections
    {
        std::lock_guard<std::mutex> lock(connections_mutex);
        active_connections.push_back(client_fd);
    }

    char buffer[1024];

    while (!shutdown_requested) {
        // Use timeout to check shutdown_requested periodically
        struct timeval timeout;
        timeout.tv_sec = 1;
        timeout.tv_usec = 0;
        setsockopt(client_fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));

        ssize_t bytes = recv(client_fd, buffer, sizeof(buffer) - 1, 0);

        if (bytes > 0) {
            buffer[bytes] = '\0';
            send(client_fd, buffer, bytes, MSG_NOSIGNAL);
        } else if (bytes == 0) {
            break;  // Connection closed
        } else if (errno != EAGAIN && errno != EWOULDBLOCK) {
            break;  // Real error
        }
        // EAGAIN/EWOULDBLOCK = timeout, check shutdown_requested
    }

    // Send goodbye message
    const char* goodbye = "Server shutting down, goodbye!\n";
    send(client_fd, goodbye, strlen(goodbye), MSG_NOSIGNAL);

    close(client_fd);

    // Remove from active connections
    {
        std::lock_guard<std::mutex> lock(connections_mutex);
        auto it = std::find(active_connections.begin(), active_connections.end(), client_fd);
        if (it != active_connections.end()) {
            active_connections.erase(it);
        }
    }

    std::cout << "Client disconnected gracefully\n";
}

int main() {
    // Install signal handlers
    signal(SIGINT, signal_handler);   // Ctrl+C
    signal(SIGTERM, signal_handler);  // kill command

    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    int opt = 1;
    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons(5000);

    bind(server_fd, (sockaddr*)&addr, sizeof(addr));
    listen(server_fd, 128);

    // Make accept() non-blocking to check shutdown_requested
    struct timeval timeout;
    timeout.tv_sec = 1;
    timeout.tv_usec = 0;
    setsockopt(server_fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));

    std::cout << "Server with graceful shutdown listening on port 5000...\n";
    std::cout << "Press Ctrl+C to shutdown gracefully\n";

    std::vector<std::thread> threads;

    while (!shutdown_requested) {
        int client_fd = accept(server_fd, NULL, NULL);

        if (client_fd < 0) {
            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                continue;  // Timeout, check shutdown_requested
            }
            perror("accept");
            continue;
        }

        std::thread t(handle_client, client_fd);
        threads.push_back(std::move(t));
    }

    std::cout << "No longer accepting new connections...\n";
    close(server_fd);

    std::cout << "Waiting for " << threads.size() << " active clients to finish...\n";

    // Wait for all client threads to finish
    for (std::thread& t : threads) {
        if (t.joinable()) {
            t.join();
        }
    }

    std::cout << "All clients disconnected. Server shutdown complete.\n";
    return 0;
}
```

**Key points**:
- Signal handlers set atomic flag
- Periodic timeout checks allow clean exit
- Sends goodbye message to clients
- Waits for all threads to finish (no abrupt termination)
- Production servers should implement graceful shutdown

---

### INTERVIEW_QA: Comprehensive Questions and Answers

#### Q1: What are the main approaches to handle multiple clients? Compare them.

**Difficulty:** #beginner
**Category:** #concurrency #fundamentals
**Concepts:** #fork #threads #thread_pool #io_multiplexing

**Answer:** Fork (process per client), threads (thread per client), thread pool, and I/O multiplexing (select/poll/epoll).

**Explanation:**

**1. Fork-based (Process per client)**:
- Creates new process for each client using fork()
- Strong isolation (separate memory)
- Heavy resource usage, slower
- Best for < 100 clients

**2. Thread-based (Thread per client)**:
- Creates new thread for each client
- Shared memory, lighter than fork
- Faster creation, better scalability
- Best for 100-1000 clients

**3. Thread Pool**:
- Pre-creates fixed number of threads
- Threads reused for multiple clients
- No creation overhead, bounded resources
- Best for high-throughput servers

**4. I/O Multiplexing (select/poll/epoll)**:
- Single thread monitors multiple sockets
- Most scalable (10,000+ clients)
- Most complex to implement
- Best for massive scale

**Choosing strategy**:
- **Small scale (< 100)**: Fork or threads, simplicity matters
- **Medium scale (100-1000)**: Threads or thread pool
- **Large scale (1000+)**: Thread pool + epoll
- **Massive scale (10,000+)**: Pure event-driven (epoll/kqueue)

**Interview tip**: Explain trade-offs, mention you'd choose based on requirements (scale, complexity budget, performance needs).

#### Q2: What is a zombie process and how do you prevent it in fork-based servers?

**Difficulty:** #intermediate
**Category:** #fork #process_management
**Concepts:** #zombie #sigchld #waitpid

**Answer:** Zombie is a terminated child process whose exit status hasn't been reaped; prevent with SIGCHLD handler calling waitpid().

**Explanation:**

**What is a zombie**:
- Child process that finished execution (called exit())
- Still has entry in process table
- Parent hasn't called wait()/waitpid() to read exit status
- Shows as `<defunct>` in ps output

**Why zombies are bad**:
- Consume process table entries (finite resource)
- Eventually can't create new processes (fork() fails EAGAIN)
- Can't be killed (already dead, waiting for parent to reap)
- Only fix is reboot or parent process termination

**Solution 1: SIGCHLD handler**:
```cpp
void sigchld_handler(int sig) {
    int saved_errno = errno;
    while (waitpid(-1, NULL, WNOHANG) > 0);  // Reap all dead children
    errno = saved_errno;
}

signal(SIGCHLD, sigchld_handler);
```

**Solution 2: Double fork trick**:
```cpp
if (fork() == 0) {
    if (fork() == 0) {
        // Grandchild handles client
        handle_client();
        exit(0);
    }
    exit(0);  // Middle child exits immediately
}
wait(NULL);  // Parent reaps middle child
// Grandchild is orphaned, adopted by init (PID 1), which reaps it
```

**Key points**:
- waitpid() with WNOHANG flag (non-blocking)
- Loop to reap multiple zombies
- Save/restore errno (signal handler can interrupt syscalls)
- SA_RESTART flag to restart interrupted system calls

#### Q3: Why must you close file descriptors after fork() in both parent and child?

**Difficulty:** #intermediate
**Category:** #fork #file_descriptors
**Concepts:** #fd_leak #reference_counting

**Answer:** fork() duplicates file descriptors; both parent and child have references, causing FD leaks if not closed properly.

**Explanation:**

**How fork() handles FDs**:
- fork() duplicates all open file descriptors to child
- Both parent and child have separate FD numbers pointing to same underlying file
- Kernel maintains reference count for each file

**Example**:
```cpp
int client_fd = accept(server_fd, ...);  // ref count = 1
pid_t pid = fork();                      // ref count = 2 (parent + child)

if (pid == 0) {
    // Child
    close(server_fd);   // Child doesn't need listening socket
    handle_client(client_fd);
    close(client_fd);   // ref count = 1 (parent still has it)
    exit(0);
}

// Parent
close(client_fd);      // ✅ MUST close! ref count = 0, connection actually closes
```

**What happens if parent forgets to close client_fd**:
- Child closes its copy (ref count = 1)
- Connection stays open because parent still has reference
- Client doesn't receive FIN, connection hangs
- Parent accumulates FDs, eventually hits EMFILE

**General rule**:
- **Child closes**: FDs it doesn't need (typically server_fd)
- **Parent closes**: FDs it doesn't need (typically client_fd)

**Verification**:
```bash
# Check open FDs for process
ls /proc/<PID>/fd | wc -l
```

If count keeps growing, you have an FD leak.

#### Q4: What is a race condition? Give an example in multi-threaded server.

**Difficulty:** #intermediate
**Category:** #concurrency #thread_safety
**Concepts:** #race_condition #mutex #critical_section

**Answer:** Race condition occurs when multiple threads access shared data without synchronization, causing unpredictable results.

**Explanation:**

**Example**: Client counter
```cpp
int client_count = 0;  // Shared by all threads

void handle_client() {
    client_count++;  // ❌ Race condition!
    // ...
    client_count--;
}
```

**Why it's a race**:
`client_count++` is NOT atomic. Assembly:
```asm
MOV EAX, [client_count]   ; Read from memory
INC EAX                    ; Increment register
MOV [client_count], EAX    ; Write to memory
```

**Interleaving example**:
```
Initial: client_count = 5

Thread 1: MOV EAX, [client_count]   ; EAX = 5
Thread 2: MOV EAX, [client_count]   ; EAX = 5  (also reads 5!)
Thread 1: INC EAX                    ; EAX = 6
Thread 2: INC EAX                    ; EAX = 6  (also 6!)
Thread 1: MOV [client_count], EAX    ; client_count = 6
Thread 2: MOV [client_count], EAX    ; client_count = 6 (overwrites!)

Final: client_count = 6 (should be 7!)
```

**Solution**: Mutex (mutual exclusion)
```cpp
std::mutex count_mutex;
int client_count = 0;

void handle_client() {
    {
        std::lock_guard<std::mutex> lock(count_mutex);
        client_count++;  // ✅ Protected
    }
    // ...
    {
        std::lock_guard<std::mutex> lock(count_mutex);
        client_count--;
    }
}
```

**Alternative**: std::atomic
```cpp
std::atomic<int> client_count{0};

void handle_client() {
    client_count++;  // ✅ Atomic operation, no mutex needed
    // ...
    client_count--;
}
```

**Key concepts**:
- **Critical section**: Code accessing shared data
- **Mutex**: Lock ensuring only one thread in critical section
- **Atomic**: Hardware-level guarantee of atomicity

**Interview tip**: Always mention you'd use mutex/atomic for shared data, explain why race conditions are hard to debug (non-deterministic, only occur under load).

#### Q5: What is thread detachment? When should you detach vs join threads?

**Difficulty:** #intermediate
**Category:** #threads #lifecycle
**Concepts:** #detach #join #thread_lifecycle

**Answer:** Detaching makes thread run independently; join waits for completion. Detach for fire-and-forget, join for result collection.

**Explanation:**

**Thread states**:
- **Joinable** (default): Parent can wait for completion with join()
- **Detached**: Runs independently, resources auto-cleaned on exit

**join()**:
```cpp
std::thread t(handle_client, client_fd);
t.join();  // ⏸️ Blocks until thread finishes
```
- Blocks calling thread until t finishes
- Allows retrieving return value/exception
- Thread resources freed after join() returns

**detach()**:
```cpp
std::thread t(handle_client, client_fd);
t.detach();  // Thread continues independently
// Main thread continues immediately
```
- Thread runs in background
- Resources auto-freed when thread exits
- Cannot join later (irreversible)

**When to use join**:
- Need result from thread
- Want to ensure work completes before continuing
- Thread lifetime tied to scope (RAII pattern)

**When to use detach**:
- Fire-and-forget tasks
- Thread lifetime independent of creator
- Server handling clients (don't want to wait)

**Server example**:
```cpp
// ❌ WRONG: Join defeats purpose
while (true) {
    int fd = accept(...);
    std::thread t(handle_client, fd);
    t.join();  // Blocks! Only handles one client at a time
}

// ✅ CORRECT: Detach allows concurrent handling
while (true) {
    int fd = accept(...);
    std::thread t(handle_client, fd);
    t.detach();  // Continues accepting immediately
}
```

**Critical mistake**: Neither joining nor detaching
```cpp
{
    std::thread t(handle_client, fd);
    // ❌ t destructor called without join/detach → std::terminate()!
}
```

**Interview tip**: Explain that std::thread destructor calls std::terminate() if not joined/detached, mention production servers typically use detach for request handling.

#### Q6: How does a thread pool work? What are its advantages over creating threads per client?

**Difficulty:** #intermediate
**Category:** #thread_pool #performance
**Concepts:** #thread_reuse #bounded_resources #condition_variable

**Answer:** Thread pool pre-creates fixed threads that reuse for multiple clients; advantages include no creation overhead, bounded resources, and optimal CPU utilization.

**Explanation:**

**How it works**:
1. Create fixed number of worker threads at startup (e.g., 8 threads for 8 cores)
2. Worker threads wait on queue for work (using condition variable)
3. Main thread accepts clients, adds to queue
4. Available worker picks up client from queue
5. After handling, worker returns to pool (not destroyed)

**Architecture**:
```
Main Thread              Thread Pool           Queue
accept() ─────────────> [Thread 1] ─────┐
accept() ─────────────> [Thread 2]       │
accept() ─────────────> [Thread 3]       ├──> std::queue<int>
   │                    [Thread 4]       │    (client FDs)
   │                      ...         ───┘
   └──────> Add to queue
```

**Advantages over thread-per-client**:

**1. No creation overhead**:
```
Thread-per-client: create → work → destroy (1000 clients = 1000 creates)
Thread pool: create once → work → work → work (1000 clients = 8 creates)
```

**2. Bounded resources**:
- Fixed memory usage (8 threads × 8MB = 64MB, regardless of client count)
- Predictable behavior under load
- Can't exhaust system resources

**3. Optimal CPU utilization**:
- Thread count matches CPU cores (no context switching overhead)
- 8 cores = 8 threads = maximum parallelism without contention

**4. Graceful degradation**:
- Queue buffers traffic bursts
- Clients wait rather than being rejected
- System remains stable under overload

**5. Better performance metrics**:
- Can measure queue depth, worker utilization
- Easier to tune and optimize

**Disadvantages**:
- More complex implementation (queue, synchronization)
- Queue can fill up (need overflow strategy)
- Must choose appropriate thread count

**Optimal thread count**:
- CPU-bound work: Number of cores
- I/O-bound work: 2-4× number of cores (threads blocked on I/O, others can work)

**Interview tip**: Mention std::condition_variable for efficient waiting (not busy-polling), explain why thread pools are production standard for high-throughput servers.

#### Q7: What is std::condition_variable and why is it used in thread pools?

**Difficulty:** #advanced
**Category:** #synchronization #thread_pool
**Concepts:** #condition_variable #wait #notify

**Answer:** condition_variable allows threads to efficiently wait for a condition; avoids busy-waiting CPU waste.

**Explanation:**

**Problem without condition_variable** (busy-waiting):
```cpp
std::mutex queue_mutex;
std::queue<int> client_queue;

void worker_thread() {
    while (true) {
        std::lock_guard<std::mutex> lock(queue_mutex);
        if (!client_queue.empty()) {
            int fd = client_queue.front();
            client_queue.pop();
            // Handle client
        }
        // ❌ Spin loop - wastes 100% CPU checking empty queue!
    }
}
```

**Solution with condition_variable**:
```cpp
std::mutex queue_mutex;
std::condition_variable cv;
std::queue<int> client_queue;

void worker_thread() {
    while (true) {
        int fd;
        {
            std::unique_lock<std::mutex> lock(queue_mutex);
            cv.wait(lock, [] { return !client_queue.empty(); });  // ✅ Sleeps until notified
            fd = client_queue.front();
            client_queue.pop();
        }
        // Handle client
    }
}

void main_thread() {
    int client_fd = accept(...);
    {
        std::lock_guard<std::mutex> lock(queue_mutex);
        client_queue.push(client_fd);
    }
    cv.notify_one();  // Wake up one worker
}
```

**How it works**:
1. Worker calls `wait()` → releases mutex and sleeps
2. Main thread adds work → calls `notify_one()`
3. Worker wakes up → reacquires mutex → checks condition
4. If true, worker proceeds; if false (spurious wakeup), waits again

**Why std::unique_lock**:
- condition_variable needs to unlock/relock mutex
- std::lock_guard can't unlock (doesn't have unlock() method)
- std::unique_lock provides unlock()/lock()

**notify_one() vs notify_all()**:
- `notify_one()`: Wakes one waiting thread (efficient for single work item)
- `notify_all()`: Wakes all waiting threads (use when condition affects all)

**Spurious wakeups**:
- Threads can wake up without notification (OS implementation detail)
- Always use wait with condition: `cv.wait(lock, []{ return condition; })`

**Performance**:
- Busy-wait: 100% CPU usage doing nothing
- condition_variable: 0% CPU while waiting, instant wakeup

**Interview tip**: Explain you'd use condition_variable for any producer-consumer pattern, mention spurious wakeups, compare to busy-waiting waste.

#### Q8: How would you implement graceful shutdown in a multi-threaded server?

**Difficulty:** #advanced
**Category:** #shutdown #lifecycle
**Concepts:** #signal_handling #atomic #join

**Answer:** Use atomic flag set by signal handler, periodic checks in threads, wait for all threads to finish before exit.

**Explanation:**

**Requirements**:
1. Stop accepting new connections
2. Finish serving existing clients
3. No abrupt termination (data loss)
4. No resource leaks

**Implementation**:
```cpp
std::atomic<bool> shutdown_requested{false};

void signal_handler(int sig) {
    std::cout << "\nShutdown signal received\n";
    shutdown_requested = true;
}

void handle_client(int fd) {
    while (!shutdown_requested) {
        // Use timeout to check shutdown_requested periodically
        struct timeval timeout = {1, 0};  // 1 second
        setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));

        ssize_t bytes = recv(fd, buffer, size, 0);
        if (bytes > 0) {
            // Process data
        } else if (errno == EAGAIN) {
            continue;  // Timeout, check shutdown_requested
        } else {
            break;  // Error or closed
        }
    }

    // Send goodbye message
    const char* msg = "Server shutting down\n";
    send(fd, msg, strlen(msg), MSG_NOSIGNAL);
    close(fd);
}

int main() {
    signal(SIGINT, signal_handler);   // Ctrl+C
    signal(SIGTERM, signal_handler);  // kill command

    std::vector<std::thread> threads;

    // Make accept() check shutdown_requested
    struct timeval timeout = {1, 0};
    setsockopt(server_fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));

    while (!shutdown_requested) {
        int fd = accept(server_fd, NULL, NULL);
        if (fd < 0) {
            if (errno == EAGAIN) continue;  // Timeout
            perror("accept");
            continue;
        }

        threads.emplace_back(handle_client, fd);
    }

    std::cout << "No longer accepting connections\n";
    close(server_fd);

    std::cout << "Waiting for " << threads.size() << " clients to finish\n";
    for (std::thread& t : threads) {
        if (t.joinable()) t.join();
    }

    std::cout << "Shutdown complete\n";
}
```

**Key points**:
- Atomic flag (thread-safe without mutex)
- Signal handlers set flag (not safe to do complex operations in signal handler)
- Periodic timeouts allow checking flag
- Join all threads (ensure cleanup before exit)
- Send goodbye messages (clients know server is shutting down)

**Alternative**: Thread pool shutdown
```cpp
class ThreadPool {
    std::atomic<bool> stop{false};

    ~ThreadPool() {
        stop = true;
        cv.notify_all();  // Wake all workers
        for (std::thread& t : workers) {
            if (t.joinable()) t.join();
        }
    }
};
```

**Production considerations**:
- Maximum shutdown time (force exit after N seconds)
- Drain queue before stopping (finish queued work)
- Notify monitoring systems
- Log shutdown reason

#### Q9: What happens if you forget to close() the listening socket in a forked child process?

**Difficulty:** #intermediate
**Category:** #fork #file_descriptors
**Concepts:** #fd_leak #server_fd

**Answer:** Child inherits listening socket; consumes FD, prevents clean server shutdown, and wastes resources.

**Explanation:**

**Scenario**:
```cpp
int server_fd = socket(...);
bind(server_fd, ...);
listen(server_fd, 128);

while (true) {
    int client_fd = accept(server_fd, ...);

    if (fork() == 0) {
        // Child - ❌ forgot close(server_fd)!
        handle_client(client_fd);
        close(client_fd);
        exit(0);
    }

    close(client_fd);  // Parent closes client_fd
}
```

**Problems**:

**1. FD leak in children**:
- Each child has copy of server_fd
- Child doesn't need it (only handles one client)
- Wastes one FD per child process

**2. Prevents clean shutdown**:
```bash
# Try to restart server
$ kill <server_pid>
# Parent exits, but children still alive with server_fd open
$ ./server
bind: Address already in use  # ❌ Port still bound by children!
```

**3. Security risk**:
- Compromised child process could accept new connections on server_fd
- Violates principle of least privilege

**4. Resource accumulation**:
- 100 clients = 100 children with server_fd = 100 wasted FDs
- Combined with client_fd, hits FD limit faster

**Correct pattern**:
```cpp
if (fork() == 0) {
    // Child
    close(server_fd);      // ✅ Close listening socket
    close(other_fds...);   // ✅ Close any other inherited FDs

    handle_client(client_fd);
    close(client_fd);
    exit(0);
}

// Parent
close(client_fd);  // ✅ Close client socket
```

**General rule**: After fork(), each process closes FDs it doesn't need.

**Verification**:
```bash
# Check child's open FDs
ls -l /proc/<child_pid>/fd/
# Should only see client_fd, not server_fd
```

#### Q10: Explain the double fork trick for avoiding zombies. How does it work?

**Difficulty:** #advanced
**Category:** #fork #zombie
**Concepts:** #double_fork #orphan #init

**Answer:** Fork twice; middle child exits immediately, grandchild is orphaned and adopted by init (PID 1), which reaps it automatically.

**Explanation:**

**Traditional approach (requires SIGCHLD handler)**:
```cpp
pid_t pid = fork();
if (pid == 0) {
    handle_client();
    exit(0);  // Becomes zombie until parent calls wait()
}
// Parent must install SIGCHLD handler to reap
```

**Double fork (no SIGCHLD handler needed)**:
```cpp
pid_t pid = fork();
if (pid == 0) {
    // Middle child
    pid_t grandchild = fork();
    if (grandchild == 0) {
        // Grandchild
        handle_client();
        exit(0);  // Grandchild exits
    }
    exit(0);  // Middle child exits immediately
}

// Parent reaps middle child (quick)
wait(NULL);  // Middle child is reaped

// Grandchild is now orphan (parent died)
// Init (PID 1) adopts grandchild
// Init automatically reaps grandchild when it exits
```

**How it works**:

**Step 1**: Parent forks middle child
```
Parent (PID 1000)
  └─> Middle child (PID 1001)
```

**Step 2**: Middle child forks grandchild, then exits immediately
```
Parent (PID 1000)
  └─> Middle child (PID 1001) ──> exits
        └─> Grandchild (PID 1002)
```

**Step 3**: Parent reaps middle child (middle child exited quickly, no delay)
```
Parent (PID 1000) ──> wait() reaps middle child
Grandchild (PID 1002) ──> orphan!
```

**Step 4**: Init (PID 1) adopts orphan grandchild
```
Init (PID 1)
  └─> Grandchild (PID 1002)  // Adopted
```

**Step 5**: When grandchild exits, init automatically reaps it
```
Grandchild exits → init reaps → no zombie
```

**Why this works**:
- Init is special process that automatically reaps all orphans
- Parent only waits for middle child (exits immediately)
- Grandchild runs independently, reaped by init

**Trade-offs**:

**Advantages**:
- No SIGCHLD handler needed (simpler)
- Parent doesn't need to track children
- Works even if parent crashes

**Disadvantages**:
- Cannot get grandchild's exit status
- Cannot kill grandchild easily (lost parent-child relationship)
- More complex (two forks instead of one)

**When to use**:
- Daemon processes
- Fire-and-forget background tasks
- When you don't need child's exit status

**When not to use**:
- Need to monitor child status
- Need to kill child
- SIGCHLD handler is acceptable

#### Q11: What is the optimal number of threads for a thread pool? How do you determine it?

**Difficulty:** #intermediate
**Category:** #thread_pool #performance
**Concepts:** #cpu_cores #io_bound #cpu_bound

**Answer:** CPU-bound: number of cores; I/O-bound: 2-4× cores. Use benchmarking to find optimal for specific workload.

**Explanation:**

**Rule of thumb**:

**CPU-bound work** (computation-heavy):
```cpp
size_t num_threads = std::thread::hardware_concurrency();  // CPU cores
```
- Matrix multiplication, image processing, compression
- More threads = more context switching (overhead)
- 8 cores = 8 threads = optimal

**I/O-bound work** (network, disk):
```cpp
size_t num_threads = std::thread::hardware_concurrency() * 2;  // 2× cores
// Or even 4× for heavily I/O-bound
```
- Network servers, database queries, file I/O
- Threads blocked on I/O don't consume CPU
- Can oversubscribe: 8 cores = 16-32 threads

**Why more threads for I/O-bound**:
```
8 threads (I/O-bound):
Thread 1: ⏸️ blocked on recv()
Thread 2: ⏸️ blocked on database query
Thread 3: ✅ processing (using CPU)
Thread 4: ⏸️ blocked on disk read
...

With only 8 threads, CPU may sit idle while threads wait for I/O.
With 16-32 threads, more likely to have thread ready to use CPU.
```

**Determining optimal thread count**:

**1. Measure with different values**:
```cpp
for (int threads : {4, 8, 16, 32, 64}) {
    ThreadPool pool(threads);
    // Run benchmark
    // Measure: throughput, latency, CPU usage
}
```

**2. Monitor CPU utilization**:
- If CPU at 100%: Right thread count (CPU-bound)
- If CPU < 50%: Too few threads (I/O-bound, increase)
- If CPU at 100% but throughput low: Too many threads (context switching)

**3. Measure queue depth**:
- Queue always empty: Too many threads (or low traffic)
- Queue growing: Too few threads (or overloaded)

**4. Consider workload**:
```
Network echo server:    2-4× cores (mostly I/O)
Image processor:        1× cores (CPU-bound)
Database proxy:         4-8× cores (heavy I/O)
Mixed workload:         2× cores (balanced)
```

**Dynamic adjustment** (advanced):
```cpp
void adjust_thread_count() {
    if (queue_depth > threshold && cpu_usage < 80%) {
        add_worker_thread();  // I/O-bound, add threads
    }
    if (cpu_usage > 95% && throughput_not_increasing()) {
        remove_worker_thread();  // Too many threads
    }
}
```

**Interview answer structure**:
1. Mention CPU-bound vs I/O-bound distinction
2. Give rule of thumb (cores vs 2-4× cores)
3. Say you'd benchmark to find optimal
4. Mention monitoring (CPU usage, queue depth)

#### Q12: What are the pros and cons of using fork() vs threads for handling multiple clients?

**Difficulty:** #beginner
**Category:** #fork_vs_threads #design_choices
**Concepts:** #processes #threads #isolation

**Answer:** Fork provides isolation but is heavy; threads are lighter but share memory. Choose based on scale and isolation needs.

**Explanation:**

**Fork (Process per client)**:

**Pros**:
- **Strong isolation**: Separate memory spaces, one client crash doesn't affect others
- **Security**: Compromised child can't read other clients' data
- **Simple**: Each process independent, no synchronization needed
- **Debugging**: Easier to debug (can attach to specific process)

**Cons**:
- **Heavy**: Each process consumes significant memory (separate address space)
- **Slow creation**: fork() is expensive (~1ms per fork)
- **Limited scalability**: Typically limited to ~100-1000 processes
- **IPC complexity**: Processes need pipes/shared memory to communicate

**Threads (Thread per client)**:

**Pros**:
- **Lightweight**: Share memory, much less overhead than processes
- **Fast creation**: Creating thread ~10× faster than fork (~0.1ms)
- **Better scalability**: Can handle 1000-10000 threads
- **Easy communication**: Shared memory makes data sharing simple

**Cons**:
- **No isolation**: One thread bug can crash entire process
- **Synchronization**: Need mutexes/atomics for shared data (race conditions)
- **Security**: Compromised thread has access to all memory
- **Debugging**: Harder to debug (interleaved execution)

**Comparison table**:

| Aspect | Fork | Threads |
|--------|------|---------|
| Memory | High (separate space) | Low (shared space) |
| Creation time | ~1ms | ~0.1ms |
| Max clients | 100-1000 | 1000-10000 |
| Isolation | Strong | None |
| Communication | Hard (IPC) | Easy (shared memory) |
| Debugging | Easier | Harder |
| Crash impact | Isolated | Entire process |

**When to use fork**:
- Security-critical (banking, authentication)
- Long-lived connections
- Need strong isolation
- Small scale (< 100 clients)

**When to use threads**:
- Medium to high scale (100-10000 clients)
- Need to share data between clients
- Performance matters
- Shorter connections

**Real-world examples**:
- Apache MPM prefork: Uses fork (isolation for security)
- Apache MPM worker: Uses threads (better performance)
- Nginx: Neither! Uses event-driven (epoll) for massive scale

**Interview tip**: Explain you'd choose based on requirements (scale, security, complexity), mention hybrid approaches (process pool + threads), and modern servers use event-driven for massive scale.

#### Q13: How do you prevent race conditions when multiple threads access shared data?

**Difficulty:** #intermediate
**Category:** #thread_safety #race_conditions
**Concepts:** #mutex #atomic #critical_section

**Answer:** Use mutexes for critical sections, or std::atomic for simple operations; ensure all access to shared data is synchronized.

**Explanation:**

**Problem**: Multiple threads accessing shared data without synchronization causes unpredictable results.

**Solution 1: Mutex (mutual exclusion)**
```cpp
std::mutex data_mutex;
int shared_counter = 0;

void increment() {
    std::lock_guard<std::mutex> lock(data_mutex);  // Acquire lock
    shared_counter++;
    // Lock automatically released when 'lock' goes out of scope
}
```

**std::lock_guard vs std::unique_lock**:
```cpp
// lock_guard: Simple, auto lock/unlock, can't manually unlock
std::lock_guard<std::mutex> lock(mutex);

// unique_lock: Flexible, can unlock/lock manually, needed for condition_variable
std::unique_lock<std::mutex> lock(mutex);
lock.unlock();  // Can unlock manually
// Do work without lock
lock.lock();    // Can relock
```

**Solution 2: std::atomic (lock-free for simple types)**
```cpp
std::atomic<int> shared_counter{0};

void increment() {
    shared_counter++;  // Thread-safe, no mutex needed
}
```

**When to use atomic**:
- Simple operations (++, --, load, store)
- No mutex overhead (faster)
- Primitive types (int, bool, pointer)

**When to use mutex**:
- Complex operations (multiple variables)
- STL containers (vector, map, etc.)
- Multi-step operations that must be atomic together

**Solution 3: Read-Write Lock (shared_mutex)**
```cpp
std::shared_mutex data_mutex;
std::map<int, std::string> data;

void read_data(int key) {
    std::shared_lock<std::shared_mutex> lock(data_mutex);  // Multiple readers OK
    auto it = data.find(key);
    // ...
}

void write_data(int key, std::string value) {
    std::unique_lock<std::shared_mutex> lock(data_mutex);  // Exclusive access
    data[key] = value;
}
```

**Multiple readers, single writer**:
- Many threads can read simultaneously (shared_lock)
- Only one thread can write (unique_lock, blocks all readers/writers)
- Use when reads >> writes

**Best practices**:

**1. Minimize critical section**:
```cpp
// ❌ BAD: Lock held during slow operation
{
    std::lock_guard<std::mutex> lock(mutex);
    process_data();  // Slow
    shared_data = result;
}

// ✅ GOOD: Process outside lock, only lock for update
auto result = process_data();  // No lock
{
    std::lock_guard<std::mutex> lock(mutex);
    shared_data = result;  // Quick
}
```

**2. Avoid deadlocks**:
```cpp
// ❌ BAD: Can deadlock
Thread 1: lock(mutex_a); lock(mutex_b);
Thread 2: lock(mutex_b); lock(mutex_a);  // Deadlock!

// ✅ GOOD: Always lock in same order
Thread 1: lock(mutex_a); lock(mutex_b);
Thread 2: lock(mutex_a); lock(mutex_b);

// Or use std::scoped_lock (C++17)
std::scoped_lock lock(mutex_a, mutex_b);  // Deadlock-free
```

**3. Don't forget to protect ALL access**:
```cpp
std::mutex mutex;
int counter = 0;

void increment() {
    std::lock_guard<std::mutex> lock(mutex);
    counter++;  // ✅ Protected
}

void get_count() {
    return counter;  // ❌ BUG! Forgot to lock
}
```

#### Q14: What is the difference between std::lock_guard and std::unique_lock?

**Difficulty:** #intermediate
**Category:** #synchronization #mutexes
**Concepts:** #lock_guard #unique_lock #RAII

**Answer:** lock_guard is simple RAII lock (auto lock/unlock); unique_lock is flexible (can unlock/relock, needed for condition_variable).

**Explanation:**

**std::lock_guard** (simple, most common):
```cpp
{
    std::lock_guard<std::mutex> lock(mutex);  // Locks immediately
    // Critical section
    counter++;
}  // Automatically unlocks when 'lock' destroyed
```

**Features**:
- Locks on construction, unlocks on destruction (RAII)
- Cannot manually unlock
- Cannot relock
- Lightweight, minimal overhead
- **Use 95% of the time**

**std::unique_lock** (flexible):
```cpp
{
    std::unique_lock<std::mutex> lock(mutex);  // Locks immediately

    // Can manually unlock
    lock.unlock();

    // Do work without lock
    expensive_operation();

    // Can relock
    lock.lock();

    // Can transfer ownership
    std::unique_lock<std::mutex> lock2 = std::move(lock);
}  // Automatically unlocks if still locked
```

**Features**:
- Can defer locking: `std::unique_lock<std::mutex> lock(mutex, std::defer_lock);`
- Can manually unlock()/lock()
- Can transfer ownership (movable)
- **Required for std::condition_variable**
- Slightly more overhead

**When to use unique_lock**:

**1. With condition_variable** (requires unique_lock):
```cpp
std::unique_lock<std::mutex> lock(mutex);
cv.wait(lock, []{ return ready; });  // Must be unique_lock
```

**2. Need to unlock temporarily**:
```cpp
std::unique_lock<std::mutex> lock(mutex);
auto data = shared_data;  // Read under lock
lock.unlock();            // Release lock
process(data);            // Process without lock
lock.lock();              // Reacquire
shared_data = result;     // Write under lock
```

**3. Deferred locking**:
```cpp
std::unique_lock<std::mutex> lock1(mutex1, std::defer_lock);
std::unique_lock<std::mutex> lock2(mutex2, std::defer_lock);
std::lock(lock1, lock2);  // Lock both atomically (deadlock-free)
```

**Performance comparison**:
```
lock_guard: ~10ns overhead
unique_lock: ~12ns overhead (slightly more due to flexibility)
```

**Interview answer**: "I use lock_guard for simple cases (95% of the time). I use unique_lock when I need to unlock manually, for condition_variable, or for advanced locking patterns. lock_guard is preferred when possible due to simplicity."

#### Q15: How would you implement a server that broadcasts messages to all connected clients (chat server)?

**Difficulty:** #advanced
**Category:** #design #shared_state
**Concepts:** #broadcast #mutex #client_registry

**Answer:** Maintain shared client registry protected by mutex; when message received, iterate all clients and send.

**Explanation:**

**Architecture**:
```cpp
std::mutex clients_mutex;
std::map<int, std::string> clients;  // fd -> username

void register_client(int fd, const std::string& username) {
    std::lock_guard<std::mutex> lock(clients_mutex);
    clients[fd] = username;
}

void unregister_client(int fd) {
    std::lock_guard<std::mutex> lock(clients_mutex);
    clients.erase(fd);
}

void broadcast(int sender_fd, const std::string& message) {
    std::string sender_name;

    // Get sender's name and build message
    {
        std::lock_guard<std::mutex> lock(clients_mutex);
        sender_name = clients[sender_fd];
    }

    std::string full_msg = sender_name + ": " + message;

    // Send to all clients
    {
        std::lock_guard<std::mutex> lock(clients_mutex);
        for (const auto& [fd, username] : clients) {
            if (fd != sender_fd) {  // Don't echo to sender
                send(fd, full_msg.c_str(), full_msg.size(), MSG_NOSIGNAL);
            }
        }
    }
}

void handle_client(int client_fd) {
    // Read username
    char buffer[256];
    ssize_t bytes = recv(client_fd, buffer, sizeof(buffer) - 1, 0);
    buffer[bytes] = '\0';
    std::string username(buffer);

    register_client(client_fd, username);

    // Chat loop
    while (true) {
        bytes = recv(client_fd, buffer, sizeof(buffer) - 1, 0);
        if (bytes <= 0) break;

        buffer[bytes] = '\0';
        broadcast(client_fd, std::string(buffer));
    }

    unregister_client(client_fd);
    close(client_fd);
}
```

**Key design decisions**:

**1. Thread safety**:
- All access to `clients` map protected by mutex
- Lock held only during map operations (minimize critical section)

**2. Handling slow clients**:
```cpp
void broadcast_safe(int sender_fd, const std::string& message) {
    std::vector<int> failed_clients;

    {
        std::lock_guard<std::mutex> lock(clients_mutex);
        for (const auto& [fd, username] : clients) {
            if (fd == sender_fd) continue;

            if (send(fd, message.c_str(), message.size(), MSG_NOSIGNAL) < 0) {
                failed_clients.push_back(fd);  // Mark for removal
            }
        }
    }

    // Remove failed clients
    for (int fd : failed_clients) {
        unregister_client(fd);
        close(fd);
    }
}
```

**3. Alternative: Lock-free queue per client** (advanced):
```cpp
struct ClientConnection {
    int fd;
    std::string username;
    std::queue<std::string> message_queue;
    std::mutex queue_mutex;
};

std::map<int, std::shared_ptr<ClientConnection>> clients;

void broadcast(const std::string& message) {
    // Add message to each client's queue
    for (auto& [fd, client] : clients) {
        std::lock_guard<std::mutex> lock(client->queue_mutex);
        client->message_queue.push(message);
    }
}

// Each client has dedicated sender thread
void sender_thread(std::shared_ptr<ClientConnection> client) {
    while (true) {
        std::string message;
        {
            std::lock_guard<std::mutex> lock(client->queue_mutex);
            if (client->message_queue.empty()) continue;
            message = client->message_queue.front();
            client->message_queue.pop();
        }
        send(client->fd, message.c_str(), message.size(), MSG_NOSIGNAL);
    }
}
```

**Advantages of per-client queues**:
- Slow client doesn't block broadcast
- Can prioritize messages
- Can drop messages if queue full (overload protection)

**Disadvantages**:
- More complex
- More threads (receiver + sender per client)
- More memory (queues)

**Interview answer**: "I'd maintain a thread-safe client registry with mutex protection. For simple case, iterate and send directly. For production, I'd use per-client message queues with dedicated sender threads to prevent slow clients from blocking broadcast."

#### Q16: What system call is used to reap zombie processes? Why is WNOHANG flag important?

**Difficulty:** #intermediate
**Category:** #process_management #fork
**Concepts:** #waitpid #wnohang #zombie

**Answer:** waitpid() reaps zombies; WNOHANG makes it non-blocking so SIGCHLD handler doesn't block on multiple zombies.

**Explanation:**

**Basic reaping**:
```cpp
pid_t pid = wait(NULL);  // Blocks until any child exits
```

**waitpid() with options**:
```cpp
pid_t waitpid(pid_t pid, int* status, int options);
```

**Parameters**:
- **pid**:
  - `>0` = specific child PID
  - `-1` = any child (like wait())
  - `0` = any child in same process group
- **status**: Exit status pointer (or NULL if don't care)
- **options**:
  - `0` = blocking
  - `WNOHANG` = non-blocking (return immediately if no child exited)
  - `WUNTRACED` = return if child stopped (for job control)

**Why WNOHANG is important in SIGCHLD handler**:

**Without WNOHANG (bad)**:
```cpp
void sigchld_handler(int sig) {
    wait(NULL);  // ❌ Only reaps ONE zombie
}

// If 3 children exit before handler runs:
// - First child: Reaped by wait()
// - Second child: Zombie!
// - Third child: Zombie!
// Handler returns after first wait(), doesn't reap all
```

**With WNOHANG (correct)**:
```cpp
void sigchld_handler(int sig) {
    int saved_errno = errno;
    while (waitpid(-1, NULL, WNOHANG) > 0);  // ✅ Reaps ALL zombies
    errno = saved_errno;
}
```

**How it works**:
```
Child 1 exits → SIGCHLD sent
Child 2 exits → SIGCHLD sent (may be merged)
Child 3 exits → SIGCHLD sent (may be merged)

Handler runs:
  waitpid() → returns PID of child 1
  waitpid() → returns PID of child 2
  waitpid() → returns PID of child 3
  waitpid() → returns 0 (WNOHANG, no more zombies)
  Loop exits
```

**Why loop is necessary**:
- Multiple children can exit before handler runs
- Multiple SIGCHLD signals can be merged (not queued)
- Must loop until waitpid() returns 0 or -1

**Checking exit status**:
```cpp
void sigchld_handler(int sig) {
    int status;
    pid_t pid;

    while ((pid = waitpid(-1, &status, WNOHANG)) > 0) {
        if (WIFEXITED(status)) {
            int exit_code = WEXITSTATUS(status);
            printf("Child %d exited with code %d\n", pid, exit_code);
        } else if (WIFSIGNALED(status)) {
            int signal = WTERMSIG(status);
            printf("Child %d killed by signal %d\n", pid, signal);
        }
    }
}
```

**Save/restore errno**:
```cpp
void sigchld_handler(int sig) {
    int saved_errno = errno;  // ✅ Save
    while (waitpid(-1, NULL, WNOHANG) > 0);
    errno = saved_errno;      // ✅ Restore
}
```

**Why**: Signal handlers can interrupt system calls (like accept()), which set errno. If handler modifies errno, the interrupted syscall sees wrong error code.

#### Q17: How do you handle a situation where the thread pool queue is full?

**Difficulty:** #advanced
**Category:** #thread_pool #overload
**Concepts:** #backpressure #queue_limit #rejection

**Answer:** Reject gracefully with error response, implement backpressure, or block with timeout; depends on application requirements.

**Explanation:**

**Problem**: Queue has maximum size (prevent memory exhaustion). What to do when full?

**Option 1: Reject with error** (common for HTTP servers):
```cpp
bool ThreadPool::add_client(int client_fd) {
    std::lock_guard<std::mutex> lock(queue_mutex);

    if (client_queue.size() >= MAX_QUEUE_SIZE) {
        // Send error response
        const char* error = "HTTP/1.1 503 Service Unavailable\r\n"
                           "Content-Length: 20\r\n\r\n"
                           "Server overloaded\r\n";
        send(client_fd, error, strlen(error), MSG_NOSIGNAL);
        close(client_fd);
        return false;  // Rejected
    }

    client_queue.push(client_fd);
    cv.notify_one();
    return true;
}
```

**Pros**: Fast, client knows immediately
**Cons**: Client must retry

**Option 2: Block with timeout** (wait for space):
```cpp
bool ThreadPool::add_client_with_timeout(int client_fd, int timeout_ms) {
    std::unique_lock<std::mutex> lock(queue_mutex);

    auto deadline = std::chrono::steady_clock::now() +
                   std::chrono::milliseconds(timeout_ms);

    while (client_queue.size() >= MAX_QUEUE_SIZE) {
        if (space_available_cv.wait_until(lock, deadline) == std::cv_status::timeout) {
            // Timeout
            const char* error = "HTTP/1.1 503 Service Unavailable\r\n\r\n";
            send(client_fd, error, strlen(error), MSG_NOSIGNAL);
            close(client_fd);
            return false;
        }
    }

    client_queue.push(client_fd);
    cv.notify_one();
    return true;
}

// Worker notifies when space available
void worker_thread() {
    while (true) {
        int client_fd;
        {
            std::unique_lock<std::mutex> lock(queue_mutex);
            cv.wait(lock, [this]{ return stop || !client_queue.empty(); });
            // ...
            client_fd = client_queue.front();
            client_queue.pop();
            space_available_cv.notify_one();  // Notify add_client
        }
        handle_client(client_fd);
    }
}
```

**Pros**: Absorbs short bursts, client might not see error
**Cons**: Main thread blocks (can't accept other clients)

**Option 3: Dynamic thread pool** (increase workers):
```cpp
void adjust_pool_size() {
    std::lock_guard<std::mutex> lock(queue_mutex);

    if (client_queue.size() > MAX_QUEUE_SIZE * 0.9 &&
        workers.size() < MAX_WORKERS) {
        // 90% full, add worker
        workers.emplace_back([this]{ worker_thread(); });
    }
}
```

**Pros**: Adapts to load
**Cons**: Complex, still bounded by MAX_WORKERS

**Option 4: Backpressure** (slow down source):
```cpp
// TCP backpressure: Don't accept() new clients when overloaded
while (!shutdown) {
    if (pool.queue_size() >= MAX_QUEUE_SIZE * 0.9) {
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
        continue;  // Don't accept
    }

    int client_fd = accept(server_fd, NULL, NULL);
    pool.add_client(client_fd);
}
```

**Pros**: Prevents queue from filling
**Cons**: Clients queue in kernel's listen backlog instead

**Production strategy** (combination):
1. Set reasonable queue size (100-1000)
2. Reject when full (with 503 error)
3. Monitor queue depth (metrics/alerting)
4. Auto-scale (add servers when overloaded)
5. Rate limiting at load balancer

**Interview answer**: "I'd reject with 503 error when queue is full—clients know to retry. I'd also monitor queue depth and alert when consistently high, indicating need to scale. For some applications, a timeout-based block might be appropriate to absorb short bursts."

#### Q18: What is the SA_RESTART flag in sigaction()? Why is it important for servers?

**Difficulty:** #advanced
**Category:** #signals #fork
**Concepts:** #sa_restart #eintr #signal_handling

**Answer:** SA_RESTART automatically restarts system calls interrupted by signals; prevents accept()/recv() from failing with EINTR.

**Explanation:**

**Problem without SA_RESTART**:
```cpp
signal(SIGCHLD, sigchld_handler);  // Old-style signal()

int client_fd = accept(server_fd, NULL, NULL);
// Signal arrives → accept() returns -1, errno = EINTR
if (client_fd < 0) {
    perror("accept");  // "accept: Interrupted system call"
    // Must check errno == EINTR and retry!
}
```

**Solution with SA_RESTART**:
```cpp
struct sigaction sa;
sa.sa_handler = sigchld_handler;
sigemptyset(&sa.sa_mask);
sa.sa_flags = SA_RESTART;  // ✅ Auto-restart interrupted syscalls
sigaction(SIGCHLD, &sa, NULL);

int client_fd = accept(server_fd, NULL, NULL);
// Signal arrives → handler runs → accept() automatically restarts!
// No EINTR error, no manual retry needed
```

**How it works**:
```
1. accept() is blocking
2. SIGCHLD signal arrives
3. Kernel interrupts accept()
4. Handler runs
5. With SA_RESTART: Kernel restarts accept() automatically
6. Without SA_RESTART: accept() returns -1, errno = EINTR
```

**Which system calls are affected**:
- **Restarted**: accept(), recv(), send(), read(), write(), select(), poll()
- **Not restarted**: Operations with timeouts (may return early)

**Without SA_RESTART (manual handling)**:
```cpp
while (true) {
    int client_fd = accept(server_fd, NULL, NULL);

    if (client_fd < 0) {
        if (errno == EINTR) {
            continue;  // Retry
        }
        perror("accept");
        break;
    }

    // Handle client
}
```

**With SA_RESTART (cleaner)**:
```cpp
while (true) {
    int client_fd = accept(server_fd, NULL, NULL);

    if (client_fd < 0) {
        perror("accept");  // Real error, not EINTR
        break;
    }

    // Handle client
}
```

**When NOT to use SA_RESTART**:
- Want signals to interrupt operations (for cancellation)
- Need precise control over interruption behavior
- Using alarm() for timeouts

**Example: Graceful shutdown**:
```cpp
// DON'T use SA_RESTART for shutdown signal
struct sigaction sa;
sa.sa_handler = shutdown_handler;
sigemptyset(&sa.sa_mask);
sa.sa_flags = 0;  // No SA_RESTART
sigaction(SIGINT, &sa, NULL);

// accept() will return EINTR on Ctrl+C, can check shutdown flag
while (!shutdown_requested) {
    int fd = accept(server_fd, NULL, NULL);
    if (fd < 0 && errno == EINTR && shutdown_requested) {
        break;  // Clean shutdown
    }
    // ...
}
```

**Interview answer**: "SA_RESTART automatically restarts system calls interrupted by signals, avoiding EINTR errors. I'd use it for SIGCHLD to avoid manual retry logic in accept() loop. For shutdown signals, I'd not use SA_RESTART so I can detect interruption and exit gracefully."

#### Q19: How would you implement connection limiting (max N clients) in a multi-threaded server?

**Difficulty:** #intermediate
**Category:** #resource_management #limits
**Concepts:** #connection_limit #semaphore #atomic

**Answer:** Use atomic counter or semaphore to track active connections; reject new clients when limit reached.

**Explanation:**

**Option 1: Atomic counter** (simple):
```cpp
std::atomic<int> active_connections{0};
const int MAX_CONNECTIONS = 1000;

void handle_client(int client_fd) {
    active_connections++;

    // Handle client...

    active_connections--;
}

int main() {
    while (true) {
        if (active_connections >= MAX_CONNECTIONS) {
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
            continue;  // Don't accept
        }

        int client_fd = accept(server_fd, NULL, NULL);
        if (client_fd < 0) continue;

        std::thread t(handle_client, client_fd);
        t.detach();
    }
}
```

**Problem**: Race condition between check and accept()
```
Thread 1: Check active_connections (999) < 1000 ✓
Thread 2: Check active_connections (999) < 1000 ✓
Thread 1: accept() → 1000 connections
Thread 2: accept() → 1001 connections (over limit!)
```

**Option 2: Accept with check and reject** (correct):
```cpp
void main() {
    while (true) {
        int client_fd = accept(server_fd, NULL, NULL);
        if (client_fd < 0) continue;

        if (active_connections >= MAX_CONNECTIONS) {
            const char* error = "HTTP/1.1 503 Service Unavailable\r\n\r\n"
                               "Too many connections\r\n";
            send(client_fd, error, strlen(error), MSG_NOSIGNAL);
            close(client_fd);
            continue;
        }

        std::thread t(handle_client, client_fd);
        t.detach();
    }
}
```

**Option 3: Semaphore** (elegant):
```cpp
#include <semaphore.h>

sem_t connection_sem;
const int MAX_CONNECTIONS = 1000;

void init() {
    sem_init(&connection_sem, 0, MAX_CONNECTIONS);  // Start with 1000 permits
}

void handle_client(int client_fd) {
    // Handle client...

    sem_post(&connection_sem);  // Release permit
}

int main() {
    init();

    while (true) {
        int client_fd = accept(server_fd, NULL, NULL);
        if (client_fd < 0) continue;

        if (sem_trywait(&connection_sem) == 0) {  // Try to acquire permit
            std::thread t(handle_client, client_fd);
            t.detach();
        } else {
            // No permits available
            const char* error = "503 Service Unavailable\r\n";
            send(client_fd, error, strlen(error), MSG_NOSIGNAL);
            close(client_fd);
        }
    }
}
```

**C++ semaphore (C++20)**:
```cpp
#include <semaphore>

std::counting_semaphore<1000> connection_sem{1000};

void handle_client(int client_fd) {
    // Handle client...
    connection_sem.release();  // Release permit
}

int main() {
    while (true) {
        int client_fd = accept(server_fd, NULL, NULL);
        if (client_fd < 0) continue;

        if (connection_sem.try_acquire()) {
            std::thread t(handle_client, client_fd);
            t.detach();
        } else {
            reject_client(client_fd);
        }
    }
}
```

**Option 4: Thread pool** (automatic limiting):
```cpp
ThreadPool pool(100);  // Only 100 threads = max 100 connections

while (true) {
    int client_fd = accept(server_fd, NULL, NULL);
    if (!pool.add_client(client_fd)) {
        reject_client(client_fd);  // Queue full
    }
}
```

**Production considerations**:
- Per-IP connection limits (prevent single client from consuming all)
- Graceful rejection (error message, not RST)
- Monitoring (track rejections, alert if high)
- Dynamic limits (increase during low-load periods)

**Interview answer**: "I'd use atomic counter to track active connections, check after accept(), and reject with 503 error if over limit. For cleaner implementation, I'd use semaphore or thread pool which provides natural limiting."

#### Q20: What happens if the main thread exits while detached threads are still running?

**Difficulty:** #intermediate
**Category:** #threads #lifecycle
**Concepts:** #detach #main_exit #thread_termination

**Answer:** Program terminates immediately, detached threads are killed without cleanup; must join threads or wait before main() exits.

**Explanation:**

**Problem code**:
```cpp
int main() {
    int server_fd = create_server();

    for (int i = 0; i < 10; i++) {
        int client_fd = accept(server_fd, NULL, NULL);
        std::thread t(handle_client, client_fd);
        t.detach();  // Detached
    }

    std::cout << "Main exiting\n";
    return 0;  // ❌ BUG: Main exits immediately!
}
// All detached threads killed abruptly
// No cleanup, connections closed without goodbye message
```

**What happens**:
1. Main thread reaches return 0
2. Program initiates shutdown
3. All threads (detached or not) are terminated immediately
4. No destructors run for thread-local objects
5. Connections closed without FIN
6. Clients see abrupt disconnect

**Solution 1: Keep main alive**:
```cpp
int main() {
    int server_fd = create_server();

    while (true) {  // ✅ Main never exits
        int client_fd = accept(server_fd, NULL, NULL);
        std::thread t(handle_client, client_fd);
        t.detach();
    }

    return 0;  // Never reached
}
```

**Solution 2: Track and join detached threads** (contradiction - can't join detached threads!):
```cpp
// Can't join detached threads - must not detach
std::vector<std::thread> threads;

int main() {
    for (int i = 0; i < 10; i++) {
        int client_fd = accept(...);
        threads.emplace_back(handle_client, client_fd);
        // Don't detach!
    }

    // Join all before exit
    for (std::thread& t : threads) {
        if (t.joinable()) t.join();
    }

    return 0;  // ✅ All threads finished
}
```

**Solution 3: Condition variable + flag**:
```cpp
std::mutex threads_mutex;
std::condition_variable threads_cv;
std::atomic<int> active_threads{0};

void handle_client(int fd) {
    active_threads++;

    // Handle client...

    active_threads--;
    threads_cv.notify_one();
}

int main() {
    // Accept clients...
    for (...) {
        std::thread t(handle_client, fd);
        t.detach();
    }

    // Wait for all detached threads to finish
    std::unique_lock<std::mutex> lock(threads_mutex);
    threads_cv.wait(lock, []{ return active_threads == 0; });

    return 0;  // ✅ All threads finished
}
```

**Real-world behavior**:

**Long-running server**:
```cpp
// Main never exits - runs until killed
int main() {
    while (true) {
        // Accept and detach
    }
}
```

**Short test program**:
```cpp
// Must join or wait
int main() {
    // Launch threads
    wait_for_all_threads();  // ✅ Must wait
    return 0;
}
```

**Why detached threads don't prevent exit**:
- Detached threads are "daemonized"
- When all non-detached threads exit, program exits
- Main thread is non-detached, so main() return → exit

**Interview answer**: "When main() exits, all threads (detached or not) are killed immediately. For long-running servers, main never exits. For tests, I must either not detach (and join before exit) or use condition variable to wait for detached threads to finish."

---

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Q1
```cpp
std::atomic<int> counter{0};

void thread_func() {
    for (int i = 0; i < 1000; i++) {
        counter++;
    }
}

int main() {
    std::thread t1(thread_func);
    std::thread t2(thread_func);
    t1.join();
    t2.join();
    std::cout << "Counter: " << counter << "\n";
}
```
What value will be printed? Is this code thread-safe?

---

#### Q2
```cpp
int server_fd = socket(AF_INET, SOCK_STREAM, 0);
bind(server_fd, ...);
listen(server_fd, 5);

while (true) {
    int client_fd = accept(server_fd, NULL, NULL);

    if (fork() == 0) {
        // Child process
        handle_client(client_fd);
        close(client_fd);
        exit(0);
    }
    // Parent process continues
}
```
What's wrong with this code? Will it cause resource leaks?

---

#### Q3
```cpp
void sigchld_handler(int signum) {
    waitpid(-1, NULL, 0);  // Reap one zombie
}

int main() {
    struct sigaction sa;
    sa.sa_handler = sigchld_handler;
    sigemptyset(&sa.sa_mask);
    sa.sa_flags = SA_RESTART;
    sigaction(SIGCHLD, &sa, NULL);

    // Server accepts 1000 clients
    for (int i = 0; i < 1000; i++) {
        int client_fd = accept(server_fd, NULL, NULL);
        if (fork() == 0) {
            close(server_fd);
            handle_client(client_fd);
            close(client_fd);
            exit(0);
        }
        close(client_fd);
    }
}
```
If 10 child processes exit at the same time, how many zombies will remain? Why?

---

#### Q4
```cpp
std::vector<int> active_clients;  // Global

void handle_client(int client_fd) {
    active_clients.push_back(client_fd);  // Add to active list

    char buffer[1024];
    while (recv(client_fd, buffer, sizeof(buffer), 0) > 0) {
        send(client_fd, buffer, strlen(buffer), 0);
    }

    // Remove from active list
    auto it = std::find(active_clients.begin(), active_clients.end(), client_fd);
    if (it != active_clients.end()) {
        active_clients.erase(it);
    }
    close(client_fd);
}

int main() {
    while (true) {
        int client_fd = accept(server_fd, NULL, NULL);
        std::thread t(handle_client, client_fd);
        t.detach();
    }
}
```
What will happen when multiple clients connect simultaneously? Is this code safe?

---

#### Q5
```cpp
class ThreadPool {
    std::queue<int> client_queue;
    std::mutex queue_mutex;
    std::condition_variable condition;
    std::atomic<bool> stop{false};

    void worker_thread() {
        while (!stop) {
            int client_fd;
            {
                std::unique_lock<std::mutex> lock(queue_mutex);
                condition.wait(lock);  // Wait for clients

                if (client_queue.empty()) continue;

                client_fd = client_queue.front();
                client_queue.pop();
            }
            handle_client(client_fd);
        }
    }
};
```
What's the bug in this thread pool implementation? What happens if stop becomes true?

---

#### Q6
```cpp
std::mutex cout_mutex;

void handle_client(int client_fd) {
    {
        std::lock_guard<std::mutex> lock(cout_mutex);
        std::cout << "Client connected: " << client_fd << "\n";
    }

    char buffer[1024];
    int n = recv(client_fd, buffer, sizeof(buffer), 0);

    {
        std::lock_guard<std::mutex> lock(cout_mutex);
        std::cout << "Received: " << buffer << "\n";
    }

    send(client_fd, buffer, n, 0);
    close(client_fd);
}
```
Is this lock_guard usage correct? Could it be improved?

---

#### Q7
```cpp
int server_fd = socket(AF_INET, SOCK_STREAM, 0);
bind(server_fd, ...);
listen(server_fd, 5);

std::atomic<int> active_threads{0};
const int MAX_THREADS = 100;

while (true) {
    if (active_threads >= MAX_THREADS) {
        usleep(100000);  // Sleep 100ms
        continue;
    }

    int client_fd = accept(server_fd, NULL, NULL);

    active_threads++;
    std::thread t([client_fd, &active_threads]() {
        handle_client(client_fd);
        active_threads--;
    });
    t.detach();
}
```
What's the problem with this connection limiting approach? What happens to the 101st client?

---

#### Q8
```cpp
void sigchld_handler(int signum) {
    int saved_errno = errno;
    while (waitpid(-1, NULL, WNOHANG) > 0);
    errno = saved_errno;
}

int main() {
    signal(SIGCHLD, sigchld_handler);  // ❌ Using signal()

    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    bind(server_fd, ...);
    listen(server_fd, 5);

    while (true) {
        int client_fd = accept(server_fd, NULL, NULL);
        if (client_fd < 0) {
            if (errno == EINTR) continue;  // Interrupted by signal
            perror("accept");
            break;
        }

        if (fork() == 0) {
            close(server_fd);
            handle_client(client_fd);
            exit(0);
        }
        close(client_fd);
    }
}
```
What's wrong with using signal() instead of sigaction()? Will this code work reliably?

---

#### Q9
```cpp
class ChatServer {
    std::vector<int> clients;
    std::mutex clients_mutex;

public:
    void add_client(int fd) {
        std::lock_guard<std::mutex> lock(clients_mutex);
        clients.push_back(fd);
    }

    void broadcast(const std::string& message) {
        std::lock_guard<std::mutex> lock(clients_mutex);

        for (int client_fd : clients) {
            int result = send(client_fd, message.c_str(), message.size(), 0);
            if (result < 0) {
                // Remove dead client
                auto it = std::find(clients.begin(), clients.end(), client_fd);
                clients.erase(it);  // ❌ Modifying while iterating
                close(client_fd);
            }
        }
    }
};
```
What will happen when broadcast() is called and a client disconnects? Is this safe?

---

#### Q10
```cpp
std::atomic<bool> stop_server{false};

void handle_shutdown(int signum) {
    stop_server = true;
}

int main() {
    signal(SIGINT, handle_shutdown);

    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    bind(server_fd, ...);
    listen(server_fd, 5);

    while (!stop_server) {
        int client_fd = accept(server_fd, NULL, NULL);
        if (client_fd < 0) continue;

        std::thread t(handle_client, client_fd);
        t.detach();
    }

    close(server_fd);
    return 0;  // ❌ Exit immediately
}
```
What's wrong with this graceful shutdown? What happens to the detached threads?

---

#### Q11
```cpp
int counter = 0;  // NOT atomic
std::mutex counter_mutex;

void increment_counter() {
    counter_mutex.lock();
    counter++;
    if (counter > 1000) {
        return;  // ❌ Early return without unlock
    }
    counter_mutex.unlock();
}

int main() {
    std::vector<std::thread> threads;
    for (int i = 0; i < 10; i++) {
        threads.emplace_back(increment_counter);
    }
    for (auto& t : threads) t.join();
    std::cout << "Counter: " << counter << "\n";
}
```
What will happen if counter exceeds 1000? Will the program hang?

---

#### Q12
```cpp
class ThreadPool {
    std::queue<int> client_queue;
    std::mutex queue_mutex;
    std::condition_variable condition;
    std::vector<std::thread> workers;
    std::atomic<bool> stop{false};

public:
    ThreadPool(int num_threads) {
        for (int i = 0; i < num_threads; i++) {
            workers.emplace_back(&ThreadPool::worker_thread, this);
        }
    }

    ~ThreadPool() {
        stop = true;
        // ❌ Missing condition.notify_all()
        for (auto& t : workers) {
            t.join();  // Will this hang?
        }
    }

    void worker_thread() {
        while (!stop) {
            std::unique_lock<std::mutex> lock(queue_mutex);
            condition.wait(lock, [this] {
                return stop || !client_queue.empty();
            });

            if (stop) break;

            int client_fd = client_queue.front();
            client_queue.pop();
            lock.unlock();

            handle_client(client_fd);
        }
    }
};
```
Will the destructor hang? Why or why not?

---

#### Q13
```cpp
void handle_client(int client_fd, int server_fd) {
    char buffer[1024];

    int n = recv(client_fd, buffer, sizeof(buffer), 0);
    if (n <= 0) {
        close(client_fd);
        return;
    }

    // Echo response
    send(client_fd, buffer, n, 0);

    // Special command: "SHUTDOWN"
    if (strncmp(buffer, "SHUTDOWN", 8) == 0) {
        close(server_fd);  // ❌ Close server socket
        std::cout << "Server shutting down...\n";
    }

    close(client_fd);
}

int main() {
    int server_fd = create_server_socket(8080);

    while (true) {
        int client_fd = accept(server_fd, NULL, NULL);
        std::thread t(handle_client, client_fd, server_fd);
        t.detach();
    }
}
```
What happens if one client sends "SHUTDOWN"? Will other threads be affected?

---

#### Q14
```cpp
std::condition_variable cv;
std::mutex cv_mutex;
int ready = 0;

void worker_thread() {
    std::unique_lock<std::mutex> lock(cv_mutex);
    cv.wait(lock);  // ❌ No predicate

    // Do work
    std::cout << "Worker started\n";
}

int main() {
    std::thread t(worker_thread);

    sleep(1);  // Ensure thread is waiting

    {
        std::lock_guard<std::mutex> lock(cv_mutex);
        ready = 1;
    }
    cv.notify_one();

    t.join();
}
```
What's wrong with this condition variable usage? Could the worker miss the notification?

---

#### Q15
```cpp
int server_fd = socket(AF_INET, SOCK_STREAM, 0);
bind(server_fd, ...);
listen(server_fd, 5);

std::vector<std::thread> client_threads;

while (true) {
    int client_fd = accept(server_fd, NULL, NULL);

    client_threads.emplace_back([client_fd]() {
        handle_client(client_fd);
    });
}

// ❌ Never joins threads
```
What happens to the threads in client_threads? Will this cause a crash?

---

### QUICK_REFERENCE: Answer Key and Cheat Sheets

#### Practice Tasks - Answer Key

**Q1: std::atomic thread safety**
- **Answer**: Counter will be **exactly 2000**
- **Explanation**: Yes, code is thread-safe. `std::atomic<int>` provides lock-free atomic increment. The `++` operator is atomic, so both threads can safely increment without race conditions.
- **Key concept**: `std::atomic<T>` is thread-safe for simple operations (increment, decrement, read, write)

**Q2: Fork resource leak**
- **Answer**: **Yes, file descriptor leak in parent process**
- **Bug**: Parent never calls `close(client_fd)` after fork
- **Fix**:
```cpp
if (fork() == 0) {
    close(server_fd);  // Child closes listening socket
    handle_client(client_fd);
    close(client_fd);  // Child closes client socket
    exit(0);
}
close(client_fd);  // ✅ Parent must close client socket
```
- **Why**: After fork(), both parent and child have the FD. Reference count is 2. Must close in both processes.

**Q3: Multiple zombies**
- **Answer**: **9 zombies will remain** (10 exit, handler reaps 1)
- **Bug**: `waitpid(-1, NULL, 0)` without `WNOHANG` is blocking and reaps only ONE zombie per signal
- **Problem**: Multiple SIGCHLD signals can be "coalesced" - kernel may deliver only one signal even if 10 children exit
- **Fix**: Use `WNOHANG` and loop:
```cpp
void sigchld_handler(int signum) {
    int saved_errno = errno;
    while (waitpid(-1, NULL, WNOHANG) > 0);  // Reap ALL zombies
    errno = saved_errno;
}
```

**Q4: Race condition on vector**
- **Answer**: **Undefined behavior - data races and crashes**
- **Problems**:
  1. Multiple threads modifying `active_clients` simultaneously (push_back, erase)
  2. Vector reallocation during push_back can invalidate iterators in other threads
  3. std::find and erase not atomic
- **Fix**: Protect all access with mutex:
```cpp
std::mutex clients_mutex;
std::vector<int> active_clients;

void handle_client(int client_fd) {
    {
        std::lock_guard<std::mutex> lock(clients_mutex);
        active_clients.push_back(client_fd);
    }

    // ... handle client ...

    {
        std::lock_guard<std::mutex> lock(clients_mutex);
        auto it = std::find(active_clients.begin(), active_clients.end(), client_fd);
        if (it != active_clients.end()) {
            active_clients.erase(it);
        }
    }
}
```

**Q5: Missing predicate in wait()**
- **Answer**: **Threads will never wake up when stop=true**
- **Bug**: `condition.wait(lock)` without predicate is vulnerable to spurious wakeups and won't check `stop` flag
- **Fix**:
```cpp
condition.wait(lock, [this] {
    return stop || !client_queue.empty();
});

if (stop && client_queue.empty()) break;  // Exit when stopping
```
- **Also**: Destructor must call `condition.notify_all()` to wake all waiting threads

**Q6: Correct but suboptimal**
- **Answer**: **Code is correct but locks more than necessary**
- **Improvement**: Only lock shared resources (stdout). Don't lock around recv/send which are per-client operations:
```cpp
void handle_client(int client_fd) {
    {
        std::lock_guard<std::mutex> lock(cout_mutex);
        std::cout << "Client connected: " << client_fd << "\n";
    }

    char buffer[1024];
    int n = recv(client_fd, buffer, sizeof(buffer), 0);  // No lock needed

    if (n > 0) {
        std::lock_guard<std::mutex> lock(cout_mutex);
        std::cout << "Received " << n << " bytes\n";
    }

    send(client_fd, buffer, n, 0);  // No lock needed
    close(client_fd);
}
```

**Q7: Blocking accept() with busy-wait**
- **Answer**: **101st client is blocked in accept() while loop busy-waits**
- **Problems**:
  1. `accept()` blocks until client connects, but then rejects due to thread limit
  2. Busy-wait loop wastes CPU checking `active_threads`
  3. Client experiences connect delay + rejection
- **Fix**: Accept first, then check limit and reject gracefully:
```cpp
int client_fd = accept(server_fd, NULL, NULL);

if (active_threads >= MAX_THREADS) {
    const char* msg = "HTTP/1.1 503 Service Unavailable\r\n\r\n";
    send(client_fd, msg, strlen(msg), 0);
    close(client_fd);
    continue;
}

active_threads++;
std::thread t([client_fd, &active_threads]() {
    handle_client(client_fd);
    active_threads--;
});
t.detach();
```

**Q8: signal() vs sigaction()**
- **Answer**: **Code may fail due to interrupted system calls**
- **Problems with signal()**:
  1. `signal()` does NOT set `SA_RESTART` by default
  2. When SIGCHLD arrives, `accept()` returns -1 with `errno=EINTR`
  3. Must manually check `EINTR` and retry (code does this, so it works but is fragile)
  4. `signal()` behavior varies across UNIX systems (not portable)
- **Fix**: Use `sigaction()` with `SA_RESTART`:
```cpp
struct sigaction sa;
sa.sa_handler = sigchld_handler;
sigemptyset(&sa.sa_mask);
sa.sa_flags = SA_RESTART;  // ✅ Auto-restart interrupted syscalls
sigaction(SIGCHLD, &sa, NULL);
```

**Q9: Modifying container while iterating**
- **Answer**: **Undefined behavior - iterator invalidation**
- **Bug**: `erase()` invalidates iterators, but loop continues with invalidated iterator
- **Fix**: Use erase-remove idiom or iterate backwards:
```cpp
void broadcast(const std::string& message) {
    std::lock_guard<std::mutex> lock(clients_mutex);

    // Collect dead clients
    std::vector<int> dead_clients;

    for (int client_fd : clients) {
        int result = send(client_fd, message.c_str(), message.size(), 0);
        if (result < 0) {
            dead_clients.push_back(client_fd);
        }
    }

    // Remove dead clients
    for (int dead_fd : dead_clients) {
        auto it = std::find(clients.begin(), clients.end(), dead_fd);
        if (it != clients.end()) {
            clients.erase(it);
        }
        close(dead_fd);
    }
}
```

**Q10: Immediate exit with detached threads**
- **Answer**: **Detached threads are killed immediately when main() exits**
- **Problems**:
  1. `return 0` in main() exits process immediately
  2. All detached threads are killed (not gracefully stopped)
  3. Clients may see broken connections
- **Fix**: Wait for all threads to finish:
```cpp
std::atomic<bool> stop_server{false};
std::atomic<int> active_connections{0};
std::mutex cv_mutex;
std::condition_variable cv;

void handle_client(int client_fd) {
    active_connections++;
    // ... handle client ...
    active_connections--;
    cv.notify_one();  // Signal one connection finished
    close(client_fd);
}

int main() {
    // ... setup ...

    while (!stop_server) {
        int client_fd = accept(server_fd, NULL, NULL);
        std::thread t(handle_client, client_fd);
        t.detach();
    }

    close(server_fd);  // Stop accepting new connections

    // Wait for all active connections to finish
    std::unique_lock<std::mutex> lock(cv_mutex);
    cv.wait(lock, [] { return active_connections == 0; });

    return 0;
}
```

**Q11: Early return without unlock**
- **Answer**: **Deadlock - mutex never unlocked**
- **Bug**: `return` without `unlock()` leaves mutex locked forever
- **Next thread**: Calls `lock()` and hangs forever
- **Fix**: Use RAII with `std::lock_guard`:
```cpp
void increment_counter() {
    std::lock_guard<std::mutex> lock(counter_mutex);  // ✅ Auto-unlock
    counter++;
    if (counter > 1000) {
        return;  // ✅ lock_guard destructor unlocks
    }
}
```

**Q12: Destructor hangs**
- **Answer**: **Yes, destructor will hang forever**
- **Bug**: Worker threads are waiting on `condition.wait()`. Setting `stop=true` doesn't wake them up.
- **Fix**: Call `notify_all()` after setting stop:
```cpp
~ThreadPool() {
    stop = true;
    condition.notify_all();  // ✅ Wake all waiting threads
    for (auto& t : workers) {
        t.join();
    }
}
```
- **Why it matters**: Without notification, threads remain blocked in `wait()` even though predicate is now true. The predicate check only happens when woken up.

**Q13: Closing shared server socket**
- **Answer**: **All threads will crash when calling accept()**
- **Problem**: Server socket is shared by all threads. When one thread closes it, `accept(server_fd, ...)` in main loop returns -1 with `EBADF` (bad file descriptor)
- **Fix**: Never pass server_fd to client handlers. Only main thread should manage server socket.
```cpp
void handle_client(int client_fd) {  // ✅ Don't pass server_fd
    // Handle shutdown with signal or atomic flag instead
}
```

**Q14: Missing predicate causes spurious wakeup**
- **Answer**: **Yes, worker can wake up before notify_one() is called**
- **Problem**: `cv.wait(lock)` without predicate is vulnerable to spurious wakeups (thread wakes for no reason)
- **Fix**: Always use predicate with wait():
```cpp
void worker_thread() {
    std::unique_lock<std::mutex> lock(cv_mutex);
    cv.wait(lock, [] { return ready == 1; });  // ✅ Predicate

    std::cout << "Worker started\n";
}
```
- **Why**: Predicate is checked on wakeup. If false (spurious wakeup), thread goes back to sleep.

**Q15: Threads never joined**
- **Answer**: **Program will call std::terminate() and crash**
- **Problem**: `std::thread` objects in vector are never joined or detached. When destructed (scope exit), `std::thread` destructor checks if thread is joinable. If yes, calls `std::terminate()`.
- **Fix Option 1**: Detach threads
```cpp
client_threads.emplace_back([client_fd]() {
    handle_client(client_fd);
});
client_threads.back().detach();  // ✅ Detach immediately
```
- **Fix Option 2**: Join all threads before exit
```cpp
// Before main() returns:
for (auto& t : client_threads) {
    if (t.joinable()) {
        t.join();
    }
}
```

---

#### Fork vs Threads vs Thread Pool - Quick Comparison

| Aspect | Fork (Process) | Threads (1 per client) | Thread Pool |
|--------|---------------|----------------------|-------------|
| **Isolation** | ✅ Complete (separate memory) | ❌ Shared memory | ❌ Shared memory |
| **Resource Cost** | High (~10MB per process) | Medium (~8KB per thread) | Low (fixed threads) |
| **Creation Time** | Slow (1-2ms) | Fast (~10μs) | Instant (reuse) |
| **Max Clients** | 100-1000 | 1000-10000 | 10000+ |
| **Crash Impact** | Isolated (child crash doesn't affect parent) | All threads crash | All threads crash |
| **Shared State** | Hard (need IPC) | Easy (direct access) | Easy (direct access) |
| **Synchronization** | Not needed | Mutex/atomic required | Mutex/atomic required |
| **Zombie Risk** | Yes (need SIGCHLD) | No | No |
| **FD Management** | Must close in both parent/child | Shared automatically | Shared automatically |
| **Use Case** | Security-critical, heavy isolation | Moderate concurrency, shared data | High concurrency, bounded resources |

---

#### Best Practices Checklist

**Fork-Based Servers:**
- [ ] Install SIGCHLD handler with SA_RESTART
- [ ] Use `while (waitpid(-1, NULL, WNOHANG) > 0)` to reap all zombies
- [ ] Child closes listening socket immediately after fork
- [ ] Parent closes client socket immediately after fork
- [ ] Consider double-fork to avoid zombies entirely

**Thread-Based Servers:**
- [ ] Always call `t.detach()` or `t.join()` (never leave joinable)
- [ ] Protect all shared data with mutex or atomic
- [ ] Use `std::lock_guard` for simple locking (RAII)
- [ ] Use `std::unique_lock` only when needed (condition variables, manual unlock)
- [ ] Limit max concurrent threads to prevent resource exhaustion

**Thread Pool Servers:**
- [ ] Use bounded queue (reject when full, don't OOM)
- [ ] Use `std::condition_variable` to wake workers efficiently
- [ ] Always use predicate with `wait()`: `cv.wait(lock, []{return condition;})`
- [ ] Notify all threads in destructor before joining
- [ ] Set optimal thread count: `std::thread::hardware_concurrency()` or `2x CPU cores`

**General:**
- [ ] Use `SA_RESTART` flag with sigaction() to auto-restart interrupted syscalls
- [ ] Set socket to non-blocking if using I/O multiplexing
- [ ] Handle `EINTR` from system calls (or use SA_RESTART)
- [ ] Implement graceful shutdown (atomic flag + wait for active connections)
- [ ] Log errors to syslog or file (not just stderr)
- [ ] Set resource limits (RLIMIT_NOFILE, RLIMIT_NPROC)

---

#### Common Pitfalls and Debugging Tips

**Zombie Processes:**
- **Symptom**: `ps aux | grep defunct` shows many `<defunct>` processes
- **Cause**: Parent not reaping children with waitpid()
- **Debug**: `kill -CHLD <parent_pid>` to trigger SIGCHLD handler
- **Fix**: Install proper SIGCHLD handler with WNOHANG loop

**File Descriptor Leaks:**
- **Symptom**: Server stops accepting after N clients, `accept()` returns EMFILE
- **Cause**: File descriptors not closed in parent or child after fork
- **Debug**: `lsof -p <pid>` to see open FDs
- **Fix**: Close client_fd in parent, close server_fd in child

**Race Conditions:**
- **Symptom**: Intermittent crashes, corrupted data, assertion failures
- **Cause**: Multiple threads accessing shared data without synchronization
- **Debug**: Run with ThreadSanitizer: `g++ -fsanitize=thread`
- **Fix**: Protect with mutex or use atomic

**Deadlocks:**
- **Symptom**: Server hangs, threads blocked forever
- **Cause**: Circular lock dependency or early return without unlock
- **Debug**: `gdb -p <pid>`, then `info threads`, `thread apply all bt`
- **Fix**: Use std::lock_guard (RAII), acquire locks in consistent order

**Thread Pool Hangs:**
- **Symptom**: Destructor never returns, workers stuck in wait()
- **Cause**: stop flag set but workers not notified
- **Debug**: Check if `condition.notify_all()` is called after setting stop flag
- **Fix**: Always notify after setting stop flag

**Spurious Wakeups:**
- **Symptom**: Condition variable wakes up but predicate is false
- **Cause**: `cv.wait(lock)` without predicate
- **Debug**: Add logging before and after wait()
- **Fix**: Always use predicate: `cv.wait(lock, []{return condition;})`

**Main Thread Exit:**
- **Symptom**: Server exits immediately, clients see broken connections
- **Cause**: `main()` returns while detached threads still running
- **Debug**: Add `sleep(999)` before return to see if threads complete
- **Fix**: Wait for active_connections to reach 0 before returning

---

#### Performance Tuning Guidelines

**Thread Pool Sizing:**
```cpp
// CPU-bound tasks (computation)
int num_threads = std::thread::hardware_concurrency();

// I/O-bound tasks (network, disk)
int num_threads = std::thread::hardware_concurrency() * 2;

// Mixed workload
int num_threads = std::thread::hardware_concurrency() + 2;
```

**Queue Sizing:**
```cpp
// Conservative (bounded, reject when full)
const int MAX_QUEUE_SIZE = num_threads * 2;

// Moderate (absorb spikes)
const int MAX_QUEUE_SIZE = num_threads * 10;

// Aggressive (high memory, no rejection)
const int MAX_QUEUE_SIZE = 10000;
```

**Connection Limits:**
```cpp
// Development/testing
const int MAX_CONNECTIONS = 100;

// Production (small server)
const int MAX_CONNECTIONS = 1000;

// Production (high-traffic)
const int MAX_CONNECTIONS = 10000;
```

**Resource Limits (setrlimit):**
```cpp
#include <sys/resource.h>

// Increase max file descriptors
struct rlimit rl;
rl.rlim_cur = 10000;
rl.rlim_max = 10000;
setrlimit(RLIMIT_NOFILE, &rl);

// Limit max processes (prevent fork bomb)
rl.rlim_cur = 1000;
rl.rlim_max = 1000;
setrlimit(RLIMIT_NPROC, &rl);
```

**Monitoring:**
```cpp
// Track metrics
std::atomic<uint64_t> total_connections{0};
std::atomic<uint64_t> active_connections{0};
std::atomic<uint64_t> rejected_connections{0};
std::atomic<uint64_t> bytes_sent{0};
std::atomic<uint64_t> bytes_received{0};

// Log periodically
void log_stats() {
    std::cout << "Total: " << total_connections
              << " Active: " << active_connections
              << " Rejected: " << rejected_connections
              << " Sent: " << bytes_sent
              << " Received: " << bytes_received << "\n";
}
```

---

**End of Topic 2: Multi-Client Server Patterns**

This topic covered the fundamental approaches to building servers that handle multiple simultaneous clients - from simple fork-based isolation to sophisticated thread pools. You learned about zombie processes, race conditions, file descriptor management, and production-ready patterns for building scalable network services.

**Next Topic Preview**: Topic 3 will introduce I/O Multiplexing with `select()`, enabling a single thread to monitor hundreds of connections simultaneously using event-driven architecture.

