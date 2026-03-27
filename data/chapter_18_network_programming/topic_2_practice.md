## TOPIC: Multi-Client Server Patterns - Scaling Beyond One Connection

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Q1
```cpp
#include <iostream>
#include <thread>
#include <atomic>

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

**Answer:**
```
Counter: 2000
```

**Explanation:**
- `std::atomic<int>` provides lock-free atomic operations
- `counter++` is atomic - no data race between threads
- Thread 1 increments 1000 times, Thread 2 increments 1000 times
- Total: 1000 + 1000 = 2000 (guaranteed by atomic operations)
- **Key Concept:** std::atomic provides thread-safe operations without explicit mutexes; counter++ becomes atomic read-modify-write operation

---

#### Q2
```cpp
#include <sys/socket.h>
#include <unistd.h>
#include <cstdlib>

int main() {
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
        // Parent process continues - MISSING close(client_fd) and zombie reaping!
    }
}
```

**Answer:**
```
Two resource leaks: 1) Parent never closes client_fd (FD leak), 2) Zombie processes accumulate
```

**Explanation:**
- Parent keeps `client_fd` open even though child handles it - FD leak in parent
- Each child becomes zombie after exit (not reaped by parent)
- After ~1000 clients, parent hits FD limit (EMFILE)
- Zombie processes consume process table entries
- **Key Concept:** After fork(), parent must close client FDs and reap children with waitpid() in SIGCHLD handler

**Fixed Version:**
```cpp
void sigchld_handler(int sig) {
    while (waitpid(-1, NULL, WNOHANG) > 0);  // Reap all zombies
}

int main() {
    signal(SIGCHLD, sigchld_handler);

    while (true) {
        int client_fd = accept(server_fd, NULL, NULL);

        if (fork() == 0) {
            close(server_fd);  // Child doesn't need listening socket
            handle_client(client_fd);
            close(client_fd);
            exit(0);
        }
        close(client_fd);  // Parent closes client socket!
    }
}
```

---

#### Q3
```cpp
#include <sys/socket.h>
#include <sys/wait.h>
#include <signal.h>
#include <unistd.h>

void sigchld_handler(int signum) {
    waitpid(-1, NULL, 0);  // Reaps ONE zombie only
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

**Answer:**
```
9 zombies remain (10 exited simultaneously, handler only reaped 1)
```

**Explanation:**
- SIGCHLD signals can coalesce - 10 child exits generate 1 (or few) signals
- Handler calls `waitpid(-1, NULL, 0)` once per signal - reaps only 1 zombie
- If 10 children exit at same instant, only 1 SIGCHLD delivered, 9 zombies remain
- Must use WNOHANG and loop: `while (waitpid(-1, NULL, WNOHANG) > 0);`
- **Key Concept:** SIGCHLD signals coalesce; always loop with WNOHANG to reap all zombies in handler

**Fixed Version:**
```cpp
void sigchld_handler(int signum) {
    int saved_errno = errno;
    while (waitpid(-1, NULL, WNOHANG) > 0);  // Reap ALL zombies
    errno = saved_errno;
}
```

---

#### Q4
```cpp
#include <sys/socket.h>
#include <thread>
#include <vector>
#include <algorithm>
#include <cstring>

std::vector<int> active_clients;  // Global, not protected!

void handle_client(int client_fd) {
    active_clients.push_back(client_fd);  // Data race!

    char buffer[1024];
    while (recv(client_fd, buffer, sizeof(buffer), 0) > 0) {
        send(client_fd, buffer, strlen(buffer), 0);
    }

    // Remove from active list
    auto it = std::find(active_clients.begin(), active_clients.end(), client_fd);
    if (it != active_clients.end()) {
        active_clients.erase(it);  // Data race!
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

**Answer:**
```
Undefined behavior - data race on active_clients vector (crashes, corruption, lost clients)
```

**Explanation:**
- Multiple threads modifying `active_clients` without synchronization
- `push_back()` can reallocate vector while another thread iterates - crash
- Concurrent `erase()` operations invalidate iterators - undefined behavior
- `std::vector` is not thread-safe - requires mutex protection
- **Key Concept:** std::vector is not thread-safe; concurrent modifications require std::mutex protection to prevent data races

**Fixed Version:**
```cpp
std::vector<int> active_clients;
std::mutex clients_mutex;  // Protect access

void handle_client(int client_fd) {
    {
        std::lock_guard<std::mutex> lock(clients_mutex);
        active_clients.push_back(client_fd);
    }

    char buffer[1024];
    while (recv(client_fd, buffer, sizeof(buffer), 0) > 0) {
        send(client_fd, buffer, strlen(buffer), 0);
    }

    {
        std::lock_guard<std::mutex> lock(clients_mutex);
        auto it = std::find(active_clients.begin(), active_clients.end(), client_fd);
        if (it != active_clients.end()) {
            active_clients.erase(it);
        }
    }
    close(client_fd);
}
```

---

#### Q5
```cpp
#include <queue>
#include <mutex>
#include <condition_variable>
#include <atomic>

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
                condition.wait(lock);  // Bug: no predicate!

                if (client_queue.empty()) continue;  // Spurious wake-up not handled

                client_fd = client_queue.front();
                client_queue.pop();
            }
            handle_client(client_fd);
        }
    }
};
```

**Answer:**
```
Bug: wait() has no predicate - spurious wake-ups cause empty queue access; stop flag ignored
```

**Explanation:**
- `condition.wait(lock)` without predicate can wake spuriously
- Thread checks `if (empty()) continue` but doesn't re-wait - busy loop
- When `stop` becomes true, threads don't wake up (no notify)
- Threads stuck in `wait()` forever - destructor hangs
- **Key Concept:** Always use predicate with condition_variable::wait(); prevents spurious wake-ups and ensures condition is actually true

**Fixed Version:**
```cpp
void worker_thread() {
    while (!stop) {
        int client_fd;
        {
            std::unique_lock<std::mutex> lock(queue_mutex);
            condition.wait(lock, [this] {
                return stop || !client_queue.empty();  // Predicate!
            });

            if (stop && client_queue.empty()) break;

            client_fd = client_queue.front();
            client_queue.pop();
        }
        handle_client(client_fd);
    }
}

~ThreadPool() {
    stop = true;
    condition.notify_all();  // Wake all workers!
    for (auto& t : workers) t.join();
}
```

---

#### Q6
```cpp
#include <iostream>
#include <mutex>
#include <sys/socket.h>
#include <unistd.h>

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
        std::cout << "Received: " << buffer << "\n";  // buffer might not be null-terminated!
    }

    send(client_fd, buffer, n, 0);
    close(client_fd);
}
```

**Answer:**
```
Lock usage is correct but inefficient; printing buffer without null-termination is bug
```

**Explanation:**
- `lock_guard` usage is thread-safe - protects std::cout from interleaved output
- Scopes are correctly minimal - lock released immediately after output
- Bug: `buffer` from recv() is not null-terminated, printing it is undefined behavior
- Improvement: could use single lock for both prints if they're always together
- **Key Concept:** lock_guard correctly prevents interleaved output; always null-terminate recv() data before printing as string

**Fixed Version:**
```cpp
void handle_client(int client_fd) {
    char buffer[1024];
    int n = recv(client_fd, buffer, sizeof(buffer) - 1, 0);

    if (n > 0) {
        buffer[n] = '\0';  // Null-terminate!

        std::lock_guard<std::mutex> lock(cout_mutex);
        std::cout << "Client " << client_fd << " connected\n";
        std::cout << "Received: " << buffer << "\n";
    }

    send(client_fd, buffer, n, 0);
    close(client_fd);
}
```

---

#### Q7
```cpp
#include <sys/socket.h>
#include <thread>
#include <atomic>
#include <unistd.h>

int main() {
    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    bind(server_fd, ...);
    listen(server_fd, 5);

    std::atomic<int> active_threads{0};
    const int MAX_THREADS = 100;

    while (true) {
        if (active_threads >= MAX_THREADS) {
            usleep(100000);  // Sleep 100ms
            continue;  // Skip accept() - client waits in backlog!
        }

        int client_fd = accept(server_fd, NULL, NULL);

        active_threads++;
        std::thread t([client_fd, &active_threads]() {
            handle_client(client_fd);
            active_threads--;
        });
        t.detach();
    }
}
```

**Answer:**
```
101st client waits indefinitely in listen backlog; accept() never called for new clients
```

**Explanation:**
- When `active_threads >= MAX_THREADS`, loop sleeps and skips `accept()`
- 101st client completes TCP handshake, enters listen backlog (queue size = 5)
- Client waits for `accept()` that never comes until threads finish
- Clients 102-105 also wait in backlog, 106+ get connection refused
- Better: use thread pool or accept() always and queue work
- **Key Concept:** Never skip accept() to limit load; use thread pool or worker queue to control concurrency without blocking new connections

**Fixed Version:**
```cpp
ThreadPool pool(100);  // Fixed number of workers

while (true) {
    int client_fd = accept(server_fd, NULL, NULL);
    pool.submit([client_fd]() {  // Queue work, doesn't block accept
        handle_client(client_fd);
    });
}
```

---

#### Q8
```cpp
#include <sys/socket.h>
#include <sys/wait.h>
#include <signal.h>
#include <errno.h>
#include <unistd.h>

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
            if (errno == EINTR) continue;
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

**Answer:**
```
signal() behavior is undefined and non-portable; handler may be reset to SIG_DFL after first invocation
```

**Explanation:**
- `signal()` semantics vary across UNIX systems (BSD vs System V)
- Some systems reset handler to SIG_DFL after first call - only first zombie reaped
- `signal()` doesn't block signals during handler execution - potential race
- `sigaction()` provides reliable, portable semantics with SA_RESTART
- **Key Concept:** Always use sigaction() instead of signal(); it provides reliable, portable signal handling with consistent semantics

**Fixed Version:**
```cpp
void sigchld_handler(int signum) {
    int saved_errno = errno;
    while (waitpid(-1, NULL, WNOHANG) > 0);
    errno = saved_errno;
}

int main() {
    struct sigaction sa;
    sa.sa_handler = sigchld_handler;
    sigemptyset(&sa.sa_mask);
    sa.sa_flags = SA_RESTART;  // Auto-restart interrupted syscalls
    sigaction(SIGCHLD, &sa, NULL);  // ✅ Reliable!

    // ... rest of code
}
```

---

#### Q9
```cpp
#include <sys/socket.h>
#include <vector>
#include <mutex>
#include <algorithm>
#include <string>

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
                clients.erase(it);  // ❌ Iterator invalidation!
                close(client_fd);
            }
        }
    }
};
```

**Answer:**
```
Iterator invalidation - erase() invalidates loop iterator, causes undefined behavior (crash or skipped clients)
```

**Explanation:**
- Range-based for loop uses iterators internally
- `clients.erase(it)` invalidates the loop iterator - undefined behavior
- May skip next client, crash, or corrupt vector
- Must use index-based loop or collect dead clients first
- **Key Concept:** Never modify container while iterating with range-based for; use index loop or erase-remove idiom after iteration

**Fixed Version:**
```cpp
void broadcast(const std::string& message) {
    std::lock_guard<std::mutex> lock(clients_mutex);

    std::vector<int> dead_clients;

    for (int client_fd : clients) {
        int result = send(client_fd, message.c_str(), message.size(), 0);
        if (result < 0) {
            dead_clients.push_back(client_fd);
            close(client_fd);
        }
    }

    // Remove dead clients after iteration
    for (int fd : dead_clients) {
        clients.erase(std::remove(clients.begin(), clients.end(), fd), clients.end());
    }
}
```

---

#### Q10
```cpp
#include <sys/socket.h>
#include <signal.h>
#include <atomic>
#include <thread>
#include <unistd.h>

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
    return 0;  // ❌ Exit immediately - detached threads still running!
}
```

**Answer:**
```
Program exits while detached threads still running - undefined behavior (crash or abort)
```

**Explanation:**
- Detached threads continue running after main() exits
- Calling destructors of global objects while threads access them - undefined behavior
- Standard requires joining all threads before exit (detached threads not joinable)
- Detached threads may crash when accessing destroyed resources
- **Key Concept:** Never exit main() with active detached threads; track threads and join before exit for graceful shutdown

**Fixed Version:**
```cpp
std::vector<std::thread> active_threads;
std::mutex threads_mutex;

int main() {
    signal(SIGINT, handle_shutdown);

    while (!stop_server) {
        int client_fd = accept(server_fd, NULL, NULL);
        if (client_fd < 0) continue;

        std::lock_guard<std::mutex> lock(threads_mutex);
        active_threads.emplace_back(handle_client, client_fd);
    }

    // Join all threads before exit
    for (auto& t : active_threads) {
        if (t.joinable()) t.join();
    }

    close(server_fd);
    return 0;
}
```

---

#### Q11
```cpp
#include <iostream>
#include <thread>
#include <vector>
#include <mutex>

int counter = 0;  // NOT atomic
std::mutex counter_mutex;

void increment_counter() {
    counter_mutex.lock();
    counter++;
    if (counter > 1000) {
        return;  // ❌ Early return without unlock!
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

**Answer:**
```
Deadlock - after counter reaches 1001, mutex left locked; other threads hang forever in lock()
```

**Explanation:**
- First thread increments counter to 1001, takes early return
- Mutex left locked - never calls `unlock()`
- All other threads block in `lock()` waiting for mutex - deadlock
- Program hangs forever - `join()` never completes
- **Key Concept:** Always use RAII (lock_guard/unique_lock) for mutex management; prevents forgetting unlock on early returns or exceptions

**Fixed Version:**
```cpp
void increment_counter() {
    std::lock_guard<std::mutex> lock(counter_mutex);  // RAII - auto unlock
    counter++;
    if (counter > 1000) {
        return;  // ✅ Safe - lock_guard destructor unlocks
    }
    // lock_guard destructor also unlocks here
}
```

---

#### Q12
```cpp
#include <queue>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <atomic>
#include <vector>

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

**Answer:**
```
Destructor will NOT hang - predicate includes 'stop' flag, so wait() will exit when stop becomes true
```

**Explanation:**
- Wait predicate checks `stop || !client_queue.empty()`
- When destructor sets `stop = true`, predicate becomes true
- Spurious wake-ups or timeout will eventually check predicate and exit
- But relying on spurious wake-ups is inefficient - should call `notify_all()`
- Missing `notify_all()` causes delay, not deadlock
- **Key Concept:** Predicate-based wait() prevents deadlock even without notify; but always notify_all() after setting stop flag for immediate shutdown

**Better Version:**
```cpp
~ThreadPool() {
    {
        std::lock_guard<std::mutex> lock(queue_mutex);
        stop = true;
    }
    condition.notify_all();  // Wake all workers immediately!
    for (auto& t : workers) {
        t.join();
    }
}
```

---

#### Q13
```cpp
#include <sys/socket.h>
#include <unistd.h>
#include <thread>
#include <iostream>
#include <cstring>

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
        close(server_fd);  // ❌ Close server socket while other threads using it!
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

**Answer:**
```
Main thread's accept() fails with EBADF after server_fd closed; other client threads unaffected
```

**Explanation:**
- One client sends "SHUTDOWN", thread closes `server_fd`
- Main thread's next `accept(server_fd, ...)` returns -1 with errno = EBADF
- Existing client handler threads unaffected (have their own client_fd)
- But main loop should handle EBADF and exit gracefully
- Closing shared FD from worker thread is poor design - use signal/flag
- **Key Concept:** Closing shared FD from one thread causes syscall failures in other threads; use coordination mechanism instead of closing shared resources

**Fixed Version:**
```cpp
std::atomic<bool> shutdown_requested{false};

void handle_client(int client_fd) {
    char buffer[1024];
    int n = recv(client_fd, buffer, sizeof(buffer), 0);

    if (n > 0) {
        send(client_fd, buffer, n, 0);

        if (strncmp(buffer, "SHUTDOWN", 8) == 0) {
            shutdown_requested = true;  // Signal main thread
        }
    }
    close(client_fd);
}

int main() {
    int server_fd = create_server_socket(8080);

    while (!shutdown_requested) {
        int client_fd = accept(server_fd, NULL, NULL);
        std::thread t(handle_client, client_fd);
        t.detach();
    }

    close(server_fd);
}
```

---

#### Q14
```cpp
#include <iostream>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <unistd.h>

std::condition_variable cv;
std::mutex cv_mutex;
int ready = 0;

void worker_thread() {
    std::unique_lock<std::mutex> lock(cv_mutex);
    cv.wait(lock);  // ❌ No predicate - can miss notification!

    // Do work
    std::cout << "Worker started\n";
}

int main() {
    std::thread t(worker_thread);

    sleep(1);  // Ensure thread is waiting (not guaranteed!)

    {
        std::lock_guard<std::mutex> lock(cv_mutex);
        ready = 1;
    }
    cv.notify_one();

    t.join();
}
```

**Answer:**
```
Race condition - if notify_one() happens before wait(), worker misses notification and hangs forever
```

**Explanation:**
- `sleep(1)` doesn't guarantee worker reaches `wait()` first
- If `notify_one()` called before `wait()`, notification lost
- Worker thread hangs forever in `wait()` - never wakes up
- Must use predicate: `wait(lock, []{ return ready == 1; })`
- Predicate-based wait checks condition even if notification missed
- **Key Concept:** Always use predicate with condition_variable::wait(); prevents lost notifications due to race conditions between wait() and notify()

**Fixed Version:**
```cpp
void worker_thread() {
    std::unique_lock<std::mutex> lock(cv_mutex);
    cv.wait(lock, [] { return ready == 1; });  // Predicate!

    std::cout << "Worker started\n";
}

int main() {
    std::thread t(worker_thread);

    // No need for sleep - predicate handles race
    {
        std::lock_guard<std::mutex> lock(cv_mutex);
        ready = 1;
    }
    cv.notify_one();

    t.join();
}
```

---

#### Q15
```cpp
#include <sys/socket.h>
#include <thread>
#include <vector>

int main() {
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
}
```

**Answer:**
```
Program crashes when vector reallocates - std::thread destructor calls std::terminate() if not joined/detached
```

**Explanation:**
- `std::thread` destructor requires thread to be joined or detached
- Vector reallocation moves threads - calls destructor on old threads
- Threads are still joinable (not joined/detached) - `std::terminate()` called
- Program aborts with "terminate called without an active exception"
- Must either join threads or call `detach()` on each thread
- **Key Concept:** std::thread destructor calls std::terminate() if thread is joinable; always join() or detach() before destruction

**Fixed Version 1 (Detach):**
```cpp
while (true) {
    int client_fd = accept(server_fd, NULL, NULL);

    std::thread t([client_fd]() {
        handle_client(client_fd);
    });
    t.detach();  // Detach immediately
}
```

**Fixed Version 2 (Join at end):**
```cpp
std::vector<std::thread> client_threads;

// ... accept loop adds threads

// Join all threads before exit
for (auto& t : client_threads) {
    if (t.joinable()) {
        t.join();
    }
}
```

---
