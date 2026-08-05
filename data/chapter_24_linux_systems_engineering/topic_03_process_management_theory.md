## TOPIC: Process Management - task_struct, Scheduling & the Process Lifecycle

### THEORY_SECTION: The Kernel's Process Control Block, Copy-on-Write, and the CFS Scheduler

Every running program on Linux — whether it's a single-threaded `hello.c` or a 500-thread trading engine — is represented inside the kernel by exactly one kind of object: `struct task_struct`. Linux does not have a separate "thread" object and a separate "process" object the way Windows does. There is only `task_struct` ("the task"), and whether two tasks *feel* like independent processes or like threads of the same process comes down entirely to which internal pointers they share versus which they own privately. This topic builds the full mental model: what `task_struct` actually contains, how `fork()`/`execve()`/`clone()` populate it, and how the CFS scheduler decides, moment to moment, which `task_struct` gets the CPU next.

---

#### 3.1 task_struct — The Process Control Block

`struct task_struct` (declared in `<linux/sched.h>`) is one of the largest structures in the kernel — commonly **4KB-8KB** depending on kernel config, with 100+ fields. Rather than being one monolithic blob, it acts as a **central hub with pointers out to specialized sub-structures**, each owning one concern:

```
                        ┌──────────────────────────────────────────┐
                        │           struct task_struct             │
                        ├──────────────────────────────────────────┤
                        │ volatile long state; /* Execution State */
                        │ pid_t pid;            /* Thread ID       */
                        │ pid_t tgid;           /* Process ID      */
                        │                                          │
                        │ struct mm_struct *mm; ───┐               │
                        │ struct files_struct *files; ──┐          │
                        │ struct cred *cred; ───────┐   │          │
                        │ struct sched_entity se; ──┼───┼──────┐   │
                        └───────────────────────────┼───┼──────┼───┘
                                                    │   │      │
            ┌───────────────────────────────────────┘   │      │
            ▼                                           ▼      ▼
  ┌───────────────────┐                       ┌───────────┐ ┌───────────────┐
  │ struct mm_struct │                        │ files_    │ │ struct cred   │
  ├───────────────────┤                       │ struct    │ ├───────────────┤
  │ pgd_t *pgd;       │                       ├───────────┤ │ uid_t uid;    │
  │ (Page Table Root) │                       │ struct    │ │ uid_t euid;   │
  │                   │                       │ file **fd;│ │ gid_t gid;    │
  │ unsigned long     │                       │ (File     │ └───────────────┘
  │ start_code,       │                       │ Descriptor│
  │ end_code,         │                       │ Table)    │
  │ start_stack;      │                       └───────────┘
  └───────────────────┘
```

**Six core functional areas** every `task_struct` owns or references:

1. **Execution State** (`volatile long state`) — where the task currently sits in its lifecycle.
2. **Memory Layout** (`struct mm_struct *mm`) — virtual memory map: page table root, VMA boundaries. Covered in depth in Topic 4 (Virtual Memory Management) of this chapter.
3. **Open File Descriptors** (`struct files_struct *files`) — maps integer FDs to kernel `struct file*`. Covered in depth in Topic 5 (VFS & I/O System).
4. **Credentials & Security** (`struct cred *cred`) — real/effective/saved UID/GID, POSIX capabilities.
5. **Scheduler Entity** (`struct sched_entity se`) — `vruntime` and the Red-Black tree node used by CFS.
6. **Process Hierarchy** — `real_parent`, `children`, `sibling` — the doubly-linked kernel lists that form the process tree.

##### Execution states in depth

| State | Meaning | Woken by |
|---|---|---|
| `TASK_RUNNING` (0) | Actually executing on a CPU, **or** sitting in a runqueue waiting for a CPU slot | N/A — already runnable |
| `TASK_INTERRUPTIBLE` | Sleeping/blocked on an event (keyboard input, network data, a timer) | The event **or** a signal (SIGKILL, SIGINT) |
| `TASK_UNINTERRUPTIBLE` | Deep sleep, almost always waiting on **direct disk hardware I/O** | **Only** the I/O completing — signals are ignored |
| `EXIT_ZOMBIE` | Process has finished executing, but its parent has not yet called `waitpid()` to collect its exit status | Parent reaping it via `wait()`/`waitpid()` |

This directly explains a classic production mystery: **why `kill -9` sometimes appears to do nothing.** A process stuck in `TASK_UNINTERRUPTIBLE` ("D state" in `ps`/`top` output) is waiting on hardware — a hung NFS mount, a failing disk — and the kernel has deliberately made this state immune to signal delivery, because interrupting a task mid-hardware-transaction could leave a device driver or filesystem in a corrupted state. `kill -9` queues `SIGKILL` in `task_struct->pending`, but delivery only happens the next time the task checks its signal queue — which, in `TASK_UNINTERRUPTIBLE`, is **only after the I/O finally completes or times out.** The process is not ignoring you; it is architecturally unreachable until the hardware responds.

A process that has called `exit()` becomes `EXIT_ZOMBIE`: the kernel has already freed its memory (`mm_struct`), file descriptors, and most other resources — but keeps the `task_struct` itself alive, holding just the exit status, so the parent can retrieve it. A parent that never calls `wait()`/`waitpid()` leaks zombie `task_struct`s (a well-known interview "what causes zombie processes" question) — they don't consume RAM or CPU, but they do consume a PID slot and the small `task_struct` allocation itself until reaped or until the parent dies (at which point `init`/PID 1 adopts and reaps them).

##### The `current` macro — "who is asking?"

Kernel code constantly needs to answer "which task called into me right now?" — for example, `sys_read()` needs `current->files->fd_array` to resolve the FD it was given. Linux does **not** do a lookup or search for this. On x86-64, the kernel keeps a pointer to the currently-running `task_struct` in a **per-CPU register/memory offset** (accessed via the GS segment register). Reading `current->pid` or `current->mm` costs essentially **0 extra cycles** — it's a direct per-CPU memory read, not a search through any list or table.

---

#### 3.2 Thread (TID) vs Process (PID/TGID) — the structural difference

There is no kernel-level distinction between a "thread" and a "process" — both are `task_struct`. What differs is which fields are shared:

```c
struct task_struct {
    pid_t pid;                 // Thread ID (UNIQUE per task_struct, always)
    pid_t tgid;                // Thread Group ID — this is what user space calls "the PID"!
    struct task_struct *real_parent;
    struct list_head children; // linked list of child task_structs
    struct list_head sibling;
};
```

Every thread — including the very first ("main") thread of a process — gets its **own unique `pid`** and its **own `task_struct`**. What makes a set of threads belong to "one process" from a user's point of view is that they all share the **same `tgid`**. `getpid()` in user space actually returns `tgid`, not `pid` — a deliberate naming collision that trips people up constantly. `gettid()` (Linux-specific) returns the true per-thread `pid`.

```
==========================================================================================
RESOURCE                     PROCESS (fork)                      THREAD (pthread_create)
==========================================================================================
task_struct                  Created NEW                         Created NEW (Unique PID)
Thread Group ID (TGID)       Gets a NEW ID                       Shares the SAME TGID as parent
Virtual Memory (mm_struct)   COPIED (Copy-on-Write)              SHARED (Same page tables & heap)
File Descriptors (files)     COPIED (New fd_array, shared file*) SHARED (Exact same fd_array)
Signal Handlers (sighand)    COPIED                              SHARED
==========================================================================================
```

Two threads, visualized: each has its *own* `task_struct` and its *own* saved registers, but their `*mm` and `*files` pointers point at the **exact same underlying structs**:

```
[ MAIN THREAD (PID 1001, TGID 1001) ]        [ WORKER THREAD (PID 1002, TGID 1001) ]
         task_struct                                   task_struct
        ┌───────────┐                                ┌───────────┐
        │ pid: 1001 │                                │ pid: 1002 │
        │ tgid:1001 │                                │ tgid:1001 │ ◄── Same Thread Group!
        │ *mm ──────┼──────┐                         │ *mm ──────┼──┐
        │ *files ───┼──┐   │                         │ *files ───┼──│
        └───────────┘ │    │                         └───────────┘ │ │
                       │   └───────────────┐                        │ │
                       ▼                   ▼                        ▼ ▼
                 files_struct          mm_struct                 (same objects!)
                (Shared fd_array)   (Shared Page Tables)
```

**Why threads communicate fast**: because `*mm` is shared, a write by Thread A to a global variable is instantly visible to Thread B on its very next read — no copy, no syscall, no IPC mechanism needed. **The danger of the same sharing**: `*files` is also shared, so Thread A calling `close(3)` closes file descriptor 3 for **every** thread in the process, including ones still using it — a classic multi-threaded-server bug class.

All of this is controlled at creation time by `clone()` flags — `pthread_create()` is, under the hood, a `clone()` call with `CLONE_VM | CLONE_FILES | CLONE_SIGHAND | ...` set, while plain `fork()` clears all of those, forcing a fresh (Copy-on-Write) `mm_struct` and a fresh (pointer-copied) `files_struct`.

**Scheduler-level consequence** (this matters for the CFS material in §3.7): the scheduler picks `task_struct`s, full stop — it has no separate concept of "process" at all. Migrating a **thread** to another core updates its saved registers but does **not** require reloading CR3 (its `mm_struct` is shared with wherever it's already running), whereas migrating a **single-threaded process** requires a full CR3 reload — this cost difference is why thread context switches are measured at roughly ~100-300ns and full process switches at ~1,000-3,000ns (the CR3 reload flushes the TLB; see Topic 1 of this chapter for the full register-save mechanics).

---

#### 3.3 Process Hierarchy — Parent, Children, and the `list_head` Pattern

```c
struct list_head {
    struct list_head *next, *prev;
};

struct task_struct {
    /* ... preceding fields ... */
    struct task_struct __rcu *real_parent; /* Real parent process (creator) */
    struct task_struct __rcu *parent;      /* Recipient of SIGCHLD (usually same as real_parent, unless ptraced) */

    struct list_head children;             /* Head of the doubly-linked list of child processes */
    struct list_head sibling;              /* Link node inside parent's 'children' list */

    struct task_struct *group_leader;      /* Pointer to thread group leader (PID == TGID) */
    struct list_head thread_group;         /* List of all threads sharing this process space */

    struct list_head tasks;                /* Link node inside the global kernel task list */
};
```

```
                        ┌───────────────────────────────┐
                        │      Parent task_struct        │
                        │           (PID: 100)           │
                        ├───────────────────────────────┤
                        │ children:                      │
                        │ next: ───┐     prev: ──────┐   │
                        └───────────┼───────────────┼───┘
                                     │               │
            ┌───────────────────────┘                └───────────────────────┐
            ▼                                                                ▼
┌───────────────────────────────┐                        ┌───────────────────────────────┐
│     Child 1 task_struct       │                        │     Child 2 task_struct       │
│          (PID: 101)           │                        │          (PID: 102)           │
├───────────────────────────────┤                        ├───────────────────────────────┤
│ parent: ───► Points to PID 100│                        │ parent: ───► Points to PID 100│
│ sibling:                      │                        │ sibling:                      │
│ next: ───► Points to Child 2 │                         │ next: ───► Points to Parent │
│ prev: ───► Points to Parent │                          │ prev: ───► Points to Child 1 │
└───────────────────────────────┘                        └───────────────────────────────┘
```

**The `list_head` embedding paradigm** — this is worth internalizing since it appears throughout the kernel, not just here: unlike a typical user-space linked list (`struct Node { void *data; struct Node *next; }`, where the list node *wraps* the data), the kernel **embeds** a plain `struct list_head` directly as a field *inside* the struct it's linking. To go from a `list_head` pointer back to the containing `task_struct`, the kernel uses the `container_of()` macro:

```
Address of task_struct  =  Address of list_head  −  Offset of list_head within task_struct
```

This lets one generic `list_head` implementation link *any* kernel struct without void-pointer casts or per-type list code.

**`real_parent` vs `parent` — a genuine, interview-relevant distinction**: normally identical — both point at whoever called `fork()`. They diverge specifically when a debugger attaches via `ptrace()` (e.g. `gdb attach <pid>` or `strace -p <pid>`): the debugger temporarily becomes `parent` so that it — not the original spawning shell — receives `SIGCHLD` and can intercept the tracee's signals, while `real_parent` continues to point at the true original creator throughout.

Every thread's `group_leader` field points directly at the `task_struct` of the process's original main thread (the one whose `pid == tgid`).

**User-space demonstration** — while direct `task_struct` access requires a Linux Kernel Module, you can observe the tree it builds via ordinary `fork()`:

```c
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/types.h>
#include <sys/wait.h>

int main() {
    pid_t parent_pid = getpid();
    printf("[Parent] Main Process PID: %d, PPID (My Parent): %d\n", parent_pid, getppid());

    // Create First Child
    pid_t child1 = fork();
    if (child1 == 0) {
        printf(" └── [Child 1] PID: %d | Parent PID: %d\n", getpid(), getppid());
        sleep(1);
        exit(0);
    }

    // Create Second Child (Sibling to Child 1)
    pid_t child2 = fork();
    if (child2 == 0) {
        printf(" └── [Child 2] PID: %d | Parent PID: %d (Sibling to %d)\n", getpid(), getppid(), child1);
        sleep(1);
        exit(0);
    }

    // Parent waits for both children (cleaning up zombie entries)
    wait(NULL);
    wait(NULL);

    printf("\n[Parent] Both children exited and were reaped.\n");
    return 0;
}
```

**Kernel-module-level traversal** (not user-space-callable — shown for completeness, since it's exactly what a kernel module debugging a hung process tree would do):

```c
#include <linux/sched/signal.h> // For for_each_process macro

/* 1. Iterating through ALL tasks in the system using struct list_head tasks */
struct task_struct *task;
for_each_process(task) {
    pr_info("Task Name: %s | PID: %d\n", task->comm, task->pid);
}

/* 2. Iterating through all children of 'current' task */
struct task_struct *child;
struct list_head *list;

list_for_each(list, &current->children) {
    child = list_entry(list, struct task_struct, sibling);
    pr_info("Child Task Name: %s | PID: %d\n", child->comm, child->pid);
}
```

---

#### 3.4 fork() and Copy-on-Write

`fork()` needs to give the child process what *looks like* a complete, independent copy of the parent's entire address space — potentially gigabytes. Actually copying that much RAM synchronously, on every `fork()`, would make `fork()` catastrophically slow. Linux avoids this entirely with **Copy-on-Write (CoW)**.

**Immediately after `fork()` returns** — parent and child share the *same physical pages*, and the kernel marks every one of those shared pages **read-only** in **both** page tables, even pages that were writable a moment ago in the parent:

```
[ PARENT (PID 100) PAGE TABLE ]                    [ CHILD (PID 101) PAGE TABLE ]
Page 1 (0x1000) -> RAM Frame A  (Read-Only)         Page 1 (0x1000) -> RAM Frame A (Read-Only)  <- SAME FRAME
Page 2 (0x2000) -> RAM Frame B  (Read-Only)         Page 2 (0x2000) -> RAM Frame B (Read-Only)  <- SAME FRAME
[ PHYSICAL RAM ] (Zero RAM copied!) Frame A/B ref-count = 2
```

`fork()` completes in **nanoseconds regardless of the parent's RAM size**, because only the (much smaller) **page table** is duplicated — not the physical memory it describes.

**The CoW trap, step by step, when either process writes to a shared page:**

```
Parent Process tries to write to Virtual Address 0x7FFF...
       │
       ▼
MMU checks Page Table Entry -> Sees Writable = 0 (COW Flagged)
       │
       ▼
PAGE FAULT TRIGGERED! (Kernel VMM steps in)
       │
       ▼
Kernel VMM realizes: "Ah, this is a shared COW page."
1. Allocates a brand new 4 KB physical RAM frame.
2. Copies the data from the old frame to the new frame.
3. Updates the parent's PTE to point to the new frame and sets Writable = 1.
4. Leaves the child pointing to the old frame with Writable = 0 (or vice versa).
       │
       ▼
CPU retries instruction -> Write succeeds safely!
```

Net effect: **`fork()` never copies a single byte of data until an actual write occurs on one side.** Read-only workloads after `fork()` (a very common pattern — e.g. pre-fork worker pools that inherit a large read-only cache) pay essentially zero extra memory cost.

**Why this can spike memory or trigger the OOM Killer**: if the parent (or child) writes to memory *rapidly* after `fork()`, CoW pages duplicate en masse, and total memory usage can approach 2x the original working set. A textbook real-world trigger: in CPython, **garbage collection touches the reference count of nearly every live object** — after `fork()`ing worker processes (a common pattern in Gunicorn/uWSGI), a GC cycle in any worker forces widespread write-faults across almost the entire heap it inherited, silently doubling that worker's resident memory and, at scale, triggering the **OOM Killer**.

##### execve() after fork() — replacing the program image

```c
pid_t pid = fork();
if (pid == 0) { execve("/bin/ls", NULL, NULL); }
```

1. **Wipes** the child's virtual memory — discards the page-table entries for the image it just inherited from the parent.
2. **Decrements ref-counts** on the formerly-shared physical frames (the parent's frames simply drop back to sole ownership; nothing needs to happen on the parent's side).
3. **Parses the new ELF binary** (`/bin/ls`) from disk — reads its header to find the entry point and segment layout.
4. **Sets up a fresh virtual layout** (Text/Data/Heap/Stack) for the new program.
5. **Marks all new pages NOT PRESENT** (lazy load) — nothing is read from disk yet; ordinary demand paging (Topic 4 of this chapter) brings code in as it's executed, exactly like any other program's cold start.

**Why CoW mattered so much for the historical `fork()`+`execve()` combo**: before CoW existed, `fork()` copied *all* physical RAM immediately. If — as is extremely common — the very next call was `execve()`, that entire freshly-copied address space was immediately thrown away and replaced. CoW means the common `fork()`+`execve()` pattern (used by every shell, every `system()` call, every process-spawning library) never actually duplicates memory that's about to be discarded anyway.

**Full worked example — process startup trace for a minimal program**, tying `fork()` → `execve()` → first instruction together end-to-end:

```c
int global_var = 100; // Data Segment
int main() {
    int local_var = 5; // Stack
    printf("Hello World! local = %d\n", local_var);
    return 0;
}
```

1. Shell `fork()`s; the child calls `execve("./hello")`.
2. Kernel reads the ELF header on disk: finds the entry point address (e.g. `0x00401000`) and the segment-size metadata (`.text`, `.data` sizes).
3. Kernel allocates a **new** `mm_struct` and a **new** page table, writes its physical address into `task_struct->mm->pgd`, and loads that address into **CR3**.
4. Kernel reserves the Stack region (sets RSP to its top) and registers `.text`/`.data` VMAs (no physical pages touched yet — see Topic 4 for the full VMA mechanism).
5. Kernel sets CR3/RSP/RIP and executes `iret` — the CPU drops from Ring 0 to Ring 3 and begins executing at RIP. The very first instruction fetch immediately triggers a (minor) page fault, since nothing is mapped yet — this is the normal, expected cold-start cost of every program launch.

Even an **empty `int main(){ return 0; }`** still receives this full treatment — a Stack top near `0x7FFFFFFE0000`, a Heap start near `0x0200 0000`, and `.text` populated from the ELF file — nothing is allocated *physically* until the first instruction fetch actually faults it in.

---

#### 3.5 Credentials & Security — `struct cred`

```c
struct cred {
    atomic_t usage;                        /* Reference count for this credentials object */

    kuid_t uid;                            /* Real User ID (Who launched the process) */
    kgid_t gid;                            /* Real Group ID */

    kuid_t suid;                           /* Saved User ID (Pre-setuid user identity) */
    kgid_t sgid;                           /* Saved Group ID */

    kuid_t euid;                           /* Effective User ID (Used for current permission checks) */
    kgid_t egid;                           /* Effective Group ID */

    kuid_t fsuid;                          /* File System User ID (Used specifically for VFS access checks) */
    kgid_t fsgid;                          /* File System Group ID */

    kernel_cap_t cap_inheritable;          /* POSIX Capabilities inheritability mask */
    kernel_cap_t cap_permitted;            /* POSIX Capabilities maximum allowed mask */
    kernel_cap_t cap_effective;            /* POSIX Capabilities active/enabled mask */

    struct user_struct *user;              /* Pointer to per-user resource limits (NPROC, RLIMIT) */
    struct user_namespace *user_ns;        /* User namespace mapping rules */
};
```

```
┌────────────────────────────────────────────────────────────────────────┐
│                              struct cred                               │
├────────────────────────────────────────────────────────────────────────┤
│ usage: 2                                                               │
│ uid:   1000 (user) ───► Identifies who started the process             │
│ euid:      0 (root) ───► USED FOR PERMISSION CHECKS (Setuid Binary)    │
│ suid: 1000 (user) ───► Allows dropping/restoring root privileges       │
│ fsuid:     0 (root) ───► Used by filesystem VFS layer checks           │
│                                                                        │
│ cap_effective: 0x0000000000002000 (e.g., CAP_NET_BIND_SERVICE active) │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ PERMISSION CHECK ON SYS_OPEN
                                    ▼
                        ┌──────────────────────┐
                        │ VFS Inode Security │
                        │   /etc/shadow        │
                        │   Owner: 0 (root)    │
                        │   Mode: 0600         │
                        └───────────┬──────────┘
                                    │
         Is cred->euid == 0 OR cred->fsuid == 0?
                 ├── YES ──► Access GRANTED
                 └── NO ──► Access DENIED (-EACCES)
```

**Real vs Effective vs Saved UID**:
- **Real UID** (`uid`) — the account that actually launched the program; never changes for the process's lifetime under normal operation.
- **Effective UID** (`euid`) — the identity the kernel checks permissions **against**. The classic example: `/usr/bin/passwd` is a "setuid root" binary — any user (`uid=1000`) can run it, but while it runs `euid=0`, so it's permitted to write `/etc/shadow`.
- **Saved UID** (`suid`) — a backup of `euid` taken *before* a privileged process temporarily drops privileges, letting it safely toggle back to privileged later without re-authenticating.

**POSIX Capabilities** — fine-grained slices of what used to be all-or-nothing root power: `CAP_NET_BIND_SERVICE` (bind to ports below 1024 without being full root), `CAP_SYS_ADMIN` (mount filesystems, configure namespaces — the single broadest capability, effectively "root-lite"), `CAP_SYS_PTRACE` (attach a debugger to other processes). This is the exact mechanism container runtimes use to grant a containerized process *some* elevated abilities without full root (see Topic 10 of this chapter, Docker & Container Internals).

**Copy-on-write creds**: `struct cred` is treated as **immutable** once published — a task cannot edit `current->cred->euid` in place. Instead, privilege-changing syscalls (`seteuid`, `setuid`, `execve` of a setuid binary) do: `new = prepare_creds()` (clone the current cred), mutate the *copy*, then atomically publish it via `commit_creds(new)`. This avoids any window where another CPU core could observe a half-updated credentials object.

**Demo program:**
```c
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/types.h>

void print_uids(const char *label) {
    uid_t ruid, euid, suid;
    getresuid(&ruid, &euid, &suid);
    printf("[%s]\n", label);
    printf(" Real UID       (cred->uid) : %d\n", ruid);
    printf(" Effective UID (cred->euid) : %d\n", euid);
    printf(" Saved UID      (cred->suid) : %d\n\n", suid);
}

int main() {
    print_uids("Initial Execution Credentials");

    if (geteuid() == 0) {
        printf("Dropping effective privileges to UID 1000...\n");
        if (seteuid(1000) == 0) {
            print_uids("After Drop (seteuid(1000))");
        }
        printf("Restoring effective privileges back to root...\n");
        if (seteuid(0) == 0) {
            print_uids("After Restore (seteuid(0))");
        }
    } else {
        printf("Run with 'sudo' or as root to see setuid switching in action.\n");
    }
    return 0;
}
```

**Kernel step trace for `seteuid(1000)`:**
```
1. User C Code calls: seteuid(1000)
2. System Call Entry: sys_seteuid(1000)
3. Kernel prepares a new credentials copy (Copy-On-Write):
   new_cred = prepare_creds();
4. Check permissions: Is current->cred->euid == 0 OR new_uid == current->cred->uid?
   ├── YES ──> Continue
   └── NO ──> Return -EPERM
5. Update effective user ID inside copy:
   new_cred->euid = make_kuid(current_user_ns(), 1000);
6. Commit new credentials to current task_struct:
   commit_creds(new_cred); // Atomic reference update current->cred = new_cred
```

---

#### 3.6 The CPU Scheduler — `struct sched_entity` and CFS

CFS ("Completely Fair Scheduler") is the default Linux scheduling policy for ordinary tasks. Its central idea: every runnable task accumulates **`vruntime`** (virtual runtime — CPU time consumed, weighted by priority), and the scheduler **always runs whichever runnable task has the smallest `vruntime`**, i.e. whichever task has received the *least* CPU time so far relative to its priority.

```c
struct sched_entity {
    struct load_weight load;         /* Task weight derived from nice value */
    struct rb_node     run_node;     /* Node inside the CPU's CFS Red-Black tree */
    struct list_head   group_node;   /* Link for cgroup task scheduling */

    unsigned int        on_rq;                /* 1 if task is currently on the runqueue */

    u64                  exec_start;           /* Timestamp (ns) when task started its current run */
    u64                  sum_exec_runtime;     /* Total cumulative physical execution time (ns) */
    u64                  vruntime;             /* Weighted virtual runtime (Primary CFS sorting key) */
    u64                  prev_sum_exec_runtime;

    struct sched_avg    avg;                   /* Load tracking (PELT - Per-Entity Load Tracking) */
};
```

```
                                 Per-CPU CFS Runqueue (cfs_rq)
                                  ┌────────────────────────┐
                                  │   rb_leftmost Pointer │
                                  └───────────┬────────────┘
                                              │ Points to SMALLEST vruntime
                                              ▼
                                  ┌────────────────────────┐
                                  │   task_struct (PID 2) │
                                  │   vruntime = 105 ms    │
                                  └───────────┬────────────┘
                                              │
                        ┌─────────────────────┴─────────────────────┐
                        ▼                                           ▼
           ┌───────────────────────┐                    ┌───────────────────────┐
           │ task_struct (PID 1) │                      │ task_struct (PID 3) │
           │ vruntime = 98 ms       │                   │ vruntime = 120 ms     │
           └───────────────────────┘                    └───────────────────────┘
                      ▲
                      │
       CFS ALWAYS CHOOSES THIS TASK NEXT!
       (Has consumed the LEAST virtual CPU time)
```

**The `vruntime` formula and nice-value weighting**:
```
vruntime_new = vruntime_old + (Δt × NICE_0_LOAD / task_weight)
```
- Nice **0** (default, weight **1024**): 1ms of real execution accumulates exactly 1ms of vruntime.
- Nice **-5** (higher priority → higher weight): the same real execution accumulates vruntime **more slowly** — the task stays near the front of the tree and gets scheduled more often.
- Nice **+5** (lower priority → lower weight): vruntime accumulates **faster** — the task is pushed toward the back and scheduled less often.

**Red-Black tree placement**: all runnable-but-not-currently-running tasks on a CPU's runqueue (`cfs_rq`) are ordered left-to-right by `vruntime`. The kernel caches a direct pointer to the leftmost node, `rb_leftmost` — so **picking** the next task to run is **O(1)** (just follow the cached pointer), while **re-inserting** a task after it finishes its slice is **O(log N)** (a normal Red-Black tree insert).

**PELT (Per-Entity Load Tracking, `sched_avg`)**: tracks, per task, how much it actually runs versus sleeps over a decaying time window — distinguishing a CPU-bound task (e.g. video encoding, almost always runnable) from an I/O-bound one (e.g. a text editor, mostly sleeping waiting on keystrokes). This feeds two other subsystems: CPU frequency scaling (the `schedutil` governor ramps clock speed up for high-PELT tasks) and multi-core load balancing (the scheduler prefers to spread high-PELT tasks across cores rather than stack them on one).

**Demo program (nice/priority):**
```c
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/resource.h>
#include <errno.h>

int main() {
    printf("PID: %d\n", getpid());
    int priority = getpriority(PRIO_PROCESS, 0);
    printf("Initial Nice Value (se.load weight = 1024): %d\n\n", priority);

    printf("Attempting to lower nice value to -5 (Higher CPU Priority)...\n");
    if (setpriority(PRIO_PROCESS, 0, -5) == 0) {
        priority = getpriority(PRIO_PROCESS, 0);
        printf("New Nice Value: %d\n", priority);
        printf("Kernel will now accumulate 'vruntime' SLOWER for this process.\n");
    } else {
        perror("setpriority failed (Run with sudo to set negative nice values)");
    }
    return 0;
}
```

**Kernel step trace for a scheduler tick** (fires on every hardware timer interrupt, typically every 1-4ms):
```
1. Hardware Timer Interrupt fires on CPU core (e.g., every 1ms - 4ms)
2. Kernel executes scheduler_tick()
3. Update current task execution stats:
   delta_exec = now - curr->se.exec_start;
   curr->se.sum_exec_runtime += delta_exec;
   curr->se.vruntime += calc_delta_fair(delta_exec, curr);
4. Check if current task exhausted its timeslice:
   if (curr->se.vruntime > cfs_rq->rb_leftmost->vruntime + min_granularity)
       set_tsk_need_resched(curr); // Mark task for context switch
5. On return to user space:
   schedule() is invoked -> curr task re-inserted into Red-Black tree by vruntime,
   and cfs_rq->rb_leftmost task is context-switched onto the CPU.
```

**What actually moves a task from `TASK_RUNNING` to `TASK_INTERRUPTIBLE`**: this is a **voluntary** transition, always initiated by the task itself calling something that blocks — `read()` on an empty pipe/socket, `sleep()`, waiting to acquire a contended futex. The kernel: (1) sets `current->state = TASK_INTERRUPTIBLE`, (2) removes the task from the CFS runqueue (`on_rq = 0`), (3) registers it on the relevant **wait queue** (the pipe's, the socket's, the timer's), (4) calls `schedule()` to hand the CPU to the next `rb_leftmost` task. When the awaited event occurs, the kernel's wake-up path sets `state = TASK_RUNNING` and re-inserts the task's `sched_entity` back into `cfs_rq` — but the task does not necessarily run *immediately*; it merely becomes eligible again, competing on `vruntime` like everyone else.

---

#### 3.7 Putting It All Together

| Component | Kernel Structure | Primary Purpose |
|---|---|---|
| 1. Memory Management | `struct mm_struct` | Page tables, virtual memory regions (`vm_area_struct`), text/data/heap/stack limits |
| 2. File Descriptor Table | `struct files_struct` | Index array mapping numerical FDs (0, 1, 2...) to open file objects (`struct file*`) |
| 3. Security & Credentials | `struct cred` | Real/Effective/Saved UIDs & GIDs, POSIX Capabilities, and user namespaces |
| 4. Scheduling Entity | `struct sched_entity` | Virtual runtime (vruntime), priority weights, and Red-Black tree nodes for CFS |
| 5. Hierarchy & Links | `struct list_head` | Parent, sibling, child list nodes, and thread group links |

Every one of `fork()`, `clone()`, and `execve()` is really just a specific recipe of **which of these five sub-structures gets duplicated (new object, own data), shared (pointer copied, same object), or replaced (entirely new object, old one discarded)** — the process-vs-thread table in §3.2 and the CoW mechanics in §3.4 are two views of that exact same underlying machinery.

**End of Topic 3: Process Management**
