## TOPIC: weak_ptr, Reference Cycles and enable_shared_from_this

### INTERVIEW_QA: Interview Questions with Detailed Answers

#### Q1: What is `std::weak_ptr`, and why not just use a raw pointer as the non-owning link?
**Difficulty:** #beginner
**Category:** #smart_pointers #ownership
**Concepts:** #weak_ptr #control_block #non_owning

**Answer:**
A `weak_ptr` is a non-owning observer of an object managed by `shared_ptr`. It does not keep the object alive, but because it participates in the same control block it can always tell whether the object still exists, and `lock()` turns it into a temporary owner safely. A raw pointer cannot tell you whether its target has been destroyed.

**Explanation:**
- `weak_ptr` increments the **weak** count only; the object's lifetime is governed solely by the **strong** count.
- The control block outlives the object while weak references exist, which is what makes `expired()` / `lock()` answerable after destruction.
- A raw pointer to a destroyed object looks exactly like a valid one; using it is a use-after-free.
- ❌ Common wrong answer: "`weak_ptr` is just a non-owning pointer." That is also true of `T*`; the point is **lifetime awareness** through the control block.
- ✅ What a strong answer adds: raw pointers remain the right choice when the lifetime is guaranteed by structure (owner outlives every use); `weak_ptr` is for when the observer cannot know the owner's schedule.

**Key takeaway:** `weak_ptr` = non-owning + can detect death + can temporarily acquire ownership.

---

#### Q2: After `p.reset()`, does the `42` still exist? Does the control block? What does `w.lock()` do?
**Difficulty:** #beginner
**Category:** #smart_pointers #lifetime
**Concepts:** #strong_count #weak_count #make_shared

```cpp
std::shared_ptr<int> p = std::make_shared<int>(42);
std::weak_ptr<int> w = p;
p.reset();
```

**Answer:**
The `int` object is destroyed at `p.reset()` (strong count 1 → 0). The control block survives because `w` still references it (weak count 1). `w.lock()` sees strong count 0 and returns an empty `shared_ptr`; it cannot bring the object back.

**Explanation:**
- Object lifetime ends at strong 0; control block is freed at weak 0 (when `w` is destroyed or reset).
- With `make_shared` the storage is only released when the weak count also reaches 0 (memory retention: see topic 07). The object's lifetime still ended at `reset()`.
- `lock()` returns an empty `shared_ptr`, not a raw `nullptr`, and does not throw.
- ❌ Common wrong answer: "The 42 lives until both counts are 0." The object is dead at strong 0; only raw storage can linger (topic 07).
- ✅ What a strong answer adds: why `weak_ptr` breaks cycles even though it shares the control block: it adds no **strong** edge, so it never prevents the strong count from reaching 0.

**Key takeaway:** Strong 0 kills the object; weak 0 frees the control block.

---

#### Q3: Why does `weak_ptr` have no `operator->`, and what exactly does `lock()` return?
**Difficulty:** #beginner
**Category:** #smart_pointers #api_design
**Concepts:** #lock #weak_ptr #dangling

**Answer:**
Because the object may already be destroyed, there must be no way to access it without first becoming an owner. `lock()` returns a `std::shared_ptr<T>`: a real co-owner (strong count +1) if the object is alive, or an empty `shared_ptr` if it has expired.

**Explanation:**
- `child->parent->next` with a `weak_ptr` parent does not compile ("base operand of '->' has non-pointer type 'std::weak_ptr<Node>'").
- While you hold the `shared_ptr` from `lock()`, no other thread can destroy the object, even if every other owner releases it.
- Idiom: `if (auto p = w.lock()) { use(*p); }`; ownership ends at the closing brace.
- ❌ Common wrong answer: "`lock()` gives the underlying raw pointer, or nullptr." It gives a `shared_ptr`; the ownership is the important part.
- ✅ What a strong answer adds: `weak_ptr` also has no `get()` and no `operator*`; all access goes through `lock()`.

**Key takeaway:** No access without ownership: `lock()`, test, use.

---

#### Q4: What is wrong with `if (!w.expired()) w.lock()->process();`?
**Difficulty:** #intermediate
**Category:** #smart_pointers #concurrency
**Concepts:** #toctou #lock #expired

**Answer:**
It is a check-then-act race: another thread can release the last `shared_ptr` between `expired()` and `lock()`. `lock()` then returns an empty `shared_ptr` and `->` dereferences null (undefined behaviour). Use `if (auto sp = w.lock()) sp->process();`.

**Explanation:**
- Each call is atomic; the pair is not.
- `lock()` is implemented with a compare-and-swap that increments the strong count only if it is not 0, so it can never return a pointer to a dying object.
- `expired() == true` is final and safe to act on (e.g. prune a dead observer). `expired() == false` is stale as soon as it is read.
- ❌ Common wrong answer: "It's fine because `expired()` is thread-safe." Thread-safe calls do not make a sequence of calls atomic.
- ✅ What a strong answer adds: the same race exists with `w.use_count() > 0`; and single-threaded code can hit it too if a callback between the two calls releases the owner.

**Key takeaway:** Test and acquire in one step: the result of `lock()` is the check.

---

#### Q5: What is the difference between `w.lock()` and `std::shared_ptr<T>(w)`?
**Difficulty:** #intermediate
**Category:** #smart_pointers #error_handling
**Concepts:** #bad_weak_ptr #lock

**Answer:**
Both produce a `shared_ptr` sharing ownership if the object is alive. If it has expired, `lock()` returns an empty `shared_ptr`, while the constructor throws `std::bad_weak_ptr`.

**Explanation:**
- Use `lock()` when "already gone" is an expected outcome: callbacks, caches, observers.
- Use the constructor when expiry means a broken invariant and you want a loud failure instead of a silent null.
- `shared_from_this()` is defined in terms of the constructor, which is why it throws `bad_weak_ptr` on unowned objects (C++17).
- ❌ Common wrong answer: "They're identical." Only on the success path.
- ✅ What a strong answer adds: `bad_weak_ptr::what()` returns "bad_weak_ptr" in libstdc++.

**Key takeaway:** `lock()` reports expiry by value; the constructor reports it by exception.

---

#### Q6: Two objects hold `shared_ptr`s to each other. What happens? Is it a deadlock?
**Difficulty:** #beginner
**Category:** #smart_pointers #memory_leaks
**Concepts:** #reference_cycle #strong_count

```cpp
struct A; struct B;
struct A { std::shared_ptr<B> b; };
struct B { std::shared_ptr<A> a; };

auto a = std::make_shared<A>();
auto b = std::make_shared<B>();
a->b = b;
b->a = a;
a.reset();
b.reset();
```

**Answer:**
It is a memory leak, not a deadlock. After the assignments both strong counts are 2; the two `reset()` calls bring each to 1, and nothing can bring them to 0 because each object owns the other. Neither destructor ever runs.

**Explanation:**
- Trace: after `make_shared`: A=1, B=1. `a->b = b`: B=2. `b->a = a`: A=2. `a.reset()`: A=1. `b.reset()`: B=1.
- Both objects are now unreachable from the program but still owned by each other.
- A deadlock needs threads waiting on each other; here nothing waits, nothing runs.
- LeakSanitizer reports such a cycle as "Indirect leak" entries only (each block is referenced by another leaked block).
- ❌ Common wrong answer: "Deadlock: each waits for the other to be destroyed." Nothing is waiting; it is just reference counting that never reaches zero.
- ✅ What a strong answer adds: the side effects of the destructors (closing sockets, flushing files, unregistering) are also lost, not just the memory.

**Key takeaway:** A strong cycle is a silent leak; `shared_ptr` is reference counting, not garbage collection.

---

#### Q7: In a parent/child structure, which link should be `weak_ptr`? What goes wrong if you pick the other one?
**Difficulty:** #intermediate
**Category:** #smart_pointers #design
**Concepts:** #ownership_graph #weak_ptr #cycle_breaking

**Answer:**
The parent owns the child (`shared_ptr` down) and the child observes the parent (`weak_ptr` up). Making the parent's child link weak instead also breaks the cycle, but then the parent no longer keeps its child alive: the child dies as soon as its other owners go, even though the parent still refers to it.

**Explanation:**
- Rule: strong edges must form a tree (or DAG) following ownership; every back edge is weak (or a raw pointer with guaranteed lifetime).
- Correct version:
```cpp
struct Order {
    std::weak_ptr<Order> parent;    // observe
    std::shared_ptr<Order> child;   // own
};
```
- With that: `parent->child = child; child->parent = parent;` gives parent strong 1, child strong 2. `parent.reset()` destroys the parent, which releases the child (2 → 1); `child.reset()` destroys the child.
- Same rule elsewhere: list `next` strong, `prev` weak; object owns its callback, callback observes the object.
- ❌ Common wrong answer: "Any link, as long as one is weak." It compiles and stops the leak, but encodes the wrong ownership.
- ✅ What a strong answer adds: for genuinely cyclic graphs, let a container/arena own all nodes and use indices or raw pointers between them.

**Key takeaway:** Weak goes on the edge that does not mean ownership.

---

#### Q8: After `root->next = child; child->parent = root;` (weak parent), what are the counts, and what is destroyed when `root.reset()` runs?
**Difficulty:** #intermediate
**Category:** #smart_pointers #lifetime
**Concepts:** #destruction_cascade #weak_ptr #strong_count

**Answer:**
Before the reset: root strong 1 (plus 1 weak from `child->parent`), child strong 2 (the `child` variable and `root->next`). `root.reset()` takes root to 0, so root's `Node` is destroyed; destroying its member `next` drops child to 1. The child survives, and `child->parent` is now expired.

**Explanation:**
- Sequence: root strong 1 → 0; `~Node` body for root runs; then its members are destroyed; `next` releases child: 2 → 1.
- `child->parent.lock()` now returns empty; `expired()` is true. The control block of root stays until `child->parent` is destroyed.
- `lock()` while root was alive would have shown root strong 2 for the lifetime of the returned `shared_ptr`.
- ❌ Common wrong answer: "Destroying root destroys the child too." Only if root held the last strong reference to it.
- ❌ Common wrong answer: "Child's strong count is 1 because only `root->next` owns it." The local `child` variable is a `shared_ptr` too.
- ✅ What a strong answer adds: with very long strong chains this cascade is recursive (each destructor destroys the next node), which can overflow the stack (topic 07).

**Key takeaway:** Count every `shared_ptr`, including locals; destruction cascades through owning members.

---

#### Q9: A button stores an `onClick` lambda that captures the button's own `shared_ptr` by value. Why does `~Button` never print?
**Difficulty:** #intermediate
**Category:** #smart_pointers #lambdas
**Concepts:** #self_capture #reference_cycle #std_function

```cpp
auto button = std::make_shared<Button>();
button->onClick = [button] { std::cout << button->name << " onClick\n"; };
```

**Answer:**
The lambda holds a copy of the `shared_ptr` (use count 2), and the lambda lives inside `button->onClick`, a member of the `Button`. So `Button → std::function → lambda → shared_ptr<Button> → Button` is a cycle. When the local `button` dies the count drops to 1 and stays there.

**Explanation:**
- Fix: capture a `weak_ptr` and lock it on each call:
```cpp
std::weak_ptr<Button> weak = button;
button->onClick = [weak] {
    if (auto b = weak.lock()) std::cout << b->name << " onClick\n";
};
```
- The fixed handler becomes a harmless no-op if it is ever invoked after the button is gone.
- Capturing `this` would avoid the cycle but risks use-after-free if the handler outlives the button.
- ❌ Common wrong answer: "Capture by reference: `[&button]`." That captures a reference to a local variable that dies at the end of the scope: a dangling reference.
- ✅ What a strong answer adds: the same cycle appears with timers, completion handlers and signal/slot connections stored on the object.

**Key takeaway:** A callback stored in the object must not own the object.

---

#### Q10: What problem does `enable_shared_from_this` solve, and why not `std::shared_ptr<T>(this)`?
**Difficulty:** #intermediate
**Category:** #smart_pointers #enable_shared_from_this
**Concepts:** #control_block #double_delete #shared_from_this

**Answer:**
A member function sometimes needs a `shared_ptr` to its own object, for example to keep it alive during an async operation. `shared_ptr<T>(this)` creates a second, independent control block for an object already owned elsewhere, leading to a double delete. `enable_shared_from_this<T>` stores a hidden `weak_ptr` to the owning control block, so `shared_from_this()` returns a `shared_ptr` that shares the existing ownership.

**Explanation:**
- The hidden `weak_ptr` is filled in by the `shared_ptr` constructor (or `make_shared`) when it sees a public, unambiguous `enable_shared_from_this` base.
- `shared_from_this()` is essentially `shared_ptr<T>(weak_this)`.
- Typical use: `auto self = shared_from_this(); post([self] { self->on_read(); });` so the session lives until the handler has run.
```cpp
#include <iostream>
#include <memory>

struct Bad {
    std::shared_ptr<Bad> self() { return std::shared_ptr<Bad>(this); }   // 2nd block
};
struct Good : std::enable_shared_from_this<Good> {
    std::shared_ptr<Good> self() { return shared_from_this(); }
};

int main() {
    auto g = std::make_shared<Good>();
    auto g2 = g->self();
    std::cout << "good use_count=" << g.use_count() << '\n';     // 2
    auto b = std::make_shared<Bad>();
    auto b2 = b->self();
    std::cout << "bad use_count=" << b.use_count() << '\n';      // 1: separate counts
}   // b2 deletes the object, then b destroys it again: double free
```
- Output: `good use_count=2`, `bad use_count=1`, then a crash at exit (glibc: "double free or corruption (out)"; ASan: "attempting free on address which was not malloc()-ed", since `b2` calls `delete` on an address inside the `make_shared` block).
- ❌ Common wrong answer: "`shared_ptr(this)` increments the existing count." A `shared_ptr` constructed from a raw pointer always makes a new control block.
- ✅ What a strong answer adds: capturing raw `this` in the async handler is the other bug: no double delete, but a use-after-free if the caller drops the session first.

**Key takeaway:** `shared_from_this()` reuses the existing control block; `shared_ptr(this)` forks a second one.

---

#### Q11: When does `shared_from_this()` fail, and what happens?
**Difficulty:** #intermediate
**Category:** #smart_pointers #enable_shared_from_this
**Concepts:** #bad_weak_ptr #weak_from_this #factory

**Answer:**
Whenever no `shared_ptr` currently owns the object: in the constructor, in the destructor, for stack or `unique_ptr`-owned objects, and when the base is inherited privately. Since C++17 it throws `std::bad_weak_ptr`; before C++17 it was undefined behaviour.

**Explanation:**
- Constructor: the `shared_ptr` that will own the object is created only after the constructor returns.
- Destructor: the strong count is already 0.
- Private inheritance: the `shared_ptr` constructor cannot see the base, so the weak this is never set; `shared_from_this()` throws even with `make_shared` (verified with GCC 11).
- `weak_from_this()` (C++17) never throws: it returns an empty `weak_ptr` when unowned.
- Enforce the precondition with a factory: private or passkey constructor + `static std::shared_ptr<T> create()`; do the registration in a `start()` called by the factory after construction.
```cpp
#include <iostream>
#include <memory>

struct S : std::enable_shared_from_this<S> {};

int main() {
    S local;
    try {
        local.shared_from_this();
    } catch (const std::bad_weak_ptr& e) {
        std::cout << "stack object: " << e.what() << '\n';
    }
    std::cout << "weak_from_this expired: " << local.weak_from_this().expired() << '\n';
    auto sp = std::make_shared<S>();
    std::cout << "owned: " << sp->shared_from_this().use_count() << '\n';
}
```
- Output: `stack object: bad_weak_ptr`, `weak_from_this expired: 1`, `owned: 2`.
- ❌ Common wrong answer: "It returns nullptr if the object is not shared." It throws.
- ✅ What a strong answer adds: converting a `unique_ptr<T>` into a `shared_ptr<T>` later does enable it, because that `shared_ptr` constructor sets the weak this.

**Key takeaway:** `shared_from_this()` requires an existing owner; enforce it with a factory.

---

#### Q12: In async code, when should a handler capture `shared_from_this()` and when `weak_from_this()`?
**Difficulty:** #advanced
**Category:** #smart_pointers #async
**Concepts:** #keep_alive #reference_cycle #callbacks

**Answer:**
Capture a strong `self` when the handler is held by an external executor that runs it once and then destroys it: the session should stay alive until the operation completes, and there is no cycle. Capture a `weak_ptr` when the handler is stored inside the object itself (timers, member callbacks) or in a long-lived registry, because a strong capture there is a cycle or an unwanted lifetime extension.

**Explanation:**
- Strong self in a one-shot external queue: `Session` lives until its last pending operation finishes, then dies naturally. This is the standard Asio session pattern.
- Strong self stored in a member (`timer_.on_expire([self] {...})`): `Session → timer → handler → Session`. With a periodic timer it never breaks: the session leaks.
- Weak capture: handler does `if (auto self = weak.lock())`; if the session is gone the event is ignored.
- Raw `this`: only when the object's destructor provably cancels and drains every pending handler first.
- ❌ Common wrong answer: "Always capture `shared_from_this()` to be safe." Safe from use-after-free, but it can create cycles and keep objects alive far longer than intended.
- ✅ What a strong answer adds: the question to ask is "who owns the container where this callback is stored?"; if the answer is "the object itself", the capture must be weak.

**Key takeaway:** Strong self for external one-shot work; weak self for anything the object stores.

---

#### Q13: How would you implement an observer pattern with `weak_ptr`, and why is it safer than raw observer pointers?
**Difficulty:** #intermediate
**Category:** #design_patterns #smart_pointers
**Concepts:** #observer #weak_ptr #pruning

**Answer:**
The subject stores `std::vector<std::weak_ptr<Observer>>`. On each notification it `lock()`s every entry, calls the live observers and erases the expired ones. Observers can die without unsubscribing; with raw pointers a forgotten unsubscribe means the subject calls into freed memory.

**Explanation:**
- The subject must not hold `shared_ptr<Observer>` unless it is supposed to keep observers alive; and if observers also hold the subject strongly, that is a cycle.
- Pruning with `std::erase_if(obs, [](auto& w) { return w.expired(); })` (C++20) is fine: an expired answer never becomes wrong.
- Thread-safety: the vector itself still needs a lock (or a copy-on-write snapshot) if subscribe and notify run on different threads (topic 08).
- Cost: one atomic increment and decrement per observer per event; on a hot path an explicit subscribe/unsubscribe contract with raw pointers may be preferred.
- ❌ Common wrong answer: "Store `shared_ptr` observers so they cannot dangle." That makes the subject an owner, so observers never die while subscribed.
- ✅ What a strong answer adds: `weak_ptr` cannot be sorted or hashed by value; if you need a set of observers use `std::owner_less<>`.

**Key takeaway:** Subject observes observers weakly; locking at notify time is the liveness check.

---

#### Q14: How do you use `weak_ptr` as a key in `std::set` or `std::map`?
**Difficulty:** #advanced
**Category:** #smart_pointers #containers
**Concepts:** #owner_less #owner_before #aliasing

**Answer:**
`weak_ptr` has no `operator<` (or `==` or hash), so supply `std::owner_less<>`: `std::set<std::weak_ptr<T>, std::owner_less<>>`. It orders by control block (owner), which stays stable after the object expires, so the container's ordering invariant never breaks.

**Explanation:**
- Value comparison would be meaningless: an expired `weak_ptr` has no meaningful pointer value to compare.
- Owner-based comparison treats aliasing pointers (same control block, different `get()`) as equivalent; ordinary `shared_ptr::operator==` compares stored pointers and says they differ.
- `std::owner_less<void>` (written `std::owner_less<>`) is C++17 and works across `shared_ptr` and `weak_ptr` mixes.
- C++26 adds `owner_hash()` / `owner_equal()` and `std::owner_hash` / `std::owner_equal` for unordered containers.
- Expired keys stay in the container until you erase them.
- ❌ Common wrong answer: "Compare `w.lock().get()`." Expired entries all become `nullptr` and collide, breaking the set's ordering.
- ✅ What a strong answer adds: a typical use is a "seen" set of observers or sessions, keyed by identity, that must not keep them alive.

**Key takeaway:** Key `weak_ptr` by owner: `std::owner_less<>`.

---

#### Q15: A cache returns raw pointers to its entries; another thread may evict entries. What is the bug and how do you fix it?
**Difficulty:** #intermediate
**Category:** #ownership #concurrency
**Concepts:** #use_after_free #cache_eviction #shared_ptr

**Answer:**
The cache owns the objects, but callers keep raw pointers after the cache may evict and destroy them: use-after-free. The access was separated from the lifetime. Fix by returning `shared_ptr` (eviction drops only the cache's ownership; the object lives until the last user finishes), or keep raw access and add an explicit deferred reclamation scheme if refcount cost matters.

**Explanation:**
- Sequence: worker gets `Object*` → cache evicts and destroys → worker dereferences freed memory.
- `shared_ptr` fix: cache stores `shared_ptr<const Object>`, `get()` returns a copy; eviction is just `erase`.
- Alternatives at high rates: epoch-based reclamation, hazard pointers, pinning/leasing an entry for the duration of use, or single-owner handoff.
- A `weak_ptr`-valued cache is the inverse design: the cache never keeps entries alive, users do (flyweight).
- ❌ Common wrong answer: "Raw pointers are the bug; never use them." The raw pointer is fine when the lifetime is guaranteed; here it is not.
- ✅ What a strong answer adds: the mutex around the map does not help: it protects the map, not the lifetime of objects after `get()` returns.

**Key takeaway:** Returning a non-owning pointer requires a lifetime guarantee; eviction breaks it.

---

#### Q16: A child's destructor calls `parent.lock()` to tell the parent it is going away. Why is the parent never notified at shutdown?
**Difficulty:** #advanced
**Category:** #smart_pointers #lifetime
**Concepts:** #destruction_cascade #weak_ptr #teardown_order

**Answer:**
When the children are destroyed as members of the parent, the parent's strong count is already 0: `~Parent` is running, so `lock()` on a `weak_ptr` to it returns empty. The notification works when a child dies on its own while the parent is alive, and silently does nothing during the parent's own teardown.

**Explanation:**
- Order: last owner releases the parent → strong count 0 → `~Parent` body runs → members (the children) are destroyed → each `~Child` calls `parent.lock()`, which sees strong 0.
- `lock()` can never resurrect an object whose strong count reached 0, even if its destructor has not finished yet. That is the same rule that makes `shared_from_this()` throw inside a destructor (Q11).
- The control block is still alive (the children's `weak_ptr`s pin it), so nothing crashes: the bug is a missing side effect (unregister, flush, counter update), which is harder to spot than a crash.
- Fixes:
  - Let the parent do teardown work itself in `~Parent` (it knows it is dying), before or instead of relying on child callbacks.
  - Give children a plain `Parent*` back pointer when the structure guarantees the parent outlives its children (it owns them), so the child can still reach the parent during `~Parent`; only touch parent members declared before the children container (members declared after it are already destroyed).
  - Clear the children explicitly in a `shutdown()` called while the parent is still owned.
```cpp
#include <iostream>
#include <memory>
#include <vector>

struct Parent;

struct Child {
    std::weak_ptr<Parent> parent;
    int id;
    Child(std::weak_ptr<Parent> p, int i) : parent(std::move(p)), id(i) {}
    ~Child();
};

struct Parent : std::enable_shared_from_this<Parent> {
    std::vector<std::unique_ptr<Child>> children;
    int live = 0;
    void add(int id) {
        children.push_back(std::make_unique<Child>(weak_from_this(), id));
        ++live;
    }
    void onChildGone(int id) {
        --live;
        std::cout << "parent notified: child " << id << '\n';
    }
    ~Parent() { std::cout << "~Parent, live=" << live << '\n'; }
};

Child::~Child() {
    if (auto p = parent.lock()) {
        p->onChildGone(id);
    } else {
        std::cout << "child " << id << ": parent.lock() is empty\n";
    }
}

int main() {
    auto p = std::make_shared<Parent>();
    p->add(1);
    p->add(2);
    p->children.pop_back();     // parent alive: notification works
    std::cout << "-- reset parent --\n";
    p.reset();                  // child 1 dies inside ~Parent
}
```
- Output (clean under ASan/UBSan):
```
parent notified: child 2
-- reset parent --
~Parent, live=1
child 1: parent.lock() is empty
```
- ❌ Common wrong answer: "The parent is still being destroyed, so it still exists and `lock()` succeeds." `lock()` checks the strong count, not whether the destructor has finished.
- ✅ What a strong answer adds: a `weak_ptr` back link answers "is the parent still owned?", which is exactly the wrong question during the parent's own destruction; structural back pointers (raw `Parent*`) are the right tool when the parent owns the children.

**Key takeaway:** During the owner's destruction, every `weak_ptr` to it is already expired; do teardown work in the owner, not through `lock()` from its members.

---

#### Q17: Is `weak_ptr::lock()` thread-safe?
**Difficulty:** #intermediate
**Category:** #smart_pointers #concurrency
**Concepts:** #lock #atomic_refcount #data_race

**Answer:**
Yes, with the usual handle rule: calling `lock()` on a `weak_ptr` while other threads release or copy other `shared_ptr`/`weak_ptr` instances to the same object is safe and atomic. Modifying the **same** `weak_ptr` instance from two threads (or reading it while another thread assigns it) is a data race.

**Explanation:**
- `lock()` atomically increments the strong count only if it is non-zero (a CAS loop in libstdc++). It either wins and returns a live owner, or sees 0 and returns empty; it never returns a pointer to an object being destroyed.
- The object itself gets no protection: two threads that both `lock()` successfully still need synchronization to modify it.
- C++20 `std::atomic<std::weak_ptr<T>>` exists for sharing one `weak_ptr` variable between threads.
- ❌ Common wrong answer: "`lock()` is just `expired()` plus a copy, so it races." The standard requires it to execute atomically.
- ✅ What a strong answer adds: the control block is always thread-safe; the handle and the pointee are not (three layers, topic 08).

**Key takeaway:** `lock()` is atomic against concurrent release; the same `weak_ptr` object is not shared-writable.

---

#### Q18: How would you find a `shared_ptr` reference cycle in a large codebase?
**Difficulty:** #intermediate
**Category:** #debugging #memory_leaks
**Concepts:** #leak_sanitizer #heap_profiling #ownership_graph

**Answer:**
Run tests under LeakSanitizer (ASan): a cycle shows up as "Indirect leak" entries with allocation stacks pointing at `make_shared` calls. In production look for steady RSS growth with heap profilers, and for destructors that never run (log or count them). Then draw the ownership graph of the types involved and find the back edge.

**Explanation:**
- LSan finds memory unreachable from roots at exit; a pure cycle has no direct leak because every node is still pointed to by another leaked node.
- Usual suspects: `std::function` members capturing `shared_ptr` to the owner, parent/child pointers both strong, observers holding the subject while the subject holds them, timers and completion handlers stored on the session.
- Instrumentation: count live instances (static atomic counter in ctor/dtor) and assert it returns to zero after a test scenario.
- ❌ Common wrong answer: "`shared_ptr` cannot leak." Cycles are exactly the case it cannot handle.
- ✅ What a strong answer adds: prevent rather than detect: code review rule "every `shared_ptr` member must name its owner direction"; prefer `unique_ptr` + raw/weak back links.

**Key takeaway:** Cycles hide as indirect leaks; find the strong back edge.

---

#### Q19: What does `weak_ptr` cost?
**Difficulty:** #advanced
**Category:** #smart_pointers #performance
**Concepts:** #memory_retention #atomics #make_shared

**Answer:**
Each `weak_ptr` is two pointers (16 bytes on typical x86-64); creating, copying and destroying one is an atomic update of the weak count; every `lock()` is an atomic CAS on the strong count plus a later decrement. With `make_shared`, outstanding `weak_ptr`s also keep the whole object-plus-control-block allocation from being freed after the object dies.

**Explanation:**
- Observer-style designs that `lock()` per event pay two atomic RMWs per observer per event, on a cache line shared with every other owner.
- `enable_shared_from_this` adds a hidden `weak_ptr` to every object.
- Large objects with long-lived weak observers: allocate with `shared_ptr<T>(new T)` so the object's storage can be freed separately from the control block.
- ❌ Common wrong answer: "`weak_ptr` is free because it doesn't own anything." It still maintains a count and pins the control block.
- ✅ What a strong answer adds: in single-threaded hot paths a generation-checked handle (index + generation counter) gives the same "is it still alive?" check without atomics.

**Key takeaway:** `weak_ptr` is cheap, not free: atomics per lock, and it pins memory with `make_shared`.
