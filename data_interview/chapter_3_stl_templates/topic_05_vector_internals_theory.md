## TOPIC: std::vector Internals

### THEORY_SECTION: Core Concepts

#### 1. Mental model
- A `std::vector<T>` is a handle to one contiguous heap block. In every major library the handle is three pointers:
  - `begin`: first element.
  - `end`: one past the last **constructed** element (`size() = end - begin`).
  - `end_of_storage`: one past the allocated block (`capacity() = end_of_storage - begin`).
- `sizeof(std::vector<T>)` is 24 on 64-bit libstdc++, libc++ and MSVC release builds (implementation detail).
- Only `[begin, end)` holds live objects. The slots in `[end, end_of_storage)` are raw memory: no constructor has run there, so reading or writing them is UB even though the memory is allocated.
- Contiguity is guaranteed: `v.data() + i == &v[i]`, so a vector can be passed to C APIs as `(v.data(), v.size())` or as a `std::span` (topic 02).
- Three costs to keep in mind: allocation (rare, geometric growth), element relocation on growth (move or copy every element), and pointer invalidation (every borrow dies on reallocation).

#### 2. size, capacity and growth
- `size() <= capacity()` always. When an insertion would make `size() > capacity()`, the vector **must** allocate a new block: `capacity()` is by definition the storage it holds, so there is no "unusual allocation strategy" that avoids it.
- Growth is **geometric** so that `push_back` is amortized O(1):
  - Total elements moved over n pushes with factor k is about n / (k - 1), a constant per element.
  - Linear growth (`+10` each time) would make n pushes O(n²).
- The factor is implementation-defined:

| Library | Growth on `push_back` | Notes |
|---|---|---|
| libstdc++ (GCC) | 2x (0, 1, 2, 4, 8, ...) | `max(2 * size, size + n)` for multi-element inserts |
| libc++ (Clang) | 2x | similar rule |
| MSVC STL | 1.5x | 1, 2, 3, 4, 6, 9, 13, ... |

- The libstdc++ row is verified with GCC 11; the libc++ and MSVC rows describe their typical documented behaviour and are not verified here.

- Why 1.5x: with factor < golden ratio (about 1.618), the sum of earlier freed blocks can eventually hold the next request, so an allocator could reuse that memory; with 2x it never can. In practice the allocator decides, so the gain is small.
- A default-constructed vector has `capacity() == 0` and usually `data() == nullptr` in libstdc++ (the standard only says `data()` is a valid range pointer; for an empty vector it may or may not be null).
- `max_size()` is the theoretical limit; `reserve(n)` beyond it throws `std::length_error`, allocation failure throws `std::bad_alloc`.

#### 3. reserve vs resize vs the size constructor
| Call | `size()` | `capacity()` | Constructs elements? |
|---|---|---|---|
| `std::vector<int> v(n);` | n | ≥ n | Yes, value-initialized (`0`) |
| `std::vector<int> v(n, x);` | n | ≥ n | Yes, copies of `x` |
| `v.reserve(n);` | unchanged | ≥ n | No |
| `v.resize(n);` | n | ≥ n (never shrinks) | New ones value-initialized; extra ones destroyed |
| `v.clear();` | 0 | unchanged | Destroys all |
| `v.shrink_to_fit();` | unchanged | non-binding request: ≥ size | No |

- `reserve(n)`:
  - Never reduces capacity and never changes size.
  - Makes the next `n - size()` insertions reallocation-free; it does **not** make `v[i]` legal for `i >= size()`.
- `v.reserve(100); v[50] = 10;` compiles and is UB: no element exists at index 50. `size()` stays 0, so a later reallocation drops the value and later `push_back`s overwrite that slot.
- AddressSanitizer does not flag that write (it is inside the allocated block); `-D_GLIBCXX_ASSERTIONS` aborts with `Assertion '__n < this->size()' failed`, and `-D_GLIBCXX_DEBUG` aborts with `Error: attempt to subscript container with out-of-bounds index`.
- Choosing:
  - Know the count and will fill by index: `std::vector<T> v(n);` or `resize(n)`.
  - Know the count and will append: `reserve(n)` then `push_back` / `emplace_back`.
  - `resize` value-initializes, which costs a write per element; for `int` buffers about to be overwritten by `read()` this is wasted work (custom allocator with default-init, or `std::make_unique_for_overwrite<T[]>` in C++20, are the workarounds).

#### 4. What happens on reallocation
- For `v.emplace_back(args...)` with `size() == capacity()`, libstdc++ does:
  1. Allocate a new block (larger by the growth factor).
  2. Construct the **new element first**, at index `size()` in the new block.
  3. Relocate the old elements into the new block with `std::move_if_noexcept`: move if the move constructor is `noexcept` (or if the type is not copyable), otherwise copy.
  4. Destroy the old elements, free the old block, update the three pointers. With a `noexcept` move, libstdc++ interleaves steps 3 and 4 (move one, destroy it, next); with copying it copies all, then destroys all (`ctor3 copy1 copy2 dtor1 dtor2`).
- Observable order for a noisy type: `ctor3 move1 dtor1 move2 dtor2`. The often-drawn diagram "move the old elements, then construct the new one" is not what libstdc++ does.
- Constructing the new element first is what makes `v.push_back(v[0])` correct even at full capacity: the argument still refers to the old block, which is alive until step 4.
- Copy vs move on growth, the strong exception guarantee and why `noexcept` on move constructors matters are covered in Memory & Ownership, topic 02. One-line rule: a non-`noexcept` move constructor makes growth copy every element (if the type is copyable).
- Trivially copyable types (`int`, POD structs) are relocated with `memmove`: one bulk copy.
- After reallocation every pointer, reference and iterator into the vector is invalid, including ones obtained from `data()`.

#### 5. Invalidation in one table (vector only)
| Operation | Reallocates? | Invalidated |
|---|---|---|
| `push_back` / `emplace_back`, `size < capacity` | No | `end()` only |
| `push_back` / `emplace_back`, `size == capacity` | Yes | Everything |
| `insert` / `emplace` at `pos`, no reallocation | No | `pos` and everything after it, including `end()` |
| `erase(pos)` | No | `pos` and everything after it, including `end()` |
| `pop_back` | No | The last element and `end()` |
| `reserve(n)` with `n > capacity()` | Yes | Everything |
| `resize` | If it grows past capacity | Everything if it reallocates; otherwise like insert/erase at the end (`end()`, plus removed elements when shrinking) |
| `shrink_to_fit` | If capacity changes | Everything when it changes |
| `clear` | No | Everything (no elements left) |
| `swap(a, b)` | No | No element iterators: they stay valid but now refer into the other vector (`end()` may be invalidated) |

- The full cross-container table, erase-in-loop idioms and debug modes are in topic 06.

#### 6. push_back vs emplace_back
| Call | Work done (for a type `T` with a converting constructor) |
|---|---|
| `v.push_back(t)` (lvalue) | 1 copy construction |
| `v.push_back(std::move(t))` | 1 move construction |
| `v.push_back(T(args))` | 1 construction of a temporary + 1 move + 1 destruction |
| `v.emplace_back(args)` | 1 construction in place |
| `v.emplace_back(t)` (existing object) | 1 copy: no advantage over `push_back` |
| `v.emplace_back(std::move(t))` | 1 move: no advantage over `push_back` |

- `emplace_back` only saves the temporary when you pass **constructor arguments**, not when you already have an object.
- `emplace_back` uses direct-initialization, so it can call **explicit** constructors:
  - `std::vector<std::unique_ptr<int>> v; v.emplace_back(new int(1));` compiles; `push_back(new int(1))` does not.
  - If the reallocation inside `emplace_back` throws, the raw `new int` leaks. Prefer `v.push_back(std::make_unique<int>(1))`.
- Aggregates: `struct P { int a, b; }; v.emplace_back(1, 2);` fails in C++17 (no constructor) and compiles in C++20 (parenthesized aggregate initialization, P0960; GCC 10+).
- `emplace_back` returns a reference to the new element since C++17.
- `insert` / `emplace` in the middle need the type to be move-assignable (elements shift by assignment); `push_back` / `emplace_back` only need move-insertable.

#### 7. Construction pitfalls
| Code | Result |
|---|---|
| `std::vector<int> a(10);` | 10 zeros |
| `std::vector<int> b{10};` | 1 element: `10` (initializer list wins) |
| `std::vector<int> c(10, 5);` | 10 fives |
| `std::vector<int> d{10, 5};` | 2 elements: `10, 5` |
| `std::vector<std::string> e(3);` | 3 empty strings |
| `std::vector<std::string> f{3};` | 3 empty strings: `3` cannot make a `std::string`, so the size constructor is chosen |
| `std::vector<std::string> g{{"a", "b"}};` | UB: the inner braces call `std::string(first, last)` with two unrelated pointers |
| `std::vector v{1, 2, 3};` | CTAD (C++17): `std::vector<int>` |

- Braces prefer an `initializer_list` constructor whenever one is viable; parentheses never use it.
- `initializer_list` elements are `const`, so `std::vector<std::unique_ptr<int>> v{std::make_unique<int>(1)};` does not compile (would need a copy).

#### 8. Removing elements and returning memory
- `erase(pos)` / `erase(first, last)`: O(n) because later elements shift left by move-assignment.
- Erase-remove idiom:
  - `std::remove(first, last, x)` moves the kept elements forward and returns the new logical end. It does not change `size()`; the tail holds valid but unspecified values.
  - `v.erase(std::remove(v.begin(), v.end(), x), v.end());` actually shrinks.
- C++20 `std::erase(v, x)` / `std::erase_if(v, pred)` do both and return the number removed.
- Unordered removal in O(1): swap with the last element, then `pop_back`.
- Returning memory:
  - `clear()` keeps the capacity (good for reuse in a loop).
  - `shrink_to_fit()` is a non-binding request (libstdc++ honours it by reallocating).
  - Pre-C++11 trick: `std::vector<T>().swap(v);` guarantees capacity 0 in practice.

#### 9. std::vector<bool> is not a container of bool
- It is a space-optimized specialization that stores bits. `operator[]` returns a proxy object (`std::vector<bool>::reference`), not `bool&`.
- Consequences:
  - `auto r = vb[0];` is a proxy that still refers to the bit; later writes to `vb[0]` show through `r`.
  - `bool* p = &vb[0];` does not compile; there is no `data()`.
  - Generic code that takes `T&` from `v[i]` breaks.
  - Two threads writing **different** elements is a data race (they share a word); the standard explicitly excludes `vector<bool>` from the "different elements are safe" rule.
- Alternatives: `std::vector<char>` or `std::vector<std::uint8_t>` (real elements), `std::bitset<N>` (fixed size), `std::deque<bool>`, or a dynamic bitset library.

#### 10. Misconceptions to unlearn
- ❌ "`reserve(n)` creates n elements." ✅ It only allocates; `size()` is unchanged and `v[i]` is UB.
- ❌ "Accessing a reserved slot is a compile error or a crash." ✅ It compiles and usually runs silently; even ASan is quiet.
- ❌ "Vectors double their capacity." ✅ Geometric growth with an implementation-defined factor (2x GCC/Clang, 1.5x MSVC).
- ❌ "`push_back` at full capacity might not reallocate." ✅ It must; capacity is the storage held.
- ❌ "With no reallocation, all iterators stay valid." ✅ `end()` (and everything at or after an insertion point) is invalidated (topic 06).
- ❌ "A copy keeps the reserved capacity." ✅ Copies allocate for the elements only; moves keep the block.
- ❌ "Reallocation moves old elements first, then builds the new one." ✅ libstdc++ builds the new element first; that is why `push_back(v[0])` works.
- ❌ "`emplace_back` is always faster." ✅ Only when you pass constructor arguments.
- ❌ "`std::remove` removes elements." ✅ It reorders; `erase` (or C++20 `std::erase`) shrinks.
- ❌ "`clear()` frees the memory." ✅ Capacity stays; use `shrink_to_fit` or swap with an empty vector.
- ❌ "`vector<bool>` is a vector of bools." ✅ It is a bitset with proxy references.

### EDGE_CASES: Traps and Misconceptions

#### Edge Case 1: reserve then index
- `std::vector<int> v; v.reserve(100); v[50] = 10;` compiles and is UB: there is no element 50.
- Typical symptom: the program prints `v[50]` correctly (the raw memory was written), but `v.size()` is 0, range-for prints nothing, and the next reallocation drops the value.
- ASan stays silent: the write is inside the allocated block. Use `-D_GLIBCXX_ASSERTIONS` in test builds.
- Fix: `resize(100)` or construct with `std::vector<int> v(100);`, or keep `reserve` and `push_back`.

#### Edge Case 2: The function that returns an empty result
- A "rotate" or "transform" helper does `result.reserve(n); for (...) result[i] = ...; return result;`.
- Debug prints inside the loop show correct values, the caller receives a vector with `size() == 0`.
- The returned vector's elements never existed; returning it moves only `begin/end/capacity`, and `end == begin`.
- Fix: size the vector (`std::vector<int> result(n);`) or append.

#### Edge Case 3: reserve does not protect beyond capacity
- `v.reserve(100);` then 100 `push_back`s, `int* p = &v[0];`, then one more `push_back`.
- `size() == capacity() == 100`, so the 101st insertion reallocates: `p` dangles.
- reserve only guarantees no reallocation **until** size would exceed the reserved capacity.

#### Edge Case 4: The copy forgets the reservation
- `a.reserve(1000); a.push_back(1); auto b = a;`: `b.capacity()` is 1 on libstdc++, not 1000.
- Copy construction allocates for the elements, not for the source's spare capacity. Moving keeps it (`std::move(a)` hands over the 1000-slot block).
- Copy assignment into an existing vector with enough capacity reuses that vector's storage.
- A buffer `reserve`d in one place and then passed or stored **by value** silently loses its pre-allocation, and the first growth on the hot path reallocates.

#### Edge Case 5: auto and vector<bool>
- `auto first = flags[0];` is `std::vector<bool>::reference`, a proxy, not a `bool`.
- Writing `flags[0] = true;` afterwards changes what `first` reads. If `flags` is destroyed or reallocated, `first` dangles.
- Fix: `bool first = flags[0];` (explicit type), or avoid `vector<bool>`.

#### Edge Case 6: Brace initialization picks the initializer list
- `std::vector<int> v{10};` is one element; `std::vector<int> v(10);` is ten.
- `std::vector<std::string> g{{"a", "b"}};` compiles and is UB: the inner `{"a", "b"}` is a `std::string(const char* first, const char* last)` over two unrelated literals. libstdc++ throws `length_error` or crashes.
- Rule: parentheses for sizes and counts, braces for listing element values.

#### Edge Case 7: emplace_back that cannot default-construct
- `struct Data { Data(const Data&); Data(Data&&); }; v.emplace_back();` does not compile.
- Declaring any constructor (copy and move constructors included) suppresses the implicit default constructor: `error: no matching function for call to 'Data::Data()'`.
- Fix: `Data() = default;`.

#### Edge Case 8: Pushing an element of the same vector
- `v.push_back(v[0]);` at full capacity looks dangerous: the reference argument points into the block being replaced.
- The standard requires it to work, and libstdc++ constructs the new element (copying from the old block) before releasing the old block.
- The same holds for `insert(pos, v[i])`: implementations copy the value first. It is a hand-written container that usually gets this wrong.

#### Edge Case 9: remove without erase
- `std::remove(v.begin(), v.end(), 2)` on `{1, 2, 3, 2, 5}` returns an iterator to index 3; `v.size()` is still 5.
- The tail (`v[3]`, `v[4]`) holds valid but unspecified values (libstdc++ leaves `2, 5`).
- Fix: erase the tail, or use C++20 `std::erase(v, 2)` which returns 2 (the count removed).

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: The three pointers and geometric growth
- Prints every capacity change and the size of the handle.
```cpp
#include <iostream>
#include <vector>

int main() {
    std::vector<int> v;
    std::cout << "sizeof(vector<int>) = " << sizeof(v)
              << ", empty capacity = " << v.capacity() << '\n';
    const int* last_data = v.data();
    for (int i = 0; i < 100; ++i) {
        v.push_back(i);
        if (v.data() != last_data) {
            std::cout << "size " << v.size() << " -> capacity " << v.capacity() << '\n';
            last_data = v.data();
        }
    }
}
```
- Output (libstdc++ / GCC, x86-64; MSVC would show 1, 2, 3, 4, 6, 9, ...):
```
sizeof(vector<int>) = 24, empty capacity = 0
size 1 -> capacity 1
size 2 -> capacity 2
size 3 -> capacity 4
size 5 -> capacity 8
size 9 -> capacity 16
size 17 -> capacity 32
size 33 -> capacity 64
size 65 -> capacity 128
```
- Each line is a reallocation: new block, relocation of all elements, old block freed. 8 reallocations for 100 elements; `reserve(100)` would make it 1.

#### Example 2: The order of a reallocation
- A noisy type shows that the new element is constructed before the old ones are relocated.
```cpp
#include <iostream>
#include <vector>

struct Noisy {
    int id;
    Noisy(int i) : id(i) { std::cout << "ctor" << id << ' '; }
    Noisy(const Noisy& o) : id(o.id) { std::cout << "copy" << id << ' '; }
    Noisy(Noisy&& o) noexcept : id(o.id) { std::cout << "move" << id << ' '; }
    ~Noisy() { std::cout << "dtor" << id << ' '; }
};

int main() {
    std::vector<Noisy> v;
    v.reserve(2);
    v.emplace_back(1);
    v.emplace_back(2);
    std::cout << "\nat capacity, emplace_back(3): ";
    v.emplace_back(3);
    std::cout << "\nself push_back at capacity:   ";
    std::vector<Noisy> w;
    w.reserve(1);
    w.emplace_back(7);
    w.push_back(w[0]);                     // argument lives in the old block
    std::cout << "\nend of main: ";
}
```
- Output (libstdc++ / GCC, x86-64):
```
ctor1 ctor2 
at capacity, emplace_back(3): ctor3 move1 dtor1 move2 dtor2 
self push_back at capacity:   ctor7 copy7 move7 dtor7 
end of main: dtor7 dtor7 dtor1 dtor2 dtor3 
```
- `copy7` happens before `move7 dtor7`: the copy reads the old block while it is still alive.
- Remove `noexcept` from the move constructor and every `move` in the relocation becomes `copy` (details in Memory & Ownership, topic 02).

#### Example 3: Filling a vector correctly
- Three correct ways and the broken one, with the debug-mode safety net in mind.
```cpp
#include <iostream>
#include <vector>

std::vector<int> squares_broken(int n) {
    std::vector<int> r;
    r.reserve(n);
    for (int i = 0; i < n; ++i) r[i] = i * i;   // UB: no elements exist
    return r;
}

std::vector<int> squares_sized(int n) {
    std::vector<int> r(n);                        // n zeros, then overwrite
    for (int i = 0; i < n; ++i) r[i] = i * i;
    return r;
}

std::vector<int> squares_appended(int n) {
    std::vector<int> r;
    r.reserve(n);                                 // one allocation
    for (int i = 0; i < n; ++i) r.push_back(i * i);
    return r;
}

int main() {
    std::cout << "sized:    " << squares_sized(5).size() << '\n';
    std::cout << "appended: " << squares_appended(5).size() << '\n';
    std::cout << "broken:   " << squares_broken(5).size() << '\n';
}
```
- Output (normal build):
```
sized:    5
appended: 5
broken:   0
```
- With `-D_GLIBCXX_ASSERTIONS` the broken version aborts at its first `r[i]` with `Assertion '__n < this->size()' failed`; with only ASan it runs silently.

#### Example 4: What push_back and emplace_back actually cost
- Counts constructions, copies and moves per call.
```cpp
#include <iostream>
#include <string>
#include <vector>

struct Order {
    static inline int ctors = 0, copies = 0, moves = 0;
    std::string id;
    int qty;
    Order(std::string i, int q) : id(std::move(i)), qty(q) { ++ctors; }
    Order(const Order& o) : id(o.id), qty(o.qty) { ++copies; }
    Order(Order&& o) noexcept : id(std::move(o.id)), qty(o.qty) { ++moves; }
};

void report(const char* what) {
    std::cout << what << ": ctor " << Order::ctors << ", copy " << Order::copies
              << ", move " << Order::moves << '\n';
    Order::ctors = Order::copies = Order::moves = 0;
}

int main() {
    std::vector<Order> v;
    v.reserve(10);                                 // no reallocation noise
    v.push_back(Order("A1", 10));      report("push_back(Order(...))  ");
    v.emplace_back("A2", 20);          report("emplace_back(args)     ");
    Order existing("A3", 30);          report("make existing          ");
    v.emplace_back(existing);          report("emplace_back(existing) ");
    v.push_back(std::move(existing));  report("push_back(std::move(x))");
}
```
- Output:
```
push_back(Order(...))  : ctor 1, copy 0, move 1
emplace_back(args)     : ctor 1, copy 0, move 0
make existing          : ctor 1, copy 0, move 0
emplace_back(existing) : ctor 0, copy 1, move 0
push_back(std::move(x)): ctor 0, copy 0, move 1
```
- The only saving is one move, and only when you pass constructor arguments.

#### Example 5: Removing elements and giving memory back
- Erase-remove, C++20 `std::erase_if`, `clear`, `shrink_to_fit`.
```cpp
#include <algorithm>
#include <iostream>
#include <vector>

void show(const char* tag, const std::vector<int>& v) {
    std::cout << tag << " size " << v.size() << " cap " << v.capacity() << " :";
    for (int x : v) std::cout << ' ' << x;
    std::cout << '\n';
}

int main() {
    std::vector<int> v{1, 2, 3, 2, 5, 2, 7};
    auto new_end = std::remove(v.begin(), v.end(), 2);
    std::cout << "remove kept " << (new_end - v.begin()) << ", size still " << v.size()
              << '\n';
    v.erase(new_end, v.end());
    show("erase-remove   ", v);

    std::vector<int> w{1, 2, 3, 4, 5, 6, 7, 8};
    auto n = std::erase_if(w, [](int x) { return x % 2 == 0; });   // C++20
    std::cout << "erase_if removed " << n << '\n';
    show("after erase_if ", w);
    w.clear();
    show("after clear    ", w);
    w.shrink_to_fit();
    show("after shrink   ", w);
}
```
- Output (capacities: libstdc++ / GCC, x86-64):
```
remove kept 4, size still 7
erase-remove    size 4 cap 7 : 1 3 5 7
erase_if removed 4
after erase_if  size 4 cap 8 : 1 3 5 7
after clear     size 0 cap 8 :
after shrink    size 0 cap 0 :
```
- Erasing never reduces capacity; only `shrink_to_fit` (non-binding) or swapping with an empty vector does.

#### Example 6: vector<bool> is different
- Proxy references, no `data()`, and the fix.
```cpp
#include <iostream>
#include <type_traits>
#include <vector>

int main() {
    std::vector<bool> flags{false, false, false};
    auto a = flags[0];             // proxy, not bool
    bool b = flags[0];             // real copy
    flags[0] = true;
    std::cout << std::boolalpha << "proxy sees " << a << ", bool copy " << b << '\n';
    std::cout << "is bool& ? "
              << std::is_same_v<decltype(flags[0]), bool&> << '\n';
    // bool* p = &flags[0];        // error: cannot convert proxy* to bool*
    // flags.data();               // error: no member named 'data'

    std::vector<char> bytes(3, 0);  // real elements: addressable, thread-safe per element
    char* p = bytes.data();
    p[1] = 1;
    std::cout << "bytes[1] = " << int(bytes[1]) << ", sizeof(vector<bool>) = "
              << sizeof(flags) << '\n';
}
```
- Output (`sizeof` is libstdc++ / GCC, x86-64):
```
proxy sees true, bool copy false
is bool& ? false
bytes[1] = 1, sizeof(vector<bool>) = 40
```

#### Example 7: Stable handles into a growing collection
- Pointers into a vector die on growth; indices and `unique_ptr` elements do not.
```cpp
#include <iostream>
#include <memory>
#include <vector>

struct Session { int id; };

int main() {
    std::vector<Session> flat;
    std::vector<std::unique_ptr<Session>> boxed;
    flat.push_back({1});
    boxed.push_back(std::make_unique<Session>(Session{1}));

    std::size_t idx = 0;                      // index: survives reallocation
    Session* stable = boxed[0].get();         // heap object never moves
    const Session* raw = &flat[0];            // dies on the next reallocation

    for (int i = 2; i <= 100; ++i) {
        flat.push_back({i});
        boxed.push_back(std::make_unique<Session>(Session{i}));
    }
    std::cout << "by index: " << flat[idx].id << ", via unique_ptr: " << stable->id
              << ", raw still points at flat[0]? " << (raw == &flat[0]) << '\n';
}
```
- Output:
```
by index: 1, via unique_ptr: 1, raw still points at flat[0]? 0
```
- `raw` is only compared, never dereferenced (dereferencing would be a use-after-free; even comparing an invalid pointer is implementation-defined, harmless on mainstream platforms).
- Trade-off: `vector<unique_ptr<T>>` costs one allocation per element and a pointer chase per access; `std::deque` (topic 07) keeps element addresses stable under `push_back` without that cost.

### QUICK_REFERENCE: Cheat Sheet

#### Operations and costs
| Operation | Complexity | Notes |
|---|---|---|
| `v[i]`, `at(i)`, `data()` | O(1) | `at` throws `out_of_range` |
| `push_back` / `emplace_back` | Amortized O(1) | Reallocation at `size == capacity` |
| `insert` / `erase` in the middle | O(n) | Shifts later elements |
| `pop_back` | O(1) | `back()` / `pop_back` on empty: UB |
| `reserve(n)` | O(size) if it grows | Never shrinks |
| `resize(n)` | O(abs(n - size)) | Value-initializes new elements |
| `clear()` | O(size) destructors | Keeps capacity |
| Move construct / move assign / `swap` | O(1) | Steals three pointers |

#### Implementation facts (not guaranteed by C++)
| Fact | libstdc++ / GCC, x86-64 |
|---|---|
| `sizeof(std::vector<T>)` | 24 |
| Growth factor | 2x (MSVC: 1.5x) |
| Empty vector capacity, `data()` | 0, `nullptr` |
| Reallocation order | New element first, then relocate, then destroy old |
| `shrink_to_fit` | Honoured (reallocates to exact size) |
| `sizeof(std::vector<bool>)` | 40 |

#### Version notes
| Version | Feature |
|---|---|
| C++11 | `emplace_back`, `shrink_to_fit`, `data()`, move semantics |
| C++17 | `emplace_back` returns a reference; CTAD `std::vector v{1, 2}` |
| C++20 | `std::erase` / `std::erase_if`; parenthesized aggregate init in `emplace_back`; `constexpr std::vector` (transient) |
| C++23 | `append_range`, `insert_range`, `assign_range`, construction `from_range` |
| C++26 | `std::inplace_vector` (fixed-capacity, no heap) |

#### Interview one-liners
| Question | Answer |
|---|---|
| size vs capacity? | Constructed elements vs allocated slots |
| Growth factor? | Geometric, implementation-defined (2x GCC/Clang, 1.5x MSVC) |
| Why geometric? | Amortized O(1) `push_back` |
| `reserve(100); v[50] = 1;`? | UB; size is 0 (ASan silent, `_GLIBCXX_ASSERTIONS` aborts) |
| `push_back` at full capacity? | Always reallocates; all borrows die |
| Reallocation order in libstdc++? | Construct new element, relocate old, destroy old, free |
| Is `v.push_back(v[0])` safe? | Yes, required to work |
| Copy or move on growth? | Move if `noexcept` (or not copyable), else copy |
| `emplace_back` vs `push_back`? | Saves one move only when passing constructor arguments |
| `vector<int>{10}` size? | 1 |
| Does `clear()` free memory? | No; capacity stays |
| `std::remove` changes size? | No; erase the tail or use `std::erase` (C++20) |
| `vector<bool>`? | Bit-packed, proxy references, no `data()`, not a real container |
| Need stable addresses? | Indices, `deque`, or `vector<unique_ptr<T>>` |
