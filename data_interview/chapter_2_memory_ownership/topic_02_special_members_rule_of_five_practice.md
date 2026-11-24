## TOPIC: Special Member Functions and the Rule of 0/3/5

### PRACTICE_TASKS: Output Prediction and Bug Hunting

#### Q1
```cpp
// Q: What does this print? Name the special member behind every line.
#include <iostream>
#include <utility>

struct T {
    static inline int next = 1;
    int id = next++;
    T() { std::cout << "ctor " << id << '\n'; }
    T(const T& o) { std::cout << "copy " << id << "<-" << o.id << '\n'; }
    T(T&& o) noexcept { std::cout << "move " << id << "<-" << o.id << '\n'; }
    ~T() { std::cout << "dtor " << id << '\n'; }
};

void take(T t) { std::cout << "in take " << t.id << '\n'; }

int main() {
    T a;
    take(a);
    take(std::move(a));
    take(T());
}
```

**Answer:**
```
ctor 1
copy 2<-1
in take 2
dtor 2
move 3<-1
in take 3
dtor 3
ctor 4
in take 4
dtor 4
dtor 1
```

**Explanation:**
- `take(a)`: the by-value parameter is initialized from an lvalue: copy constructor.
- `take(std::move(a))`: initialized from an xvalue: move constructor. `a` is still alive (moved-from) and destroyed last.
- `take(T())`: a prvalue initializes the parameter directly (C++17 guaranteed elision, topic 04): one constructor, no copy, no move.
- Whether a parameter is destroyed when `take` returns or at the end of the caller's full-expression is implementation-defined ([expr.call]); GCC/Clang (Itanium ABI) do the latter. Either way it happens before the next line.
- **Key Concept:** Passing by value is initialization: copy for lvalues, move for xvalues, nothing extra for prvalues.

---

#### Q2
```cpp
// Q: Find the bug. The program only "prints" the buffer.
#include <cstddef>
#include <iostream>

class Buffer {
    int* data_;
    std::size_t size_;
public:
    explicit Buffer(std::size_t n) : data_(new int[n]{}), size_(n) {}
    ~Buffer() { delete[] data_; }
    std::size_t size() const { return size_; }
};

void print(Buffer b) { std::cout << "size " << b.size() << '\n'; }

int main() {
    Buffer a(4);
    print(a);
    std::cout << "back in main\n";
}
```

**Answer:**
```
Undefined behaviour (double delete). On a terminal: "size 4", "back in main", then glibc
aborts with "free(): double free detected in tcache 2". ASan: "attempting double-free"
when a is destroyed. (If stdout is a pipe, the abort can swallow the buffered lines.)
```

**Explanation:**
- Passing by value calls the implicit copy constructor: the parameter `b` shares `a`'s array.
- When `print` returns, `~b` frees the array. At the end of `main`, `~a` frees it again.
- The copy is invisible at the call site, which is why Rule-of-3 bugs hide in by-value parameters, container insertion and return statements.
- `-Wall -Wextra` gives no warning; `-Wdeprecated-copy-dtor` does.
- **Key Concept:** A user destructor without copy control is a time bomb; every hidden copy arms it.

**Fixed Version:**
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
        std::copy(o.data_, o.data_ + o.size_, data_);
    }
    Buffer& operator=(const Buffer&) = delete;   // or implement it
    std::size_t size() const { return size_; }
};

void print(const Buffer& b) { std::cout << "size " << b.size() << '\n'; }  // no copy needed

int main() {
    Buffer a(4);
    print(a);
    std::cout << "back in main\n";
}
```

---

#### Q3
```cpp
// Q: Does this compile?
#include <utility>

struct Buffer {
    int* p = nullptr;
    Buffer() = default;
    Buffer& operator=(Buffer&& o) noexcept {
        std::swap(p, o.p);
        return *this;
    }
};

int main() {
    Buffer a;
    Buffer b(a);
    Buffer c(std::move(a));
    (void)b; (void)c;
}
```

**Answer:**
```
Compile error (both lines):
error: use of deleted function 'constexpr Buffer::Buffer(const Buffer&)'
note: ... is implicitly declared as deleted because 'Buffer' declares a move
      constructor or move assignment operator
```

**Explanation:**
- Declaring only move assignment deletes the implicit copy constructor and copy assignment, and leaves the move constructor not declared.
- `Buffer b(a);`: the copy constructor is deleted.
- `Buffer c(std::move(a));`: there is no move constructor, so the rvalue falls back to the copy constructor, which is deleted.
- **Key Concept:** Declaring any move operation deletes both copies; it does not give you the other move.

---

#### Q4
```cpp
// Q: What does this print?
#include <iostream>
#include <string>
#include <utility>

struct Quote {
    std::string symbol;
    Quote(std::string s) : symbol(std::move(s)) {}
    Quote(const Quote&) = default;      // "just being explicit"
};

int main() {
    Quote a("A_VERY_LONG_SYMBOL_NAME_EXCEEDING_SSO");
    Quote b = std::move(a);
    std::cout << a.symbol.size() << ' ' << b.symbol.size() << '\n';
}
```

**Answer:**
```
37 37
```

**Explanation:**
- `Quote(const Quote&) = default;` is a user-declared copy constructor, so the implicit move constructor is not declared.
- `std::move(a)` then binds to `const Quote&`: the string is deep-copied and `a.symbol` keeps its 37 characters.
- Delete the defaulted copy line and the output becomes `0 37` (libstdc++): the implicit move constructor moves the string.
- **Key Concept:** Defaulting one copy operation is still declaring it; add `Quote(Quote&&) noexcept = default;` (and the assignments) if you want moves.

---

#### Q5
```cpp
// Q: The test passes in a quick check. Is the move constructor correct?
#include <cstddef>
#include <iostream>
#include <utility>

class Buffer {
    int* data_;
    std::size_t size_;
public:
    explicit Buffer(std::size_t n) : data_(new int[n]{}), size_(n) {}
    ~Buffer() { delete[] data_; }
    Buffer(const Buffer&) = delete;
    Buffer& operator=(const Buffer&) = delete;
    Buffer(Buffer&& o) noexcept : data_(o.data_), size_(o.size_) {}
    std::size_t size() const { return size_; }
};

int main() {
    Buffer a(8);
    Buffer b(std::move(a));
    std::cout << b.size() << '\n';
}
```

**Answer:**
```
Prints 8, then undefined behaviour at scope exit: double delete
(glibc: "free(): double free detected in tcache 2"; ASan: "attempting double-free").
```

**Explanation:**
- The move constructor copies the pointer but leaves `a.data_` pointing at the same array.
- `~b` frees it, then `~a` frees it again.
- A move must leave the source in a state its own destructor handles: `nullptr` here.
- **Key Concept:** Moving a raw pointer is copying it; ownership transfer is the reset you write yourself.

**Fixed Version:**
```cpp
#include <cstddef>
#include <iostream>
#include <utility>

class Buffer {
    int* data_;
    std::size_t size_;
public:
    explicit Buffer(std::size_t n) : data_(new int[n]{}), size_(n) {}
    ~Buffer() { delete[] data_; }
    Buffer(const Buffer&) = delete;
    Buffer& operator=(const Buffer&) = delete;
    Buffer(Buffer&& o) noexcept
        : data_(std::exchange(o.data_, nullptr)), size_(std::exchange(o.size_, 0)) {}
    std::size_t size() const { return size_; }
};

int main() {
    Buffer a(8);
    Buffer b(std::move(a));
    std::cout << b.size() << ' ' << a.size() << '\n';   // 8 0
}
```

---

#### Q6
```cpp
// Q: Find the bug. Hint: look at i == j.
#include <algorithm>
#include <cstddef>
#include <iostream>
#include <vector>

class Row {
    int* data_;
    std::size_t n_;
public:
    explicit Row(std::size_t n, int v) : data_(new int[n]), n_(n) { std::fill_n(data_, n, v); }
    ~Row() { delete[] data_; }
    Row(const Row& o) : data_(new int[o.n_]), n_(o.n_) { std::copy_n(o.data_, n_, data_); }
    Row& operator=(const Row& o) {
        delete[] data_;
        data_ = new int[o.n_];
        n_ = o.n_;
        std::copy_n(o.data_, n_, data_);
        return *this;
    }
    int first() const { return data_[0]; }
};

int main() {
    std::vector<Row> rows;
    rows.reserve(2);
    rows.emplace_back(3, 7);
    rows.emplace_back(3, 9);
    std::size_t i = 0, j = 0;
    rows[i] = rows[j];
    std::cout << rows[0].first() << '\n';
}
```

**Answer:**
```
Undefined behaviour: the row's values are lost. Prints garbage that changes between runs
(e.g. 749059376), not 7. ASan stays silent.
```

**Explanation:**
- `rows[i] = rows[j]` with `i == j` is self-assignment: `o` and `*this` are the same object.
- `delete[] data_` frees the array holding the 7s. Then `data_ = new int[o.n_]` also changes `o.data_` (same object), so `copy_n(o.data_, n_, data_)` copies the **new, uninitialized** array onto itself.
- Result: reads of indeterminate values (UB); the data is gone. ASan does not flag it because no freed memory is touched; MemorySanitizer or Valgrind would report uninitialized reads.
- With a slightly different body (copy from a saved `o.data_` pointer) the same bug becomes a heap-use-after-free.
- Even without aliasing, deleting first is wrong: if `new` throws, `data_` dangles and the destructor deletes it again.
- **Key Concept:** Allocate and copy into a local first, then release, then commit (self-safe and strongly exception safe).

**Fixed Version:**
```cpp
#include <algorithm>
#include <cstddef>
#include <iostream>
#include <vector>

class Row {
    int* data_;
    std::size_t n_;
public:
    explicit Row(std::size_t n, int v) : data_(new int[n]), n_(n) { std::fill_n(data_, n, v); }
    ~Row() { delete[] data_; }
    Row(const Row& o) : data_(new int[o.n_]), n_(o.n_) { std::copy_n(o.data_, n_, data_); }
    Row& operator=(const Row& o) {
        int* fresh = new int[o.n_];          // may throw: *this unchanged
        std::copy_n(o.data_, o.n_, fresh);   // reads o before anything is freed
        delete[] data_;
        data_ = fresh;
        n_ = o.n_;
        return *this;
    }
    int first() const { return data_[0]; }
};

int main() {
    std::vector<Row> rows;
    rows.reserve(2);
    rows.emplace_back(3, 7);
    rows.emplace_back(3, 9);
    std::size_t i = 0, j = 0;
    rows[i] = rows[j];
    std::cout << rows[0].first() << '\n';   // 7
}
```

---

#### Q7
```cpp
// Q: What does this print? (No reserve; libstdc++ grows capacity 1, 2, 4.)
#include <iostream>
#include <string>
#include <vector>

struct Msg {
    std::string body;
    explicit Msg(std::string b) : body(std::move(b)) {}
    Msg(const Msg& o) : body(o.body) { std::cout << "copy "; }
    Msg(Msg&& o) : body(std::move(o.body)) { std::cout << "move "; }
};

int main() {
    std::vector<Msg> v;
    for (int i = 0; i < 3; ++i) {
        v.emplace_back("m" + std::to_string(i));
        std::cout << "| ";
    }
    std::cout << '\n';
}
```

**Answer:**
```
| copy | copy copy | 
```

**Explanation:**
- `emplace_back` constructs the new element in place: no copy or move for the element being added.
- Growth from capacity 1 to 2 relocates one element; from 2 to 4 relocates two.
- The move constructor is not `noexcept`, and a copy constructor exists, so `std::move_if_noexcept` chooses the **copy** to keep `emplace_back`'s strong guarantee.
- Add `noexcept` to `Msg(Msg&&)` and the output becomes `| move | move move | `.
- **Key Concept:** A move constructor that is not `noexcept` is ignored by vector reallocation whenever copying is possible.

---

#### Q8
```cpp
// Q: Does this compile? If so, what does it print?
#include <iostream>

struct View {
    int& ref;
};

int main() {
    int x = 1, y = 2;
    View a{x};
    View b{y};
    View c = a;
    a = b;
    std::cout << a.ref << c.ref << '\n';
}
```

**Answer:**
```
Compile error at "a = b;":
error: use of deleted function 'View& View::operator=(const View&)'
note: ... is implicitly deleted because the default definition would be ill-formed:
error: non-static reference member 'int& View::ref', cannot use default assignment operator
```

**Explanation:**
- A reference cannot be reseated, so the implicit copy (and move) assignment is defined as deleted.
- Copy construction (`View c = a;`) is fine: it binds the new reference to the same object.
- If assignment is required, store `int*` or `std::reference_wrapper<int>`; then `a = b` rebinds `a` to `y`.
- **Key Concept:** Reference and `const` members make a type non-assignable, which also blocks `std::sort`, `erase` and middle `insert` on containers of it.

---

#### Q9
```cpp
// Q: Is this UB? What does it print?
#include <cstddef>
#include <iostream>

class Buffer {
    int* data_;
    std::size_t size_;
public:
    explicit Buffer(std::size_t n) : data_(new int[n]{}), size_(n) {}
    ~Buffer() { delete[] data_; }
    Buffer(const Buffer&) = delete;
    Buffer& operator=(const Buffer&) = delete;
    Buffer& operator=(Buffer&& o) noexcept {     // no self-check
        delete[] data_;
        data_ = o.data_;
        size_ = o.size_;
        o.data_ = nullptr;
        o.size_ = 0;
        return *this;
    }
    std::size_t size() const { return size_; }
};

Buffer& pick(Buffer& a, Buffer&, bool) { return a; }  // aliasing hidden in a helper

int main() {
    Buffer a(5), b(3);
    a = static_cast<Buffer&&>(pick(a, b, true));
    std::cout << a.size() << '\n';
}
```

**Answer:**
```
0
```

**Explanation:**
- `pick` returns `a`, so this is self-move assignment: `o` and `*this` are the same object.
- Step by step: free the array; copy the (now dangling) pointer onto itself; set it to `nullptr` and the size to 0.
- No UB occurs with this particular statement order (the dangling pointer is never dereferenced), and ASan is clean, but the object's 5 elements are silently destroyed.
- With a different order (steal first, then `delete[]` the old pointer saved earlier) the same self-move becomes a double free or use after free.
- **Key Concept:** Add `if (this != &o)` or use move-and-swap; self-move should leave the object intact or at least valid.

---

#### Q10
```cpp
// Q: What does this print? (Typical Linux: fds 0-2 are taken.)
#include <cerrno>
#include <cstring>
#include <iostream>
#include <unistd.h>
#include <vector>

struct Conn {
    int fd;
    explicit Conn(int f) : fd(f) {}
    ~Conn() {
        if (::close(fd) != 0)
            std::cout << "close(" << fd << "): " << std::strerror(errno) << '\n';
    }
};

int main() {
    int p[2];
    if (::pipe(p) != 0) return 1;
    std::vector<Conn> v;
    v.emplace_back(p[0]);
    v.emplace_back(p[1]);           // growth: copies Conn(3), destroys the old one
    std::cout << "two connections\n";
}
```

**Answer:**
```
two connections
close(3): Bad file descriptor
```

**Explanation:**
- `Conn` has a destructor, so it has no move constructor; growth from capacity 1 to 2 copies `Conn{3}` into the new buffer and destroys the old element, which closes descriptor 3.
- At the end, the copy's destructor closes 3 again: `EBADF`. Descriptor 4 is closed once, correctly.
- In a busy server the second `close` can hit a descriptor number that was just reused by another socket: silent data loss.
- **Key Concept:** An `int` can be an owning handle; make such classes move-only with a `-1` sentinel.

**Fixed Version:**
```cpp
#include <iostream>
#include <unistd.h>
#include <utility>
#include <vector>

struct Conn {
    int fd = -1;
    explicit Conn(int f) : fd(f) {}
    ~Conn() { if (fd != -1) ::close(fd); }
    Conn(const Conn&) = delete;
    Conn& operator=(const Conn&) = delete;
    Conn(Conn&& o) noexcept : fd(std::exchange(o.fd, -1)) {}
    Conn& operator=(Conn&& o) noexcept {
        if (this != &o) { if (fd != -1) ::close(fd); fd = std::exchange(o.fd, -1); }
        return *this;
    }
};

int main() {
    int p[2];
    if (::pipe(p) != 0) return 1;
    std::vector<Conn> v;
    v.emplace_back(p[0]);
    v.emplace_back(p[1]);           // moved: old element holds -1, closes nothing
    std::cout << "two connections\n";
}
```

---

#### Q11
```cpp
// Q: The copy fails half-way. What does this print?
#include <iostream>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

struct Book {
    std::vector<std::string> levels;
    static inline bool fail_copy = false;

    Book() = default;
    Book(const Book& o) : levels(o.levels) {
        if (fail_copy) throw std::runtime_error("copy failed");
    }
    Book(Book&&) noexcept = default;
    friend void swap(Book& a, Book& b) noexcept { a.levels.swap(b.levels); }
    Book& operator=(const Book& o) {
        Book tmp(o);
        swap(*this, tmp);
        return *this;
    }
};

int main() {
    Book live, update;
    live.levels = {"100.5", "100.4"};
    update.levels = {"101.0"};
    Book::fail_copy = true;
    try {
        live = update;
    } catch (const std::exception& e) {
        std::cout << e.what() << '\n';
    }
    std::cout << live.levels.size() << ' ' << live.levels[0] << '\n';
}
```

**Answer:**
```
copy failed
2 100.5
```

**Explanation:**
- `Book tmp(o)` throws before `swap` runs, so `live` is never modified: strong exception guarantee.
- `tmp` was never fully constructed, so its destructor does not run; its already-constructed member `levels` is destroyed automatically.
- A version that cleared `levels` first and then copied would leave `live` empty or half-updated after the exception.
- **Key Concept:** Copy-and-swap: all throwing work happens on a temporary, the commit is a `noexcept` swap.

---

#### Q12
```cpp
// Q: What does this print?
#include <iostream>
#include <string>
#include <utility>

struct Base {
    std::string tag = "BASE-TAG-LONG-ENOUGH-TO-BE-ON-THE-HEAP";
    virtual ~Base() = default;
};

struct Derived : Base {
    std::string body = "DERIVED-BODY-LONG-ENOUGH-TO-BE-ON-HEAP";
};

int main() {
    Derived a;
    Derived b = std::move(a);
    std::cout << "tag " << a.tag.size() << ", body " << a.body.size() << '\n';
}
```

**Answer:**
```
tag 38, body 0
```

**Explanation:**
- `Derived` declares nothing, so it gets an implicit move constructor: it moves each base and member.
- But `Base` declares a (virtual, defaulted) destructor, so `Base` has **no move constructor**; "moving" the `Base` subobject calls `Base`'s copy constructor. `tag` is copied.
- `body` is a member of `Derived`, moved by `std::string`'s move constructor: libstdc++ leaves it empty.
- Fix: in `Base`, add `Base() = default; Base(const Base&) = default; Base(Base&&) noexcept = default;` and both assignments.
- **Key Concept:** A virtual destructor in a base silently turns the base part of every derived move into a copy.

---

#### Q13
```cpp
// Q: What does this print?
#include <iostream>
#include <memory>
#include <vector>

struct Portfolio {
    std::shared_ptr<std::vector<int>> positions = std::make_shared<std::vector<int>>();
};

int main() {
    Portfolio live;
    live.positions->push_back(100);
    Portfolio snapshot = live;          // Rule of 0 copy
    live.positions->push_back(200);
    std::cout << snapshot.positions->size() << ' ' << live.positions.use_count() << '\n';
}
```

**Answer:**
```
2 2
```

**Explanation:**
- Rule of 0 copies each member with its own copy semantics. `shared_ptr`'s copy shares the pointee, so `snapshot` and `live` refer to the same vector.
- The "snapshot" sees the later `push_back`; the reference count is 2.
- Rule of 0 is only as correct as the members' semantics: `std::vector<int> positions;` would give a true deep copy (`1` printed).
- If shared state is intended, make it explicit (e.g. `shared_ptr<const T>` with copy-on-write).
- **Key Concept:** The member type chooses the class's copy semantics: `vector` deep, `unique_ptr` none, `shared_ptr` shared.
