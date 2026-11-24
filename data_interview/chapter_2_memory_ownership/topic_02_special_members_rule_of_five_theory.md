## TOPIC: Special Member Functions and the Rule of 0/3/5

### THEORY_SECTION: Core Concepts

#### 1. Mental model
- A class's special member functions define its **value semantics**: what it means to create, duplicate, transfer and destroy one of its objects.
- The compiler writes them for you **memberwise**: copy each member, move each member, destroy each member. That is correct exactly when every member already knows how to copy, move and destroy itself.
- It is wrong when a member is a **handle without ownership semantics**: a raw owning pointer, a file descriptor `int`, a socket, a `HANDLE`. Copying the handle duplicates the *name* of the resource, not the resource, so two objects believe they own it.
- Three rules follow from that one idea:
  - **Rule of 0**: do not own raw resources in ordinary classes; hold RAII members (`std::vector`, `std::string`, `std::unique_ptr`) and write none of the special members.
  - **Rule of 3** (C++98): if you need a user-written destructor, copy constructor or copy assignment, you almost certainly need all three.
  - **Rule of 5** (C++11): the same, plus move constructor and move assignment, because declaring any of the three suppresses the implicit moves.
- The rule is a design check, not a typing exercise: "I wrote a destructor" should trigger the question "what happens when this object is copied, moved, assigned?", and the answer may be `= delete`.

#### 2. The six special members and when each runs
| Member | Signature | Runs when |
|---|---|---|
| Default constructor | `T()` | `T a;` `T a{};` `new T` |
| Destructor | `~T()` | End of lifetime (scope exit, `delete`, container erase) |
| Copy constructor | `T(const T&)` | A **new** object is initialized from an lvalue: `T b(a);` `T b = a;` pass/return by value |
| Copy assignment | `T& operator=(const T&)` | An **existing** object is assigned from an lvalue: `b = a;` |
| Move constructor (C++11) | `T(T&&) noexcept` | A new object is initialized from an rvalue: `T b(std::move(a));` |
| Move assignment (C++11) | `T& operator=(T&&) noexcept` | An existing object is assigned from an rvalue: `b = std::move(a);` |

- **Constructor vs assignment** depends on whether the destination already exists. `T b = a;` contains `=` but is initialization, so it calls the copy constructor.
- **Copy vs move** depends on the value category of the source expression (lvalue vs rvalue). Value categories and `std::move` are covered in topic 03.
- `T b = T(100);` calls neither copy nor move in C++17: the prvalue initializes `b` directly (guaranteed copy elision, topic 04).
- Copy assignment has to deal with an **old resource** in the destination; construction does not. That difference is why assignment is the harder function to write.

#### 3. When the compiler generates what (the Hinnant table)
- "User-declared" includes `= default` and `= delete`. Only *declaring* matters, not what the body does.

| You declare | Default ctor | Destructor | Copy ctor | Copy assign | Move ctor | Move assign |
|---|---|---|---|---|---|---|
| Nothing | defaulted | defaulted | defaulted | defaulted | defaulted | defaulted |
| Any constructor | not declared | defaulted | defaulted | defaulted | defaulted | defaulted |
| Destructor | defaulted | **yours** | defaulted ⚠️ deprecated | defaulted ⚠️ deprecated | **not declared** | **not declared** |
| Copy ctor | not declared | defaulted | **yours** | defaulted ⚠️ deprecated | **not declared** | **not declared** |
| Copy assign | defaulted | defaulted | defaulted ⚠️ deprecated | **yours** | **not declared** | **not declared** |
| Move ctor | not declared | defaulted | **deleted** | **deleted** | **yours** | not declared |
| Move assign | defaulted | defaulted | **deleted** | **deleted** | not declared | **yours** |

- Read the two asymmetries carefully:
  - Declaring a **copy op or destructor** makes the moves **not declared**. Rvalues then bind to the copy constructor (`const T&` accepts rvalues), so `std::move` silently copies. Correct but slow.
  - Declaring a **move op** makes both copies **deleted**. Copying then fails to compile.
- "Not declared" and "deleted" are different:
  - Not declared: the function does not exist; overload resolution picks something else (the copy).
  - Deleted: the function exists, wins overload resolution, and the call is ill-formed.
- ⚠️ Deprecated (since C++11) means: still generated today, still does a memberwise copy, so a Rule-of-3 violation compiles silently.
  - Destructor-only case (the classic leak/double delete): GCC warns only with `-Wdeprecated-copy-dtor`, Clang with `-Wdeprecated`; neither warns under `-Wall -Wextra` (GCC 11, Clang 14).
  - User-provided copy constructor with an implicit copy assignment (or the reverse): GCC's `-Wextra` includes `-Wdeprecated-copy` and warns when the implicit one is used; Clang 14 is silent under `-Wall -Wextra` if the class also has a user-provided destructor.
- `~T() = default;` written in the class is still **user-declared**: the type stays trivially destructible, but the implicit moves are gone.

#### 4. The shallow copy problem and the Rule of 3
- Classic broken class: owns `int* data` from `new int[n]`, has a destructor, no copy control.
- `Buffer b = a;` uses the implicit copy constructor: `b.data = a.data`. Two owners, one allocation.
  - At scope end `~b` frees the array, then `~a` frees it again: **double delete, undefined behaviour** (it *may* crash; ASan reports `attempting double-free`). Do not answer "it segfaults".
  - Any write through `b` is visible through `a`: aliasing bug even before destruction.
- `b = a;` (implicit copy assignment) is worse: `b`'s old array is **leaked** and then double deleted later.
- Rule of 3 fix:
  - **Copy constructor**: allocate a new array, copy the elements (deep copy).
  - **Copy assignment**: produce the new state first, then release the old resource, then commit; return `*this`.
  - **Destructor**: release the resource.
- Copy assignment checklist:
  1. Self-assignment `a = a` must not destroy the source before reading it.
  2. Allocate and copy **before** deleting the old array, so a `std::bad_alloc` leaves `*this` unchanged (strong guarantee).
  3. Release the old resource.
  4. Update all members (pointer and size together), return `*this`.
- The naive order `delete[] data; data = new int[o.size]; copy(...)` fails both 1 (on self-assignment the values are freed before being copied, so the object ends up with garbage) and 2 (a throwing `new` leaves `data` dangling, so the destructor double deletes later).

#### 5. Copy-and-swap
- Implement copy assignment in terms of the copy constructor and a non-throwing `swap`:
```cpp
friend void swap(Buffer& a, Buffer& b) noexcept {
    using std::swap;
    swap(a.data_, b.data_);
    swap(a.size_, b.size_);
}
Buffer& operator=(const Buffer& other) {
    Buffer tmp(other);   // may throw: *this untouched
    swap(*this, tmp);    // cannot throw
    return *this;        // tmp's destructor frees the OLD resource
}
```
- Properties:
  - **Strong exception guarantee** for free: the only throwing step happens before `*this` is modified.
  - **Self-assignment safe** without a branch (it makes a wasted copy, which is fine because self-assignment is rare).
  - Releases the old resource through the destructor: no duplicated cleanup code.
- **Unified assignment** variant: `Buffer& operator=(Buffer other) noexcept { swap(*this, other); return *this; }`
  - Takes the parameter **by value**: an lvalue argument is copied, an rvalue argument is moved into the parameter. One function serves as both copy and move assignment.
  - Do not also declare `operator=(Buffer&&)`: `b = std::move(a)` becomes ambiguous.
- Cost: copy-and-swap always allocates. A hand-written copy assignment can reuse existing capacity when sizes match (what `std::vector` does). For a type on a hot path, the strong guarantee may not be worth an allocation per assignment: that is a design choice, say it explicitly in interviews.

#### 6. Rule of 5: writing the move operations
- Move constructor: take the source's resource and leave the source **empty but valid** (destructible and assignable).
```cpp
Buffer(Buffer&& o) noexcept
    : data_(std::exchange(o.data_, nullptr)), size_(std::exchange(o.size_, 0)) {}
```
- `std::exchange(obj, new_value)` (C++14) returns the old value and stores the new one: "steal and reset" in one expression.
- Order matters: copy the pointer **then** null the source. `a.data = nullptr; b.data = a.data;` loses the pointer.
- Why null the source: the moved-from object's destructor still runs. Without the reset, both destructors `delete[]` the same array (double delete). `delete[] nullptr` is a no-op, so null is the natural empty state.
- Move assignment: the destination **already owns** something; release it, take the source's resource, empty the source:
```cpp
Buffer& operator=(Buffer&& o) noexcept {
    if (this != &o) {
        delete[] data_;
        data_ = std::exchange(o.data_, nullptr);
        size_ = std::exchange(o.size_, 0);
    }
    return *this;
}
```
- Move assignment normally does **no allocation**; only copy assignment needs the "allocate first" ordering.
- **Self-move** `a = std::move(a)`: without the check, `delete[] data_` frees the array and then reads it back from the same object: `a` ends up dangling or empty. The standard library only promises that self-move leaves the object in a valid state; your type should at least not corrupt itself. Alternative with no branch (move-and-swap, using the friend `swap` from section 5): `Buffer tmp(std::move(o)); swap(*this, tmp); return *this;`. On self-move `tmp` takes the array, `swap` hands it straight back, and `tmp` dies empty.
- Mark both moves `noexcept` when they cannot throw (pointer and integer copies cannot). Section 7 explains why it matters.

#### 7. noexcept moves and std::vector growth
- When `std::vector` reallocates, it must transfer existing elements to the new buffer. It promises the **strong guarantee** for `push_back`: if an exception happens, the vector is unchanged.
- If the element's move constructor might throw, an exception halfway through would leave some old elements already moved-from, and the original state could not be restored. So the vector uses `std::move_if_noexcept`:
  - Move constructor `noexcept` (or the type is not copyable): **move** the elements.
  - Move constructor may throw and a copy constructor exists: **copy** them.
- Consequence: a correct but non-`noexcept` move constructor makes every growth copy every element: the "copies during reallocation" latency spike seen in profiles.
- Second silent cause: a **user-declared destructor** (even `= default`) removes the implicit move constructor entirely, so growth copies through the copy constructor.
- Implicitly generated and `= default` moves are `noexcept` automatically when all members' moves are `noexcept`. Check with `static_assert(std::is_nothrow_move_constructible_v<T>);`.
- The mechanism (`move_if_noexcept`, value categories) is covered in topic 03; here the lesson is: **write `noexcept` on moves, and do not add a destructor you do not need**.

#### 8. Rule of 0 and move-only types
- Rule of 0: let members manage resources; the compiler-generated five are then correct automatically.
```cpp
class Buffer {
    std::vector<int> data_;      // copy = deep copy, move = O(1) transfer
public:
    explicit Buffer(std::size_t n) : data_(n) {}
};                               // no destructor, no copy/move code
```
- "Rule of 0 means everything is on the stack" is wrong: `vector` still allocates on the heap. Rule of 0 is about **who manages** the resource, not where it lives.
- Choose the member by the ownership semantics you want:

| Member | Resulting class semantics |
|---|---|
| `std::vector<T>`, `std::string` | Copyable (deep copy) and movable |
| `std::unique_ptr<T>` / `unique_ptr<T[]>` | Move-only (copy is deleted because the member's copy is deleted) |
| `std::shared_ptr<T>` | Copyable, but copies **share** the object (shallow by design) |
| `std::unique_ptr<FILE, Closer>` | Move-only wrapper for a C resource with custom cleanup |

- **Move-only handle types** (file descriptor, socket, mutex owner): the resource is unique, so copying has no meaning. Delete the copies, implement `noexcept` moves, use a sentinel (`-1`) for "owns nothing", and check the sentinel in the destructor.
- A file descriptor is an `int`, so the implicit copy compiles and copies the number. With a closing destructor, `std::vector<Connection>` reallocation then closes the same descriptor twice (the second `close` fails with `EBADF`, or worse, closes an unrelated descriptor that reused the number).
- **Rule of 5 defaults** for polymorphic bases: a base needs `virtual ~Base() = default;`, which suppresses implicit moves. Restore them explicitly:
```cpp
struct Base {
    virtual ~Base() = default;
    Base() = default;
    Base(const Base&) = default;              // often protected, to prevent slicing
    Base& operator=(const Base&) = default;
    Base(Base&&) = default;
    Base& operator=(Base&&) = default;
};
```

#### 9. = default, = delete, and members that block generation
- `= default` asks for the compiler's memberwise version. On the first declaration it is not "user-provided": a defaulted copy constructor keeps the type trivially copyable.
- A defaulted special member is **defined as deleted** when some member cannot do the operation:

| Member type | Effect on the containing class |
|---|---|
| `const T` member | Copy/move **assignment** deleted (copy/move constructors fine; default ctor deleted if a `const` scalar member has no initializer) |
| `T&` reference member | Copy/move **assignment** deleted; default ctor deleted (unless the member has a default member initializer) |
| `std::unique_ptr` member | Copy ctor and copy assign deleted |
| `std::mutex` member | All copy and move deleted (mutex is neither) |
| Member without default ctor | Default ctor deleted |

- Containers care: `std::vector<T>` with a `const` member still supports `push_back` (only construction is needed), but `erase`, `insert` in the middle and `std::sort` need assignment and fail to compile.
- If objects must be assignable, hold a pointer (`T*` or `std::reference_wrapper<T>`) instead of a reference member, and a private non-const member with a getter instead of a `const` member.
- `= delete` can delete any function, not only special members (for example `void f(double) = delete;` to block a conversion). A deleted function **participates** in overload resolution; picking it is an error.
- Special rule: a **defaulted** move constructor that is defined as deleted (because a member cannot be moved) is **ignored** by overload resolution, so rvalues fall back to the copy constructor. A move constructor you explicitly write as `= delete` is not ignored (see topic 04 for the `return` case).
- In C++20 any user-declared constructor (even `= default`) stops the class from being an aggregate, so designated initializers `T{.x = 1}` stop working.

#### 10. Misconceptions to unlearn
- ❌ "`T b = a;` calls the assignment operator." ✅ It is initialization: copy constructor.
- ❌ "If I write a destructor the compiler still gives me a move constructor." ✅ It does not; moves silently become copies.
- ❌ "If I write a move constructor I still get the default copy assignment." ✅ Both copy operations become deleted; `b = a` does not compile.
- ❌ "`~T() = default;` changes nothing." ✅ It is user-declared: implicit moves disappear.
- ❌ "Double delete always crashes." ✅ It is undefined behaviour; it may appear to work, corrupt the heap, or crash later.
- ❌ "Move assignment needs a temporary in case allocation throws." ✅ Move assignment does not allocate; that concern belongs to copy assignment.
- ❌ "The default move of a raw pointer member transfers ownership." ✅ Moving a pointer copies it and leaves the source unchanged; only your own move code can null the source. (And with a user destructor there is no implicit move at all.)
- ❌ "Rule of 0 means objects on the stack." ✅ It means resources are owned by RAII members.
- ❌ "Every class with a destructor needs all five written by hand." ✅ It needs all five *decided*: some will be `= delete` or `= default`.
- ❌ "`std::vector` requires `noexcept` moves." ✅ It works without, but copies instead of moving on growth when a copy exists.

### EDGE_CASES: Traps and Misconceptions

#### Edge Case 1: A move constructor deletes copy assignment
- Class with destructor, copy constructor and move constructor, but no assignment operators.
- People expect `b = a;` to use the implicit (shallow) copy assignment and leak.
- Reality: declaring the move constructor makes the implicit copy assignment **deleted**, and move assignment is not declared at all. Both `b = a;` and `b = std::move(a);` fail to compile:
```
error: use of deleted function 'constexpr Buffer& Buffer::operator=(const Buffer&)'
note: ... is implicitly declared as deleted because 'Buffer' declares a move
      constructor or move assignment operator
```
- Without the move constructor (destructor + copy constructor only), the deprecated implicit copy assignment *does* exist: `b = a;` compiles, leaks `b`'s array and double deletes later.
- So the Rule-of-5 violation is a compile error in one case and silent UB in the other. Know which.

#### Edge Case 2: A destructor quietly turns moves into copies
- `struct Order { std::string id; ~Order() { log(); } };` looks harmless.
- The user-declared destructor removes the implicit move constructor. `Order b = std::move(a);` compiles and calls the copy constructor: `a.id` keeps its contents, and the string is deep-copied.
- In `std::vector<Order>`, every reallocation copies every element.
- Fix: remove the destructor (logging belongs elsewhere) or add `Order(Order&&) noexcept = default;` and the other defaults.
- The same happens with `~Order() = default;`, which many people add "for clarity".

#### Edge Case 3: Self-assignment in a naive copy assignment
- `Buffer& operator=(const Buffer& o) { delete[] data_; data_ = new int[o.size_]; std::copy(o.data_, o.data_ + o.size_, data_); ... }`
- For `a = a`, `o` and `*this` are the same object: the values are freed, `data_ = new int[...]` also changes `o.data_`, and the copy then copies the new uninitialized array onto itself. The data is silently lost (ASan does not catch it; a variant that saved `o.data_` first would be a use after free).
- Self-assignment happens indirectly: `v[i] = v[j]` with `i == j`, `*p = *q` with aliasing pointers, `std::swap` implementations, sorting algorithms.
- Fixes: `if (this == &o) return *this;`, or allocate-and-copy before deleting (which is also self-safe), or copy-and-swap.

#### Edge Case 4: Forgetting to null the source in the move constructor
- `Buffer(Buffer&& o) noexcept : data_(o.data_), size_(o.size_) {}` compiles and "works" in a quick test.
- The moved-from object still holds the pointer; its destructor frees the array that the new object owns. The new object then uses freed memory and frees it again.
- The bug often shows up only when the moved-from object is a temporary destroyed right away, for example inside `vector` reallocation.
- Rule: a move must leave the source in a state its destructor handles correctly (`nullptr`, `-1`, empty).

#### Edge Case 5: Defaulted-but-deleted move falls back to copy
- `struct Holder { Legacy l; Holder() = default; Holder(const Holder&) = default; Holder(Holder&&) = default; };` where `Legacy` declares `Legacy(Legacy&&) = delete;` and a copy constructor.
- `Holder`'s defaulted move is **defined as deleted** (it would need `Legacy`'s deleted move). A defaulted move constructor that is deleted is ignored by overload resolution, so `Holder b = std::move(a);` compiles and **copies**.
- Contrast: `Legacy b = std::move(la);` does not compile: an explicitly deleted move participates in overload resolution and wins against the copy.
- Lesson: `= default` is a request, not a guarantee. `std::is_move_constructible_v<Holder>` is still `true` (the copy accepts rvalues), but `std::is_nothrow_move_constructible_v<Holder>` is `false` here because `Legacy`'s copy is not `noexcept`: a `static_assert` on the nothrow trait catches it.

#### Edge Case 6: By-value assignment plus a move assignment is ambiguous
- Copy-and-swap with `Buffer& operator=(Buffer other);` handles both lvalues and rvalues.
- Adding `Buffer& operator=(Buffer&& other);` "for speed" makes `b = std::move(a);` ambiguous: both candidates bind an rvalue with the same rank.
```
error: ambiguous overload for 'operator=' (operand types are 'Buffer' and 'std::remove_reference<Buffer&>::type' {aka 'Buffer'})
```
- Pick one design: by-value unified assignment, or the separate `const&` and `&&` pair.

#### Edge Case 7: const and reference members make the class non-assignable
- `struct Trade { const int id; double px; };` can be constructed, copied and moved (construction initializes the `const` member), but `t1 = t2;` does not compile: the implicit copy assignment is deleted.
- `std::vector<Trade>` still allows `push_back` and `emplace_back`, but `std::sort`, `erase` and `insert` in the middle fail to compile because they assign elements.
- Same for `T&` members. Use a private non-const member with a getter, or `std::reference_wrapper<T>` / `T*` instead of `T&`.

#### Edge Case 8: The deprecated implicit copy hides Rule-of-3 bugs
- `-Wall -Wextra` does not warn about a class with a user destructor and an implicit copy. GCC needs `-Wdeprecated-copy-dtor` ("implicitly-declared 'B::B(const B&)' is deprecated"); Clang needs `-Wdeprecated` ("definition of implicit copy constructor for 'B' is deprecated because it has a user-provided destructor").
- Compilers have kept generating these functions for over a decade for compatibility; you cannot rely on the language to stop you.
- Defensive habit: in every class with a destructor, write all five explicitly (`= default`, `= delete` or a body). Linters: clang-tidy `cppcoreguidelines-special-member-functions`.

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Which special member runs? A tracing class
- Each special member prints its name; the comments map statements to members.
```cpp
#include <iostream>
#include <utility>

struct Tracer {
    static inline int next = 1;
    int id = next++;                         // every object gets its own number
    Tracer() { std::cout << "ctor #" << id << '\n'; }
    Tracer(const Tracer& o) { std::cout << "copy ctor #" << id << " from #" << o.id << '\n'; }
    Tracer(Tracer&& o) noexcept { std::cout << "move ctor #" << id << " from #" << o.id << '\n'; }
    Tracer& operator=(const Tracer& o) {
        std::cout << "copy assign #" << id << " = #" << o.id << '\n';
        return *this;
    }
    Tracer& operator=(Tracer&& o) noexcept {
        std::cout << "move assign #" << id << " = #" << o.id << '\n';
        return *this;
    }
    ~Tracer() { std::cout << "dtor #" << id << '\n'; }
};

int main() {
    Tracer a;                     // #1
    Tracer b = a;                 // #2 initialization: copy ctor (not assignment)
    Tracer c(std::move(a));       // #3 move ctor
    b = c;                        // b exists: copy assign
    b = std::move(c);             // move assign
    Tracer d = Tracer();          // #4 C++17: prvalue initializes d directly
    std::cout << "end of main\n";
}
```
- Output (g++ 11, -std=c++20):
```
ctor #1
copy ctor #2 from #1
move ctor #3 from #1
copy assign #2 = #3
move assign #2 = #3
ctor #4
end of main
dtor #4
dtor #3
dtor #2
dtor #1
```
- `Tracer d = Tracer();` prints a single `ctor`: no temporary, no move (topic 04).
- Destruction is the reverse order of construction.

#### Example 2: Rule of 3 Buffer with a strongly exception-safe copy assignment
- Deep copy in the copy constructor; copy assignment allocates first, then releases.
```cpp
#include <algorithm>
#include <cstddef>
#include <iostream>

class Buffer {
    int* data_;
    std::size_t size_;
public:
    explicit Buffer(std::size_t n) : data_(new int[n]{}), size_(n) {}
    ~Buffer() { delete[] data_; }

    Buffer(const Buffer& o) : data_(new int[o.size_]), size_(o.size_) {
        std::copy(o.data_, o.data_ + o.size_, data_);          // deep copy
    }

    Buffer& operator=(const Buffer& o) {
        if (this == &o) return *this;                           // cheap self check
        int* fresh = new int[o.size_];                          // may throw: *this untouched
        std::copy(o.data_, o.data_ + o.size_, fresh);
        delete[] data_;                                         // release old only now
        data_ = fresh;
        size_ = o.size_;
        return *this;
    }

    int& operator[](std::size_t i) { return data_[i]; }
    std::size_t size() const { return size_; }
    const int* raw() const { return data_; }
};

int main() {
    Buffer a(3);
    a[0] = 7;
    Buffer b = a;                       // copy ctor: separate array
    b[0] = 99;
    std::cout << a[0] << ' ' << b[0] << ' ' << (a.raw() != b.raw()) << '\n';

    Buffer c(10);
    c = a;                              // copy assign: c's 10-int array freed, no leak
    std::cout << c.size() << ' ' << c[0] << '\n';

    c = c;                              // self-assignment is safe
    std::cout << c[0] << '\n';
}
```
- Output: `7 99 1`, then `3 7`, then `7`. Clean under `-fsanitize=address`.
- This class has no move operations (the copy constructor suppresses them): `std::move(a)` would copy. That is the Rule of 3, correct but not optimal.

#### Example 3: Copy-and-swap with a unified by-value assignment
- One `operator=` taking the parameter by value covers copy and move assignment; `swap` is `noexcept`.
```cpp
#include <algorithm>
#include <cstddef>
#include <iostream>
#include <utility>

class Buffer {
    int* data_ = nullptr;
    std::size_t size_ = 0;
public:
    explicit Buffer(std::size_t n) : data_(new int[n]{}), size_(n) {}
    ~Buffer() { delete[] data_; }
    Buffer(const Buffer& o) : data_(new int[o.size_]), size_(o.size_) {
        std::copy(o.data_, o.data_ + o.size_, data_);
        std::cout << "  copy ctor\n";
    }
    Buffer(Buffer&& o) noexcept
        : data_(std::exchange(o.data_, nullptr)), size_(std::exchange(o.size_, 0)) {
        std::cout << "  move ctor\n";
    }
    friend void swap(Buffer& a, Buffer& b) noexcept {
        using std::swap;
        swap(a.data_, b.data_);
        swap(a.size_, b.size_);
    }
    Buffer& operator=(Buffer other) noexcept {   // by value: copy OR move happens here
        swap(*this, other);
        return *this;                            // other's dtor frees our old array
    }
    std::size_t size() const { return size_; }
};

int main() {
    Buffer a(3), b(5);
    std::cout << "b = a\n";
    b = a;
    std::cout << "b = std::move(a)\n";
    b = std::move(a);
    std::cout << "sizes " << a.size() << ' ' << b.size() << '\n';
}
```
- Output:
```
b = a
  copy ctor
b = std::move(a)
  move ctor
sizes 0 3
```
- The copy or move happens when the parameter is initialized, before the body runs, so if copying throws, `b` is unchanged (strong guarantee).
- Trade-off: copy assignment always allocates even when `b` already had enough room.

#### Example 4: Rule of 5 and what noexcept buys inside std::vector
- Two otherwise identical types: one move constructor is `noexcept`, the other is not. Count copies during growth.
```cpp
#include <iostream>
#include <utility>
#include <vector>

template <bool NoExcept>
struct Elem {
    static inline int copies = 0, moves = 0;
    int* p;
    Elem() : p(new int(0)) {}
    ~Elem() { delete p; }
    Elem(const Elem& o) : p(new int(*o.p)) { ++copies; }
    Elem(Elem&& o) noexcept(NoExcept) : p(std::exchange(o.p, nullptr)) { ++moves; }
    Elem& operator=(const Elem& o) { *p = *o.p; return *this; }
    Elem& operator=(Elem&& o) noexcept {
        if (this != &o) { delete p; p = std::exchange(o.p, nullptr); }
        return *this;
    }
};

template <bool NoExcept>
void grow(const char* label) {
    std::vector<Elem<NoExcept>> v;
    for (int i = 0; i < 1000; ++i) v.emplace_back();
    std::cout << label << ": copies=" << Elem<NoExcept>::copies
              << " moves=" << Elem<NoExcept>::moves << '\n';
}

int main() {
    grow<true>("noexcept move ");
    grow<false>("throwing move ");
}
```
- Output (libstdc++, capacity doubling 1, 2, 4, ..., 1024):
```
noexcept move : copies=0 moves=1023
throwing move : copies=1023 moves=0
```
- 1023 relocations = 1 + 2 + 4 + ... + 512. Without `noexcept` every one of them is a heap allocation plus a copy.

#### Example 5: A move-only file descriptor owner
- Unique ownership of an OS handle: copies deleted, `noexcept` moves, `-1` sentinel.
```cpp
#include <cerrno>
#include <cstring>
#include <iostream>
#include <unistd.h>
#include <utility>
#include <vector>

class Fd {
    int fd_ = -1;
public:
    Fd() = default;
    explicit Fd(int fd) : fd_(fd) {}
    ~Fd() { reset(); }
    Fd(const Fd&) = delete;
    Fd& operator=(const Fd&) = delete;
    Fd(Fd&& o) noexcept : fd_(std::exchange(o.fd_, -1)) {}
    Fd& operator=(Fd&& o) noexcept {
        if (this != &o) { reset(); fd_ = std::exchange(o.fd_, -1); }
        return *this;
    }
    void reset() {
        if (fd_ != -1 && ::close(fd_) != 0)
            std::cout << "close(" << fd_ << ") failed: " << std::strerror(errno) << '\n';
        fd_ = -1;
    }
    int get() const { return fd_; }
};

int main() {
    std::vector<Fd> fds;
    for (int i = 0; i < 3; ++i) {
        int p[2];
        if (::pipe(p) != 0) return 1;
        fds.emplace_back(p[0]);             // vector grows: Fds are moved, never copied
        fds.emplace_back(p[1]);
    }
    Fd moved = std::move(fds[0]);
    std::cout << "moved owns fd " << moved.get() << ", source now " << fds[0].get() << '\n';
    std::cout << "open fds: " << fds.size() << '\n';
}   // every descriptor closed exactly once: no "close failed" lines
```
- Output (descriptor numbers are typical: 0, 1, 2 are taken by stdin/stdout/stderr):
```
moved owns fd 3, source now -1
open fds: 6
```
- Remove the four copy/move lines and keep the destructor: the class compiles, `vector` growth copies the `int`, and the destructor prints `close(3) failed: Bad file descriptor` for the second close.

#### Example 6: Rule of 0 and checking the generated members with traits
- Members decide the class's semantics; `static_assert` documents and locks them.
```cpp
#include <iostream>
#include <memory>
#include <mutex>
#include <string>
#include <type_traits>
#include <vector>

struct Copyable { std::vector<int> v; std::string name; };    // Rule of 0
struct MoveOnly { std::unique_ptr<int[]> data; std::size_t n = 0; };
struct WithConst { const int id = 0; double px = 0; };
struct WithMutex { std::mutex m; int value = 0; };
struct WithDtor { std::vector<int> v; ~WithDtor() = default; }; // user-declared!

static_assert(std::is_copy_constructible_v<Copyable>);
static_assert(std::is_nothrow_move_constructible_v<Copyable>);
static_assert(!std::is_copy_constructible_v<MoveOnly>);
static_assert(std::is_nothrow_move_assignable_v<MoveOnly>);
static_assert(std::is_copy_constructible_v<WithConst>);
static_assert(!std::is_copy_assignable_v<WithConst>);
static_assert(!std::is_move_constructible_v<WithMutex>);

int main() {
    WithDtor a{{1, 2, 3}};
    WithDtor b = std::move(a);           // no implicit move: this COPIES
    std::cout << "a.v.size() after 'move': " << a.v.size() << '\n';

    Copyable c{{1, 2, 3}, "x"};
    Copyable d = std::move(c);           // real move
    std::cout << "c.v.size() after move: " << c.v.size() << '\n';
}
```
- Output:
```
a.v.size() after 'move': 3
c.v.size() after move: 0
```
- `WithDtor` is still "move constructible" by the trait (the copy constructor accepts rvalues), which is exactly why the trait cannot catch this bug. Check `a.v` after a move in a test, or do not declare the destructor.
- `c.v.size()` being 0 is what libstdc++ does; for `vector`'s move constructor it is effectively guaranteed (topic 03 covers moved-from states).

#### Example 7: Polymorphic base with the five defaults
- `virtual ~Base() = default;` would suppress moves; restoring them keeps derived classes cheap to move.
```cpp
#include <iostream>
#include <memory>
#include <string>
#include <type_traits>
#include <utility>

class Instrument {
public:
    virtual ~Instrument() = default;
    virtual std::string describe() const = 0;
protected:                                     // protected copy/move: no slicing via Base
    Instrument() = default;
    Instrument(const Instrument&) = default;
    Instrument& operator=(const Instrument&) = default;
    Instrument(Instrument&&) noexcept = default;
    Instrument& operator=(Instrument&&) noexcept = default;
};

class Bond final : public Instrument {
    std::string isin_;
public:
    explicit Bond(std::string isin) : isin_(std::move(isin)) {}
    std::string describe() const override { return "Bond " + isin_; }
};

static_assert(std::is_nothrow_move_constructible_v<Bond>);

int main() {
    Bond b1("XS0000000001");
    Bond b2 = std::move(b1);                   // Bond's implicit move uses Base's move
    std::unique_ptr<Instrument> p = std::make_unique<Bond>("XS0000000002");
    std::cout << b2.describe() << " | " << p->describe() << '\n';
    // Instrument copy = *p;                   // error: copy ctor is protected
}
```
- Output: `Bond XS0000000001 | Bond XS0000000002`
- With only `virtual ~Instrument() = default;` the program still compiles, but `Bond`'s move would copy the base part (empty here, expensive if the base had data members).

### QUICK_REFERENCE: Cheat Sheet

#### Which function runs?
| Expression | Destination exists? | Source | Function |
|---|---|---|---|
| `T b(a);` / `T b = a;` | No | lvalue | Copy constructor |
| `T b(std::move(a));` | No | xvalue | Move constructor (copy ctor if no move ctor declared) |
| `T b = T(args);` | No | prvalue | Just the `T(args)` constructor (C++17 elision) |
| `b = a;` | Yes | lvalue | Copy assignment |
| `b = std::move(a);` | Yes | xvalue | Move assignment (copy assign if no move assign declared) |
| `f(a)` with `f(T)` | No (parameter) | lvalue | Copy constructor |

#### Generation rules in one line each
| If you declare... | Then... |
|---|---|
| Destructor | Moves not declared; copies still generated (deprecated) |
| Copy ctor or copy assign | Moves not declared; the other copy still generated (deprecated) |
| Move ctor or move assign | Both copies deleted; the other move not declared |
| Any constructor | No implicit default constructor |
| `~T() = default;` | Same as declaring a destructor: no implicit moves |

#### Implementation checklist
| Function | Must do |
|---|---|
| Copy ctor | Allocate and deep copy |
| Copy assign | Self-safe, allocate/copy first, then release old, return `*this` |
| Move ctor | Steal with `std::exchange`, leave source empty, `noexcept` |
| Move assign | Self-check, release old, steal, empty source, `noexcept` |
| Destructor | Release; never throw; handle the empty state |
| `swap` | Member-wise swap, `noexcept` |

#### Interview one-liners
| Question | Answer |
|---|---|
| Rule of 3? | Destructor, copy ctor, copy assign: need one, need all three |
| Rule of 5? | Rule of 3 plus move ctor and move assign, because the three suppress implicit moves |
| Rule of 0? | Own resources through RAII members and write none of them |
| `Buffer b = a;` with raw pointer, no copy ctor? | Shallow copy, then double delete (UB) |
| `b = a;` with no copy assign? | Old array leaked plus double delete later |
| Dtor + copy ctor + move ctor, then `b = a`? | Compile error: copy assignment deleted |
| Why null the source in a move? | The source's destructor still runs |
| Why `noexcept` on moves? | `vector` growth moves only if the move cannot throw (else copies) |
| Copy-and-swap gives? | Strong guarantee, self-assignment safety, single cleanup path |
| `const` member effect? | Assignment deleted; construction fine |
| fd owner class? | Move-only: delete copies, `noexcept` move with `-1` sentinel |
| Polymorphic base? | Virtual dtor plus the five `= default` (copy often protected) |
