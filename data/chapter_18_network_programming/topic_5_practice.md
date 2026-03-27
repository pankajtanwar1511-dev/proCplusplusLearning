## TOPIC: epoll() - High-Performance I/O for Linux

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Q1
```cpp
#include <sys/epoll.h>
#include <sys/socket.h>
#include <unistd.h>

int main() {
    int epoll_fd = epoll_create1(0);
    int server_fd = create_listening_socket(8080);

    struct epoll_event ev;
    ev.events = EPOLLIN;
    ev.data.fd = server_fd;
    epoll_ctl(epoll_fd, EPOLL_CTL_ADD, server_fd, &ev);

    while (true) {
        struct epoll_event events[10];
        int n = epoll_wait(epoll_fd, events, 10, -1);

        for (int i = 0; i < n; i++) {
            if (events[i].data.fd == server_fd) {
                int client_fd = accept(server_fd, NULL, NULL);
                // Bug: forgot to add client_fd to epoll!
            } else {
                char buffer[1024];
                recv(events[i].data.fd, buffer, sizeof(buffer), 0);
            }
        }
    }
}
```

**Answer:**
```
Client FD never monitored - epoll_wait() never returns events for accepted clients
```

**Explanation:**
- `accept()` creates client FD but doesn't add it to epoll
- epoll_wait() only returns events for FDs registered with epoll_ctl()
- Client sockets never monitored - can't receive data
- Must call `epoll_ctl(EPOLL_CTL_ADD, client_fd, ...)` after accept()
- **Key Concept:** epoll requires explicit FD registration; accepted connections must be added to epoll with EPOLL_CTL_ADD before monitoring

**Fixed Version:**
```cpp
if (events[i].data.fd == server_fd) {
    int client_fd = accept(server_fd, NULL, NULL);

    struct epoll_event ev;
    ev.events = EPOLLIN;
    ev.data.fd = client_fd;
    epoll_ctl(epoll_fd, EPOLL_CTL_ADD, client_fd, &ev);  // Add to epoll!
}
```

---

#### Q2
```cpp
#include <sys/epoll.h>
#include <sys/socket.h>
#include <fcntl.h>

int main() {
    int epoll_fd = epoll_create1(0);

    // Add client with edge-triggered mode
    struct epoll_event ev;
    ev.events = EPOLLIN | EPOLLET;  // Edge-triggered!
    ev.data.fd = client_fd;
    epoll_ctl(epoll_fd, EPOLL_CTL_ADD, client_fd, &ev);

    fcntl(client_fd, F_SETFL, O_NONBLOCK);

    while (true) {
        struct epoll_event events[10];
        epoll_wait(epoll_fd, events, 10, -1);

        for (int i = 0; i < events_count; i++) {
            char buffer[1024];
            int n = recv(events[i].data.fd, buffer, sizeof(buffer), 0);  // Bug: only one recv!

            if (n > 0) {
                process(buffer, n);
            }
        }
    }
}
```

**Answer:**
```
Edge-triggered mode requires reading until EAGAIN - loses data from subsequent recv() calls
```

**Explanation:**
- Edge-triggered (EPOLLET) notifies only once per state change
- If 5KB arrives, epoll_wait() returns once, but buffer is 1KB
- After first recv(), 4KB remains but no more EPOLLIN events
- Data stuck in kernel buffer until next arrival triggers edge
- **Key Concept:** Edge-triggered epoll requires draining FD completely; must loop recv() until EAGAIN to avoid data loss

**Fixed Version:**
```cpp
for (int i = 0; i < events_count; i++) {
    while (true) {
        char buffer[1024];
        int n = recv(events[i].data.fd, buffer, sizeof(buffer), 0);

        if (n > 0) {
            process(buffer, n);
        } else if (n == 0) {
            // EOF
            close(events[i].data.fd);
            break;
        } else if (errno == EAGAIN) {
            // No more data - done!
            break;
        } else {
            perror("recv");
            break;
        }
    }
}
```

---

#### Q3
```cpp
#include <sys/epoll.h>
#include <sys/socket.h>
#include <thread>
#include <vector>

std::vector<std::thread> workers;

void worker_thread(int epoll_fd) {
    while (true) {
        struct epoll_event events[10];
        int n = epoll_wait(epoll_fd, events, 10, -1);

        for (int i = 0; i < n; i++) {
            char buffer[1024];
            int bytes = recv(events[i].data.fd, buffer, sizeof(buffer), 0);
            // Process data...
            // Bug: Multiple threads can get same event!
        }
    }
}

int main() {
    int epoll_fd = epoll_create1(0);

    struct epoll_event ev;
    ev.events = EPOLLIN;  // Bug: missing EPOLLONESHOT!
    ev.data.fd = client_fd;
    epoll_ctl(epoll_fd, EPOLL_CTL_ADD, client_fd, &ev);

    for (int i = 0; i < 4; i++) {
        workers.emplace_back(worker_thread, epoll_fd);
    }
}
```

**Answer:**
```
Race condition - multiple threads process same event simultaneously (data corruption or duplicate processing)
```

**Explanation:**
- Without EPOLLONESHOT, same FD can return from multiple epoll_wait() calls
- Thread 1 and Thread 2 both get EPOLLIN for same FD
- Both threads recv() from same socket - data split/corrupted
- EPOLLONESHOT disables FD after one event until re-armed
- **Key Concept:** Multi-threaded epoll requires EPOLLONESHOT to prevent race conditions; FD auto-disabled after event until explicitly re-armed

**Fixed Version:**
```cpp
struct epoll_event ev;
ev.events = EPOLLIN | EPOLLONESHOT;  // One event at a time!
ev.data.fd = client_fd;
epoll_ctl(epoll_fd, EPOLL_CTL_ADD, client_fd, &ev);

// In worker after processing
ev.events = EPOLLIN | EPOLLONESHOT;
ev.data.fd = events[i].data.fd;
epoll_ctl(epoll_fd, EPOLL_CTL_MOD, events[i].data.fd, &ev);  // Re-arm!
```

---

#### Q4
```cpp
#include <sys/epoll.h>
#include <sys/socket.h>
#include <sys/timerfd.h>
#include <map>
#include <time.h>

std::map<int, time_t> last_activity;

int main() {
    int epoll_fd = epoll_create1(0);

    // Create timer for checking timeouts
    int timer_fd = timerfd_create(CLOCK_MONOTONIC, 0);
    struct itimerspec ts;
    ts.it_interval.tv_sec = 10;  // Check every 10 seconds
    ts.it_value.tv_sec = 10;
    timerfd_settime(timer_fd, 0, &ts, NULL);

    struct epoll_event ev;
    ev.events = EPOLLIN;
    ev.data.fd = timer_fd;
    epoll_ctl(epoll_fd, EPOLL_CTL_ADD, timer_fd, &ev);

    while (true) {
        struct epoll_event events[10];
        int n = epoll_wait(epoll_fd, events, 10, -1);

        for (int i = 0; i < n; i++) {
            if (events[i].data.fd == timer_fd) {
                // Bug: forgot to read timer_fd!
                check_timeouts(last_activity);
            }
        }
    }
}
```

**Answer:**
```
Busy loop - timerfd not read, continuously triggers EPOLLIN
```

**Explanation:**
- timerfd_create() generates events by making timerfd readable
- Reading timerfd clears the event (consumes expiration count)
- Forgetting to read() leaves timerfd in readable state
- epoll_wait() returns immediately every iteration - busy loop
- **Key Concept:** Always read timerfd after EPOLLIN event; not reading causes immediate return from epoll_wait (busy loop)

**Fixed Version:**
```cpp
if (events[i].data.fd == timer_fd) {
    uint64_t expirations;
    read(timer_fd, &expirations, sizeof(expirations));  // Consume event!

    check_timeouts(last_activity);
}
```

---

#### Q5
```cpp
#include <sys/epoll.h>
#include <sys/socket.h>
#include <map>
#include <deque>
#include <time.h>

std::map<int, std::deque<time_t>> event_times;
const int MAX_EVENTS_PER_SEC = 100;

bool check_rate_limit(int fd) {
    time_t now = time(NULL);
    auto& times = event_times[fd];

    // Remove events older than 1 second
    while (!times.empty() && times.front() < now - 1) {
        times.pop_front();
    }

    if (times.size() >= MAX_EVENTS_PER_SEC) {
        return true;  // Rate limited!
    }

    times.push_back(now);
    return false;
}

int main() {
    // epoll loop
    for (int i = 0; i < events_count; i++) {
        if (check_rate_limit(events[i].data.fd)) {
            send(events[i].data.fd, "ERROR: Rate limit exceeded\n", 27, 0);
            close(events[i].data.fd);
            // Bug: forgot to remove from epoll!
        }
    }
}
```

**Answer:**
```
Closed FD still in epoll - next epoll_wait() returns EPOLLERR/EPOLLHUP for closed FD
```

**Explanation:**
- `close(fd)` closes FD but doesn't remove it from epoll
- Next epoll_wait() returns events for closed FD (EPOLLERR)
- Processing closed FD causes errors or crashes
- Must call `epoll_ctl(EPOLL_CTL_DEL, fd, ...)` before close()
- **Key Concept:** Always EPOLL_CTL_DEL before close(); failing to remove causes epoll_wait() to return events for closed FD

**Fixed Version:**
```cpp
if (check_rate_limit(events[i].data.fd)) {
    send(events[i].data.fd, "ERROR: Rate limit exceeded\n", 27, 0);
    epoll_ctl(epoll_fd, EPOLL_CTL_DEL, events[i].data.fd, NULL);  // Remove first!
    close(events[i].data.fd);
    event_times.erase(events[i].data.fd);  // Clean up state
}
```

---

#### Q6
```cpp
#include <sys/epoll.h>
#include <sys/socket.h>
#include <fcntl.h>
#include <unistd.h>

void send_file(int epoll_fd, int client_fd, const char* filename) {
    int file_fd = open(filename, O_RDONLY);

    int pipefd[2];
    pipe(pipefd);

    // Splice file to pipe
    off_t offset = 0;
    struct stat st;
    fstat(file_fd, &st);

    while (offset < st.st_size) {
        ssize_t n = splice(file_fd, &offset, pipefd[1], NULL, 65536, 0);

        if (n > 0) {
            // Splice pipe to socket
            splice(pipefd[0], NULL, client_fd, NULL, n, 0);  // Bug: may block!
        }
    }

    close(pipefd[0]);
    close(pipefd[1]);
    close(file_fd);
}
```

**Answer:**
```
Blocking splice() to socket starves other clients - defeats epoll multiplexing
```

**Explanation:**
- `splice()` to socket blocks if client TCP buffer full
- Slow client causes splice() to block waiting for buffer space
- While blocked, cannot service other clients - defeats epoll
- Must use non-blocking sockets and check for EAGAIN
- **Key Concept:** Use non-blocking I/O with epoll; blocking splice() defeats multiplexing - must handle EAGAIN and use EPOLLOUT

**Fixed Version:**
```cpp
fcntl(client_fd, F_SETFL, O_NONBLOCK);  // Non-blocking!

while (offset < st.st_size) {
    ssize_t n = splice(file_fd, &offset, pipefd[1], NULL, 65536, SPLICE_F_NONBLOCK);

    if (n > 0) {
        ssize_t sent = splice(pipefd[0], NULL, client_fd, NULL, n, SPLICE_F_NONBLOCK);

        if (sent < 0 && errno == EAGAIN) {
            // Socket would block - enable EPOLLOUT and resume later
            struct epoll_event ev;
            ev.events = EPOLLOUT;
            ev.data.fd = client_fd;
            epoll_ctl(epoll_fd, EPOLL_CTL_MOD, client_fd, &ev);

            // Save state to resume
            transfer_states[client_fd] = {file_fd, pipefd[0], pipefd[1], offset, st.st_size};
            return;
        }
    }
}
```

---

#### Q7
```cpp
#include <sys/epoll.h>
#include <liburing.h>
#include <sys/socket.h>

struct io_uring ring;

int main() {
    io_uring_queue_init(256, &ring, 0);

    int epoll_fd = epoll_create1(0);

    while (true) {
        struct epoll_event events[10];
        int n = epoll_wait(epoll_fd, events, 10, 0);  // Poll mode!

        // Process socket events
        for (int i = 0; i < n; i++) {
            handle_socket_event(events[i]);
        }

        // Poll io_uring completions
        struct io_uring_cqe *cqe;
        io_uring_peek_cqe(&ring, &cqe);  // Bug: only checks one completion!

        if (cqe) {
            process_file_completion(cqe);
            io_uring_cqe_seen(&ring, cqe);
        }
    }
}
```

**Answer:**
```
Only one io_uring completion checked per loop - completions accumulate and starve
```

**Explanation:**
- `io_uring_peek_cqe()` returns one completion at a time
- If 10 file operations complete, only 1 processed per iteration
- Completions accumulate in queue - file operations stall
- Must loop until `io_uring_peek_cqe()` returns NULL
- **Key Concept:** Process all io_uring completions per iteration; single peek causes completion queue buildup and stalls

**Fixed Version:**
```cpp
// Poll io_uring completions - loop until empty!
while (true) {
    struct io_uring_cqe *cqe;
    int ret = io_uring_peek_cqe(&ring, &cqe);

    if (ret < 0 || !cqe) break;  // No more completions

    process_file_completion(cqe);
    io_uring_cqe_seen(&ring, cqe);
}
```

**Alternative (integrate io_uring with epoll):**
```cpp
// Get io_uring eventfd
int uring_fd = io_uring_get_eventfd(&ring);

// Add to epoll
struct epoll_event ev;
ev.events = EPOLLIN;
ev.data.fd = uring_fd;
epoll_ctl(epoll_fd, EPOLL_CTL_ADD, uring_fd, &ev);

// Now epoll_wait() returns when io_uring has completions
```

---
