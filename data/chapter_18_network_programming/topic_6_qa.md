### INTERVIEW_QA: Comprehensive Questions and Answers
#### Q1: When should you use sendfile() vs traditional read()/write()? What are the performance implications?

**Answer:**

**When to use sendfile():**
- Serving static files (HTTP/FTP file servers)
- Proxying large binary data between sockets
- Any file-to-socket transfer where data doesn't need modification
- Requirements: Linux kernel 2.2+, file and socket must support sendfile

**When NOT to use sendfile():**
- Data transformation needed (compression, encryption)
- Cross-platform requirement (sendfile is Linux-specific)
- Small files (<4KB) where overhead dominates
- Non-file sources (memory buffers, pipes)

**Performance implications:**

```cpp
// Traditional approach: 2 copies + 2 context switches
char buffer[8192];
while ((n = read(file_fd, buffer, sizeof(buffer))) > 0) {
    write(socket_fd, buffer, n);
}
// Data path: Disk → Kernel → User space → Kernel → Network
// CPU copies: 2 (kernel→user, user→kernel)
```

```cpp
// sendfile(): 0 copies + 1 context switch
off_t offset = 0;
sendfile(socket_fd, file_fd, &offset, file_size);
// Data path: Disk → Kernel → Network
// CPU copies: 0 (DMA only)
```

**Benchmarks:**
- Traditional: ~300 MB/s, 80% CPU usage
- sendfile(): ~900 MB/s, 20% CPU usage
- **3x throughput, 4x lower CPU usage**

**Production considerations:**
- Always handle partial sends (sendfile can return < requested bytes)
- Monitor EAGAIN/EWOULDBLOCK with non-blocking sockets
- Combine with epoll edge-triggered mode for maximum performance

---

#### Q2: Explain the difference between Reactor and Proactor patterns. Which would you use for a high-traffic web server?

**Answer:**

**Reactor Pattern (Synchronous I/O):**

```
Application registers interest → epoll_wait() returns → Application calls recv()
```

- **Pros:**
  - Simple mental model (you control when recv() is called)
  - Works on all platforms (epoll/kqueue/IOCP)
  - Easy to debug (synchronous call stack)
  - Mature ecosystem (nginx, Redis use Reactor)

- **Cons:**
  - recv() can still block briefly (even with EPOLLIN)
  - Application must handle partial reads/writes

**Proactor Pattern (Asynchronous I/O):**

```
Application submits read request → Kernel performs I/O → Kernel notifies completion
```

- **Pros:**
  - True zero-copy with io_uring (kernel writes directly to application buffer)
  - Higher theoretical throughput
  - Fewer system calls

- **Cons:**
  - Complex error handling (errors arrive asynchronously)
  - Platform-specific (io_uring requires Linux 5.1+, Windows IOCP)
  - Harder to debug (async call stacks)
  - Immature ecosystem (fewer production examples)

**Recommendation for high-traffic web server:**

**Use Reactor pattern** because:

1. **Proven at scale**: nginx (50% of top 10k websites), Redis (millions of req/sec) use Reactor
2. **Cross-platform**: Works on Linux (epoll), FreeBSD (kqueue), Windows (IOCP with emulation)
3. **Simpler debugging**: Synchronous errors easier to trace
4. **Good enough performance**: With epoll edge-triggered + non-blocking I/O, Reactor achieves 100k+ req/sec

**Consider Proactor (io_uring)** only if:
- Linux-only deployment
- Network I/O is proven bottleneck (profiling shows recv/send dominating CPU)
- Team has expertise in async I/O debugging
- Willing to invest in cutting-edge tech (io_uring still evolving)

**Hybrid approach**: Use Reactor for network I/O, Proactor (thread pool) for disk I/O.

---

#### Q3: How do you detect and handle stale connections in a connection pool? What's the cost of not handling them?

**Answer:**

**Detection strategies:**

**1. Health check on acquire (Recommended):**

```cpp
int acquire() {
    while (!available.empty()) {
        int fd = available.front();
        available.pop();
        
        // Send 0 bytes with MSG_DONTWAIT (doesn't block)
        int err = send(fd, nullptr, 0, MSG_DONTWAIT | MSG_NOSIGNAL);
        
        if (err == 0) {
            return fd;  // Healthy
        } else if (errno == ENOTCONN || errno == EPIPE) {
            close(fd);  // Stale, discard
            continue;
        }
    }
    
    return create_connection();  // No healthy connections
}
```

**Cost:** ~10 microseconds per acquire (negligible)

**2. TCP keepalive (Background probing):**

```cpp
int enable_keepalive(int fd) {
    int optval = 1;
    setsockopt(fd, SOL_SOCKET, SO_KEEPALIVE, &optval, sizeof(optval));
    
    // Start probing after 60s idle
    optval = 60;
    setsockopt(fd, IPPROTO_TCP, TCP_KEEPIDLE, &optval, sizeof(optval));
    
    // Probe every 10s
    optval = 10;
    setsockopt(fd, IPPROTO_TCP, TCP_KEEPINTVL, &optval, sizeof(optval));
    
    // 3 probes before declaring dead
    optval = 3;
    setsockopt(fd, IPPROTO_TCP, TCP_KEEPCNT, &optval, sizeof(optval));
}
```

**Cost:** Minimal CPU, small network overhead (keepalive packets)

**3. Periodic background validation:**

```cpp
void validate_pool() {
    std::lock_guard<std::mutex> lock(pool_mutex);
    
    auto it = available.begin();
    while (it != available.end()) {
        int fd = *it;
        
        if (send(fd, nullptr, 0, MSG_DONTWAIT | MSG_NOSIGNAL) < 0) {
            close(fd);
            it = available.erase(it);
        } else {
            ++it;
        }
    }
}
```

Run every 30-60 seconds in background thread.

**Cost of NOT handling stale connections:**

1. **User-facing errors**: Application tries to use stale connection → recv() returns 0 or ECONNRESET → Error propagates to user
2. **Retry overhead**: Must create new connection on failure (3-way handshake = 1.5 RTT)
3. **Resource leaks**: File descriptors remain open until timeout (default 2 hours)
4. **Cascading failures**: Retries increase load → connection pool exhaustion → service degradation

**Production incident example:**
- Database server restarted
- Application connection pool had 100 stale connections
- Next 100 requests failed (users saw errors)
- Pool took 10 minutes to fully recover
- **Solution:** Health check on acquire reduced recovery to <1 second

---

#### Q4: Compare round-robin, least-connections, and consistent hashing load balancing. When would you use each?

**Answer:**

**1. Round-Robin:**

```cpp
int select_backend() {
    int backend = current_backend;
    current_backend = (current_backend + 1) % backends.size();
    return backend;
}
```

**Pros:**
- Simple, fast (O(1))
- Fair distribution (each backend gets equal requests)
- Stateless (no memory overhead)

**Cons:**
- Ignores backend load (slow backend gets same traffic)
- Ignores request cost (heavy requests not distributed evenly)

**Use when:**
- All backends have equal capacity
- Requests have similar cost
- Backends are stateless (no session affinity needed)
- **Example:** Serving static files, stateless API endpoints

---

**2. Least-Connections:**

```cpp
int select_backend() {
    int min_conn = INT_MAX;
    int selected = 0;
    
    for (int i = 0; i < backends.size(); i++) {
        if (backends[i].active_connections < min_conn) {
            min_conn = backends[i].active_connections;
            selected = i;
        }
    }
    
    backends[selected].active_connections++;
    return selected;
}
```

**Pros:**
- Adapts to backend load (slow backends get fewer requests)
- Handles heterogeneous backends (different capacity)
- Self-correcting (if backend slows down, connections accumulate → fewer new requests)

**Cons:**
- Requires tracking connection count (memory overhead)
- Not session-aware (user may hit different backend)
- Slightly slower (O(n) backend scan)

**Use when:**
- Backends have different capacity (e.g., 2-core vs 8-core servers)
- Requests have variable duration (some take 10ms, others 1s)
- Need to drain backend gracefully (set weight to 0 → existing connections finish)
- **Example:** Database connection pooling, long-polling servers

---

**3. Consistent Hashing:**

```cpp
int select_backend(const std::string& key) {
    uint64_t hash = std::hash<std::string>{}(key);
    
    // Find first backend hash >= request hash
    auto it = std::lower_bound(ring.begin(), ring.end(), hash);
    
    if (it == ring.end()) {
        it = ring.begin();  // Wrap around
    }
    
    return it->backend_id;
}
```

**Pros:**
- Session affinity (same key → same backend)
- Minimal disruption on backend change (only K/N keys move, where K = total keys, N = backends)
- Cache efficiency (backend caches user data)

**Cons:**
- Not load-aware (hot keys cause imbalance)
- Requires identifying sticky key (user ID, session ID)
- Hash computation overhead

**Use when:**
- Backends cache per-user data (session cache, user profile)
- Need session affinity (WebSocket connections, stateful protocols)
- Frequent backend changes (auto-scaling)
- **Example:** Caching layers (Redis), WebSocket servers, CDN edge routing

---

**Decision matrix:**

| Requirement | Algorithm |
|-------------|-----------|
| Stateless backends, equal capacity | Round-robin |
| Heterogeneous backends, variable request cost | Least-connections |
| Session affinity, caching | Consistent hashing |
| Hybrid: Affinity + load balancing | Consistent hashing with bounded load |

**Production tip:** Use weighted least-connections as default (handles both capacity differences and load variation).

---

#### Q5: Explain the circuit breaker pattern. How does it prevent cascading failures?

**Answer:**

**Problem:**

```
Client → Proxy → Backend (down)
```

Without circuit breaker:
1. Backend fails → Proxy retries → 10s timeout
2. Requests queue up → Proxy exhausts threads
3. New requests time out → Clients see errors
4. **Cascading failure:** Proxy becomes unavailable even though it's healthy

**Solution: Circuit Breaker**

**Three states:**

```
CLOSED (normal) → OPEN (failing) → HALF_OPEN (testing) → CLOSED
```

**State machine:**

```cpp
class CircuitBreaker {
    enum class State { CLOSED, OPEN, HALF_OPEN };
    
    State state = State::CLOSED;
    int failure_count = 0;
    std::chrono::steady_clock::time_point opened_at;
    
    const int FAILURE_THRESHOLD = 5;
    const std::chrono::seconds TIMEOUT{30};
    
    bool allow_request() {
        auto now = std::chrono::steady_clock::now();
        
        if (state == State::OPEN) {
            // Check if timeout expired
            if (now - opened_at > TIMEOUT) {
                state = State::HALF_OPEN;
                std::cout << "Circuit HALF_OPEN (testing)\n";
                return true;  // Allow one test request
            }
            return false;  // Fail fast
        }
        
        return true;  // CLOSED or HALF_OPEN
    }
    
    void on_success() {
        if (state == State::HALF_OPEN) {
            state = State::CLOSED;
            std::cout << "Circuit CLOSED (recovered)\n";
        }
        failure_count = 0;
    }
    
    void on_failure() {
        failure_count++;
        
        if (state == State::HALF_OPEN) {
            // Test request failed, reopen circuit
            state = State::OPEN;
            opened_at = std::chrono::steady_clock::now();
            std::cout << "Circuit OPEN (test failed)\n";
        } else if (failure_count >= FAILURE_THRESHOLD) {
            state = State::OPEN;
            opened_at = std::chrono::steady_clock::now();
            std::cout << "Circuit OPEN (threshold exceeded)\n";
        }
    }
};
```

**How it prevents cascading failures:**

**1. Fail fast (OPEN state):**
- Backend is known to be down
- Immediately return error (no 10s timeout)
- Proxy threads don't block → Can serve other requests

**2. Automatic recovery testing (HALF_OPEN):**
- After timeout, allow one test request
- If succeeds → Circuit CLOSED (backend recovered)
- If fails → Circuit OPEN (backend still down)

**3. Resource protection:**
- No wasted connections to dead backend
- No thread exhaustion from retries
- Graceful degradation (return cached data or default response)

**Production example:**

```
Timeline:
- 10:00:00 - Backend crashes
- 10:00:01 - 5 requests fail → Circuit OPEN
- 10:00:02 - 1000 requests fail fast (no backend call)
- 10:00:30 - Circuit HALF_OPEN → Test request fails → Circuit OPEN
- 10:01:00 - Circuit HALF_OPEN → Test request succeeds → Circuit CLOSED
- 10:01:01 - Normal traffic resumes
```

**Without circuit breaker:**
- 1000 requests × 10s timeout = 10,000 thread-seconds wasted
- Proxy runs out of threads at request 100 → Proxy becomes unavailable

**With circuit breaker:**
- 5 requests × 10s timeout = 50 thread-seconds wasted
- 995 requests fail fast (< 1ms each)
- **Proxy remains available for other backends**

**Configuration guidelines:**

- **FAILURE_THRESHOLD:** 3-10 (too low = false positives, too high = slow detection)
- **TIMEOUT:** 10-60s (too low = flapping, too high = slow recovery)
- **HALF_OPEN test requests:** 1-3 (more = faster confidence, fewer = less load)

---

#### Q6: How do you implement application-level flow control to prevent overwhelming downstream services?

**Answer:**

**Problem:**

```
Fast Producer (1000 req/s) → Network → Slow Consumer (100 req/s)
```

Without flow control:
- Producer sends 1000 req/s → Consumer's receive buffer fills → TCP window shrinks → Producer blocks on send()
- **Deadlock:** If producer must also read (bidirectional protocol), blocking on send() prevents reading → Consumer can't send responses → Deadlock

**Solution 1: Token Bucket (Rate Limiting):**

```cpp
class TokenBucket {
    const int capacity = 100;  // Max burst
    const int refill_rate = 10;  // Tokens per second
    
    int tokens = capacity;
    std::chrono::steady_clock::time_point last_refill;
    
    bool try_consume(int n = 1) {
        refill();
        
        if (tokens >= n) {
            tokens -= n;
            return true;
        }
        return false;
    }
    
    void refill() {
        auto now = std::chrono::steady_clock::now();
        auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(now - last_refill).count();
        
        int new_tokens = (elapsed * refill_rate) / 1000;
        tokens = std::min(capacity, tokens + new_tokens);
        last_refill = now;
    }
};

// Usage
if (bucket.try_consume()) {
    send_request(downstream);
} else {
    // Back off: queue request or return 429 Too Many Requests
    queue.push(request);
}
```

**Pros:**
- Allows bursts (up to capacity)
- Smooth rate limiting
- Simple to implement

**Cons:**
- Doesn't adapt to downstream capacity
- Fixed rate (may be too conservative or aggressive)

---

**Solution 2: Backpressure with Queue Size:**

```cpp
std::unordered_map<int, std::deque<std::string>> write_queue;
const size_t MAX_QUEUE_SIZE = 1000;

void handle_upstream_data(int upstream_fd, int downstream_fd) {
    char buffer[8192];
    ssize_t n = recv(upstream_fd, buffer, sizeof(buffer), 0);
    
    if (write_queue[downstream_fd].size() > MAX_QUEUE_SIZE) {
        // Downstream is slow, apply backpressure
        
        // Option 1: Stop reading from upstream
        struct epoll_event ev;
        ev.events = EPOLLOUT;  // Only monitor write events
        ev.data.fd = upstream_fd;
        epoll_ctl(epfd, EPOLL_CTL_MOD, upstream_fd, &ev);
        
        std::cerr << "Backpressure: stopped reading from upstream\n";
        return;
    }
    
    // Queue data for downstream
    write_queue[downstream_fd].emplace_back(buffer, n);
    
    // Enable EPOLLOUT for downstream
    struct epoll_event ev;
    ev.events = EPOLLIN | EPOLLOUT;
    ev.data.fd = downstream_fd;
    epoll_ctl(epfd, EPOLL_CTL_MOD, downstream_fd, &ev);
}

void handle_downstream_writable(int downstream_fd, int upstream_fd) {
    auto& queue = write_queue[downstream_fd];
    
    while (!queue.empty()) {
        const std::string& data = queue.front();
        ssize_t sent = send(downstream_fd, data.c_str(), data.size(), MSG_NOSIGNAL);
        
        if (sent < 0) {
            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                break;  // Socket buffer full
            }
            // Handle error
            return;
        }
        
        queue.pop_front();
    }
    
    // Queue drained, resume reading from upstream
    if (queue.empty()) {
        struct epoll_event ev;
        ev.events = EPOLLIN;  // Resume reading
        ev.data.fd = upstream_fd;
        epoll_ctl(epfd, EPOLL_CTL_MOD, upstream_fd, &ev);
    }
}
```

**Pros:**
- Adapts to downstream capacity
- No requests dropped (queued)
- Automatic flow control

**Cons:**
- Memory usage (queue can grow)
- Must set MAX_QUEUE_SIZE carefully (too small = frequent backpressure, too large = memory exhaustion)

---

**Solution 3: Explicit Acknowledgments (Sliding Window):**

```cpp
class SlidingWindow {
    const int WINDOW_SIZE = 100;
    int next_seq = 0;
    int last_ack = 0;
    
    bool can_send() {
        return (next_seq - last_ack) < WINDOW_SIZE;
    }
    
    void send_request() {
        if (!can_send()) {
            // Window full, wait for ack
            return;
        }
        
        int seq = next_seq++;
        send_with_seq(seq);
    }
    
    void on_ack(int ack_seq) {
        last_ack = std::max(last_ack, ack_seq);
        
        // Window opened, can send more
        while (can_send() && !pending_queue.empty()) {
            send_request();
        }
    }
};
```

**Pros:**
- Precise flow control (consumer explicitly signals readiness)
- Works across multiple hops (each hop has its own window)
- Used in TCP (proven at scale)

**Cons:**
- Protocol complexity (must implement ACK mechanism)
- Higher latency (waiting for ACKs)

---

**Production recommendations:**

1. **API gateway → Backend:** Token bucket (429 Too Many Requests for excess)
2. **Proxy → Database:** Connection pool + queue with timeout
3. **Streaming protocols (WebSocket, gRPC):** Backpressure with queue size
4. **Distributed systems:** Explicit ACKs (ensures reliability)

**Key principle:** Always monitor EPOLLIN even during backpressure (prevents deadlock in bidirectional protocols).

---

#### Q7: What's the difference between SIGPIPE and EPIPE? How do you handle each in production?

**Answer:**

**SIGPIPE (Signal):**

- **When it occurs:** write() or send() to a socket with peer's receive side closed
- **Default behavior:** Process terminates immediately
- **Problem:** Crashes entire server on single client disconnect

**Example:**

```cpp
// Client closes connection
close(client_fd);

// Server writes without checking
send(client_fd, data, size, 0);  // ← SIGPIPE kills server process!
```

**EPIPE (Error Code):**

- **When it occurs:** Same as SIGPIPE, but when signal is blocked
- **Behavior:** send() returns -1, errno = EPIPE
- **Benefit:** Graceful error handling (no crash)

---

**Production handling:**

**Solution 1: Block SIGPIPE globally (Recommended):**

```cpp
// Block SIGPIPE for entire process
signal(SIGPIPE, SIG_IGN);

// Now send() returns EPIPE instead of killing process
ssize_t sent = send(fd, data, size, 0);
if (sent < 0 && errno == EPIPE) {
    std::cerr << "Client disconnected\n";
    close(fd);
}
```

**Pros:**
- One-time setup
- Works for all threads
- Simple

**Cons:**
- Global state (affects all send() calls)

---

**Solution 2: MSG_NOSIGNAL flag (Per-call):**

```cpp
ssize_t sent = send(fd, data, size, MSG_NOSIGNAL);
if (sent < 0) {
    if (errno == EPIPE || errno == ECONNRESET) {
        std::cerr << "Client disconnected\n";
        close(fd);
    } else if (errno == EAGAIN || errno == EWOULDBLOCK) {
        // Socket buffer full, retry later
    } else {
        perror("send");
    }
}
```

**Pros:**
- Per-call control
- Explicit (readers see MSG_NOSIGNAL and understand intent)

**Cons:**
- Must remember to add flag to every send()
- Verbose

---

**Related errors to handle together:**

```cpp
ssize_t safe_send(int fd, const void* data, size_t size) {
    ssize_t sent = send(fd, data, size, MSG_NOSIGNAL);
    
    if (sent < 0) {
        if (errno == EPIPE || errno == ECONNRESET) {
            // Peer closed connection gracefully or abruptly
            std::cerr << "Connection closed by peer\n";
            close(fd);
            return -1;
        } else if (errno == EAGAIN || errno == EWOULDBLOCK) {
            // Non-blocking socket, buffer full
            // Caller should wait for EPOLLOUT
            return 0;
        } else if (errno == EINTR) {
            // Interrupted by signal, retry
            return safe_send(fd, data, size);
        } else {
            // Unexpected error
            perror("send");
            return -1;
        }
    }
    
    return sent;
}
```

---

**Testing SIGPIPE handling:**

```cpp
// Test client: Connect and immediately close
int fd = socket(AF_INET, SOCK_STREAM, 0);
connect(fd, ...);
shutdown(fd, SHUT_RD);  // Close receive side
close(fd);

// Test server: Try to send
send(fd, data, size, 0);  // Should get EPIPE, not SIGPIPE
```

---

**Production checklist:**

- ✅ Block SIGPIPE globally: `signal(SIGPIPE, SIG_IGN);`
- ✅ Use MSG_NOSIGNAL in all send() calls
- ✅ Handle EPIPE, ECONNRESET, ETIMEDOUT together (all indicate peer disconnect)
- ✅ Close socket on error (prevents file descriptor leak)
- ✅ Log disconnects (helps debug misbehaving clients)

**Why both signal blocking AND MSG_NOSIGNAL?**

Defense in depth:
- signal(SIGPIPE, SIG_IGN) protects third-party libraries that don't use MSG_NOSIGNAL
- MSG_NOSIGNAL makes code self-documenting (readers see we handle EPIPE)

---

#### Q8: How do you handle the EMFILE (too many open files) error in a high-traffic server?

**Answer:**

**EMFILE: Process file descriptor limit exceeded**

**Typical limits:**

```bash
$ ulimit -n
1024  # Default per-process limit

$ cat /proc/sys/fs/file-max
1000000  # System-wide limit
```

**Problem:**

```cpp
int client_fd = accept(listen_fd, nullptr, nullptr);
if (client_fd < 0) {
    if (errno == EMFILE) {
        // ❌ Out of file descriptors!
        // Can't accept new connections
        // Existing connections still work
    }
}
```

---

**Solution 1: Increase ulimit (Preventive):**

```bash
# Temporary (current shell)
ulimit -n 100000

# Permanent (systemd service)
# /etc/systemd/system/myserver.service
[Service]
LimitNOFILE=100000

# Or in /etc/security/limits.conf
myuser soft nofile 100000
myuser hard nofile 100000
```

**Rule of thumb:**
- Expected connections: 10,000
- Set limit to: 20,000 (2x headroom for epoll, files, pipes, etc.)

---

**Solution 2: Reserve emergency FD (Reactive):**

```cpp
class Server {
    int listen_fd;
    int reserve_fd;  // Emergency file descriptor
    
    Server() {
        listen_fd = socket(AF_INET, SOCK_STREAM, 0);
        // ... bind, listen ...
        
        // Reserve one FD for emergencies
        reserve_fd = open("/dev/null", O_RDONLY);
    }
    
    void run() {
        while (true) {
            int client_fd = accept(listen_fd, nullptr, nullptr);
            
            if (client_fd < 0) {
                if (errno == EMFILE) {
                    std::cerr << "EMFILE: Out of file descriptors!\n";
                    
                    // Use reserve FD to accept and immediately close
                    close(reserve_fd);
                    client_fd = accept(listen_fd, nullptr, nullptr);
                    
                    if (client_fd >= 0) {
                        // Send HTTP 503 Service Unavailable
                        const char* response = "HTTP/1.1 503 Service Unavailable\r\n\r\n";
                        send(client_fd, response, strlen(response), 0);
                        close(client_fd);
                    }
                    
                    // Restore reserve
                    reserve_fd = open("/dev/null", O_RDONLY);
                    
                    // Trigger cleanup of idle connections
                    close_idle_connections();
                    continue;
                }
                
                perror("accept");
                break;
            }
            
            // Handle client normally
            handle_client(client_fd);
        }
    }
    
    void close_idle_connections() {
        // Find connections idle for >60s
        auto now = std::chrono::steady_clock::now();
        
        for (auto it = connections.begin(); it != connections.end(); ) {
            if (now - it->last_activity > std::chrono::seconds(60)) {
                std::cerr << "Closing idle connection (FD emergency)\n";
                close(it->fd);
                it = connections.erase(it);
            } else {
                ++it;
            }
        }
    }
};
```

**How reserve FD works:**

1. Normal: Reserve FD sits unused
2. EMFILE: Close reserve FD → 1 FD available
3. Accept connection with that FD
4. Send 503 error, close connection
5. Reopen reserve FD
6. Clean up idle connections to free more FDs

**Why this works:**

- Clients get explicit error (503) instead of connection refused
- Gives server chance to recover (close idle connections)
- Prevents cascading failures

---

**Solution 3: Connection limits (Preventive):**

```cpp
const int MAX_CONNECTIONS = 10000;
std::unordered_set<int> connections;

void handle_accept() {
    if (connections.size() >= MAX_CONNECTIONS) {
        // Temporarily stop accepting
        struct epoll_event ev;
        epoll_ctl(epfd, EPOLL_CTL_DEL, listen_fd, &ev);
        
        std::cerr << "Max connections reached, pausing accept\n";
        return;
    }
    
    int client_fd = accept(listen_fd, nullptr, nullptr);
    connections.insert(client_fd);
}

void handle_disconnect(int client_fd) {
    connections.erase(client_fd);
    close(client_fd);
    
    // Resume accepting if below limit
    if (connections.size() < MAX_CONNECTIONS) {
        struct epoll_event ev;
        ev.events = EPOLLIN;
        ev.data.fd = listen_fd;
        epoll_ctl(epfd, EPOLL_CTL_ADD, listen_fd, &ev);
    }
}
```

**Pros:**
- Prevents EMFILE entirely
- Explicit capacity management
- Graceful degradation (new connections wait, existing connections unaffected)

**Cons:**
- Must tune MAX_CONNECTIONS for workload
- Clients see connection refused if limit exceeded

---

**Solution 4: Monitor FD usage (Observability):**

```cpp
int get_open_fd_count() {
    DIR* dir = opendir("/proc/self/fd");
    int count = 0;
    
    struct dirent* entry;
    while ((entry = readdir(dir)) != nullptr) {
        if (entry->d_name[0] != '.') {
            count++;
        }
    }
    
    closedir(dir);
    return count - 1;  // Exclude the opendir FD
}

// Log every minute
void monitor_fds() {
    int open_fds = get_open_fd_count();
    int limit = get_fd_limit();  // From getrlimit(RLIMIT_NOFILE)
    
    float usage = (float)open_fds / limit * 100;
    std::cout << "FD usage: " << open_fds << "/" << limit << " (" << usage << "%)\n";
    
    if (usage > 80) {
        std::cerr << "WARNING: FD usage above 80%\n";
        // Alert ops team
    }
}
```

---

**Production strategy:**

1. **Prevention:**
   - Set ulimit to 2x expected connections
   - Enforce MAX_CONNECTIONS limit
   - Monitor FD usage

2. **Detection:**
   - Log EMFILE errors
   - Alert when FD usage >80%

3. **Recovery:**
   - Reserve emergency FD
   - Close idle connections (LRU eviction)
   - Send 503 to new clients (explicit error)

4. **Root cause:**
   - Fix FD leaks (missing close() calls)
   - Implement connection timeouts
   - Review keep-alive settings

---

#### Q9: Explain TCP keepalive vs application-level heartbeats. When do you need both?

**Answer:**

**TCP Keepalive (Transport Layer):**

```cpp
int enable_keepalive(int fd) {
    int optval = 1;
    setsockopt(fd, SOL_SOCKET, SO_KEEPALIVE, &optval, sizeof(optval));
    
    // Start probing after 60 seconds of idle
    optval = 60;
    setsockopt(fd, IPPROTO_TCP, TCP_KEEPIDLE, &optval, sizeof(optval));
    
    // Send probe every 10 seconds
    optval = 10;
    setsockopt(fd, IPPROTO_TCP, TCP_KEEPINTVL, &optval, sizeof(optval));
    
    // Give up after 3 failed probes
    optval = 3;
    setsockopt(fd, IPPROTO_TCP, TCP_KEEPCNT, &optval, sizeof(optval));
}
```

**How it works:**

1. Connection idle for 60s → Send TCP keepalive probe (empty ACK)
2. Peer responds → Connection alive
3. No response after 10s → Send another probe
4. After 3 failed probes (30s total) → Connection declared dead → recv() returns 0

**Pros:**
- Automatic (kernel handles it)
- No application code needed
- Detects network failures (cable unplugged, peer crashed)

**Cons:**
- Long detection time (60s + 30s = 90 seconds by default)
- Only detects TCP-level failures (not application hangs)
- OS-specific (Windows uses different defaults)
- Probe packets may be dropped by middleboxes (NAT, firewall)

---

**Application-Level Heartbeats:**

```cpp
// Protocol: Every 30s, send PING, expect PONG within 5s

void send_heartbeat(int fd) {
    const char* ping = "PING\n";
    send(fd, ping, 5, MSG_NOSIGNAL);
    
    auto now = std::chrono::steady_clock::now();
    connections[fd].last_ping = now;
}

void handle_message(int fd, const std::string& msg) {
    if (msg == "PING\n") {
        // Respond with PONG
        const char* pong = "PONG\n";
        send(fd, pong, 5, MSG_NOSIGNAL);
    } else if (msg == "PONG\n") {
        // Heartbeat response received
        connections[fd].last_pong = std::chrono::steady_clock::now();
    } else {
        // Application data
        process_message(msg);
    }
}

void check_heartbeats() {
    auto now = std::chrono::steady_clock::now();
    
    for (auto& [fd, conn] : connections) {
        auto since_pong = now - conn.last_pong;
        
        if (since_pong > std::chrono::seconds(35)) {
            // No PONG for 35s (missed heartbeat)
            std::cerr << "Heartbeat timeout, closing connection\n";
            close(fd);
            connections.erase(fd);
        } else if (since_pong > std::chrono::seconds(30)) {
            // Time to send heartbeat
            send_heartbeat(fd);
        }
    }
}
```

**Pros:**
- Fast detection (5-10s)
- Detects application hangs (peer alive but not responding)
- Can carry metadata (version, load, etc.)
- Consistent across platforms

**Cons:**
- Must implement in application
- Network overhead (heartbeat packets every 30s)
- Complexity (must handle PING/PONG in protocol)

---

**Comparison:**

| Feature | TCP Keepalive | App Heartbeat |
|---------|---------------|---------------|
| Detection time | 90s (default) | 5-10s |
| Detects network failure | ✅ Yes | ✅ Yes |
| Detects app hang | ❌ No | ✅ Yes |
| Implementation | 5 lines of code | ~50 lines |
| Network overhead | Minimal (only when idle) | Regular (every 30s) |
| Firewall/NAT friendly | ❌ May be dropped | ✅ Application data |

---

**When to use each:**

**TCP Keepalive only:**
- Long-lived connections (database, connection pool)
- Detection time >60s acceptable
- Want to detect network failures without app changes

**Application Heartbeat only:**
- Need fast failure detection (<10s)
- Must detect application-level hangs (peer alive but frozen)
- Firewall/NAT may drop TCP keepalives

**Both (Recommended for production):**

Use case: WebSocket server

```cpp
// TCP keepalive: Detect network failures
enable_keepalive(fd);  // 60s idle → probe

// Application heartbeat: Detect app hangs, keep NAT alive
send_heartbeat_every_30s(fd);
```

**Why both?**

1. **Defense in depth:**
   - TCP keepalive catches network failures (cable unplugged)
   - App heartbeat catches app hangs (deadlock, infinite loop)

2. **NAT traversal:**
   - Many NATs timeout after 60s idle
   - App heartbeat every 30s keeps NAT mapping alive
   - TCP keepalive (60s idle) may be too late

3. **Fast + Reliable:**
   - App heartbeat: Fast detection (10s)
   - TCP keepalive: Backup (if app heartbeat code has bugs)

**Production configuration:**

```cpp
// TCP keepalive: Catch network failures
TCP_KEEPIDLE = 60s   // Start probing after 60s idle
TCP_KEEPINTVL = 10s  // Probe every 10s
TCP_KEEPCNT = 3      // 3 failed probes = 30s timeout
// Total: 90s to detect network failure

// App heartbeat: Fast detection + NAT traversal
HEARTBEAT_INTERVAL = 30s  // Send PING every 30s
HEARTBEAT_TIMEOUT = 40s   // No PONG for 40s = dead
// Total: 40s to detect app hang
```

**Result:** Failures detected in 40s (app heartbeat) or 90s (TCP keepalive), whichever comes first.

---

#### Q10: How do you implement zero-downtime configuration reload for a network server?

**Answer:**

**Approaches:**

**1. SIGHUP signal handler (Recommended):**

```cpp
#include <signal.h>
#include <atomic>

std::atomic<bool> reload_config{false};

void sighup_handler(int) {
    reload_config.store(true);
}

int main() {
    // Register signal handler
    signal(SIGHUP, sighup_handler);
    
    Config config = load_config("server.conf");
    
    int listen_fd = create_server(config.port);
    int epfd = epoll_create1(0);
    
    while (true) {
        // Check if reload requested
        if (reload_config.exchange(false)) {
            std::cout << "Reloading configuration...\n";
            
            Config new_config = load_config("server.conf");
            
            // Validate config before applying
            if (validate_config(new_config)) {
                // Apply new config atomically
                config = new_config;
                std::cout << "Configuration reloaded successfully\n";
            } else {
                std::cerr << "Invalid config, keeping old config\n";
            }
        }
        
        struct epoll_event events[128];
        int n = epoll_wait(epfd, events, 128, 1000);  // 1s timeout
        
        for (int i = 0; i < n; i++) {
            // Use current config
            handle_event(events[i], config);
        }
    }
}
```

**Usage:**

```bash
# Send SIGHUP to reload
kill -HUP $(pidof myserver)

# Or with systemd
systemctl reload myserver
```

**Pros:**
- Zero downtime (server keeps running)
- Standard Unix mechanism
- Works with systemd

**Cons:**
- Limited to config changes (can't reload code)
- Must carefully handle in-flight requests

---

**2. Config file watcher (inotify):**

```cpp
#include <sys/inotify.h>

void watch_config_file(const std::string& path) {
    int inotify_fd = inotify_init1(IN_NONBLOCK);
    int watch_fd = inotify_add_watch(inotify_fd, path.c_str(), IN_MODIFY);
    
    // Add to epoll
    struct epoll_event ev;
    ev.events = EPOLLIN;
    ev.data.fd = inotify_fd;
    epoll_ctl(epfd, EPOLL_CTL_ADD, inotify_fd, &ev);
}

void handle_inotify_event(int inotify_fd) {
    char buffer[1024];
    ssize_t n = read(inotify_fd, buffer, sizeof(buffer));
    
    struct inotify_event* event = (struct inotify_event*)buffer;
    
    if (event->mask & IN_MODIFY) {
        std::cout << "Config file modified, reloading...\n";
        reload_configuration();
    }
}
```

**Pros:**
- Automatic (no manual reload needed)
- Instant (no polling)

**Cons:**
- Linux-specific (inotify)
- May trigger on partial writes (must handle)

---

**3. Graceful restart (SO_REUSEPORT):**

```cpp
// old_server (PID 1000):
int listen_fd = socket(AF_INET, SOCK_STREAM, 0);

int optval = 1;
setsockopt(listen_fd, SOL_SOCKET, SO_REUSEPORT, &optval, sizeof(optval));

bind(listen_fd, ...);
listen(listen_fd, SOMAXCONN);

// new_server (PID 2000):
int listen_fd = socket(AF_INET, SOCK_STREAM, 0);

int optval = 1;
setsockopt(listen_fd, SOL_SOCKET, SO_REUSEPORT, &optval, sizeof(optval));

bind(listen_fd, ...);  // ✅ Succeeds! Both processes share port
listen(listen_fd, SOMAXCONN);

// Now gracefully shutdown old server:
// 1. Stop accepting new connections
// 2. Wait for in-flight requests to finish
// 3. Exit
```

**Process:**

1. Start new server (new config, new code)
2. Both servers accept connections (kernel load-balances)
3. Old server stops accepting → finishes in-flight requests → exits
4. New server handles all traffic

**Pros:**
- Can reload code (not just config)
- Zero dropped connections
- Used by nginx, Envoy

**Cons:**
- Requires SO_REUSEPORT (Linux 3.9+)
- More complex orchestration

---

**4. File descriptor passing (systemd socket activation):**

```bash
# /etc/systemd/system/myserver.socket
[Socket]
ListenStream=8080

# /etc/systemd/system/myserver.service
[Service]
ExecStart=/usr/bin/myserver
ExecReload=/bin/kill -HUP $MAINPID
```

```cpp
// Server receives listening socket from systemd
int listen_fd = SD_LISTEN_FDS_START;  // FD 3

// On reload, systemd passes same FD to new process
```

**Pros:**
- Systemd handles socket management
- Perfect zero-downtime reload

**Cons:**
- Requires systemd
- Less portable

---

**Best practices for config reload:**

**1. Validate before applying:**

```cpp
Config new_config = load_config("server.conf");

if (!new_config.validate()) {
    std::cerr << "Invalid config: " << new_config.error() << "\n";
    return;  // Keep old config
}

// Atomic swap
config = new_config;
```

**2. Handle in-flight requests:**

```cpp
void reload_config() {
    // Stop accepting new connections
    epoll_ctl(epfd, EPOLL_CTL_DEL, listen_fd, nullptr);
    
    // Wait for in-flight requests (with timeout)
    auto start = std::chrono::steady_clock::now();
    while (!active_requests.empty()) {
        if (std::chrono::steady_clock::now() - start > std::chrono::seconds(30)) {
            std::cerr << "Timeout waiting for requests, proceeding anyway\n";
            break;
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
    
    // Apply new config
    config = new_config;
    
    // Resume accepting
    struct epoll_event ev;
    ev.events = EPOLLIN;
    ev.data.fd = listen_fd;
    epoll_ctl(epfd, EPOLL_CTL_ADD, listen_fd, &ev);
}
```

**3. Rollback on failure:**

```cpp
Config old_config = config;

try {
    config = load_config("server.conf");
    
    // Test new config (e.g., connect to new backend)
    test_connection(config.backend_host);
    
} catch (const std::exception& e) {
    std::cerr << "Config reload failed: " << e.what() << "\n";
    config = old_config;  // Rollback
}
```

**4. Log config changes:**

```cpp
void reload_config() {
    Config new_config = load_config("server.conf");
    
    std::cout << "Config changes:\n";
    if (new_config.port != config.port) {
        std::cout << "  port: " << config.port << " → " << new_config.port << "\n";
    }
    if (new_config.timeout != config.timeout) {
        std::cout << "  timeout: " << config.timeout << " → " << new_config.timeout << "\n";
    }
    
    config = new_config;
}
```

---

**Production recommendation:**

Use **SIGHUP signal handler** for most servers:
- Simple
- Standard Unix mechanism
- Works with systemd (`systemctl reload`)
- Enough for 90% of use cases

Use **SO_REUSEPORT graceful restart** for:
- Code changes (not just config)
- High-traffic servers where perfect zero-downtime is critical
- Microservices with frequent deployments


#### Q11: Compare epoll edge-triggered (EPOLLET) vs level-triggered mode. When is each appropriate?

**Answer:**

**Level-Triggered (Default):**

```
Behavior: epoll_wait() returns as long as data is available
```

```cpp
// Level-triggered
struct epoll_event ev;
ev.events = EPOLLIN;  // Level-triggered (default)
ev.data.fd = fd;
epoll_ctl(epfd, EPOLL_CTL_ADD, fd, &ev);

while (true) {
    struct epoll_event events[128];
    int n = epoll_wait(epfd, events, 128, -1);
    
    for (int i = 0; i < n; i++) {
        int fd = events[i].data.fd;
        
        char buffer[1024];
        ssize_t n = recv(fd, buffer, sizeof(buffer), 0);
        // ⚠️ If recv() doesn't drain socket, epoll_wait() returns immediately!
    }
}
```

**Pros:**
- Forgiving (won't miss data even if you don't drain socket)
- Simple (can use blocking recv())
- Compatible with traditional I/O patterns

**Cons:**
- Performance: epoll_wait() returns repeatedly if socket not drained
- Must drain socket or remove from epoll

---

**Edge-Triggered (EPOLLET):**

```
Behavior: epoll_wait() returns only on state change (new data arrived)
```

```cpp
// Edge-triggered
struct epoll_event ev;
ev.events = EPOLLIN | EPOLLET;  // Edge-triggered
ev.data.fd = fd;
epoll_ctl(epfd, EPOLL_CTL_ADD, fd, &ev);

// ✅ MUST set non-blocking
int flags = fcntl(fd, F_GETFL, 0);
fcntl(fd, F_SETFL, flags | O_NONBLOCK);

while (true) {
    struct epoll_event events[128];
    int n = epoll_wait(epfd, events, 128, -1);
    
    for (int i = 0; i < n; i++) {
        int fd = events[i].data.fd;
        
        // ✅ MUST drain socket completely
        while (true) {
            char buffer[1024];
            ssize_t n = recv(fd, buffer, sizeof(buffer), 0);
            
            if (n < 0) {
                if (errno == EAGAIN || errno == EWOULDBLOCK) {
                    // Socket drained, wait for next EPOLLIN
                    break;
                }
                // Handle error
                break;
            } else if (n == 0) {
                // Connection closed
                close(fd);
                break;
            }
            
            // Process data
        }
    }
}
```

**Pros:**
- High performance (fewer epoll_wait() returns)
- Scalability (won't thrash with many sockets)
- Precise control (know exactly when new data arrives)

**Cons:**
- Must drain socket completely (complex)
- Must use non-blocking I/O (otherwise recv() blocks)
- Easy to introduce bugs (missed data if not careful)

---

**Comparison:**

| Scenario | Level-Triggered | Edge-Triggered |
|----------|-----------------|----------------|
| Large message (10 MB) arrives | epoll_wait() returns every iteration until drained | epoll_wait() returns once |
| recv() reads 1 KB of 10 MB | epoll_wait() returns again | epoll_wait() doesn't return (you must loop) |
| Partial read | ✅ Safe (epoll_wait() returns again) | ❌ Dangerous (data stuck in socket buffer) |
| Performance (1000 sockets, 1 active) | 1 epoll_wait() | 1 epoll_wait() (same) |
| Performance (1000 sockets, all active, large messages) | 1000 epoll_wait() returns | 1000 epoll_wait() returns (same) |
| Performance (1 socket, large message, partial reads) | Multiple epoll_wait() returns | 1 epoll_wait() return (faster) |

---

**When to use each:**

**Level-Triggered (Recommended for most cases):**

- Default choice (safer)
- Simple request-response protocols (HTTP/1.1)
- Integration with existing blocking I/O code
- Don't need extreme performance (<100k req/sec)

**Example:**

```cpp
// Simple HTTP server (level-triggered)
char buffer[8192];
ssize_t n = recv(fd, buffer, sizeof(buffer), 0);

if (n > 0) {
    parse_request(buffer, n);
    send_response(fd);
}
```

---

**Edge-Triggered (Use for high performance):**

- Need to minimize epoll_wait() calls
- Handling large messages with partial reads
- High-traffic servers (>100k connections)
- Streaming protocols (video, audio)

**Example:**

```cpp
// High-performance HTTP server (edge-triggered)
std::string& read_buffer = connections[fd].read_buffer;

while (true) {
    char temp[8192];
    ssize_t n = recv(fd, temp, sizeof(temp), 0);
    
    if (n < 0) {
        if (errno == EAGAIN) break;  // Drained
        return;  // Error
    }
    
    read_buffer.append(temp, n);
}

// Parse complete requests from buffer
while (auto req = parse_request(read_buffer)) {
    send_response(fd, process(req));
}
```

---

**Common bugs with edge-triggered:**

**Bug 1: Not draining socket:**

```cpp
// ❌ WRONG: Only read once
char buffer[1024];
recv(fd, buffer, sizeof(buffer), 0);
// If 10 KB arrived, 9 KB stuck in socket buffer!
// epoll_wait() won't return again (no new data arrived)
```

**Fix:**

```cpp
// ✅ CORRECT: Drain completely
while (true) {
    char buffer[1024];
    ssize_t n = recv(fd, buffer, sizeof(buffer), 0);
    
    if (n < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) {
        break;  // Drained
    }
    
    process(buffer, n);
}
```

---

**Bug 2: Forgetting non-blocking mode:**

```cpp
// ❌ WRONG: Blocking socket with edge-triggered
struct epoll_event ev;
ev.events = EPOLLIN | EPOLLET;
epoll_ctl(epfd, EPOLL_CTL_ADD, fd, &ev);

// recv() blocks if no data → deadlock!
recv(fd, buffer, sizeof(buffer), 0);
```

**Fix:**

```cpp
// ✅ CORRECT: Non-blocking socket
int flags = fcntl(fd, F_GETFL, 0);
fcntl(fd, F_SETFL, flags | O_NONBLOCK);
```

---

**Production recommendation:**

Start with **level-triggered**:
- Easier to get right
- Performance is good enough for most use cases
- Can always optimize to edge-triggered later if profiling shows epoll_wait() is bottleneck

Switch to **edge-triggered** only if:
- Profiling shows epoll_wait() consuming significant CPU
- Handling very large messages (>100 KB)
- Need to support >100k concurrent connections

**Hybrid approach (nginx does this):**
- Edge-triggered for client connections (high volume, large responses)
- Level-triggered for internal services (low volume, simple)

---

#### Q12: How do you design a wire protocol for a custom network service? What are the key considerations?

**Answer:**

**Key considerations:**

1. **Framing** (How to delimit messages)
2. **Encoding** (How to represent data)
3. **Versioning** (How to evolve protocol)
4. **Error handling** (How to signal failures)
5. **Performance** (Latency, throughput, overhead)

---

**1. Framing Strategies:**

**a) Length-prefixed (Recommended):**

```
Wire format: [4-byte length][payload]

Example:
[0x00 0x00 0x00 0x0A]"Hello World"
 ↑ Length = 10        ↑ 10 bytes
```

```cpp
// Sending
void send_message(int fd, const std::string& msg) {
    uint32_t len = htonl(msg.size());  // Network byte order
    
    send(fd, &len, 4, MSG_NOSIGNAL);
    send(fd, msg.c_str(), msg.size(), MSG_NOSIGNAL);
}

// Receiving
std::string recv_message(int fd) {
    uint32_t len;
    recv_exactly(fd, &len, 4);
    len = ntohl(len);  // Host byte order
    
    std::string msg(len, '\0');
    recv_exactly(fd, &msg[0], len);
    
    return msg;
}

void recv_exactly(int fd, void* buf, size_t len) {
    size_t received = 0;
    
    while (received < len) {
        ssize_t n = recv(fd, (char*)buf + received, len - received, 0);
        if (n <= 0) throw std::runtime_error("Connection closed");
        received += n;
    }
}
```

**Pros:**
- Binary-safe (can send any data)
- No escaping needed
- Efficient parsing (know exact length upfront)

**Cons:**
- Must buffer complete message before processing
- 4-byte overhead per message

---

**b) Delimiter-based (Text protocols):**

```
Wire format: [payload]\n

Example: "GET /index.html HTTP/1.1\r\n"
```

```cpp
// Receiving
std::string recv_line(int fd) {
    std::string line;
    char c;
    
    while (recv(fd, &c, 1, 0) == 1) {
        if (c == '\n') break;
        line += c;
    }
    
    return line;
}
```

**Pros:**
- Human-readable (easy debugging with telnet/netcat)
- Simple

**Cons:**
- Slow (byte-by-byte recv, or buffering complexity)
- Not binary-safe (payload can't contain delimiter)
- Must escape delimiter if present in data

**Use for:** HTTP, SMTP, FTP (human-facing protocols)

---

**c) Hybrid (HTTP-style):**

```
Wire format: [text headers]\r\n\r\n[binary body]

Example:
Content-Length: 1024\r\n
Content-Type: application/octet-stream\r\n
\r\n
[binary data]
```

**Pros:**
- Human-readable headers
- Binary-safe body
- Extensible (add headers without breaking compatibility)

**Cons:**
- Complex parsing
- Higher overhead

**Use for:** REST APIs, gRPC (compatibility with HTTP/2)

---

**2. Encoding:**

**a) Binary (Recommended for performance):**

```cpp
struct Message {
    uint8_t version;
    uint8_t type;
    uint16_t flags;
    uint32_t payload_len;
    char payload[];
};

// Serialize
void send_message(int fd, uint8_t type, const std::string& payload) {
    Message msg;
    msg.version = 1;
    msg.type = type;
    msg.flags = htons(0);
    msg.payload_len = htonl(payload.size());
    
    send(fd, &msg, sizeof(Message), MSG_NOSIGNAL);
    send(fd, payload.c_str(), payload.size(), MSG_NOSIGNAL);
}
```

**Pros:**
- Compact (no overhead)
- Fast (no parsing)
- CPU cache-friendly

**Cons:**
- Not human-readable
- Endianness issues (must use htonl/ntohl)
- Alignment issues (struct padding)

---

**b) JSON (Text-based):**

```cpp
// {"type":"request","id":123,"path":"/api/data"}

void send_json(int fd, const json& msg) {
    std::string data = msg.dump();
    uint32_t len = htonl(data.size());
    
    send(fd, &len, 4, MSG_NOSIGNAL);
    send(fd, data.c_str(), data.size(), MSG_NOSIGNAL);
}
```

**Pros:**
- Human-readable
- Language-agnostic
- Flexible schema

**Cons:**
- Large (verbose keys)
- Slow parsing
- No schema enforcement

**Use for:** REST APIs, microservices, JavaScript clients

---

**c) Protobuf (Binary + schema):**

```protobuf
syntax = "proto3";

message Request {
  uint32 id = 1;
  string path = 2;
}
```

```cpp
Request req;
req.set_id(123);
req.set_path("/api/data");

std::string serialized = req.SerializeAsString();
send_message(fd, serialized);
```

**Pros:**
- Compact (binary)
- Schema (type safety)
- Backward/forward compatibility
- Fast parsing (generated code)

**Cons:**
- Requires code generation
- Not human-readable
- .proto file dependency

**Use for:** gRPC, microservices, high-performance RPC

---

**3. Versioning:**

**Problem:** Protocol evolves (new fields, new message types)

**Solution a: Version in header:**

```cpp
struct Header {
    uint8_t version;  // Current: 1
    uint8_t type;
    uint16_t flags;
    uint32_t length;
};

void handle_message(int fd, const Header& hdr, const std::string& payload) {
    if (hdr.version == 1) {
        handle_v1(fd, hdr, payload);
    } else if (hdr.version == 2) {
        handle_v2(fd, hdr, payload);
    } else {
        // Unknown version
        send_error(fd, "Unsupported version");
        close(fd);
    }
}
```

**Pros:**
- Explicit versioning
- Can reject incompatible versions

**Cons:**
- Must maintain multiple codepaths

---

**Solution b: Optional fields (Protobuf style):**

```protobuf
message Request {
  uint32 id = 1;           // Required (always present)
  string path = 2;         // Required
  
  string user_agent = 3;   // Added in v2 (optional)
  uint32 timeout = 4;      // Added in v3 (optional)
}
```

**Pros:**
- Backward compatible (old clients ignore new fields)
- Forward compatible (new clients handle missing fields)
- Single codebase

**Cons:**
- Must handle missing fields gracefully

---

**4. Error Handling:**

**Strategy a: Error codes in header:**

```cpp
struct Response {
    uint8_t version;
    uint8_t type;
    uint16_t error_code;  // 0 = success
    uint32_t length;
};

enum ErrorCode {
    SUCCESS = 0,
    INVALID_REQUEST = 1,
    NOT_FOUND = 2,
    INTERNAL_ERROR = 3,
};

void send_error(int fd, ErrorCode code, const std::string& message) {
    Response resp;
    resp.version = 1;
    resp.type = TYPE_ERROR;
    resp.error_code = htons(code);
    resp.length = htonl(message.size());
    
    send(fd, &resp, sizeof(resp), MSG_NOSIGNAL);
    send(fd, message.c_str(), message.size(), MSG_NOSIGNAL);
}
```

---

**Strategy b: Separate error message type:**

```cpp
enum MessageType {
    REQUEST = 1,
    RESPONSE = 2,
    ERROR = 3,
};

void handle_message(const Header& hdr, const std::string& payload) {
    if (hdr.type == ERROR) {
        std::cerr << "Error: " << payload << "\n";
        return;
    }
    
    // Normal handling
}
```

---

**5. Performance Optimization:**

**a) Batching:**

```cpp
// Instead of: send 100 small messages
for (int i = 0; i < 100; i++) {
    send_message(fd, msg);  // 100 system calls
}

// Batch: send 1 large message
std::string batch;
for (int i = 0; i < 100; i++) {
    batch += serialize(msg);
}
send_message(fd, batch);  // 1 system call
```

**Result:** 10x lower latency (fewer context switches)

---

**b) Zero-copy:**

```cpp
// Avoid intermediate buffer
struct iovec iov[2];
iov[0].iov_base = &header;
iov[0].iov_len = sizeof(header);
iov[1].iov_base = payload.data();
iov[1].iov_len = payload.size();

writev(fd, iov, 2);  // Single system call, no memcpy
```

---

**Production example: Redis Protocol (RESP):**

```
Simple strings: +OK\r\n
Errors: -ERR unknown command\r\n
Integers: :1000\r\n
Bulk strings: $5\r\nhello\r\n (length-prefixed)
Arrays: *2\r\n$3\r\nGET\r\n$3\r\nkey\r\n
```

**Why it's good:**
- Human-readable (easy debugging)
- Length-prefixed bulk strings (binary-safe)
- Simple parsing (line-based + length-prefix)
- Extensible (added new types in RESP3)

---

**Decision matrix:**

| Requirement | Choice |
|-------------|--------|
| Human-readable | Delimiter-based (HTTP, Redis) |
| Binary-safe | Length-prefixed |
| Performance | Binary encoding (Protobuf) |
| Flexibility | JSON |
| Type safety | Protobuf |
| Versioning | Version header or optional fields |

**Recommendation:** Length-prefixed binary protocol with Protobuf encoding for production systems.

---

#### Q13: Explain how to implement request timeouts in a non-blocking network server.

**Answer:**

**Problem:**

```
Client sends request → Server waits for database → Database hangs → Request never completes
```

Without timeout: Server thread/FD blocked forever

**Solution:** Track request start time, enforce deadline

---

**Implementation 1: Per-request timeout (Simple):**

```cpp
struct Request {
    int client_fd;
    std::string data;
    std::chrono::steady_clock::time_point start_time;
    std::chrono::seconds timeout{30};
};

std::unordered_map<int, Request> active_requests;

void handle_request(int client_fd, const std::string& data) {
    Request req;
    req.client_fd = client_fd;
    req.data = data;
    req.start_time = std::chrono::steady_clock::now();
    req.timeout = std::chrono::seconds(30);
    
    active_requests[client_fd] = req;
    
    // Start processing (non-blocking)
    process_async(req);
}

void check_timeouts() {
    auto now = std::chrono::steady_clock::now();
    
    for (auto it = active_requests.begin(); it != active_requests.end(); ) {
        auto& req = it->second;
        auto elapsed = now - req.start_time;
        
        if (elapsed > req.timeout) {
            std::cerr << "Request timeout (30s)\n";
            
            // Send timeout error to client
            const char* response = "HTTP/1.1 504 Gateway Timeout\r\n\r\n";
            send(req.client_fd, response, strlen(response), MSG_NOSIGNAL);
            
            close(req.client_fd);
            it = active_requests.erase(it);
        } else {
            ++it;
        }
    }
}

// Call check_timeouts() periodically (every 1 second)
void event_loop() {
    auto last_timeout_check = std::chrono::steady_clock::now();
    
    while (true) {
        auto now = std::chrono::steady_clock::now();
        
        // Check timeouts every 1 second
        if (now - last_timeout_check > std::chrono::seconds(1)) {
            check_timeouts();
            last_timeout_check = now;
        }
        
        // Normal epoll event processing
        struct epoll_event events[128];
        int timeout_ms = 1000;  // 1 second (for timeout checks)
        int n = epoll_wait(epfd, events, 128, timeout_ms);
        
        for (int i = 0; i < n; i++) {
            handle_event(events[i]);
        }
    }
}
```

**Pros:**
- Simple
- Works for any async operation

**Cons:**
- O(N) timeout checks (N = active requests)
- 1-second resolution (may timeout 0-1s late)

---

**Implementation 2: Priority queue (Efficient):**

```cpp
struct Request {
    int client_fd;
    std::string data;
    std::chrono::steady_clock::time_point deadline;
    
    bool operator>(const Request& other) const {
        return deadline > other.deadline;  // Min-heap (earliest deadline first)
    }
};

std::priority_queue<Request, std::vector<Request>, std::greater<Request>> timeout_queue;
std::unordered_map<int, Request> active_requests;

void handle_request(int client_fd, const std::string& data) {
    auto now = std::chrono::steady_clock::now();
    auto deadline = now + std::chrono::seconds(30);
    
    Request req;
    req.client_fd = client_fd;
    req.data = data;
    req.deadline = deadline;
    
    active_requests[client_fd] = req;
    timeout_queue.push(req);
    
    process_async(req);
}

void check_timeouts() {
    auto now = std::chrono::steady_clock::now();
    
    while (!timeout_queue.empty()) {
        const Request& req = timeout_queue.top();
        
        if (req.deadline > now) {
            break;  // No more timeouts
        }
        
        timeout_queue.pop();
        
        // Check if request is still active (may have completed)
        if (active_requests.count(req.client_fd)) {
            std::cerr << "Request timeout\n";
            
            send_error(req.client_fd, "504 Gateway Timeout");
            close(req.client_fd);
            active_requests.erase(req.client_fd);
        }
    }
}

// More efficient: only check when needed
void event_loop() {
    while (true) {
        // Calculate timeout until next deadline
        int timeout_ms = -1;  // Infinite
        
        if (!timeout_queue.empty()) {
            auto now = std::chrono::steady_clock::now();
            auto next_deadline = timeout_queue.top().deadline;
            
            if (next_deadline <= now) {
                timeout_ms = 0;  // Immediate timeout check
            } else {
                auto duration = next_deadline - now;
                timeout_ms = std::chrono::duration_cast<std::chrono::milliseconds>(duration).count();
            }
        }
        
        struct epoll_event events[128];
        int n = epoll_wait(epfd, events, 128, timeout_ms);
        
        // Check timeouts first
        check_timeouts();
        
        // Handle events
        for (int i = 0; i < n; i++) {
            handle_event(events[i]);
        }
    }
}
```

**Pros:**
- O(log N) inserts, O(1) timeout checks (until timeout)
- Precise timing (epoll_wait() wakes exactly at deadline)

**Cons:**
- More complex
- Heap overhead

---

**Implementation 3: Timerfd (Linux-specific):**

```cpp
#include <sys/timerfd.h>

int create_timeout_fd(int seconds) {
    int tfd = timerfd_create(CLOCK_MONOTONIC, TFD_NONBLOCK);
    
    struct itimerspec ts;
    ts.it_value.tv_sec = seconds;
    ts.it_value.tv_nsec = 0;
    ts.it_interval.tv_sec = 0;  // One-shot
    ts.it_interval.tv_nsec = 0;
    
    timerfd_settime(tfd, 0, &ts, nullptr);
    
    return tfd;
}

void handle_request(int client_fd, const std::string& data) {
    // Create timeout FD
    int timeout_fd = create_timeout_fd(30);
    
    // Add to epoll
    struct epoll_event ev;
    ev.events = EPOLLIN;
    ev.data.fd = timeout_fd;
    epoll_ctl(epfd, EPOLL_CTL_ADD, timeout_fd, &ev);
    
    // Track association
    timeout_fds[timeout_fd] = client_fd;
    
    // Start processing
    process_async(client_fd, data);
}

void handle_timeout(int timeout_fd) {
    int client_fd = timeout_fds[timeout_fd];
    
    std::cerr << "Request timeout (timerfd)\n";
    
    send_error(client_fd, "504 Gateway Timeout");
    close(client_fd);
    
    // Clean up timeout FD
    epoll_ctl(epfd, EPOLL_CTL_DEL, timeout_fd, nullptr);
    close(timeout_fd);
    timeout_fds.erase(timeout_fd);
}

void handle_completion(int client_fd) {
    // Find and cancel timeout FD
    for (auto it = timeout_fds.begin(); it != timeout_fds.end(); ++it) {
        if (it->second == client_fd) {
            int timeout_fd = it->first;
            
            epoll_ctl(epfd, EPOLL_CTL_DEL, timeout_fd, nullptr);
            close(timeout_fd);
            timeout_fds.erase(it);
            break;
        }
    }
    
    // Send response
    send_response(client_fd);
}
```

**Pros:**
- Kernel-managed (no manual timeout checks)
- Precise timing
- Integrates with epoll

**Cons:**
- One FD per timeout (FD limit concern)
- Linux-specific

---

**Comparison:**

| Method | Complexity | Precision | Overhead |
|--------|------------|-----------|----------|
| Periodic checks | Low | ~1s | O(N) CPU |
| Priority queue | Medium | Precise | O(log N) CPU |
| Timerfd | Medium | Precise | O(1) CPU, +1 FD per request |

---

**Production recommendation:**

**Priority queue** for most cases:
- Good balance of complexity and performance
- Portable (works on any OS)
- Efficient (O(log N) inserts, O(1) checks)

**Timerfd** for extreme scale (>100k concurrent requests):
- Kernel-managed (lower CPU)
- But requires FD limit tuning

---

**Adaptive timeouts:**

```cpp
struct ServiceStats {
    std::deque<std::chrono::milliseconds> latencies;
    
    void record(std::chrono::milliseconds latency) {
        latencies.push_back(latency);
        
        if (latencies.size() > 1000) {
            latencies.pop_front();
        }
    }
    
    std::chrono::milliseconds get_p99() {
        auto sorted = latencies;
        std::sort(sorted.begin(), sorted.end());
        
        size_t idx = sorted.size() * 0.99;
        return sorted[idx];
    }
};

// Adaptive timeout = 3 * p99 latency
auto timeout = std::max(
    std::chrono::seconds(5),  // Minimum 5s
    service_stats.get_p99() * 3
);
```

**Why:** Adapts to service performance (if service slow, increase timeout)

---

#### Q14: How do you implement connection draining for graceful shutdown?

**Answer:**

**Problem:**

```
Server receives SIGTERM → Immediately exits → In-flight requests lost
```

**Goal:** Graceful shutdown

1. Stop accepting new connections
2. Wait for in-flight requests to complete
3. Close idle connections
4. Exit

---

**Implementation:**

```cpp
#include <signal.h>
#include <atomic>

std::atomic<bool> shutdown_requested{false};

void sigterm_handler(int) {
    shutdown_requested.store(true);
}

struct Connection {
    int fd;
    std::chrono::steady_clock::time_point last_activity;
    bool has_active_request;
};

std::unordered_map<int, Connection> connections;

int main() {
    signal(SIGTERM, sigterm_handler);
    signal(SIGINT, sigterm_handler);
    
    int listen_fd = create_server(8080);
    int epfd = epoll_create1(0);
    
    // Add listen_fd to epoll
    struct epoll_event ev;
    ev.events = EPOLLIN;
    ev.data.fd = listen_fd;
    epoll_ctl(epfd, EPOLL_CTL_ADD, listen_fd, &ev);
    
    while (true) {
        // Check shutdown status
        if (shutdown_requested.load()) {
            std::cout << "Graceful shutdown initiated\n";
            
            // Step 1: Stop accepting new connections
            epoll_ctl(epfd, EPOLL_CTL_DEL, listen_fd, nullptr);
            close(listen_fd);
            std::cout << "Stopped accepting new connections\n";
            
            // Step 2: Close idle connections
            for (auto it = connections.begin(); it != connections.end(); ) {
                if (!it->second.has_active_request) {
                    std::cout << "Closing idle connection " << it->first << "\n";
                    close(it->first);
                    it = connections.erase(it);
                } else {
                    ++it;
                }
            }
            
            // Step 3: Wait for in-flight requests (with timeout)
            auto shutdown_start = std::chrono::steady_clock::now();
            const auto MAX_WAIT = std::chrono::seconds(30);
            
            while (!connections.empty()) {
                auto now = std::chrono::steady_clock::now();
                
                if (now - shutdown_start > MAX_WAIT) {
                    std::cerr << "Shutdown timeout, force closing " 
                              << connections.size() << " connections\n";
                    break;
                }
                
                // Continue processing events (for in-flight requests)
                struct epoll_event events[128];
                int n = epoll_wait(epfd, events, 128, 1000);
                
                for (int i = 0; i < n; i++) {
                    handle_event(events[i]);
                }
                
                std::cout << "Waiting for " << connections.size() 
                          << " in-flight requests...\n";
            }
            
            std::cout << "Graceful shutdown complete\n";
            break;
        }
        
        // Normal event processing
        struct epoll_event events[128];
        int n = epoll_wait(epfd, events, 128, 1000);
        
        for (int i = 0; i < n; i++) {
            int fd = events[i].data.fd;
            
            if (fd == listen_fd) {
                // Accept new connection (if not shutting down)
                int client_fd = accept(listen_fd, nullptr, nullptr);
                
                Connection conn;
                conn.fd = client_fd;
                conn.last_activity = std::chrono::steady_clock::now();
                conn.has_active_request = false;
                
                connections[client_fd] = conn;
                
                // Add to epoll
                struct epoll_event ev;
                ev.events = EPOLLIN;
                ev.data.fd = client_fd;
                epoll_ctl(epfd, EPOLL_CTL_ADD, client_fd, &ev);
                
            } else {
                // Handle client data
                handle_client(fd);
            }
        }
    }
    
    return 0;
}

void handle_client(int fd) {
    Connection& conn = connections[fd];
    
    char buffer[8192];
    ssize_t n = recv(fd, buffer, sizeof(buffer), 0);
    
    if (n <= 0) {
        // Connection closed
        close(fd);
        connections.erase(fd);
        return;
    }
    
    // Mark request as active
    conn.has_active_request = true;
    conn.last_activity = std::chrono::steady_clock::now();
    
    // Process request
    process_request(fd, buffer, n);
    
    // Mark request as complete
    conn.has_active_request = false;
}
```

---

**Enhanced: Health endpoint for load balancer:**

```cpp
bool accepting_connections = true;

void handle_health_check(int fd) {
    if (shutdown_requested.load() || !accepting_connections) {
        // Return 503 Service Unavailable (load balancer removes from pool)
        const char* response = "HTTP/1.1 503 Service Unavailable\r\n\r\n";
        send(fd, response, strlen(response), MSG_NOSIGNAL);
    } else {
        // Return 200 OK
        const char* response = "HTTP/1.1 200 OK\r\n\r\n";
        send(fd, response, strlen(response), MSG_NOSIGNAL);
    }
    
    close(fd);
}
```

**Load balancer integration:**

1. Deploy new version of server (v2)
2. v1 receives SIGTERM
3. v1 health check returns 503 → Load balancer removes v1 from pool
4. New traffic goes to v2
5. v1 drains in-flight requests (30s timeout)
6. v1 exits
7. **Zero dropped requests**

---

**Kubernetes graceful shutdown:**

```yaml
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: server
    lifecycle:
      preStop:
        exec:
          command: ["/bin/sh", "-c", "sleep 5"]  # Wait for load balancer to update
    terminationGracePeriodSeconds: 30  # Max time for shutdown
```

**Timeline:**

1. Kubernetes sends SIGTERM
2. preStop hook runs (sleep 5s for load balancer update)
3. Application drains connections (max 25s)
4. If still running after 30s → SIGKILL

---

**Production checklist:**

- ✅ Register SIGTERM/SIGINT handler
- ✅ Stop accepting new connections (close listen_fd)
- ✅ Close idle connections immediately
- ✅ Wait for in-flight requests (with timeout, e.g., 30s)
- ✅ Health endpoint returns 503 during shutdown
- ✅ Log shutdown progress (helps debug slow drains)
- ✅ Metrics: track in-flight request count

---

#### Q15: Compare SO_REUSEADDR vs SO_REUSEPORT. When do you need each?

**Answer:**

**SO_REUSEADDR:**

```cpp
int listen_fd = socket(AF_INET, SOCK_STREAM, 0);

int optval = 1;
setsockopt(listen_fd, SOL_SOCKET, SO_REUSEADDR, &optval, sizeof(optval));

bind(listen_fd, ...);  // Can bind even if previous socket in TIME_WAIT
```

**What it does:**

- Allows binding to address in TIME_WAIT state
- TIME_WAIT: TCP state after close() (lasts 2*MSL = 60-120 seconds)

**Problem without SO_REUSEADDR:**

```bash
$ ./server
Server listening on 0.0.0.0:8080

^C  # Ctrl-C (SIGINT)
Server exited

$ ./server
bind(): Address already in use  # ❌ Can't restart for 60s!
```

**Why:**

1. Server closes socket → Enters TIME_WAIT
2. Kernel reserves address for 60s (to handle delayed packets)
3. bind() fails

**With SO_REUSEADDR:**

```bash
$ ./server
Server listening on 0.0.0.0:8080

^C

$ ./server
Server listening on 0.0.0.0:8080  # ✅ Immediate restart
```

**Use cases:**

- ✅ **Always set SO_REUSEADDR on server sockets** (allows quick restart)
- ✅ Testing/development (frequent restarts)
- ❌ Never needed for client sockets (kernel chooses ephemeral port)

---

**SO_REUSEPORT (Linux 3.9+):**

```cpp
// Process 1:
int listen_fd1 = socket(AF_INET, SOCK_STREAM, 0);

int optval = 1;
setsockopt(listen_fd1, SOL_SOCKET, SO_REUSEPORT, &optval, sizeof(optval));

bind(listen_fd1, ...);  // Bind to 0.0.0.0:8080
listen(listen_fd1, SOMAXCONN);

// Process 2:
int listen_fd2 = socket(AF_INET, SOCK_STREAM, 0);

optval = 1;
setsockopt(listen_fd2, SOL_SOCKET, SO_REUSEPORT, &optval, sizeof(optval));

bind(listen_fd2, ...);  // ✅ Bind to SAME 0.0.0.0:8080!
listen(listen_fd2, SOMAXCONN);
```

**What it does:**

- Allows multiple processes/threads to bind to the same address:port
- Kernel load-balances incoming connections across all sockets

**How kernel distributes connections:**

- Hash-based: Based on (src_ip, src_port, dst_ip, dst_port)
- Result: Same client (same src_ip:src_port) → Same process (affinity)

**Use cases:**

**1. Multi-process server (nginx model):**

```cpp
// Parent process:
int listen_fd = create_server_with_reuseport(8080);

// Fork N workers
for (int i = 0; i < CPU_COUNT; i++) {
    if (fork() == 0) {
        // Child: inherits listen_fd
        while (true) {
            int client_fd = accept(listen_fd, nullptr, nullptr);
            handle_client(client_fd);
        }
        exit(0);
    }
}

// Parent: wait for children
wait(nullptr);
```

**Benefits:**

- Each worker has own epoll (no shared epoll lock)
- Kernel load-balances (no thundering herd)
- CPU affinity (same client → same worker → better cache locality)

---

**2. Zero-downtime reload:**

```bash
# Old server running (PID 1000)
./server &  # PID 1000, listening on :8080

# Start new server (new code)
./server &  # PID 2000, listening on SAME :8080 (SO_REUSEPORT)

# Both servers accept connections (kernel load-balances)

# Gracefully shutdown old server
kill -TERM 1000  # Drains connections, exits

# Now only new server (PID 2000) handles traffic
```

---

**3. Thread-per-core (avoid epoll lock):**

```cpp
for (int i = 0; i < CPU_COUNT; i++) {
    std::thread([i]() {
        // Each thread creates own listen socket
        int listen_fd = socket(AF_INET, SOCK_STREAM, 0);
        
        int optval = 1;
        setsockopt(listen_fd, SOL_SOCKET, SO_REUSEPORT, &optval, sizeof(optval));
        
        bind(listen_fd, ...);  // All bind to :8080
        listen(listen_fd, SOMAXCONN);
        
        // Each thread has own epoll
        int epfd = epoll_create1(0);
        
        struct epoll_event ev;
        ev.events = EPOLLIN;
        ev.data.fd = listen_fd;
        epoll_ctl(epfd, EPOLL_CTL_ADD, listen_fd, &ev);
        
        // Event loop (no contention!)
        while (true) {
            struct epoll_event events[128];
            int n = epoll_wait(epfd, events, 128, -1);
            
            for (int j = 0; j < n; j++) {
                handle_event(events[j]);
            }
        }
    }).detach();
}
```

**Benefits:**

- No shared epoll (no lock contention)
- Perfect CPU scaling (each core handles own connections)

---

**Comparison:**

| Feature | SO_REUSEADDR | SO_REUSEPORT |
|---------|--------------|--------------|
| Purpose | Reuse address in TIME_WAIT | Multiple processes share port |
| Use case | Server restarts | Multi-process server |
| Linux version | All | 3.9+ |
| Always needed? | ✅ Yes (servers) | ❌ Optional (optimization) |

---

**Recommendation:**

**Set both:**

```cpp
int listen_fd = socket(AF_INET, SOCK_STREAM, 0);

int optval = 1;
setsockopt(listen_fd, SOL_SOCKET, SO_REUSEADDR, &optval, sizeof(optval));

#ifdef SO_REUSEPORT
setsockopt(listen_fd, SOL_SOCKET, SO_REUSEPORT, &optval, sizeof(optval));
#endif

bind(listen_fd, ...);
listen(listen_fd, SOMAXCONN);
```

**Why:**

- SO_REUSEADDR: Allows quick restarts (always useful)
- SO_REUSEPORT: Enables multi-process (future optimization)

---

**Gotcha: SO_REUSEPORT security (port hijacking):**

**Problem:**

```bash
# Legitimate server (user alice)
./server  # Binds to :8080 with SO_REUSEPORT

# Malicious process (user bob)
./malware  # Binds to :8080 with SO_REUSEPORT
# Kernel load-balances → 50% of traffic goes to malware!
```

**Fix (Linux 4.5+):** Kernel only allows same UID

```cpp
// alice's process: UID 1000
bind(listen_fd, ...);  // OK

// bob's process: UID 1001
bind(listen_fd, ...);  // ❌ EACCES (permission denied)
```

**Production:** Always run server as dedicated user (not root!)

---

#### Q16: How do you implement fair scheduling between connections to prevent starvation?

**Answer:**

**Problem:**

```
1 client sends 1 GB file (100,000 packets)
99 clients send 1 KB requests each

Without fair scheduling:
- epoll_wait() returns for 1 GB client 100,000 times
- Other 99 clients starve (high latency)
```

**Goal:** Ensure all clients get fair CPU time

---

**Solution 1: Round-robin with quota (Recommended):**

```cpp
struct Connection {
    int fd;
    std::deque<std::string> write_queue;
    int bytes_sent_this_round = 0;
};

const int MAX_BYTES_PER_ROUND = 64 * 1024;  // 64 KB quota

std::unordered_map<int, Connection> connections;
std::deque<int> ready_queue;  // Connections with data to send

void handle_write_ready(int fd) {
    Connection& conn = connections[fd];
    
    // Process up to quota
    while (conn.bytes_sent_this_round < MAX_BYTES_PER_ROUND &&
           !conn.write_queue.empty()) {
        
        const std::string& data = conn.write_queue.front();
        ssize_t sent = send(fd, data.c_str(), data.size(), MSG_NOSIGNAL);
        
        if (sent < 0) {
            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                break;  // Socket buffer full
            }
            // Handle error
            return;
        }
        
        conn.bytes_sent_this_round += sent;
        
        if (sent == data.size()) {
            conn.write_queue.pop_front();
        } else {
            // Partial send, update queue
            conn.write_queue.front() = data.substr(sent);
            break;
        }
    }
    
    // Check if quota exceeded
    if (conn.bytes_sent_this_round >= MAX_BYTES_PER_ROUND) {
        // Move to end of ready queue (round-robin)
        ready_queue.push_back(fd);
        
        // Disable EPOLLOUT (we'll re-enable when we process queue)
        struct epoll_event ev;
        ev.events = EPOLLIN;
        ev.data.fd = fd;
        epoll_ctl(epfd, EPOLL_CTL_MOD, fd, &ev);
    } else if (!conn.write_queue.empty()) {
        // Still has data and under quota, keep in ready queue
        ready_queue.push_back(fd);
    }
}

void process_ready_queue() {
    while (!ready_queue.empty()) {
        int fd = ready_queue.front();
        ready_queue.pop_front();
        
        Connection& conn = connections[fd];
        conn.bytes_sent_this_round = 0;  // Reset quota
        
        // Re-enable EPOLLOUT
        struct epoll_event ev;
        ev.events = EPOLLIN | EPOLLOUT;
        ev.data.fd = fd;
        epoll_ctl(epfd, EPOLL_CTL_MOD, fd, &ev);
    }
}

// Event loop
void run() {
    while (true) {
        // Process ready queue (connections that exceeded quota)
        process_ready_queue();
        
        struct epoll_event events[128];
        int n = epoll_wait(epfd, events, 128, 1000);
        
        for (int i = 0; i < n; i++) {
            if (events[i].events & EPOLLOUT) {
                handle_write_ready(events[i].data.fd);
            }
        }
    }
}
```

**How it works:**

1. Each connection gets 64 KB quota per round
2. Quota exceeded → Disable EPOLLOUT, add to ready_queue
3. Next event loop iteration → Re-enable EPOLLOUT, reset quota
4. **Result:** All connections get fair CPU time

**Example:**

```
Round 1:
- Client A: sends 64 KB (quota reached) → disabled
- Client B: sends 1 KB (under quota) → continues
- Client C: sends 1 KB (under quota) → continues

Round 2:
- Client A: sends 64 KB (quota reached) → disabled
- Client B: sends 1 KB (under quota) → continues
- Client C: sends 1 KB (under quota) → continues

Result:
- Client A: 64 KB/round
- Client B: 1 KB/round (no starvation!)
- Client C: 1 KB/round
```

---

**Solution 2: Weighted fair queuing:**

```cpp
struct Connection {
    int fd;
    int weight = 1;  // Priority (1-10)
    int virtual_time = 0;
};

// Priority queue (lowest virtual_time first)
auto cmp = [](int a, int b) {
    return connections[a].virtual_time > connections[b].virtual_time;
};
std::priority_queue<int, std::vector<int>, decltype(cmp)> ready_queue(cmp);

void handle_write_ready(int fd) {
    Connection& conn = connections[fd];
    
    // Send data
    ssize_t sent = send(fd, data, size, MSG_NOSIGNAL);
    
    // Update virtual time (bytes sent / weight)
    conn.virtual_time += sent / conn.weight;
    
    // Re-add to queue
    if (has_more_data(fd)) {
        ready_queue.push(fd);
    }
}
```

**How it works:**

- High weight (10) → Sends more data per round (10x bandwidth)
- Low weight (1) → Sends less data per round
- Virtual time ensures fairness (low virtual_time = higher priority)

**Use case:** Prioritize interactive traffic (HTTP) over bulk transfers (file uploads)

---

**Solution 3: Token bucket per connection:**

```cpp
struct Connection {
    int fd;
    int tokens = 1000;  // Initial tokens
    int token_rate = 100;  // Tokens per second
    std::chrono::steady_clock::time_point last_refill;
};

void handle_write_ready(int fd) {
    Connection& conn = connections[fd];
    
    // Refill tokens
    auto now = std::chrono::steady_clock::now();
    auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(now - conn.last_refill).count();
    int new_tokens = (elapsed * conn.token_rate) / 1000;
    conn.tokens = std::min(1000, conn.tokens + new_tokens);
    conn.last_refill = now;
    
    // Consume tokens (1 token = 1 byte)
    if (conn.tokens <= 0) {
        // No tokens, delay write
        return;
    }
    
    int max_send = std::min(conn.tokens, (int)data.size());
    ssize_t sent = send(fd, data.c_str(), max_send, MSG_NOSIGNAL);
    
    conn.tokens -= sent;
}
```

**Use case:** Rate limiting per connection (prevent single client from hogging bandwidth)

---

**Production recommendation:**

**Use round-robin with quota** (Solution 1):
- Simple
- Predictable
- Works well for most cases

**Quota tuning:**

- **Too small (e.g., 4 KB):** Frequent context switches (overhead)
- **Too large (e.g., 1 MB):** Starvation possible
- **Sweet spot: 64 KB** (balance fairness and efficiency)

**When to use weighted fair queuing:**

- Need to prioritize certain connections (e.g., HTTP > FTP)
- Different service classes (premium users > free users)

**When to use token bucket:**

- Need strict rate limiting per connection
- Prevent abuse (single client sending too fast)

---

#### Q17: Explain TCP_NODELAY and TCP_CORK. When should you use each?

**Answer:**

**Nagle's Algorithm (Default TCP Behavior):**

```
Goal: Reduce small packet overhead

Rule: If unsent data < MSS (1460 bytes), wait for:
1. ACK for previous data, OR
2. Enough data to fill MSS
```

**Example:**

```cpp
send(fd, "GET ", 4, 0);  // Sent immediately (first packet)
send(fd, "/index.html", 11, 0);  // Buffered (waiting for ACK or more data)
send(fd, " HTTP/1.1\r\n", 11, 0);  // Buffered
// ... 40ms delay waiting for ACK ...
// Finally sent when ACK arrives
```

**Result:** 40ms latency (waiting for ACK)

---

**TCP_NODELAY: Disable Nagle's Algorithm**

```cpp
int optval = 1;
setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &optval, sizeof(optval));

send(fd, "GET ", 4, 0);  // Sent immediately ✅
send(fd, "/index.html", 11, 0);  // Sent immediately ✅
send(fd, " HTTP/1.1\r\n", 11, 0);  // Sent immediately ✅
```

**Result:** 0ms latency (all data sent immediately)

**Pros:**
- Low latency (no buffering delay)
- Interactive protocols (SSH, Telnet, gaming)

**Cons:**
- More packets (higher overhead)
- 4-byte payload + 40-byte TCP/IP header = 11x overhead!

**When to use:**

- ✅ Interactive protocols (SSH, Telnet, RDP)
- ✅ Real-time applications (gaming, VoIP)
- ✅ Request-response protocols where latency matters (REST APIs)
- ❌ Bulk transfers (file downloads) - wastes bandwidth

---

**TCP_CORK: Buffer until explicitly flushed**

```cpp
// Enable cork
int optval = 1;
setsockopt(fd, IPPROTO_TCP, TCP_CORK, &optval, sizeof(optval));

// Send data (buffered)
send(fd, "HTTP/1.1 200 OK\r\n", 17, 0);  // Buffered
send(fd, "Content-Length: 1024\r\n", 22, 0);  // Buffered
send(fd, "\r\n", 2, 0);  // Buffered
send(fd, body, 1024, 0);  // Buffered

// Disable cork (flush all buffered data in 1 packet)
optval = 0;
setsockopt(fd, IPPROTO_TCP, TCP_CORK, &optval, sizeof(optval));
// All data sent in 1-2 packets (depending on MSS)
```

**Pros:**
- Fewer packets (lower overhead)
- Efficient for multiple small writes

**Cons:**
- Higher latency (data buffered until cork disabled)
- Linux-specific (not portable)

**When to use:**

- ✅ HTTP response (headers + body)
- ✅ Constructing message from multiple parts
- ❌ Interactive protocols (adds latency)

---

**Comparison:**

| Scenario | Default (Nagle) | TCP_NODELAY | TCP_CORK |
|----------|-----------------|-------------|----------|
| send("GET", 4) | Delayed 40ms (waiting for ACK) | Sent immediately | Buffered until cork disabled |
| HTTP response (headers + body) | Multiple packets | Multiple packets | 1-2 packets ✅ |
| SSH keypress | Delayed (Nagle) | Sent immediately ✅ | Buffered (bad) |
| File download | Efficient (fills MSS) | Less efficient | Efficient ✅ |

---

**TCP_NODELAY + TCP_CORK (Best of both worlds):**

```cpp
// Enable both
int optval = 1;
setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &optval, sizeof(optval));

optval = 1;
setsockopt(fd, IPPROTO_TCP, TCP_CORK, &optval, sizeof(optval));

// Send HTTP response
send(fd, "HTTP/1.1 200 OK\r\n", 17, 0);  // Corked
send(fd, "Content-Length: 1024\r\n", 22, 0);  // Corked
send(fd, "\r\n", 2, 0);  // Corked
send(fd, body, 1024, 0);  // Corked

// Flush
optval = 0;
setsockopt(fd, IPPROTO_TCP, TCP_CORK, &optval, sizeof(optval));
// All data sent immediately (no Nagle delay)

// Next request (cork disabled, NODELAY active)
send(fd, "GET /api", 8, 0);  // Sent immediately (NODELAY)
```

**How it works:**

- TCP_CORK takes precedence (buffers data)
- When cork disabled, TCP_NODELAY sends immediately (no Nagle delay)

---

**Production examples:**

**HTTP server:**

```cpp
void send_response(int fd, const std::string& headers, const std::string& body) {
    // Enable cork (batch sends)
    int optval = 1;
    setsockopt(fd, IPPROTO_TCP, TCP_CORK, &optval, sizeof(optval));
    
    send(fd, headers.c_str(), headers.size(), MSG_NOSIGNAL);
    send(fd, body.c_str(), body.size(), MSG_NOSIGNAL);
    
    // Disable cork (flush)
    optval = 0;
    setsockopt(fd, IPPROTO_TCP, TCP_CORK, &optval, sizeof(optval));
}
```

**Result:** Headers + body sent in 1-2 packets (efficient)

---

**SSH server:**

```cpp
int client_fd = accept(listen_fd, nullptr, nullptr);

// Disable Nagle (low latency for keypresses)
int optval = 1;
setsockopt(client_fd, IPPROTO_TCP, TCP_NODELAY, &optval, sizeof(optval));

// Each keypress sent immediately (no buffering)
```

---

**File transfer:**

```cpp
// Default (Nagle enabled) is fine
// Nagle waits until MSS (1460 bytes) before sending
// Result: Efficient (no small packets)

// DON'T use TCP_NODELAY (would create many small packets)
// DON'T use TCP_CORK (adds unnecessary complexity)
```

---

**Decision matrix:**

| Application | Setting | Reason |
|-------------|---------|--------|
| HTTP server | TCP_NODELAY + TCP_CORK | Low latency + batch response |
| SSH/Telnet | TCP_NODELAY | Low latency (keypresses) |
| File transfer | Default (Nagle) | Efficient (fills MSS) |
| REST API client | TCP_NODELAY | Low latency (request-response) |
| Streaming video | Default or TCP_NODELAY | Depends on bitrate |

---

**Performance impact:**

**Without TCP_NODELAY (Nagle active):**
- Latency: +40ms (RTT delay waiting for ACK)
- Bandwidth: Efficient (few packets)

**With TCP_NODELAY:**
- Latency: 0ms (immediate send)
- Bandwidth: Less efficient (more packets)

**With TCP_CORK:**
- Latency: Variable (depends on when cork disabled)
- Bandwidth: Most efficient (fewest packets)

---

**Recommendation:**

**Default for new projects:** TCP_NODELAY

- Most applications value latency over bandwidth
- Modern networks have high bandwidth (overhead doesn't matter)
- Exceptions: File transfer, bulk data (use default Nagle)

**Advanced:** TCP_NODELAY + TCP_CORK for HTTP servers (nginx does this)

---

#### Q18: How do you monitor and debug network performance issues in production?

**Answer:**

**Key metrics to monitor:**

1. **Throughput:** Bytes/sec, requests/sec
2. **Latency:** p50, p95, p99 response time
3. **Errors:** Connection failures, timeouts
4. **Resource usage:** CPU, memory, file descriptors
5. **Network:** Packet loss, retransmissions

---

**1. Application-level metrics:**

```cpp
struct ConnectionMetrics {
    std::atomic<uint64_t> bytes_sent{0};
    std::atomic<uint64_t> bytes_received{0};
    std::atomic<uint64_t> requests_handled{0};
    std::atomic<uint64_t> errors{0};
    
    std::deque<std::chrono::milliseconds> latencies;
    std::mutex latency_mutex;
};

ConnectionMetrics metrics;

void handle_request(int fd) {
    auto start = std::chrono::steady_clock::now();
    
    // Process request
    ssize_t received = recv(fd, buffer, sizeof(buffer), 0);
    metrics.bytes_received += received;
    
    // Send response
    ssize_t sent = send(fd, response, size, MSG_NOSIGNAL);
    metrics.bytes_sent += sent;
    
    metrics.requests_handled++;
    
    auto end = std::chrono::steady_clock::now();
    auto latency = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);
    
    {
        std::lock_guard<std::mutex> lock(metrics.latency_mutex);
        metrics.latencies.push_back(latency);
        
        if (metrics.latencies.size() > 1000) {
            metrics.latencies.pop_front();
        }
    }
}

void print_metrics() {
    std::cout << "Requests: " << metrics.requests_handled << "\n";
    std::cout << "Bytes sent: " << metrics.bytes_sent << "\n";
    std::cout << "Bytes received: " << metrics.bytes_received << "\n";
    std::cout << "Errors: " << metrics.errors << "\n";
    
    // Calculate percentiles
    std::vector<std::chrono::milliseconds> sorted;
    {
        std::lock_guard<std::mutex> lock(metrics.latency_mutex);
        sorted = std::vector<std::chrono::milliseconds>(metrics.latencies.begin(), metrics.latencies.end());
    }
    
    std::sort(sorted.begin(), sorted.end());
    
    if (!sorted.empty()) {
        auto p50 = sorted[sorted.size() * 0.50];
        auto p95 = sorted[sorted.size() * 0.95];
        auto p99 = sorted[sorted.size() * 0.99];
        
        std::cout << "Latency p50: " << p50.count() << "ms\n";
        std::cout << "Latency p95: " << p95.count() << "ms\n";
        std::cout << "Latency p99: " << p99.count() << "ms\n";
    }
}
```

---

**2. Socket-level metrics (TCP_INFO):**

```cpp
#include <linux/tcp.h>

void print_tcp_info(int fd) {
    struct tcp_info info;
    socklen_t len = sizeof(info);
    
    if (getsockopt(fd, IPPROTO_TCP, TCP_INFO, &info, &len) == 0) {
        std::cout << "RTT: " << info.tcpi_rtt / 1000.0 << "ms\n";
        std::cout << "RTT variance: " << info.tcpi_rttvar / 1000.0 << "ms\n";
        std::cout << "Retransmits: " << info.tcpi_retransmits << "\n";
        std::cout << "Send queue: " << info.tcpi_notsent_bytes << " bytes\n";
        std::cout << "Receive window: " << info.tcpi_rcv_space << " bytes\n";
        std::cout << "Congestion window: " << info.tcpi_snd_cwnd << "\n";
    }
}
```

**Key metrics:**

- **RTT (tcpi_rtt):** Round-trip time (network latency)
- **Retransmits:** Packet loss (network issues)
- **Congestion window:** TCP throughput capacity
- **Send queue (tcpi_notsent_bytes):** Application sending too fast

---

**3. System-level monitoring:**

```bash
# Monitor network interface
$ ifconfig eth0
RX bytes:1000000000 (1 GB)  TX bytes:500000000 (500 MB)
RX packets:100000  TX packets:50000
errors:0  dropped:0  overruns:0  frame:0

# Monitor socket statistics
$ ss -s
Total: 1000
TCP: 950 (established 900, closed 40, orphaned 5, timewait 35)

# Monitor per-connection details
$ ss -tin
State    Recv-Q Send-Q Local:Port  Peer:Port
ESTAB    0      0      10.0.0.1:8080 10.0.0.2:54321
         cubic rto:200 rtt:50/25 cwnd:10 send 2.3Mbps

# Monitor retransmissions
$ netstat -s | grep retrans
    1000 segments retransmitted
```

---

**4. Packet capture (tcpdump/Wireshark):**

```bash
# Capture traffic on port 8080
$ sudo tcpdump -i eth0 port 8080 -w capture.pcap

# Analyze with Wireshark
$ wireshark capture.pcap
```

**Look for:**

- **High retransmissions:** Network packet loss
- **Window zero:** Receiver can't keep up (application slow)
- **Long handshake:** Connection establishment slow (network latency or server backlog)

---

**5. Profiling with perf:**

```bash
# Profile server process
$ sudo perf record -p $(pidof server) -g -- sleep 10

# Analyze
$ sudo perf report

# Look for:
# - Time spent in send()/recv() (I/O bound)
# - Time spent in epoll_wait() (idle)
# - Time spent in application code (CPU bound)
```

---

**Common issues and diagnosis:**

**Issue 1: High latency**

```
Symptom: p99 latency > 1 second
```

**Diagnosis:**

1. Check TCP_INFO: High RTT? → Network issue
2. Check send queue (tcpi_notsent_bytes): Large? → Application sending too fast or receiver slow
3. Check profiling: Time in application code? → CPU bound

**Fixes:**

- High RTT: Optimize network (CDN, reduce hops)
- Large send queue: Implement backpressure
- CPU bound: Optimize application code

---

**Issue 2: Low throughput**

```
Symptom: Only 10 MB/s on 1 Gb/s link
```

**Diagnosis:**

1. Check congestion window (tcpi_snd_cwnd): Small (<10)? → Packet loss or high RTT
2. Check retransmissions: High? → Network packet loss
3. Check send/recv buffer size: Small? → Limited by SO_SNDBUF/SO_RCVBUF

**Fixes:**

- Small cwnd: Investigate packet loss (netstat -s)
- High retransmissions: Network hardware issue
- Small buffers: Increase SO_SNDBUF/SO_RCVBUF

```cpp
int buffer_size = 256 * 1024;  // 256 KB
setsockopt(fd, SOL_SOCKET, SO_SNDBUF, &buffer_size, sizeof(buffer_size));
setsockopt(fd, SOL_SOCKET, SO_RCVBUF, &buffer_size, sizeof(buffer_size));
```

---

**Issue 3: Connection timeouts**

```
Symptom: accept() succeeds but recv() times out
```

**Diagnosis:**

1. Check listen backlog: Full? → Server not accepting fast enough
2. Check SYN retransmissions: High? → Network drops SYN packets
3. Check server CPU: 100%? → Server overloaded

```bash
$ ss -ltn
State  Recv-Q Send-Q Local:Port
LISTEN 128    128    *:8080
        ↑ backlog (send-Q)

$ netstat -s | grep "SYNs to LISTEN"
    1000 SYNs to LISTEN sockets dropped
```

**Fixes:**

- Full backlog: Increase listen(fd, SOMAXCONN) or accept faster
- Dropped SYNs: Increase net.core.somaxconn or net.ipv4.tcp_max_syn_backlog
- Server overloaded: Scale horizontally (more servers)

---

**Monitoring dashboard (Prometheus + Grafana):**

```cpp
// Expose metrics HTTP endpoint
void handle_metrics(int fd) {
    std::ostringstream oss;
    
    oss << "# HELP requests_total Total requests handled\n";
    oss << "# TYPE requests_total counter\n";
    oss << "requests_total " << metrics.requests_handled << "\n";
    
    oss << "# HELP bytes_sent_total Total bytes sent\n";
    oss << "# TYPE bytes_sent_total counter\n";
    oss << "bytes_sent_total " << metrics.bytes_sent << "\n";
    
    oss << "# HELP latency_seconds Request latency\n";
    oss << "# TYPE latency_seconds histogram\n";
    oss << "latency_seconds{quantile=\"0.5\"} " << p50.count() / 1000.0 << "\n";
    oss << "latency_seconds{quantile=\"0.95\"} " << p95.count() / 1000.0 << "\n";
    oss << "latency_seconds{quantile=\"0.99\"} " << p99.count() / 1000.0 << "\n";
    
    std::string response = "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\n" + oss.str();
    send(fd, response.c_str(), response.size(), MSG_NOSIGNAL);
}
```

---

**Production checklist:**

- ✅ Metrics: Throughput, latency percentiles, error rate
- ✅ TCP_INFO: RTT, retransmissions, congestion window
- ✅ System stats: ss, netstat, ifconfig
- ✅ Profiling: perf, flamegraphs
- ✅ Packet capture: tcpdump (when all else fails)
- ✅ Dashboard: Prometheus + Grafana (centralized monitoring)

---

#### Q19: What are the security implications of network programming? How do you mitigate common attacks?

**Answer:**

**Common attacks:**

1. **SYN flood (DoS)**
2. **Slowloris (Slow HTTP)**
3. **Buffer overflow**
4. **Injection attacks**
5. **Man-in-the-middle (MITM)**

---

**1. SYN Flood Attack:**

**Attack:**

```
Attacker sends many SYN packets with spoofed source IP
Server responds with SYN-ACK (waits for ACK)
Attacker never sends ACK
→ Server's listen backlog fills → accept() fails → DoS
```

**Mitigation:**

**a) SYN Cookies (Kernel-level):**

```bash
# Enable SYN cookies
$ sudo sysctl -w net.ipv4.tcp_syncookies=1
```

**How it works:**

- Don't allocate connection state for SYN
- Encode state in ISN (Initial Sequence Number)
- Allocate connection only when ACK arrives
- **Result:** No backlog exhaustion

---

**b) Increase SYN backlog:**

```bash
$ sudo sysctl -w net.ipv4.tcp_max_syn_backlog=8192
$ sudo sysctl -w net.core.somaxconn=1024
```

```cpp
listen(listen_fd, SOMAXCONN);  // Use kernel's max
```

---

**c) Rate limiting:**

```cpp
std::unordered_map<std::string, int> connection_count;

void handle_accept() {
    struct sockaddr_in addr;
    socklen_t addr_len = sizeof(addr);
    
    int client_fd = accept(listen_fd, (struct sockaddr*)&addr, &addr_len);
    
    char ip[INET_ADDRSTRLEN];
    inet_ntop(AF_INET, &addr.sin_addr, ip, sizeof(ip));
    
    // Rate limit: Max 10 connections per IP
    if (++connection_count[ip] > 10) {
        std::cerr << "Rate limit exceeded for " << ip << "\n";
        close(client_fd);
        return;
    }
    
    // Accept connection
    handle_client(client_fd);
}
```

---

**2. Slowloris Attack (Slow HTTP):**

**Attack:**

```
Attacker opens many connections
Sends partial HTTP request very slowly (1 byte every 10 seconds)
Server waits for complete request → all threads/FDs blocked → DoS
```

**Example:**

```
GET / HTTP/1.1\r\n
Host: example.com\r\n
X-a: 1\r\n
... 10 seconds ...
X-b: 2\r\n
... 10 seconds ...
```

**Mitigation:**

**a) Request timeout:**

```cpp
struct Connection {
    int fd;
    std::chrono::steady_clock::time_point last_activity;
    std::string buffer;
};

void check_timeouts() {
    auto now = std::chrono::steady_clock::now();
    
    for (auto it = connections.begin(); it != connections.end(); ) {
        auto elapsed = now - it->second.last_activity;
        
        // Close connection if idle for >30s
        if (elapsed > std::chrono::seconds(30)) {
            std::cerr << "Request timeout, closing connection\n";
            close(it->first);
            it = connections.erase(it);
        } else {
            ++it;
        }
    }
}
```

---

**b) Maximum request size:**

```cpp
const size_t MAX_REQUEST_SIZE = 64 * 1024;  // 64 KB

void handle_read(int fd) {
    Connection& conn = connections[fd];
    
    char buffer[8192];
    ssize_t n = recv(fd, buffer, sizeof(buffer), 0);
    
    conn.buffer.append(buffer, n);
    conn.last_activity = std::chrono::steady_clock::now();
    
    // Check request size
    if (conn.buffer.size() > MAX_REQUEST_SIZE) {
        std::cerr << "Request too large, closing connection\n";
        const char* response = "HTTP/1.1 413 Payload Too Large\r\n\r\n";
        send(fd, response, strlen(response), MSG_NOSIGNAL);
        close(fd);
        connections.erase(fd);
        return;
    }
    
    // Check if request complete
    if (conn.buffer.find("\r\n\r\n") != std::string::npos) {
        handle_request(fd, conn.buffer);
        conn.buffer.clear();
    }
}
```

---

**c) Connection limits:**

```cpp
const int MAX_CONNECTIONS = 1000;

if (connections.size() >= MAX_CONNECTIONS) {
    std::cerr << "Max connections reached, rejecting new connection\n";
    const char* response = "HTTP/1.1 503 Service Unavailable\r\n\r\n";
    send(client_fd, response, strlen(response), MSG_NOSIGNAL);
    close(client_fd);
    return;
}
```

---

**3. Buffer Overflow:**

**Vulnerable code:**

```cpp
char buffer[1024];
recv(fd, buffer, sizeof(buffer), 0);  // ❌ No null termination
printf("%s", buffer);  // Crash if buffer contains no '\0'

// Worse:
char name[64];
scanf("%s", name);  // ❌ No bounds checking, buffer overflow!
```

**Fix:**

```cpp
// Always check recv() return value
char buffer[1024];
ssize_t n = recv(fd, buffer, sizeof(buffer) - 1, 0);  // Leave space for '\0'

if (n > 0) {
    buffer[n] = '\0';  // Null terminate
    std::cout << buffer << "\n";
}

// Better: use std::string
std::string data;
char temp[8192];
ssize_t n = recv(fd, temp, sizeof(temp), 0);

if (n > 0) {
    data.append(temp, n);  // Automatically handles size
}
```

---

**4. Injection Attacks (SQL, Command):**

**Vulnerable code:**

```cpp
// SQL injection
std::string query = "SELECT * FROM users WHERE name = '" + user_input + "'";
// user_input = "'; DROP TABLE users; --"
// Result: DROP TABLE users!

// Command injection
std::string cmd = "ping " + user_input;
system(cmd.c_str());
// user_input = "8.8.8.8; rm -rf /"
// Result: Deletes all files!
```

**Fix:**

```cpp
// Use prepared statements (SQL)
sqlite3_stmt* stmt;
sqlite3_prepare_v2(db, "SELECT * FROM users WHERE name = ?", -1, &stmt, nullptr);
sqlite3_bind_text(stmt, 1, user_input.c_str(), -1, SQLITE_STATIC);

// Validate input (Command)
bool is_valid_ip(const std::string& ip) {
    struct sockaddr_in sa;
    return inet_pton(AF_INET, ip.c_str(), &sa.sin_addr) == 1;
}

if (is_valid_ip(user_input)) {
    std::string cmd = "ping " + user_input;
    system(cmd.c_str());  // Safe
} else {
    std::cerr << "Invalid IP\n";
}
```

---

**5. Man-in-the-Middle (MITM):**

**Attack:**

```
Client → Attacker → Server
Attacker intercepts/modifies traffic
```

**Mitigation: Use TLS/SSL:**

```cpp
#include <openssl/ssl.h>

SSL_CTX* ctx = SSL_CTX_new(TLS_server_method());

// Load certificate and private key
SSL_CTX_use_certificate_file(ctx, "cert.pem", SSL_FILETYPE_PEM);
SSL_CTX_use_PrivateKey_file(ctx, "key.pem", SSL_FILETYPE_PEM);

// Accept client
int client_fd = accept(listen_fd, nullptr, nullptr);

SSL* ssl = SSL_new(ctx);
SSL_set_fd(ssl, client_fd);

if (SSL_accept(ssl) <= 0) {
    ERR_print_errors_fp(stderr);
} else {
    // Encrypted communication
    char buffer[1024];
    SSL_read(ssl, buffer, sizeof(buffer));
    SSL_write(ssl, "Hello", 5);
}

SSL_shutdown(ssl);
SSL_free(ssl);
close(client_fd);
```

---

**Security checklist:**

- ✅ **SYN flood:** Enable SYN cookies, increase backlog, rate limit
- ✅ **Slowloris:** Request timeout, max request size, connection limit
- ✅ **Buffer overflow:** Bounds checking, use std::string, validate input
- ✅ **Injection:** Prepared statements, input validation
- ✅ **MITM:** TLS/SSL encryption
- ✅ **DoS:** Rate limiting, connection limits, timeouts
- ✅ **Logging:** Log suspicious activity (many connections from same IP)

---

#### Q20: How do you optimize network code for modern multi-core CPUs?

**Answer:**

**Key principles:**

1. **Minimize lock contention**
2. **Maximize cache locality**
3. **Distribute work across cores**
4. **Avoid false sharing**

---

**1. SO_REUSEPORT (Kernel load balancing):**

```cpp
for (int i = 0; i < NUM_CORES; i++) {
    std::thread([i]() {
        // Each thread creates own listen socket
        int listen_fd = socket(AF_INET, SOCK_STREAM, 0);
        
        int optval = 1;
        setsockopt(listen_fd, SOL_SOCKET, SO_REUSEPORT, &optval, sizeof(optval));
        
        bind(listen_fd, ...);  // All bind to same port
        listen(listen_fd, SOMAXCONN);
        
        // Each thread has own epoll (no shared state!)
        int epfd = epoll_create1(0);
        
        struct epoll_event ev;
        ev.events = EPOLLIN;
        ev.data.fd = listen_fd;
        epoll_ctl(epfd, EPOLL_CTL_ADD, listen_fd, &ev);
        
        // Pin thread to CPU core
        cpu_set_t cpuset;
        CPU_ZERO(&cpuset);
        CPU_SET(i, &cpuset);
        pthread_setaffinity_np(pthread_self(), sizeof(cpuset), &cpuset);
        
        // Event loop (fully independent!)
        while (true) {
            struct epoll_event events[128];
            int n = epoll_wait(epfd, events, 128, -1);
            
            for (int j = 0; j < n; j++) {
                handle_event(events[j]);
            }
        }
    }).detach();
}
```

**Benefits:**

- ✅ No shared epoll (no lock contention)
- ✅ Each core handles own connections (cache locality)
- ✅ Kernel load-balances (same client → same core → better caching)

**Scalability:** Linear (8 cores = 8x throughput)

---

**2. Lock-free data structures:**

```cpp
// ❌ BAD: Shared queue with mutex
std::queue<int> work_queue;
std::mutex queue_mutex;

void producer() {
    std::lock_guard<std::mutex> lock(queue_mutex);  // Contention!
    work_queue.push(task);
}

void consumer() {
    std::lock_guard<std::mutex> lock(queue_mutex);  // Contention!
    int task = work_queue.front();
    work_queue.pop();
}
```

**Scalability:** Poor (mutex serializes access)

---

```cpp
// ✅ GOOD: Lock-free queue
#include <boost/lockfree/queue.hpp>

boost::lockfree::queue<int> work_queue(1000);

void producer() {
    work_queue.push(task);  // Lock-free!
}

void consumer() {
    int task;
    if (work_queue.pop(task)) {
        process(task);
    }
}
```

**Scalability:** Excellent (no contention)

---

**3. Thread-local storage (TLS):**

```cpp
// ❌ BAD: Shared statistics
std::atomic<uint64_t> request_count{0};

void handle_request() {
    request_count++;  // Atomic contention (cache line bouncing)
}
```

---

```cpp
// ✅ GOOD: Per-thread statistics
thread_local uint64_t request_count = 0;

void handle_request() {
    request_count++;  // No atomic operation!
}

uint64_t get_total_requests() {
    // Aggregate from all threads (done rarely)
    uint64_t total = 0;
    for (int i = 0; i < NUM_THREADS; i++) {
        total += thread_request_counts[i];
    }
    return total;
}
```

---

**4. Avoid false sharing:**

**Problem:**

```cpp
struct Statistics {
    uint64_t thread1_count;  // Cache line 1
    uint64_t thread2_count;  // Cache line 1 (same!)
};

// Thread 1 writes thread1_count → Invalidates cache line 1
// Thread 2 writes thread2_count → Invalidates cache line 1
// → Cache line bounces between cores (slow!)
```

**Fix: Padding**

```cpp
struct Statistics {
    alignas(64) uint64_t thread1_count;  // Cache line 1
    alignas(64) uint64_t thread2_count;  // Cache line 2 (separate!)
};

// Now independent (no cache line bouncing)
```

---

**5. Batch processing:**

```cpp
// ❌ BAD: Process 1 request at a time
void event_loop() {
    struct epoll_event events[1];  // Only 1 event
    
    while (true) {
        int n = epoll_wait(epfd, events, 1, -1);
        handle_event(events[0]);
    }
}
```

**Problem:** High syscall overhead (epoll_wait called for each event)

---

```cpp
// ✅ GOOD: Batch process
void event_loop() {
    struct epoll_event events[128];  // Batch of 128
    
    while (true) {
        int n = epoll_wait(epfd, events, 128, -1);
        
        for (int i = 0; i < n; i++) {
            handle_event(events[i]);
        }
    }
}
```

**Result:** Fewer syscalls (amortized overhead)

---

**6. NUMA awareness:**

```cpp
#include <numa.h>

// Allocate memory on same NUMA node as CPU
void* allocate_numa_local(size_t size) {
    int cpu = sched_getcpu();
    int node = numa_node_of_cpu(cpu);
    
    return numa_alloc_onnode(size, node);
}

// Use in network buffers
char* buffer = (char*)allocate_numa_local(8192);
recv(fd, buffer, 8192, 0);
```

**Benefit:** Lower memory latency (avoid cross-NUMA traffic)

---

**Performance comparison:**

| Approach | Throughput (req/sec) | Scalability |
|----------|----------------------|-------------|
| Single-threaded | 10,000 | 1x |
| Multi-threaded (shared epoll + mutex) | 20,000 | 2x (poor) |
| Multi-threaded (SO_REUSEPORT) | 80,000 | 8x (linear) |
| SO_REUSEPORT + TLS + lock-free queues | 100,000 | 10x (superlinear!) |

---

**Production recommendation:**

**Architecture: SO_REUSEPORT with per-core event loops**

```
CPU 0: listen_fd0 → epoll0 → handle events (no shared state)
CPU 1: listen_fd1 → epoll1 → handle events (no shared state)
CPU 2: listen_fd2 → epoll2 → handle events (no shared state)
...
```

**Benefits:**

- ✅ Perfect scalability (no contention)
- ✅ Cache locality (same client → same core)
- ✅ Simple (each core independent)

**Used by:** nginx, HAProxy, Envoy


---
