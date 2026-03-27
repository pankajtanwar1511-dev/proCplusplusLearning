## TOPIC: Copy Elision and Return Value Optimization (RVO)

### THEORY_SECTION: Understanding Compiler Optimizations for Object Construction

#### 1. What is Copy Elision - RVO vs NRVO

Copy elision is a compiler optimization that **eliminates copy and move operations entirely** by constructing objects directly in their final destination, rather than creating temporaries, copying/moving them, and destroying the temporaries.

**Key Principle: Instead of construct → copy → destroy, do just construct (in the right place).**

| Aspect | Without Copy Elision | With Copy Elision |
|--------|---------------------|-------------------|
| **Operations** | 1. Construct temporary<br>2. Copy/move to destination<br>3. Destroy temporary | 1. Construct directly in destination |
| **Constructor calls** | 2-3 (construct + copy/move) | 1 (only construct) |
| **Performance** | Overhead of extra construction + copy/move | Zero overhead |
| **Works with non-movable types** | ❌ No (requires copy or move) | ✅ Yes (C++17 for prvalues) |
| **Compiler dependency** | N/A | C++17: mandatory for prvalues<br>Pre-C++17: optional |

**RVO (Return Value Optimization) vs NRVO (Named Return Value Optimization)**

There are two main forms of copy elision when returning from functions:

| Feature | RVO (Unnamed Return) | NRVO (Named Return) |
|---------|---------------------|-------------------|
| **Pattern** | `return T();` or `return func();` | `T obj; return obj;` |
| **Returns** | Unnamed temporary (prvalue) | Named local variable |
| **C++17 Status** | ✅ **Mandatory** (guaranteed by standard) | ⚠️ **Optional** (common but not required) |
| **Works with non-copyable** | ✅ Yes (C++17+) | ⚠️ Only if compiler applies NRVO |
| **Multiple return paths** | ✅ Can apply to each path independently | ❌ Usually prevented |
| **Compiler control** | Required by language (C++17) | Implementation-defined |
| **Fallback if not applied** | N/A (must be elided) | Automatic move conversion |
| **Example** | `return Widget();` | `Widget w; return w;` |

**Code Example: RVO vs NRVO**

```cpp
#include <iostream>

class Object {
public:
    Object() {
        std::cout << "Constructed\n";
    }
    Object(const Object&) {
        std::cout << "Copied\n";
    }
    Object(Object&&) noexcept {
        std::cout << "Moved\n";
    }
    ~Object() {
        std::cout << "Destroyed\n";
    }
};

// ✅ RVO: Return unnamed temporary (mandatory C++17)
Object createWithRVO() {
    return Object();  // Prvalue: constructed directly in caller
}

// ✅ NRVO: Return named local (optional but common)
Object createWithNRVO() {
    Object obj;       // Named local variable
    // ... do work with obj ...
    return obj;       // Likely NRVO, or automatic move if not
}

// ❌ BAD: std::move prevents NRVO
Object createBad() {
    Object obj;
    return std::move(obj);  // Prevents NRVO, forces move
}

int main() {
    std::cout << "=== RVO (mandatory) ===\n";
    Object o1 = createWithRVO();
    // Output: Constructed, Destroyed
    // Only ONE construction, no copy, no move

    std::cout << "\n=== NRVO (optional) ===\n";
    Object o2 = createWithNRVO();
    // Modern compilers: Constructed, Destroyed (NRVO applied)
    // If NRVO fails: Constructed, Moved, Destroyed, Destroyed

    std::cout << "\n=== std::move (bad) ===\n";
    Object o3 = createBad();
    // Output: Constructed, Moved, Destroyed, Destroyed
    // Worse than NRVO!
}
```

**When Does Copy Elision Occur?**

| Context | Example | Elision Type | C++17 Status |
|---------|---------|--------------|--------------|
| Returning unnamed temporary | `return T();` | RVO | ✅ Mandatory |
| Returning prvalue function call | `return func();` (if func returns prvalue) | RVO | ✅ Mandatory |
| Returning named local | `T obj; return obj;` | NRVO | ⚠️ Optional |
| Initializing from temporary | `T obj = T();` | Elision | ✅ Mandatory |
| Initializing from prvalue | `T obj = func();` | Elision | ✅ Mandatory |
| Passing temporary as argument | `func(T());` | Argument elision | ✅ Mandatory |
| Throwing/catching by value | `throw T();` | Exception elision | ⚠️ Optional |
| Binding reference to temporary | `const T& ref = T();` | May elide (lifetime extended) | ⚠️ Optional |

---

#### 2. Mandatory vs Optional Elision - C++11/14/17 Evolution

The rules for copy elision changed significantly in C++17, transforming it from an **optional optimization** to a **mandatory language requirement** in specific cases.

**Evolution of Copy Elision Across Standards**

| Standard | RVO (Unnamed) | NRVO (Named) | Requirements | Non-Copyable Types |
|----------|---------------|--------------|--------------|-------------------|
| **C++98/03** | Optional | Optional | Copy constructor required | ❌ Cannot return |
| **C++11/14** | Optional | Optional | Move or copy constructor required | ❌ Cannot return (even move-only works via optional elision) |
| **C++17** | **Mandatory** | Optional | **No copy/move required for prvalues** | ✅ Can return prvalues |
| **C++20** | **Mandatory** | Optional | Same as C++17 | ✅ Can return prvalues |

**What Changed in C++17: Prvalue Semantics**

Before C++17:
- Copy elision was an **optimization** the compiler could choose to apply
- Even if elision occurred, copy/move constructors **had to exist** (even if never called)
- Returning non-movable types was impossible (even with elision)

After C++17:
- Copy elision for **prvalues is mandatory** (part of language semantics, not optimization)
- Copy/move constructors **don't need to exist** for prvalue returns
- Prvalues don't create temporaries that are then moved; they're constructed directly

**Code Example: C++17 Mandatory Elision Enables Non-Movable Types**

```cpp
#include <iostream>

// Type that CANNOT be copied or moved
struct Immovable {
    Immovable() {
        std::cout << "Immovable constructed\n";
    }

    // Delete copy and move
    Immovable(const Immovable&) = delete;
    Immovable(Immovable&&) = delete;
    Immovable& operator=(const Immovable&) = delete;
    Immovable& operator=(Immovable&&) = delete;

    ~Immovable() {
        std::cout << "Immovable destroyed\n";
    }
};

// ✅ C++17: COMPILES - mandatory elision for prvalue
Immovable createImmovable() {
    return Immovable();  // Prvalue: guaranteed elision
}

// ❌ C++17: COMPILE ERROR - NRVO not guaranteed
Immovable createNamedImmovable() {
    Immovable obj;       // Named local
    return obj;          // ❌ Error: cannot move or copy
}

int main() {
    // ✅ C++17: Works! No copy/move needed
    Immovable im = createImmovable();

    // This is possible ONLY because of mandatory elision
    // Pre-C++17: would not compile even with elision
}
```

**Mandatory vs Optional Elision Rules**

| Scenario | C++17 Requirement | Explanation |
|----------|------------------|-------------|
| `return T();` | ✅ Mandatory | Prvalue expression, must be elided |
| `return prvalueFunc();` | ✅ Mandatory | Prvalue result, must be elided |
| `T obj = T();` | ✅ Mandatory | Prvalue initialization, must be elided |
| `func(T());` | ✅ Mandatory | Prvalue argument, must be elided |
| `T obj; return obj;` | ⚠️ Optional | Named local, NRVO discretionary |
| `return flag ? a : b;` | ❌ Cannot elide | Multiple candidates, automatic move instead |
| `return std::move(obj);` | ❌ Cannot elide | Explicit xvalue (not prvalue), forces move |
| `return param;` | ❌ Cannot elide | Parameter (not local), automatic move instead |

**Why This Matters: Performance and Design**

| Impact | Pre-C++17 | C++17+ |
|--------|-----------|--------|
| **Return large objects** | Requires move constructor for safety | Can return non-movable types as prvalues |
| **Factory functions** | Must support copy/move | Can return truly immovable types |
| **Builder patterns** | Needed output parameters or pointers | Can return by value safely |
| **Performance guarantee** | Elision was optimization, not guaranteed | Prvalue elision is guaranteed (zero-cost) |
| **Move-only types** | Worked with optional elision | Guaranteed to work |
| **Type requirements** | Must be copyable or movable | Can be neither (for prvalues) |

**Code Example: Factory Pattern Enabled by C++17**

```cpp
#include <memory>
#include <mutex>

// Lock guard that cannot be copied or moved
class ScopedLock {
    std::mutex& mtx_;
    std::unique_lock<std::mutex> lock_;

public:
    ScopedLock(std::mutex& m) : mtx_(m), lock_(m) {}

    // Explicitly deleted
    ScopedLock(const ScopedLock&) = delete;
    ScopedLock(ScopedLock&&) = delete;
};

// ✅ C++17: Can return by value thanks to mandatory elision
ScopedLock acquireLock(std::mutex& m) {
    return ScopedLock(m);  // Prvalue: constructed directly in caller
}

// Before C++17, you'd need:
// std::unique_ptr<ScopedLock> acquireLock(std::mutex& m) {
//     return std::make_unique<ScopedLock>(m);  // Heap allocation
// }
```

---

#### 3. Copy Elision Rules and When It Doesn't Apply

While copy elision is powerful, it has specific requirements and limitations. Understanding when elision **cannot** occur is crucial for writing efficient code.

**Copy Elision Cannot Occur: Common Scenarios**

| Scenario | Why Elision Fails | What Happens Instead | How to Enable Elision |
|----------|------------------|---------------------|----------------------|
| **Multiple return paths, different variables** | Compiler can't determine which to elide at compile time | Automatic move conversion | Return prvalues: `return T(args);` |
| **Return with std::move** | Explicit cast to xvalue (not prvalue) | Move constructor called | Remove `std::move`: `return obj;` |
| **Return function parameter** | Parameter storage from caller, not local | Automatic move conversion | Create local: `T local = param; return local;` (still moves) |
| **Conditional return of different named vars** | Runtime decision, multiple candidates | Automatic move conversion | Use prvalues per branch |
| **Return member variable** | Member's lifetime tied to object | Copy or move (depending on context) | Cannot optimize this case |
| **Return global/static** | Not a temporary or local | Copy or move | Cannot optimize this case |

**The std::move Paradox in Return Statements**

Using `std::move` in a return statement is **almost always wrong** and **hurts performance** by preventing copy elision.

| Return Pattern | What Happens | Performance Rank |
|----------------|--------------|------------------|
| `return T();` | ✅ **RVO** - object constructed in caller | **Best** (zero cost) |
| `T obj; return obj;` | ✅ **NRVO** or automatic move | **Good** (NRVO) or **Acceptable** (move) |
| `return std::move(obj);` | ❌ **Forced move** (prevents NRVO) | **Worse** (unnecessary move) |
| `const T obj; return obj;` | ❌ **Copy** (const prevents move) | **Worst** (unnecessary copy) |

**Code Example: The std::move Mistake**

```cpp
#include <iostream>
#include <vector>

class Buffer {
    std::vector<int> data_;
public:
    Buffer(size_t size) : data_(size, 0) {
        std::cout << "Constructed (" << size << " elements)\n";
    }

    Buffer(const Buffer& other) : data_(other.data_) {
        std::cout << "COPIED (" << data_.size() << " elements)\n";
    }

    Buffer(Buffer&& other) noexcept : data_(std::move(other.data_)) {
        std::cout << "MOVED (" << data_.size() << " elements)\n";
    }
};

// ✅ BEST: Return prvalue (guaranteed RVO)
Buffer createBest() {
    return Buffer(10000);
    // Output: Constructed (10000 elements)
    // Zero cost return!
}

// ✅ GOOD: Return named local (NRVO or automatic move)
Buffer createGood() {
    Buffer buf(10000);
    // ... do work with buf ...
    return buf;  // NRVO likely, or automatic move
    // Output: Constructed (10000 elements)
    // If NRVO: zero cost
    // If move: cheap O(1) pointer swap
}

// ❌ BAD: std::move prevents NRVO
Buffer createBad() {
    Buffer buf(10000);
    return std::move(buf);  // Prevents NRVO!
    // Output: Constructed (10000 elements)
    //         MOVED (10000 elements)
    // Forced move that NRVO would have eliminated
}

// ❌ WORST: const prevents move
Buffer createWorst() {
    const Buffer buf(10000);
    return buf;  // Cannot move const object
    // Output: Constructed (10000 elements)
    //         COPIED (10000 elements)
    // Expensive copy!
}

int main() {
    std::cout << "=== createBest (RVO) ===\n";
    Buffer b1 = createBest();

    std::cout << "\n=== createGood (NRVO or move) ===\n";
    Buffer b2 = createGood();

    std::cout << "\n=== createBad (forced move) ===\n";
    Buffer b3 = createBad();

    std::cout << "\n=== createWorst (copy) ===\n";
    Buffer b4 = createWorst();
}
```

**When You SHOULD Use std::move**

| Context | Use std::move? | Example |
|---------|---------------|---------|
| **Return statement with local** | ❌ Never | `return obj;` not `return std::move(obj);` |
| **Return statement with prvalue** | ❌ Never (already rvalue) | `return T();` |
| **Moving from member** | ✅ Yes | `return std::move(member_);` |
| **Moving into container** | ✅ Yes | `vec.push_back(std::move(obj));` |
| **Transferring ownership** | ✅ Yes | `unique_ptr<T> p2 = std::move(p1);` |
| **Perfect forwarding** | ❌ No (use std::forward) | `func(std::forward<T>(arg));` |

**Copy Elision Decision Tree**

```
Are you returning from a function?
├─ Yes → Are you returning a prvalue (T() or funcReturningPrvalue())?
│        ├─ Yes → ✅ RVO applies (mandatory C++17)
│        │        DO: return T();
│        └─ No → Are you returning a named local variable?
│                 ├─ Yes → Are there multiple different variables that might be returned?
│                 │        ├─ No → ✅ NRVO may apply (optional)
│                 │        │       DO: T obj; return obj;
│                 │        └─ Yes → ❌ NRVO prevented
│                 │                 DO: Return prvalue per branch: return T();
│                 └─ No → Are you using std::move?
│                          ├─ Yes → ❌ BAD: Prevents elision
│                          │        FIX: Remove std::move
│                          └─ No → Returning parameter or member?
│                                   └─ Automatic move applies (acceptable)
└─ No → Are you initializing from a prvalue?
         ├─ Yes → ✅ Elision applies (mandatory C++17)
         └─ No → No elision, copy or move occurs
```

**Common Mistakes and Fixes**

| Mistake | Code | Problem | Fix |
|---------|------|---------|-----|
| **1. std::move on return** | `return std::move(local);` | Prevents NRVO, forces move | `return local;` |
| **2. Multiple named returns** | `return flag ? obj1 : obj2;` | Can't elide (runtime decision) | `if (flag) return T(args1);`<br>`else return T(args2);` |
| **3. Returning const** | `const T func() { return T(); }` | Prevents move fallback | Return plain `T` |
| **4. Moving parameter** | `T func(T param) {`<br>`  return std::move(param);`<br>`}` | Unnecessary (auto move applies) | `return param;` |
| **5. Disabling elision** | Using `-fno-elide-constructors` for "testing" | Breaks C++17 guaranteed elision | Test copy/move ctors separately |
| **6. Returning reference to local** | `const T& func() {`<br>`  return T();`<br>`}` | Dangling reference | Return by value: `T func()` |

**Performance Hierarchy: Return Patterns**

| Pattern | Optimization Level | Performance | When to Use |
|---------|-------------------|-------------|-------------|
| `return T(args);` | **RVO (mandatory)** | ⭐⭐⭐⭐⭐ Best | Always, when possible |
| `T obj; return obj;` | **NRVO (likely)** | ⭐⭐⭐⭐⭐ Best (if applied) | When you need to configure object |
| `T obj; return obj;` | **Auto move (fallback)** | ⭐⭐⭐⭐ Good | Fallback if NRVO fails |
| `return std::move(obj);` | **Forced move** | ⭐⭐⭐ Acceptable | Never in returns! |
| `return constObj;` | **Copy** | ⭐ Poor | Never use const return |

**Best Practices Summary**

| Practice | Recommendation | Reason |
|----------|---------------|--------|
| **Return prvalues** | ✅ Always prefer | Guaranteed RVO in C++17 |
| **Return named locals** | ✅ Good | NRVO likely, automatic move if not |
| **Use std::move on return** | ❌ Never | Prevents NRVO, forces move |
| **Return by const value** | ❌ Never | Prevents move fallback |
| **Multiple return paths** | ✅ Return prvalues per branch | Enables RVO on each branch |
| **Trust the compiler** | ✅ Yes | C++17 guarantees and automatic moves work |

---

### EDGE_CASES: Optimization Conditions and Limitations

#### Edge Case 1: When Copy Elision Cannot Be Applied

Copy elision has specific requirements and cannot be applied in all situations. The compiler can only elide copies when it can determine at compile time that the source and destination refer to the same storage location and when the types match exactly.

```cpp
class Widget {
public:
    Widget() { std::cout << "Constructed\n"; }
    Widget(const Widget&) { std::cout << "Copied\n"; }
    Widget(Widget&&) noexcept { std::cout << "Moved\n"; }
};

Widget createWidget(bool condition) {
    Widget w1;
    Widget w2;
    return condition ? w1 : w2;  // ❌ Copy elision prevented: multiple return paths
}

Widget getWidget(Widget w) {
    return w;  // ❌ Copy elision prevented: parameter, not local variable
}
```

When there are multiple return statements returning different named variables, the compiler cannot determine at compile time which object will be returned, preventing NRVO. Similarly, when returning a function parameter (rather than a local variable), copy elision typically doesn't apply because the parameter storage was provided by the caller, not constructed locally. In these cases, move semantics will be applied if available, otherwise a copy occurs.

#### Edge Case 2: The std::move Paradox in Return Statements

Using `std::move` on a return statement often inhibits RVO, resulting in worse performance than omitting it. This is counterintuitive since `std::move` is meant to improve performance through move semantics.

```cpp
Widget createGood() {
    Widget w;
    return w;  // ✅ RVO or automatic move, best performance
}

Widget createBad() {
    Widget w;
    return std::move(w);  // ❌ Prevents RVO, forces move
}

Widget createWorst() {
    Widget w;
    return std::move(w);  // ❌ If Widget is not movable, compilation error
}
```

When you write `return w;` for a local variable, the compiler first tries RVO (constructing directly in caller's space). If RVO isn't possible, the compiler automatically treats `w` as an rvalue for the return statement, enabling move semantics without explicit `std::move`. When you write `return std::move(w);`, you prevent RVO because you're explicitly returning an rvalue reference rather than the object itself. This forces the use of the move constructor and prevents the complete elimination of the operation that RVO would provide.

#### Edge Case 3: Guaranteed vs Optional Copy Elision in Different C++ Standards

The rules for copy elision changed significantly in C++17, creating potential compatibility issues when code needs to work across different standard versions.

```cpp
struct NonMovable {
    NonMovable() = default;
    NonMovable(const NonMovable&) = delete;
    NonMovable(NonMovable&&) = delete;
};

NonMovable create() {
    return NonMovable();  // ✅ C++17: guaranteed elision, compiles
                          // ❌ C++14: optional elision, may not compile
}

NonMovable createNamed() {
    NonMovable obj;
    return obj;  // ❌ Even C++17: NRVO not guaranteed, doesn't compile
}
```

In C++17 and later, copy elision is **mandatory** when returning prvalues (pure rvalues like temporary objects created with `T()`). This means the code compiles even if the type is non-copyable and non-movable. However, NRVO (returning named local variables) remains optional even in C++17, so if your type cannot be copied or moved, returning named locals will fail to compile unless the compiler chooses to apply NRVO. This asymmetry is important for library design and cross-platform code.

#### Edge Case 4: Copy Elision with Exception Handling

Copy elision interacts with exception handling in subtle ways, particularly regarding the order of operations and when objects are constructed or destroyed.

```cpp
class Logger {
public:
    Logger(int id) : id_(id) { 
        std::cout << "Construct " << id_ << "\n"; 
    }
    ~Logger() { 
        std::cout << "Destruct " << id_ << "\n"; 
    }
    int id_;
};

Logger create() {
    return Logger(1);  // With RVO: constructed directly in caller
}

Logger createWithTry() {
    try {
        return Logger(2);  // RVO may still apply in try block
    } catch (...) {
        throw;
    }
}
```

When copy elision is applied, the object is constructed directly in the caller's stack frame, which affects exception propagation and object lifetimes. If an exception is thrown during the object's construction, the object in the caller's frame never completes initialization, and no destructor is called for it. This is different from the non-elided case where a temporary might be constructed and destroyed before the exception propagates. Understanding this interaction is crucial for writing exception-safe code with proper resource management.

#### Edge Case 5: Copy Elision in Initialization Contexts

Copy elision can occur in various initialization contexts beyond function returns, but the rules for when it applies can be subtle and depend on the exact syntax used.

```cpp
Widget w1 = Widget();        // ✅ C++17: mandatory elision
Widget w2 = create();        // ✅ C++17: mandatory elision if create() returns prvalue
Widget w3 = w1;              // ❌ No elision: copy from existing object
Widget w4 = std::move(w1);   // ❌ No elision: move from existing object

void func(Widget w);
func(Widget());              // ✅ C++17: mandatory elision in argument

Widget arr[2] = {Widget(), Widget()};  // ✅ C++17: each element elided
```

The initialization forms `T obj = T();` and `T obj = expr();` (where `expr()` returns a prvalue) are guaranteed to be elided in C++17. However, initializing from an existing object, even with move semantics, cannot be elided because you're explicitly requesting to construct from an existing object. Array and aggregate initialization can benefit from copy elision for each element independently. Understanding these rules helps write initialization code that's both efficient and correct.

#### Edge Case 6: Copy Elision and Temporaries in Expression Contexts

Temporary objects created in expressions can be elided when bound to references, but the rules depend on the reference type and the expression context.

```cpp
const Widget& ref1 = Widget();     // ✅ Lifetime extended, may be elided
Widget&& ref2 = Widget();          // ✅ Lifetime extended, may be elided
Widget& ref3 = Widget();           // ❌ Cannot bind non-const lvalue ref to temporary

const Widget& ref4 = create();    // ✅ Lifetime extended to ref4's scope
auto&& ref5 = create();           // ✅ Universal reference, lifetime extended

void func(const Widget& w);
func(Widget());                    // Temporary created and possibly elided
```

When a temporary is bound to a reference (const lvalue reference or rvalue reference), its lifetime is extended to the lifetime of the reference. The temporary may or may not be elided depending on the context. In function calls, temporaries created as arguments may be elided into the parameter's location if copy elision is applicable. These rules affect both performance and the observable behavior of programs, particularly regarding constructor and destructor call counts.

---

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Basic RVO with Unnamed Temporary

```cpp
#include <iostream>

class Widget {
public:
    Widget() { 
        std::cout << "Default constructor\n"; 
    }
    Widget(const Widget&) { 
        std::cout << "Copy constructor\n"; 
    }
    Widget(Widget&&) noexcept { 
        std::cout << "Move constructor\n"; 
    }
    ~Widget() { 
        std::cout << "Destructor\n"; 
    }
};

Widget create() {
    return Widget();  // RVO: Widget constructed directly in caller's space
}

int main() {
    Widget w = create();  // C++17: Only "Default constructor" printed
    // Pre-C++17: Might also see move constructor
}
```

This demonstrates the most basic form of RVO. In C++17 and later, only the default constructor is called—no copy or move occurs. The `Widget()` temporary is constructed directly into `w`'s memory location in `main()`. Prior to C++17, the move constructor might be called, but with modern compilers and C++17 mode, complete elision is guaranteed. This is the optimal case for returning objects: returning an unnamed temporary directly.

#### Example 2: Named Return Value Optimization (NRVO)

```cpp
#include <iostream>
#include <string>

class DataContainer {
    std::string data_;
public:
    DataContainer(std::string s) : data_(std::move(s)) {
        std::cout << "Constructed with: " << data_ << "\n";
    }
    DataContainer(const DataContainer& other) : data_(other.data_) {
        std::cout << "Copy constructed\n";
    }
    DataContainer(DataContainer&& other) noexcept : data_(std::move(other.data_)) {
        std::cout << "Move constructed\n";
    }
};

DataContainer process() {
    DataContainer container("processed data");
    // ... do some work with container
    return container;  // NRVO: may construct directly in caller's space
}

int main() {
    DataContainer result = process();
    // Modern compilers: likely only "Constructed with: processed data"
    // If NRVO doesn't apply: "Constructed..." then "Move constructed"
}
```

NRVO demonstrates copy elision when returning a named local variable. Unlike RVO with temporaries (which is mandatory in C++17), NRVO remains optional even in modern C++ standards. However, most modern compilers reliably apply NRVO for simple cases like this. If NRVO doesn't apply, the compiler automatically treats the return as an rvalue, invoking the move constructor without needing explicit `std::move`.

#### Example 3: Comparing RVO, NRVO, and Move

```cpp
#include <iostream>
#include <vector>

class Buffer {
    std::vector<int> data_;
public:
    Buffer(size_t size) : data_(size) {
        std::cout << "Buffer constructed, size: " << size << "\n";
    }
    Buffer(const Buffer& other) : data_(other.data_) {
        std::cout << "Buffer copied, size: " << data_.size() << "\n";
    }
    Buffer(Buffer&& other) noexcept : data_(std::move(other.data_)) {
        std::cout << "Buffer moved, size: " << data_.size() << "\n";
    }
};

Buffer returnPrvalue() {
    return Buffer(1000);  // ✅ Guaranteed RVO (C++17+)
}

Buffer returnNamed() {
    Buffer b(2000);
    return b;  // ✅ Likely NRVO, or automatic move
}

Buffer returnWithMove() {
    Buffer b(3000);
    return std::move(b);  // ❌ Prevents NRVO, forces move
}

int main() {
    std::cout << "=== returnPrvalue ===\n";
    Buffer b1 = returnPrvalue();  // Only construction
    
    std::cout << "\n=== returnNamed ===\n";
    Buffer b2 = returnNamed();    // NRVO or automatic move
    
    std::cout << "\n=== returnWithMove ===\n";
    Buffer b3 = returnWithMove(); // Forced move, NRVO inhibited
}
```

This comparison shows the performance hierarchy: RVO (best) > NRVO (good) > move (acceptable) > copy (avoid). The `returnPrvalue` function benefits from guaranteed RVO. The `returnNamed` function likely uses NRVO, but if not, automatic move conversion applies. The `returnWithMove` function explicitly prevents NRVO by forcing move semantics, demonstrating why `std::move` in return statements is usually counterproductive.

#### Example 4: Multiple Return Paths Preventing NRVO

```cpp
#include <iostream>

class Resource {
    int id_;
public:
    explicit Resource(int id) : id_(id) {
        std::cout << "Resource " << id_ << " constructed\n";
    }
    Resource(const Resource& other) : id_(other.id_) {
        std::cout << "Resource " << id_ << " copied\n";
    }
    Resource(Resource&& other) noexcept : id_(other.id_) {
        std::cout << "Resource " << id_ << " moved\n";
    }
};

Resource getResource(bool flag) {
    Resource r1(1);
    Resource r2(2);
    return flag ? r1 : r2;  // ❌ NRVO prevented: compiler doesn't know which to elide
}

Resource getResourceFixed(bool flag) {
    if (flag) {
        return Resource(1);  // ✅ RVO can apply here
    } else {
        return Resource(2);  // ✅ RVO can apply here
    }
}

int main() {
    std::cout << "=== getResource ===\n";
    Resource r1 = getResource(true);   // Move or copy, no NRVO
    
    std::cout << "\n=== getResourceFixed ===\n";
    Resource r2 = getResourceFixed(true);  // RVO applied
}
```

This example illustrates why NRVO fails with multiple return paths that return different named variables. The compiler cannot determine at compile time which object will be returned, preventing it from constructing directly in the caller's space. The fixed version constructs temporaries on each return path, enabling RVO for each branch independently. This pattern—returning temporaries from multiple paths—is preferable to constructing named objects when different code paths need to return different objects.

#### Example 5: Copy Elision with Non-Copyable Types

```cpp
#include <iostream>
#include <memory>

class UniqueResource {
    std::unique_ptr<int> data_;
public:
    UniqueResource(int value) : data_(std::make_unique<int>(value)) {
        std::cout << "UniqueResource constructed with value: " << *data_ << "\n";
    }
    
    // Delete copy operations
    UniqueResource(const UniqueResource&) = delete;
    UniqueResource& operator=(const UniqueResource&) = delete;
    
    // Default move operations
    UniqueResource(UniqueResource&&) = default;
    UniqueResource& operator=(UniqueResource&&) = default;
    
    int getValue() const { return *data_; }
};

UniqueResource createResource() {
    return UniqueResource(42);  // ✅ C++17: guaranteed elision, no move needed
}

UniqueResource createNamed() {
    UniqueResource r(100);
    return r;  // ✅ Automatic move conversion, no explicit std::move needed
}

int main() {
    UniqueResource r1 = createResource();
    std::cout << "Value: " << r1.getValue() << "\n";
    
    UniqueResource r2 = createNamed();
    std::cout << "Value: " << r2.getValue() << "\n";
}
```

This demonstrates that move-only types (like `std::unique_ptr` and classes containing them) work seamlessly with RVO and NRVO. In C++17, returning prvalues requires no move constructor at all due to mandatory copy elision. For named returns, the automatic move conversion applies, so you don't need (and shouldn't use) explicit `std::move`. This makes working with move-only types natural and efficient.

#### Example 6: Copy Elision in Factory Functions

```cpp
#include <iostream>
#include <string>

class Product {
    std::string type_;
    int value_;
public:
    Product(std::string type, int value) 
        : type_(std::move(type)), value_(value) {
        std::cout << "Product created: " << type_ << ", " << value_ << "\n";
    }
    
    Product(const Product&) {
        std::cout << "Product copied\n";
    }
    
    Product(Product&&) noexcept {
        std::cout << "Product moved\n";
    }
};

class Factory {
public:
    static Product createBasic() {
        return Product("Basic", 100);  // ✅ RVO
    }
    
    static Product createCustom(int value) {
        Product p("Custom", value);    // Named local
        // ... configure p ...
        return p;  // ✅ NRVO or automatic move
    }
    
    static Product createConditional(bool premium) {
        if (premium) {
            return Product("Premium", 500);  // ✅ RVO on this path
        } else {
            return Product("Standard", 200); // ✅ RVO on this path
        }
    }
};

int main() {
    Product p1 = Factory::createBasic();
    Product p2 = Factory::createCustom(250);
    Product p3 = Factory::createConditional(true);
}
```

Factory functions are an ideal use case for copy elision. Each factory method returns objects efficiently without requiring output parameters or additional pointer indirection. The `createBasic` and `createConditional` functions use RVO by returning temporaries. The `createCustom` function demonstrates that even when you need to configure a named object, modern C++ allows you to return it efficiently through NRVO or automatic move, eliminating the need for old-style output parameters.

#### Example 7: Understanding Mandatory vs Optional Copy Elision

```cpp
#include <iostream>

class TrackedObject {
    static int count_;
    int id_;
public:
    TrackedObject() : id_(++count_) {
        std::cout << "Object " << id_ << " constructed\n";
    }
    TrackedObject(const TrackedObject& other) : id_(++count_) {
        std::cout << "Object " << id_ << " copied from " << other.id_ << "\n";
    }
    TrackedObject(TrackedObject&& other) noexcept : id_(++count_) {
        std::cout << "Object " << id_ << " moved from " << other.id_ << "\n";
    }
    ~TrackedObject() {
        std::cout << "Object " << id_ << " destroyed\n";
    }
};
int TrackedObject::count_ = 0;

// Mandatory elision scenarios (C++17+)
TrackedObject mandatory1() {
    return TrackedObject();  // Prvalue: guaranteed elision
}

TrackedObject mandatory2() {
    return TrackedObject();  // Still prvalue: guaranteed elision
}

// Optional elision scenarios
TrackedObject optional1() {
    TrackedObject obj;
    return obj;  // Named: NRVO optional, may move
}

TrackedObject optional2(bool flag) {
    TrackedObject obj1, obj2;
    return flag ? obj1 : obj2;  // Multiple paths: NRVO prevented, will move
}

int main() {
    std::cout << "=== Mandatory 1 ===\n";
    TrackedObject m1 = mandatory1();
    
    std::cout << "\n=== Mandatory 2 ===\n";
    TrackedObject m2 = mandatory2();
    
    std::cout << "\n=== Optional 1 ===\n";
    TrackedObject o1 = optional1();
    
    std::cout << "\n=== Optional 2 ===\n";
    TrackedObject o2 = optional2(true);
}
```

This example clearly distinguishes between mandatory (C++17) and optional copy elision scenarios. The mandatory cases only show a single construction with no copy or move, guaranteed by the language standard. The optional cases may show additional move operations depending on whether the compiler applies NRVO. By tracking each object with an ID and logging all operations, you can observe exactly when copy elision occurs and when moves happen.

#### Example 8: Copy Elision with Perfect Forwarding Returns

```cpp
#include <iostream>
#include <utility>

class Value {
    int data_;
public:
    explicit Value(int data) : data_(data) {
        std::cout << "Value(" << data_ << ") constructed\n";
    }
    Value(const Value& other) : data_(other.data_) {
        std::cout << "Value(" << data_ << ") copied\n";
    }
    Value(Value&& other) noexcept : data_(other.data_) {
        std::cout << "Value(" << data_ << ") moved\n";
    }
    int get() const { return data_; }
};

template<typename T>
auto createValue(T&& arg) -> decltype(Value(std::forward<T>(arg))) {
    return Value(std::forward<T>(arg));  // ✅ RVO: temporary constructed in caller
}

// Alternative that prevents RVO
template<typename T>
Value createValueNoElision(T&& arg) {
    Value v(std::forward<T>(arg));  // Local named object
    return v;  // NRVO may apply, or automatic move
}

int main() {
    std::cout << "=== createValue ===\n";
    Value v1 = createValue(42);
    
    std::cout << "\n=== createValueNoElision ===\n";
    Value v2 = createValueNoElision(100);
}
```

This demonstrates that returning a temporary expression (rather than a named variable) enables RVO even in template functions with forwarding. The `createValue` function returns a prvalue expression, allowing guaranteed elision. The `createValueNoElision` function constructs a named local variable, which may or may not benefit from NRVO. For factory and wrapper functions, returning temporary expressions directly is preferable to creating named intermediates when copy elision is desired.

---

#### Example 9: Autonomous Vehicle - Path Planning Factory with RVO

```cpp
#include <iostream>
#include <vector>
#include <string>
#include <memory>

struct Waypoint {
    double x, y, theta, curvature;
    Waypoint(double x_, double y_, double t, double c)
        : x(x_), y(y_), theta(t), curvature(c) {}
};

class Path {
    std::string path_type_;
    std::vector<Waypoint> waypoints_;
    std::unique_ptr<double[]> cost_map_;  // Large cost matrix
    size_t cost_map_size_;

public:
    Path(std::string type, size_t reserve = 1000)
        : path_type_(std::move(type)),
          cost_map_size_(1000 * 1000) {
        waypoints_.reserve(reserve);
        cost_map_ = std::make_unique<double[]>(cost_map_size_);
        std::cout << "Path '" << path_type_ << "' constructed "
                  << "(waypoints capacity: " << reserve
                  << ", cost map: " << cost_map_size_ << " doubles)\n";
    }

    // Copy constructor - expensive
    Path(const Path& other)
        : path_type_(other.path_type_ + "_copy"),
          waypoints_(other.waypoints_),
          cost_map_size_(other.cost_map_size_) {
        cost_map_ = std::make_unique<double[]>(cost_map_size_);
        std::memcpy(cost_map_.get(), other.cost_map_.get(),
                    cost_map_size_ * sizeof(double));
        std::cout << "Path COPIED: " << path_type_
                  << " (" << (cost_map_size_ * sizeof(double)) / 1024 / 1024 << " MB)\n";
    }

    // Move constructor - efficient
    Path(Path&& other) noexcept
        : path_type_(std::move(other.path_type_)),
          waypoints_(std::move(other.waypoints_)),
          cost_map_(std::move(other.cost_map_)),
          cost_map_size_(other.cost_map_size_) {
        other.cost_map_size_ = 0;
        std::cout << "Path MOVED: " << path_type_ << "\n";
    }

    void addWaypoint(double x, double y, double theta, double curvature) {
        waypoints_.emplace_back(x, y, theta, curvature);
    }

    std::string getType() const { return path_type_; }
    size_t waypointCount() const { return waypoints_.size(); }
};

class PathPlanner {
public:
    // ✅ RVO: Return unnamed temporary (guaranteed C++17)
    Path planStraightPath() {
        std::cout << "Planning straight path...\n";
        return Path("straight_line", 100);  // Prvalue: mandatory elision
    }

    // ✅ NRVO: Return named local (optional but common)
    Path planCurvedPath() {
        std::cout << "Planning curved path...\n";
        Path curved("curved_lane_change", 500);
        for (int i = 0; i < 200; ++i) {
            curved.addWaypoint(i * 0.5, i * i * 0.01, i * 0.02, 0.1);
        }
        return curved;  // NRVO: likely applied, or automatic move
    }

    // ❌ BAD: std::move on return prevents NRVO
    Path planBadPath() {
        std::cout << "Planning path (with std::move)...\n";
        Path path("bad_example", 100);
        return std::move(path);  // Forces move, prevents RVO
    }

    // ✅ GOOD: Conditional returns with prvalues
    Path planConditionalPath(bool emergency) {
        if (emergency) {
            std::cout << "Emergency path!\n";
            return Path("emergency_stop", 50);  // RVO for this branch
        } else {
            std::cout << "Normal path\n";
            return Path("normal_cruise", 300);  // RVO for this branch
        }
    }

    // ❌ BAD: Conditional returns with named variables (prevents NRVO)
    Path planMultiPath(bool fast) {
        Path fast_path("fast_route", 200);
        Path safe_path("safe_route", 400);
        return fast ? fast_path : safe_path;  // Cannot elide, moves instead
    }
};

// Factory pattern with copy elision
class PathFactory {
public:
    static Path createParkingPath() {
        std::cout << "Factory creating parking path\n";
        return Path("parking_maneuver", 150);  // RVO
    }

    static Path createHighwayPath() {
        std::cout << "Factory creating highway path\n";
        Path highway("highway_cruise", 2000);
        // Simulate complex highway path generation
        for (int i = 0; i < 500; ++i) {
            highway.addWaypoint(i * 2.0, 0, 0, 0);
        }
        return highway;  // NRVO or automatic move
    }
};

// Pass by value with copy elision (C++17)
void executePath(Path path) {
    std::cout << "Executing path: " << path.getType()
              << " with " << path.waypointCount() << " waypoints\n";
}

int main() {
    PathPlanner planner;

    std::cout << "=== 1. Guaranteed RVO (C++17) ===\n";
    Path p1 = planner.planStraightPath();
    // Only one construction, no copy, no move
    std::cout << "\n";

    std::cout << "=== 2. NRVO (Optional but likely) ===\n";
    Path p2 = planner.planCurvedPath();
    // NRVO likely applied, or one move if not
    std::cout << "\n";

    std::cout << "=== 3. std::move prevents RVO ===\n";
    Path p3 = planner.planBadPath();
    // Forces move, worse than NRVO
    std::cout << "\n";

    std::cout << "=== 4. Conditional RVO ===\n";
    Path p4 = planner.planConditionalPath(true);
    Path p5 = planner.planConditionalPath(false);
    // RVO on each branch independently
    std::cout << "\n";

    std::cout << "=== 5. Multiple paths prevent NRVO ===\n";
    Path p6 = planner.planMultiPath(true);
    // Cannot determine which to elide, automatic move applies
    std::cout << "\n";

    std::cout << "=== 6. Factory Pattern with RVO ===\n";
    Path p7 = PathFactory::createParkingPath();
    Path p8 = PathFactory::createHighwayPath();
    std::cout << "\n";

    std::cout << "=== 7. Copy Elision in Function Arguments (C++17) ===\n";
    executePath(Path("temp_argument_path", 50));
    // Path constructed directly in parameter location
    std::cout << "\n";

    std::cout << "=== 8. Chain of returns (multiple RVO) ===\n";
    auto getParkingPath = []() { return PathFactory::createParkingPath(); };
    Path p9 = getParkingPath();
    // Elision through chain
    std::cout << "\n";

    std::cout << "=== 9. Non-Movable Type Example ===\n";
    // This pattern works because of guaranteed C++17 elision
    class NonMovablePath {
        std::unique_ptr<int[]> data_;
    public:
        NonMovablePath() : data_(std::make_unique<int[]>(100)) {
            std::cout << "NonMovablePath constructed\n";
        }
        NonMovablePath(const NonMovablePath&) = delete;
        NonMovablePath(NonMovablePath&&) = delete;
    };

    auto createNonMovable = []() { return NonMovablePath(); };
    NonMovablePath nm = createNonMovable();  // ✅ C++17: compiles due to mandatory elision
    std::cout << "\n";

    std::cout << "=== Summary ===\n";
    std::cout << "RVO and NRVO eliminate expensive copies of large path objects\n";
    std::cout << "Each Path contains ~8MB cost map + waypoint vector\n";
    std::cout << "Without RVO: 8MB+ allocation + memcpy per return\n";
    std::cout << "With RVO: zero-cost return, object constructed in place\n";

    return 0;
}
```

**Output (C++17 mode):**
```
=== 1. Guaranteed RVO (C++17) ===
Planning straight path...
Path 'straight_line' constructed (waypoints capacity: 100, cost map: 1000000 doubles)

=== 2. NRVO (Optional but likely) ===
Planning curved path...
Path 'curved_lane_change' constructed (waypoints capacity: 500, cost map: 1000000 doubles)

=== 3. std::move prevents RVO ===
Planning path (with std::move)...
Path 'bad_example' constructed (waypoints capacity: 100, cost map: 1000000 doubles)
Path MOVED: bad_example

=== 4. Conditional RVO ===
Emergency path!
Path 'emergency_stop' constructed (waypoints capacity: 50, cost map: 1000000 doubles)
Normal path
Path 'normal_cruise' constructed (waypoints capacity: 300, cost map: 1000000 doubles)

=== 5. Multiple paths prevent NRVO ===
Path 'fast_route' constructed (waypoints capacity: 200, cost map: 1000000 doubles)
Path 'safe_route' constructed (waypoints capacity: 400, cost map: 1000000 doubles)
Path MOVED: fast_route

=== 6. Factory Pattern with RVO ===
Factory creating parking path
Path 'parking_maneuver' constructed (waypoints capacity: 150, cost map: 1000000 doubles)
Factory creating highway path
Path 'highway_cruise' constructed (waypoints capacity: 2000, cost map: 1000000 doubles)

=== 7. Copy Elision in Function Arguments (C++17) ===
Path 'temp_argument_path' constructed (waypoints capacity: 50, cost map: 1000000 doubles)
Executing path: temp_argument_path with 0 waypoints

=== 8. Chain of returns (multiple RVO) ===
Factory creating parking path
Path 'parking_maneuver' constructed (waypoints capacity: 150, cost map: 1000000 doubles)

=== 9. Non-Movable Type Example ===
NonMovablePath constructed

=== Summary ===
RVO and NRVO eliminate expensive copies of large path objects
Each Path contains ~8MB cost map + waypoint vector
Without RVO: 8MB+ allocation + memcpy per return
With RVO: zero-cost return, object constructed in place
```

**Key Concepts Demonstrated:**

1. **Guaranteed RVO (C++17)**: Returning prvalues like `return Path("type")` guarantees copy elision—the object is constructed directly in the caller's location.

2. **NRVO**: Returning named local variables often elides copies, but it's not guaranteed by the standard (though modern compilers reliably apply it).

3. **std::move Harm**: Using `std::move(local)` in return statements prevents NRVO and forces a move, which is worse than elision.

4. **Conditional Returns**: Each branch returning a prvalue can benefit from RVO independently. Returning different named variables prevents NRVO.

5. **Argument Passing**: C++17 extends mandatory elision to prvalue arguments passed to functions.

6. **Non-Movable Types**: With guaranteed elision, you can return types that cannot be copied or moved.

7. **Performance Impact**: Each Path object contains an 8MB cost map. RVO eliminates the cost of copying this data entirely.

**Real-World Relevance**:

In autonomous vehicle path planning:
- **Path objects are large**: Typical paths contain 1000-5000 waypoints (32-160KB) plus cost maps (megabytes)
- **High Frequency**: Planning happens 5-10 times per second
- **Without RVO**: 10 returns/sec × 8MB/return = 80MB/s of unnecessary allocations and copies
- **With RVO**: Zero additional overhead—paths constructed directly where they'll be used
- **Real-Time Constraints**: Path planning must complete within 100ms deadlines; avoiding copies saves precious milliseconds
- **Memory Pressure**: Reduced allocations mean less GC pressure and more predictable latency
- **Factory Pattern**: Common in planning systems to create different path types; RVO makes factories zero-cost abstractions

This optimization is critical for meeting the strict real-time requirements of autonomous driving systems where predictable, low-latency performance is mandatory for safety.

---

### QUICK_REFERENCE: Answer Key and Summary Tables

#### Answer Key

| Q# | Answer | Explanation | Key Concept |
|----|--------|-------------|-------------|
| 1 | 1 | Only default constructor called. C++17 mandatory elision constructs Widget directly in `w` with no copy or move. | #mandatory_elision |
| 2 | Yes in C++17, No in C++14 | C++17 mandatory elision doesn't require copy/move constructors for prvalues. C++14 needs at least move constructor. | #mandatory_elision |
| 3 | CM | One default constructor (C), one move (M). `std::move(s)` prevents NRVO, forcing move constructor call. | #std_move_harm |
| 4 | 113 | Two constructions (11) for `a` and `b`, one move (3) for return. Multiple paths prevent NRVO, automatic move applies. | #multiple_returns |
| 5 | Nothing or "Move" once | `create1` likely uses NRVO (no output). `create2` with `std::move` forces move, prints "Move". NRVO prevented by std::move. | #nrvo |
| 6 | CXD | One construction (C), main prints (X), one destruction (D). C++17 elision eliminates all intermediate operations. | #mandatory_elision |
| 7 | 13 or 113 | One construction for S(5) (1), then move into parameter (3), then return uses automatic move (3). May vary with optimization. | #parameter_passing |
| 8 | D, D or DM, DM | get1: only D (RVO). get2: D or DM (NRVO or move). get3: DM (std::move prevents NRVO). | #rvo_vs_nrvo |
| 9 | CXD | Prints C (construct), X (from main), D (destruct). C++17 mandatory elision allows non-movable type. | #non_movable |
| 10 | 1P | One construction (1), then process prints P. C++17 elision constructs directly in parameter location. | #parameter_elision |
| 11 | C | Single construction. Both return paths return prvalues, each eligible for RVO, but only one path executes. | #multiple_returns |
| 12 | W | Only W printed. Modern compilers reliably apply NRVO for simple named returns like this. | #nrvo |
| 13 | RVO applies, but const prevents move | RVO works regardless of const. If NRVO didn't apply, const would prevent moving (but this is prvalue, so RVO guaranteed). | #const_return |
| 14 | 1 | Only 1 constructor called due to mandatory C++17 elision. Static counter only increments once. | #mandatory_elision |
| 15 | BD | Base constructor (B), Derived constructor (D). C++17 elision eliminates all moves, only default constructors called. | #inheritance |
| 16 | C | Static initialization: one construction when first accessed. Static local initialized once per program execution. | #static_initialization |
| 17 | VX | One construction (V), then X. RVO constructs in temporary, lifetime extended by const reference binding. | #lifetime_extension |
| 18 | 11 | Two constructions, one per array element. C++17 elision applies to each element independently. | #array_initialization |
| 19 | CCMM or CC | Two constructions for pair elements. May involve moves depending on make_pair implementation and optimization. | #pair_construction |
| 20 | S | One construction. Function-try-block doesn't prevent RVO. Exception handling syntax doesn't affect copy elision. | #exception_handling |

#### Copy Elision Decision Tree

| Scenario | Elision Type | C++17 Status | Example |
|----------|--------------|--------------|---------|
| Return unnamed temporary | RVO | Mandatory | `return T();` |
| Return named local variable | NRVO | Optional | `T obj; return obj;` |
| Return from multiple named locals | None | N/A (moves) | `return flag ? a : b;` |
| Return with std::move | None | N/A (moves) | `return std::move(obj);` |
| Return function parameter | None | N/A (moves) | `T func(T param) { return param; }` |
| Initialize from prvalue | Mandatory | Mandatory | `T obj = T();` |
| Initialize from function return (prvalue) | Mandatory | Mandatory | `T obj = func();` |
| Pass prvalue as argument | Argument elision | Mandatory | `func(T());` |

#### RVO vs NRVO vs Move Comparison

| Aspect | RVO (Unnamed) | NRVO (Named) | std::move | Copy |
|--------|---------------|--------------|-----------|------|
| C++17 guarantee | ✅ Mandatory | ❌ Optional | ❌ No elision | ❌ No elision |
| Syntax | `return T();` | `T obj; return obj;` | `return std::move(obj);` | `T obj; T copy = obj;` |
| Constructor calls | 0 extra | 0 extra (if applied) | 1 move | 1 copy |
| Works with non-movable | ✅ Yes | ✅ Yes (if applied) | ❌ No | ❌ No |
| Multiple return paths | ✅ Each path | ❌ Prevented | N/A | N/A |
| Compiler dependency | No (C++17+) | Yes | No | No |
| Performance | Best | Best (if applied) | Good | Poor |
| Recommendation | ✅ Use | ✅ Use | ❌ Avoid in returns | ❌ Avoid |

#### Common Copy Elision Mistakes

| Mistake | Problem | Correct Approach |
|---------|---------|------------------|
| `return std::move(local);` | Prevents NRVO, forces move | `return local;` |
| Returning by `const T` | Prevents move if elision doesn't apply | Return by plain `T` |
| Multiple named return variables | Prevents NRVO | Return temporaries: `return T();` |
| Returning function parameter | Cannot be elided | Consider return by value from local |
| Returning pointer to local | Undefined behavior | Return by value with RVO |
| Disabling elision for "correctness" | Pessimizes performance | Write correct copy/move constructors |

#### Copy Elision Across C++ Standards

| Standard | Prvalue Return | Named Return | Requirements |
|----------|----------------|--------------|--------------|
| C++11/14 | Optional | Optional | Copy/move constructor required |
| C++17 | **Mandatory** | Optional | Copy/move not required for prvalues |
| C++20 | **Mandatory** | Optional | Same as C++17 |

#### When Copy Elision Cannot Occur

| Situation | Reason | Alternative |
|-----------|--------|-------------|
| Multiple named return candidates | Compiler can't determine which to elide | Use automatic move |
| Returning parameter | Parameter storage already allocated | Automatic move applies |
| Returning with `std::move` | Explicit rvalue cast prevents elision | Remove `std::move` |
| Returning global/static variable | Not a local temporary | Cannot optimize |
| Conditional returning different variables | Runtime decision prevents compile-time elision | Automatic move applies |
| Returning member variable | Object lifetime different from return | Cannot optimize |

#### Optimization Guarantees Summary

| Return Pattern | Optimization | C++17 | Notes |
|----------------|--------------|-------|-------|
| `return T();` | RVO | ✅ Guaranteed | Prvalue, mandatory elision |
| `return func();` (prvalue) | RVO | ✅ Guaranteed | Prvalue chain, mandatory |
| `T obj; return obj;` | NRVO | ⚠️ Optional | Most compilers apply it |
| `return std::move(obj);` | None | ❌ Forces move | Worse than NRVO |
| `return flag ? a : b;` | None | ❌ Moves | Multiple candidates |
| `return param;` | None | ❌ Moves | Parameter return |
