## TOPIC: Virtual Memory Management - Address Space, Paging & Page Faults

### THEORY_SECTION: How a Process's Virtual Address Space Maps to Physical RAM

Every Linux process operates under the illusion that it owns the entire address space. On a 64-bit architecture this is a vast virtual memory space — but nothing physical backs it until the kernel is forced to. This topic builds the complete mental model from the ground up: the layout of that address space, how the kernel tracks it (`mm_struct` / `vm_area_struct`), how `malloc`/`mmap`/`brk` actually pull memory from the kernel, and the full hardware+software pipeline (TLB → page table walk → page fault handler → cache) that runs on every single memory access.

---

#### 4.1 Process Virtual Address Space Layout

**The baseline diagram** (from high address memory down to low address memory, a compiled C/C++ binary is organized as follows):

```
+-----------------------------------+ High Address (0x7FFF...)
| Kernel Space                      | (Inaccessible to user space)
+-----------------------------------+
| Stack                             | Grows Downwards (Local variables, function frames)
| |                                 |
| v                                 |
|                                   |
| ^                                 |
| |                                 |
| Heap                              | Grows Upwards (Dynamic allocations: malloc, new)
+-----------------------------------+
| BSS Segment                       | Uninitialized global/static variables
+-----------------------------------+
| Data Segment                      | Initialized global/static variables
+-----------------------------------+
| Text Segment                      | Executable machine code (Read-only)
+-----------------------------------+ Low Address (0x0040...)
```

This is the textbook picture — but it's incomplete. Once you account for shared libraries and large allocations, the real layout has one more region:

**The refined layout** (with the Memory Mapping Segment):

```
VIRTUAL ADDRESS SPACE (High Addresses -> Low Addresses)
======================================================================
0x7FFF FFFF FFFF [ STACK Segment ]            Grows DOWNWARD
                        │
                        ▼
                  ┌─────────────────────────────────────────┐
                  │ MEMORY MAPPING SEGMENT                  │
                  │ • Shared Libraries (e.g., libc.so)      │
                  │ • mmap() files                          │
                  │ • Large malloc() / new allocations      │  <-- large (>=128KB) mallocs live HERE, not on the heap
                  └─────────────────────────────────────────┘
                        ▲
                        │ (Grows Upward via brk)
                  [ HEAP Segment ]              Small malloc()/new (<128 KB)
                  [ .bss / .data ]              Globals and statics
0x0000 0040 0000  [ .text ]                     Executable code (Read-only)
======================================================================
```

**Why this matters**: a common misconception is that *every* `malloc()` call grows the Heap segment. It doesn't. Large allocations (glibc's default threshold is **≥ 128 KB**) are served from the Memory Mapping Segment via `mmap()`, entirely separate from the Heap's `brk` boundary. §4.3 covers exactly why.

**Segment permission rules** (hardware-enforced via Page Table Entry bits — not just a software convention):

| Segment | Permissions | What happens on violation |
|---|---|---|
| Text (`.text`) | Read-Only + Execute (R-X) | Writing to it → `SIGSEGV` |
| Stack & Heap | Read + Write + **No-Execute** (RW-) | Executing data on it → `SIGSEGV` — this is the hardware basis of NX/DEP (prevents classic stack-smashing shellcode injection) |
| Shared libraries (code section) | Read-Only | Shared in physical RAM across every process using that library |

**Vocabulary established here, used for the rest of this chapter:**
- **Virtual Address**: what your code sees (pointers). A number with no inherent connection to real hardware.
- **Physical Memory (RAM)**: where data actually lives.
- **Page & Page Frame**: memory is chunked into fixed-size units, typically **4 KB (4,096 bytes)**. A *virtual page* maps to a *physical page frame*.
- **MMU (Memory Management Unit)**: the hardware component that translates virtual → physical addresses using Page Tables.
- **TLB (Translation Lookaside Buffer)**: a hardware cache for page-table lookups. A TLB miss forces a slow walk through the page table in RAM.

---

#### 4.2 Page Faults (Lazy Allocation)

When you allocate memory (`malloc`, `mmap`), the kernel does **not** immediately assign physical RAM. It only updates the process's page table to say "this virtual range is valid" — nothing physical is touched yet.

1. When your code reads/writes to that virtual address for the **first time**, the MMU triggers a **Page Fault** — a hardware interrupt.
2. The kernel's page-fault handler traps the interrupt.
3. The kernel allocates a physical 4 KB page frame, updates the page table, and resumes your instruction.

- **Major Page Fault**: requires reading data from disk (e.g. swap, or reading a binary file into memory). Costs **~5-10 ms**.
- **Minor Page Fault**: memory is already in RAM, just not mapped into *this* process's page table yet (e.g. allocating zeroed memory, or a code page another process already loaded).

**Sequence diagram — "why is allocation fast but the first *use* slow?"**

```
sequenceDiagram
    participant App as C++ Application (malloc/new)
    participant Kernel as Linux Kernel (Page Fault Handler)
    participant MMU as MMU Hardware (Page Tables)
    participant RAM as Physical RAM

     Note over App: 1. Needs Memory (1 Page)
     App->>Kernel: Call malloc() (system call e.g., sbrk/mmap)
     Note over Kernel: 2. Marks Virtual Address Range 'Valid' in Page Table
     Kernel-->>App: Return Pointer (e.g., 0x8000)
     Note over App, MMU: Pointer exists but is not mapped to RAM (Lazy Allocation).
     Note over App: 3. Application Tries to Write: *0x8000 = 'X'
     App->>MMU: Access 0x8000
     MMU->>Kernel: TRAP: Minor Page Fault (Mapping Missing!)
     Note over Kernel: 4. Find Free Physical Page Frame
     Kernel->>RAM: Allocate Page Frame (PF12)
     Note over Kernel: 5. Update Page Table: V 0x8000 -> PF12
     Kernel->>MMU: Mark Entry Valid
     Kernel-->>App: 6. Resume Instruction (CPU repeats write)
     App->>MMU: Access 0x8000 again (Success!)
     MMU->>RAM: Write 'X' to PF12
```

**Interview framing**: if asked *why an allocation call is fast but the very first use of that memory is slow*, this diagram is the answer.

**A simple mental model** (useful as an on-ramp, but always ground it back in the real terms above):
- Virtual Address Space = your **Notebook** (blank page numbers reserved for you).
- Physical RAM = a **Bookshelf** in the library (finite real slots).
- Page Table / MMU = the **Librarian** who places real paper on the shelf only when you actually write something.
- Page fault = the Librarian **pausing your code** to go fetch/place paper.

---

#### 4.3 brk vs mmap — How malloc Actually Gets Memory From the Kernel

`malloc` (or C++ `operator new`) is a **user-space memory manager** (the glibc allocator). It is not a syscall itself — it requests virtual memory from the kernel via two underlying syscalls:

- **`brk` / `sbrk`**: moves the *program break* to expand/contract the Heap. Used for small allocations (glibc default threshold **< 128 KB**).
- **`mmap`**: requests an independent block of virtual memory *outside* the heap. Used for large allocations (**≥ 128 KB**). Freed via `munmap` — memory is **instantly** returned to the OS (unlike `brk`, which can suffer heap fragmentation — see below).

**Code + strace demonstration:**

```cpp
#include <unistd.h>
#include <sys/mman.h>
#include <iostream>

void sys_alloc_demo() {
    // 1. SMALL ALLOCATION (<128 KB): Uses `brk` to expand the Heap break boundary
    char* small_alloc = (char*) malloc(1024);

    // 2. LARGE ALLOCATION (>=128 KB): Bypass the heap, use `mmap` directly
    size_t large_size = 2 * 1024 * 1024;
    void* large_alloc = mmap(
        NULL,                          // Kernel chooses virtual address
        large_size,                    // Allocation size
        PROT_READ | PROT_WRITE,        // Memory protection flags
        MAP_PRIVATE | MAP_ANONYMOUS,   // Private, RAM-backed memory
        -1,                            // No file descriptor
        0                              // No offset
    );

    std::cout << "Small Alloc (Heap via brk): " << (void*)small_alloc << "\n";
    std::cout << "Large Alloc (MMAP Region): " << (void*)large_alloc << "\n";

    free(small_alloc);
    munmap(large_alloc, large_size); // Instantly returns 2MB to the OS
}
```

```bash
g++ -o mem_demo mem_demo.cpp
strace -e brk,mmap,munmap ./mem_demo
```

```
brk(NULL)                               = 0x55a1000       (Find current heap end)
brk(0x55c2000)                          = 0x55c2000       (Extend heap break boundary upward)
mmap(NULL, 2097152, PROT_READ|PROT_WRITE, MAP_PRIVATE|MAP_ANONYMOUS, -1, 0) = 0x7f8a10000000
munmap(0x7f8a10000000, 2097152)          = 0
```

**The exact "heap break boundary" mental model:**

```
Low Address                                                   High Address
[ .text ] [ .data ] [ .bss ] [========== HEAP ==========| ] ....................
                                                        ^
                                                  Program Break (brk)
```

`malloc(32)` step by step:
1. glibc checks if it has 32 free bytes inside its current heap block.
2. If yes → hand back a pointer to unused space inside that block (**no syscall**).
3. If no → glibc calls `brk()`: "shift my Program Break N KB higher!"

```
[ .text ] [ .data ] [ .bss ] [=============== HEAP ===============| ] ...........
                                                                   ^
                                                            New Program Break
```

**Why "bypassing the heap" (mmap) exists — the heap fragmentation problem.** If a 100 MB allocation sat at the end of the brk-heap, and a small 4-byte variable was allocated *above* it, freeing the 100 MB later can never shrink `brk` back down (glibc can only move the break down from the very top) — **the 100 MB stays trapped inside the heap** ("heap fragmentation"). So glibc bypasses the heap entirely for allocations ≥ 128 KB via `mmap`:

```
                                                [ Separate Allocated Chunk ]
                                                (2 MB mapped independently)
                                                +--------------------------+
                                                | mmap Virtual Region       |
                                                +--------------------------+
                                                              ^
[ .text ] [ .data ] [ .bss ] [====== HEAP ======| ] ........................
                                                ^
                                          Program Break (Unchanged!)
```

`free()` on an mmap'd pointer → glibc calls `munmap()` → the region is destroyed and memory returned to the OS **instantly**, without touching the heap at all.

**Why malloc "feels" like it gives random/fragmented addresses:**

```cpp
char* a = (char*) malloc(32); // Heap Slot 1
char* b = (char*) malloc(32); // Heap Slot 2
char* c = (char*) malloc(32); // Heap Slot 3
free(b);                      // Slot 2 becomes a 32-byte "hole"
char* d = (char*) malloc(16); // glibc REUSES Slot 2! (lower address than 'c')
```

glibc maintains internal bins/free-lists per size class and reuses holes — so sequential mallocs can look scattered even though the underlying kernel-given heap chunk is one continuous span.

**Full byte-level walkthrough** — this exact step-tracked format ("this much heap available and reused until this operation then brk allocates new memory") is the reference shape for tracing *any* mutable-structure-over-time question in this chapter:

Setup: page size 4 KB; mmap threshold 128 KB; heap starts at 0 KB, program break = `0x1000`.

| Step | Code | Syscall? | Heap size after | What happens |
|---|---|---|---|---|
| 1 | `malloc(100)` | Yes (`brk`) | 0 → 132 KB | Kernel expands break by a default 132 KB chunk; hands back first 100 bytes at `0x1000` |
| 2 | `malloc(200)` | No | 132 KB | Carves 200B right after A, from existing free space, at `0x1064` |
| 3 | `free(A)` | No | 132 KB | 100B at `0x1000` marked as a "hole"; **not** returned to kernel |
| 4 | `malloc(50)` | No | 132 KB | Reuses the 100B hole at `0x1000` (same address as old A!) |
| 5 | `malloc(140*1024)` | Yes (`brk`) | 132 KB → ~276 KB | Existing free space (~131.7 KB) not enough; break expands again |
| 6 | `malloc(200*1024*1024)` (200MB) | Yes (`mmap`) | ~276 KB (unchanged) | ≥128KB ⇒ bypasses heap entirely; standalone region e.g. `0x7f8a00000000` |
| 7 | `free(E)` | Yes (`munmap`) | ~276 KB (unchanged) | 200MB instantly returned to OS; heap untouched |

---

#### 4.4 Virtual vs Physical Contiguity of Sequential Allocations

A natural question: "won't repeated small allocations be *continuous* in address?" Answer: **mostly yes for virtual addresses**, with two nuances.

**Nuance A — Metadata/alignment**: malloc stores a small header before each block and aligns to 8/16 bytes, so `ptr2 != ptr1 + requested_size` exactly, but order is still sequential.

**Nuance B — Virtual contiguity ≠ physical contiguity**: Virtual addresses are 100% sequential within one heap block. Physical RAM frames backing those virtual pages **do not need to be contiguous** — the kernel maps each 4 KB virtual page to whatever physical frame happens to be free:

```
Virtual Heap Space (Continuous):
[ Page 1 (4KB) ] [ Page 2 (4KB) ] [ Page 3 (4KB) ]
  (0x1000)         (0x2000)         (0x3000)
     |                |                |
     v                v                v (Mapped by MMU / Page Table)
Physical RAM (Scattered):
[ Frame 89 ]     [ Frame 12 ]     [ Frame 204 ]
```

**Important correction, validated as correct**: within ONE 4 KB page, physical bytes ARE contiguous 1:1 with virtual bytes in that page — so small objects packed into the same page are physically adjacent (cache-friendly). Crossing a page boundary is the only place adjacency can "break" physically:

```
VIRTUAL PAGE (4096 Bytes)
[ Obj 1 ][ Obj 2 ][ Obj 3 ][ Obj 4 ][ Obj 5 ] ...
   │        │        │        │         │
   │ Maps 1:1 in exact sequential order
   ▼        ▼        ▼        ▼         ▼
PHYSICAL RAM FRAME (4096 Bytes in RAM)
[ Obj 1 ][ Obj 2 ][ Obj 3 ][ Obj 4 ][ Obj 5 ] ...
```

Also worth knowing: **Stack and Heap always sit on different virtual pages → different physical frames**, even though both are "active" simultaneously; the CPU handles this fine (separate TLB entries, separate cache lines, both accessed with no conflict).

---

#### 4.5 Memory Commit vs Resident Set — the 10GB malloc / 4GB RAM Interview Question

**Classic interview scenario**: "A process calls `malloc(10GB)` on a machine with 4GB RAM. The call succeeds. Why? What happens on `memset(ptr, 0, 10GB)`?"

**Answer**: `malloc` checks against the **Memory Commit Limit** (RAM + Swap), **not** current free physical RAM — a returned pointer is just a virtual grant, and the kernel **overcommits** by design (most large allocations are never fully touched). `memset` forces real page faults across the entire range; once physical RAM (4GB) fills, the kernel must swap inactive pages to disk; if swap also runs out, the **OOM Killer** kills the process.

```
Physical RAM: 4GB, Swap: 8GB ⇒ ~12GB "Possible" commit.
malloc(10GB) → succeeds (virtual reservation only, 0 RAM used yet)
memset(...)  → minor page faults fill RAM to 4GB → then major faults swap
             → if still not enough → OOM Killer (SIGKILL)
```

---

#### 4.6 The Virtual Memory Manager: mm_struct & vm_area_struct (VMA)

The VMM sits between user-space allocation calls and physical RAM:

```
[ User Space Application ]
   │ malloc(), mmap(), brk(), free()
   ▼
┌─────────────────────────────────────────────────────────┐
│              VMM (Virtual Memory Manager)                │
│                                                          │
│ 1. Memory Descriptor (`mm_struct`)                       │
│ 2. Virtual Memory Areas (`vm_area_struct` / VMAs)        │
│ 3. Page Fault Handler & Demand Paging Engine             │
│ 4. Buddy Allocator (Physical Frame Allocation)           │
│ 5. Page Reclamation & Swap Management (kswapd)         │
└─────────────────────────────────────────────────────────┘
   │
   ▼
[ Physical System RAM ]
```

Kernel structs (simplified, real fields):

```c
struct task_struct {
    pid_t pid;
    struct mm_struct *mm; // <--- Pointer to Process Memory Descriptor
    ...
};

struct vm_area_struct {
    unsigned long vm_start; // Start Virtual Address (e.g., 0x00400000)
    unsigned long vm_end;   // End Virtual Address   (e.g., 0x00401000)
    pgprot_t vm_page_prot; // Permissions: READ, WRITE, EXECUTE

    unsigned long vm_flags; // VM_READ, VM_WRITE, VM_EXEC, VM_SHARED, VM_GROWSDOWN

    struct vm_area_struct *vm_next; // Linked list of VMAs
    struct file *vm_file;           // If mapped to a file on disk (NULL if Heap/Stack)
};
```

**Why a process's VMAs are tracked in BOTH a linked list and a red-black tree simultaneously**: a doubly linked list `*mmap` AND a Red-Black tree `*mm_rb` both point at the *same* VMAs. The list exists for sequential iteration (e.g. printing `/proc/PID/maps`); the RB-tree exists for **O(log N)** lookup during a page fault, instead of an O(N) list walk through every VMA:

```
                   mm_struct (Memory Descriptor)
                            │
            ┌───────────────┴───────────────┐
            │ VMA Red-Black Tree & List     │
            └───────────────┬───────────────┘
                            │
      ┌─────────────────────┼─────────────────────┐
      ▼                     ▼                      ▼
[ VMA 1: TEXT ]       [ VMA 2: HEAP ]       [ VMA 3: STACK ]
vm_start: 0x00400000 vm_start: 0x02000000 vm_start: 0x7FFF50000000
vm_end:   0x00401000 vm_end:    0x02020000 vm_end:    0x7FFF50008000
prot:     READ | EXEC prot:     READ | WRITE prot:     READ | WRITE
file:     /bin/app    file:     NULL        file:     NULL
```

`cat /proc/PID/maps` literally just loops this VMA list and prints it as text.

Two-process view — every process's `task_struct → mm → its own VMA list`, completely isolated:

```
[ PROCESS 1: Nginx (PID 1001) ]                   [ PROCESS 2: Python App (PID 1002) ]
      task_struct                                       task_struct
     ┌───────────┐                                     ┌───────────┐
     │ pid: 1001 │                                     │ pid: 1002 │
     │ *mm ──────┼──────┐                              │ *mm ──────┼──────┐
     └───────────┘      │                              └───────────┘      │
                        │                                                 │
                        ▼                                                 ▼
                mm_struct (PID 1001)                              mm_struct (PID 1002)
           ┌─────────────────────────┐                       ┌─────────────────────────┐
           │ *mmap ──────────────────┼──┐                    │ *mmap ──────────────────┼──┐
           │ *mm_rb (Red-Black Tree) │ │                     │ *mm_rb (Red-Black Tree) │ │
           └─────────────────────────┘ │                     └─────────────────────────┘ │
                                        │                                                 │
                                        ▼                                                 ▼
           ┌─────────────────────────────────────────┐       ┌─────────────────────────────────────────┐
           │ Linked List of VMAs for Process 1001    │       │ Linked List of VMAs for Process 1002    │
           │ [TEXT]→[HEAP]→[STACK] (vm_next chain)   │       │ [TEXT]→[HEAP]→[STACK] (vm_next chain)   │
           └─────────────────────────────────────────┘       └─────────────────────────────────────────┘
```

---

#### 4.7 What Happens on mmap() vs the First Write (Demand Paging)

**What happens on `mmap(..., 1 MB)` — the syscall returns almost instantly:**
1. **VMM Lookup**: searches the RB-tree for an unused 1 MB gap in the virtual address space.
2. **VMA Creation**: creates a new `vm_area_struct` (e.g. `vm_start=0x7f8a10000000`, `vm_end=0x7f8a10100000`).
3. **No page table updates yet** — the VMM only registers the VMA, it does NOT allocate physical frames.
4. Returns the address immediately — nanoseconds.

**What happens on the first WRITE to that region (Demand Paging / Page Fault):**
1. **Hardware trap**: MMU checks TLB/page table → Present Bit = 0 → Page Fault exception.
2. **VMM's page fault handler** wakes, reads the faulting virtual address.
3. **VMA Validation**: searches the RB-tree for a VMA covering that address.
   - Not inside any VMA → illegal access → `SIGSEGV`, process killed.
   - Inside a valid VMA → legitimate, continue.
4. **Permission check**: does the operation (e.g. WRITE) match `vma->vm_page_prot`?
5. **Physical Allocation**: the Buddy Allocator grabs a real 4 KB physical frame.
6. **Page Table Linkage**: updates the PTE (virtual → physical), sets Present Bit = 1.
7. Instruction resumes and succeeds.

---

#### 4.8 Page Fault vs Cache Miss — NOT the Same Thing

A recurring source of confusion worth resolving precisely, since interviewers love this exact boundary question:

- **Page Fault** (virtual memory level): the PTE Present Bit = 0. This is a **software** interrupt — the kernel's VMM must allocate a physical frame (or pull from swap/disk). Cost: **~microseconds and up** (milliseconds if disk-backed).
- **Cache Miss** (physical data level): the page IS present in RAM, but the 64-byte cache line isn't in L1/L2/L3 SRAM yet. This is **pure hardware** — the kernel is completely unaware it happened. Cost: **~100 ns**.

```
1. MMU & Page Table Check:
   Is Page Present in Physical RAM (PTE Present Bit = 1)?
   ├── NO ---> PAGE FAULT! (Software Interrupt)
   │            Kernel VMM steps in, allocates Physical RAM Frame, sets Present Bit = 1.
   │            CPU retries the instruction from Step 1.
   │
   └── YES ---> Address translates to Physical Address.

2. CPU Cache Check (L1 / L2 / L3):
   Is 64-byte data line present in L1/L2/L3 Cache?
   ├── YES ---> CACHE HIT! CPU gets data in 1 - 12 ns.
   └── NO ---> CACHE MISS! Hardware fetches 64-byte line from DRAM (~100 ns).
                (No page fault, no kernel involved!)
```

---

#### 4.9 The Canonical 5-Step Memory Access Trace

This exact sequence is the reference answer for "how does one memory access actually work end-to-end," e.g. `MOV RAX, [0x7FFF4FFC]`:

```
STEP 1: CPU Request
└── CPU Execution Unit presents Virtual Address to the MMU.

STEP 2: TLB Translation Lookup
├── MMU splits Virtual Address into [Virtual Page Number | Byte Offset within Page].
├── Checks DTLB (or ITLB if fetching code).
│    ├── HIT (~0.5 ns): Physical Frame Number obtained directly -> skip to STEP 5.
│    └── MISS (~2 ns) : Hands off to Hardware Page Table Walker.

STEP 3: Hardware Page Table Walk (MMU, still hardware)
├── Page Walker reads CPU CR3 register -> Root Page Table (PGD) in Physical RAM.
├── Traverses: PGD -> P4D -> PUD -> PMD -> PTE.
├── Checks PTE Present Bit:
│    ├── 1: valid mapping found, loads translation into DTLB -> skip to STEP 5.
│    └── 0: PAGE FAULT EXCEPTION -> handed to KERNEL SOFTWARE.

STEP 4: Kernel Page Fault Handling (software interrupt, Ring 0)
├── CPU pauses user instruction, switches Ring 3 -> Ring 0.
├── Kernel checks if address is valid inside process VMAs:
│    ├── Invalid: SIGSEGV.
│    └── Valid: Buddy Allocator gets a free 4KB frame (or reads it back from swap/disk if it was
│                swapped out).
├── Updates PTE (new frame + Present=1).
└── Switches back to Ring 3, retries STEP 1.

STEP 5: Physical Data Retrieval via CPU Cache Hierarchy
├── MMU combines Physical Frame Number + Byte Offset = Physical Address.
├── CPU queries cache hierarchy using the PHYSICAL address:
│    ├── L1 HIT (~1 ns): returns 64-byte cache line straight to register.
│    ├── L2 HIT (~4 ns): loads into L1 -> register.
│    ├── L3 HIT (~12 ns): loads into L2/L1 -> register.
│    └── MISS (~100 ns): pulls 64-byte line from DRAM -> L3 -> L2 -> L1 -> register.
```

**Four corrections worth internalizing precisely (each was a real, validated point of confusion):**
1. **The TLB caches translations only, not data.** CPU data/instruction caches (L1/L2/L3) cache actual byte contents. Mixing these up is the single most common confusion in this area.
2. **The Hardware Page Table Walker does NOT bring pages back from swap.** It only *walks the in-RAM page-table tree* on a TLB miss to find a PTE. If the PTE says `Present=0` (whether never allocated OR swapped out), it hands off to the **Kernel's software Page Fault Handler** — which is the thing that actually reads from swap/disk.
3. Data flow is strictly **Registers ← L1 ← L2 ← L3 ← RAM** — the CPU always checks caches *before* ever touching physical RAM.
4. It's a **64-bit** virtual address space (not "64-byte"); modern x86_64 Linux exposes a 48-bit (256 TB) or 57-bit user address space per process, not literally "the full 64 bits" of a pointer.

*Note: the deeper mechanics of L1/L2/L3 caches themselves — including why L1 uses a VIPT (Virtually Indexed, Physically Tagged) trick to run in parallel with the TLB lookup — belong to Topic 2 (Caches, Memory Ordering, Speculative Execution & NUMA) of this chapter; this topic focuses on the paging/TLB side of the pipeline.*

---

#### 4.10 Deep TLB Eviction Trace & Huge Pages

The single most-requested teaching format in this whole domain is a **slot-by-slot state trace** — tracking exactly what's in each TLB slot after every access, rather than a vague "the TLB caches recent translations" description.

Setup: page size 4KB. **L1 ITLB: 2 slots. L2 ITLB (STLB): 4 slots. Eviction: LRU.**
Trace execution across virtual pages: `0x1000 → 0x2000 → 0x3000 → 0x4000 → 0x1000 (loop back) → 0x5000`.

| Step | Page accessed | L1 status | L2 status | Found where? | Latency |
|---|---|---|---|---|---|
| 1 | Page1 (0x1000) | MISS (empty) | MISS (empty) | RAM (page table walk) | ~100 cycles |
| 2 | Page2 (0x2000) | MISS | MISS | RAM | ~100 cycles |
| 3 | Page3 (0x3000) | MISS (evicts Pg1) | MISS | RAM | ~100 cycles |
| 4 | Page4 (0x4000) | MISS (evicts Pg2) | MISS | RAM | ~100 cycles |
| 5 | Page1 (0x1000) again | MISS | **HIT!** | L2 ITLB | ~5 cycles (fast!) |
| 6 | Page5 (0x5000, new) | MISS (evicts Pg4) | MISS (evicts Pg2) | RAM | ~100 cycles |

**Key mechanic demonstrated**: L1 evicting a page does **not** delete it from L2 — L2 acts as a second-chance/victim cache. A page promoted back from L2→L1 causes L1 to evict its own LRU victim (which stays safe in L2). Only when **both** L1 and L2 miss does the (slow, ~100-cycle) RAM page-table walk happen.

**Real hardware TLB sizes:**
- **L1 iTLB**: ~64–128 entries (covers ~256 KB–512 KB of active code).
- **L2 unified TLB (STLB)**: ~1,024–2,048 entries (covers ~4 MB–8 MB).
- Inside TLB range → 0-cycle translation. Outside → **TLB thrashing** (constant RAM page-table walks).

**Huge Pages — why they exist:**
- Standard 4 KB pages: 1 GB of code needs **262,144** page entries → crushes the TLB.
- 2 MB Huge Pages: 1 GB needs only **512** entries → fits easily in L2 TLB.
- Directly relevant to real-time/latency-sensitive workloads: fewer TLB misses = fewer unpredictable ~100-cycle stalls in a hot loop.

---

#### 4.11 Full Cold-Boot Trace: Page Table State & Thrashing

Analogy: Virtual Address = blueprint house number; Physical RAM = construction site (limited plots); Hard Disk = outer warehouse (unlimited, but slow); Page Table = site manager's clipboard; MMU/CPU = chief builder.

Full worked trace of `./my_robot_app` from cold boot, with an explicit Page Table state table (Virtual Page | Present Bit | Physical Location) tracked through:

1. **Program load**: all pages `Present=0`, pointing at disk sectors.
2. **Executing 0x1000** → page fault → loads into RAM Plot 0.
3. **Sequential execution into 0x2000, 0x3000** → Plots 1, 2.
4. **`malloc(4096)` + first write** → lazy alloc → Plot 3 (**RAM now 100% full**, all 4 plots used).
5. **Critical moment**: jump to 0x4000 (new page) while RAM is full → kernel picks an LRU victim (Page 1, code, read-only so no write-back needed) → evicts it (Present→0, location→disk) → loads Page 4 into the freed plot.
6. **Loop back to 0x1000** → major page fault *again* (it was evicted!) → evicts Page 2 this time → reloads Page 1.
7. **Thrashing**: "if your program constantly jumps back and forth between more pages than physical RAM can hold, the system spends 99% of its time moving 4KB pages between SSD and RAM" — this is what thrashing means precisely, and why it tanks throughput.

**3-tier memory model (RAM + Swap) — recap table:**

| Memory Term | Where it lives | Speed | Handling |
|---|---|---|---|
| Virtual Address | Nowhere (just a number) | Instant | Mapped by MMU via Page Tables |
| Anonymous Memory | Physical RAM | ~50–100 ns | Active heap/stack currently in RAM frames |
| Swapped Memory | Hard Disk/SSD | ~5–10 ms (slow!) | Inactive RAM pages flushed to disk when RAM full |
| File-backed Memory | Hard Disk/SSD | Variable | `.text` segment or mmap'd files read from disk |

Major vs Minor page fault, quantified: a major fault (disk-backed) is roughly **100,000×** slower than RAM-speed access — this exact "how many times slower" framing is the correct level of precision to reach for whenever comparing memory tiers in an interview answer.

---

#### 4.12 Multi-Process Memory Isolation via CR3

Every process gets an **isolated Virtual Address Space** (`0x0` to `0x7FFFFFFFFFFF`, ~128 TB user space on typical x86_64 configurations). Two processes can both use virtual address `0x400000` simultaneously without collision: each process's **Page Table root is loaded into the CPU's CR3 register** during its scheduled timeslice/context switch; identical virtual addresses translate through *different* page tables to *different* physical frames.

```
[ PROCESS A PAGE TABLE ]  CR3 = Frame 100      [ PROCESS B PAGE TABLE ]  CR3 = Frame 200
0x7FFF...0000 -> Frame #12 (RAM)               0x7FFF...0000 -> Frame #45 (RAM)
0x0200 0010    -> Frame #13 (RAM)              0x0200 0010    -> Frame #46 (RAM)
0x0040 1000    -> Frame #14 (RAM)  *shared*    0x0040 1000    -> Frame #14 (RAM)  *shared*
```

**3 legitimate cases where physical RAM IS actually shared across processes** (this is an optimization, not a violation of isolation):
1. **Shared code (`.text`)**: running the same binary twice → both processes' page tables point at the *same* physical frame for the code, marked Read-Only.
2. **Shared dynamic libraries** (e.g. `libc.so`): loaded into RAM once, mapped into every process using it.
3. **Shared Memory IPC** (`shmget`/`mmap(MAP_SHARED)`): the kernel deliberately configures two processes' page tables to point the same virtual range at the same physical frames (covered in full in Topic 5: VFS & I/O System).

**What happens when combined RAM demand exceeds physical RAM**: (1) reclaim Page Cache first, (2) LRU-based swapping of inactive pages to disk, (3) **OOM Killer** as last resort (scores processes by memory use, sends `SIGKILL`).

---

#### 4.13 Where Do Variable Addresses Actually Come From?

A precise 3-way split, since "where does this pointer's value actually come from" is a genuinely good interview probe:

```
1. COMPILER & LINKER   ---> Decides numbers for TEXT, DATA, and BSS segments (baked into the ELF file on disk!)
2. LINUX KERNEL        ---> Decides starting numbers for STACK and HEAP when program launches (execve())
3. GLIBC (malloc)      ---> Sub-divides heap addresses for individual variables at runtime
```

- **Globals** (`global_a`, `global_b`): fixed addresses assigned by the **linker at compile time**, hardcoded into the binary before it ever runs.
- **Stack variables**: assigned **at runtime** by simply subtracting from the **RSP register** as each local is declared, e.g. `RSP -= 4` per `int`. Purely arithmetic — near-zero cost.
- **Heap variables**: assigned **at runtime by glibc**, which tracks the next free offset from the kernel-given break/mmap region and adds a small internal header per allocation.

Full worked example combining all three:

```cpp
int global_a = 50;   // Data segment
int global_b;         // BSS segment
int main() {
    int x = 10;                  // Stack
    int y = 20;                  // Stack
    int *p1 = (int*) malloc(4);  // Heap
    int *p2 = (int*) malloc(4);  // Heap
}
```

```
VIRTUAL ADDRESS       VARIABLE NAME       CONTENTS / VALUE
========================================================================================
0x7FFF FFF0          [ Initial RSP ]      (Top of Stack)
0x7FFF FFEC          x (Stack)            10
0x7FFF FFE8          y (Stack)            20
0x7FFF FFE0          p1 (Stack Pointer)   0x02000010 ───┐ (Points to Heap)
0x7FFF FFD8          p2 (Stack Pointer)   0x02000020 ──┐│
0x0200 0020          *p2 (Heap Data)      (Uninitialized) ◄─┘│
0x0200 0010          *p1 (Heap Data)      (Uninitialized) ◄──┘
0x0200 0000          [ Start of Heap ]
0x0040 3004          global_b (BSS)       0
0x0040 3000          global_a (Data)      50
0x0040 1000          main() code (Text)   Assembly Instructions...
```

Even an **empty `int main(){ return 0; }`** program still gets a full virtual layout at `execve()` time (Stack top hardcoded near `0x7FFFFFFE0000`, Heap start near `0x0200 0000`, Text from the ELF file) — nothing is allocated physically until the first instruction fetch faults it in.

---

**Quick reference — canonical latency numbers to have memorized:**

| Operation | Latency |
|---|---|
| TLB hit | ~0.5 ns |
| TLB miss + page table walk (in-RAM) | ~10–40 ns |
| Minor page fault (RAM already has the page) | ~microseconds |
| Major page fault (disk/swap read) | ~5–10 ms |
| Major vs RAM-speed access, roughly | ~100,000× slower |

**End of Topic 4: Virtual Memory Management**
