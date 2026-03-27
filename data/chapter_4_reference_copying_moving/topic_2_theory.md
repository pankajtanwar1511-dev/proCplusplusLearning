## TOPIC: Move Semantics and std::move

### THEORY_SECTION: Understanding Move Semantics

#### 1. The Problem Move Semantics Solves and What It Is

Before C++11, **copying was the only way to transfer object ownership**, leading to massive performance overhead when working with resource-owning types and temporary objects.

**Performance Problems Before Move Semantics (C++03)**

| Scenario | Problem | Performance Impact | Example |
|----------|---------|-------------------|---------|
| Returning large objects | Forced deep copy of all data | O(n) copy for n elements | `vector<int>(1M elements)` → ~4MB copied |
| Passing temporaries | Temporary copied then destroyed | 2× memory, allocation overhead | `process(createBigObject())` |
| Container reallocation | All elements copied to new buffer | O(n) copies during `vector::push_back` | Growing vector copies all elements |
| Swap operations | Three copies required | `temp=a; a=b; b=temp` all deep copy | Sorting large objects |
| Function return optimization | Not guaranteed before C++17 | Compiler-dependent | RVO wasn't mandated |

**Code Example: The C++03 Problem**

```cpp
// Pre-C++11: Expensive copying even for temporaries
std::vector<int> createLargeVector() {
    std::vector<int> result(1000000);  // 4MB allocation
    // ... fill with data ...
    return result;  // ❌ C++03: Copies entire 4MB back to caller
                    // Then destroys original
}

std::vector<int> data = createLargeVector();
// Total: 2 allocations, 1 million element copies, 1 deallocation
// Waste: Original vector destroyed immediately after expensive copy
```

**What Move Semantics Is**

**Move semantics** is a C++11 feature that enables **transferring ownership** of resources from one object to another without copying, by "stealing" internal pointers/handles and leaving the source in a valid-but-empty state.

**Move Semantics Core Concepts**

| Concept | Description | Implementation | Key Benefit |
|---------|-------------|----------------|-------------|
| **Resource Transfer** | Steal pointers/handles instead of duplicating | Copy pointer, set source to nullptr | O(1) instead of O(n) |
| **Rvalue Detection** | Compiler identifies temporaries | Function overload for `T&&` | Automatic optimization |
| **Valid-But-Unspecified** | Source object remains usable | Must be destructible and assignable | Safe cleanup guaranteed |
| **Move Constructor** | `T(T&& other) noexcept` | Steals resources, nullifies source | Efficient object creation |
| **Move Assignment** | `T& operator=(T&& other) noexcept` | Cleans up old, steals new | Efficient object replacement |

**Move vs Copy Comparison**

| Aspect | Copy Semantics (`const T&`) | Move Semantics (`T&&`) |
|--------|---------------------------|------------------------|
| **Resource Handling** | Allocates new resources, duplicates data | Transfers existing resources (steals pointers) |
| **Source Object After** | Unchanged, fully usable | Valid but unspecified (typically empty) |
| **Performance** | O(n) for n elements/bytes | O(1) (constant time) |
| **When Used** | Source is persistent lvalue | Source is temporary rvalue |
| **Memory Overhead** | 2× memory during operation | No additional memory |
| **Typical Time** | Milliseconds for large objects | Nanoseconds (few pointer operations) |
| **Source State** | Preserved completely | Nullified/empty (safe to destroy) |
| **Parameter Type** | `const T&` | `T&&` |
| **Member Function** | Copy constructor/assignment | Move constructor/assignment |

**Code Example: Move Semantics Solution**

```cpp
// C++11+: Move semantics enables efficient transfer
std::vector<int> createLargeVector() {
    std::vector<int> result(1000000);  // 4MB allocation
    // ... fill with data ...
    return result;  // ✅ C++11+: Move or RVO (zero copies!)
}

std::vector<int> data = createLargeVector();
// Total: 1 allocation, 0 copies (RVO) or 1 pointer move
// Benefit: ~1000× faster for large vectors
```

---

#### 2. How std::move Works and When Moves Happen

**std::move** is one of the most misunderstood features in C++. Despite its name, **it doesn't move anything**—it's purely a cast.

**What std::move Actually Does**

| Aspect | Reality | Common Misconception |
|--------|---------|---------------------|
| **Function** | Type cast to rvalue reference | Actually moves/deletes the object |
| **Implementation** | `static_cast<T&&>(arg)` | Complex move operation |
| **Effect on Object** | None—object unchanged | Object is modified/invalidated |
| **When Moving Happens** | In move constructor/assignment | During `std::move` call |
| **Return Type** | Rvalue reference (`T&&`) | Moved object |
| **Purpose** | Permission to move | Action of moving |
| **noexcept** | Always `noexcept` | May throw exceptions |

**std::move Implementation (Simplified)**

```cpp
template<typename T>
typename std::remove_reference<T>::type&& move(T&& t) noexcept {
    // Just a cast—no actual moving happens here!
    return static_cast<typename std::remove_reference<T>::type&&>(t);
}
```

**Code Example: std::move is Just a Cast**

```cpp
std::string s1 = "hello";

// Step 1: std::move(s1) - just casts lvalue to rvalue reference
std::string&& rref = std::move(s1);
std::cout << s1 << "\n";  // Prints "hello" - s1 unchanged!

// Step 2: Move constructor executes - NOW the actual move happens
std::string s2 = std::move(s1);  // Move constructor called here
std::cout << s1.length() << "\n";  // Likely 0 - NOW s1 is moved-from
```

**When Move Operations Are Automatically Used**

| Situation | Triggers Move? | Example | Benefit |
|-----------|----------------|---------|---------|
| **Returning local objects** | ✅ Yes (or RVO) | `return localVector;` | Avoid copy on return |
| **Passing temporaries** | ✅ Yes | `func(std::string("temp"))` | Temporary directly moved |
| **Explicit std::move** | ✅ Yes | `vec.push_back(std::move(obj))` | Manual ownership transfer |
| **Initializing from temporary** | ✅ Yes | `std::vector v = createVec();` | Direct construction |
| **Container reallocation** | ✅ Yes (if `noexcept`) | `vec.push_back(...)` triggers grow | Fast element transfer |
| **Algorithm operations** | ✅ Yes (if `noexcept`) | `std::sort`, `std::swap` | Efficient shuffling |
| **Returning lvalue** | ❌ No | `return globalVector;` | Cannot steal from persistent object |
| **Const object** | ❌ No (copies) | `std::move(const_obj)` | Const prevents modification |

**Code Example: Automatic Move Selection**

```cpp
std::vector<std::string> vec;

std::string s1 = "persistent";
std::string s2 = "temporary";

// Copy: s1 is lvalue, compiler calls copy constructor
vec.push_back(s1);
std::cout << "s1: " << s1 << "\n";  // Still "persistent"

// Move: explicit std::move casts s2 to rvalue
vec.push_back(std::move(s2));
std::cout << "s2: " << s2 << "\n";  // Empty (moved-from)

// Move: temporary is rvalue, move constructor called automatically
vec.push_back(std::string("rvalue temp"));  // No std::move needed!
```

---

#### 3. Valid-But-Unspecified State and the Rule of Five

After an object is moved from, C++ guarantees it remains in a **valid but unspecified state**—a critically important concept for safe move semantics.

**Valid-But-Unspecified State Guarantees**

| Requirement | What It Means | Safe Operations | Unsafe Assumptions |
|-------------|---------------|----------------|-------------------|
| **Valid** | All operations remain legal | Destructor, assignment, methods | None—state is unspecified |
| **Destructible** | Destructor can run safely | `obj.~Type()` or automatic | N/A |
| **Assignable** | Can assign new value | `obj = newValue;` | N/A |
| **Method Callable** | Methods don't crash | `obj.clear()`, `obj.size()` | Returned values are unspecified |
| **Unspecified Contents** | Don't rely on specific state | N/A | Assuming empty, null, or any specific value |
| **Not Necessarily Empty** | May or may not be empty | N/A | `if (vec.empty())` after move |
| **Not Necessarily Null** | Pointers may or may not be null | N/A | `if (ptr == nullptr)` after move |

**Moved-From State by Type**

| Type | Typical State (Not Guaranteed!) | Safe Operations After Move | Unsafe Operations |
|------|--------------------------------|---------------------------|-------------------|
| `std::string` | Usually empty (`""`, size=0) | Assign, clear, destroy | Reading contents |
| `std::vector<T>` | Usually empty (size=0, capacity=0) | Assign, clear, push_back, destroy | Accessing elements |
| `std::unique_ptr<T>` | Guaranteed `nullptr` | Assign, reset, destroy, boolean check | Dereferencing |
| `std::shared_ptr<T>` | Guaranteed `nullptr` | Assign, reset, destroy, boolean check | Dereferencing |
| `int`, `double`, primitives | Unchanged (same value) | All operations | N/A (trivially copyable) |
| User-defined types | Implementation-defined | Destroy, assign | Reading members |

**Code Example: Valid-But-Unspecified State**

```cpp
std::vector<int> v1 = {1, 2, 3, 4, 5};
std::vector<int> v2 = std::move(v1);

// ✅ SAFE: Assignment works
v1 = {10, 20, 30};
std::cout << "v1 after reassignment: " << v1.size() << "\n";  // 3

// ✅ SAFE: Methods can be called
v1.clear();
v1.push_back(100);

// ❌ UNSAFE: Don't assume specific state
// if (v1.empty()) { ... }  // Not guaranteed to be empty before reassignment!
// int x = v1[0];  // Undefined if not reassigned first
```

**The Rule of Five**

When implementing move semantics for resource-owning classes, you must define **all five special member functions** to ensure correctness.

**Rule of Five: The Five Special Member Functions**

| # | Function | Signature | Purpose | When Called |
|---|----------|-----------|---------|-------------|
| 1 | **Destructor** | `~T()` | Clean up resources | Object destroyed |
| 2 | **Copy Constructor** | `T(const T& other)` | Deep copy resources | `T b = a;` (lvalue) |
| 3 | **Copy Assignment** | `T& operator=(const T&)` | Replace with deep copy | `b = a;` (lvalue) |
| 4 | **Move Constructor** | `T(T&& other) noexcept` | Steal resources | `T b = std::move(a);` |
| 5 | **Move Assignment** | `T& operator=(T&&) noexcept` | Clean up old, steal new | `b = std::move(a);` |

**Why All Five Are Needed**

| If You Define... | Compiler Behavior | Problem If You Don't Define Others |
|-----------------|-------------------|-----------------------------------|
| **Destructor** | Doesn't generate move operations | Misses move optimization, uses slow copies |
| **Copy Constructor** | Doesn't generate moves | Copies when moves would be better |
| **Copy Assignment** | Doesn't generate moves | Copies when moves would be better |
| **Move Constructor** | Deletes copy constructor (usually) | Cannot copy when needed |
| **Move Assignment** | Deletes copy assignment (usually) | Cannot copy assign when needed |

**Rule of Five Implementation Template**

```cpp
class Resource {
    int* data;
    size_t size;

public:
    // Constructor
    Resource(size_t s) : size(s), data(new int[s]) { }

    // 1. Destructor
    ~Resource() {
        delete[] data;
    }

    // 2. Copy Constructor - Deep copy
    Resource(const Resource& other)
        : size(other.size), data(new int[other.size]) {
        std::copy(other.data, other.data + size, data);
    }

    // 3. Copy Assignment - Deep copy with self-check
    Resource& operator=(const Resource& other) {
        if (this != &other) {
            delete[] data;
            size = other.size;
            data = new int[size];
            std::copy(other.data, other.data + size, data);
        }
        return *this;
    }

    // 4. Move Constructor - Steal resources
    Resource(Resource&& other) noexcept
        : data(other.data), size(other.size) {
        other.data = nullptr;  // ✅ Nullify source
        other.size = 0;
    }

    // 5. Move Assignment - Clean up, steal, nullify
    Resource& operator=(Resource&& other) noexcept {
        if (this != &other) {  // ✅ Self-assignment check
            delete[] data;      // Clean up old resources
            data = other.data;  // Steal
            size = other.size;
            other.data = nullptr;  // Nullify
            other.size = 0;
        }
        return *this;
    }
};
```

**Rule of Zero - The Preferred Alternative**

Modern C++ strongly prefers the **Rule of Zero**: use RAII types (smart pointers, containers) so the compiler generates all special members correctly.

**Rule of Five vs Rule of Zero**

| Approach | Manual Code Needed | Performance | Safety | Preferred? |
|----------|-------------------|-------------|--------|------------|
| **Rule of Five** | All 5 functions | Optimal (if correct) | Error-prone | Only when necessary |
| **Rule of Zero** | None (all defaulted) | Optimal | Safe (compiler-generated) | ✅ Strongly preferred |

**Code Example: Rule of Zero with Smart Pointers**

```cpp
// ❌ Rule of Five: Manual resource management
class ManualResource {
    int* data;
public:
    ~ManualResource() { delete[] data; }
    // + need copy constructor, copy assignment, move constructor, move assignment
};

// ✅ Rule of Zero: RAII types handle everything
class ModernResource {
    std::unique_ptr<int[]> data;
    // Compiler generates all 5 special functions correctly!
    // Move-only by default (perfect for exclusive ownership)
};
```

**Key Takeaways**:
1. **Move semantics** = transfer ownership (O(1)) instead of copy (O(n))
2. **std::move** = cast to rvalue reference (permission), not action
3. **Moved-from state** = valid (safe) but unspecified (don't read)
4. **Rule of Five** = all or nothing for correctness
5. **Rule of Zero** = preferred approach using RAII types

---

### EDGE_CASES: Common Pitfalls and Gotchas

#### Edge Case 1: std::move Doesn't Actually Move

The most common misconception is that calling `std::move` moves the object. In reality, `std::move` is just a cast that enables moving.

```cpp
std::string s1 = "hello";
std::string s2 = std::move(s1);  // Move constructor is called here

// s1 is still a valid object
std::cout << s1.length() << "\n";  // ✅ Legal: probably prints 0
s1 = "world";                       // ✅ Legal: assignment works
std::cout << s1 << "\n";            // ✅ Legal: prints "world"
```

After `std::move(s1)`, the variable `s1` still exists and is perfectly usable. The move constructor of `std::string` was called, which likely transferred the internal buffer ownership to `s2` and left `s1` empty. But `s1` remains a valid, destructible, assignable object.

The key insight: `std::move` is permission, not action. The actual move happens in the move constructor, and what "moving" means is type-dependent.

#### Edge Case 2: Moving From const Objects

Moving requires modifying the source object (typically setting pointers to nullptr), which is impossible with const objects.

```cpp
const std::vector<int> cv = {1, 2, 3};
std::vector<int> v = std::move(cv);  // ❌ Calls COPY constructor, not move

void take(std::vector<int>&& vec) { }
// take(std::move(cv));  // ❌ Error: cannot convert const vector&& to vector&&
```

When you `std::move` a const object, you get `const T&&`, which doesn't match the signature of move constructors (which expect `T&&`). The compiler falls back to the copy constructor. This defeats the purpose of moving and is usually a sign of incorrect code.

The practical implication: don't mark objects as const if you intend to move from them. Const is for objects whose values should never change, which is incompatible with move semantics.

#### Edge Case 3: Returning Local Variables

One of the most dangerous patterns is returning references (including rvalue references) to local variables.

```cpp
std::string&& dangerous() {
    std::string local = "temporary";
    return std::move(local);  // ❌ Undefined Behavior
}

int main() {
    std::string&& ref = dangerous();  // ref now dangles
    std::cout << ref;  // ❌ UB: accessing destroyed object
}
```

Even though `std::move(local)` converts it to an rvalue reference, this doesn't prevent `local` from being destroyed when the function returns. The returned reference points to destroyed stack memory, causing undefined behavior when accessed.

The correct approach is to return by value, letting the compiler apply RVO or move automatically:

```cpp
std::string safe() {
    std::string local = "temporary";
    return local;  // ✅ Compiler optimizes (RVO or move)
}
```

#### Edge Case 4: std::move in Return Statements Can Hurt Performance

Adding `std::move` to return statements often seems logical but can actually prevent optimization.

```cpp
std::vector<int> bad() {
    std::vector<int> result = {1, 2, 3};
    return std::move(result);  // ❌ Prevents RVO
}

std::vector<int> good() {
    std::vector<int> result = {1, 2, 3};
    return result;  // ✅ Allows RVO (Copy Elision)
}
```

When you write `return result;`, the compiler can apply **Return Value Optimization (RVO)**, constructing the object directly in the caller's space with zero copies or moves. But `return std::move(result);` forces a move construction, which, while fast, is still slower than RVO.

Modern compilers (C++17+) guarantee copy elision in many cases, making explicit `std::move` in returns not just unnecessary but harmful. The rule: never use `std::move` on local objects being returned by value.

#### Edge Case 5: Moving Container Elements

When you move an element from a container, the container element is left in a valid but unspecified state, which can lead to surprising behavior.

```cpp
std::vector<std::string> vec = {"one", "two", "three"};
std::string s = std::move(vec[1]);  // Move from vec[1]

// vec[1] is now empty but still exists in the vector
std::cout << vec.size() << "\n";     // Prints 3 (size unchanged)
std::cout << vec[1].length() << "\n"; // Likely 0 (empty but valid)

// The moved-from element is still in the vector!
for (const auto& str : vec) {
    std::cout << "[" << str << "]\n";  // Prints [one][]three]
}
```

Moving from a container element doesn't remove it—it just leaves an empty-but-valid element in place. If you want to remove elements, you must explicitly erase them or use algorithms like `std::remove_if`.

#### Edge Case 6: Self-Move Assignment

Moving an object to itself should be safe but can cause problems if not handled correctly.

```cpp
class Buffer {
    int* data;
public:
    Buffer& operator=(Buffer&& other) noexcept {
        delete[] data;              // ❌ Dangerous if this == &other
        data = other.data;
        other.data = nullptr;
        return *this;
    }
};

Buffer b(100);
b = std::move(b);  // Self-move: data is deleted then set to nullptr!
```

The problem: if `this == &other`, we delete our data, then try to copy from ourselves, copying the nullptr we just set. The standard requires self-move to leave the object in a valid state, so we must check for self-assignment:

```cpp
Buffer& operator=(Buffer&& other) noexcept {
    if (this != &other) {  // ✅ Check for self-assignment
        delete[] data;
        data = other.data;
        other.data = nullptr;
    }
    return *this;
}
```

For types using smart pointers or standard containers, self-move is automatically safe because these types handle it correctly.

#### Edge Case 7: Moving Non-Movable Types

Not all types support move semantics. Some types explicitly delete their move operations or only support copying.

```cpp
class NonMovable {
public:
    NonMovable() = default;
    NonMovable(const NonMovable&) = default;  // Copy is OK
    NonMovable(NonMovable&&) = delete;        // Move is deleted
};

NonMovable a;
NonMovable b = std::move(a);  // ❌ Error: move constructor is deleted
NonMovable c = a;             // ✅ OK: uses copy constructor
```

Even if you call `std::move`, if the move constructor is deleted or unavailable, the compiler falls back to copying (if available) or produces an error. Some types (like `std::atomic`) deliberately delete move operations to ensure safety.

#### Edge Case 8: Moved-From Objects in Containers

After moving from an object stored in a container, the container still contains that object in its moved-from state.

```cpp
std::vector<std::unique_ptr<int>> vec;
vec.push_back(std::make_unique<int>(42));
vec.push_back(std::make_unique<int>(100));

auto ptr = std::move(vec[0]);  // Move ownership out
// vec[0] now holds nullptr (moved-from unique_ptr)

std::cout << vec.size() << "\n";  // Still 2 elements
if (vec[0] == nullptr) {
    std::cout << "vec[0] is null\n";  // Will print
}
```

The container size doesn't change—you've just left a moved-from element in place. For `unique_ptr`, moved-from means `nullptr`. For strings or vectors, it typically means empty. Always be aware that moving doesn't remove or replace elements.

---

### CODE_EXAMPLES: Implementing Move Semantics

#### Example 1: Basic Move Constructor Implementation

```cpp
#include <iostream>
#include <cstring>

class Buffer {
    char* data;
    size_t size;
    
public:
    // Constructor
    Buffer(size_t s) : size(s) {
        data = new char[size];
        std::cout << "Constructed Buffer of size " << size << "\n";
    }
    
    // Destructor
    ~Buffer() {
        delete[] data;
        std::cout << "Destroyed Buffer\n";
    }
    
    // Copy constructor (deep copy)
    Buffer(const Buffer& other) : size(other.size) {
        data = new char[size];
        std::memcpy(data, other.data, size);
        std::cout << "Copy constructed Buffer\n";
    }
    
    // Move constructor (transfer ownership)
    Buffer(Buffer&& other) noexcept 
        : data(other.data), size(other.size) {
        other.data = nullptr;  // ✅ Prevent double-delete
        other.size = 0;
        std::cout << "Move constructed Buffer\n";
    }
};

int main() {
    Buffer b1(100);
    Buffer b2 = std::move(b1);  // Move constructor called
    // b1 is now in valid but unspecified state (data=nullptr, size=0)
}
```

This example shows the fundamental pattern for implementing move constructors. The move constructor transfers ownership by copying pointers and then nullifying the source. This is safe because the moved-from object's destructor checks for null pointers (standard behavior in `delete[]`). The `noexcept` specification is crucial for performance in containers.

#### Example 2: Move Assignment Operator

```cpp
#include <iostream>
#include <algorithm>

class DynamicArray {
    int* data;
    size_t size;
    
public:
    DynamicArray(size_t s) : size(s), data(new int[s]) { }
    
    ~DynamicArray() { delete[] data; }
    
    // Copy assignment
    DynamicArray& operator=(const DynamicArray& other) {
        if (this != &other) {
            delete[] data;
            size = other.size;
            data = new int[size];
            std::copy(other.data, other.data + size, data);
            std::cout << "Copy assigned\n";
        }
        return *this;
    }
    
    // Move assignment
    DynamicArray& operator=(DynamicArray&& other) noexcept {
        if (this != &other) {  // ✅ Check self-assignment
            delete[] data;      // Clean up existing resource
            
            data = other.data;  // Steal resource
            size = other.size;
            
            other.data = nullptr;  // Nullify source
            other.size = 0;
            std::cout << "Move assigned\n";
        }
        return *this;
    }
};

int main() {
    DynamicArray arr1(10);
    DynamicArray arr2(20);
    
    arr2 = std::move(arr1);  // Move assignment
    // arr1 is now empty but valid
}
```

The move assignment operator must first clean up the current object's resources (since we're replacing them), then steal the source's resources, and finally nullify the source. The self-assignment check prevents deleting resources we're about to use.

#### Example 3: The Rule of Five in Practice

```cpp
#include <iostream>
#include <string>

class Resource {
    std::string name;
    int* data;
    size_t size;
    
public:
    // 1. Constructor
    Resource(const std::string& n, size_t s) 
        : name(n), size(s), data(new int[s]) {
        std::cout << "Constructed " << name << "\n";
    }
    
    // 2. Destructor
    ~Resource() {
        delete[] data;
        std::cout << "Destroyed " << name << "\n";
    }
    
    // 3. Copy constructor
    Resource(const Resource& other)
        : name(other.name + "_copy"), size(other.size), 
          data(new int[other.size]) {
        std::copy(other.data, other.data + size, data);
        std::cout << "Copy constructed " << name << "\n";
    }
    
    // 4. Copy assignment
    Resource& operator=(const Resource& other) {
        if (this != &other) {
            delete[] data;
            name = other.name + "_assigned";
            size = other.size;
            data = new int[size];
            std::copy(other.data, other.data + size, data);
            std::cout << "Copy assigned " << name << "\n";
        }
        return *this;
    }
    
    // 5. Move constructor
    Resource(Resource&& other) noexcept
        : name(std::move(other.name)), size(other.size), 
          data(other.data) {
        other.data = nullptr;
        other.size = 0;
        std::cout << "Move constructed " << name << "\n";
    }
    
    // 6. Move assignment
    Resource& operator=(Resource&& other) noexcept {
        if (this != &other) {
            delete[] data;
            name = std::move(other.name);
            size = other.size;
            data = other.data;
            other.data = nullptr;
            other.size = 0;
            std::cout << "Move assigned " << name << "\n";
        }
        return *this;
    }
};
```

This complete example implements all five special member functions. Notice how string members use `std::move` in move operations—even member variables need to be moved explicitly. The `noexcept` on move operations allows containers to use moves during reallocation.

#### Example 4: Understanding std::move Is Just a Cast

```cpp
#include <iostream>
#include <string>
#include <type_traits>

void demonstrate_move_cast() {
    std::string s1 = "hello";
    
    // std::move is just a cast to rvalue reference
    decltype(std::move(s1)) moved = std::move(s1);
    // moved has type std::string&&
    
    static_assert(std::is_rvalue_reference<decltype(std::move(s1))>::value,
                  "std::move produces rvalue reference");
    
    // s1 hasn't been modified at all by std::move
    std::cout << "s1 after std::move: [" << s1 << "]\n";  // Still "hello"
    
    // The move only happens when we use the rvalue reference
    std::string s2 = std::move(s1);  // NOW the move happens
    std::cout << "s1 after move constructor: [" << s1 << "]\n";  // Empty
}
```

This example proves that `std::move` itself doesn't change the object. After calling `std::move(s1)`, the string `s1` still contains "hello". Only when the returned rvalue reference is used to initialize `s2` does the move constructor execute and transfer ownership.

#### Example 5: Moved-From State Examples

```cpp
#include <iostream>
#include <vector>
#include <string>

void demonstrate_moved_from_state() {
    // Strings
    std::string s1 = "hello";
    std::string s2 = std::move(s1);
    std::cout << "s1.length(): " << s1.length() << "\n";  // Likely 0
    std::cout << "s1.empty(): " << s1.empty() << "\n";     // Likely true
    s1 = "world";  // ✅ Can be assigned
    std::cout << "s1 after assignment: " << s1 << "\n";
    
    // Vectors
    std::vector<int> v1 = {1, 2, 3, 4, 5};
    std::vector<int> v2 = std::move(v1);
    std::cout << "v1.size(): " << v1.size() << "\n";       // Likely 0
    std::cout << "v1.capacity(): " << v1.capacity() << "\n"; // Likely 0
    v1.push_back(10);  // ✅ Can be used
    std::cout << "v1 after push_back: " << v1[0] << "\n";
    
    // Unique pointers
    std::unique_ptr<int> p1 = std::make_unique<int>(42);
    std::unique_ptr<int> p2 = std::move(p1);
    std::cout << "p1 is null: " << (p1 == nullptr) << "\n";  // true
    // std::cout << *p1;  // ❌ Undefined behavior: dereferencing null
}
```

Standard library types define predictable moved-from states: containers become empty, unique pointers become null, strings become empty. However, you should never rely on these specifics in generic code—only that the object is valid for destruction and assignment.

#### Example 6: Perfect Forwarding Preview with Move

```cpp
#include <iostream>
#include <utility>

template<typename T>
void process(T&& arg) {
    // arg is an lvalue inside this function (has a name)
    // Even if called with rvalue!
    
    // Wrong: always copies
    // std::string s1 = arg;
    
    // Correct: preserves value category
    std::string s2 = std::forward<T>(arg);
}

void demo_forwarding() {
    std::string s = "lvalue";
    process(s);                    // T = std::string&
    process(std::string("rvalue")); // T = std::string
    
    // Inside process:
    // For lvalue: forward returns lvalue ref → copy
    // For rvalue: forward returns rvalue ref → move
}
```

This previews perfect forwarding (covered in detail in another document). The key insight: named rvalue reference parameters are lvalues, so they need `std::forward` to conditionally cast back to rvalues when appropriate. `std::move` is unconditional; `std::forward` is conditional.

#### Example 7: Move-Only Types

```cpp
#include <iostream>
#include <memory>
#include <thread>

class MoveOnly {
    std::unique_ptr<int> data;
    
public:
    MoveOnly(int value) : data(std::make_unique<int>(value)) { }
    
    // Delete copy operations
    MoveOnly(const MoveOnly&) = delete;
    MoveOnly& operator=(const MoveOnly&) = delete;
    
    // Default move operations
    MoveOnly(MoveOnly&&) = default;
    MoveOnly& operator=(MoveOnly&&) = default;
    
    int get() const { return *data; }
};

MoveOnly create() {
    return MoveOnly(42);  // ✅ Moved or elided
}

int main() {
    MoveOnly obj1(10);
    // MoveOnly obj2 = obj1;  // ❌ Error: copy deleted
    MoveOnly obj2 = std::move(obj1);  // ✅ OK: move works
    
    MoveOnly obj3 = create();  // ✅ OK: move from temporary
}
```

Move-only types like `std::unique_ptr`, `std::thread`, and custom types with deleted copy operations can only be transferred via move semantics. This enforces single ownership and prevents accidental copies that would violate invariants.

#### Example 8: Moving in Containers

```cpp
#include <iostream>
#include <vector>
#include <string>

int main() {
    std::vector<std::string> vec;
    vec.reserve(3);  // Prevent reallocation
    
    std::string s1 = "one";
    std::string s2 = "two";
    std::string s3 = "three";
    
    // Copy into vector
    vec.push_back(s1);
    std::cout << "s1: [" << s1 << "]\n";  // Still "one"
    
    // Move into vector
    vec.push_back(std::move(s2));
    std::cout << "s2: [" << s2 << "]\n";  // Empty (moved-from)
    
    // Move directly from temporary
    vec.push_back(std::string("four"));  // Automatic move
    
    // Emplace constructs in-place (most efficient)
    vec.emplace_back("five");
    
    for (const auto& str : vec) {
        std::cout << "[" << str << "] ";
    }
    std::cout << "\n";
}
```

Containers are move-aware. `push_back` has both copy and move overloads, automatically selecting the appropriate one based on value category. `emplace_back` is even better, constructing the object directly in the container without any copies or moves.

---

#### Example 9: Autonomous Vehicle - Trajectory Transfer with Move Semantics

```cpp
#include <iostream>
#include <vector>
#include <string>
#include <memory>

// Waypoint contains position and velocity information
struct Waypoint {
    double x, y, heading;
    double velocity_mps;

    Waypoint(double x_, double y_, double h, double v)
        : x(x_), y(y_), heading(h), velocity_mps(v) {}
};

// Trajectory can contain thousands of waypoints (expensive to copy)
class Trajectory {
    std::string name_;
    std::vector<Waypoint> waypoints_;
    std::unique_ptr<char[]> metadata_;  // Additional trajectory metadata
    size_t metadata_size_;

public:
    // Constructor
    Trajectory(const std::string& name, size_t reserve_size = 1000)
        : name_(name), metadata_size_(1024) {
        waypoints_.reserve(reserve_size);
        metadata_ = std::make_unique<char[]>(metadata_size_);
        std::cout << "Trajectory '" << name_ << "' constructed with "
                  << reserve_size << " waypoint capacity\n";
    }

    // Copy constructor: expensive deep copy
    Trajectory(const Trajectory& other)
        : name_(other.name_ + "_copy"),
          waypoints_(other.waypoints_),
          metadata_size_(other.metadata_size_) {
        metadata_ = std::make_unique<char[]>(metadata_size_);
        std::memcpy(metadata_.get(), other.metadata_.get(), metadata_size_);
        std::cout << "Trajectory '" << name_ << "' COPIED ("
                  << waypoints_.size() << " waypoints, "
                  << metadata_size_ << " bytes metadata)\n";
    }

    // Move constructor: efficient resource transfer
    Trajectory(Trajectory&& other) noexcept
        : name_(std::move(other.name_)),
          waypoints_(std::move(other.waypoints_)),
          metadata_(std::move(other.metadata_)),
          metadata_size_(other.metadata_size_) {
        other.metadata_size_ = 0;
        std::cout << "Trajectory '" << name_ << "' MOVED (efficient transfer)\n";
    }

    // Copy assignment
    Trajectory& operator=(const Trajectory& other) {
        if (this != &other) {
            name_ = other.name_ + "_assigned";
            waypoints_ = other.waypoints_;
            metadata_size_ = other.metadata_size_;
            metadata_ = std::make_unique<char[]>(metadata_size_);
            std::memcpy(metadata_.get(), other.metadata_.get(), metadata_size_);
            std::cout << "Trajectory COPY assigned\n";
        }
        return *this;
    }

    // Move assignment
    Trajectory& operator=(Trajectory&& other) noexcept {
        if (this != &other) {
            name_ = std::move(other.name_);
            waypoints_ = std::move(other.waypoints_);
            metadata_ = std::move(other.metadata_);
            metadata_size_ = other.metadata_size_;
            other.metadata_size_ = 0;
            std::cout << "Trajectory MOVE assigned\n";
        }
        return *this;
    }

    void addWaypoint(double x, double y, double heading, double velocity) {
        waypoints_.emplace_back(x, y, heading, velocity);
    }

    std::string getName() const { return name_; }
    size_t getWaypointCount() const { return waypoints_.size(); }
};

class TrajectoryPlanner {
    std::vector<Trajectory> trajectory_history_;

public:
    // Accept by value and move - sink parameter pattern
    void storeTrajectory(Trajectory traj) {
        std::cout << "Storing trajectory...\n";
        trajectory_history_.push_back(std::move(traj));  // Move into vector
    }

    // Return by value - enables RVO or move
    Trajectory generateTrajectory(const std::string& name) {
        Trajectory traj(name, 500);
        // Generate waypoints
        for (int i = 0; i < 100; ++i) {
            traj.addWaypoint(i * 1.0, i * 0.5, i * 0.1, 10.0);
        }
        return traj;  // ✅ Automatic move or RVO (don't use std::move here!)
    }
};

// Helper: Create trajectory (demonstrates std::move usage)
Trajectory createEmergencyTrajectory() {
    Trajectory emergency("emergency_stop", 100);
    emergency.addWaypoint(0, 0, 0, 0);  // Immediate stop
    return emergency;  // Automatic move or RVO
}

int main() {
    TrajectoryPlanner planner;

    std::cout << "=== Move from Temporary ===\n";
    // Temporary directly moved into storeTrajectory parameter
    planner.storeTrajectory(Trajectory("temp_path", 200));

    std::cout << "\n=== std::move from Named Object ===\n";
    Trajectory main_path("main_route", 1000);
    main_path.addWaypoint(0, 0, 0, 15.0);
    main_path.addWaypoint(10, 5, 0.5, 15.0);

    // Using std::move to transfer ownership
    planner.storeTrajectory(std::move(main_path));
    // main_path now in valid-but-unspecified state

    std::cout << "\n=== Copy from Named Object (no std::move) ===\n";
    Trajectory backup_path("backup_route", 500);
    backup_path.addWaypoint(0, 0, 0, 10.0);

    planner.storeTrajectory(backup_path);  // Copy (backup_path still needed)
    std::cout << "backup_path still valid: " << backup_path.getName() << "\n";

    std::cout << "\n=== Return Value Optimization ===\n";
    Trajectory generated = planner.generateTrajectory("generated_path");
    // Only one construction (RVO) or one construction + one move

    std::cout << "\n=== Move Assignment ===\n";
    Trajectory path1("path_1", 100);
    Trajectory path2("path_2", 100);
    path1 = std::move(path2);  // Move assignment
    // path2 now in moved-from state

    std::cout << "\n=== Moved-From State Usage ===\n";
    // Safe operations on moved-from object:
    path2 = createEmergencyTrajectory();  // ✅ Can assign new value
    std::cout << "Reused path2: " << path2.getName() << "\n";

    std::cout << "\n=== Move-Only Type (unique_ptr member) ===\n";
    // Trajectory contains unique_ptr, so it's naturally move-friendly
    std::vector<Trajectory> trajectories;
    trajectories.push_back(Trajectory("vec_path_1", 50));  // Move
    trajectories.push_back(std::move(generated));          // Move

    std::cout << "\n=== Complete ===\n";
    return 0;
}
```

**Output:**
```
=== Move from Temporary ===
Trajectory 'temp_path' constructed with 200 waypoint capacity
Trajectory 'temp_path' MOVED (efficient transfer)
Storing trajectory...
Trajectory 'temp_path' MOVED (efficient transfer)

=== std::move from Named Object ===
Trajectory 'main_route' constructed with 1000 waypoint capacity
Trajectory 'main_route' MOVED (efficient transfer)
Storing trajectory...
Trajectory 'main_route' MOVED (efficient transfer)

=== Copy from Named Object (no std::move) ===
Trajectory 'backup_route' constructed with 500 waypoint capacity
Trajectory 'backup_route_copy' COPIED (1 waypoints, 1024 bytes metadata)
Storing trajectory...
Trajectory 'backup_route_copy' MOVED (efficient transfer)
backup_path still valid: backup_route

=== Return Value Optimization ===
Trajectory 'generated_path' constructed with 500 waypoint capacity
Trajectory 'generated_path' MOVED (efficient transfer)

=== Move Assignment ===
Trajectory 'path_1' constructed with 100 waypoint capacity
Trajectory 'path_2' constructed with 100 waypoint capacity
Trajectory MOVE assigned

=== Moved-From State Usage ===
Trajectory 'emergency_stop' constructed with 100 waypoint capacity
Trajectory MOVE assigned
Reused path2: emergency_stop

=== Move-Only Type (unique_ptr member) ===
Trajectory 'vec_path_1' constructed with 50 waypoint capacity
Trajectory 'vec_path_1' MOVED (efficient transfer)
Trajectory 'generated_path' MOVED (efficient transfer)

=== Complete ===
```

**Key Concepts Demonstrated:**

1. **Move Constructor**: Transfers ownership of `vector` and `unique_ptr` resources without copying. The source object is left in a valid but empty state. This is critical for large trajectory data.

2. **Move Assignment**: Efficiently replaces one trajectory with another by stealing resources rather than allocating new memory and copying data.

3. **std::move Usage**: Explicitly cast lvalues to rvalues when you want to enable move semantics. After `std::move(main_path)`, the object `main_path` is in a moved-from state.

4. **Valid-But-Unspecified State**: After moving, `path2` is still a valid object that can be destroyed or assigned to, but its contents are unspecified (typically empty).

5. **Automatic Move on Return**: The `generateTrajectory` function returns a local object without `std::move`—the compiler automatically applies move semantics or RVO.

6. **Copy vs Move Decision**: Without `std::move`, `backup_path` is copied (lvalue). With `std::move`, `main_path` is moved (cast to rvalue). The sink parameter pattern (`void storeTrajectory(Trajectory traj)`) accepts both.

7. **noexcept Specification**: Move operations are marked `noexcept`, which is critical for enabling move optimizations in standard containers during reallocation.

**Real-World Relevance**:

In autonomous driving systems:
- **Trajectory Planning** generates paths with thousands of waypoints (x, y, heading, velocity) multiple times per second
- **Copying** a 5000-waypoint trajectory means allocating ~160KB+ and copying all data (expensive)
- **Moving** transfers ownership of the underlying buffer in constant time (a few pointer assignments)
- **Performance Impact**: At 10Hz planning frequency, avoiding copies can save 1.6MB/s of allocations and significant CPU time
- **Real-time Requirements**: Motion planning must complete within strict deadlines (typically 100ms); unnecessary copies can cause deadline misses in safety-critical systems

The `unique_ptr` member demonstrates that trajectories with exclusive-ownership resources naturally become move-only or move-friendly, enforcing correct resource management through the type system.

---

### QUICK_REFERENCE: Answer Key and Move Semantics Tables

#### Answer Key for Practice Questions

| Q# | Answer | Explanation | Key Concept |
|----|--------|-------------|-------------|
| 1 | Output: 0 (likely) | String moved, `s1` in moved-from state (typically empty) | #moved_from_state |
| 2 | Undefined behavior | Move constructor doesn't nullify `other.ptr`, causing double-delete | #move_constructor_bug |
| 3 | Calls copy constructor | `const vector&&` cannot bind to move constructor expecting `vector&&` | #const_move_fails |
| 4 | Output: 10 10 | Moving primitive types is identical to copying—both retain value | #primitive_move |
| 5 | Compilation error | `unique_ptr` copy constructor is deleted—must use `std::move` | #move_only_type |
| 6 | Compiles but suboptimal | `std::move` in return prevents RVO, forcing move instead of elision | #rvo_pessimization |
| 7 | Undefined behavior | Returning reference to local variable—`s` destroyed when function exits | #dangling_reference |
| 8 | Output: 0 (likely) | String moved into function parameter, `str` is now in moved-from state | #move_to_parameter |
| 9 | Output: 3 0 | Element moved but not removed; `vec[1]` is empty string, size unchanged | #container_element_move |
| 10 | Undefined behavior | Self-move without check: deletes own data before attempting to use it | #self_move_bug |
| 11 | Output: hello | `std::move` alone doesn't modify—just casts; `s1` unchanged until used | #std_move_is_cast |
| 12 | Output: test (probably) | Move constructor uses copy for `name` member—should use `std::move(other.name)` | #member_move_bug |
| 13 | Compiles and runs | After move, `v1` is valid and can be reused; `push_back` works fine | #moved_from_reuse |
| 14 | Copies vector | `v` is lvalue inside function (has name), so copies to `local` | #named_rvalue_ref |
| 15 | Compiles, both likely empty | Second move from already-moved-from object is legal but gives empty | #multiple_moves |
| 16 | Output: 42 | Moving int is same as copying; both `x` and `y` have value 42 | #primitive_unchanged |
| 17 | Output: p1 null | `shared_ptr` move transfers ownership, leaving `p1` as nullptr | #shared_ptr_move |
| 18 | Compilation error | Cannot copy `unique_ptr`—must use `std::move(vec[0])` | #unique_ptr_no_copy |
| 19 | Compiles, efficient | RVO likely applies, constructing directly in `result` with no copies/moves | #rvo_optimization |
| 20 | Output: copy | `const A` cannot be moved (const prevents modification); copy constructor used | #const_no_move |

#### Move vs Copy Comparison

| Aspect | Copy | Move |
|--------|------|------|
| **Parameter Type** | `const T&` | `T&&` |
| **Source Modification** | Source unchanged | Source set to empty/null state |
| **Resource Handling** | Duplicates resources | Transfers ownership |
| **Performance** | Expensive for large types | Fast (constant time) |
| **Source After Operation** | Fully usable | Valid but unspecified state |
| **Use Case** | When source needed later | When source is temporary |
| **Exception Specification** | Can throw | Should be `noexcept` |

#### Move Semantics Implementation Checklist

| Component | Required? | Implementation Notes |
|-----------|-----------|---------------------|
| **Move Constructor** | If managing resources | Initialize from rvalue, nullify source |
| **Move Assignment** | If managing resources | Check self-assignment, cleanup old, steal new |
| **noexcept Specification** | Highly recommended | Required for container optimizations |
| **Null Checks in Destructor** | Yes | Handle moved-from state safely |
| **Member std::move** | Yes | Move each non-trivial member explicitly |
| **Self-Assignment Check** | Yes (move assignment) | Prevent destroying resources before using |
| **Default if Possible** | Preferred | Use `= default` if compiler version works |

#### When to Use std::move

| Scenario | Use std::move? | Explanation |
|----------|---------------|-------------|
| Passing to rvalue ref parameter | ✅ Yes | Enables move semantics |
| Returning local variable | ❌ No | Prevents RVO, hurts performance |
| Moving container elements | ✅ Yes | Explicitly move from container |
| Reusing moved-from object | ❌ No | Assign new value instead |
| Inside move constructor | ✅ Yes | Move each non-trivial member |
| With const objects | ❌ No | Falls back to copy anyway |
| Primitive types | ⚠️ Harmless | No effect (same as copy) |
| Unique ownership transfer | ✅ Yes | Move-only types require it |

#### Moved-From State Guarantees

| Type | Guaranteed State After Move | Safe Operations |
|------|---------------------------|----------------|
| **std::string** | Valid but unspecified (typically empty) | Assign, destroy, `clear()`, `empty()` |
| **std::vector** | Valid but unspecified (typically empty) | Assign, destroy, `clear()`, `size()` |
| **std::unique_ptr** | `nullptr` | Assign, destroy, boolean check, reset |
| **std::shared_ptr** | `nullptr` | Assign, destroy, boolean check, reset |
| **int, float, char** | Original value unchanged | All operations (move = copy) |
| **User-defined** | Implementation-defined | Assign, destroy, methods not depending on state |

#### Common Move Semantics Bugs

| Bug Pattern | Problem | Solution |
|------------|---------|----------|
| No nullification in move constructor | Double-delete on destruction | Set pointers to `nullptr` after stealing |
| Missing self-assignment check | Deleting own resources in self-move | Check `this != &other` |
| Copying members in move constructor | Performance loss | Use `std::move` on each member |
| Not marking moves `noexcept` | Container uses copies instead | Add `noexcept` specification |
| `return std::move(local)` | Prevents RVO optimization | Remove `std::move` from returns |
| Moving from const | Falls back to expensive copy | Remove `const` or accept copies |
| Returning reference to local | Dangling reference UB | Return by value instead |
| Assuming moved-from is empty | Relying on undefined state | Explicitly assign if reusing |
