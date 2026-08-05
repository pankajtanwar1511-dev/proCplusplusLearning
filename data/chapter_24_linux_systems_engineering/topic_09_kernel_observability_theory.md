## TOPIC: Kernel Observability & Debugging - strace, /proc, perf & eBPF

### THEORY_SECTION: Watching the Kernel Without Crashing Production

Everything a running process does eventually crosses the User Space / Kernel Space boundary — every file read, every allocation, every network packet. Observability tooling exists to let you watch that boundary from the outside, at wildly different price points: some tools pause the target process on every single syscall (fine in a debugger session on your laptop, catastrophic on a live trading server), others read passive kernel bookkeeping that already exists in RAM, and the newest generation runs your inspection code *inside* the kernel itself at native speed. Picking the wrong tool for the job is itself a production incident waiting to happen — this topic is about knowing exactly which one to reach for, and precisely why each one costs what it costs.

---

#### 9.1 `strace` — Syscall Tracing via `ptrace()`

`strace` is not kernel magic — it is an ordinary user-space program that uses the `ptrace()` syscall to make the kernel pause your target process at every syscall boundary and hand control to `strace` instead.

```
[ USER SPACE ]
   strace (Tracer) <--- ptrace(PTRACE_SYSCALL) ---> my_program (Tracee)
         │                                                 │
─────────┼─────────────────────────────────────────────────┼─────────
[ KERNEL SPACE ]                                           │
         │                                          Executes `write()`
         │                                                 │
         └───────────── Kernel pauses Tracee ──────────────┘
                       Notifies Tracer via SIGTRAP
```

**Step-by-step mechanism:**

1. `strace` calls `ptrace(PTRACE_ATTACH, target_pid)` — kernel marks the target as a traced child of `strace`.
2. `strace` calls `ptrace(PTRACE_SYSCALL, target_pid)` — arms a trap for the *next* syscall entry or exit.
3. **Entry trap**: just before the tracee actually enters kernel mode for a syscall, the CPU hits the trap. The kernel freezes the tracee and delivers `SIGTRAP` to `strace`.
4. `strace` reads the tracee's CPU registers directly (via another `ptrace(PTRACE_GETREGS, ...)` call): `RAX` = syscall number, `RDI`/`RSI`/`RDX` = the first three arguments (System V ABI — the same register convention established for ordinary function calls). It decodes and prints e.g. `write(1, "hello", 5)`.
5. `strace` resumes the tracee with `ptrace(PTRACE_SYSCALL, ...)` again, arming the **exit** trap.
6. **Exit trap**: the kernel pauses the tracee again the instant the syscall returns, before control goes back to user code. `strace` reads `RAX` (now holding the return value) and prints `= 5`.
7. Repeat for every single syscall, for the life of the process.

**Common Pitfall:** each syscall now costs **two extra context switches** (into `strace`, back out) instead of zero. Measured overhead is commonly **10x–100x** slower depending on syscall density. **Never run raw `strace` against a hot path in production** — you will not just observe the slowdown, you may cause the very timeout or SLA breach you were trying to diagnose. `strace -c` (aggregate counts only, no live printing) and running against a *non-production* replica are the standard workarounds.

---

#### 9.2 `/proc` — The Kernel's Live State, Exposed as a Filesystem

`/proc` is a **pseudo-filesystem**: nothing under it exists on disk. Every read is generated on the fly by walking live kernel structures — `cat /proc/1234/maps` routes through the VFS to the `procfs` driver, which reads PID 1234's `task_struct` → `mm_struct` → walks its VMA list and formats it as text, right at the moment you read it.

```
ADDRESS                   PERMS OFFSET  DEV   INODE      PATH
00400000-00452000         r-xp 00000000 08:01 1234567    /bin/my_app       (Text Segment)
00651000-00652000         rw-p 00051000 08:01 1234567    /bin/my_app       (Data Segment)
010b5000-010d6000         rw-p 00000000 00:00 0          [heap]
7ffda5a22000-7ffda5a43000 rw-p 00000000 00:00 0          [stack]
```

Because there's no disk I/O and no context switch into a traced target's syscall path, reading `/proc` costs **near zero** overhead — it's the safest observability tool that exists, safe to script against production continuously.

Key files worth memorizing:

| Path | Contents |
|---|---|
| `/proc/PID/maps` | The process's full VMA list (segments, permissions, backing file) |
| `/proc/PID/cmdline` | The exact argv the process was launched with |
| `/proc/PID/fd/` | One symlink per open file descriptor, pointing at the real target |
| `/proc/PID/status` | Human-readable summary: `VmSize` (virtual size), `VmRSS` (resident/physical), state |
| `/proc/PID/smaps` | Per-VMA breakdown of dirty/clean/shared/swap bytes — the tool for "why is RSS so high" |
| `/proc/PID/mem` | The process's actual memory, byte-addressable (requires `ptrace` permission — this is how `gdb` reads variables) |

---

#### 9.3 `perf` and `eBPF` — Near-Zero-Overhead Kernel-Resident Tracing

`perf` reads hardware Performance Monitoring Unit (PMU) counters directly from CPU silicon (cache misses, branch mispredicts, instructions retired) plus static kernel tracepoints — very low overhead (**<1-2%**) because it's mostly *sampling*, not trapping every event.

**eBPF** goes further: it lets you load a small, verified program that runs **inside the kernel itself**, attached directly to the event you care about, with **zero context switches** to user space at all.

```
[ USER SPACE ]           bpftrace / bcc / falco
                              │ (Load BPF Bytecode)
─────────┬────────────────────┼──────────────────────────────
[ KERNEL SPACE ]              v
               ┌──────────────────────────────┐
               │    eBPF In-Kernel JIT VM      │
               └──────────────┬───────────────┘
                              │ Attached to:
               ┌──────────────┼──────────────┐
               ▼              ▼              ▼
           kprobes        tracepoints    raw_tracepoints
        (Kernel Funcs) (Static Hooks) (Syscall Entry)
```

**Step-by-step mechanism:**

1. Write a small script (C, Python via `bcc`, or a dedicated language like `bpftrace`) that compiles down to eBPF bytecode.
2. The kernel's **eBPF Verifier** statically analyzes the bytecode before allowing it to load — proves it terminates (no unbounded loops), never dereferences an unchecked pointer, and stays within a bounded instruction budget. This is what makes it safe to run arbitrary tracing code in kernel context at all.
3. The verified bytecode is **JIT-compiled** to native machine code for the host CPU.
4. It's attached to a `kprobe` (a dynamic hook on almost any kernel function), a static `tracepoint` (a hook the kernel developers deliberately placed at a stable point), or a `raw_tracepoint`/syscall entry.
5. On the hooked event, the compiled program runs **inline, in kernel context, at native speed** — no context switch, no pausing the target process — and writes results into a lock-free ring buffer that user space reads asynchronously.

This is why `eBPF`-based tools (e.g. `bpftrace`, Cilium, Falco) are the modern standard for **production** tracing and security monitoring: you get `strace`-level visibility into kernel behavior with none of the `strace`-level cost.

---

#### 9.4 `ltrace` — Library-Call Tracing (and Why It's Fallen Out of Favor)

`ltrace` uses the same underlying `ptrace()` interception mechanism as `strace`, but traps calls at a different boundary: instead of the syscall entry point, it intercepts calls into **shared library functions** (`malloc`, `strcpy`, `printf`, any exported symbol from `libc.so` or another `.so`). It works by rewriting the dynamic symbol table (PLT/GOT) entries to redirect through `ltrace` first.

```
Program calls malloc(64)
        │
        ▼
[ PLT/GOT redirected entry ] ──► ltrace intercepts, logs "malloc(64)", times it
        │
        ▼
Real malloc() executes, returns pointer
        │
        ▼
ltrace logs "= 0x55a1000", hands control back
```

**Common Pitfall / honest note:** `ltrace`'s interception via PLT/GOT rewriting is fragile against modern binary hardening (statically-linked binaries, `-fno-plt`, aggressive inlining/LTO can hide the call entirely), and the project has seen far less active maintenance than `strace` in recent years. In practice, most engineers today reach for `strace` (for syscall-level questions) or `perf`/`eBPF` uprobes (for library-call-level questions on modern hardened binaries) rather than `ltrace`. It's still worth knowing what it is and why it exists, but don't expect it to be the first tool reached for on a modern production system.

---

#### 9.5 `gdb` — Interactive Debugging via `ptrace` and Debug Registers

`gdb` is built on the same `ptrace()` primitive as `strace`/`ltrace`, but uses a much richer set of `ptrace` requests to actually control and inspect execution, not just log it:

| `ptrace` request | What it does |
|---|---|
| `PTRACE_ATTACH` | Attach to a running PID, pausing it |
| `PTRACE_PEEKTEXT` / `PTRACE_POKETEXT` | Read/write a word of the target's memory (also reachable via `/proc/PID/mem`) |
| `PTRACE_GETREGS` / `PTRACE_SETREGS` | Read/write the target's full register set |
| `PTRACE_CONT` | Resume execution until the next trap/signal |
| `PTRACE_SINGLESTEP` | Execute exactly one instruction, then re-trap |

**Two breakpoint mechanisms, with very different cost/precision tradeoffs:**

**Software breakpoints** (the default for `break some_function`):
```
1. gdb reads the original byte at the target instruction address (PTRACE_PEEKTEXT).
2. gdb overwrites that byte with 0xCC (the INT3 "software interrupt" opcode) via PTRACE_POKETEXT.
3. When the CPU fetches and executes 0xCC, it raises a trap -> kernel delivers SIGTRAP -> gdb regains control.
4. To continue, gdb restores the original byte, single-steps one real instruction, re-inserts 0xCC, and resumes.
```
**Common Pitfall:** this literally **modifies the running binary's code page** in memory. Because code pages are typically mapped `MAP_PRIVATE` and shared read-only across every process running that binary, the kernel's Copy-on-Write mechanism (established in the Virtual Memory topic of this chapter) kicks in the instant `gdb` writes to it — the debugged process gets its own private physical copy of that one 4 KB page, while every *other* process still running the same binary keeps seeing the original, unmodified code.

**Hardware breakpoints/watchpoints** (`watch some_variable`): use the **debug registers `DR0`–`DR3`** (address registers) and `DR7` (control register) directly in CPU silicon — the same registers this chapter's CPU Execution Model topic noted are saved/restored only when a debugger is attached. The CPU itself compares every memory access against the loaded addresses and traps on a match, **with no code modification at all** — this is the only way to set a true *data* watchpoint ("stop when this variable's value changes"), since there's no instruction to patch for a plain memory read/write.

A minimal worked example — attaching to an already-running process and inspecting where it's stuck:
```bash
gdb -p 4521                 # PTRACE_ATTACH to PID 4521, freezes it immediately
(gdb) bt                    # Backtrace: walks the stack using RBP/RSP to print the call chain
(gdb) info registers        # Dump RIP, RSP, RAX-R15 at the exact frozen instant
(gdb) print my_variable     # Reads the value via PTRACE_PEEKTEXT / /proc/PID/mem
(gdb) detach                # PTRACE_DETACH — resumes the process exactly where it was frozen
```

---

#### 9.6 `dmesg` and the Kernel Ring Buffer

Kernel code (drivers, the memory manager, the scheduler) logs diagnostic messages via `printk()`, which writes into a fixed-size **in-kernel circular buffer** — not a file on disk, not `/proc` either, a dedicated ring buffer maintained by the kernel from boot onward. `dmesg` simply reads that buffer out.

Each message carries a **log level**, from most to least severe:

| Level | Macro | Meaning |
|---|---|---|
| 0 | `KERN_EMERG` | System is unusable |
| 1 | `KERN_ALERT` | Action must be taken immediately |
| 2 | `KERN_CRIT` | Critical condition |
| 3 | `KERN_ERR` | Error condition |
| 4 | `KERN_WARNING` | Warning condition |
| 5 | `KERN_NOTICE` | Normal but significant |
| 6 | `KERN_INFO` | Informational |
| 7 | `KERN_DEBUG` | Debug-level messages |

`dmesg` is the **first place to check** for exactly the kind of hardware- and memory-adjacent failures this chapter cares most about — most notably the **OOM Killer** (covered in the Virtual Memory Management topic: when combined memory demand exceeds RAM+swap, the kernel picks a victim process by an internal `oom_score` and sends it `SIGKILL`). A real OOM-kill leaves an unmistakable trail:

```
[123456.789012] Out of memory: Killed process 4521 (my_server) total-vm:10485760kB,
                 anon-rss:4194304kB, file-rss:0kB, shmem-rss:0kB, UID:1000 pgtables:8192kB
                 oom_score_adj:0
```

Also the canonical first stop for driver/hardware errors (disk I/O errors, NIC link flaps, thermal throttling events) that never show up in application-level logs at all, because they're detected below the application entirely.

---

#### 9.7 Choosing the Right Tool — A Production Decision Framework

| Situation | Reach for | Why |
|---|---|---|
| "Why is this one syscall failing / what file is it opening?" (dev/staging) | `strace` | Full syscall visibility; overhead is acceptable off production |
| Process is hung or crashed right now, need to see where | `gdb -p <pid>` + `/proc/PID/status` | Freezes and inspects exact register/stack state |
| Continuous production monitoring, need near-zero overhead | `perf` / `eBPF` (`bpftrace`) | Runs in-kernel or samples PMU counters; safe at scale |
| "Why is this process's memory so high?" | `/proc/PID/smaps` + `/proc/PID/maps` | Zero-cost read of live kernel bookkeeping, no tracing needed |
| System suddenly killed a process, or a driver/disk is misbehaving | `dmesg` | The one place OOM kills and hardware errors are unconditionally logged |
| Need to see which library function is slow, on an unhardened binary | `ltrace` (situational) | Works, but expect it to miss calls on modern hardened/statically-linked binaries |
| Need a live, safe watchpoint on a specific variable's value | `gdb` hardware watchpoint (`DR0`-`DR7`) | No code-page modification, true data-triggered trap |

**The single unifying rule:** the closer a tool sits to *pausing* the target process on every event (`strace`, `ltrace`, software breakpoints), the higher and less predictable its overhead — reserve those for development and incident response, never for steady-state production. The closer a tool sits to *passively reading* existing kernel state (`/proc`) or *running inline in the kernel* (`eBPF`), the safer it is to leave running continuously in production.

---

#### 9.8 Summary Table — Full Tool Comparison

| Tool | How it works | Perf impact | Use case |
|---|---|---|---|
| `strace` | `ptrace()` traps syscall entry/exit | Very high (10x-100x) | Debugging missing files/failing syscalls in dev |
| `ltrace` | `ptrace()` + PLT/GOT rewrite traps library calls | High, and increasingly unreliable on hardened binaries | Library-call tracing, situational |
| `/proc` | Pseudo-fs reading `task_struct`/`mm_struct` from RAM | Near zero | Inspecting memory layout, open FDs, status |
| `gdb` | `ptrace()` + software (`INT3`) or hardware (`DR0-DR7`) breakpoints | High while attached/stepping | Interactive debugging, crash/hang inspection |
| `dmesg` | Reads the kernel's in-memory circular log buffer | Near zero | OOM kills, hardware/driver errors |
| `perf` | HW performance counters (PMU) + tracepoints | Very low (<1-2%) | CPU profiling, cache-miss analysis |
| `eBPF` | In-kernel sandboxed JIT bytecode on probes | Near zero | Production tracing, low-overhead net/security |

**End of Topic 9: Kernel Observability & Debugging**
