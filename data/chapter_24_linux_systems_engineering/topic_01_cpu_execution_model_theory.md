## TOPIC: CPU Execution Model - Registers, Privilege Rings, Interrupts & Context Switching

### THEORY_SECTION: How the CPU Actually Runs Your Code and Switches Between Tasks

Every line of C++/Python you write eventually becomes a sequence of instructions the CPU fetches one at a time. This topic answers the question underneath all of Linux systems programming: **where does the CPU keep track of "what to run next," "whose memory am I in," and "how do I safely hand control to the kernel and back?"** Three registers (RIP, RSP, CR3), one hardware privilege mechanism (Rings), one instruction (`syscall`), and one interrupt table (the IDT) are the entire answer.

---

#### 1.1 The Core Registers: RIP, RSP, and CR3

A modern x86-64 CPU core has dozens of registers, but for understanding *execution flow and address spaces*, only three matter at first:

| Register | Full Name | Holds | Analogy |
|---|---|---|---|
| **RIP** | Instruction Pointer | The virtual address of the **next instruction** to execute | A bookmark in the currently open book |
| **RSP** | Stack Pointer | The virtual address of the **top of the current stack frame** | The current page of your notepad |
| **CR3** | Control Register 3 | The **physical address** of the root of the currently active process's page table (the PGD — Page Global Directory) | Which library card catalog you're currently allowed to search |

**Common Pitfall — CR3 is a pointer, not a container.** CR3 is only 8 bytes. It does **not** hold the page table itself — a page table for a large process can be megabytes, spread across a multi-level tree in RAM. CR3 holds the **physical address of the root node** of that tree. The MMU performs a **page table walk** starting from that address every time it needs a translation the TLB doesn't already have cached.

```
CPU Register File
┌─────────────────────────────────────────────────────────┐
│ RIP = 0x00401234   -> "Execute the instruction here next"│
│ RSP = 0x7FFFFFFFDFE8 -> "Top of my current stack frame"  │
│ CR3 = 0x00111000   -> "Physical address of MY page table root" │
└─────────────────────────────────────────────────────────┘
```

Every single CPU core has its **own private copy** of RIP, RSP, and CR3. On a 4-core machine, 4 different processes can be "the currently running thing" simultaneously, each with a completely different RIP/RSP/CR3 loaded into its own core's registers — this is what true hardware parallelism looks like at the register level.

**Why both CR3 (hardware) and `task_struct->mm->pgd` (software) store the same information**: CR3 is what the physical MMU silicon reads on *every single memory access* — it can only hold **one** process's table address at a time (whichever process is actually running on that core right now). `task_struct->mm->pgd` is where the *other* 99 sleeping/idle processes' page-table locations are durably parked in RAM, so the kernel can reload CR3 with the correct value the instant it context-switches to them — a single `mov cr3, rax` instruction.

---

#### 1.2 Ring 3 vs Ring 0: The Privilege Boundary

x86 CPUs implement 4 hardware privilege levels ("rings"), but Linux only uses two of them:

```
           ┌──────────────────────────────────────────────────┐
           │ RING 3: User Mode (Untrusted / Restricted)       │
           │ • Your Application Code (C++, Python, Node.js)   │
           │ • CANNOT execute privileged instructions          │
           │ • CANNOT directly touch physical RAM/disk/NIC     │
           └────────────────────────┬─────────────────────────┘
                                    │
                            HARDWARE BOUNDARY (syscall instruction)
                                    │
           ┌────────────────────────▼─────────────────────────┐
           │ RING 0: Kernel Mode (Trusted / Unrestricted)     │
           │ • The Linux kernel & hardware drivers            │
           │ • Full hardware access (RAM, disks, NIC)         │
           │ • Can execute ANY CPU instruction                │
           └──────────────────────────────────────────────────┘
```

**The mechanism, precisely**: the Current Privilege Level (CPL) — a 2-bit value — lives inside the low bits of the **CS (Code Segment) register**. Before executing *any* privileged instruction (e.g. `mov cr3, rax`, disabling interrupts, reading a hardware I/O port), the CPU silicon checks CPL. If CPL=3 (user mode) and the instruction requires CPL=0, the CPU **refuses to execute it** and raises a **General Protection Fault (#GP)** — an exception, handled in Ring 0, that typically ends in the kernel sending `SIGSEGV`/`SIGILL` to the offending process.

**Common Pitfall — who actually stops a Ring-3 process from touching hardware?** It is **not** the operating system watching over your shoulder. The **physical CPU silicon itself** refuses to execute the instruction, *before* the kernel is even aware anything happened. Only *after* the hardware raises the #GP exception does a kernel exception handler run and decide what to do (usually: kill the process). This "hardware enforces, kernel merely responds" framing is the correct mental model — user-space isolation is a hardware guarantee, not a software promise.

**Analogy**: Ring 3 is a customer standing in a bank lobby; Ring 0 is the vault. The customer physically cannot walk into the vault — they hand a request slip (the syscall number, in a register) to a teller (the kernel), who goes and does the privileged work on the customer's behalf, then returns with a result.

---

#### 1.3 The `syscall` / `sysret` Mechanism

When user-space code needs the kernel to do something privileged (read a file, allocate memory, create a socket), it cannot just call a kernel function directly — Ring 3 code physically cannot jump into Ring 0. Instead it executes a special CPU instruction: `syscall`.

```
  USER SPACE (Ring 3)                                   KERNEL SPACE (Ring 0)
┌───────────────────────┐                             ┌────────────────────────┐
│ App calls read(fd...) │                             │ System Call Handler    │
│                       │                             │ (sys_read in kernel)   │
│ 1. Put System Call ID │                             │                        │
│     (e.g., 0) in RAX  │                             │ 4. Kernel reads RAX (0)│
│ 2. Execute SYSCALL ───┼─► CPU Hardware Magic ──────►│ 5. Executes sys_read() │
│                       │   • Changes Ring 3 -> 0     │ 6. Writes result to RAX│
│                       │   • Swaps RSP to Kernel Stk │                        │
│ 7. Continues in App! │◄── Executed SYSRET ─────────┼─ 6. Returns control     │
└───────────────────────┘                             └────────────────────────┘
```

**Step-by-step (System V x86-64 ABI convention):**
1. User code loads the syscall number into **RAX** (e.g. `read` = 0, `write` = 1, `open` = 2), and the arguments into **RDI, RSI, RDX** (first three args — the same registers a normal C function call uses for its first three arguments).
2. The `syscall` instruction executes. In one atomic hardware step:
   - CPL flips from 3 → 0.
   - RSP is swapped from the user stack pointer to that thread's dedicated **kernel stack** pointer (stored in `task_struct->thread.sp0`).
   - RIP jumps to a **fixed kernel entry point**, `entry_SYSCALL_64`, whose address was registered at boot via a Model-Specific Register (the `LSTAR` MSR) — user code cannot redirect this jump target.
3. The kernel's entry code reads RAX, dispatches through the syscall table to `sys_read()`, and executes it with full hardware privileges.
4. The kernel writes the return value into RAX.
5. The `sysret` instruction executes: CPL flips 0 → 3, RSP is restored to the user stack, RIP resumes execution at the instruction right after the original `syscall`.

The application never "knows" it left Ring 3 — from its point of view, `read()` was just a function call that happened to take a little longer.

---

#### 1.4 Hardware Interrupts vs Software Exceptions

Two very different mechanisms can force the CPU to abandon its current instruction stream and jump into the kernel. Confusing them is a very common mistake:

| | Hardware Interrupt | Software Exception |
|---|---|---|
| **Trigger** | External event (keypress, NIC packet, timer tick) | Caused directly by the instruction currently executing |
| **Timing** | **Asynchronous** — can happen at any instruction boundary, unrelated to what code is running | **Synchronous** — happens as a direct, deterministic consequence of one specific instruction (divide-by-zero, page fault, `syscall`/legacy `int 0x80`) |
| **Example** | Keyboard IRQ, NIC RX IRQ, timer tick (scheduler tick) | `#DE` (divide-by-zero), `#PF` (page fault), `#GP` (protection fault) |

**Worked example — how does an infinite `while(1) {}` loop still get interrupted by a keypress?** This is a genuinely important mental model, because it is easy to assume "the loop never checks for anything, so how could it ever stop":

```
1. You press 'A' on the Keyboard.
                          │
                          ▼
2. Keyboard controller sends an Electrical Voltage Signal along a physical wire on the motherboard.
                          │
                          ▼
3. Signal arrives at the LAPIC (Local Advanced Programmable Interrupt Controller) chip on the CPU.
                          │
                          ▼
4. Physical CPU core finishes its CURRENT single instruction in the infinite loop.
                          │
                          ▼
5. BEFORE fetching the next instruction, the CPU checks its interrupt pin. IT SEES THE SIGNAL!
                          │
                          ▼
6. CPU pauses your infinite loop, saves your RIP register, and jumps into Kernel Interrupt Handler!
```

The key insight: this check happens in **physical silicon, between every single instruction fetch**. Your code gets no say in the matter — it is not "polling" for interrupts, the CPU's fetch-decode-execute cycle itself has a hard-wired interrupt-check step baked in before every instruction fetch.

---

#### 1.5 The IDT (Interrupt Descriptor Table)

How does the CPU know *where in kernel RAM* to jump for a given event (keyboard vs divide-by-zero vs page fault)?

```
               PHYSICAL CPU CORE                                KERNEL RAM (IDT Table)
 ┌──────────────────────────────────────────┐          ┌──────────────────────────────────────┐
 │ Interrupt Signal Arrives!                │          │ Vector 0: Divide-by-Zero Handler     │
 │                                          │          │ Vector 1: Debug Exception            │
 │ CPU looks at register IDTR to find table ┼─────────►│ ...                                  │
 │                                          │          │ Vector 14: Page Fault Handler        │
 │                                          │          │ Vector 33: Keyboard Interrupt Handler│
 └──────────────────────────────────────────┘          └──────────────────────────────────────┘
```

- The **IDT** is a table built by the kernel at boot time, living in kernel RAM, mapping a **Vector Number** (0-255) to the address of the handler function for that event.
- The **IDTR** register holds the physical address and size of this table.
- Each type of event has a fixed vector number: `0` = Divide-by-Zero, `1` = Debug, `14` = Page Fault, `33` = a typical keyboard IRQ line (exact mapping is platform-configured via the LAPIC/IOAPIC).
- When an interrupt/exception fires, the CPU reads IDTR, indexes into the table by vector number, and sets RIP to that handler's address — all in hardware, before any kernel C code runs.

**Interrupt masking**: the kernel can temporarily disable (mask) most interrupts with the `cli` (clear interrupt flag) instruction while running a short critical section, to guarantee it won't be preempted mid-update of some shared kernel data structure. However, a **Non-Maskable Interrupt (NMI)** — reserved for catastrophic hardware failures (e.g. uncorrectable memory errors) — can still fire even through `cli`, by design.

---

#### 1.6 Context Switching Mechanics

A context switch is the kernel saving everything about the currently-running task and loading everything about a different task, so the CPU can resume that other task exactly where it left off. This is the mechanism that makes "multitasking" on a machine with fewer cores than runnable tasks possible at all.

**The two-stage register save:**

```
  PROCESS A (User Mode)
           │
           │ Timer Interrupt Fires!
           ▼
┌─────────────────────────────────────────────────────────┐
│ STEP 1: CPU Hardware Auto-Save (5 Core Registers)        │
│ The CPU silicon automatically pushes 5 registers onto    │
│ Process A's Kernel Stack:                               │
│   • SS      (Stack Segment)                             │
│   • RSP     (User Stack Pointer)                        │
│   • RFLAGS (CPU Flags / status)                         │
│   • CS      (Code Segment)                              │
│   • RIP     (User Instruction Pointer)                  │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│ STEP 2: Linux Kernel Software Save (Assembly Code)       │
│ The kernel's context-switch assembly routine            │
│ (`__switch_to_asm`) manually executes PUSH instructions │
│ to save the remaining General-Purpose Registers:        │
│   • RAX, RBX, RCX, RDX, RSI, RDI, RBP                   │
│   • R8, R9, R10, R11, R12, R13, R14, R15                │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
              Saved safely in Process A's Kernel Stack!
```

Every thread has its own dedicated **kernel stack** (typically 16 KB), separate from its user-space stack. `task_struct` does **not** store raw register values inline — it holds `task_struct->thread.sp`, a pointer to the top of that thread's kernel stack, where the pushed registers physically live:

```
  Process A's task_struct               Process A's Kernel Stack (RAM)
┌─────────────────────────┐            ┌──────────────────────────────┐
│ PID: 1042               │            │ Saved R15, R14, ... R8        │
│ mm: 0x00400000          │            │ Saved RDI, RSI, RBP, RAX...  │
│ files: ...              │            │ Saved RIP (User Return Addr) │
│ thread.sp ──────────────┼───────────►│ Saved RSP (User Stack Addr) │ ◄── Top of Stack
└─────────────────────────┘            └──────────────────────────────┘
```

**The kernel's `context_switch()` function does exactly two things:**

```c
static inline struct task_struct *
context_switch(struct rq *rq, struct task_struct *prev, struct task_struct *next) {
      switch_mm(prev->active_mm, next->mm, next);   // STEP 1: address space
      switch_to(prev, next, prev);                   // STEP 2: registers/kernel stack
}
```

- **`switch_mm()`**: writes the *next* task's page directory physical address into CR3. This is the instant the running process's entire address space changes. **Cost**: reloading CR3 invalidates all non-global TLB entries — every future memory access briefly pays the full page-table-walk cost again until the TLB warms back up. **Critical optimization**: if `prev->mm == next->mm` (switching between two *threads of the same process*), `switch_mm()` is **skipped entirely** — CR3 and the TLB are left completely untouched, because both threads already share the exact same page table.
- **`switch_to()`**: saves the outgoing task's GPRs/RIP/RSP/floating-point state into its kernel stack/`task_struct`, then loads the incoming task's previously-saved values into the hardware registers.

**Full end-to-end Process A → Process B diagram:**

```
================================================================================
 PHYSICAL RAM                                CPU HARDWARE REGISTERS
================================================================================

 [ Process A Kernel Stack ]                   [ Active CPU Registers ]
 (Physical Addr: 0x88000)                     ┌──────────────────────────┐
 ┌──────────────────────────┐                 │ CR3 = 0x111000           │ (Points to Proc A Page Table)
 │ [Hardware Frame]         │                 │ RIP = 0x0040112D (User) │
 │ • SS                     │                 │ RSP = 0x7FFFFFFFDFE8     │ (User Stack)
 │ • RSP (0x7FFFFFFFDFE8) │                   │ RAX, RBX, R15, etc.      │
 │ • RFLAGS                 │                 └──────────────────────────┘
 │ • CS                     │                              │
 │ • RIP (0x0040112D)       │                              │ Timer Interrupt
 ├──────────────────────────┤                              │ Fires!
 │ [Software Frame]         │                              ▼
 │ • RAX, RBX, RCX, RDX... │                  1. CPU Auto-Pushes Hardware Frame
 │ • RDI, RSI, RBP...       │                     onto Process A Kernel Stack.
 │ • R8 - R15               │                 2. Kernel `PUSH`es General-Purpose
 └──────────────────────────┘                     Registers onto Kernel Stack.
               ▲                                  3. Kernel saves Kernel Stack Top
               │                                     into `task_struct_A->thread.sp`.
               │
 ┌─────────────┴────────────┐
 │ task_struct (Process A) │
 │ • PID = 101              │
 │ • mm->pgd = 0x111000     │ (Proc A Page Table Base)
 │ • thread.sp = 0x88000 ──┼─► [Points to top of Process A Kernel Stack]
 └──────────────────────────┘

================================================================================
 CONTEXT SWITCH IN PROGRESS: Kernel Switches execution to Process B
================================================================================

 ┌──────────────────────────┐                 [ Active CPU Registers ]
 │ task_struct (Process B) │                  ┌──────────────────────────┐
 │ • PID = 202              │                 │ CR3 = 0x222000           │ ◄── Loaded from Proc B pgd
 │ • mm->pgd = 0x222000     │ ───────────────►│ RSP = 0x99000            │ ◄── Loaded from Proc B thread.sp
 │ • thread.sp = 0x99000 ──┼─┐                │ RIP = Kernel Switch Code│
 └──────────────────────────┘ │               └──────────────────────────┘
                              │                            │
                              │                            │ Kernel pops software frame,
                              ▼                            │ then `IRETQ` pops hardware frame...
 [ Process B Kernel Stack ]   │                            ▼
 (Physical Addr: 0x99000)     │               [ Active CPU Registers (Restored) ]
 ┌──────────────────────────┐ │               ┌──────────────────────────┐
 │ [Hardware Frame]         │ │               │ CR3 = 0x222000           │ (Proc B Memory Universe)
 │ • SS                     │ │               │ RIP = 0x004055A0 (User) │ (Proc B Instruction)
 │ • RSP (0x7FFFFFFF3000) │ │                 │ RSP = 0x7FFFFFFF3000     │ (Proc B User Stack)
 │ • RFLAGS                 │ │               │ RAX, RBX, R15, etc.      │ (Proc B Data)
 │ • CS                     │ │               └──────────────────────────┘
 │ • RIP (0x004055A0)       │ │                            │
 ├──────────────────────────┤ │                            ▼
 │ [Software Frame]         │ │               Process B resumes execution in User Space!
 │ • RAX, RBX, RCX, RDX... │ │
 │ • RDI, RSI, RBP...       │ │
 │ • R8 - R15               │ │
 └──────────────────────────┘ ◄┘
 (Top of Stack: 0x99000)
```

**Restoring a task**: the kernel sets the hardware RSP to `task_struct->thread.sp`, `POP`s the general-purpose registers R15 → RAX back out of the kernel stack, and finally executes `IRETQ`, which atomically pops RIP, CS, RFLAGS, RSP, and SS in one hardware instruction — the process resumes in Ring 3 as if it was never interrupted.

---

#### 1.7 Process Switch vs Thread Switch — Why Threads Are Cheaper

| Hardware Action | Thread Switch (same process) | Process Switch (different process) |
|---|---|---|
| Save/Restore CPU Registers (RIP, RSP, RAX-R15) | YES | YES |
| Switch Kernel Stack Pointer (`thread.sp`) | YES | YES |
| Update TLS Register (`FS_BASE`) | YES | YES |
| Reload CR3 Register (Page Table Base) | **NO** (threads share `mm->pgd`) | **YES** |
| TLB Cache Flushing | **NO** (virtual memory space remains valid) | **YES / Partial** |

**Why this matters**: skipping the CR3 reload means the TLB stays completely warm across a thread switch — no burst of expensive page-table walks for the incoming thread. This is the single biggest hardware reason "thread switches are cheap, process switches are expensive."

**3-scenario comparison** (a very useful mental model for interview questions of the shape "compare X vs Y"):

| Property | 2 Processes, Different Cores | 2 Processes, Same Core | 2 Threads (Same Process), Same Core |
|---|---|---|---|
| Execution | True parallelism | Time-sliced concurrency | Time-sliced concurrency |
| CPU CR3 Swap? | No (each core has its own CR3) | Yes | No (shares the same page table) |
| TLB Flushed? | No | Yes (non-global entries) | No |
| Registers Swapped? | No | Yes | Yes |
| L1/L2 Cache Impact | None | High (cold-cache misses) | Low (threads share address space/code) |
| Approx. Overhead | 0 ns | ~1,000-3,000 ns | ~100-300 ns |

The real cost of a *process-to-process* context switch on the same core isn't primarily the register-save mechanics (a handful of `PUSH`/`POP` instructions, tens of nanoseconds) — it's **cache coldness**. Task B's data was not what was recently touched, so Task B's first accesses on that core are mostly L1/L2 misses:

```
BEFORE SWITCH (Task A running on Core 0):
  L1 / L2 Cache on Core 0: [ Task A Data | Task A Data | Task A Data ]      <-- 100% Hot!

AFTER SWITCH (Task B loaded on Core 0):
  L1 / L2 Cache on Core 0: [ Task A Data | Task A Data | Task A Data ]
                             ▲
                             │ Task B tries to read data -> ALL L1/L2 MISSES!
```

**Why this matters in production**: latency-critical systems (HFT trading platforms, DPDK-based networking, database engines) explicitly use **CPU pinning / thread affinity** (`sched_setaffinity`) to lock a hot-path thread to one dedicated core, so the scheduler never involuntarily migrates it and never lets a competing task cool down its cache. Combined with real-time scheduling priorities, this can shrink tail latency dramatically compared to letting the default scheduler freely move threads around.

**What triggers a context switch:**
1. **Voluntary**: the thread blocks itself — waiting on I/O (`read()`, socket recv), a lock, or `sleep()`. It calls into the kernel and yields the CPU on its own.
2. **Involuntary**: the thread is still actively computing, but a hardware timer interrupt fires (typically every 1-10 ms) and the scheduler decides another task deserves the CPU now (time slice exhausted, or a higher-priority task became runnable).

---

#### 1.8 Lazy Register Saving: Vector Registers & Thread-Local Storage

Not every register set is saved eagerly on every switch — the kernel is deliberately lazy where it can afford to be:

- **GPRs, RSP, RIP, CR3 (if a process switch), FS/GS base** are saved on **every** context switch (~100-300 ns).
- **Vector/SIMD registers** (`YMM0-15` for AVX, `ZMM0-31` for AVX-512 — up to **2,752 bytes** to save/restore for full AVX-512 state) are saved **lazily** — the kernel only bothers if the *incoming* thread actually executes a vector instruction during its timeslice. This is a genuinely important optimization: most threads never touch AVX-512, so paying ~2.75 KB of save/restore traffic on every single switch for everyone would be wasteful.
- **`FS_BASE`** (an MSR) holds the base address for **Thread-Local Storage** — `thread_local`/`__thread` C/C++ variables resolve through an offset from `FS_BASE`. The kernel updates `FS_BASE` on every switch so `thread_local` variable access always lands in the correct thread's private storage.
- **Debug registers `DR0-DR7`** (used by `gdb` for hardware breakpoints) are only saved/restored when a debugger is actually attached to the process.

---

#### 1.9 Full Worked Example: What Happens When You Run a Program

Putting the whole model together — the complete trace of launching a tiny C program from the shell:

```c
int global_var = 100; // Data Segment
int main() {
    int local_var = 5; // Stack
    printf("Hello World! local = %d\n", local_var);
    return 0;
}
```

1. The shell calls `fork()`, creating a child process (a near-identical copy of the shell). The child then calls `execve("./hello", ...)`.
2. The kernel reads the ELF header of `./hello` from disk: it finds the program's entry point address (e.g. `0x00401000`) and the sizes/layout of the `.text`/`.data` segments.
3. The kernel allocates a fresh `mm_struct` and a fresh page table for this process, writes the new page table's physical address into `task_struct->mm->pgd`, and sets **CR3** to point at it — the process now has its own, isolated virtual address universe.
4. The kernel reserves the stack region (sets the initial **RSP** to the top of that region) and maps `.text`/`.data` as Virtual Memory Areas (VMAs) — but does **not** physically load any code into RAM yet.
5. The kernel sets **RIP** to the ELF entry point, and executes `iret` — the CPU drops from Ring 0 back to Ring 3 and starts fetching instructions at RIP.
6. The very first instruction fetch at that RIP is not yet in RAM (the code was never loaded, only lazily mapped) → this triggers a **page fault**, and the kernel's page-fault handler loads the actual `.text` bytes from disk into a physical frame before the CPU can proceed (this is a form of *demand paging*, covered fully in the Virtual Memory Management topic).
7. Execution proceeds normally: local variables like `local_var` are placed by simply decrementing RSP; `printf` internally issues a `write()` syscall, which is the full Ring 3 → Ring 0 → Ring 3 round-trip described in §1.3.

---

#### Summary Table: The Core Mental Model

| Concept | One-line takeaway |
|---|---|
| RIP / RSP / CR3 | "What runs next," "where's my stack," "which memory universe am I in" — the only 3 registers you need for the context-switching intuition |
| Ring 3 vs Ring 0 | Enforced by CPU silicon reading the CPL bits in CS — the kernel doesn't stop illegal access, hardware does, before software even knows |
| `syscall`/`sysret` | The ONE hardware-controlled doorway between user code and the kernel; RAX = which door, RDI/RSI/RDX = the request |
| Hardware Interrupt | Asynchronous, external, checked between every instruction fetch in silicon |
| Software Exception | Synchronous, caused by the current instruction itself (page fault, divide-by-zero) |
| IDT/IDTR | The kernel's boot-time lookup table mapping vector number → handler address |
| Context switch | Two-stage register save (hardware frame + software `PUSH`es) into a per-thread kernel stack, pointed to by `task_struct->thread.sp` |
| Thread switch vs process switch | Threads skip the CR3 reload and TLB flush entirely — this is *why* they're cheaper |
| Lazy save (AVX/DR) | Only paid for if actually used — avoids taxing every switch for a rarely-used feature |

**End of Topic 1: CPU Execution Model**
