## TOPIC: Move Semantics and std::move

### PRACTICE_TASKS: Move Semantics Analysis

#### Q1
```cpp
std::string s1 = "hello";
std::string s2 = std::move(s1);
std::cout << s1.length();
```

**Answer:**
```
0 (likely, implementation-dependent)
```

**Explanation:**
- `std::move(s1)` casts s1 to rvalue reference
- String's move constructor transfers ownership of internal buffer from s1 to s2
- s2 now contains "hello", s1 is in moved-from state
- Moved-from string is valid but unspecified state (typically empty)
- `s1.length()` likely returns 0 (most implementations leave empty)
- s1 can be safely destroyed or reassigned
- **Key Concept:** Moved-from objects are in valid but unspecified state; typically empty for strings

---

#### Q2
```cpp
class A {
    int* ptr;
public:
    A() : ptr(new int(42)) { }
    A(A&& other) noexcept : ptr(other.ptr) { }
    ~A() { delete ptr; }
};

A a1;
A a2 = std::move(a1);
```

**Answer:**
```
Undefined behavior (double delete)
```

**Explanation:**
- Move constructor steals pointer: `ptr(other.ptr)`
- BUG: Doesn't nullify `other.ptr`
- Both a1.ptr and a2.ptr point to same memory
- When a2 destroyed: deletes memory
- When a1 destroyed: tries to delete already-freed memory (double delete!)
- **Fix:** Add `other.ptr = nullptr;` to move constructor
- **Key Concept:** Move constructors must leave source in valid state; null stolen resources

---

#### Q3
```cpp
const std::vector<int> cv = {1, 2, 3};
std::vector<int> v = std::move(cv);
```

**Answer:**
```
Calls copy constructor (not move)
```

**Explanation:**
- `cv` is `const vector<int>`
- `std::move(cv)` produces `const vector<int>&&`
- Move constructor signature: `vector(vector&& other)` (non-const)
- `const vector&&` cannot bind to `vector&&` (drops const)
- Overload resolution falls back to copy constructor: `vector(const vector& other)`
- Vector copied, not moved
- **Key Concept:** const objects cannot be moved (moving requires modifying source); always copied

---

#### Q4
```cpp
int x = 10;
int y = std::move(x);
std::cout << x << " " << y;
```

**Answer:**
```
10 10
```

**Explanation:**
- `std::move(x)` casts int to rvalue reference
- For primitive types (int, float, etc.), "moving" is identical to copying
- No move constructor/assignment for built-in types - just copy
- Both x and y contain 10
- x unchanged after "move"
- Move semantics only benefit types with resources (pointers, handles)
- **Key Concept:** Moving primitives = copying; std::move has no effect on primitive values

---

#### Q5
```cpp
std::unique_ptr<int> p1 = std::make_unique<int>(42);
std::unique_ptr<int> p2 = p1;
```

**Answer:**
```
Compilation error
```

**Explanation:**
- unique_ptr enforces exclusive ownership (move-only type)
- Copy constructor deleted: `unique_ptr(const unique_ptr&) = delete`
- `p2 = p1` attempts to copy (compilation error!)
- **Fix:** Use std::move: `std::unique_ptr<int> p2 = std::move(p1);`
- After move, p1 becomes nullptr, p2 owns the int
- Move-only types prevent accidental copies
- **Key Concept:** unique_ptr is move-only; copy constructor deleted to enforce single ownership

---

#### Q6
```cpp
std::vector<int> getVector() {
    std::vector<int> v = {1, 2, 3};
    return std::move(v);
}
```

**Answer:**
```
Compiles but suboptimal (pessimization)
```

**Explanation:**
- Without std::move: compiler can apply RVO (Return Value Optimization)
- RVO constructs return value directly in caller's memory (zero copies)
- `return std::move(v)` prevents RVO - forces move constructor
- Move is faster than copy but slower than elision (no operation)
- Named return values automatically treated as rvalues in return statement
- **Correct:** Just `return v;` (enables RVO or automatic move)
- **Key Concept:** Never use std::move on return values; prevents RVO and automatic move

---

#### Q7
```cpp
std::string&& getRvalue() {
    std::string s = "temp";
    return std::move(s);
}

int main() {
    std::string result = getRvalue();
}
```

**Answer:**
```
Undefined behavior (dangling reference)
```

**Explanation:**
- `s` is local variable in getRvalue()
- `return std::move(s)` returns rvalue reference to s
- When function returns, s destroyed (end of scope)
- Return type `string&&` is reference, not value
- `result` initialized from dangling reference to destroyed object
- Undefined behavior - may crash, garbage, or appear to work
- **Fix:** Return by value: `std::string getRvalue()` (enables RVO)
- **Key Concept:** Never return references to local variables; they don't survive function return

---

#### Q8
```cpp
void process(std::string s) { }

std::string str = "test";
process(std::move(str));
std::cout << str.length();
```

**Answer:**
```
0 (likely, implementation-dependent)
```

**Explanation:**
- `std::move(str)` casts to rvalue
- `process` parameter by value, calls move constructor
- String moved from str into function parameter
- str left in moved-from state (typically empty)
- After function returns, parameter destroyed, str remains in moved-from state
- `str.length()` likely returns 0
- str still valid object, can be reassigned: `str = "new";`
- **Key Concept:** Passing std::move to by-value parameter moves object; source becomes moved-from

---

#### Q9
```cpp
std::vector<std::string> vec = {"a", "b", "c"};
std::string s = std::move(vec[1]);
std::cout << vec.size() << " " << vec[1].length();
```

**Answer:**
```
3 0
```

**Explanation:**
- `vec[1]` returns reference to element "b"
- `std::move(vec[1])` moves string from vector element to s
- vec[1] now in moved-from state (empty string)
- Vector size unchanged (3) - element not removed, just hollowed out
- `vec[1].length()` returns 0 (empty string)
- To remove: need `vec.erase(vec.begin() + 1);`
- **Key Concept:** Moving from container element leaves element in moved-from state; doesn't remove it

---

#### Q10
```cpp
class Buffer {
    int* data;
public:
    Buffer& operator=(Buffer&& other) noexcept {
        delete[] data;
        data = other.data;
        other.data = nullptr;
        return *this;
    }
};

Buffer b(100);
b = std::move(b);
```

**Answer:**
```
Undefined behavior (self-move deletes own data)
```

**Explanation:**
- Self-move: `b = std::move(b)` where this == &other
- `delete[] data` deletes b's own data
- `data = other.data` assigns already-deleted pointer to itself
- `other.data = nullptr` nulls b's data pointer
- b now has nullptr, original data deleted
- BUG: No self-assignment check
- **Fix:** Add check: `if (this == &other) return *this;`
- **Key Concept:** Always check for self-assignment in move assignment; self-move is legal C++

---

#### Q11
```cpp
std::string s1 = "hello";
std::string&& rref = std::move(s1);
std::cout << s1;
```

**Answer:**
```
hello
```

**Explanation:**
- `std::move(s1)` is just a cast to rvalue reference
- std::move itself does NOT modify s1 - it's purely a type cast
- `rref` binds to s1 (as rvalue reference)
- s1 remains "hello" - not moved yet
- Move only happens when rvalue is USED (move ctor/assignment called)
- Just binding rvalue ref doesn't trigger move
- s1 unchanged, prints "hello"
- **Key Concept:** std::move is just a cast; actual move happens when moved-from

---

#### Q12
```cpp
struct Data {
    std::string name;
    Data(Data&& other) : name(other.name) { }
};

Data d1{"test"};
Data d2 = std::move(d1);
std::cout << d1.name;
```

**Answer:**
```
test (name was copied, not moved)
```

**Explanation:**
- Move constructor called for Data
- BUG: `name(other.name)` copies name member (lvalue copy ctor)
- `other.name` is lvalue (has name), so copy constructor called
- Should be: `name(std::move(other.name))` to move the member
- d1.name still contains "test" (wasn't moved)
- Common mistake: forgetting std::move for members in move constructor
- **Fix:** Use std::move for each member
- **Key Concept:** In move constructors, explicitly move each member with std::move

---

#### Q13
```cpp
std::vector<int> v1 = {1, 2, 3};
std::vector<int> v2;
v2 = std::move(v1);
v1.push_back(4);
```

**Answer:**
```
Compiles and runs successfully
```

**Explanation:**
- v1 moved to v2, v1 in moved-from state
- Moved-from state is valid but unspecified (typically empty vector)
- C++ standard: moved-from objects remain valid
- Can call any operation with no preconditions (size, empty, clear, push_back)
- `v1.push_back(4)` works - adds to empty vector
- v1 now contains {4}, v2 contains {1, 2, 3}
- Can safely reuse moved-from objects
- **Key Concept:** Moved-from objects are valid; can be reassigned or reused safely

---

#### Q14
```cpp
void func(std::vector<int>&& v) {
    std::vector<int> local = v;
}
```

**Answer:**
```
Copies vector (does not move)
```

**Explanation:**
- Parameter `v` is rvalue reference type `vector<int>&&`
- BUT `v` is a named parameter (has name inside function)
- Named variables are always lvalues (even if type is rvalue ref)
- `local = v` calls copy constructor (v is lvalue)
- **Fix:** `std::vector<int> local = std::move(v);` to actually move
- This is why std::move exists - to re-cast named rvalue refs
- **Key Concept:** Named rvalue reference parameters are lvalues; must use std::move to move

---

#### Q15
```cpp
std::string s1 = "hello";
std::string s2 = std::move(s1);
std::string s3 = std::move(s1);
```

**Answer:**
```
Compiles; s2="hello", s3="" (likely)
```

**Explanation:**
- First move: s2 gets "hello", s1 becomes moved-from (empty)
- Second move: s3 moves from already-moved-from s1
- Moving from moved-from object is legal C++
- Result: s3 typically empty (moving empty string gives empty string)
- No undefined behavior - standard allows this
- Both moves are valid operations
- **Key Concept:** Can move from moved-from objects; legal but usually gives empty result

---

#### Q16
```cpp
int x = 42;
int&& rref = std::move(x);
int y = std::move(rref);
std::cout << x;
```

**Answer:**
```
42
```

**Explanation:**
- `std::move(x)` casts x to rvalue
- `rref` binds to x as rvalue reference
- `int y = std::move(rref)` moves from rref
- For primitive types, move = copy (no special move semantics)
- Both x and y contain 42
- x unchanged by "move" operations
- Primitives don't have resources to transfer
- **Key Concept:** Primitives don't have move semantics; moving copies the value unchanged

---

#### Q17
```cpp
std::shared_ptr<int> p1 = std::make_shared<int>(42);
std::shared_ptr<int> p2 = std::move(p1);
if (p1) std::cout << "p1 valid";
else std::cout << "p1 null";
```

**Answer:**
```
p1 null
```

**Explanation:**
- shared_ptr has move constructor that transfers ownership
- Move transfers control block and pointer to p2
- p1 set to nullptr (moved-from state)
- p2 now owns the int(42), reference count still 1
- `if (p1)` checks if p1 is nullptr (operator bool)
- p1 is nullptr, prints "p1 null"
- Different from copy: copy increments ref count, both valid
- **Key Concept:** Moving shared_ptr transfers ownership; source becomes nullptr

---

#### Q18
```cpp
std::vector<std::unique_ptr<int>> vec;
vec.push_back(std::make_unique<int>(10));
std::unique_ptr<int> p = vec[0];
```

**Answer:**
```
Compilation error
```

**Explanation:**
- `vec[0]` returns reference to unique_ptr in vector
- `p = vec[0]` attempts to copy unique_ptr
- unique_ptr copy constructor deleted (move-only type)
- **Fix:** `std::unique_ptr<int> p = std::move(vec[0]);`
- After move, vec[0] becomes nullptr (empty unique_ptr)
- Vector still has element, but it's nullptr
- **Key Concept:** unique_ptr in containers must be explicitly moved; cannot copy

---

#### Q19
```cpp
std::string create() {
    std::string s = "temp";
    return s;
}

std::string result = create();
```

**Answer:**
```
Compiles and runs efficiently
```

**Explanation:**
- `return s` from function with local variable
- Compiler applies RVO (Return Value Optimization)
- RVO constructs string directly in result's memory location
- Zero copies, zero moves - most efficient
- If RVO can't apply, automatic move (s treated as rvalue in return)
- Never need std::move on local return values
- Modern C++ (C++17+) mandatory copy elision for temporaries
- **Key Concept:** RVO eliminates copies/moves entirely; most efficient return pattern

---

#### Q20
```cpp
class A {
public:
    A(A&&) noexcept { std::cout << "move\n"; }
    A(const A&) { std::cout << "copy\n"; }
};

const A a1;
A a2 = std::move(a1);
```

**Answer:**
```
copy
```

**Explanation:**
- `a1` is `const A`
- `std::move(a1)` produces `const A&&`
- Move constructor: `A(A&&)` expects non-const `A&&`
- Cannot bind `const A&&` to `A&&` (drops const)
- Overload resolution falls back to copy constructor: `A(const A&)`
- Copy constructor accepts const, so it's called
- const objects cannot be moved (moving modifies source)
- **Key Concept:** const objects always copied, never moved; move requires modifying source

---
