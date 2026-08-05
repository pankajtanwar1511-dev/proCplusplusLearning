## TOPIC: The Linux Network Stack - Sockets, TCP, Routing & Namespaces

### THEORY_SECTION: From socket() to the Wire — How Bytes Actually Move

This topic follows a single connection from the moment a server calls `socket()` all the way to a packet physically leaving (or entering) a Network Interface Card, then zooms out to how Linux isolates and routes traffic between processes, namespaces, and hosts. As with everything else in this chapter, every claim is grounded in the exact kernel structures involved and a concrete numbered trace — not just prose.

---

#### 8.1 The Four Canonical Server Syscalls — What Each One Allocates

```c
int server_fd = socket(AF_INET, SOCK_STREAM, 0);
bind(server_fd, (struct sockaddr *)&addr, sizeof(addr));
listen(server_fd, 128);
int client_fd = accept(server_fd, ...);
```

**`socket()`** — creates a VFS `struct file` (with `f_op = socket_file_ops`, so it plugs into the exact same `read()`/`write()`/`epoll` machinery as disk files and pipes — see Topic 5 of this chapter) **and** a `struct socket` / `struct sock` pair holding protocol state:

```
task_struct -> files_struct -> fd_array[3]
                    │
                    ▼
              struct file (VFS layer)
              private_data ──┐
                              │
                              ▼
                      struct socket (BSD socket layer)
                      struct sock *sk ──┐
                                        │
                                        ▼
                                struct inet_sock / tcp_sock (INET/TCP layer)
                                ├── state = TCP_CLOSE
                                ├── rx_queue (Empty)
                                └── tx_queue (Empty)
```

**Critical fact:** `socket()` does **not** touch the NIC. It is pure RAM bookkeeping — allocating kernel structs and marking protocol state `TCP_CLOSE`. No packet has been sent, no port has been reserved yet.

**`bind()`** — the kernel checks its TCP port-bind hash table (`inet_hashinfo`) for a conflicting `(IP, port)` pair already in use:
- Conflict, no `SO_REUSEPORT` set → returns `-EADDRINUSE`.
- No conflict (or `SO_REUSEPORT` explicitly allows multiple sockets to share the exact same `(IP, port)`, used to let N worker processes all `accept()` from the same listening endpoint for load-spreading) → registers `(IP, port)` into the socket's `inet_sock` fields.

**`listen()`** — allocates **two queues** inside `struct tcp_sock` and the kernel starts autonomously running the TCP 3-way handshake in the background (interrupt-driven network stack code) — **without any user-space code doing anything**:

```
                                    struct tcp_sock
                                   ┌────────────────┐
                                   │ state = LISTEN │
                                   └───────┬────────┘
                                           │
                     ┌─────────────────────┴─────────────────────┐
                     ▼                                           ▼
        1. SYN Queue (Incomplete Handshake)         2. Accept Queue (Completed Handshake)
        │ Client A (SYN received)                   │ Client C (ESTABLISHED)
        │ Client B (SYN-ACK sent)                   │ Client D (ESTABLISHED)
```

- **SYN Queue**: connections mid-handshake (kernel has seen a `SYN`, sent a `SYN-ACK`, is waiting for the final `ACK`).
- **Accept Queue**: fully `ESTABLISHED` connections whose 3-way handshake is done, but the application hasn't called `accept()` for them yet.
- The `128` argument to `listen()` is the **backlog** — the maximum size of the Accept Queue. If it fills faster than the application calls `accept()`, new completed connections are dropped (or, depending on `tcp_abort_on_overflow`, actively reset).

**`accept()`**:
1. Inspects the Accept Queue.
   - Empty → the calling task's `state` becomes `TASK_INTERRUPTIBLE` (sleeps on the socket's wait queue — see Topic 3 of this chapter for exactly what that state transition means at the scheduler level).
   - Non-empty → wakes/proceeds immediately.
2. Pops the completed `struct sock` off the Accept Queue.
3. Creates a **brand-new** `struct file` + a new fd (e.g. `4`) wrapping that connection.
4. The **listening** socket (fd 3) is untouched and keeps listening for new SYNs; the **connected** socket (fd 4) is the dedicated, private channel to that one client.

```
[ Process task_struct ]
   │
   ├── fd_array[3] ──> struct file (Listening) ────> struct socket ──> Accept Queue (Pop connection)
   │                                                                           │
   │                                                                           ▼
   └── fd_array[4] ──> struct file (Connected) ──> struct socket ──> Dedicated RX/TX Queues
                                                                     (Client 192.168.1.50:54321)
```

**Common Pitfall:** confusing the listening fd with the connected fd. A single listening socket (fd 3) can spawn thousands of connected sockets (fd 4, 5, 6, ...) over its lifetime — `accept()` never consumes or closes the listening fd, it only ever hands you a *new* fd per completed connection.

---

#### 8.2 The TCP 3-Way Handshake, Tied to the Queues Above

```
CLIENT                                          SERVER (fd 3, state = LISTEN)
  │                                                   │
  │  1. SYN (seq=X)          ─────────────────────►  │  Connection enters SYN QUEUE
  │                                                   │  state: SYN_RCVD
  │  2. SYN-ACK (seq=Y, ack=X+1) ◄─────────────────  │
  │                                                   │
  │  3. ACK (ack=Y+1)        ─────────────────────►  │  Connection MOVES: SYN Queue → ACCEPT QUEUE
  │                                                   │  state: ESTABLISHED
  │                    [ DATA FLOWS ]                 │
```

1. Client sends `SYN` → server receives it, allocates a SYN-queue entry, replies `SYN-ACK`, transitions that entry to `SYN_RCVD`.
2. Client replies with the final `ACK` → **only now** does the kernel move the connection out of the SYN Queue and into the Accept Queue, flipping its state to `ESTABLISHED`.
3. `accept()` (Section 8.1) only ever pops from the Accept Queue — it is structurally impossible for `accept()` to return a connection that hasn't finished its handshake.

#### 8.3 The Full TCP State Machine

**Server side (passive open):**
```
CLOSED
   │  listen()
   ▼
LISTEN ──────────────► SYN_RCVD ──────────────► ESTABLISHED
        (receives SYN)             (receives final ACK)
```

**Client side (active open):**
```
CLOSED
   │  connect() -> sends SYN
   ▼
SYN_SENT ──────────────────────────────────────► ESTABLISHED
                (receives SYN-ACK, sends ACK)
```

**Closing a connection (4-way, since TCP is full-duplex — each side closes its own direction independently):**

Active closer (the side that calls `close()`/`shutdown()` first):
```
ESTABLISHED
   │  send FIN
   ▼
FIN_WAIT_1 ──────────► FIN_WAIT_2 ──────────► TIME_WAIT ──────────► CLOSED
   (receives ACK          (receives peer's         (2 x MSL timer
    for our FIN)            FIN, sends ACK)          expires)
```

Passive closer (the side that receives the FIN first):
```
ESTABLISHED
   │  receives FIN, sends ACK
   ▼
CLOSE_WAIT ──────────► LAST_ACK ──────────► CLOSED
  (application calls      (receives ACK for
   close(), sends FIN)      our FIN)
```

| State | Meaning | Who's in it |
|---|---|---|
| `LISTEN` | Waiting for incoming connections | Server, after `listen()` |
| `SYN_SENT` | Sent SYN, awaiting SYN-ACK | Client, after `connect()` |
| `SYN_RCVD` | Received SYN, sent SYN-ACK, awaiting final ACK | Server, mid-handshake (in SYN Queue) |
| `ESTABLISHED` | Full-duplex data transfer | Both sides, connection open |
| `FIN_WAIT_1` | Sent our FIN, awaiting ACK/FIN from peer | Active closer |
| `FIN_WAIT_2` | Our FIN was ACKed, awaiting peer's FIN | Active closer |
| `CLOSE_WAIT` | Received peer's FIN, application hasn't closed yet | Passive closer |
| `LAST_ACK` | Sent our FIN (as passive closer), awaiting final ACK | Passive closer |
| `TIME_WAIT` | Fully closed locally, waiting out 2×MSL | Active closer |
| `CLOSED` | No connection | Both, terminal state |

**Common Pitfall — a process stuck in `CLOSE_WAIT` forever:** if the application never calls `close()` after receiving a FIN (e.g. a bug where a socket read loop exits without closing), the connection sits in `CLOSE_WAIT` indefinitely — this is a classic file-descriptor/socket leak signature you diagnose via `ss -tan | grep CLOSE_WAIT`.

#### 8.4 Why `TIME_WAIT` Exists (and `SO_REUSEADDR`)

The active closer waits in `TIME_WAIT` for **2×MSL** (Maximum Segment Lifetime — historically 2 minutes total, i.e. ~120s, though modern Linux often uses a shorter effective value) before fully releasing the `(local IP, local port, remote IP, remote port)` tuple. Two reasons:

1. **Duplicate/delayed packet safety**: a stray, delayed duplicate packet from the old connection could still be in flight on the network. If a brand-new connection reused the exact same 4-tuple immediately, that stray packet could be misdelivered into the new connection's data stream. Waiting out 2×MSL guarantees any such straggler has definitely expired.
2. **Guaranteeing the final ACK was received**: if the peer's `FIN` (in `LAST_ACK`) never receives our final `ACK` (packet lost), the peer will retransmit its `FIN`. Staying in `TIME_WAIT` (rather than `CLOSED`) means we can still reply with another `ACK` instead of an unexpected `RST`.

**Practical implication** (the interview-relevant one): a server that restarts frequently (deploys, crash-restart loops) can fail to `bind()` to its own listening port with `EADDRINUSE`, because old connections from *client* sockets are lingering in `TIME_WAIT` on that same local port. `SO_REUSEADDR` explicitly tells the kernel "let me bind to a port even if some old sockets are still in `TIME_WAIT`" — it does **not** bypass the handshake or affect `SO_REUSEPORT`'s multi-process sharing behavior; it's specifically a `TIME_WAIT`-vs-`bind()` relaxation.

---

#### 8.5 The Packet Journey — Wire to User Space

```
┌──────────────┐   ┌──────────────────┐   ┌─────────┐   ┌──────────────┐   ┌────────────────────┐   ┌──────────────┐   ┌───────────────┐
│ Physical NIC │──►│ RX Ring Buffer   │──►│  DMA    │──►│ HW Interrupt │──►│ sk_buff Allocated  │──►│ Protocol     │──►│ Socket RX     │
│ (Wire signal)│   │ (DMA descriptors)│   │(zero-CPU│   │ (or NAPI     │   │ (Ethernet/IP/TCP    │   │ Stack        │   │ Queue         │
│              │   │                  │   │ copy)   │   │  polling)    │   │  headers layered on)│   │ (IP routing, │   │ (waiting for  │
│              │   │                  │   │         │   │              │   │                      │   │  TCP reasm.) │   │  read()/recv())│
└──────────────┘   └──────────────────┘   └─────────┘   └──────────────┘   └────────────────────┘   └──────────────┘   └───────┬───────┘
                                                                                                                                  │
                                                                                                                                  ▼
                                                                                                                     ┌───────────────────────┐
                                                                                                                     │ copy_to_user() on your │
                                                                                                                     │ read(fd, buf, N) call  │
                                                                                                                     └───────────────────────┘
```

1. **Physical NIC**: receives electrical/optical signal, decodes into a raw Ethernet frame.
2. **RX Ring Buffer**: a fixed-size array of DMA-mapped buffer descriptors the driver pre-allocated at boot/init — the NIC writes incoming frames directly into these pre-registered RAM buffers.
3. **DMA (Direct Memory Access)**: the NIC's hardware transfers the frame bytes straight into that RAM buffer **without the CPU copying a single byte** — the CPU is not involved in moving the data at all at this stage.
4. **Hardware Interrupt vs NAPI**: naively, the NIC could raise a hardware interrupt (see Topic 1 of this chapter for the general interrupt mechanism) for *every single packet*, but at high packet rates (millions of packets/sec) that would cause an "interrupt storm" that starves the CPU. **NAPI (New API)** fixes this: on the *first* packet, the NIC still raises one interrupt; the driver's interrupt handler immediately **disables further interrupts for that NIC** and switches to **polling mode**, draining the entire RX ring in a tight loop (up to a configurable budget) before finally re-enabling interrupts. Under sustained high load, this collapses potentially millions of interrupts/sec down to a small, bounded number of interrupts, trading a little added latency for enormously better throughput.
5. **`sk_buff` (socket buffer) allocation**: the kernel's universal packet data structure. It has `head`/`data`/`tail`/`end` pointers into one contiguous buffer, which lets each protocol layer (Ethernet → IP → TCP) **push and pop its own header without copying the payload** — the IP layer just moves the `data` pointer past the Ethernet header, the TCP layer moves it past the IP header, and so on, all zero-copy pointer arithmetic on the same underlying buffer.
6. **Protocol stack processing**: IP layer makes a routing decision (is this packet for us, or should it be forwarded? — see Section 8.6); TCP layer matches the packet to an existing `struct tcp_sock` by 4-tuple, handles sequence numbers/acking, and — once in order — appends the payload onto that socket's **receive queue**.
7. **User-space delivery**: only when your application calls `read()`/`recv()` does the kernel finally `copy_to_user()` the bytes out of the socket's receive queue into your buffer — this is the one unavoidable copy in the whole path (bypassed entirely by zero-copy techniques like `io_uring` with registered buffers, or `AF_XDP`/kernel-bypass frameworks like DPDK for extreme low-latency use cases).

**Why this matters in production**: NAPI's interrupt-then-poll model is *the* reason commodity Linux NICs can sustain millions of packets/second without collapsing under interrupt overhead — this is directly relevant to any high-throughput networking workload (market data feeds, robotics sensor fan-in, packet capture).

---

#### 8.6 Routing — How the Kernel Picks an Output Path

Every outgoing (or forwarded) packet is matched against the kernel's routing table using **longest-prefix match**: among all routes whose network prefix contains the destination IP, the kernel picks the *most specific* (longest subnet mask) one.

```
$ ip route
default via 192.168.1.1 dev eth0          # 0.0.0.0/0   — the fallback "everything else" route
192.168.1.0/24 dev eth0 proto kernel       # more specific — matches local subnet directly
10.0.0.0/8 via 192.168.1.5 dev eth0        # even more specific for 10.x.x.x — routed via a gateway
```

A packet destined for `10.5.3.1` matches **both** `default` (0.0.0.0/0) and `10.0.0.0/8` — the kernel picks `10.0.0.0/8` because `/8` is a longer, more specific prefix than `/0`. Each matched route supplies: an **output interface** (`dev`) and, if the destination isn't on a directly-attached subnet, a **next-hop gateway** to hand the packet to.

**Local delivery vs loopback**: if the destination IP belongs to the local machine itself (an address bound to one of its own interfaces, including `127.0.0.1`), the routing lookup resolves to the **loopback interface (`lo`)** instead of a physical NIC — the packet never touches real hardware, it's handed directly back into the local network stack's RX path in software.

---

#### 8.7 Network Namespaces, veth Pairs & Bridges

A **network namespace** (created via `clone(CLONE_NEWNET)` or `unshare(CLONE_NEWNET)`) gives a process its own **completely independent** copy of: network interfaces, routing table, iptables rules, and socket/port space. Two processes in different network namespaces can both `bind()` to port `8080` with zero conflict — as far as either is concerned, it has the entire network stack to itself.

```
                    [ HOST NETWORK NAMESPACE ]                          [ CONTAINER NETWORK NAMESPACE ]
                    ┌─────────────────────────┐                        ┌─────────────────────────┐
                    │  eth0 (physical, real)  │                        │  eth0@if12 (veth end B) │
                    │  IP: 203.0.113.5         │                        │  IP: 172.17.0.2          │
                    └────────────┬────────────┘                        └────────────┬────────────┘
                                 │                                                    │
                    ┌────────────▼────────────┐                                      │
                    │  docker0 (Linux Bridge)  │◄─────────── veth pair ──────────────┘
                    │  IP: 172.17.0.1          │        (veth0@if11 <──cable──> eth0@if12)
                    └─────────────────────────┘
```

- **veth pair**: a *virtual Ethernet cable* — always created as **two** linked interfaces; anything sent into one end instantly appears on the other end, as if a physical cable connected them. One end typically stays in the host namespace (plugged into a bridge), the other end is moved into the container's namespace (renamed `eth0` from inside).
- **Linux bridge**: a software Layer-2 switch. Multiple veth ends (one per container) plug into the same bridge, letting all containers on that bridge reach each other directly (like devices on the same physical switch), and the bridge itself holds an IP (e.g. `172.17.0.1`) acting as the gateway for the whole container subnet.

This is precisely the mechanism Docker's default `bridge` network driver uses — it will come back in full in Topic 10 of this chapter.

---

#### 8.8 iptables / nftables — Netfilter Hook Points

Netfilter defines **five hook points** a packet passes through at specific stages of its journey; each hook can have rules attached from multiple **tables** (filter for accept/drop decisions, `nat` for address translation, `mangle` for packet modification):

```
Incoming packet
      │
      ▼
 [ PREROUTING ]  (nat table: DNAT — rewrite destination before routing decision)
      │
      ▼
 Routing decision: is this packet FOR US, or FORWARDED elsewhere?
      │
      ├── For us ──► [ INPUT ] (filter table: accept/drop for local processes) ──► Local Process
      │
      └── Forward ──► [ FORWARD ] (filter table: accept/drop for pass-through traffic)
                              │
                              ▼
Local process sends ──► [ OUTPUT ] (filter table: accept/drop for locally-generated packets)
      │
      ▼
 [ POSTROUTING ]  (nat table: SNAT/MASQUERADE — rewrite source after routing decision)
      │
      ▼
Outgoing packet
```

| Hook | Typical use |
|---|---|
| `PREROUTING` | DNAT (destination rewrite) before the kernel decides whether to route or deliver locally |
| `INPUT` | Firewall rules for traffic destined to this host itself |
| `FORWARD` | Firewall rules for traffic passing *through* this host (routing/gateway scenarios, container traffic) |
| `OUTPUT` | Firewall rules for traffic generated *by* this host |
| `POSTROUTING` | SNAT/MASQUERADE (source rewrite) just before the packet leaves an interface |

**Worked NAT example — how a container reaches the internet**: a container has a private IP `172.17.0.2` (only meaningful inside the bridge's subnet). When it sends a packet to `8.8.8.8`, the `POSTROUTING` hook applies a `MASQUERADE` rule that rewrites the packet's **source IP** from `172.17.0.2` to the host's real public-facing IP (e.g. `203.0.113.5`) before it leaves `eth0`. The kernel remembers this translation in a connection-tracking table so the *reply* packet's destination gets rewritten back to `172.17.0.2` on the way in through `PREROUTING`. This single mechanism is what lets an entire fleet of containers, each with a private, overlapping-with-other-hosts IP, share one real public IP for outbound traffic.

---

#### 8.9 Raw Sockets & sysctl Tuning

**`SOCK_RAW`**: bypasses the transport layer (TCP/UDP) entirely — you construct or read raw IP (or with `SOCK_RAW` + `ETH_P_ALL`, raw Ethernet) frames yourself, headers and all. Requires elevated privilege (`CAP_NET_RAW`). Real uses: `ping` builds raw ICMP packets by hand; custom protocol implementations that don't fit TCP/UDP semantics; packet sniffers.

```c
int raw_fd = socket(AF_INET, SOCK_RAW, IPPROTO_ICMP); // CAP_NET_RAW required
```

**`sysctl` network tuning** (a category worth knowing exists, with a couple of concrete, interview-relevant knobs):

| Knob | Purpose |
|---|---|
| `net.core.somaxconn` | System-wide cap on the Accept Queue size — your `listen(fd, 128)` backlog is further capped by this kernel-wide maximum |
| `net.ipv4.tcp_tw_reuse` | Allows the kernel to reuse a `TIME_WAIT` socket for a new outgoing connection sooner, under safe conditions |
| `net.ipv4.tcp_fin_timeout` | How long a connection stays in `FIN_WAIT_2` before being forcibly cleaned up |
| `net.core.rmem_max` / `wmem_max` | Maximum socket receive/send buffer sizes — directly affects TCP throughput on high-bandwidth-delay-product links |

**Common Pitfall**: setting a large `listen()` backlog (e.g. `1024`) but forgetting `net.core.somaxconn` is still the older Linux default of `128` — the effective Accept Queue size is `min(your_backlog, somaxconn)`, so the syscall argument alone doesn't guarantee the queue depth you asked for.

---

#### 8.10 Summary Table — The Whole Stack, Top to Bottom

| Layer | Kernel Structure / Mechanism | Section |
|---|---|---|
| Application syscalls | `socket()`/`bind()`/`listen()`/`accept()` | 8.1 |
| Connection setup | 3-way handshake, SYN Queue → Accept Queue | 8.2 |
| Connection lifecycle | TCP state machine (`ESTABLISHED`, `TIME_WAIT`, ...) | 8.3–8.4 |
| Packet reception | NIC → RX Ring → DMA → NAPI → `sk_buff` → socket RX queue | 8.5 |
| Path selection | Routing table, longest-prefix match | 8.6 |
| Isolation | Network namespaces, veth pairs, bridges | 8.7 |
| Filtering / NAT | Netfilter hooks, iptables/nftables tables | 8.8 |
| Low-level access | Raw sockets, `sysctl` tuning | 8.9 |

Together, these sections take you from a single `accept()`ed connection all the way out to how a fleet of containers share one host's network stack — the exact scope an "expert in Linux internals, networking stack, network protocols, routing" interview question is likely to probe.

**End of Topic 8: The Linux Network Stack**
