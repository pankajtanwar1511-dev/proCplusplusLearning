## TOPIC: Special Member Functions and the Rule of 0/3/5

### INTERVIEW_QA: Interview Questions with Detailed Answers

#### Q1: Which special member function runs for `Buffer b = a;`, `Buffer b(a);`, `b = a;` and `b = std::move(a);`?
**Difficulty:** #beginner
**Category:** #special_members #object_semantics
**Concepts:** #copy_constructor #copy_assignment #move_assignment #initialization

**Answer:**
`Buffer b = a;` and `Buffer b(a);` both call the copy constructor (a new object is being initialized). `b = a;` calls copy assignment and `b = std::move(a);` calls move assignment, because `b` already exists.

**Explanation:**
- Constructor vs assignment: does the destination object already exist? The `=` sign in a declaration is initialization syntax, not the assignment operator.
- Copy vs move: is the source an lvalue (`a`) or an rvalue (`std::move(a)`, a temporary)?
- The six special members: default constructor, destructor, copy constructor, copy assignment, move constructor, move assignment.
- `Buffer b = Buffer(100);` calls only the `Buffer(std::size_t)` constructor in C++17: the prvalue initializes `b` directly (topic 04).
- ❌ Common wrong answer: "`Buffer b = a;` calls the assignment operator because there is an `=`."
- ✅ What a strong answer adds: the full matrix (exists? × lvalue/rvalue), and the fallback: if no move constructor is declared, `Buffer b(std::move(a));` calls the copy constructor.

**Key takeaway:** Existence of the destination picks constructor vs assignment; value category of the source picks copy vs move.

---

#### Q2: A class owns `int* data` allocated with `new int[n]` and frees it in its destructor. What happens with `Buffer a(100); Buffer b = a;`?
**Difficulty:** #beginner
**Category:** #special_members #memory_management
**Concepts:** #shallow_copy #double_delete #undefined_behavior #rule_of_three

**Answer:**
The implicit copy constructor copies the members: `b.data == a.data`. Both objects believe they own the same array. When they go out of scope, `~b` deletes it and `~a` deletes it again: double delete, which is undefined behaviour.

**Explanation:**
```cpp
class Buffer {
    int* data;
    std::size_t size;
public:
    explicit Buffer(std::size_t n) : data(new int[n]), size(n) {}
    ~Buffer() { delete[] data; }       // the only special member written
};
```
- Memberwise copy of a pointer is a shallow copy: it copies the address, not the array.
- Before destruction there is already an aliasing bug: writes through `b` show up in `a`.
- With `-fsanitize=address` the program aborts with `attempting double-free`. Without it, it may run "fine", corrupt the heap, or crash later.
- ❌ Common wrong answer: "It will crash with a segmentation fault." It may; the correct answer is undefined behaviour.
- ❌ Common wrong answer: "It does a bitwise copy." It is a memberwise copy (each member's own copy constructor); for a raw pointer the effect is the same, but for a `std::string` member it would not be.
- ✅ What a strong answer adds: the compiler still generates this copy constructor even though a destructor is declared; it is only *deprecated*, and `-Wall -Wextra` does not warn (GCC needs `-Wdeprecated-copy-dtor`).

**Key takeaway:** A user-written destructor that frees a resource means the implicit copy is wrong: that is the Rule of 3.

---

#### Q3: Same class, but now `Buffer a(100); Buffer b(200); b = a;`. What goes wrong?
**Difficulty:** #beginner
**Category:** #special_members #memory_management
**Concepts:** #copy_assignment #memory_leak #double_delete

**Answer:**
The implicit copy assignment overwrites `b.data` with `a.data`. `b`'s original 200-int array has no owner any more (leak), and at the end both destructors delete `a`'s array (double delete, UB).

**Explanation:**
- Two bugs from one line: a leak and a double free.
- A correct copy assignment must: handle self-assignment, create the new copy, release the old resource, update all members, return `*this`.
- Allocate and copy **before** releasing the old array so that a throwing `new` leaves `b` unchanged.
- ❌ Common wrong answer: "Assignment is like copy construction." Assignment has an old resource to release; construction does not.
- ✅ What a strong answer adds: "This is why copy assignment is the hardest of the five to write, and why copy-and-swap exists."

**Key takeaway:** Copy assignment = release old + acquire copy; the implicit one does neither for a raw pointer.

---

#### Q4: What are the Rule of 3, the Rule of 5 and the Rule of 0? Why did 3 become 5?
**Difficulty:** #beginner
**Category:** #special_members #class_design
**Concepts:** #rule_of_three #rule_of_five #rule_of_zero #raii

**Answer:**
Rule of 3: if a class needs a user-written destructor, copy constructor or copy assignment, it needs all three. Rule of 5 adds move constructor and move assignment, because since C++11 declaring any of the three suppresses the implicit moves. Rule of 0: do not manage resources directly; hold RAII members and write none of them.

**Explanation:**
- Needing a custom destructor is the signal that the class owns a resource that memberwise copying does not duplicate correctly.
- C++11 made the rule bigger because of generation rules: a user destructor or copy operation means **no implicit move**, so `std::move` silently copies. To get efficient moves you must write or default them.
- Rule of 0 example: `class Buffer { std::vector<int> data_; };`: vector's copy is deep, its move is O(1), its destructor frees. Your class inherits all of it.
- "Rule of 5" does not mean "write five bodies". It means "decide all five": some may be `= default`, some `= delete` (a file handle is move-only).
- ❌ Common wrong answer: "Rule of 0 means everything is on the stack." `vector` allocates on the heap; Rule of 0 is about who manages the resource.
- ❌ Common wrong answer: "Every destructor requires five hand-written functions." A destructor that only logs needs none; a polymorphic base needs a virtual destructor plus defaulted moves.
- ✅ What a strong answer adds: modern guideline order: prefer Rule of 0; if you must own a raw resource, isolate it in one small RAII class that follows the Rule of 5, and let every other class follow Rule of 0.

**Key takeaway:** One resource-owning RAII class with the Rule of 5; everything else Rule of 0.

---

#### Q5: A class has a destructor, a copy constructor and a move constructor, but no assignment operators. What happens for `b = a;` and `b = std::move(a);`?
**Difficulty:** #intermediate
**Category:** #special_members #compiler_rules
**Concepts:** #implicitly_deleted #move_constructor #copy_assignment

**Answer:**
Neither compiles. Declaring a move constructor makes the implicit copy assignment **deleted**, and no move assignment is declared, so both assignments select the deleted copy assignment.

**Explanation:**
```cpp
#include <algorithm>
#include <cstddef>
#include <utility>

class Buffer {
public:
    explicit Buffer(std::size_t n) : data_(new int[n]), size_(n) {}
    ~Buffer() { delete[] data_; }
    Buffer(const Buffer& o) : data_(new int[o.size_]), size_(o.size_) {
        std::copy(o.data_, o.data_ + size_, data_);
    }
    Buffer(Buffer&& o) noexcept : data_(o.data_), size_(o.size_) {
        o.data_ = nullptr;
        o.size_ = 0;
    }
private:
    int* data_;
    std::size_t size_;
};

int main() {
    Buffer a(100), b(200);
    b = a;              // error: use of deleted function 'constexpr Buffer& Buffer::operator=(const Buffer&)'
    b = std::move(a);   // same error: no move assignment declared, copy assign is deleted
}
```
- GCC's note: "implicitly declared as deleted because 'Buffer' declares a move constructor or move assignment operator".
- `b = std::move(a)` would fall back to copy assignment (a `const Buffer&` binds to rvalues), but that function is deleted, so the call is ill-formed.
- Remove the move constructor and the picture changes: the deprecated implicit copy assignment exists, `b = a;` compiles, leaks `b`'s array, and double deletes later (ASan: `attempting double-free`).
- ❌ Common wrong answer: "The default copy assignment does a shallow copy and leaks." True for a class without move operations, not this one.
- ✅ What a strong answer adds: the distinction between **deleted** (exists, selected, error) and **not declared** (absent, overload resolution picks another function).

**Key takeaway:** Declaring a move operation deletes both implicit copies; declaring a copy operation or destructor only removes the implicit moves.

---

#### Q6: What exactly does the compiler generate if you declare only a destructor? Why does that matter for `std::vector`?
**Difficulty:** #intermediate
**Category:** #special_members #performance
**Concepts:** #implicit_move #deprecated_copy #vector_reallocation

**Answer:**
Default constructor, copy constructor and copy assignment are still generated (the copies are deprecated); move constructor and move assignment are not declared. So every move, including `std::vector` growth, silently becomes a copy.

**Explanation:**
```cpp
#include <iostream>
#include <vector>

struct Order {
    Order() = default;
    Order(const Order&) { std::cout << "copy "; }
    Order(Order&&) noexcept { std::cout << "move "; }
};

struct LoggedOrder {
    Order o;
    ~LoggedOrder() {}               // only a destructor: implicit move is gone
};

int main() {
    std::vector<LoggedOrder> v(2);
    v.reserve(3);                   // reallocation: copy copy
    std::cout << '\n';

    std::vector<Order> w(2);
    w.reserve(3);                   // reallocation: move move
    std::cout << '\n';
}
```
- Output:
```
copy copy 
move move 
```
- `LoggedOrder` has no move constructor, so the vector relocates elements through the copy constructor, which copies the `Order` member.
- `~LoggedOrder() = default;` gives the same result: it is still user-declared.
- ❌ Common wrong answer: "The compiler generates a default move constructor that does a shallow copy." No move constructor is generated at all.
- ✅ What a strong answer adds: the bug is invisible to `std::is_move_constructible` (true, via the copy constructor); only profiling, a trace, or `static_assert(std::is_nothrow_move_constructible_v<T>)` with a throwing copy reveals it.

**Key takeaway:** Do not declare a destructor you do not need; if you need one, default the moves explicitly.

---

#### Q7: How do you write a correct copy assignment operator for a raw-pointer buffer?
**Difficulty:** #intermediate
**Category:** #special_members #exception_safety
**Concepts:** #self_assignment #strong_guarantee #resource_release

**Answer:**
Make the new copy first into a local pointer, then delete the old array, then commit the new pointer and size, and return `*this`. A self-assignment check is optional with this ordering but saves work.

**Explanation:**
```cpp
Buffer& operator=(const Buffer& other) {
    if (this == &other) return *this;               // optional, avoids a useless copy
    int* fresh = new int[other.size_];              // may throw: *this unchanged
    std::copy(other.data_, other.data_ + other.size_, fresh);
    delete[] data_;                                  // release old resource
    data_ = fresh;
    size_ = other.size_;
    return *this;
}
```
- The common broken version deletes first: `delete[] data_; data_ = new int[n]; copy(...)`.
  - Self-assignment: the old values are freed, and since `other.data_` is now the new uninitialized array, it copies garbage onto itself (data lost).
  - If `new` throws, `data_` dangles and the destructor deletes it again later.
- Self-assignment occurs through aliasing (`v[i] = v[j]`, `*p = *q`), not only `a = a`.
- ❌ Common wrong answer: "Delete old memory, allocate new memory, copy." Wrong order for exception safety and self-assignment.
- ✅ What a strong answer adds: name the guarantee (strong) and note that move assignment does not need this ordering because it does not allocate.

**Key takeaway:** Build the new state before destroying the old one.

---

#### Q8: Explain the copy-and-swap idiom. What happens if the copy throws, and why is the old resource freed?
**Difficulty:** #intermediate
**Category:** #special_members #exception_safety
**Concepts:** #copy_and_swap #strong_guarantee #noexcept_swap

**Answer:**
Copy assignment copies the source into a temporary using the copy constructor, swaps `*this` with the temporary using a non-throwing swap, and lets the temporary's destructor free the old resource. If the copy throws, the swap never runs and `*this` is unchanged (strong guarantee).

**Explanation:**
```cpp
friend void swap(Buffer& a, Buffer& b) noexcept {
    using std::swap;
    swap(a.data_, b.data_);
    swap(a.size_, b.size_);
}
Buffer& operator=(const Buffer& other) {
    Buffer tmp(other);      // all throwing work here
    swap(*this, tmp);       // noexcept
    return *this;           // ~tmp frees our OLD array
}
```
- Sequence on failure: `Buffer tmp(other)` throws → `swap` never executes → `*this` is not modified → the exception propagates to the caller.
- The temporary must be a copy of the **source**, not a fresh unrelated object: the swap makes `*this` take its contents.
- Self-assignment works without a check (one wasted copy).
- By-value variant `Buffer& operator=(Buffer other) noexcept` serves both copy and move assignment; do not also declare `operator=(Buffer&&)` or `b = std::move(a)` becomes ambiguous.
- Cost: always allocates, even when the existing buffer could be reused (`std::vector` reuses capacity and offers only the basic guarantee for assignment).
- ❌ Common wrong answer: "If the copy throws, `*this` is not called." The assignment operator *was* called; `*this` is just not modified.
- ✅ What a strong answer adds: the trade-off: strong guarantee and simplicity vs an allocation per assignment on hot paths.

**Key takeaway:** Copy-and-swap: copy (may throw), swap (cannot throw), destroy the old state via the temporary.

---

#### Q9: Write the move constructor for the raw-pointer `Buffer`. Does it allocate? Why must it modify the source?
**Difficulty:** #beginner
**Category:** #special_members #move_semantics
**Concepts:** #move_constructor #ownership_transfer #std_exchange

**Answer:**
It copies the pointer and size from the source and then sets the source to `nullptr` and `0`. No allocation and no element copy happen. The source must be reset because its destructor still runs; otherwise both destructors delete the same array.

**Explanation:**
```cpp
Buffer(Buffer&& other) noexcept
    : data_(std::exchange(other.data_, nullptr)),
      size_(std::exchange(other.size_, 0)) {}
```
- Order matters: `other.data_ = nullptr; data_ = other.data_;` loses the pointer. `std::exchange` (C++14) reads the old value and stores the new one in one step.
- After the move, `other` is empty but valid: destructible (`delete[] nullptr` is a no-op) and assignable.
- `size_` must be reset too, or `other.size()` lies about an array it no longer has.
- Mark it `noexcept`: copying a pointer and an integer cannot throw, and `std::vector` relies on the annotation.
- ❌ Common wrong answer: "`a.data = nullptr; b.data = a.data;`" Wrong order.
- ❌ Common wrong answer: "The array is moved to the new object." The array stays where it is; only ownership changes.
- ✅ What a strong answer adds: the moved-from state is a design decision documented by the class ("empty, `size() == 0`"); the standard library's own types only promise "valid but unspecified" (topic 03).

**Key takeaway:** Move = steal the handle, then leave the source owning nothing.

---

#### Q10: What is different between `Buffer b = std::move(a);` and `b = std::move(a);` when `b` already holds 200 ints?
**Difficulty:** #intermediate
**Category:** #special_members #move_semantics
**Concepts:** #move_assignment #move_constructor #memory_leak

**Answer:**
The first is the move constructor: `b` is new, so it just takes `a`'s array. The second is move assignment: `b` already owns an array that must be released first, then it takes `a`'s array and empties `a`. Skipping the release leaks `b`'s old 200 ints.

**Explanation:**
```cpp
Buffer& operator=(Buffer&& other) noexcept {
    if (this != &other) {
        delete[] data_;                              // 1. release what b owns
        data_ = std::exchange(other.data_, nullptr); // 2. take a's array
        size_ = std::exchange(other.size_, 0);       // 3. a is now empty
    }
    return *this;
}
```
- No new allocation is needed in move assignment; that concern (allocate first, it might throw) belongs to copy assignment.
- An alternative: `Buffer(std::move(other)).swap(*this);` (move-and-swap), where the temporary's destructor releases the old array.
- ❌ Common wrong answer: "Move assignment deletes the old memory and allocates new memory with a temporary." It does not allocate.
- ✅ What a strong answer adds: some designs swap instead of releasing (the source receives the old array). This defers the release to the source's destructor; valid, but surprising if the source is long-lived.

**Key takeaway:** Move construction takes; move assignment releases, then takes.

---

#### Q11: Why should a move assignment operator think about self-move (`a = std::move(a)`)?
**Difficulty:** #intermediate
**Category:** #special_members #robustness
**Concepts:** #self_move #aliasing #valid_state

**Answer:**
Without a check, `delete[] data_` frees the array, then `data_ = other.data_` copies back the same now-dangling pointer, and `other.data_ = nullptr` empties the object. The value is destroyed. A `this != &other` check (or move-and-swap) makes self-move a harmless no-op.

**Explanation:**
- Self-move does not appear literally; it appears through aliases: `v[i] = std::move(v[j])` with `i == j`, or generic algorithms.
- The standard library's requirement is weak: after self-move assignment, a library object must be in a valid but unspecified state. Your own type should at least not leak, crash or double free.
- The order of the three statements decides the outcome: release first then steal (dangling then empty) vs steal then release (frees the array you just took).
- ❌ Common wrong answer: "Self-move causes a memory leak." With release-then-steal it frees the array and ends empty; the danger is losing data or use after free, not a leak.
- ✅ What a strong answer adds: the check costs one comparison; move-and-swap avoids it entirely.

**Key takeaway:** Every assignment operator must survive `x = x`, copy or move.

---

#### Q12: Why should move operations be `noexcept`? What happens in `std::vector` if they are not?
**Difficulty:** #intermediate
**Category:** #special_members #performance
**Concepts:** #noexcept #vector_reallocation #strong_guarantee #move_if_noexcept

**Answer:**
`std::vector::push_back` gives the strong guarantee. During reallocation it can only move elements if moving cannot throw; otherwise a failure midway would leave old elements moved-from. So if the move constructor is not `noexcept` and a copy constructor exists, the vector copies every element on growth.

**Explanation:**
- Measured with 1000 `emplace_back` calls (libstdc++): `noexcept` move gave 0 copies and 1023 moves; the identical non-`noexcept` move gave 1023 copies and 0 moves.
- The selection is done with `std::move_if_noexcept` (topic 03).
- If the type is move-only (copy deleted), the vector moves anyway and the guarantee weakens to basic for that operation.
- Implicit and `= default` moves are `noexcept` automatically when all members' moves are.
- Destructors are implicitly `noexcept`; a throwing destructor would break every container.
- ❌ Common wrong answer: "`vector` requires `noexcept` move." It compiles and works without; it just copies.
- ❌ Common wrong answer: "`noexcept` makes the move faster." The move itself is the same code; `noexcept` changes which operation the container chooses.
- ✅ What a strong answer adds: `static_assert(std::is_nothrow_move_constructible_v<T>);` next to the class to lock it in.

**Key takeaway:** `noexcept` on the move constructor is the difference between O(1) and deep-copy relocation in containers.

---

#### Q13: Replace the raw pointer with `std::vector<int>` and write no special members. What happens on copy and move, and why is this better?
**Difficulty:** #beginner
**Category:** #class_design #raii
**Concepts:** #rule_of_zero #memberwise_copy #vector

**Answer:**
The implicit copy constructor calls `vector`'s copy constructor (deep copy, separate storage); the implicit move constructor calls `vector`'s move constructor (O(1) buffer transfer, `noexcept`). The destructor frees the buffer. All five are correct without writing any of them.

**Explanation:**
```cpp
class Buffer {
    std::vector<int> data_;
public:
    explicit Buffer(std::size_t n) : data_(n) {}
};
```
- Every hand-written special member is a chance for: leaks, double deletes, dangling pointers, wrong self-assignment, missing `noexcept`, forgetting a newly added member.
- Adding a member later: the implicit functions pick it up automatically; hand-written ones silently skip it.
- Choose the member type by desired semantics: `vector`/`string` (deep copy), `unique_ptr` (move-only), `shared_ptr` (shared, shallow by design).
- ❌ Common wrong answer: "Rule of 0 works because the data is on the stack." The elements are on the heap.
- ✅ What a strong answer adds: with `std::unique_ptr<int[]>` instead, the class becomes move-only automatically; to keep it copyable you then write a deep-copying copy constructor and assignment (and default the moves).

**Key takeaway:** Let members own resources; the compiler-generated members then compose correctly.

---

#### Q14: A `Connection` class holds an `int fd_` and closes it in its destructor. Objects live in a `std::vector<Connection>`. Production shows rare "descriptor closed twice" errors. What is the bug and the fix?
**Difficulty:** #intermediate
**Category:** #class_design #resource_management
**Concepts:** #move_only #file_descriptor #double_close #noexcept_move

**Answer:**
The implicit copy duplicates the integer, so after a copy (for example during vector reallocation) two objects close the same descriptor. A descriptor is a uniquely owned resource: delete the copy operations and implement `noexcept` moves that transfer the fd and set the source to `-1`.

**Explanation:**
```cpp
class Connection {
    int fd_ = -1;
public:
    explicit Connection(int fd) : fd_(fd) {}
    ~Connection() { if (fd_ != -1) ::close(fd_); }
    Connection(const Connection&) = delete;
    Connection& operator=(const Connection&) = delete;
    Connection(Connection&& o) noexcept : fd_(std::exchange(o.fd_, -1)) {}
    Connection& operator=(Connection&& o) noexcept {
        if (this != &o) {
            if (fd_ != -1) ::close(fd_);
            fd_ = std::exchange(o.fd_, -1);
        }
        return *this;
    }
};
```
- Reallocation copies (the class has a destructor, hence no implicit move), then destroys the old elements: the first `close` succeeds, the copy's `close` later fails with `EBADF`.
- The worse case: between the two closes, the kernel reuses the number for a new socket or file; the second `close` silently closes **someone else's** descriptor.
- Rule-of-0 alternative: `std::unique_ptr<int, FdCloser>` is awkward because the handle is not a pointer; a small dedicated `UniqueFd` class is the usual answer.
- ❌ Common wrong answer: "Write a deep copy." There is nothing to deep copy; `dup()` creates a second descriptor with shared file state, which is rarely what is wanted.
- ✅ What a strong answer adds: "An integer can still be an owning handle. Ownership is a property of the semantics, not the type."

**Key takeaway:** Unique OS handles: delete copies, `noexcept` moves, sentinel for empty.

---

#### Q15: `PacketBuffer` owns `char* data_` and is returned from functions and stored in a `std::vector`. Profiling shows deep copies and latency spikes when the vector grows. What do you change?
**Difficulty:** #intermediate
**Category:** #class_design #performance
**Concepts:** #rule_of_five #noexcept #return_by_value #unique_ptr

**Answer:**
Give the class correct ownership semantics with cheap, `noexcept` moves: ideally hold `std::unique_ptr<char[]>` (Rule of 0, move-only) or write the full Rule of 5 with `noexcept` moves. Then vector growth moves instead of copying. Keep returning locals by value without `std::move`.

**Explanation:**
- Likely causes of the copies:
  - No move constructor at all (a destructor or copy constructor was declared), so every "move" copies.
  - A move constructor exists but is not `noexcept`, so `vector` growth copies.
- Fix options:
  - `std::unique_ptr<char[]> data_; std::size_t size_;` and no special members: move-only, `noexcept` moves, no leaks.
  - If copies are a real requirement, add a deep-copying copy constructor/assignment and `= default` the moves.
- Return statements: `return buf;` allows NRVO and otherwise moves automatically; `return std::move(buf);` can prevent NRVO (topic 04).
- Also reduce growth itself: `reserve()` when the count is known.
- ❌ Common wrong answer: "Just add `noexcept` to the move constructor." Correct only if a move constructor exists; also check that it nulls the source.
- ✅ What a strong answer adds: verify with `static_assert(std::is_nothrow_move_constructible_v<PacketBuffer>)` and a copy counter in a benchmark.

**Key takeaway:** Unique ownership plus `noexcept` move removes copies from both returns and vector growth.

---

#### Q16: What is the difference between a special member that is "not declared", one that is `= delete`, and one that is "defined as deleted"?
**Difficulty:** #advanced
**Category:** #special_members #overload_resolution
**Concepts:** #deleted_functions #defaulted_functions #overload_resolution

**Answer:**
Not declared: the function does not exist, so rvalues fall back to the copy constructor. `= delete`: the function exists and participates in overload resolution; if chosen, the program is ill-formed. Defined as deleted: a defaulted special member the compiler cannot generate (a member blocks it); a defaulted **move** that is defined as deleted is ignored by overload resolution, so the copy is used.

**Explanation:**
```cpp
#include <iostream>
#include <utility>

struct Legacy {
    Legacy() = default;
    Legacy(const Legacy&) { std::cout << "Legacy copy\n"; }
    Legacy(Legacy&&) = delete;            // explicitly deleted
};

struct Holder {
    Legacy l;
    Holder() = default;
    Holder(const Holder&) = default;
    Holder(Holder&&) = default;           // defined as deleted (Legacy cannot move)
};

int main() {
    Holder a;
    Holder b = std::move(a);              // OK: deleted defaulted move ignored, copies
    (void)b;
    Legacy x;
    // Legacy y = std::move(x);           // error: use of deleted function 'Legacy::Legacy(Legacy&&)'
    (void)x;
}
```
- Output: `Legacy copy`
- Implicitly deleted examples: copy of a class with a `unique_ptr` member, assignment of a class with a `const` or reference member, anything of a class with a `std::mutex` member.
- ❌ Common wrong answer: "`= delete` on the move constructor makes moves fall back to copy." It does the opposite: rvalues select the deleted move and fail (also on `return local;`, topic 04).
- ✅ What a strong answer adds: to make a type copy-only on purpose, do not declare the move at all (declare the copies); to make it neither, delete the copies.

**Key takeaway:** Not declared falls back; explicitly deleted blocks; defaulted-as-deleted move falls back.

---

#### Q17: What does a `const` data member or a reference member do to a class's special members and to containers?
**Difficulty:** #intermediate
**Category:** #special_members #class_design
**Concepts:** #const_member #reference_member #copy_assignment #vector

**Answer:**
Copy and move assignment are implicitly deleted (a `const` or reference member cannot be reassigned); construction, copy construction and move construction still work. In containers, `push_back` and `emplace_back` work, but `erase`, middle `insert` and `std::sort` do not compile because they assign elements.

**Explanation:**
- `struct Trade { const int id; double px; };`: `Trade u = t;` fine; `u = t;` error: "non-static const member 'const int Trade::id', cannot use default assignment operator".
- A reference member also deletes the default constructor (references must be bound), and so does a `const` scalar member without an initializer (`Trade t;` is an error: "uninitialized const member").
- Design alternatives: make the member private and non-const with a getter only; use `T*` or `std::reference_wrapper<T>` instead of `T&`.
- Moving a `const` member copies it (it cannot be moved from), which matters for `const std::string` members.
- ❌ Common wrong answer: "`const` members make the object immutable and thread-safe." They only make that member non-assignable.
- ✅ What a strong answer adds: C++ Core Guidelines C.12: do not make data members `const` or references in copyable/movable types.

**Key takeaway:** `const` and reference members kill assignment, and with it most container algorithms.

---

#### Q18: Is `~T() = default;` the same as not declaring a destructor?
**Difficulty:** #advanced
**Category:** #special_members #compiler_rules
**Concepts:** #user_declared #trivially_destructible #implicit_move

**Answer:**
No. Defaulted on its first declaration it is not user-provided, so it does not make the destructor non-trivial (it is trivial exactly when all members' destructors are), but it is **user-declared**, so the implicit move constructor and move assignment are not declared. Moves become copies.

**Explanation:**
```cpp
#include <iostream>
#include <vector>

struct A { std::vector<int> v; };
struct B { std::vector<int> v; ~B() = default; };

int main() {
    A a1{{1, 2, 3}};
    A a2 = std::move(a1);
    B b1{{1, 2, 3}};
    B b2 = std::move(b1);
    std::cout << a1.v.size() << ' ' << b1.v.size() << '\n';
}
```
- Output: `0 3` (libstdc++). `b1` was copied, not moved.
- Same rule for `T(const T&) = default;` and `T& operator=(const T&) = default;`.
- Typical source of this bug: adding `virtual ~Base() = default;` or "documenting" a destructor during a refactor.
- ❌ Common wrong answer: "Defaulted means the compiler writes it as before, so nothing changes."
- ✅ What a strong answer adds: user-declared vs user-provided: declared affects generation rules; provided affects triviality.

**Key takeaway:** Any declaration of a destructor or copy operation, even `= default`, removes implicit moves.

---

#### Q19: How should you declare the special members of a polymorphic base class?
**Difficulty:** #intermediate
**Category:** #class_design #polymorphism
**Concepts:** #virtual_destructor #slicing #rule_of_five_defaults

**Answer:**
Give it a `public virtual ~Base() = default;` so deletion through a base pointer is correct, then explicitly default the other special members (because the destructor suppresses the moves), usually making copy and move `protected` to prevent slicing.

**Explanation:**
- Without the virtual destructor, `delete basePtr;` on a derived object is UB (derived destructor not run; topic 06 shows the ASan report).
- With only the virtual destructor, derived classes still get implicit moves, but the base subobject is copied, not moved.
- Slicing: `Base b = derived;` copies only the base part. Protected copy/move constructors make that a compile error while still allowing derived classes to use them.
- Alternative for value-like polymorphism: a `clone()` virtual function returning `std::unique_ptr<Base>`.
- ❌ Common wrong answer: "Virtual destructor is enough." It solves deletion, not moving or slicing.
- ✅ What a strong answer adds: C++ Core Guidelines C.67: a polymorphic class should suppress public copy/move.

**Key takeaway:** Polymorphic base: virtual destructor, defaulted five, copies protected or deleted.

---

#### Q20: Your class holds a `std::unique_ptr<Impl>` and must be copyable. What do you write?
**Difficulty:** #intermediate
**Category:** #class_design #ownership
**Concepts:** #deep_copy #unique_ptr #move_only #defaulted_moves

**Answer:**
`unique_ptr` makes the implicit copy deleted. Write a copy constructor that clones the pointee and a copy assignment (copy-and-swap or assign through the pointee), and explicitly `= default` the move constructor and move assignment, because declaring the copies suppresses them.

**Explanation:**
```cpp
#include <iostream>
#include <memory>
#include <string>

class Widget {
    struct Impl { std::string name; };
    std::unique_ptr<Impl> p_;
public:
    explicit Widget(std::string n) : p_(std::make_unique<Impl>(Impl{std::move(n)})) {}
    Widget(const Widget& o) : p_(o.p_ ? std::make_unique<Impl>(*o.p_) : nullptr) {}
    Widget& operator=(const Widget& o) {
        Widget tmp(o);
        p_.swap(tmp.p_);
        return *this;
    }
    Widget(Widget&&) noexcept = default;
    Widget& operator=(Widget&&) noexcept = default;
    ~Widget() = default;
    const std::string& name() const { return p_->name; }
};

int main() {
    Widget a("order-1");
    Widget b = a;               // deep copy
    Widget c = std::move(a);    // pointer transfer
    std::cout << b.name() << ' ' << c.name() << '\n';
}
```
- Output: `order-1 order-1`
- Handle the null state in the copy constructor: a moved-from `Widget` has `p_ == nullptr`.
- With an incomplete `Impl` (pimpl), the defaulted members must be defined in the `.cpp` file where `Impl` is complete (topic 06).
- ❌ Common wrong answer: "Just add `= default` copy." It is defined as deleted because `unique_ptr` is not copyable.
- ✅ What a strong answer adds: the 4 user-written lines replace a whole Rule-of-5 class because `unique_ptr` already handles destruction and moves.

**Key takeaway:** `unique_ptr` member gives move-only for free; copying needs an explicit clone plus defaulted moves.
