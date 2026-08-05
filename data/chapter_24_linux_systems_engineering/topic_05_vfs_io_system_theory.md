## TOPIC: VFS & The I/O System - "Everything is a File"

### THEORY_SECTION: The Three-Tier Lookup, Polymorphic I/O, and Inter-Process Communication

Every piece of I/O in Linux — a disk file, a TCP socket, a pipe, a terminal, a GPU device — is accessed through the exact same four syscalls: `open()`/`socket()`/`pipe()`, `read()`, `write()`, `close()`. This is not a coincidence or a marketing slogan ("everything is a file") — it is a concrete, three-layer kernel data structure with a function-pointer vtable sitting underneath every single file descriptor. This topic builds that machinery from the ground up: the exact structs, the exact syscall traces, and the exact pointer relationships that make one `read()` implementation serve a disk file, a socket, and a pipe identically.

---

#### 5.1 The Three-Tier VFS Architecture

When your code does `int fd = open(...)`, the kernel walks through **three separate tables**, each answering a different question:

```
USER SPACE
  Your Code: read(3, buf, 1024)
  ─────────────────────────────────────────────────────────────
KERNEL SPACE
  1. Process File Table (Per-Process)
     task_struct -> files_struct -> fd_array[3]
                                         │
                                         ▼ (Pointer)
  2. Open File Description Table (System-Wide)
     struct file {
         f_pos: 1024 (Current Read/Write Offset)
         f_mode: READ
         *f_inode: ──────────────┐
     }                           │
                                 ▼ (Pointer)
  3. Inode Table / Cache (System-Wide VFS)
     struct inode {
         i_ino: 849201 (Unique File ID)
         i_size: 4096 bytes
         i_op: Read/Write Function Pointers
     }
```

**Why three tiers instead of one flat table?** Each tier answers a fundamentally different question, and each has a different lifetime and sharing scope:

| Tier | Scope | Answers |
|---|---|---|
| 1. `fd_array` (per-process) | One process (or shared by threads via `clone(CLONE_FILES)`) | "What does the small integer `3` mean *to me*?" |
| 2. `struct file` (system-wide, one per **open** call) | Shared only if explicitly duplicated (`fork()`, `dup()`, fd-passing) | "Where is my read/write cursor, and what mode did I open with?" |
| 3. `struct inode` (system-wide, one per **file on disk**) | Shared by every open of the same file, system-wide | "What actually IS this file — its size, its blocks, its permissions?" |

The trace of `open("/tmp/data.txt", O_RDWR | O_CREAT, 0644)` followed by `write(fd, "HELLO", 5)`:

**`open()`:**
1. User → Kernel mode transition via the `syscall` instruction.
2. VFS resolves the path through the dentry cache, locates (or creates) the Inode.
3. Kernel allocates a System-Wide Open File Table entry: `offset=0, flags=O_RDWR`, pointing at Inode #8812.
4. Kernel scans the process's `fd_array` for the lowest free integer (typically 3, since 0/1/2 are stdin/stdout/stderr) → FD 3 → Entry #42.
5. Returns `3`.

```
[ PROCESS FD TABLE ]           [ SYSTEM-WIDE OPEN FILE TABLE ]      [ INODE TABLE / DISK ]
0 stdin                        Entry 42 | Offset 0 | O_RDWR | ->    Inode 8812 | 0 Bytes | Block 1021, 1022...
1 stdout                                  Inode #8812 (data.txt)
2 stderr
3 -> Open File Table Entry #42  <- NEWLY ALLOCATED
```

**`write(3, "HELLO", 5)`:**
1. FD lookup: FD 3 → Entry #42.
2. Reads current offset (0).
3. Writes `"HELLO"` into a 4 KB **Page Cache** frame in RAM (**not** directly to disk!), marks the page **Dirty**.
4. Updates Entry #42's offset: `0 → 5`.
5. Background writeback threads flush dirty page-cache pages to disk later, asynchronously — your `write()` call returned long before the bytes physically hit the platter/SSD.

---

#### 5.2 Kernel Pseudo-C: `sys_open()` and `sys_read()`

The three-tier picture above is a simplification of real, literal kernel data structures. Here is the actual (simplified but structurally accurate) C:

```c
struct inode {
    unsigned long i_ino;      // Unique File ID on disk (e.g., 849201)
    size_t        i_size;     // Total file size in bytes
    void*         page_cache; // Pointers to physical RAM pages holding file data
};

struct file {
    off_t         f_pos;      // CURRENT READ/WRITE OFFSET
    int           f_flags;    // Flags like O_RDONLY, O_RDWR
    struct inode* f_inode;    // POINTER to the inode above!
};

struct files_struct {
    struct file* fd_array[1024]; // Array of pointers to "struct file". Index = fd!
};

struct task_struct {
    pid_t                pid;
    struct mm_struct*    mm;
    struct files_struct* files;
};

int sys_open(const char *filename, int flags) {
    struct task_struct *current = get_current_process();
    struct inode *target_inode = vfs_lookup_inode(filename);       // 1. locate/create inode
    struct file *new_file = kmalloc(sizeof(struct file));          // 2. allocate struct file
    new_file->f_pos   = 0;
    new_file->f_flags = flags;
    new_file->f_inode = target_inode;

    int allocated_fd = -1;                                        // 3. find first free slot
    for (int i = 3; i < 1024; i++) {                               // skip 0,1,2 (stdin/out/err)
        if (current->files->fd_array[i] == NULL) { allocated_fd = i; break; }
    }
    current->files->fd_array[allocated_fd] = new_file;             // 4. save pointer
    return allocated_fd;                                           // 5. return index
}

ssize_t sys_read(int fd, void *user_buffer, size_t count) {
    struct task_struct *current = get_current_process();
    struct file *f = current->files->fd_array[fd];                 // 1. lookup by index
    if (f == NULL) return -EBADF;
    struct inode *in = f->f_inode;                                 // 2. get inode
    off_t current_offset = f->f_pos;                                // 3. read at f_pos
    copy_data_to_user(user_buffer, in->page_cache + current_offset, count);
    f->f_pos = current_offset + count;                              // 4. update offset
    return count;                                                   // 5. return bytes read
}
```

This is the level of precision worth internalizing: `fd` is nothing but an **array index**. `sys_read` does not "know" anything about files — it dereferences a pointer, reads an offset, copies bytes, and updates the offset. All the "file-ness" lives in `struct inode` and `struct file`.

---

#### 5.3 The Golden Invariant: When Is a New `struct file` Actually Created?

A single `struct file` is expensive-ish to create (a `kmalloc` plus VFS path resolution) and is deliberately **not** re-created on every I/O operation. Only three syscalls allocate one:

```
OPERATION          CREATES NEW 'struct file'?    ACTION ON 'struct file'
----------------------------------------------------------------------------------
open()             YES                           Allocates new 'struct file' in RAM
socket()           YES                           Allocates new 'struct file' in RAM
pipe()             YES (creates 2)               Allocates 2 new 'struct file' instances
----------------------------------------------------------------------------------
read()             NO                            Uses existing; updates f_pos
write()            NO                            Uses existing; updates f_pos
lseek()            NO                            Uses existing; changes f_pos
----------------------------------------------------------------------------------
close()            NO (Destroys it)              Decrements ref count & frees memory
```

**Opening the same file twice is two independent cursors on one inode.** If you call `open("/tmp/file.txt", ...)` twice from the same process, you get **two separate `struct file` objects** — each with its own independent `f_pos` — both pointing at the **same** `struct inode`:

```
fd_array[3] ───> struct file #1 { f_pos = 0 } ──┐
                                                   ├───> struct inode { /tmp/file.txt }
fd_array[4] ───> struct file #2 { f_pos = 0 } ──┘
```

Reading through fd 3 does **not** advance fd 4's offset — they are entirely independent cursors that just happen to point at the same underlying file content.

---

#### 5.4 Why `fork()` Shares the File Offset (A Precise Correction)

This is one of the most commonly mis-stated facts in systems programming, worth stating precisely: after `fork()`, if the child reads 5 bytes from an inherited fd, the **parent's** next read on that same fd continues from byte 5 too — the offset is shared.

**The naive (wrong) explanation**: "the child gets a shallow copy of `fd_array`, so it shares state with the parent."

**The precise explanation**: `fork()` gives the child a **brand new, independent `files_struct` and a brand new `fd_array`** (this is real memory, freshly allocated for the child) — but each **pointer value** inside that new array is *copied* from the parent, meaning both arrays' slot 3 point at the exact same `struct file` object in the Open File Table:

```
[ PARENT FD TABLE ]  FD 3 ──┐
                             ├──> [ OPEN FILE TABLE ENTRY ] (Offset shared!) ──> [ INODE ]
[ CHILD FD TABLE ]   FD 3 ──┘
```

It is not "the array is shared" — it is "two independent arrays happen to hold pointers to the same object." The `f_pos` field lives inside the shared `struct file`, so advancing it via either process's fd is visible to both. This exact mechanism is what makes shell pipelines and `dup2()`-based redirection work correctly across `fork()`.

**Process vs Thread — a sharper distinction on the same axis:**

| Resource | `fork()` (new process) | `pthread_create()` / `clone(CLONE_FILES)` (new thread) |
|---|---|---|
| `files_struct` | **Copied** — child gets a new struct, new array, but array entries point at the same `struct file` objects | **Shared** — thread's `task_struct->files` points at the exact **same** `files_struct` object as its siblings |
| Effect of `close(fd)` | Only closes that process's *entry*; the shared `struct file` survives if the other process still references it (refcounted) | Closes it for **every thread in the process immediately** — there is only one `fd_array` |

This is why closing a file descriptor from one thread while another thread is mid-`read()` on it is a classic concurrency bug — there is no per-thread isolation at all, because `files_struct` itself (not just the objects it points to) is the shared resource.

---

#### 5.5 The Complete `files_struct` / `fdtable`

```c
struct files_struct {
    atomic_t count;                                  /* Reference count (how many processes share this table) */
    bool resize_in_progress;

     struct fdtable __rcu *fdt;                      /* Pointer to the active file descriptor table */
     struct fdtable fdtab;                           /* Primary embedded file descriptor table */

     unsigned int next_fd;             /* Next available file descriptor integer slot */
     unsigned long close_on_exec_init; /* Bitmask for O_CLOEXEC files closed on execve() */
     unsigned long open_fds_init;     /* Bitmask of initial open descriptors (bits 0-63) */

     struct file __rcu *fd_array[64];                /* Fast inline array for the first 64 open file descriptors */
};

struct fdtable {
    unsigned int max_fds;                            /* Current maximum capacity of the table */
    struct file __rcu **fd;                          /* Array of pointers to struct file */
    unsigned long *close_on_exec;                    /* Bitmask for descriptors to close on execve() */
    unsigned long *open_fds;                         /* Bitmask for currently open file descriptors */
};
```

```
        FD Array (Index)            KERNEL FILE OBJECTS (Shared in RAM)
      ┌──────────────────┐
      │ 0 (stdin) ──────┼────────► struct file (TTY Keyboard input)
      ├──────────────────┤
      │ 1 (stdout) ──────┼────────► struct file (TTY Terminal output)
      ├──────────────────┤
      │ 2 (stderr) ──────┼────────► struct file (TTY Terminal output)
      ├──────────────────┤
      │ 3 (data.txt) ────┼────────► struct file (On-disk inodes / offset)
      ├──────────────────┤          ├── f_pos: 1024 (Byte offset)
      │ 4 (NULL)         │          ├── f_mode: FMODE_READ
      └──────────────────┘          └── f_op: &ext4_file_operations
```

**Why an inline `fd_array[64]` at all, instead of always dynamically allocating?** Because the overwhelming majority of processes open well under 64 file descriptors — an embedded fixed-size array avoids a `kmalloc` on the common path. A process that opens **more** than 64 files (e.g., Nginx handling thousands of concurrent connections) forces the kernel to allocate a larger `fdtable`, copy the existing pointers over, and update `current->files->fdt` to point at the bigger table — invisible to user space, just slightly more expensive the first time it happens.

**Worked demo — `dup2()` redirection:**

```c
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <fcntl.h>

int main() {
    printf("Process PID: %d\n\n", getpid());

    // 1. Open a new file -> Kernel finds next_fd = 3
    int fd3 = open("output.txt", O_CREAT | O_WRONLY | O_TRUNC, 0644);
    printf("Opened 'output.txt' -> Assigned File Descriptor Index: %d\n", fd3);

    // 2. Redirect stdout (FD 1) to point to FD 3 using dup2()
    // Inside files_struct: fdt->fd[1] is updated to point to fdt->fd[3]'s struct file!
    printf("Redirecting stdout (FD 1) to output.txt...\n");
    fflush(stdout); // Flush buffer before redirecting

    int saved_stdout = dup(1); // Save original terminal stdout to FD 4
    dup2(fd3, 1);              // Replace FD 1 with FD 3

    // 3. This printf write will now go into output.txt instead of the terminal screen!
    printf("This text is written inside output.txt via redirected FD 1!\n");
    fflush(stdout);

    // 4. Restore original stdout
    dup2(saved_stdout, 1);
    printf("\nRestored stdout! Check 'ls -l /proc/%d/fd' to see descriptor mappings.\n", getpid());

    close(fd3);
    close(saved_stdout);
    return 0;
}
```

`dup2(fd3, 1)` does **not** copy bytes or create a new `struct file` — it simply makes `fdt->fd[1]` point at the **same `struct file`** that `fdt->fd[3]` points at (bumping its refcount). This is the entire mechanism behind shell redirection (`cmd > file.txt`) and pipelines.

Kernel step trace for `open()`:
```
1. User C Code calls: open("output.txt", O_RDWR)
2. System Call Entry: sys_openat()
3. Kernel resolves path via VFS (Virtual File System) and allocates struct file:
   file_obj = kmem_cache_alloc(file_cachep, GFP_KERNEL);
   file_obj->f_pos = 0;
   file_obj->f_path = <dentry for output.txt>;
4. Kernel finds smallest unused index in current task:
   fd_index = find_next_zero_bit(fdt->open_fds, fdt->max_fds, files->next_fd);
5. Register file object into process's table:
   rcu_assign_pointer(fdt->fd[fd_index], file_obj);
   set_bit(fd_index, fdt->open_fds); // Mark index as used
6. Return integer index (e.g. 3) to user program.
```

---

#### 5.6 "Everything Is a File": The `file_operations` Polymorphism Trick

The mechanism that lets a disk file, a network socket, and a pipe all be driven by the exact same `read(fd, buf, count)` call is a plain C **function-pointer vtable**, embedded directly in `struct file`:

```c
struct file_operations {
    ssize_t (*read) (struct file *, char *, size_t, loff_t *);
    ssize_t (*write) (struct file *, const char *, size_t, loff_t *);
    int     (*close) (struct file *);
};

struct file {
    off_t                  f_pos;
    struct file_operations *f_op;   // <--- polymorphic dispatch pointer
    void                   *private_data; // socket / inode / pipe_buffer
};
```

`read(fd, buf, 100)` always resolves, deep inside the kernel, to `file->f_op->read(file, buf, 100)` — the kernel's generic syscall handler has **zero knowledge** of what kind of resource `fd` actually refers to. This is exactly how a single `epoll`/`select` event loop can multiplex sockets, pipes, and regular files identically: it just calls the same generic operation and lets the vtable dispatch to the correct implementation.

```
task_struct -> files_struct -> fd_array[]
                     │
┌─────────────────────┼─────────────────────┐
▼                     ▼                     ▼
fd=3 (Disk File)  fd=4 (Network Socket)  fd=5 (Anonymous Pipe)
│                     │                     │
▼                     ▼                     ▼
struct file       struct file           struct file
f_op->ext4_read() f_op->sock_read()     f_op->pipe_read()
private_data->inode private_data->socket private_data->pipe_inode
│                     │                     │
▼                     ▼                     ▼
[Hard Drive/SSD]  [Network Card (NIC)]  [Ring Buffer in RAM]
```

The resource-specific state each `private_data` pointer refers to is a completely different struct depending on the resource type — the `file_operations` vtable is the only thing they have in common:

```c
struct socket {
    int           state;
    uint32_t      src_ip;   uint16_t src_port;
    uint32_t      dst_ip;   uint16_t dst_port;
    void         *rx_ring_buffer;
    void         *tx_ring_buffer;
};

struct pipe_buffer {
    char   data[4096];   // circular buffer in kernel RAM
    size_t head, tail;
};
```

Full pointer map across all three resource types coexisting in one process:

```
                                     task_struct
                                   ┌───────────┐
                                   │ pid: 1001 │
                                   │ *files ───┼──┐
                                   └───────────┘ │
                                                    │
                                                    ▼
                                             files_struct
                                   ┌───────────────────────────┐
                                   │ fd_array[3] ──┐              │  (disk file)
                                   │ fd_array[4] ──┼──────┐       │  (socket)
                                   │ fd_array[5] ──┼──┐     │     │  (pipe)
                                   └───────────────┼──┼───┼────┘
```

**Why this matters in practice**: any C++ event-driven server (Boost.Asio, libuv, a hand-rolled `epoll` loop) leans on exactly this polymorphism — it can register a listening socket fd, a pipe fd used for internal wakeups, and a regular file fd (for `inotify`) in the *same* `epoll_wait()` call, because the kernel treats them uniformly at the `struct file` level.

---

#### 5.7 Passing a File Descriptor Between Processes (SCM_RIGHTS)

**Common myth, stated and busted explicitly**: "the file descriptor integer is sent across the socket." This is **false** — an integer like `3` is meaningless outside the process that owns it (it's just an index into *that* process's `fd_array`). What actually crosses the Unix domain socket is a **kernel pointer** to the `struct file`, plus a bumped reference count.

**Sender (Process A)** — uses ancillary data (`SCM_RIGHTS`) via `sendmsg()`, not the main payload:
```c
struct msghdr msg = {0};
char control_buf[CMSG_SPACE(sizeof(int))];
msg.msg_control = control_buf;
msg.msg_controllen = sizeof(control_buf);

struct cmsghdr *cmsg = CMSG_FIRSTHDR(&msg);
cmsg->cmsg_level = SOL_SOCKET;
cmsg->cmsg_type = SCM_RIGHTS;
cmsg->cmsg_len   = CMSG_LEN(sizeof(int));

int fd_to_send = 3;
memcpy(CMSG_DATA(cmsg), &fd_to_send, sizeof(int));
sendmsg(unix_socket_fd, &msg, 0);
```

**Kernel side (`scm_fp_copy()` inside `sendmsg()`):**
```c
static int scm_fp_copy(struct cmsghdr *cmsg, struct scm_fp_list **fplp) {
    int fd;
    memcpy(&fd, CMSG_DATA(cmsg), sizeof(int));            // read '3'
    struct file *file_ptr = current->files->fd_array[fd]; // 1. lookup
    if (!file_ptr) return -EBADF;
    get_file(file_ptr);                                    // 2. f_count++
    struct scm_fp_list *fpl = allocate_scm_fp_list();
    fpl->fp[0] = file_ptr;                                  // 3. store POINTER, integer discarded!
    *fplp = fpl;
    return 0;
}
```

**Receiver side (`scm_detach_fds()` inside `recvmsg()`):**
```c
void scm_detach_fds(struct msghdr *msg, struct scm_fp_list *fpl) {
    struct task_struct *current_b = get_current_process();
    struct file *file_ptr = fpl->fp[0];
    int new_fd = -1;
    for (int i = 0; i < 1024; i++) {
        if (current_b->files->fd_array[i] == NULL) { new_fd = i; break; } // e.g. 7
    }
    current_b->files->fd_array[new_fd] = file_ptr;
    int *cmsg_fd_ptr = (int *)CMSG_DATA(cmsg);
    *cmsg_fd_ptr = new_fd;                                  // write NEW integer back
}
```

**The three invariants worth memorizing:**
1. The integer is **translated**: fd 3 in process A can — and usually will — become fd 7 (or whatever happens to be free) in process B.
2. `get_file()` bumps the reference count, so process A closing fd 3 immediately after sending does **not** free the underlying `struct file` while it's mid-flight to B.
3. A and B now genuinely **share** the same `struct file` — same `f_pos`, same `f_op`, same permissions — exactly as if one had `dup()`'d the other's descriptor, except across a process boundary that shares no memory at all. This is how privileged helper processes (e.g., a root-owned daemon opening a low port and handing the connected socket to an unprivileged worker) commonly drop privileges while keeping the resource.

---

#### 5.8 IPC Beyond File Descriptors: Pipes and Shared Memory

Because every process has an **isolated** virtual address space (Topic 4), processes cannot simply read each other's memory — they need the kernel to broker the exchange, or to deliberately alias physical memory into both address spaces.

**Anonymous pipes (`pipe()`):**
```c
int pipefds[2];
pipe(pipefds); // pipefds[0]=Read End, pipefds[1]=Write End
```
1. Kernel allocates a **64 KB circular ring buffer** in kernel RAM.
2. Creates an "anonymous" in-memory VFS inode (it doesn't exist on disk).
3. Two Open File Table entries are created: read end + write end, both pointing at the same ring buffer.

`ls | grep main` shell-pipeline mechanics: the shell calls `pipe()` once, then `fork()`s twice; each child `dup2()`s its stdout/stdin onto the pipe's fds, then `execve()`s its program. **Synchronization is automatic and free**: if the 64 KB buffer fills up, the writer (`ls`) is put to sleep by the kernel until the reader (`grep`) drains it; if the buffer is empty, the reader blocks on `read()` until data arrives. No explicit locking required in user code — the kernel's ring-buffer implementation handles it.

**Shared memory (`mmap`/`shm_open`) — zero-copy IPC:**

Pipes require **two copies** for every byte transferred: writer's user buffer → kernel ring buffer → reader's user buffer. Shared memory avoids **both** copies entirely: the kernel configures **both** processes' page tables so their (different!) virtual addresses point at the **exact same physical RAM frame**.

```
[ PROCESS 1 PAGE TABLE ]                    [ PROCESS 2 PAGE TABLE ]
0x7FFF0000 -> Frame X   ──┐            ┌──  0x55550000 -> Frame X
                            └──────────┘
                     [ PHYSICAL RAM: Frame X ]
```

- **Zero syscall overhead for data transfer** once mapped — a raw memory write on one side is instantly visible via a raw read on the other, with no kernel involvement at all.
- **Synchronization is NOT automatic** — because the kernel isn't mediating the transfer (it isn't even aware when a write happens), the processes **must** place POSIX mutexes/semaphores *inside the shared region itself* to avoid races. This is the direct trade-off for the zero-copy speed.

**IPC comparison table:**

| Mechanism | Kernel overhead | Speed | Use case |
|---|---|---|---|
| Pipes/FIFOs | Medium (copies through kernel buffer) | Fast | Pipeline (`cmd1 \| cmd2`), parent-child |
| Unix Domain Sockets | Medium (via socket layer) | Fast | Local IPC between unrelated processes; only mechanism that can pass fds |
| Shared Memory (mmap) | Zero after setup | Blazing fast (direct RAM) | High-throughput, low-latency exchange (e.g. market-data fan-out, ring buffers between a producer and consumer process) |

**Why this matters for low-latency systems**: a shared-memory ring buffer with a lock-free single-producer/single-consumer protocol (rather than a mutex) is the standard pattern for passing messages between processes on the same host with sub-microsecond latency — exactly because it skips both the data copy *and* the kernel round-trip that pipes and sockets both pay for on every message.

---

**End of Topic 5: VFS & I/O System**
