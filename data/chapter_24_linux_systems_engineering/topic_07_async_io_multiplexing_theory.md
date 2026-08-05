## TOPIC: Asynchronous I/O & I/O Multiplexing - select, poll, epoll & io_uring

### THEORY_SECTION: From Blocking Reads to Zero-Syscall Ring Buffers

A server that has to watch thousands of sockets at once cannot afford to block on any single one of them, and it cannot afford to burn a full OS thread per connection either. This topic covers the four generations of Linux answers to that problem — `select()`, `poll()`, `epoll()`, and `io_uring` — and how high-level C++/Python async frameworks sit on top of them.

---

#### 7.1 Blocking vs Non-Blocking I/O — the Starting Problem

**Blocking `read()`** on an empty socket does not busy-wait — it puts the calling task to sleep:

```c
ssize_t n = read(sock_fd, buf, sizeof(buf));
// If no data has arrived yet:
//   1. Kernel sees the socket's receive buffer is empty.
//   2. Kernel sets current->state = TASK_INTERRUPTIBLE (see Topic 3: Process Management).
//   3. Kernel removes the task from the CFS runqueue entirely — it costs ZERO CPU while waiting.
//   4. Task is placed on the socket's wait queue.
//   5. When a packet arrives, the network stack's interrupt handler wakes the task
//      (state -> TASK_RUNNING, re-inserted into the CFS red-black tree).
//   6. Scheduler eventually picks it, read() returns with the data.
```

This is efficient for ONE socket — the thread costs nothing while blocked. It falls apart the moment you need to watch many sockets **at once** in a single thread: `read()` on socket A blocks the thread even while socket B has data ready and waiting.

**Non-blocking mode** (`fcntl(fd, F_SETFL, O_NONBLOCK)`) changes the contract: `read()` never sleeps. If the receive buffer is empty, it returns immediately with `-1` and `errno = EAGAIN` (or `EWOULDBLOCK`, the same value on Linux):

```c
fcntl(sock_fd, F_SETFL, O_NONBLOCK);
ssize_t n = read(sock_fd, buf, sizeof(buf));
if (n < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) {
    // Nothing ready right now — try something else, come back later.
} else if (n < 0) {
    // A real error.
} else {
    // n bytes read successfully (n == 0 means peer closed).
}
```

Non-blocking mode alone just turns "sleep until ready" into "poll and burn CPU checking constantly" — which is worse. The real fix is **multiplexing**: ask the kernel "wake me up when ANY of these N sockets is ready," so a single thread can service thousands of connections, sleeping only when truly nothing is ready.

| Model | Thread cost per connection | CPU while idle | Scales to 10,000 connections? |
|---|---|---|---|
| One blocking thread per socket | 1 OS thread (~8 MB stack reserved, ~kilobytes-MB committed) each | 0% (each thread sleeps) | No — thread/context-switch overhead dominates |
| Busy-loop non-blocking poll | 1 thread total | 100% (constant spinning) | No — wastes an entire core |
| Multiplexed (select/poll/epoll/io_uring) | 1 thread, N sockets | 0% while nothing ready | Yes (varies by mechanism — see below) |

---

#### 7.2 `select()` — the Original Multiplexer

```c
int select(int nfds, fd_set *readfds, fd_set *writefds,
           fd_set *exceptfds, struct timeval *timeout);
```

`fd_set` is a fixed-size **bitmask** — bit `i` set means "watch fd `i`." `FD_SETSIZE` (typically **1024**) is a hard compile-time ceiling: you cannot watch fd 1025 no matter what, a real limitation for high-connection-count servers.

```c
fd_set readfds;
FD_ZERO(&readfds);
FD_SET(sock_a, &readfds);
FD_SET(sock_b, &readfds);
int maxfd = std::max(sock_a, sock_b) + 1;

int ready = select(maxfd, &readfds, NULL, NULL, NULL); // blocks until >=1 ready

if (FD_ISSET(sock_a, &readfds)) { /* sock_a has data */ }
if (FD_ISSET(sock_b, &readfds)) { /* sock_b has data */ }
```

**Why `select()` doesn't scale — the O(N) tax paid on EVERY call:**

1. **Userspace → kernel copy**: the entire `fd_set` bitmask (up to 1024 bits) is copied into the kernel on every single call, even if only 1 of 10,000 watched fds changed state since the last call.
2. **Kernel-side linear scan**: the kernel walks every bit in the set, checking each fd's readiness one by one — O(N) work regardless of how many are actually ready.
3. **Kernel → userspace copy back**: the (mutated in place!) `fd_set` is copied back out, which also means **you must rebuild the entire set from scratch before the next call** — `select()` destructively overwrites its input, it doesn't give you a separate "these are ready" list.
4. **Userspace re-scan**: your code then loops `FD_ISSET()` over every fd again to figure out which ones fired.

At 10,000 watched sockets where typically only a handful are ready on any given wake-up, `select()` is doing **~10,000 units of scanning-and-copying work to discover ~5 ready events** — the classic O(N) multiplexer problem.

---

#### 7.3 `poll()` — Same Scaling Ceiling, No Artificial FD Limit

```c
struct pollfd {
    int   fd;         // File descriptor to watch
    short events;     // Requested events (POLLIN, POLLOUT, ...)
    short revents;    // Returned events (kernel fills this in)
};

int poll(struct pollfd *fds, nfds_t nfds, int timeout);
```

```c
std::vector<pollfd> fds = {
    { sock_a, POLLIN, 0 },
    { sock_b, POLLIN, 0 },
};
int ready = poll(fds.data(), fds.size(), -1); // blocks until >=1 ready

for (auto& pfd : fds) {
    if (pfd.revents & POLLIN) { /* pfd.fd has data */ }
}
```

`poll()` replaces the fixed 1024-bit bitmask with a plain array of `struct pollfd` — no `FD_SETSIZE` ceiling, and it doesn't destructively overwrite your request (readiness goes into a separate `revents` field, so you don't have to rebuild `events` every call). **But the fundamental scaling problem is unchanged**: the kernel still walks the entire array on every `poll()` call, and userspace still copies the whole array in and scans the whole array out, every single time — still O(N) per call. `poll()` fixes the *ergonomics* of `select()`, not its *scaling*.

---

#### 7.4 `epoll` — Persistent Interest List + Kernel-Pushed Ready List

`epoll` fixes the actual scaling problem by inverting who does the work: instead of the kernel re-scanning every watched fd on every call, the kernel **pushes** ready fds onto a list the moment they become ready (via a callback registered on the socket's wait queue), and your `epoll_wait()` call just reads that pre-built list.

```c
int epoll_create1(int flags);                                    // 1. Create an epoll instance
int epoll_ctl(int epfd, int op, int fd, struct epoll_event *ev);  // 2. Register/modify/remove interest — O(log N)
int epoll_wait(int epfd, struct epoll_event *events,
                int maxevents, int timeout);                       // 3. Block until >=1 ready — O(1) w.r.t. ready count
```

```c
int epfd = epoll_create1(0);

epoll_event ev{};
ev.events = EPOLLIN;
ev.data.fd = sock_a;
epoll_ctl(epfd, EPOLL_CTL_ADD, sock_a, &ev);   // register once, not every loop iteration!

ev.data.fd = sock_b;
epoll_ctl(epfd, EPOLL_CTL_ADD, sock_b, &ev);

epoll_event ready_events[64];
int n = epoll_wait(epfd, ready_events, 64, -1); // returns ONLY the fds that are actually ready
for (int i = 0; i < n; i++) {
    int fd = ready_events[i].data.fd;
    // handle fd — guaranteed ready, no need to check anything else
}
```

**Internal architecture** — this is the mechanism that matters for interviews, matching the exact framing "Red-Black Trees and Ready Lists":

```
                        struct eventpoll (one per epoll_create() instance, lives in kernel RAM)
                       ┌──────────────────────────────────────────────────────────────┐
                       │                                                              │
                       │  rbr: Red-Black Tree (the "Interest List")                  │
                       │  ┌────────────────────────────────────────────┐             │
                       │  │            fd 7 (registered)               │             │
                       │  │          /              \                  │             │
                       │  │     fd 3                  fd 12            │             │
                       │  │  (registered)          (registered)        │             │
                       │  └────────────────────────────────────────────┘             │
                       │   epoll_ctl(ADD/MOD/DEL) -> O(log N) tree operation          │
                       │                                                              │
                       │  rdllist: Ready List (a plain doubly-linked list, initially  │
                       │           EMPTY)                                            │
                       │  ┌────────────────────────────────────────────┐             │
                       │  │                (empty)                    │             │
                       │  └────────────────────────────────────────────┘             │
                       └──────────────────────────────────────────────────────────────┘
                                              ▲
                                              │ callback fired the INSTANT data arrives
                                              │ (registered via the socket's wait queue
                                              │  when epoll_ctl(ADD) was called)
                       ┌──────────────────────┴───────────────────────┐
                       │   Packet arrives on socket fd=7 (NIC -> IRQ   │
                       │   -> softirq -> network stack delivers data)  │
                       └────────────────────────────────────────────────┘

AFTER the packet lands, the callback pushes fd 7's node onto rdllist:

                       │  rdllist: Ready List                                        │
                       │  ┌────────────────────────────────────────────┐             │
                       │  │  [ fd 7 ] -> NULL                          │             │
                       │  └────────────────────────────────────────────┘             │

epoll_wait() now simply: (a) sleep on rdllist's wait queue if empty, (b) once non-empty,
copy JUST the ready entries (here: 1 entry, fd 7) back to userspace. It never touches
fd 3 or fd 12 at all — their registration sits untouched in the Red-Black tree.
```

**Why this scales**: `epoll_wait()`'s cost is proportional to the number of *ready* events, not the number of *watched* fds. Watching 100,000 idle connections and getting 3 ready events costs roughly the same as watching 3 connections and getting 3 ready events — the O(N) kernel scan that `select`/`poll` pay on every call simply doesn't exist in `epoll`'s design.

| Mechanism | Registration cost | Per-wait cost | Max fds | Model |
|---|---|---|---|---|
| `select()` | N/A (rebuilt every call) | O(N) kernel scan + O(N) copy in/out | 1024 (`FD_SETSIZE`) | Readiness, re-scan every call |
| `poll()` | N/A (rebuilt every call) | O(N) kernel scan + O(N) copy in/out | Unlimited (array-based) | Readiness, re-scan every call |
| `epoll` | O(log N) per `epoll_ctl()`, done once | O(1) relative to ready count (kernel pushes to ready list via callback) | Unlimited | Readiness, persistent registration |
| `io_uring` | O(1) ring buffer slot write | Near-zero — often **zero syscalls** with `SQPOLL` | Unlimited | **Completion** (kernel performs the I/O itself) |

---

#### 7.5 Edge-Triggered vs Level-Triggered epoll

`epoll` supports two notification modes, set via the `events` flags passed to `epoll_ctl()`:

- **Level-Triggered (default, `EPOLLIN`)**: `epoll_wait()` keeps reporting a fd as ready **every time you call it**, for as long as there is unread data sitting in that fd's buffer — even across multiple `epoll_wait()` calls. Forgiving: if you only read part of the data this iteration, the fd will simply show up as ready again next time.
- **Edge-Triggered (`EPOLLIN | EPOLLET`)**: `epoll_wait()` reports a fd exactly **once**, only at the moment it transitions from not-ready to ready. If you don't read *all* the available data right then, you will **not** be told again — the fd won't reappear in the ready list until *new* data arrives, even though old unread data is still sitting there.

```
Common Pitfall — Edge-Triggered Under-Read:

  Socket receives 8KB of data.
  epoll_wait() reports fd as ready (transition: not-ready -> ready).
  Your handler calls read(fd, buf, 4096) — reads only the first 4KB.
  You move on to the next event.

  ❌ MISTAKE: the remaining 4KB sits in the kernel buffer forever, unreported,
     because the fd never transitions again — it was already "ready" and stays
     "ready" at the OS level, but epoll only notifies on the EDGE (the transition).

  ✅ FIX: in edge-triggered mode, you MUST drain the fd completely on every
     notification, looping until you hit EAGAIN:

      while (true) {
          ssize_t n = read(fd, buf, sizeof(buf));
          if (n > 0) { /* process n bytes */ continue; }
          if (n < 0 && errno == EAGAIN) break;   // truly drained, safe to stop
          if (n == 0) { /* peer closed */ break; }
          if (n < 0) { /* real error */ break; }
      }
```

Edge-triggered mode requires the fd to be non-blocking (otherwise that drain loop's final `read()` call would block forever waiting for more data that isn't coming). Level-triggered is simpler and safer by default; edge-triggered avoids epoll re-reporting a still-ready fd every single loop iteration, which matters at extreme connection counts (this is what Nginx and most very-high-throughput event loops use, paired carefully with the drain-to-`EAGAIN` discipline above).

---

#### 7.6 `io_uring` — Completion-Based I/O, Not Readiness-Based

Every mechanism so far (`select`/`poll`/`epoll`) is a **readiness** API: the kernel tells you *"you may now call `read()` without blocking,"* but you still have to make that syscall yourself, and it still costs a full user↔kernel transition. `io_uring` (Linux 5.1+) is a **completion** API: you submit a request describing the I/O you want done, the kernel performs it (potentially fully asynchronously, even using dedicated kernel-side polling threads), and hands you back the result — no separate "now go call read()" round-trip needed.

**Architecture — two ring buffers, shared memory, mmap'd into both kernel and userspace:**

```
                         USER SPACE                                    KERNEL SPACE
                    ┌───────────────────────┐                    ┌───────────────────────┐
                    │   Submission Queue     │                    │   Submission Queue     │
                    │   (SQ) — mmap'd shared │◄──────────────────►│   Entries (SQEs)       │
                    │   ring buffer          │  Same physical     │   consumed here        │
                    │                        │  memory pages!     │                        │
                    │  [SQE][SQE][SQE][ ][ ] │                    │  App writes an SQE     │
                    │        ▲               │                    │  describing "read fd 7 │
                    │       tail (app writes)│                    │  into buf, 4096 bytes" │
                    └───────────────────────┘                    │  then bumps sq_tail.   │
                                                                  │  Kernel consumes from   │
                                                                  │  sq_head, PERFORMS the  │
                    ┌───────────────────────┐                    │  actual I/O itself.     │
                    │   Completion Queue     │                    │                        │
                    │   (CQ) — mmap'd shared │◄──────────────────►│   Kernel writes a CQE   │
                    │   ring buffer          │                    │   ("read fd 7 done,    │
                    │                        │                    │   257 bytes, no error") │
                    │  [CQE][CQE][ ][ ][ ]  │                    │   and bumps cq_tail.    │
                    │        ▲               │                    │                        │
                    │      head (app reads)  │                    │                        │
                    └───────────────────────┘                    └───────────────────────┘
```

1. **Setup** (`io_uring_setup()`, once): kernel allocates the SQ and CQ ring buffers and `mmap()`s them into the process's address space — both sides now see the *same physical memory*, no copying needed to communicate.
2. **Submit**: userspace writes an SQE (Submission Queue Entry — "please `read()` fd 7 into this buffer") directly into the shared ring and advances the tail pointer. **No syscall required for this step** — it's a plain memory write.
3. **Notify**: `io_uring_enter()` tells the kernel "new SQEs are waiting" (this IS a syscall — but see `SQPOLL` below for how to eliminate even this).
4. **Kernel executes**: the kernel actually performs the read/write/accept/etc itself, asynchronously, and writes a CQE (Completion Queue Entry — result + byte count + error code) into the shared completion ring.
5. **Reap**: userspace polls the CQ ring's head/tail pointers (again, a plain memory read — **no syscall**) to discover completions.

**`SQPOLL` mode — eliminating syscalls entirely on the hot path**: with `IORING_SETUP_SQPOLL`, the kernel spins up a dedicated kernel-side polling thread that continuously watches the SQ ring for new entries — meaning userspace never has to call `io_uring_enter()` at all for steady-state submission; it just writes SQEs into shared memory and the kernel thread picks them up on its own. For an I/O-heavy hot loop, this collapses "one syscall per I/O operation" (the cost every prior model pays) down to **zero syscalls per I/O operation** — a genuine architectural leap, not a micro-optimization.

**Why this is a different category from epoll, not just "epoll but faster":**

| | `epoll` | `io_uring` |
|---|---|---|
| Model | Readiness ("you may now call read() without blocking") | Completion ("here is your finished result") |
| Who calls `read()`/`write()`? | You do, after being told it's safe | The kernel does, on your behalf |
| Syscalls per I/O op (steady state) | 1+ (`epoll_wait` + the actual `read`/`write`) | 0 with `SQPOLL`, otherwise amortized across batched SQEs |
| Communication mechanism | Syscall arguments + kernel-managed lists | Shared mmap'd ring buffers (both sides read/write directly) |
| Natural fit for | Network sockets (readiness maps well to "packet arrived") | Storage I/O, mixed file+network workloads, anything wanting batched/zero-copy submission |

---

#### 7.7 How C++/Python Async Libraries Sit on Top of These Primitives

High-level async frameworks don't reinvent multiplexing — they wrap one of the mechanisms above behind a portable "reactor" or "proactor" API and expose coroutines/callbacks to application code:

- **Boost.Asio** (C++): `io_context::run()` internally drives an epoll-based (Linux) / IOCP-based (Windows) / kqueue-based (BSD/macOS) event loop under a unified `async_read`/`async_write`/`co_await` API. A `co_await socket.async_read_some(buf, use_awaitable)` compiles down to: register interest with the underlying reactor (epoll_ctl), suspend the coroutine, and resume it once the reactor's event loop sees the fd become ready (epoll_wait returns it) and the actual read completes.
- **libuv** (C, used by Node.js): same pattern — abstracts epoll/kqueue/IOCP behind `uv_read_start()`-style callback APIs; increasingly integrates `io_uring` as a backend on modern Linux kernels for file I/O specifically.
- **Python `asyncio`**: the default event loop's `selectors` module picks the best available multiplexer (`epoll` on Linux, falling back to `poll`/`select` on other platforms); `async def` / `await` coroutines are scheduled onto this loop exactly like Boost.Asio's coroutines are scheduled onto `io_context`.
- **`uvloop`** (Python): a drop-in replacement event loop for `asyncio` that wraps libuv directly (the same C library Node.js uses) instead of Python's pure-Python `selectors` implementation — same epoll/io_uring foundation underneath, but with far less Python-interpreter overhead per event, commonly cited as 2-4x faster than the stock asyncio loop for I/O-bound workloads.

**The core mental model to carry into an interview**: no matter how many layers of `co_await`/`async`/callback abstraction sit on top, at the bottom of every one of these frameworks is still a thread parked in `epoll_wait()` (or an `io_uring` completion-queue reap loop) — the coroutine machinery is just a more ergonomic way to write the same "register interest, suspend, resume on readiness/completion" pattern this topic covers at the syscall level.

---

**End of Topic 7: Async I/O & I/O Multiplexing**
