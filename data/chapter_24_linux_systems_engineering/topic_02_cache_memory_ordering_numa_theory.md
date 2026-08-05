## TOPIC: CPU Caches, Memory Ordering, Speculative Execution & NUMA

### THEORY_SECTION: How the Hardware Actually Moves and Protects Bytes

This topic is the hardware backbone behind every "why is my C++ code slow" and "why did that lock-free code break on ARM" question you will ever debug. It covers four layers that build on each other: (1) the cache hierarchy that decides whether a memory access costs 1 cycle or 300, (2) the memory-ordering rules that decide whether two cores agree on the order writes happened, (3) the speculative-execution machinery that makes modern CPUs fast — and that leaked kernel memory through cache timing (Spectre/Meltdown), and (4) NUMA, the multi-socket reality of every modern server.

---

#### 2.1 The Memory Access Path: Registers → Store Buffer → L1 → L2 → L3 → RAM

Every value a CPU core touches flows through a strict hierarchy. The ALU (arithmetic unit) only ever operates on **register** values — if an operand lives in L1 cache, a `MOV` must load it into a register first.

```
CPU CORE
┌───────────────────────────────────────────────────────────────────┐
│  Registers (RAX, RBX, ... )         <- ALU operates ONLY here      │
│         │                                                          │
│         ▼                                                          │
│  Store Buffer (per-core, small)     <- writes land here FIRST      │
│         │                                                          │
│         ▼                                                          │
│  L1 Cache (32-64 KB, split I/D)     <- private per core             │
│         │                                                          │
│         ▼                                                          │
│  L2 Cache (512KB-1MB)               <- private per core             │
└─────────┼─────────────────────────────────────────────────────────┘
          ▼
  L3 Cache (32-256 MB)                <- SHARED across all cores on a socket
          │
          ▼
  Main RAM (DRAM)                     <- shared across the whole machine
```

- **L1 and L2 are private per core.** Core 0's L1 has zero visibility into Core 1's L1 — this is exactly why cross-core communication needs a coherency protocol (§2.4).
- **L3 is shared** across every core on the same physical socket — it is the last stop before a full trip to DRAM.
- **A CPU write does not go straight to L1.** It lands in a small, private **Store Buffer** first, so the core can keep executing without stalling on cache-write latency. This one design decision is the entire root cause of memory-ordering surprises in §2.5.

---

#### 2.2 VIPT L1 Cache — Why L1 Hits Cost Only ~1ns

**The naive mental model (and why it's wrong):** "The CPU has a virtual address, so it must first ask the MMU/TLB to translate it to a physical address, and only THEN can it search the cache." If that were true, every L1 access would cost *translation time + cache time*, sequentially.

**What actually happens — the address is split and both halves are used in parallel:**

A 64-bit virtual address splits into two pieces that mean very different things:

```
[ 64-BIT VIRTUAL ADDRESS: 0x7FFF50000010 ]
                    │
          ┌─────────┴─────────┐
          │                   │
[ Upper 52 Bits: Page # ]  [ Lower 12 Bits: Page Offset ]
          │                   │
          ▼                   ▼
   MMU / TLB Lookup      L1 Cache Index Lookup
   Translates Virtual    Uses lower bits to find
   Page to Physical      the Cache Line IMMEDIATELY
   Frame Number          (no translation needed — these
   (e.g. Physical         12 bits are IDENTICAL in virtual
   0x1A400)               and physical addresses!)
          │                   │
          └─────────┬─────────┘
                     ▼
            COMPARISON STEP
    Does L1 Cache Tag == Physical 0x1A400?
              ┌──────┴──────┐
              ▼             ▼
          [ HIT ]       [ MISS ]
       ~0.5-1ns!      Proceeds to L2/L3
```

The key physical fact: the lower 12 bits of a virtual address (the **page offset**) are never translated — they are byte-identical in the virtual and the physical address, because a 4 KB page always starts on a 4 KB boundary. So the CPU can start **indexing into the L1 cache's SRAM array using those 12 raw bits** at the exact same clock cycle the TLB begins translating the upper 52 bits. This design is called **VIPT — Virtually Indexed, Physically Tagged**.

**Why parallel beats sequential (the actual physics, not just "it's faster"):**

| Approach | Timeline | Total latency |
|---|---|---|
| Sequential (translate, then search) | TLB lookup (~2 cycles) → THEN send to L1 (~2 cycles) | ~4 cycles, ~0.8-1.0ns |
| Parallel (VIPT) | TLB lookup and L1 index run in the SAME 2 cycles, using independent hardware circuits (TLB's associative array vs L1's SRAM array — they don't contend for the same silicon) | ~2 cycles, ~0.4-0.5ns |

At 5 GHz, that difference is the gap between L1 feeling instant and L1 quietly throttling every single memory access in your program.

**Common Pitfall — "Doesn't a context switch make VIPT return stale data from another process?"**
No. L1 stores the **physical** tag, not the virtual one. When Process B's TLB lookup completes, it produces a *different physical tag* than whatever Process A had cached — so the comparison step naturally misses instead of returning garbage. Modern CPUs also tag TLB entries with an **ASID (Address Space Identifier)** so a context switch doesn't require flushing the whole TLB — the hardware simply ignores entries tagged with the previous process's ASID.

**Why L2 and L3 are PIPT (Physically Indexed, Physically Tagged), not VIPT:**
To index a cache bigger than 4 KB you need more than 12 bits of index — and beyond bit 12, virtual and physical addresses diverge. Using virtual bits to index a large cache would let two *different* virtual addresses that map to the *same* physical location land in *different* cache slots — a correctness bug called **cache aliasing / synonyms**. By the time an access reaches L2 (an L1 miss), the TLB translation is already resolved, so L2/L3 simply use the sequential, unambiguous physical address.

**Cache hierarchy summary table:**

| Cache Level | Indexing Type | Needs Translation First? | Latency |
|---|---|---|---|
| L1 Cache | VIPT | No — runs in parallel with TLB | ~0.5-1.5 ns (~4-5 cycles) |
| L2 Cache | PIPT | Yes, uses TLB's physical output | ~3-4 ns (~12-15 cycles) |
| L3 Cache | PIPT | Yes | ~10-15 ns (~40-60 cycles) |
| RAM | Hardware bus address | Yes, bus drives voltages directly | ~60-100+ ns (~200-300+ cycles) |

---

#### 2.3 The Cost of a Cache Miss (Quantified, Not "Slow")

Assume a modern CPU running at ~4.0 GHz, so 1 cycle ≈ 0.25 ns.

| Memory Layer | Latency (cycles) | Time | "1 cycle = 1 second" analogy |
|---|---|---|---|
| CPU Registers | 0-1 | ~0.25 ns | Your hands |
| Store Buffer / L1 Cache | 4-5 | ~1-1.5 ns | A paper on your desk |
| L2 Cache | 12-15 | ~3-4 ns | A book on the bookshelf in your room |
| L3 Cache (shared) | 40-60 | ~10-15 ns | A book in the building's basement |
| Main RAM (DRAM miss) | 200-300+ | ~60-100+ ns | Taking a trip to another country |

**Why RAM is *physically*, not just "architecturally," slower:**
- **SRAM (cache)**: 6 transistors per bit, holds state as long as powered, no refresh needed — but each bit costs real die area, which is why caches are small.
- **DRAM (main RAM)**: 1 transistor + 1 capacitor per bit. Capacitors leak charge constantly and must be refreshed thousands of times per second just to not forget their value. Reading a bit means charging a bitline and waiting out RAS/CAS timing across real motherboard wire traces — inherently slower than a same-die SRAM lookup.
- **The "Memory Wall"**: CPU compute throughput has scaled exponentially for decades; off-chip RAM bus bandwidth and latency have not kept pace. A full L3 miss stalls the instruction pipeline for hundreds of cycles — on a 4 GHz core, that is hundreds of *possible* instructions sitting idle waiting for one load.

**Interview framing:** if asked "why does iterating a `std::vector<int>` in order beat iterating a linked list of the same size?", this table plus §2.1's access path is the entire answer — sequential array access reuses hot cache lines; pointer-chasing a linked list guarantees an L1/L2/L3 miss on nearly every node.

---

#### 2.4 I-Cache vs D-Cache, False Sharing & Cache Coherency (MESI)

**L1 is split into two physically separate structures:**
- **L1i (Instruction cache)** — fetched by RIP, holds machine code.
- **L1d (Data cache)** — holds variables, stack, heap data.

Both are typically 32-64 KB. At L2 and L3, code and data merge into one unified cache.

**Cache coherency (MESI protocol) — why writing to a shared variable is expensive across cores:**
If Core 0 has address `0x1000` cached and modifies it, and Core 1 also has a cached copy of the same address, the hardware must not let Core 1 silently keep reading a stale value. The **MESI protocol** (Modified / Exclusive / Shared / Invalid) runs entirely in silicon: Core 0's write sends an **Invalidate** signal across the interconnect to every other core's copy of that 64-byte cache line. Core 1's *next* read of that address is now a forced miss — it must refetch the fresh value from Core 0 or L3.

**False sharing / cache-line bouncing — the classic "no logical sharing, still 10-100x slower" bug:**

```c
struct Counters {
    int counter_a;   // Written only by Thread A (Core 0)
    int counter_b;   // Written only by Thread B (Core 1)
};
```

`counter_a` and `counter_b` are logically completely independent — different threads, no shared state, no race condition. But if they happen to sit inside the **same 64-byte cache line**, every write to `counter_a` invalidates Core 1's cached line (which also holds `counter_b`), and vice versa. The line "bounces" back and forth across the inter-core interconnect on every write — a real 10x-100x performance cliff despite the code being logically race-free.

```
Core 0 writes counter_a  ──► MESI invalidates the WHOLE 64-byte line on Core 1
Core 1 writes counter_b  ──► MESI invalidates the WHOLE 64-byte line on Core 0
                              (repeat, forever, at full write rate)
```

**Fix:** pad/align hot per-thread counters to their own cache line (`alignas(64)` in C++), or use `std::hardware_destructive_interference_size` (C++17) as the padding size.

**Common Pitfall:** software cannot force a variable into L1 — cache placement is 100% hardware-controlled. The best software can do is *hint* (`_mm_prefetch`) or structure data for good spatial/temporal locality; it can never pin a value in cache.

---

#### 2.5 Memory Ordering: x86 TSO vs ARM/POWER Weak Ordering

**The problem, without synchronization:**

```c
// Shared global variables (initialized to 0)
int data = 0;
int ready = 0;

// Thread 1 (Core 0)              // Thread 2 (Core 1)
data = 42;                        while (ready == 0) { /* wait */ }
ready = 1;                        print(data);
```

Without synchronization, Core 1 can observe `ready == 1` while still reading `data == 0`. The reason traces directly back to §2.1: writes land in the private **Store Buffer** first, not L1 — so a write becoming globally visible can genuinely lag behind the instruction that issued it, from another core's point of view.

**x86 is Total Store Order (TSO):**
- x86 hardware **never reorders Store→Store or Load→Load**.
- The *only* reordering x86 permits is **Store→Load to a different address** — caused directly by the store buffer (see the worked example below).
- Because acquire/release ordering is already enforced at the silicon level on x86, C++ `memory_order_acquire`/`memory_order_release` compile down to plain `MOV` instructions — the compiler only needs a *compiler barrier* (prevents compile-time instruction reordering), with zero extra hardware fence instructions.
- **ARM/POWER are weakly ordered**: the hardware is free to reorder Store→Store, Load→Load, and Store→Load. Cross-thread synchronization on these architectures *requires* explicit barrier instructions (`DMB` on ARM) or C++ atomics — you cannot rely on "it happened to work on x86."

**x86 fence instructions:**

| Instruction | Name | What it does |
|---|---|---|
| `sfence` | Store (write) barrier | Forces the core to fully flush its Store Buffer into L1 before any subsequent store executes |
| `lfence` | Load (read) barrier | Serializes all load operations; also clears speculatively-executed in-flight instructions (relevant again in §2.7) |
| `mfence` | Full memory barrier | `sfence` + `lfence` combined — nothing crosses in either direction. On x86, atomic RMW instructions (`LOCK XADD`, `LOCK CMPXCHG`) implicitly act as a full `mfence`. |

**Worked Example 1 — Store→Store (message passing): safe on x86, NOT safe on ARM**

```c
// Initial: int data = 0; int flag = 0;
// Thread 1 (Core 0)          // Thread 2 (Core 1)
data = 42;   // Store 1       while (flag == 0) {} // Load 1
flag = 1;    // Store 2       print(data);          // Load 2
```

- **ARM**: hardware may reorder Store 1 and Store 2 — `flag=1` could become visible in cache before `data=42` — so Thread 2 could observe `flag==1` and still print garbage for `data`. Requires an explicit barrier on ARM.
- **x86 (TSO)**: the per-core store buffer is strict FIFO, and x86 *never* reorders Store→Store. If Core 1 observes `flag==1`, `data=42` is guaranteed to have already flushed. Always prints 42. (A *compiler* barrier is still required in C++ so the *compiler itself* doesn't reorder the source — but no hardware fence is needed on x86 for this pattern.)

**Worked Example 2 — Store→Load (the one case x86 DOES reorder — the store-buffer trap)**

```c
// Initial: int X = 0; int Y = 0;
// Thread 1 (Core 0)          // Thread 2 (Core 1)
X = 1;         // Store to X  Y = 1;         // Store to Y
int r1 = Y;    // Load from Y int r2 = X;    // Load from X
```

It is legally possible on x86 for **both `r1` and `r2` to end up 0**:

1. Core 0 executes `X=1` — lands in Core 0's private Store Buffer, not yet in L1.
2. Core 1 executes `Y=1` — lands in Core 1's private Store Buffer, not yet in L1.
3. Core 0 executes `r1=Y` — checks shared cache; Core 1's write to `Y` is still trapped in Core 1's store buffer, invisible → sees `Y=0`. `r1 = 0`.
4. Core 1 executes `r2=X` — same story in reverse → `r2 = 0`.
5. Both store buffers eventually flush to L1/L2 — but the reads already completed and returned stale values.

**Fix:** a full memory barrier forces the store buffer to drain *before* the subsequent load is allowed to proceed:
```c
X = 1;
asm volatile("mfence"); // Force-drain the Store Buffer into cache NOW
int r1 = Y;             // Now guaranteed to see any Y write that happened-before this point
```
Equivalently in C++: `std::atomic<int> X; X.store(1, std::memory_order_seq_cst);`

**Key nuance:** on x86, *execution order* inside one core is always sequential — the core genuinely executes `X=1` and then `r1=Y` in program order. What lags is *cache visibility* of the store to other cores, because it sits in the store buffer for a handful of cycles first. It only *looks* like reordering from another core's perspective; it is a visibility-timing artifact, not an actual instruction-order flip.

---

#### 2.6 Instruction-Level Interleaving & Atomics

A single high-level statement like `x++` is **not** one atomic action — it compiles to (at minimum) three separate assembly instructions:

```asm
x++;   // compiles to:
MOV RAX, [x]   ; 1. Fetch
ADD RAX, 1     ; 2. Modify
MOV [x], RAX   ; 3. Store
```

Two threads racing on `x++` with no synchronization can interleave *between* these instructions:

```
Time   Thread A (Core 0)              Thread B (Core 1)
────   ──────────────────             ──────────────────
T1     1. Reads x (sees 5)
T2                                    1. Reads x (sees 5)
T3     2. Increments RAX to 6
T4                                    2. Increments RAX to 6
T5     3. Writes 6 to memory
T6                                    3. Writes 6 to memory
```

Final result: `x == 6`, not `7`. This is the textbook **lost update** race — both threads read the same stale value before either wrote back.

**Why a single instruction can't be interleaved mid-way:** one assembly instruction (`MOV`, `ADD`) is atomic/indivisible with respect to how the pipeline executes on a core — no other instruction can observe a "half-executed" `MOV`.

**The fix — `std::atomic<int> x; x++;` compiles to ONE hardware-atomic instruction:**
```asm
LOCK INC [x]     ; Atomic read-modify-write, directly in memory
```
The `LOCK` prefix makes the hardware lock the specific cache line holding `x` for the duration of the operation — no other core can read or write that line until the `INC` completes, fusing Load+Modify+Store into a single indivisible hardware step. As noted in §2.5, `LOCK`-prefixed instructions also act as a full memory fence.

---

#### 2.7 Speculative Execution, Spectre & Meltdown

Modern CPUs do not execute instructions strictly one-at-a-time waiting for every branch to resolve — that would waste enormous amounts of pipeline throughput. Instead, a **Branch Predictor** guesses which way an `if` will go and starts executing *ahead of time*. If the guess is right, this is a huge speedup. If wrong, the CPU discards the speculative work and rolls back register state. In 2018, researchers discovered this rollback was **incomplete** — it forgot to undo one specific side effect, and that gap is Spectre/Meltdown.

**The vulnerable code pattern (the canonical example):**

```c
// user_array has a real length of 10 bytes
if (user_index < 10) {
    // Speculatively executed by the CPU even if user_index = 1,000,000!
    byte value = kernel_secret_array[user_index];
    byte dummy = probe_array[value * 4096];
}
```

**Step 1 — the setup.** `probe_array` is a 1 MB array split into 256 distinct 4096-byte "pages" — one page per possible byte value (0-255). This is purely a measurement instrument; it holds no real data.

**Step 2 — the 6-step speculative pipeline trace:**

```
1. CPU sees `if (user_index < 10)`.
   (user_index lives in RAM, so resolving this check itself takes ~100ns)
              ▼
2. BRANCH PREDICTOR GUESSES: "It's probably true!" (trained by many prior
   in-bounds calls) — CPU speculatively executes the body IMMEDIATELY,
   without waiting for the check to actually resolve.
              ▼
3. CPU speculatively reads kernel_secret_array[1,000,000].
   Gets byte value 65 ('A'). `secret` = 65 (exists only in an internal,
   invisible micro-architectural register — never a real C variable).
              ▼
4. CPU executes probe_array[65 * 4096] — fetches page 65 of probe_array
   from RAM and loads it into L1 CACHE.
              ▼
5. CPU FINALLY finishes checking `user_index < 10`.
   "Wait — 1,000,000 is NOT < 10! This was a misprediction!"
              ▼
6. CPU ROLLS BACK REGISTERS: `secret` and `dummy` are erased from
   registers. NO crash, no exception is raised in user space.
              ▼
BUT: the CPU erased the REGISTERS — it did NOT evict page 65 of
probe_array from the physical L1 CACHE. That footprint survives.
```

**Common Pitfall — the single most important corrected misconception in this whole topic: "Why doesn't checking the index myself (e.g. `if (user_index < 2000000)`) protect me, or at least crash the program?"**

The answer hinges on whether the branch was predicted *correctly* or *incorrectly*, not on whether a check exists at all:

| Condition result | Was the branch predicted correctly? | Does the CPU roll back? | Does the MMU raise SIGSEGV? | Can the attacker read the cache? |
|---|---|---|---|---|
| Evaluates to **TRUE** | Yes — no misprediction | No — execution commits normally | **YES.** Program dies instantly at the permission check. | No — the program is dead. |
| Evaluates to **FALSE**, but predictor guessed TRUE | No — misprediction | **YES** — entire speculative pipeline is flushed | **NO** — the pending exception is squashed along with everything else the CPU speculated | **YES** — program is still alive and can measure the cache. |

- If `user_index < 10` genuinely evaluates **true**, the CPU never had to guess — it commits the read normally, the MMU's real permission check fires as usual, and the process dies with `SIGSEGV` *before* the `probe_array` line ever truly executes.
- If it evaluates **false but the predictor guessed true** (the actual attack: `user_index = 1,000,000` fails `< 10`, but a predictor trained on thousands of prior in-bounds calls guesses "probably true" and runs ahead speculatively): the CPU speculatively executes the whole body, including the cache-loading line, and only *then* discovers the misprediction. **On any misprediction, the CPU squashes the entire speculative pipeline — including any pending fault/exception that was raised during that speculative window.** The permission-violation fault that *would* have fired is silently discarded along with the rest of the speculative work. The program does not crash. It quietly continues to the next instruction, alive — and the attacker can now run the timing side channel.

**Why CPUs are built this way at all (the deeper "why"):** ordinary, everyday code constantly executes speculative branches that touch memory hypothetically invalid at that exact moment:
```c
if (ptr != NULL) {
    int x = *ptr; // If ptr IS null, this would be a bad read
}
```
If `ptr` happens to be null, the CPU may speculatively begin executing `*ptr` before the `!= NULL` check has fully resolved — that speculative read would, taken in isolation, be a null-pointer fault. If hardware crashed a program on every wrong branch guess, ordinary software would crash constantly under normal operation. So a strict pipeline rule was built in: *any exception raised during non-committed (speculative) execution must be held pending and silently discarded if the speculation turns out wrong; it only becomes a real, delivered fault if the instruction actually commits.* **The flaw Spectre/Meltdown exploited: while rolling back registers and squashing the fault, the designers forgot to also roll back the physical L1 cache state** — leaving a side channel.

**Step 3 — the timing side-channel readout:**

```c
// The attacker tests every possible byte value (0 through 255)
for (int i = 0; i < 256; i++) {
    uint64_t start = __rdtsc();                  // Start cycle counter
    volatile byte val = probe_array[i * 4096];    // Touch index i
    uint64_t elapsed = __rdtsc() - start;         // Measure time

    if (elapsed < 50) {                           // FAST! (~5 cycles = L1 hit)
        printf("Leaked secret byte: %d\n", i);
    }
}
```

```
Read probe_array[0 * 4096]    ->  100 ns (Slow)  -> RAM (cache miss)
...
Read probe_array[65 * 4096]   ->    1 ns (FAST!) -> L1 CACHE HIT! <- leaked!
...
Read probe_array[255 * 4096]  ->  100 ns (Slow)  -> RAM (cache miss)
```

Only index 65 returns fast — meaning `secret` must have been 65 (`'A'`). Repeating this in a loop, one full 256-probe cycle at a time, dumps kernel memory one byte at a time.

**Note on "secret" as a variable:** in true (non-speculative) execution, an out-of-bounds check makes the `{ ... }` block never run per normal C semantics, so `secret` is never created in the source-level sense. The C statements exist so the compiler emits the two assembly reads the CPU can execute speculatively; `secret` momentarily exists only inside an internal micro-architectural register invisible to the C program, and is wiped on rollback. The attacker never observes `secret` directly — only infers its value afterward via cache timing.

---

#### 2.8 KPTI (Kernel Page Table Isolation) — The Fix

**Why Meltdown specifically was possible:** the kernel historically mapped kernel RAM into the *top half* of every process's page table (marked Ring-0-only), purely as a performance optimization — so a syscall entry didn't need to reload CR3 (reloading CR3 flushes the TLB, which is expensive). The CPU trusted software to respect the privilege bit on that mapping — but speculative execution read the data *before* the permission bit check had resolved.

```
WITHOUT KPTI (old way):
┌───────────────────────────────────────────┐
│ Kernel Space (Ring 0 Memory)               │  <- CPU could speculatively read this!
├───────────────────────────────────────────┤
│ User Space (Ring 3 Memory)                 │
└───────────────────────────────────────────┘
      Single page table shared by User & Kernel

WITH KPTI (new way):
   User Page Table (Ring 3)                          Kernel Page Table (Ring 0)
┌────────────────────────────┐                    ┌────────────────────────────┐
│ Kernel Stubs Only (Minimal) │                    │ Full Kernel Space Memory   │
├────────────────────────────┤                    ├────────────────────────────┤
│ User Space Memory           │                    │ User Space Memory           │
└────────────────────────────┘                    └────────────────────────────┘
```

While running in Ring 3, CR3 points at a page table with **no kernel mapping entries at all** — so even a mispredicted, speculative read of a kernel address has no physical frame to translate to; the MMU has nothing to fetch:

```
WHEN EXECUTING IN USER MODE (Ring 3):
CR3 -> USER PAGE TABLE
  0x0000_0000-0x7FFF_FFFF -> User (Ring 3): User code, stack, heap
  0xFFFF_8000-0xFFFF_FFFF -> UNMAPPED! (no entries exist at all)
```

**How the two page tables are actually stored and switched:**

```c
struct task_struct {
    struct mm_struct *mm;   // Pointer to process memory layout
};
struct mm_struct {
    pgd_t *pgd;              // Pointer to the Page Global Directory (root page table)
};
```

KPTI allocates a **contiguous pair** of 4 KB PGD pages instead of one:

```
         PGD Memory Buffer (8 KB Total)
┌──────────────────────────────────────────┐
│ 1. Kernel PGD (4 KB)                      │  <- pointed to by mm->pgd
│    Contains: Full User Space + Full Kernel│
├──────────────────────────────────────────┤
│ 2. User PGD (4 KB)                        │  <- calculated as (mm->pgd + 1)
│    Contains: Full User Space + Minimal Stubs│
└──────────────────────────────────────────┘
```

Because the two tables are laid out adjacently, **bit 12 of the CR3 physical address toggles between them**:

```
                CR3 Register Value
     ┌────────────────────────────────────┬────┐
     │ Physical PGD Address (Bits 63..12)  │ B12│  <- Bit 12 toggles which table!
     └────────────────────────────────────┴────┘
                                            │
              ┌─────────────────────────────┴─────────────────────────────┐
              ▼                                                           ▼
     Bit 12 = 0 (Kernel PGD)                                     Bit 12 = 1 (User PGD)
```

Kernel entry trampoline assembly on every syscall:
```asm
; Switch CR3 from User PGD to Kernel PGD
MOV RAX, CR3
AND RAX, ~(1 << 12)   ; Clear bit 12 -> CR3 now points at the Kernel PGD
MOV CR3, RAX           ; Full kernel memory is now visible
```
On `sysret`, bit 12 flips back to 1 before returning to Ring 3, hiding kernel memory again.

**Performance cost:** every CR3 write flushes the TLB. Without KPTI, a syscall left CR3 unchanged and the TLB stayed warm. With KPTI, every syscall/interrupt/context-switch forces **two** CR3 writes (enter + exit) — measured at roughly **5%-30% slower syscalls**, depending on workload (syscall-heavy workloads, e.g. high-throughput I/O servers, feel it the most).

**Software mitigations beyond KPTI:**
1. **Defensive `lfence`**: inserting `_mm_lfence();` right after a bounds check forces the CPU to fully resolve the branch condition before any subsequent instruction is allowed to execute speculatively — closing the specific speculative window an attacker needs.
2. **Speculation-safe masking** (no branch to mispredict at all):
   ```c
   uintptr_t mask = array_index_nospec(user_index, 10); // all-1s if in-bounds, else 0
   byte secret = kernel_memory[user_index & mask];       // masked to a safe address either way
   ```
3. **KPTI** (described above) — the OS-level fix, always on by default on patched kernels.

---

#### 2.9 NUMA (Non-Uniform Memory Access)

**Phase 1 — the old world: UMA / Symmetric Multiprocessing**

```
        ┌───────────┐                 ┌───────────┐
        │  Core 0   │                 │  Core 1   │
        └─────┬─────┘                 └─────┬─────┘
              │                             │
              └──────────────┬──────────────┘
                             │ System Bus (FSB)
                             ▼
                    ┌─────────────────┐
                    │   NORTHBRIDGE   │
                    │ (Mem Controller)│
                    └────────┬────────┘
                             │ Memory Bus
                             ▼
                  ┌─────────────────────┐
                  │ PHYSICAL RAM (DRAM) │
                  └─────────────────────┘
```

All cores were architecturally identical, sharing a single bus and a single memory controller — every core saw identical latency to every byte of RAM (**Uniform** Memory Access). The bottleneck: as core counts grew (4, 8, 16+ cores), every core fought over the same single bus — a traffic jam regardless of how fast any individual core was.

**Phase 2 — NUMA: the memory controller moves onto the CPU die, RAM is physically split per socket**

```
┌───────────────────────────────────────┐          ┌───────────────────────────────────────┐
│              NUMA NODE 0               │          │              NUMA NODE 1               │
│  ┌────────────┐   ┌────────────┐      │          │  ┌────────────┐   ┌────────────┐       │
│  │   Core 0   │   │   Core 1   │      │          │  │   Core 2   │   │   Core 3   │       │
│  └─────┬──────┘   └─────┬──────┘      │          │  └─────┬──────┘   └─────┬──────┘       │
│        │  L1/L2 Cache   │              │Interconnect       │  L1/L2 Cache  │               │
│        └───────┬────────┘              │(UPI / Infinity    │        └──────┬───────┘       │
│                ▼                       │ Fabric)           │               ▼               │
│    ┌──────────────────────┐            │                   │   ┌──────────────────────┐   │
│    │ Integrated Memory     ├───────────┼───────────────────┼──►│ Integrated Memory     │   │
│    │     Controller        │◄──────────┼───────────────────┼───┤     Controller        │   │
│    └───────────┬───────────┘           │                   │   └───────────┬───────────┘   │
└────────────────┼───────────────────────┘                   └────────────────┼───────────────┘
                 │ Local Memory Bus                                            │ Local Memory Bus
                 ▼                                                             ▼
     ┌─────────────────────┐                                       ┌─────────────────────┐
     │ PHYSICAL RAM NODE 0 │                                       │ PHYSICAL RAM NODE 1 │
     │  (Local to Socket 0)│                                       │  (Local to Socket 1)│
     └─────────────────────┘                                       └─────────────────────┘
```

- **Local access**: a core reads RAM attached to its own socket's memory controller — **~60-80 ns**.
- **Remote access**: a core reads RAM attached to the *other* socket — the request crosses the inter-socket interconnect (Intel UPI / AMD Infinity Fabric) to the remote controller and back — **~100-160 ns**, roughly **1.5-2.5x slower** than a local access.

**First-Touch policy — the classic NUMA bug:** `malloc()` only reserves *virtual* memory; the kernel does not decide which physical NUMA node backs a page until the **first write** to it (this is the same lazy-allocation mechanism as ordinary page faults — see the Virtual Memory Management topic). Whichever core's thread *first touches* a given page determines which node's physical RAM it lands on.

**The classic bug this causes:** a single initialization thread on Socket 0 loops through and zero-fills a 100 GB array before spawning 32 worker threads split across both sockets. Because Socket-0's thread touched every byte first, **all 100 GB lands on Node 0's physical RAM** — even though half the worker threads later processing that data live on Socket 1, forcing every one of their accesses to be a slow remote read.

**NUMA-aware OS mechanisms:**
1. **First-Touch policy** (above) — the default, and the source of the bug above if you're not careful about which thread initializes memory.
2. **Automatic NUMA Balancing**: the kernel periodically revokes read/write permission on pages to force silent page faults, inspects which core actually faulted on each page, and — if a page is being hammered from the "wrong" socket — silently migrates the physical page to the node doing the accessing.
3. **Explicit software control — CPU pinning & memory binding:**
   ```bash
   # Force 'my_app' to run ONLY on Socket 0's cores and allocate memory ONLY on RAM Node 0
   numactl --cpunodebind=0 --membind=0 ./my_app
   ```
   ```c
   #define _GNU_SOURCE
   #include <sched.h>
   #include <numa.h>

   // 1. Lock the current thread strictly to Core 0 (Socket 0)
   cpu_set_t mask;
   CPU_ZERO(&mask);
   CPU_SET(0, &mask);
   sched_setaffinity(0, sizeof(mask), &mask);

   // 2. Allocate memory specifically on NUMA Node 0
   void* ptr = numa_alloc_onnode(1024 * 1024, 0);
   ```
   This exact pattern — pin the thread, then pin its memory to the same node — is what production **databases (PostgreSQL, Redis) and low-latency trading systems** use to bypass the scheduler's guesses and guarantee every hot-path access stays local.

**NUMA summary checklist:**

| Concept | What it means |
|---|---|
| Local Access | Core reading RAM directly attached to its own socket (~60-80 ns) |
| Remote Access | Core reading RAM attached to a different socket via interconnect (~100-160 ns) |
| Thread Migration | OS scheduler moving a thread to a different core for load balancing/thermals — can flip local access to remote if it crosses sockets |
| First-Touch Rule | Physical RAM is bound to the NUMA node of whichever core *first writes* to that virtual page |
| CPU Affinity (`numactl`/`sched_setaffinity`) | Pinning a thread — and its memory — to a specific NUMA node to guarantee local access |

**Why this matters for low-latency systems:** a context switch that migrates a thread across sockets (see the CPU Execution Model topic) doesn't just cost the register-save/restore and cold L1/L2 — it can silently double or triple every subsequent memory access latency for that thread's *entire remaining working set*, until the OS's automatic balancing (if enabled) gets around to migrating the pages, which itself is not free. This is precisely why HFT platforms, DPDK-based packet processors, and in-memory databases treat CPU pinning and NUMA-aware allocation as non-negotiable, not an optional tuning knob.

**End of Topic 2: CPU Caches, Memory Ordering & NUMA**
