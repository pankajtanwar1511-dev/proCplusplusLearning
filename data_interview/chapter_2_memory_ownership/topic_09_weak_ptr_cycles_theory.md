## TOPIC: weak_ptr, Reference Cycles and enable_shared_from_this

### THEORY_SECTION: Core Concepts

#### 1. Mental model
- `shared_ptr` says **"I own this object"**: while I exist, it stays alive.
- `weak_ptr` says **"I want to observe this object, but I do not want to keep it alive"**.
- Both point at the same **control block** (see topic 07 for its layout). The control block has two counters:
  - **Strong count** (`use_count`): number of `shared_ptr` owners. When it reaches 0, the **managed object is destroyed**.
  - **Weak count**: number of `weak_ptr` observers (libstdc++ adds 1 while any strong owner exists). When it reaches 0, the **control block is freed**.
- A `weak_ptr` keeps the **control block** alive, never the **object**. That is exactly what lets it answer "is the object still alive?" safely after the object is gone.
- You cannot use a `weak_ptr` directly. To touch the object you **temporarily become an owner**: `lock()` returns a `shared_ptr` (empty if the object is already dead).
- Two separate design questions run through this whole topic:
  - **Ownership**: who decides when the object dies?
  - **Access**: who may look at it, and how do they know it is still alive?
- `weak_ptr` is the standard answer when access must outlive (or be independent of) ownership and the accessor cannot know the owner's schedule.

#### 2. The weak_ptr API contract
| Operation | Meaning | Notes |
|---|---|---|
| `std::weak_ptr<T> w = sp;` | Observe the object owned by `sp` | Increments weak count only; `noexcept` |
| `w.lock()` | `shared_ptr<T>` to the object, or empty `shared_ptr` if expired | Atomic: never returns a pointer to a dying object |
| `w.expired()` | `use_count() == 0` | Only a hint in concurrent code (Edge Case 1) |
| `w.use_count()` | **Strong** count of the observed object | Not the weak count; 0 if empty or expired |
| `w.reset()` | Stop observing | Decrements weak count |
| `std::shared_ptr<T> sp(w);` | Like `lock()`, but **throws** `std::bad_weak_ptr` if expired | Use when "dead" is a bug, not a normal state |
| `w.owner_before(x)` | Ownership-based ordering | Basis of `std::owner_less` (section 9) |
| `operator->`, `operator*`, `get()` | **Do not exist** | Deliberate: the object might be gone |

- No constructor from a raw pointer: a `weak_ptr` can only be created from a `shared_ptr` or another `weak_ptr`. It always refers to an existing control block (or to none).
- Size: two pointers (16 bytes on typical x86-64), same as `shared_ptr`: object pointer + control block pointer.
- `lock()` returning a `shared_ptr` matters: the strong count goes up for as long as you hold the result, so the object cannot die in the middle of your use, even if every other owner releases it concurrently.
- `lock()` on an expired `weak_ptr` returns an **empty `shared_ptr`**, which compares equal to `nullptr`. It does not throw, and it does not return a raw pointer.

#### 3. Two lifetimes: object vs control block
- Timeline for `auto p = std::make_shared<int>(42); std::weak_ptr<int> w = p; p.reset();`
  - `p.reset()`: strong count 1 → 0, so the `int` is **destroyed** right there (its destructor runs; for an `int` that is trivial).
  - The control block **survives**: `w` still needs it to report `expired() == true`.
  - `w` destroyed (or `w.reset()`): weak count → 0, control block freed.
- `lock()` after that `reset()` returns an empty `shared_ptr`; it cannot "resurrect" the object. Once the strong count has reached 0 it never goes up again.
- `make_shared` twist: object and control block share **one allocation**. The object's lifetime ends at strong count 0, but the bytes are returned only when the weak count also reaches 0. A long-lived `weak_ptr` to a large `make_shared` object retains that memory (measured in topic 07).
- ❌ "The object is released when both strong and weak counts reach 0." ✅ The **object** dies at strong 0; the **control block** (and, with `make_shared`, the shared storage) goes at weak 0.

#### 4. lock() is the only safe access path
- Correct pattern: test and own in one step.
```cpp
if (auto sp = w.lock()) {      // owner for the rest of this block
    sp->use();
}                              // ownership dropped here
```
- `if (!w.expired()) w.lock()->use();` is a **check-then-act race** (TOCTOU): another thread can drop the last strong owner between the two calls, so `lock()` returns empty and `->` dereferences null (UB).
- `expired() == true` is reliable (a dead object never comes back). `expired() == false` is stale the moment you read it in concurrent code. Use `expired()` only for cleanup decisions ("prune dead observers"), never as a guard for access.
- Thread safety (details in topic 08): `lock()` on one `weak_ptr` while another thread destroys the last `shared_ptr` is safe: the control block uses an atomic compare-and-swap that refuses to increment a strong count that is already 0. Concurrently **writing** the same `weak_ptr` instance is a data race, same rules as `shared_ptr`. C++20 adds `std::atomic<std::weak_ptr<T>>`.

#### 5. Reference cycles
- A cycle of **strong** edges keeps every object in it alive forever.
```text
a ──> [A] ──next(shared)──> [B] <── b
       ^                     |
       └────next(shared)─────┘
```
- Count trace for `a->next = b; b->next = a;`:
  - After `make_shared`: A strong 1, B strong 1.
  - `a->next = b`: B strong 2. `b->next = a`: A strong 2.
  - `a` and `b` go out of scope: A 2 → 1, B 2 → 1. Neither reaches 0, so no destructor runs and both nodes leak.
- It is a **memory leak**, not a deadlock: no threads, no locks, nothing is waiting. The objects are simply unreachable but still owned.
- The leak is silent: no crash, no error. Symptoms in production are slow RSS growth and destructors that never run (sockets never closed, files never flushed).
- Detection:
  - LeakSanitizer (`-fsanitize=address`) reports a pure cycle as **"Indirect leak"** only: every node is still referenced by another leaked node, so none is a "direct" leak.
  - Destructor logging in tests; heap profilers (heaptrack, massif) over time.
- `shared_ptr` cannot detect cycles itself: it is plain reference counting, not a tracing garbage collector.

#### 6. Breaking cycles: which link becomes weak
- Rule: draw the ownership graph. It must be a **tree (or DAG) of strong edges**. Every back edge becomes `weak_ptr` (or a raw pointer/reference if its lifetime is guaranteed).
- Make the link weak that does **not** express ownership:
  - Parent owns children (`shared_ptr` / `unique_ptr` down), child observes parent (`weak_ptr` up).
  - Doubly linked list: `next` strong, `prev` weak.
  - Object owns its callback; the callback observes the object (section 7).
  - Subject observes its observers; observers own themselves or are owned elsewhere (section 8).
- Making the wrong edge weak also breaks the cycle but changes semantics: with `std::weak_ptr<Order> child;` in the parent, the parent no longer keeps its child alive, so the child dies as soon as its other owners go, while the parent still "has" it.
- Trace for the usual fix (`shared_ptr` child, `weak_ptr` parent):
  - `root->next = child; child->parent = root;` gives root strong 1 (+1 weak), child strong 2 (the `child` variable and `root->next`).
  - `root.reset()`: root strong 1 → 0, root destroyed. Its member `next` is destroyed with it, so child strong 2 → 1. `child->parent` is now expired.
  - `child.reset()`: child strong 1 → 0, child destroyed.
- Alternatives when the graph is genuinely cyclic (general graphs): an owning container/arena (`std::vector<Node>` or a pool) plus indices or raw pointers between nodes; the whole graph dies together.
- Destruction cascade cost: destroying the head of a long strong chain destroys the next node from inside the previous destructor (recursion depth = chain length). Very long lists can overflow the stack (topic 07).

#### 7. Callbacks and lambdas that capture shared_ptr
- Classic self-cycle:
```cpp
auto button = std::make_shared<Button>();
button->onClick = [button] { std::cout << button->name; };   // captured copy
```
  - The lambda holds a copy of the `shared_ptr`, so the use count is 2.
  - The `std::function` holding the lambda is a member of `Button`: `Button → onClick → lambda → shared_ptr<Button> → Button`.
  - When `button` goes out of scope the count goes 2 → 1 and stays there: `~Button` never runs.
- Fix: capture a `weak_ptr` and `lock()` inside the callback.
- The same cycle hides in: timers stored in the object, completion handlers stored in a member queue, `std::function` members of sessions, signal/slot connections stored on the emitter.
- Capturing raw `this` is the opposite failure: no cycle, but if the callback runs after the object is destroyed it is a use-after-free.
- Decision table:

| Where the callback is stored | Capture | Why |
|---|---|---|
| Inside the object itself | `weak_ptr` | A strong capture is a cycle |
| In an external executor that runs it once and then drops it | `shared_from_this()` (strong) is fine | Deliberate keep-alive until the work completes; no cycle because the object does not own the queue |
| In an external registry that may outlive the object and fire later | `weak_ptr` | The object should be allowed to die; the callback becomes a no-op |
| Lifetime of the object is guaranteed to exceed the callback | raw `this` | Only with a documented guarantee (e.g. callbacks unregistered and drained in the destructor) |

#### 8. enable_shared_from_this
- Problem: a member function needs a `shared_ptr` to its own object (to hand to an async operation or register itself), but it only has `this`.
- `std::shared_ptr<T>(this)` is wrong: it creates a **second control block** for an object that already has one. Two independent counts → two deletes (double free; the general raw-pointer case is topic 07).
- Solution: `class Session : public std::enable_shared_from_this<Session>`.
  - The base holds a hidden `weak_ptr<Session>` ("weak this").
  - When a `shared_ptr` first takes ownership of the object (`make_shared`, `shared_ptr<T>(new T)`, conversion from `unique_ptr`), it detects the base and initializes that `weak_ptr`.
  - `shared_from_this()` locks it, returning a `shared_ptr` that **shares the existing control block**.
- Preconditions and traps:
  - The object must already be owned by a `shared_ptr`. Otherwise (stack object, `unique_ptr`-owned, raw `new`) `shared_from_this()` throws `std::bad_weak_ptr` (guaranteed since C++17; earlier it was undefined behaviour).
  - Not inside the constructor: during construction no `shared_ptr` owns the object yet, so it throws `bad_weak_ptr`. Use a two-phase `create()` factory that constructs, then calls `start()`.
  - Not inside the destructor: the strong count is already 0, so it throws too. Use `weak_from_this()` there if needed (it will be expired).
  - Inheritance must be **public** and unambiguous. With private inheritance the `shared_ptr` constructor cannot see the base, the weak this is never set, and `shared_from_this()` throws `bad_weak_ptr` even for `make_shared` objects (verified with GCC 11).
- `weak_from_this()` (C++17) returns the `weak_ptr` without throwing: empty if not owned. Use it for callbacks stored in the object.
- Factory pattern to enforce the precondition: private (or passkey-protected) constructor plus `static std::shared_ptr<T> create(...)`. Then nobody can create an unowned instance.
- Copying an object derived from `enable_shared_from_this` does **not** copy the weak this: the copy is a new object with its own (initially empty) link.
- Cost: one `weak_ptr` (16 bytes on typical x86-64) inside every object, plus a weak count increment at ownership time.

#### 9. Observers, caches and owner-based comparison
- **Observer pattern with weak_ptr**:
  - Subject stores `std::vector<std::weak_ptr<Observer>>`.
  - On notify: `lock()` each; call the live ones; erase the expired ones.
  - Observers do not have to unsubscribe in their destructor. With raw `Observer*` they must, or the subject calls into freed memory.
  - The subject must not hold `shared_ptr<Observer>` unless it is meant to keep observers alive (and that risks a cycle when observers also hold the subject).
  - Locking every observer on every event costs atomic RMWs; on a hot path consider explicit subscribe/unsubscribe with raw pointers and a clear lifetime rule.
- **Cache of shared objects (flyweight)**: `std::unordered_map<Key, std::weak_ptr<const T>>`.
  - `load(k)`: `lock()` the entry; if alive return it, otherwise create, store a `weak_ptr`, return the `shared_ptr`.
  - The cache never keeps an object alive; the object lives as long as some user holds it. Expired entries must be pruned occasionally.
- **weak_ptr as a key**: `weak_ptr` has no `operator<`, `operator==` or `std::hash`. Values can change (expire), so value comparison would be meaningless.
  - Use **ownership** comparison: `std::owner_less<>` (the `void` specialization is C++17) orders by control block, not by stored pointer.
  - `std::set<std::weak_ptr<T>, std::owner_less<>>` and `std::map<std::weak_ptr<T>, V, std::owner_less<>>` work, and entries stay correctly ordered even after the object expires.
  - Owner-equivalence also identifies aliasing `shared_ptr`s (topic 07) as the same owner even though their `get()` differs.
  - C++26 adds `owner_hash()`, `owner_equal()` and `std::owner_hash` / `std::owner_equal` for unordered containers.

#### 10. Ownership vs access: designing lifetimes
- Default question for every pointer in a design: **owning or non-owning?**
  - One clear owner → `std::unique_ptr` (or a container/pool slot).
  - Genuinely shared ownership (several independent parties, unknown which finishes last) → `std::shared_ptr`.
  - Observer that must detect death → `std::weak_ptr`.
  - Observer whose lifetime is guaranteed by structure (owner outlives the use, joined threads, scoped work) → raw `T*` / `T&`. Raw pointers are fine as **non-owning** observers; they are wrong only when the lifetime contract is unclear.
- Cache eviction bug: a cache owns `unique_ptr<Object>`, `get()` returns `Object*`, another thread evicts and destroys the entry while a worker is still using the pointer: use-after-free. Fixes:
  - Store and return `shared_ptr` (eviction drops only the cache's ownership).
  - Or keep raw access and add explicit deferred reclamation (epochs, hazard pointers, pinning) if refcount cost matters.
- High-rate fan-out of immutable messages: copying `shared_ptr<Message>` across threads makes every copy and destruction an atomic RMW on one control-block cache line (contention analysis in topic 08). Do not "just use raw pointers"; redesign ownership:
  - If the readers are joined before the owner destroys the message: single owner + `const Message&`.
  - If readers finish asynchronously: pool-owned slots + `const Message*` + an explicit reclamation scheme (per-message completion counter, acknowledgements back to the owner, or progress/epoch watermarks). Measure: a custom atomic counter is not automatically faster than `shared_ptr`.
  - Reduce refcount traffic: pass `const shared_ptr<T>&` or `T&` to functions that do not keep ownership; move rather than copy; one reference per batch.
- `shared_ptr` everywhere is not a design: it hides who owns what, makes cycles likely, and turns destruction time into "whenever the last copy happens to die" (possibly on a latency-critical thread).

#### 11. Misconceptions to unlearn
- ❌ "A reference cycle causes a deadlock." ✅ It causes a leak: counts never reach 0, so destructors never run. No threads involved.
- ❌ "`weak_ptr` keeps the object alive until the weak count is 0." ✅ The object dies at strong count 0; only the control block waits for the weak count.
- ❌ "`lock()` gives a raw pointer to the memory." ✅ It returns a `shared_ptr` (temporary co-ownership), empty if expired.
- ❌ "`w->member` works like a smart pointer." ✅ `weak_ptr` has no `->`, `*` or `get()`; it does not compile.
- ❌ "Check `expired()` first, then `lock()`." ✅ Just `lock()` and test the result; the two-step version races.
- ❌ "`w.use_count()` is the number of weak pointers." ✅ It is the strong count of the observed object.
- ❌ "Make whichever link weak; any one breaks the cycle." ✅ It must be the non-owning (back) link, or ownership semantics change.
- ❌ "`shared_from_this()` works anywhere in the class." ✅ Only after a `shared_ptr` owns the object: not in the constructor, not in the destructor, not on stack objects, and only with public inheritance.
- ❌ "`shared_ptr<T>(this)` is the same as `shared_from_this()`." ✅ It creates a second control block and a double delete.
- ❌ "Raw pointers are always dangerous; replace them with `shared_ptr`." ✅ Raw pointers are the right tool for non-owning access with a guaranteed lifetime; the danger is an unclear lifetime contract.

### EDGE_CASES: Traps and Misconceptions

#### Edge Case 1: expired() followed by lock()
- `if (!w.expired()) { auto sp = w.lock(); sp->run(); }` looks safe, but another thread can release the last owner between the two calls. `sp` is then empty and `sp->run()` dereferences null (UB, usually a crash).
- `expired()` and `lock()` are each atomic; the sequence of two is not.
- Fix: `if (auto sp = w.lock()) sp->run();`. The test and the acquisition of ownership are one operation.
- Same race with `if (w.use_count() > 0)`.

#### Edge Case 2: weak_ptr has no operator->
- `child->parent->next` where `parent` is a `weak_ptr` does not compile: "base operand of '->' has non-pointer type 'std::weak_ptr<Node>'".
- This is intentional: there is no moment where you hold a usable pointer without also holding ownership.
- Write `if (auto p = child->parent.lock()) use(p->next);`.

#### Edge Case 3: lock() vs the shared_ptr(weak_ptr) constructor
- `w.lock()` on an expired `weak_ptr` returns an empty `shared_ptr` (no exception).
- `std::shared_ptr<T> sp(w);` on an expired `weak_ptr` throws `std::bad_weak_ptr` (`what()` is "bad_weak_ptr" in libstdc++).
- Choose by intent: `lock()` when "already gone" is a normal outcome (callbacks, caches); the constructor when it indicates a bug and should fail loudly.

#### Edge Case 4: shared_from_this() in the constructor
- During construction no `shared_ptr` owns the object yet; the hidden weak this is still empty.
- C++17 and later: throws `std::bad_weak_ptr`. C++11/14: undefined behaviour.
- Typical bug: `Session() { loop.register(shared_from_this()); }`.
- Fix: two-phase creation: `static std::shared_ptr<Session> create() { auto s = std::shared_ptr<Session>(new Session); s->start(); return s; }` (or `make_shared` with a passkey constructor), and register in `start()`.

#### Edge Case 5: shared_from_this() on an object nobody shares
- Stack object, `unique_ptr`-owned object, or plain `new` without a `shared_ptr`: `shared_from_this()` throws `std::bad_weak_ptr` (C++17).
- Converting `unique_ptr<T>` to `shared_ptr<T>` later does initialize the weak this, because the `shared_ptr` constructor sees the base at that point.
- `weak_from_this()` returns an empty `weak_ptr` instead of throwing: use it when the object may legitimately be unowned.

#### Edge Case 6: Private inheritance silently disables it
- `struct S : std::enable_shared_from_this<S>` with `class` instead of `struct`, or explicit `private`, makes the base inaccessible to `shared_ptr`'s constructor.
- The code compiles, `shared_from_this()` is still callable from inside the class, but the weak this was never set: it throws `bad_weak_ptr` even for an object created with `make_shared`.
- Always write `class X : public std::enable_shared_from_this<X>`.

#### Edge Case 7: The keep-alive capture that became a cycle
- `timer_.on_expire([self = shared_from_this()] { self->tick(); });` where `timer_` is a member of the same object: the object owns the timer, the timer owns the callback, the callback owns the object.
- The object leaks until the timer fires and drops the handler; a periodic timer never drops it.
- The same capture handed to an external executor that runs it once and destroys it is fine and often intended (keeps the session alive until the operation completes).
- Rule: strong self-capture is a cycle exactly when the callback is stored somewhere the object itself owns.

#### Edge Case 8: weak_ptr in a set or map
- `std::set<std::weak_ptr<T>>` does not compile when you insert: `weak_ptr` has no `operator<`.
- Use `std::set<std::weak_ptr<T>, std::owner_less<>>`. The ordering uses the control block address, which does not change when the object expires, so the set's invariants stay valid.
- Expired entries remain in the container until you erase them: periodic pruning (`std::erase_if` with `expired()`) is your job.

#### Edge Case 9: weak observer retains a make_shared block
- `auto big = std::make_shared<Buffer4MB>(); cache.push_back(big);` with `cache` holding `weak_ptr`: after `big` dies the destructor runs, but the 4 MB block (object storage + control block, one allocation) is freed only when the last `weak_ptr` dies.
- Long-lived weak observers of large objects: use `std::shared_ptr<T>(new T)` (separate allocations), or prune expired weak pointers promptly. Measurement in topic 07.

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: weak_ptr lifecycle: counts, lock, expiry
- `use_count()` on a `weak_ptr` reports the strong count; `lock()` temporarily adds an owner.
```cpp
#include <iostream>
#include <memory>

struct Res {
    int v = 42;
    ~Res() { std::cout << "~Res\n"; }
};

int main() {
    auto p = std::make_shared<Res>();
    std::weak_ptr<Res> w = p;
    std::cout << "strong=" << p.use_count() << " w.use_count=" << w.use_count() << '\n';

    if (auto sp = w.lock()) {                     // temporary owner
        std::cout << "locked v=" << sp->v << " strong=" << p.use_count() << '\n';
    }
    std::cout << "after lock scope strong=" << p.use_count() << '\n';

    p.reset();                                    // last owner: ~Res runs here
    std::cout << "expired=" << w.expired() << '\n';
    auto sp2 = w.lock();
    std::cout << "lock after expiry is null: " << (sp2 == nullptr) << '\n';
    try {
        std::shared_ptr<Res> sp3(w);              // constructor throws instead
    } catch (const std::bad_weak_ptr& e) {
        std::cout << "ctor threw " << e.what() << '\n';
    }
}
```
- Output:
```
strong=1 w.use_count=1
locked v=42 strong=2
after lock scope strong=1
~Res
expired=1
lock after expiry is null: 1
ctor threw bad_weak_ptr
```

#### Example 2: A two-node cycle leaks; one weak link fixes it
- Same nodes, once with a strong back link, once with a weak one.
```cpp
#include <iostream>
#include <memory>
#include <string>

struct Strong {
    std::string name;
    std::shared_ptr<Strong> next;
    ~Strong() { std::cout << "~Strong " << name << '\n'; }
};

struct Weak {
    std::string name;
    std::shared_ptr<Weak> next;   // owning direction
    std::weak_ptr<Weak> prev;     // back link: observe only
    ~Weak() { std::cout << "~Weak " << name << '\n'; }
};

int main() {
    {
        auto a = std::make_shared<Strong>();
        auto b = std::make_shared<Strong>();
        a->name = "A";
        b->name = "B";
        a->next = b;
        b->next = a;
        std::cout << "cycle: A=" << a.use_count() << " B=" << b.use_count() << '\n';
    }
    std::cout << "after strong scope (nothing destroyed above)\n";
    {
        auto a = std::make_shared<Weak>();
        auto b = std::make_shared<Weak>();
        a->name = "A";
        b->name = "B";
        a->next = b;
        b->prev = a;
        std::cout << "weak: A=" << a.use_count() << " B=" << b.use_count() << '\n';
    }
    std::cout << "after weak scope\n";
}
```
- Output:
```
cycle: A=2 B=2
after strong scope (nothing destroyed above)
weak: A=1 B=2
~Weak A
~Weak B
after weak scope
```
- Built with `-fsanitize=address`, LeakSanitizer reports two `Indirect leak of 64 byte(s)` entries (the two `Strong` blocks: control block + object, one allocation each) and nothing for `Weak`.
- Destruction order of the weak version: `b` is destroyed first (reverse declaration order) but B still has an owner (`a->next`), so B count 2 → 1; then `a` dies: `~Weak A` runs, its member `next` releases B: `~Weak B`.

#### Example 3: Parent/child tree with a weak parent link
- Verifies the counts root=1, child=2 and the destruction cascade.
```cpp
#include <iostream>
#include <memory>
#include <string>

struct Node {
    std::string name;
    std::shared_ptr<Node> next;     // owns the child
    std::weak_ptr<Node> parent;     // observes the parent
    explicit Node(std::string n) : name(std::move(n)) {}
    ~Node() { std::cout << "~" << name << '\n'; }
};

int main() {
    auto root = std::make_shared<Node>("root");
    auto child = std::make_shared<Node>("child");
    root->next = child;
    child->parent = root;
    std::cout << "root=" << root.use_count() << " child=" << child.use_count() << '\n';

    if (auto p = child->parent.lock())
        std::cout << "parent is " << p->name
                  << ", root strong now " << root.use_count() << '\n';

    root.reset();     // root dies; its 'next' member releases child
    std::cout << "child=" << child.use_count()
              << " parent expired=" << child->parent.expired() << '\n';
    child.reset();
    std::cout << "end\n";
}
```
- Output:
```
root=1 child=2
parent is root, root strong now 2
~root
child=1 parent expired=1
~child
end
```
- `root.reset()` runs `~Node` for root (prints `~root`), then destroys its members: `next` drops the child from 2 to 1.
- `child->parent->next` would not compile: lock first.

#### Example 4: Callback stored in the object: the self-capture cycle
- A strong capture leaks the button; a weak capture lets it die and turns late clicks into no-ops.
```cpp
#include <functional>
#include <iostream>
#include <memory>
#include <string>

struct Button {
    std::string name;
    std::function<void()> onClick;
    ~Button() { std::cout << "~Button " << name << '\n'; }
};

int main() {
    {
        auto button = std::make_shared<Button>();
        button->name = "leaky";
        button->onClick = [button] { std::cout << button->name << " onClick\n"; };
        button->onClick();
        std::cout << "use_count=" << button.use_count() << '\n';
    }   // count 2 -> 1: ~Button never runs

    std::function<void()> saved;
    {
        auto button = std::make_shared<Button>();
        button->name = "fixed";
        std::weak_ptr<Button> weak = button;
        button->onClick = [weak] {
            if (auto b = weak.lock()) std::cout << b->name << " onClick\n";
            else std::cout << "button gone, ignored\n";
        };
        button->onClick();
        saved = button->onClick;                  // someone kept a copy of the handler
        std::cout << "use_count=" << button.use_count() << '\n';
    }
    saved();                                      // safe: lock() fails
}
```
- Output:
```
leaky onClick
use_count=2
fixed onClick
use_count=1
~Button fixed
button gone, ignored
```
- The leaky button is reported by LeakSanitizer (`Indirect leak`) when built with ASan.

#### Example 5: enable_shared_from_this with a simulated event loop
- Async work posted to an external queue keeps the session alive (strong `self`); a handler stored inside the session would use `weak_from_this()`.
```cpp
#include <functional>
#include <iostream>
#include <memory>
#include <vector>

std::vector<std::function<void()>> event_queue;   // external executor

class Session : public std::enable_shared_from_this<Session> {
    struct Passkey {};
    int id_;
public:
    Session(Passkey, int id) : id_(id) {}
    static std::shared_ptr<Session> create(int id) {
        return std::make_shared<Session>(Passkey{}, id);   // always shared-owned
    }
    void start() {
        auto self = shared_from_this();        // shares the existing control block
        event_queue.push_back([self] { self->on_read(); });
        std::cout << "start: use_count=" << self.use_count() << '\n';
    }
    void on_read() { std::cout << "session " << id_ << " read done\n"; }
    ~Session() { std::cout << "~Session " << id_ << '\n'; }
};

int main() {
    {
        auto s = Session::create(1);
        s->start();
    }   // caller dropped its pointer; the queued handler still owns the session
    std::cout << "caller released, queue size=" << event_queue.size() << '\n';
    for (auto& h : event_queue) h();
    event_queue.clear();                       // handler destroyed: last owner gone
    std::cout << "queue cleared\n";
}
```
- Output:
```
start: use_count=3
caller released, queue size=1
session 1 read done
~Session 1
queue cleared
```
- `use_count=3`: `s` in `main`, the lambda's copy in the queue, and the local `self`.
- Capturing raw `this` instead would call `on_read` on a destroyed session (use-after-free).
- The passkey makes the constructor public for `make_shared` but unusable outside the class, so an unowned `Session` cannot exist.

#### Example 6: Observer pattern with weak_ptr and pruning
- Observers die without unsubscribing; the subject skips and removes them.
```cpp
#include <iostream>
#include <memory>
#include <string>
#include <vector>

struct Observer {
    std::string name;
    explicit Observer(std::string n) : name(std::move(n)) {}
    void on_price(double p) { std::cout << name << " got " << p << '\n'; }
};

class Ticker {
    std::vector<std::weak_ptr<Observer>> obs_;
public:
    void subscribe(const std::shared_ptr<Observer>& o) { obs_.push_back(o); }
    void publish(double price) {
        for (auto& w : obs_)
            if (auto o = w.lock()) o->on_price(price);
        std::erase_if(obs_, [](const auto& w) { return w.expired(); });   // C++20
        std::cout << "live observers: " << obs_.size() << '\n';
    }
};

int main() {
    Ticker t;
    auto a = std::make_shared<Observer>("risk");
    t.subscribe(a);
    {
        auto b = std::make_shared<Observer>("gui");
        t.subscribe(b);
        t.publish(101.5);
    }   // gui destroyed, never unsubscribed
    t.publish(102.0);
}
```
- Output:
```
risk got 101.5
gui got 101.5
live observers: 2
risk got 102
live observers: 1
```
- Using `expired()` for pruning is fine: a `true` answer can never become wrong.
- With `std::vector<Observer*>` the second `publish` would call into a destroyed object.

#### Example 7: weak_ptr cache and owner_less keys
- The cache returns shared objects without keeping them alive; a `std::set` of `weak_ptr` needs `std::owner_less<>`.
```cpp
#include <iostream>
#include <map>
#include <memory>
#include <set>
#include <string>

struct Instrument {
    std::string sym;
    explicit Instrument(std::string s) : sym(std::move(s)) {
        std::cout << "load " << sym << '\n';
    }
};

class InstrumentCache {
    std::map<std::string, std::weak_ptr<const Instrument>> cache_;
public:
    std::shared_ptr<const Instrument> get(const std::string& sym) {
        auto& slot = cache_[sym];
        if (auto sp = slot.lock()) return sp;              // still alive: share it
        auto sp = std::make_shared<const Instrument>(sym); // (re)load
        slot = sp;
        return sp;
    }
};

int main() {
    InstrumentCache c;
    auto x = c.get("ES");
    auto y = c.get("ES");                                  // no reload
    std::cout << "same object: " << (x == y) << '\n';
    x.reset();
    y.reset();                                             // last user gone
    auto z = c.get("ES");                                  // reloads

    struct Pair { int a; int b; };
    auto owner = std::make_shared<Pair>();
    std::shared_ptr<int> pa(owner, &owner->a);             // aliasing ctor
    std::shared_ptr<int> pb(owner, &owner->b);
    std::set<std::weak_ptr<int>, std::owner_less<>> seen;
    seen.insert(pa);
    seen.insert(pb);                                       // same owner: not inserted
    std::cout << "pa==pb: " << (pa == pb) << ", set size: " << seen.size() << '\n';
}
```
- Output:
```
load ES
same object: 1
load ES
pa==pb: 0, set size: 1
```
- `pa == pb` compares stored pointers (different members); `owner_less` compares control blocks (same owner).

### QUICK_REFERENCE: Cheat Sheet

#### weak_ptr operations
| Expression | Result | Throws? |
|---|---|---|
| `w.lock()` | `shared_ptr` or empty | No |
| `std::shared_ptr<T>(w)` | `shared_ptr` | `bad_weak_ptr` if expired |
| `w.expired()` | `use_count() == 0` | No |
| `w.use_count()` | Strong count | No |
| `w->x`, `*w`, `w.get()` | Compile error | n/a |
| `w.owner_before(v)` / `std::owner_less<>` | Ordering by control block | No |
| `sizeof(std::weak_ptr<T>)` | 16 (typical x86-64) | n/a |

#### Counts and lifetimes
| Event | Strong | Weak | Object | Control block |
|---|---|---|---|---|
| `auto p = make_shared<T>()` | 1 | 0 | alive | alive |
| `weak_ptr w = p` | 1 | 1 | alive | alive |
| `auto q = w.lock()` | 2 | 1 | alive | alive |
| `q.reset(); p.reset()` | 0 | 1 | **destroyed** | alive (make_shared memory kept) |
| `w.reset()` | 0 | 0 | gone | **freed** |

#### enable_shared_from_this rules
| Situation | `shared_from_this()` |
|---|---|
| Object owned by `shared_ptr`, public base | Works, shares control block |
| Inside constructor or destructor | Throws `bad_weak_ptr` (C++17) |
| Stack / `unique_ptr` / raw `new` object | Throws `bad_weak_ptr` (C++17); UB before |
| Private or ambiguous base | Throws `bad_weak_ptr` even with `make_shared` |
| Need a non-throwing version | `weak_from_this()` (C++17) |

#### Which link is weak?
| Relationship | Strong edge | Weak edge |
|---|---|---|
| Tree | parent → child | child → parent |
| Doubly linked list | `next` | `prev` |
| Object with stored callback | object → callback | callback → object |
| Subject / observer | (observers owned elsewhere) | subject → observers |
| Cache | users → object | cache → object |

#### Interview one-liners
| Question | Answer |
|---|---|
| What does `weak_ptr` keep alive? | The control block, never the object |
| Reference cycle: deadlock or leak? | Leak: counts never reach 0, destructors never run |
| How to access through a `weak_ptr`? | `if (auto sp = w.lock())` |
| Why not `expired()` then `lock()`? | Race between the two calls |
| Why does `weak_ptr` have no `->`? | Access without ownership could hit a dead object |
| `lock()` on expired? | Empty `shared_ptr`, no exception |
| Why `enable_shared_from_this`? | `shared_ptr(this)` would create a second control block |
| `shared_from_this()` in constructor? | Throws `bad_weak_ptr` (C++17) |
| Capture in a stored callback? | `weak_ptr`; strong `self` only for external one-shot work |
| `weak_ptr` as a map key? | `std::owner_less<>` comparator |
| Raw pointer always bad? | No: fine for non-owning access with a guaranteed lifetime |
| `shared_ptr` refcount too hot? | Rethink ownership: single owner + observers, pools, explicit reclamation; measure |
