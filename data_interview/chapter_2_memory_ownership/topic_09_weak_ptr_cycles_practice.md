## TOPIC: weak_ptr, Reference Cycles and enable_shared_from_this

### PRACTICE_TASKS: Output Prediction and Bug Hunting

#### Q1
```cpp
// Q: What does this print? Watch what weak_ptr::use_count() actually counts.
#include <iostream>
#include <memory>

int main() {
    auto a = std::make_shared<int>(7);
    std::weak_ptr<int> w1 = a;
    std::weak_ptr<int> w2 = w1;
    auto b = a;
    std::cout << a.use_count() << ' ' << w1.use_count() << '\n';
    auto c = w2.lock();
    std::cout << a.use_count() << '\n';
    a.reset();
    b.reset();
    std::cout << w1.use_count() << ' ' << w1.expired() << ' ' << *c << '\n';
    c.reset();
    std::cout << w1.use_count() << ' ' << w1.expired() << '\n';
}
```

**Answer:**
```
2 2
3
1 0 7
0 1
```

**Explanation:**
- `weak_ptr::use_count()` returns the **strong** count (number of `shared_ptr` owners), not the number of `weak_ptr`s. Two weak pointers exist, but it prints 2 because `a` and `b` own the int.
- `w2.lock()` creates a third owner `c`.
- After `a.reset(); b.reset();` the object is still alive: `c` owns it, so the strong count is 1 and `*c` is 7.
- `c.reset()` drops the last owner: the int is destroyed and both weak pointers are expired.
- **Key Concept:** A `lock()` result is a real owner; the object lives as long as it does, whatever happens to the original `shared_ptr`.

---

#### Q2
```cpp
// Q: Which destructors run?
#include <iostream>
#include <memory>
#include <string>
#include <vector>

struct Node {
    std::string name;
    std::shared_ptr<Node> parent;
    std::vector<std::shared_ptr<Node>> kids;
    explicit Node(std::string n) : name(std::move(n)) {}
    ~Node() { std::cout << "~" << name << '\n'; }
};

int main() {
    {
        auto root = std::make_shared<Node>("root");
        auto kid = std::make_shared<Node>("kid");
        root->kids.push_back(kid);
        kid->parent = root;
    }
    std::cout << "scope ended\n";
}
```

**Answer:**
```
scope ended
```

**Explanation:**
- `root` strong count is 2 (`root` and `kid->parent`); `kid` strong count is 2 (`kid` and `root->kids[0]`).
- Leaving the scope drops both to 1. Each node is kept alive by the other: a reference cycle, so neither destructor runs and both nodes leak.
- With ASan, LeakSanitizer reports only "Indirect leak" entries.
- **Key Concept:** A strong child-to-parent link closes the cycle; the back link must be weak.

**Fixed Version:**
```cpp
#include <iostream>
#include <memory>
#include <string>
#include <vector>

struct Node {
    std::string name;
    std::weak_ptr<Node> parent;                 // observe, do not own
    std::vector<std::shared_ptr<Node>> kids;    // own
    explicit Node(std::string n) : name(std::move(n)) {}
    ~Node() { std::cout << "~" << name << '\n'; }
};

int main() {
    {
        auto root = std::make_shared<Node>("root");
        auto kid = std::make_shared<Node>("kid");
        root->kids.push_back(kid);
        kid->parent = root;
    }
    std::cout << "scope ended\n";
}
```
- Output: `~root`, `~kid`, `scope ended`. `kid` (declared last) is released first but `root->kids` still owns it; then `root` dies and its `kids` vector releases the kid.

---

#### Q3
```cpp
// Q: Does this compile?
#include <iostream>
#include <memory>

struct Node {
    int value = 5;
    std::shared_ptr<Node> next;
    std::weak_ptr<Node> parent;
};

int main() {
    auto root = std::make_shared<Node>();
    auto child = std::make_shared<Node>();
    root->next = child;
    child->parent = root;
    std::cout << child->parent->value << '\n';
}
```

**Answer:**
```
Does not compile: error: base operand of '->' has non-pointer type 'std::weak_ptr<Node>'
```

**Explanation:**
- `weak_ptr` deliberately has no `operator->`, `operator*` or `get()`: the object might already be destroyed, and there must be no way to reach it without becoming an owner first.
- **Key Concept:** Access through a `weak_ptr` always goes through `lock()`.

**Fixed Version:**
```cpp
#include <iostream>
#include <memory>

struct Node {
    int value = 5;
    std::shared_ptr<Node> next;
    std::weak_ptr<Node> parent;
};

int main() {
    auto root = std::make_shared<Node>();
    auto child = std::make_shared<Node>();
    root->next = child;
    child->parent = root;
    if (auto p = child->parent.lock())
        std::cout << p->value << '\n';   // 5
}
```

---

#### Q4
```cpp
// Q: The code checks expired() before using the feed. Find the bug.
#include <iostream>
#include <memory>
#include <string>

struct Feed {
    std::string name = "itch";
};

std::shared_ptr<Feed> g_feed = std::make_shared<Feed>();

void on_heartbeat() {        // stands in for "another thread or callback"
    g_feed.reset();          // releases the last owner
}

void poll(const std::weak_ptr<Feed>& w) {
    if (!w.expired()) {
        on_heartbeat();
        auto f = w.lock();
        std::cout << f->name << '\n';
    }
}

int main() {
    poll(g_feed);
}
```

**Answer:**
```
Undefined behaviour: null dereference. Typically crashes (Segmentation fault, nothing printed).
UBSan: "member access within null pointer"; ASan: "SEGV on unknown address 0x000000000008".
```

**Explanation:**
- `expired()` returned false, but the owner was released before `lock()`. `lock()` correctly returns an empty `shared_ptr`, and `f->name` dereferences null.
- Here the release is a direct call so the failure is deterministic; in real code it is another thread, and the bug appears rarely (check-then-act race).
- **Key Concept:** `lock()` is the check. Test its result instead of calling `expired()` first.

**Fixed Version:**
```cpp
#include <iostream>
#include <memory>
#include <string>

struct Feed {
    std::string name = "itch";
};

std::shared_ptr<Feed> g_feed = std::make_shared<Feed>();

void on_heartbeat() { g_feed.reset(); }

void poll(const std::weak_ptr<Feed>& w) {
    if (auto f = w.lock()) {      // owner from here on
        on_heartbeat();           // cannot destroy the feed under us
        std::cout << f->name << '\n';
    } else {
        std::cout << "feed gone\n";
    }
}

int main() {
    poll(g_feed);   // prints itch; the Feed is destroyed when f goes out of scope
    poll(g_feed);   // prints feed gone
}
```

---

#### Q5
```cpp
// Q: What happens when this runs?
#include <iostream>
#include <memory>
#include <vector>

struct Session;
std::vector<std::shared_ptr<Session>> registry;

struct Session : std::enable_shared_from_this<Session> {
    Session() {
        registry.push_back(shared_from_this());   // register myself
        std::cout << "registered\n";
    }
};

int main() {
    auto s = std::make_shared<Session>();
    std::cout << "registry size " << registry.size() << '\n';
}
```

**Answer:**
```
terminate called after throwing an instance of 'std::bad_weak_ptr'
  what():  bad_weak_ptr
(aborted; nothing is printed to stdout)
```

**Explanation:**
- Inside the constructor no `shared_ptr` owns the object yet: `make_shared` sets up the hidden weak this only after construction completes.
- Since C++17 `shared_from_this()` then throws `std::bad_weak_ptr` (C++11/14: undefined behaviour). Uncaught, it calls `std::terminate`.
- **Key Concept:** `shared_from_this()` needs an existing owner; do registration in a second phase.

**Fixed Version:**
```cpp
#include <iostream>
#include <memory>
#include <vector>

struct Session;
std::vector<std::shared_ptr<Session>> registry;

struct Session : std::enable_shared_from_this<Session> {
    static std::shared_ptr<Session> create() {
        auto s = std::make_shared<Session>();
        s->start();                               // owned now
        return s;
    }
    void start() {
        registry.push_back(shared_from_this());
        std::cout << "registered\n";
    }
};

int main() {
    auto s = Session::create();
    std::cout << "registry size " << registry.size()
              << ", use_count " << s.use_count() << '\n';   // 1, 2
}
```

---

#### Q6
```cpp
// Q: The object is created with make_shared. What does this print?
#include <iostream>
#include <memory>

class Conn : std::enable_shared_from_this<Conn> {
public:
    std::shared_ptr<Conn> self() { return shared_from_this(); }
};

int main() {
    auto c = std::make_shared<Conn>();
    try {
        auto s = c->self();
        std::cout << "use_count " << s.use_count() << '\n';
    } catch (const std::bad_weak_ptr& e) {
        std::cout << "caught " << e.what() << '\n';
    }
}
```

**Answer:**
```
caught bad_weak_ptr
```

**Explanation:**
- `class` inherits **privately** by default. `shared_ptr`'s constructor only enables shared-from-this for an unambiguous, **accessible** `enable_shared_from_this` base, so the weak this is never set.
- `shared_from_this()` is still callable from inside the class, so everything compiles; it fails at run time (verified with GCC 11 / libstdc++).
- **Key Concept:** Always `public std::enable_shared_from_this<T>`.

**Fixed Version:**
```cpp
#include <iostream>
#include <memory>

class Conn : public std::enable_shared_from_this<Conn> {
public:
    std::shared_ptr<Conn> self() { return shared_from_this(); }
};

int main() {
    auto c = std::make_shared<Conn>();
    auto s = c->self();
    std::cout << "use_count " << s.use_count() << '\n';   // 2
}
```

---

#### Q7
```cpp
// Q: What is printed? Does ~Session run?
#include <functional>
#include <iostream>
#include <memory>

struct Timer {
    std::function<void()> cb;
};

struct Session : std::enable_shared_from_this<Session> {
    Timer timer;
    int ticks = 0;
    void arm() {
        timer.cb = [self = shared_from_this()] { ++self->ticks; };
    }
    ~Session() { std::cout << "~Session\n"; }
};

int main() {
    std::weak_ptr<Session> w;
    {
        auto s = std::make_shared<Session>();
        s->arm();
        s->timer.cb();
        w = s;
    }
    std::cout << "expired: " << w.expired() << ", owners: " << w.use_count() << '\n';
}
```

**Answer:**
```
expired: 0, owners: 1
```

**Explanation:**
- The timer is a member of `Session`, the handler is stored in the timer, and the handler owns the session: `Session → timer → cb → shared_ptr<Session>`.
- When `s` dies the count drops to 1 (the capture) and stays there: `~Session` never runs. LeakSanitizer reports it as an indirect leak.
- The same strong capture would be correct if the handler lived in an external one-shot queue that destroys it after running.
- **Key Concept:** A handler stored inside the object must capture `weak_from_this()`.

**Fixed Version:**
```cpp
#include <functional>
#include <iostream>
#include <memory>

struct Timer {
    std::function<void()> cb;
};

struct Session : std::enable_shared_from_this<Session> {
    Timer timer;
    int ticks = 0;
    void arm() {
        timer.cb = [weak = weak_from_this()] {          // C++17
            if (auto self = weak.lock()) ++self->ticks;
        };
    }
    ~Session() { std::cout << "~Session\n"; }
};

int main() {
    std::weak_ptr<Session> w;
    {
        auto s = std::make_shared<Session>();
        s->arm();
        s->timer.cb();
        w = s;
    }   // ~Session printed here
    std::cout << "expired: " << w.expired() << ", owners: " << w.use_count() << '\n';
    // expired: 1, owners: 0
}
```

---

#### Q8
```cpp
// Q: What does this print, and in what order?
#include <iostream>
#include <memory>

struct N {
    char id;
    std::shared_ptr<N> next;
    explicit N(char c) : id(c) {}
    ~N() { std::cout << "~" << id << ' '; }
};

int main() {
    auto a = std::make_shared<N>('a');
    a->next = std::make_shared<N>('b');
    a->next->next = std::make_shared<N>('c');
    auto keep = a->next;     // second owner of b
    a.reset();
    std::cout << "| ";
    keep.reset();
    std::cout << "|\n";
}
```

**Answer:**
```
~a | ~b ~c |
```

**Explanation:**
- `a.reset()`: `a`'s node has strong count 1, so it dies: `~a` prints, then its member `next` is destroyed, taking `b` from 2 to 1. `b` survives because `keep` owns it.
- `keep.reset()`: `b` reaches 0: `~b` prints, then its `next` member releases `c` (count 1 → 0): `~c`.
- The destructor body runs before the members are destroyed, so each node prints before its successor.
- **Key Concept:** Destruction cascades along owning members, stopping at any node that still has another owner.

---

#### Q9
```cpp
// Q: Does this compile?
#include <iostream>
#include <memory>
#include <set>

int main() {
    auto p = std::make_shared<int>(1);
    std::set<std::weak_ptr<int>> seen;
    seen.insert(p);
    std::cout << seen.size() << '\n';
}
```

**Answer:**
```
Does not compile: error: no match for 'operator<' (operand types are 'const std::weak_ptr<int>' and 'const std::weak_ptr<int>')
```

**Explanation:**
- `weak_ptr` has no `operator<` (and no `==` or `std::hash`): its pointed-to value can expire, so value comparison would not be stable.
- Ownership comparison is stable: it compares control blocks, which do not change when the object dies.
- **Key Concept:** Use `std::owner_less<>` as the comparator for `weak_ptr` keys.

**Fixed Version:**
```cpp
#include <iostream>
#include <memory>
#include <set>

int main() {
    auto p = std::make_shared<int>(1);
    std::set<std::weak_ptr<int>, std::owner_less<>> seen;   // C++17 owner_less<void>
    seen.insert(p);
    seen.insert(p);                                         // same owner: ignored
    p.reset();
    std::cout << seen.size() << ' ' << seen.begin()->expired() << '\n';   // 1 1
}
```

---

#### Q10
```cpp
// Q: The handler captures the button by reference to avoid a cycle. Find the bug.
#include <functional>
#include <iostream>
#include <memory>
#include <string>

struct Button {
    std::string name;
    ~Button() { std::cout << "~Button\n"; }
};

int main() {
    std::function<void()> handler;
    {
        auto button = std::make_shared<Button>();
        button->name = "ok";
        handler = [&button] { std::cout << button->name << '\n'; };
    }
    handler();
}
```

**Answer:**
```
~Button, then undefined behaviour when handler() runs: it uses the destroyed local 'button'.
At -O0 it happened to print "ok" from stale memory; ASan: stack-use-after-scope.
```

**Explanation:**
- `[&button]` captures a reference to the local `shared_ptr` variable, not ownership. The variable dies at the closing brace (and with it the `Button`, which prints `~Button`).
- `handler()` then reads a dead stack object and dereferences whatever pointer it finds there.
- It does avoid the cycle, but by trading a leak for a use-after-free.
- **Key Concept:** To avoid a cycle without dangling, capture a `weak_ptr` by value and `lock()` it.

**Fixed Version:**
```cpp
#include <functional>
#include <iostream>
#include <memory>
#include <string>

struct Button {
    std::string name;
    ~Button() { std::cout << "~Button\n"; }
};

int main() {
    std::function<void()> handler;
    {
        auto button = std::make_shared<Button>();
        button->name = "ok";
        handler = [w = std::weak_ptr<Button>(button)] {
            if (auto b = w.lock()) std::cout << b->name << '\n';
            else std::cout << "button gone\n";
        };
        handler();          // ok
    }                       // ~Button
    handler();              // button gone
}
```

---

#### Q11
```cpp
// Q: An observer unsubscribes "eventually". Find the bug.
#include <iostream>
#include <memory>
#include <string>
#include <vector>

struct Observer {
    int id;
    void on_tick(int t) { std::cout << "observer " << id << " tick " << t << '\n'; }
};

struct Clock {
    std::vector<Observer*> obs;
    void tick(int t) {
        for (auto* o : obs) o->on_tick(t);
    }
};

int main() {
    Clock clock;
    auto a = std::make_unique<Observer>(Observer{7});
    clock.obs.push_back(a.get());
    clock.tick(1);
    a.reset();           // observer destroyed, still registered
    clock.tick(2);
}
```

**Answer:**
```
observer 7 tick 1
then undefined behaviour (use-after-free) on the second tick.
At -O0 it printed "observer -1567743010 tick 2" (garbage id); ASan: heap-use-after-free (READ of size 4).
```

**Explanation:**
- The clock keeps a raw pointer to an observer whose lifetime it does not control and cannot check.
- Without ASan the second tick may print a garbage id, print "observer 7 tick 2" from stale memory, or crash: all are UB.
- Two valid fixes: unsubscribe in the observer's destructor (explicit contract, cheap), or store `weak_ptr` and `lock()` per notification (self-cleaning, costs atomics).
- **Key Concept:** A subject holding raw observer pointers needs a guaranteed unsubscribe; otherwise observe them through `weak_ptr`.

**Fixed Version:**
```cpp
#include <iostream>
#include <memory>
#include <string>
#include <vector>

struct Observer {
    int id;
    void on_tick(int t) { std::cout << "observer " << id << " tick " << t << '\n'; }
};

struct Clock {
    std::vector<std::weak_ptr<Observer>> obs;
    void tick(int t) {
        for (auto& w : obs)
            if (auto o = w.lock()) o->on_tick(t);
        std::erase_if(obs, [](const auto& w) { return w.expired(); });
    }
};

int main() {
    Clock clock;
    auto a = std::make_shared<Observer>(Observer{7});
    clock.obs.push_back(a);
    clock.tick(1);           // observer 7 tick 1
    a.reset();
    clock.tick(2);           // nothing; entry pruned
    std::cout << "observers left: " << clock.obs.size() << '\n';   // 0
}
```

---

#### Q12
```cpp
// Q: What does this print?
#include <iostream>
#include <memory>

struct W : std::enable_shared_from_this<W> {};

int main() {
    auto u = std::make_unique<W>();
    std::cout << "unique: " << u->weak_from_this().expired() << '\n';
    std::shared_ptr<W> s = std::move(u);
    std::cout << "shared: " << s->weak_from_this().expired()
              << ' ' << s->shared_from_this().use_count() << '\n';
}
```

**Answer:**
```
unique: 1
shared: 0 2
```

**Explanation:**
- While owned by `unique_ptr`, no `shared_ptr` exists, so the hidden weak this is empty: `weak_from_this()` (C++17) is expired (and `shared_from_this()` would throw).
- Converting the `unique_ptr` into a `shared_ptr` creates the control block and initializes the weak this.
- `shared_from_this()` returns a second owner sharing that control block: use count 2 while the temporary exists.
- **Key Concept:** Shared-from-this is enabled by whichever `shared_ptr` first takes ownership, including one converted from `unique_ptr`.

---

#### Q13
```cpp
// Q: What does this print?
#include <iostream>
#include <memory>

struct S : std::enable_shared_from_this<S> {
    int v = 1;
};

int main() {
    auto a = std::make_shared<S>();
    S copy = *a;
    std::cout << copy.weak_from_this().expired() << '\n';
    auto b = std::make_shared<S>(*a);
    std::cout << (b->shared_from_this() == a) << ' ' << a.use_count() << '\n';
}
```

**Answer:**
```
1
0 1
```

**Explanation:**
- Copying an object does not copy the hidden weak this: `enable_shared_from_this`'s copy constructor and copy assignment deliberately leave the new object's link alone.
- `copy` is a stack object, unowned: its weak this is empty.
- `b` is a new object with its own control block; its `shared_from_this()` points to `b`'s block, not `a`'s, and `a` still has one owner.
- If the copy had inherited `a`'s weak this, `shared_from_this()` on the copy would return a pointer to a different object.
- **Key Concept:** The weak this belongs to an object identity; copies get their own (or none).
