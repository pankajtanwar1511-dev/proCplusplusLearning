## TOPIC: Docker & Container Internals - Namespaces, cgroups & OverlayFS

### THEORY_SECTION: A Container Is Just a Process Wearing Six Disguises

#### 10.1 The Core Insight — There Is No "Container" in the Kernel

The single most important fact to internalize before anything else: **the Linux kernel has no concept of a "container."** There is no `struct container`, no container scheduler, no container syscall. When you run `docker run nginx`, the kernel creates exactly the same thing it always creates for any new program: a `task_struct` (see Topic 3 of this chapter — Process Management). The "container" is 100% a user-space illusion, built entirely out of three primitives you can use yourself with zero Docker installed:

1. **Namespaces** — make the process *see* a private, filtered view of a global kernel resource (its own PID tree, its own network stack, its own mounts, ...).
2. **cgroups** — put a hard ceiling on how much of a *shared* physical resource (CPU, RAM, disk I/O) that process (and its children) may consume.
3. **A filesystem trick (OverlayFS + `chroot`/`pivot_root`)** — make `/` inside the process look like a totally different, isolated directory tree.

Nothing here is hardware virtualization. Compare directly against a VM:

```
┌──────────────────────────────────────┐       ┌──────────────────────────────────────┐
│              VIRTUAL MACHINE          │       │               CONTAINER                │
├──────────────────────────────────────┤       ├──────────────────────────────────────┤
│  [ Guest App ]                        │       │  [ Container Process (task_struct) ]  │
│  [ Guest Kernel (own, full copy!) ]   │       │       (namespaces + cgroup applied)   │
│  ───────────── Hypervisor ─────────── │       │  ──────────────────────────────────  │
│  [ Virtual CPU / Virtual NIC / ... ]  │       │            (nothing here —            │
│  ───────────── Host Kernel ────────── │       │        it's a normal task_struct)     │
│  [ Physical Hardware ]                │       │  ─────────────── Host Kernel ──────── │
└──────────────────────────────────────┘       │  [ Physical Hardware ]                │
                                                └──────────────────────────────────────┘
Boot time: seconds (own kernel boots)                    Boot time: milliseconds (just fork+exec)
Isolation: strongest (separate kernel, HW-enforced)       Isolation: weaker (ONE shared kernel — a
                                                           kernel exploit can escape ALL containers)
Overhead: full guest OS memory/CPU footprint              Overhead: near-zero (just one process)
```

**Why this matters for the interview**: "How isolated is a container really?" is a classic senior-level question. The honest answer is: *exactly as isolated as its namespaces + cgroup + capability/seccomp configuration make it, and not one bit more* — because underneath, it's sharing the literal same kernel, same `struct task_struct` machinery, same scheduler (Topic 3), same page-fault handler (Topic 4), as every other process on the box. A kernel-level vulnerability is a cross-container vulnerability by construction, unlike a VM where the hypervisor is a genuine hardware-enforced wall.

---

#### 10.2 Namespaces — Six Different Lenses on the Same Kernel

A namespace does not create new kernel objects — it creates a **new, private INSTANCE** of a global table that the process's `task_struct` is pointed at instead of the host's default (`init`) instance. `clone()` (the same syscall that creates threads via `CLONE_VM`/`CLONE_FILES`, covered in Topic 3) takes additional `CLONE_NEW*` flags to create one or more of these six.

```c
// Simplified: creating a new process in 4 of the 6 namespaces at once
int flags = CLONE_NEWPID | CLONE_NEWNET | CLONE_NEWNS | CLONE_NEWUTS | SIGCHLD;
pid_t container_init_pid = clone(container_entrypoint, child_stack, flags, NULL);
```

`unshare(2)` does the same thing for an *already-running* process (detach yourself from the namespaces you currently share and get fresh private ones) — this is what `unshare` the CLI tool and early container runtimes used before `clone()`-with-flags became the norm.

##### 10.2.1 PID Namespace (`CLONE_NEWPID`) — "I Am Process 1"

Inside a PID namespace, the first process created gets **PID 1** — exactly like real `init`/`systemd` on a bare-metal boot. It becomes the reaper of orphaned processes *inside that namespace* and, critically, **if PID 1 inside the namespace dies, the kernel kills every other process in that namespace too** — this is the actual mechanism behind "the container exits when your entrypoint process exits."

The key trick: **one `task_struct` can have multiple PID values simultaneously** — one per PID namespace it's nested inside, from the initial (host) namespace down to its own. The kernel structure isn't literally "`pid_t pid;`" as a single int (that was the Topic 3 simplification) — it's really a small list of `(namespace, id)` pairs:

```
Host View (initial PID namespace):           Container's OWN View (its PID namespace):
┌──────────────────────────┐                  ┌──────────────────────────┐
│ task_struct               │                  │        SAME task_struct  │
│ pid in init_ns:  4821     │ ◄──── same task ────► │ pid in container_ns: 1    │
└──────────────────────────┘                  └──────────────────────────┘
```
`ps aux` on the HOST shows PID 4821. `ps aux` run INSIDE the container shows PID 1. Both are looking at the exact same `task_struct` — just resolving its identity through a different namespace's ID table. PID namespaces can be nested arbitrarily deep (a container running its own container gets a 3rd, even more private, PID 1).

##### 10.2.2 NET Namespace (`CLONE_NEWNET`) — Its Own Private Network Stack

A private routing table, private set of network interfaces, private iptables/nftables rule set, private `/proc/net`, private listening-socket port space (two containers can BOTH bind port 80 with zero conflict — they're in different netns). A freshly created network namespace starts with **only a loopback interface (`lo`), and it's DOWN by default** — a brand-new netns cannot reach the outside world or even itself over TCP until you wire it up.

The wiring mechanism — a `veth` (virtual ethernet) pair plus a bridge — is the exact same primitive covered in full in Topic 8 of this chapter (The Linux Network Stack): one end of the veth pair is moved into the container's netns (becomes `eth0` inside the container), the other end stays in the host's netns, plugged into a Linux bridge (`docker0` by default). See Topic 8 for the full packet-level walkthrough of how a veth pair works and how the bridge forwards frames — the mechanism is identical, Docker just automates the `ip netns`/`ip link`/`brctl` commands you'd otherwise type by hand.

##### 10.2.3 MNT Namespace (`CLONE_NEWNS`) — Its Own Private `/`

Isolates the **mount table** — the list of "what filesystem is mounted at what path." A process in its own MNT namespace can `mount`/`umount` things without those changes being visible to (or coming from) the host's mount table at all.

This is the primitive that makes a container's `/` look like an entirely different filesystem tree from the host's `/`. The container runtime does roughly:
```
1. clone(CLONE_NEWNS | ...)                       // private mount table
2. Build/locate the OverlayFS "merged" view (10.4 below) at e.g. /var/lib/docker/.../merged
3. pivot_root(new_root, put_old)                  // swap what "/" MEANS for this process
   // (older/simpler tools use chroot() instead — pivot_root is the modern, safer version
   //  because it keeps the old root reachable-but-unmounted rather than just re-pointing "/")
4. Unmount/hide the old root from the new mount namespace entirely
```
After this, every relative and absolute path the containerized process resolves — `/etc/passwd`, `/usr/bin/python3`, `/tmp` — walks the VFS (Topic 5 of this chapter) starting from the OverlayFS merged directory, not the host's real `/`. The VFS/inode/dentry machinery itself doesn't change at all — only which mount table root it starts walking from.

##### 10.2.4 IPC Namespace (`CLONE_NEWIPC`) — Its Own Private IPC Objects

Isolates System V IPC identifiers: shared memory segments (`shmget`), semaphore sets, message queues, plus POSIX message queues. Recall from Topic 5 of this chapter that `shm_open`/`mmap(MAP_SHARED)` shared memory works by two processes' page tables pointing at the same physical RAM frame — an IPC namespace simply means two containers' shared-memory *identifier tables* are entirely separate, so container A cannot accidentally (or maliciously) attach to a shared-memory segment container B created, even if it somehow guessed the right key — the key itself is looked up in a namespace-private table, not a global one.

##### 10.2.5 UTS Namespace (`CLONE_NEWUTS`) — Its Own Hostname

The simplest of the six. Isolates just two fields: the hostname (`uname -n`) and the NIS/YP domain name. This is why every `docker run` container gets its own random-looking hostname (typically the short container ID) by default, and `hostname foo` run inside a container never touches the host's real hostname.

##### 10.2.6 USER Namespace (`CLONE_NEWUSER`) — The Security-Critical One

Recall `struct cred` from Topic 3 of this chapter (§3.5): `uid`, `euid`, `cap_effective`, etc. A user namespace adds one more layer on top of everything already in `struct cred` — a **UID/GID mapping table** that translates "UID as seen inside this namespace" ↔ "UID as seen on the host":

```
/proc/<pid>/uid_map contents:               Inside container:        On the actual host:
0        100000      65536                  UID 0 (root!)      ───►  UID 100000 (unprivileged!)
                                             UID 1000           ───►  UID 101000
                                             UID 33 (www-data)  ───►  UID 100033
```
`0 100000 65536` reads as: "namespace UID 0 through 65535 map to host UID 100000 through 165535." A process that is fully "root" (`euid=0`, all capabilities *within its own namespace*) is, from the host kernel's perspective, just some ordinary unprivileged UID — it cannot read host files owned by real root, cannot signal host processes, cannot do anything a genuine unprivileged host user couldn't do, **even though every `id`/`whoami` command run inside the container honestly reports "root."**

**Common Pitfall**: many real-world container deployments (including Docker's historical default) do NOT enable user namespace remapping by default — the container's UID 0 really is host UID 0. This is precisely why `--privileged` and running-as-root-inside-a-container are treated as serious security smells: without USER namespace remapping, "root in the container" and "root on the host" are the same UID, and any container-escape bug (a MNT-namespace `pivot_root` bug, a kernel bug, a mounted host path) hands the attacker genuine host root.

##### 10.2.7 Consolidated Diagram — task_struct's Namespace Pointers

Extending the `task_struct` diagram from Topic 3 of this chapter: every task has a pointer to an `nsproxy` struct bundling references to whichever instance of each of the 6 namespace types it currently belongs to.

```
HOST / INIT PROCESS (PID 1 on bare metal)            CONTAINER PROCESS (docker run nginx)
┌──────────────────────────────┐                     ┌──────────────────────────────┐
│ task_struct                    │                     │ task_struct                    │
│   *mm       ──► (own)          │                     │   *mm       ──► (own)          │
│   *files    ──► (own)          │                     │   *files    ──► (own)          │
│   *cred     ──► (own)          │                     │   *cred     ──► (own)          │
│   *nsproxy ──┐                │                     │   *nsproxy ──┐                │
└───────────────┼────────────────┘                     └───────────────┼────────────────┘
                 ▼                                                       ▼
        struct nsproxy (initial/default instances)          struct nsproxy (all-new instances)
      ┌─────────────────────────┐                        ┌─────────────────────────┐
      │ pid_ns_for_children ──► init PID ns  │            │ pid_ns_for_children ──► NEW PID ns (this task = PID 1 in it) │
      │ net_ns   ──► init net ns (eth0, real routes)│      │ net_ns   ──► NEW net ns (only lo, until veth attached)      │
      │ mnt_ns   ──► init mount table (real /)│           │ mnt_ns   ──► NEW mount table (OverlayFS merged dir as /)    │
      │ ipc_ns   ──► init IPC objects table │              │ ipc_ns   ──► NEW, empty IPC objects table                   │
      │ uts_ns   ──► init hostname/domain   │              │ uts_ns   ──► NEW hostname ("a1b2c3d4e5f6")                  │
      │ user_ns  ──► init UID/GID mapping   │              │ user_ns  ──► NEW UID map (0-65535 → 100000-165535, if enabled)│
      └─────────────────────────┘                        └─────────────────────────┘
```

##### 10.2.8 Summary Table — All Six Namespaces

| Namespace | `clone()` flag | Isolates | Simplest observable effect |
|---|---|---|---|
| PID | `CLONE_NEWPID` | Process ID numbering | Container's own process is PID 1 inside |
| NET | `CLONE_NEWNET` | Interfaces, routes, iptables, ports | Fresh `lo`-only stack; needs veth+bridge to reach anything |
| MNT | `CLONE_NEWNS` | Mount table | `/` inside the container is a different tree entirely |
| IPC | `CLONE_NEWIPC` | SysV shm/sem/msgqueue, POSIX mqueue | Can't see/attach another container's shared memory |
| UTS | `CLONE_NEWUTS` | Hostname, NIS domain | `hostname` inside ≠ host's real hostname |
| USER | `CLONE_NEWUSER` | UID/GID number mapping | "root" inside can be an unprivileged UID on the host |

---

#### 10.3 cgroups — Putting a Ceiling on a *Shared* Resource

Namespaces answer "what can this process **see**?" cgroups answer a completely different question: "how much of a resource that is genuinely **shared** with every other process on the box may this process (and everything it forks) **consume**?" CPU cycles, physical RAM, disk I/O bandwidth, and PID-table slots are not namespace-able — there is only one physical CPU, one pool of RAM — so cgroups instead put hard/soft ceilings and fair-share weights on groups of `task_struct`s.

##### 10.3.1 v1 vs v2

**cgroups v1** (older, still common): each resource controller (`cpu`, `memory`, `blkio`, `pids`, ...) has its **own separate hierarchy** — a process could in principle be in cgroup `/app-a` under the `cpu` controller but `/app-b` under the `memory` controller, an inconsistent, hard-to-reason-about mess that real deployments mostly avoided but the kernel still had to support.

**cgroups v2** (modern, what current Docker/systemd default to): **one single unified hierarchy** — a process belongs to exactly one cgroup path, and that one path has all the relevant controllers (`cpu`, `memory`, `io`, `pids`, ...) enabled on it simultaneously via `cgroup.controllers`/`cgroup.subtree_control` files. Vastly simpler mental model, and the one worth knowing cold for a modern interview.

##### 10.3.2 The Interface Is Just a Filesystem (cgroupfs)

There is no special cgroup syscall for day-to-day limit-setting — cgroups v2 expose a pseudo-filesystem (conceptually similar to `/proc`, covered in Topic 9 of this chapter) at `/sys/fs/cgroup/`, where creating a limit is literally `mkdir` + writing a number into a file:

```bash
# 1. Create a new cgroup (just a directory!)
mkdir /sys/fs/cgroup/my_app

# 2. Cap it to 200 MB of RAM
echo "200M" > /sys/fs/cgroup/my_app/memory.max

# 3. Cap it to 50% of one CPU core (100000us period, 50000us quota)
echo "50000 100000" > /sys/fs/cgroup/my_app/cpu.max

# 4. Move a running process INTO this cgroup by writing its PID
echo $MY_APP_PID > /sys/fs/cgroup/my_app/cgroup.procs
```
From this point on, the kernel scheduler (Topic 3 — CFS/`vruntime`) and the memory-management subsystem (Topic 4 — page allocation/OOM path) both consult this cgroup's limits on every relevant decision for that PID and every descendant it forks.

##### 10.3.3 The cgroup-Local OOM Killer (Distinct From the System-Wide One)

Topic 4 of this chapter covered the **system-wide** OOM Killer: triggered when physical RAM + swap are exhausted globally, scoring every process on the box and `SIGKILL`ing the worst offender. A `memory.max` cgroup limit adds a **second, independent, cgroup-scoped OOM path**: if the *cgroup's own* cumulative RSS exceeds `memory.max`, the kernel invokes the OOM killer scoped to *just that cgroup's process tree*, even if the rest of the host machine has RAM to spare.

```
Host: 64 GB total RAM, currently 40 GB free system-wide
   my_app cgroup: memory.max = 200M
      my_app process allocates and touches 210 MB
                     │
                     ▼
      Kernel checks: cgroup RSS (210MB) > cgroup memory.max (200MB)?
                     │
                    YES
                     ▼
      cgroup-scoped OOM killer fires — kills a process INSIDE my_app's
      cgroup — even though 40 GB is free elsewhere on the host!
```
This is precisely why a containerized process can die with `OOMKilled` in `docker inspect`/`kubectl describe pod` while `free -h` on the host shows plenty of headroom — the container hit its OWN ceiling, not the machine's.

##### 10.3.4 What cgroups Commonly Limit — Summary Table

| Controller | Limits | Connects back to |
|---|---|---|
| `cpu` | CPU time share/quota (weight-based fairness or hard quota per period) | Topic 3's CFS `vruntime` — cgroup weight feeds directly into scheduling fairness |
| `memory` | Max RSS, swap behavior, triggers cgroup-scoped OOM killer | Topic 4's page-fault/allocation path and system OOM killer |
| `io` (blkio in v1) | Disk read/write bandwidth and IOPS per block device | Page-cache writeback path (Topic 4/5) |
| `pids` | Max number of `task_struct`s (processes+threads) the cgroup may ever contain | Topic 3's `fork()`/`clone()` — prevents fork-bombs from starving the whole host's PID space |

---

#### 10.4 OverlayFS & Image Layering

A Docker image is a stack of read-only layers; a running container adds exactly ONE thin writable layer on top. **OverlayFS** is the union filesystem that makes this stack appear, to every syscall (`open`, `read`, `write`, `stat` — the exact VFS syscalls from Topic 5 of this chapter) as if it were a single, ordinary directory tree.

```
mount -t overlay overlay \
  -o lowerdir=/img/layer3:/img/layer2:/img/layer1,upperdir=/container/upper,workdir=/container/work \
  /container/merged
```

```
┌─────────────────────────────────────────────┐
│  upperdir  (writable — THIS container's own changes)  │  ◄── only this layer can ever be written to
├─────────────────────────────────────────────┤
│  lowerdir  layer3 (read-only, e.g. "install app")      │
├─────────────────────────────────────────────┤
│  lowerdir  layer2 (read-only, e.g. "apt-get install")  │  ◄── shared, byte-identical, across EVERY
├─────────────────────────────────────────────┤             container running from this image
│  lowerdir  layer1 (read-only, e.g. base OS rootfs)     │
└─────────────────────────────────────────────┘
                       │
                       ▼   all layers merged, top-most-wins-on-conflict,
         ┌───────────────────────────┐
         │   merged  (what the       │  ◄── this is what gets pivot_root'd to be "/"
         │   container actually sees)│      inside the container (§10.2.3)
         └───────────────────────────┘
```

**Copy-up-on-write** — the same *idea* as the page-level Copy-on-Write from Topic 3/4 of this chapter, just applied at the filesystem-file granularity instead of the 4 KB physical-page granularity: if the container writes to (or even just changes metadata on) a file that currently lives in a read-only `lowerdir` layer, OverlayFS first **copies the entire file up into `upperdir`**, then applies the write there. The original file in the read-only lower layer is never touched. Deleting a file that exists in a lower layer doesn't delete it either (it can't — that layer is read-only and shared) — instead OverlayFS creates a special "whiteout" marker file in `upperdir` that tells the merge view "pretend this doesn't exist."

**Why this makes images cheap to run at scale**: 500 containers all started `FROM ubuntu:22.04` all share the exact same physical `lowerdir` blocks on disk — zero duplication — and each container's `upperdir` typically stays tiny (just its own runtime-generated files/logs), which is also exactly why `docker commit`/image layers are so fast to build and why deleting a container reclaims almost all its "disk usage" instantly (you're just deleting one thin `upperdir`, not an entire OS image copy).

---

#### 10.5 Linux Capabilities — Splitting "Root" Into Pieces

Extending `struct cred` from Topic 3 (§3.5) directly: traditional Unix only had two permission levels — UID 0 (root, can do *literally anything*) and everyone else (checked against file permission bits). **POSIX Capabilities** split root's absolute power into ~40 independent, individually-grantable bits stored in exactly the `cap_permitted`/`cap_effective`/`cap_inheritable` fields already shown in Topic 3's `struct cred` listing.

```c
// A tiny sample of the ~40 capability bits a container runtime decides whether to grant:
CAP_NET_BIND_SERVICE   // bind TCP/UDP ports < 1024 WITHOUT being full root
CAP_NET_RAW            // open raw sockets (needed by e.g. `ping`)
CAP_SYS_ADMIN          // an enormous grab-bag: mount(), namespace creation, and more — avoid granting!
CAP_SYS_PTRACE         // ptrace() other processes (strace/gdb — Topic 9 of this chapter)
CAP_CHOWN              // change file ownership arbitrarily
CAP_SETUID / CAP_SETGID // change process UID/GID (needed by e.g. su, sudo)
```
Docker's default capability set for a normal container is a **small, curated subset** of the ~40 (roughly 14 by default) — nowhere near full root, even if the container's own UID happens to be 0 (and doubly restricted if USER-namespace remapping from §10.2.6 is also active). `--cap-drop=ALL --cap-add=NET_BIND_SERVICE` explicitly grants only what's actually needed — e.g. an nginx container that needs to bind port 80 gets exactly `CAP_NET_BIND_SERVICE` and nothing else.

**Common Pitfall — `--privileged`**: this flag doesn't just add a few extra capabilities — it grants **every** capability, disables the default seccomp filter (§10.6), and even remounts host devices into the container. A `--privileged` container is essentially not meaningfully isolated from the host at all; it exists purely for niche use cases (nested Docker-in-Docker, certain hardware-access daemons) and should never be reached for casually.

---

#### 10.6 seccomp and AppArmor/SELinux — The Layers Beyond Capabilities

Even with capabilities trimmed down, a process can still *invoke* the full syscall table — capabilities only govern what a syscall is *permitted to do* once entered, not which syscalls exist at all.

**seccomp-BPF**: attaches a small BPF filter (structurally the ancestor of the eBPF machinery covered in Topic 9 of this chapter — same in-kernel bytecode-VM-plus-verifier idea, applied here at the syscall-entry choke point rather than to kprobes/tracepoints) that runs on **every single syscall** a process attempts and returns `ALLOW`, `KILL`, or `ERRNO`. Docker's default seccomp profile is an allow-list of roughly 300-ish "normal" syscalls out of Linux's 300-400+, explicitly blocking dangerous or exotic ones a typical containerized app should never need — `ptrace`, raw `mount`, kernel-module loading syscalls, `reboot`, and others.

```
Container attempts: mount("/dev/sda1", "/mnt", "ext4", 0, NULL);
                              │
                              ▼
        Kernel evaluates the attached seccomp-BPF filter FIRST,
        before the syscall handler even runs:
                              │
              filter says: mount() → KILL / ERRNO(EPERM)
                              │
                              ▼
        Syscall never executes at all — blocked at the syscall-entry
        boundary itself, regardless of what capabilities the process has.
```

**AppArmor / SELinux (Mandatory Access Control, MAC)**: a completely separate, orthogonal layer from both capabilities and seccomp. Where capabilities/seccomp restrict *what a process may do based on privilege bits it holds*, MAC systems restrict *what a labeled process may touch based on a policy the administrator wrote*, enforced regardless of UID or capabilities — e.g. an AppArmor profile can say "this process, even if it somehow has `CAP_SYS_ADMIN`, may never read `/etc/shadow` or write outside `/var/lib/myapp`." Docker ships a default AppArmor profile on distros that support it (Ubuntu/Debian), further restricting things like raw device access.

**Defense-in-depth summary** — the four layers, from broadest to narrowest, that a hardened production container stacks together:

| Layer | Question it answers | Bypassed by `--privileged`? |
|---|---|---|
| Namespaces (§10.2) | What can this process **see**? | Partially (still namespaced unless explicitly disabled) |
| cgroups (§10.3) | How much of a shared resource may it **consume**? | No |
| Capabilities (§10.5) | Which privileged **operations** may it perform? | Yes — grants ALL of them |
| seccomp (§10.6) | Which **syscalls** may it even attempt? | Yes — disabled entirely |
| AppArmor/SELinux (§10.6) | Which specific **files/resources**, by policy? | Often yes/weakened |

---

#### 10.7 Container Networking End to End

Three networking modes, all built from the NET-namespace primitive in §10.2.2, plus the routing/iptables machinery covered fully in Topic 8 of this chapter:

**Bridge mode (the default)**: Docker creates a Linux bridge (`docker0`) on the host. Each container gets its own NET namespace plus one `veth` pair — one end lives inside the container's netns as `eth0`, the other end is plugged into `docker0` on the host side. Containers on the same bridge can reach each other directly (L2, via the bridge); reaching the outside world goes through the host's real interface via NAT (see below). This is exactly the veth+bridge mechanism from Topic 8 — Docker is simply scripting the same `ip link`/`ip netns`/bridge commands you could type by hand.

**Host mode**: the container is given **no** new NET namespace at all (`--net=host`) — it directly shares the host's real network stack, real interfaces, real port space. Fastest possible networking (zero veth/bridge/NAT hop), but zero network isolation — a container binding port 80 in host mode binds the HOST's port 80 directly, and a compromised container can see/interact with every socket on the host machine.

**Overlay networking**: for multi-host container clusters (Docker Swarm, and conceptually similar to what Kubernetes' CNI plugins do) — packets between containers on *different physical machines* are encapsulated (commonly VXLAN — the original packet, including its own private overlay-network IP/MAC, gets wrapped inside a UDP packet and sent host-to-host) so that containers on different hosts can still believe they're on one flat L2 network, regardless of the real underlying physical network topology.

**Port publishing (`-p 8080:80`) is just an iptables DNAT rule**: Docker doesn't invent a new mechanism here — it programs the exact NAT-table/PREROUTING-chain rules covered in Topic 8 of this chapter into a Docker-managed chain:
```bash
# Conceptually what `-p 8080:80` adds (simplified; Docker uses its own DOCKER chain):
iptables -t nat -A DOCKER -p tcp --dport 8080 -j DNAT --to-destination 172.17.0.2:80
```
Any packet arriving at the host on TCP port 8080 gets its destination rewritten (Destination NAT) to the container's private bridge IP (`172.17.0.2`) and port 80, then routed onto `docker0` toward the container's veth — invisible to the container itself, which only ever sees traffic arriving on its own `eth0:80` as if it were talking directly to the outside world.

---

#### 10.8 Why This Matters in Production — Hardening Checklist

Pulling every mechanism in this topic together into the concrete checklist a senior engineer is expected to reason through when hardening a production container:

1. **Don't run as root inside the container** (`USER` directive in the Dockerfile) — even with everything else below in place, defense-in-depth means the *first* line of defense shouldn't rely on UID 0 tricks at all.
2. **Enable USER-namespace remapping** (§10.2.6) so that even if the app somehow IS UID 0 inside, it maps to an unprivileged host UID.
3. **`--cap-drop=ALL`, then `--cap-add` only the specific capabilities actually needed** (§10.5) — never ship the default capability set unexamined, and never reach for `--privileged`.
4. **Leave the default (or a tightened custom) seccomp profile enabled** (§10.6) — don't disable it "to make a weird syscall work" without first checking whether that syscall is genuinely necessary.
5. **Set `memory.max` and `cpu.max` cgroup limits** (§10.3) on every container — an unbounded container is one runaway `malloc` loop away from starving every *other* workload on the same host, cgroup-scoped OOM or not.
6. **Prefer bridge networking over host networking** (§10.7) unless the raw performance is genuinely required and the trust boundary genuinely allows it.
7. **Remember the shared-kernel caveat from §10.1**: none of the above turns a container into a VM. A container is an appropriate isolation boundary for *cooperating* workloads and defense-in-depth against *application-level* compromise — it is not, by itself, considered a sufficient boundary for running genuinely mutually-hostile, untrusted code (that's what gVisor/Kata Containers/Firecracker microVMs exist to add back).

**End of Topic 10: Docker & Container Internals**
