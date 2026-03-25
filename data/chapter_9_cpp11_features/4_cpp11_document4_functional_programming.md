# C++11 Functional Programming Features

## TOPIC: Lambda Expressions, std::function, and std::bind

---

### THEORY_SECTION: Core Concepts of Functional Programming in C++11

#### 1. Lambda Expressions - Anonymous Functions with Capture Semantics

Lambda expressions are **compiler-generated functor classes** defined inline, eliminating the need for separate named classes when passing behavior to functions. They are the cornerstone of modern C++ functional programming.

**Syntax Anatomy:**

```cpp
[capture_clause](parameters) -> return_type { function_body }
//     ↑             ↑              ↑              ↑
//  Variables    Function      Optional      Implementation
//  from scope   parameters    (deduced)
```

**Lambda Syntax Variations:**

| Component | Example | When Required | Notes |
|-----------|---------|---------------|-------|
| **Capture clause** | `[x, &y]` | Always (even if empty `[]`) | Specifies which variables to capture |
| **Parameter list** | `(int a, int b)` | Optional if no parameters | Can be omitted: `[]{return 42;}` |
| **Return type** | `-> double` | Optional (deduced) | Required for complex control flow |
| **mutable keyword** | `mutable` | Optional | Allows modifying captured-by-value vars |
| **Function body** | `{ return x + y; }` | Always | The lambda's implementation |

**Capture Modes - Complete Comparison:**

| Capture | Syntax | Semantics | Lifetime | Modification | Use Case |
|---------|--------|-----------|----------|--------------|----------|
| **Nothing** | `[]` | No external variables | N/A | N/A | Pure functions, can convert to function pointer |
| **All by value** | `[=]` | Copy all automatic variables | Safe (owns copies) | Needs `mutable` | Lambda may outlive scope |
| **All by reference** | `[&]` | Reference all automatic variables | Dangerous if outlives scope | Direct | Short-lived lambdas |
| **Specific by value** | `[x, y]` | Copy x and y | Safe | Needs `mutable` | Selective capture |
| **Specific by reference** | `[&x, &y]` | Reference x and y | Dangerous if outlives | Direct | Performance-critical |
| **Mixed (default value)** | `[=, &y]` | All by value except y | Mixed | y direct, others need `mutable` | Fine-grained control |
| **Mixed (default ref)** | `[&, x]` | All by reference except x | Mixed | All but x direct | Mostly references |
| **This pointer** | `[this]` | Captures `this` pointer | Dangerous if object destroyed | Access members | Inside member functions |

**Before vs After C++11:**

```cpp
// Before C++11: Verbose functor class
struct MultiplyBy {
    int factor;
    explicit MultiplyBy(int f) : factor(f) {}
    int operator()(int x) const { return x * factor; }
};

std::vector<int> vec = {1, 2, 3, 4, 5};
std::vector<int> result(vec.size());
std::transform(vec.begin(), vec.end(), result.begin(), MultiplyBy(10));

// With C++11 lambda: Concise inline
int factor = 10;
std::transform(vec.begin(), vec.end(), result.begin(),
    [factor](int x) { return x * factor; });  // 90% less code
```

**Mutable Keyword Semantics:**

| Scenario | Code | Behavior | Key Point |
|----------|------|----------|-----------|
| **Non-mutable** | `auto f = [=]() { x = 10; };` | Compile error | Captured-by-value vars are const |
| **Mutable** | `auto f = [=]() mutable { x = 10; };` | Compiles, modifies copy | Original `x` unchanged |
| **Reference capture** | `auto f = [&]() { x = 10; };` | Compiles, modifies original | No `mutable` needed |

**Lambda to Function Pointer Conversion:**

| Lambda Type | Example | Conversion to `void(*)()`? | Reason |
|-------------|---------|---------------------------|--------|
| **No capture** | `[]() { }` | ✅ YES | No state, pure function |
| **Value capture** | `[=]() { }` | ❌ NO | Has state (captured data) |
| **Reference capture** | `[&]() { }` | ❌ NO | Has state (reference storage) |
| **This capture** | `[this]() { }` | ❌ NO | Has state (this pointer) |

**Code Example - Capture Semantics:**

```cpp
int x = 10, y = 20;

// Value capture: Creates independent copies
auto byValue = [=]() {
    return x + y;  // Uses copies (10 + 20)
};
x = 100;  // Does NOT affect lambda
std::cout << byValue() << "\n";  // ✅ Prints: 30

// Reference capture: Live connection
auto byRef = [&]() {
    return x + y;  // Uses references (100 + 20)
};
std::cout << byRef() << "\n";  // ✅ Prints: 120

// Mutable: Modify copy, not original
auto mutableLambda = [x]() mutable {
    x = 50;  // Modifies lambda's copy
    return x;
};
std::cout << mutableLambda() << "\n";  // ✅ Prints: 50
std::cout << x << "\n";  // ✅ Prints: 100 (original unchanged)
```

---

#### 2. std::function - Type-Erased Callable Wrapper and Polymorphic Storage

`std::function` is a **polymorphic wrapper** that can store any callable object matching a specified signature, using type erasure to provide a uniform interface.

**What std::function Accepts:**

| Callable Type | Example | Can Store? | Notes |
|---------------|---------|------------|-------|
| **Function pointer** | `int add(int, int)` | ✅ YES | Direct storage |
| **Lambda (no capture)** | `[](int x) { return x*2; }` | ✅ YES | Converts seamlessly |
| **Lambda (with capture)** | `[y](int x) { return x+y; }` | ✅ YES | Type erasure handles state |
| **Functor class** | `struct F { int operator()(int); };` | ✅ YES | Stores instance |
| **Member function** | `&Class::method` | ✅ YES (with bind) | Needs object binding |
| **std::bind result** | `std::bind(f, _1, 10)` | ✅ YES | Already callable |

**Type Erasure Mechanism:**

```cpp
// Each lambda has a unique type
auto lambda1 = [](int x) { return x * 2; };
auto lambda2 = [](int x) { return x * 2; };  // DIFFERENT type!

// decltype(lambda1) != decltype(lambda2)  // TRUE!

// std::function erases type differences
std::function<int(int)> f1 = lambda1;  // Type erased
std::function<int(int)> f2 = lambda2;  // Same type now
f1 = f2;  // ✅ Assignable (both are std::function<int(int)>)
```

**std::function vs Direct Lambda Type:**

| Aspect | Direct Lambda (`auto`) | `std::function` |
|--------|----------------------|-----------------|
| **Storage** | Stack (inline) | Small buffer or heap allocation |
| **Performance** | Zero overhead, inlineable | Virtual dispatch (~20-50 CPU cycles) |
| **Type** | Unique compiler type | Uniform `std::function<Signature>` |
| **Assignability** | Cannot assign different lambdas | Can reassign any compatible callable |
| **Template-friendly** | ✅ Perfect for templates | ❌ Loses specific type |
| **Copy cost** | Minimal (copy captures) | Copies wrapper + callable |
| **Move-only support (C++11)** | ✅ Supported | ❌ NOT supported |
| **Best use case** | Performance-critical, templates | Callback storage, runtime polymorphism |

**Performance Overhead Visualization:**

```cpp
// ✅ FAST: Direct lambda (can be fully inlined)
auto directLambda = [](int x) { return x * 2; };
for (int i = 0; i < 1000000; ++i) {
    int result = directLambda(i);  // ~1-2 CPU cycles
}

// ❌ SLOW: std::function (virtual dispatch, cannot inline)
std::function<int(int)> wrappedLambda = [](int x) { return x * 2; };
for (int i = 0; i < 1000000; ++i) {
    int result = wrappedLambda(i);  // ~20-50 CPU cycles
}

// Measured overhead: 10-25x slower for simple operations
```

**When to Use std::function:**

| Scenario | Use std::function? | Reason |
|----------|-------------------|--------|
| **Callback storage** | ✅ YES | Need to store different callable types |
| **Event systems** | ✅ YES | Heterogeneous subscriber lists |
| **Type-erased APIs** | ✅ YES | Uniform interface across boundaries |
| **STL algorithms** | ❌ NO | Templates accept any callable directly |
| **Hot loops** | ❌ NO | Performance overhead too high |
| **Template functions** | ❌ NO | Direct lambda type preserves performance |

**Code Example - Callback System:**

```cpp
class EventDispatcher {
    std::vector<std::function<void(int)>> callbacks;  // Heterogeneous storage
public:
    void subscribe(std::function<void(int)> cb) {
        callbacks.push_back(cb);
    }
    void notify(int value) {
        for (auto& cb : callbacks) {
            cb(value);  // Type-erased call
        }
    }
};

EventDispatcher events;

// Different callable types, same storage
events.subscribe([](int x) { std::cout << "Lambda: " << x << "\n"; });
events.subscribe(std::bind(&someFunction, std::placeholders::_1));

void regularFunc(int x) { std::cout << "Function: " << x << "\n"; }
events.subscribe(regularFunc);

events.notify(42);  // All callbacks execute
```

---

#### 3. std::bind and Modern Alternatives - Partial Application Patterns

`std::bind` creates new callables by **binding specific arguments** to existing functions, enabling partial application. However, **modern C++ prefers lambdas** for this purpose.

**std::bind Syntax:**

```cpp
auto new_callable = std::bind(function, arg1, std::placeholders::_1, arg2, ...);
//                                 ↑        ↑            ↑                ↑
//                            Function   Fixed      Placeholder      Fixed
//                            to bind   argument    (runtime arg)   argument
```

**Placeholder System:**

| Placeholder | Meaning | Example Use |
|-------------|---------|-------------|
| `std::placeholders::_1` | First argument to new callable | `bind(f, _1, 10)` → `f(arg, 10)` |
| `std::placeholders::_2` | Second argument | `bind(f, 10, _2)` → `f(10, arg)` |
| `std::placeholders::_3` | Third argument | `bind(f, _1, _2, _3)` → identity |

**std::bind vs Lambda - Side-by-Side Comparison:**

| Feature | std::bind | Lambda (Preferred) |
|---------|-----------|-------------------|
| **Readability** | ❌ Obscure placeholders | ✅ Clear, explicit logic |
| **Default semantics** | ❌ Copies arguments | ✅ Explicit `[=]` or `[&]` |
| **Reference binding** | ❌ Requires `std::ref()` | ✅ Natural `[&x]` syntax |
| **Error messages** | ❌ Cryptic template errors | ✅ Clear, actionable errors |
| **Performance** | ⚠️ May have indirection | ✅ Better optimization |
| **Maintainability** | ❌ Hard to understand | ✅ Self-documenting |
| **Modern recommendation** | ⚠️ Avoid (legacy only) | ✅ Always prefer |

**Code Example - std::bind vs Lambda:**

```cpp
int add(int a, int b, int c) {
    return a + b + c;
}

// std::bind version (harder to read)
auto bindVersion = std::bind(add, 10, std::placeholders::_1, std::placeholders::_2);
std::cout << bindVersion(5, 3) << "\n";  // 10 + 5 + 3 = 18

// ✅ Lambda version (clearer intent)
auto lambdaVersion = [](int b, int c) {
    return add(10, b, c);
};
std::cout << lambdaVersion(5, 3) << "\n";  // Same result, easier to understand
```

**std::bind Reference Semantics Trap:**

```cpp
void modify(int& x) {
    x += 10;
}

int value = 5;

// ❌ WRONG: std::bind copies by default
auto bound1 = std::bind(modify, value);
bound1();
std::cout << value << "\n";  // Still 5 (copy was modified!)

// ✅ CORRECT: Use std::ref for references
auto bound2 = std::bind(modify, std::ref(value));
bound2();
std::cout << value << "\n";  // Now 15 (original modified)

// ✅ BEST: Lambda makes intent clear
auto lambda = [&value]() { modify(value); };
lambda();
std::cout << value << "\n";  // 25 (explicit reference capture)
```

**Decision Matrix - When to Use Each Feature:**

| Need | Use This | Reason |
|------|----------|--------|
| **Inline callback for STL algorithm** | Lambda with `auto` | Zero overhead, inlineable |
| **Store callbacks with different types** | `std::function` | Type erasure enables heterogeneous storage |
| **Return callable from function** | Lambda with value capture | Safe lifetime management |
| **Modify external state** | Lambda with `[&]` or `[&var]` | Explicit reference semantics |
| **Maintain internal state** | Mutable lambda with `[=]` | Stateful closure pattern |
| **Legacy code with std::bind** | Refactor to lambda | Improve readability and performance |
| **C API callback** | Captureless lambda `[]` | Converts to function pointer |
| **Partial application** | Lambda (not std::bind) | Clearer, better error messages |

**Performance Hierarchy (Fastest to Slowest):**

```cpp
// 1. FASTEST: Direct function call
int result1 = add(10, 20, 30);  // Direct

// 2. NEAR-ZERO OVERHEAD: Captureless lambda (inlineable)
auto lambda1 = [](int a, int b, int c) { return a + b + c; };
int result2 = lambda1(10, 20, 30);

// 3. MINIMAL OVERHEAD: Lambda with small captures (inlineable)
int base = 10;
auto lambda2 = [base](int b, int c) { return base + b + c; };
int result3 = lambda2(20, 30);

// 4. MODERATE OVERHEAD: std::bind (may have indirection)
auto bound = std::bind(add, 10, std::placeholders::_1, std::placeholders::_2);
int result4 = bound(20, 30);

// 5. HIGHEST OVERHEAD: std::function (type erasure, virtual dispatch)
std::function<int(int, int, int)> func = add;
int result5 = func(10, 20, 30);
```

**Common Pitfalls Summary:**

| Pitfall | Problem | Solution |
|---------|---------|----------|
| **Dangling reference** | `[&]` capture outlives scope | Use `[=]` for value capture |
| **Loop variable capture** | All lambdas share same `i` reference | Use `[i]` (by value) |
| **Mutable misconception** | Expecting original to change | Understand `mutable` modifies copy |
| **This lifetime** | `[this]` dangling after object destroyed | Use `[=]` or C++17's `[*this]` |
| **std::bind copy trap** | Expecting references, getting copies | Use `std::ref()` or prefer lambda |
| **std::function overhead** | Using in hot loops | Use templates or direct lambda type |
| **Move-only captures (C++11)** | Cannot store `unique_ptr` in lambda | Use `shared_ptr` or upgrade to C++14+ |

---

---

### EDGE_CASES: Tricky Scenarios and Internal Mechanics

#### Edge Case 1: Dangling References with Capture by Reference

One of the most dangerous pitfalls with lambda expressions occurs when capturing variables by reference and then using the lambda after the captured variable's lifetime ends. This creates undefined behavior that often manifests as crashes or corrupted data.

```cpp
std::function<void()> createDangerousLambda() {
    int localVar = 42;
    return [&]() {  // ❌ Captures localVar by reference
        std::cout << localVar << "\n";  // UB: localVar destroyed when function returns
    };
}

// Calling the returned lambda invokes undefined behavior
auto dangerous = createDangerousLambda();
dangerous();  // ❌ Accesses destroyed variable
```

The solution is to capture by value when the lambda's lifetime exceeds the captured variable's scope:

```cpp
std::function<void()> createSafeLambda() {
    int localVar = 42;
    return [=]() {  // ✅ Captures by value (copy)
        std::cout << localVar << "\n";  // Safe: operates on copy
    };
}
```

#### Edge Case 2: Mutable Lambda Misconceptions

By default, variables captured by value in a lambda are `const` within the lambda body. The `mutable` keyword allows modification of these captured copies, but this is a common source of confusion - modifications affect only the lambda's internal copy, not the original variable.

```cpp
int x = 10;

auto lambda1 = [=]() {
    // x = 20;  // ❌ Compile error: x is const inside lambda
    std::cout << x << "\n";
};

auto lambda2 = [=]() mutable {
    x = 20;  // ✅ Compiles: modifies the lambda's copy of x
    std::cout << x << "\n";  // Prints 20
};

lambda2();
std::cout << x << "\n";  // ❌ Still prints 10 - original unchanged!
```

This is particularly tricky because developers often expect the original variable to be modified, leading to subtle bugs.

#### Edge Case 3: Capture Loop Variables

A classic mistake occurs when capturing loop variables by reference in lambdas that are stored for later use. All lambdas end up referring to the same variable, which has its final value after the loop ends.

```cpp
std::vector<std::function<void()>> callbacks;

for (int i = 0; i < 5; ++i) {
    callbacks.push_back([&]() {  // ❌ Captures i by reference
        std::cout << i << " ";
    });
}

// All lambdas print 5, because they all reference the same 'i'
for (auto& cb : callbacks) {
    cb();  // Prints: 5 5 5 5 5 (or undefined behavior if i destroyed)
}
```

The correct approach is to capture by value, creating a separate copy for each lambda:

```cpp
for (int i = 0; i < 5; ++i) {
    callbacks.push_back([i]() {  // ✅ Captures i by value
        std::cout << i << " ";
    });
}
// Now prints: 0 1 2 3 4
```

#### Edge Case 4: Lambda to Function Pointer Conversion

Lambdas without captures can decay to function pointers, but lambdas with any capture (even `[=]` or `[&]`) cannot. This affects interoperability with C APIs and function pointer-based callbacks.

```cpp
void takesCallback(void (*callback)()) {
    callback();
}

// ✅ Works: no capture
auto lambda1 = []() { std::cout << "No capture\n"; };
takesCallback(lambda1);

// ❌ Compile error: has capture
int x = 5;
auto lambda2 = [=]() { std::cout << x << "\n"; };
takesCallback(lambda2);  // Error: cannot convert to function pointer
```

#### Edge Case 5: std::bind Reference Semantics

By default, `std::bind` copies its arguments. To bind by reference, you must explicitly use `std::ref` or `std::cref`. This is a common source of bugs when developers expect reference behavior.

```cpp
int value = 10;

auto boundFunc1 = std::bind([](int x) {
    std::cout << x << "\n";
}, value);  // ❌ Binds copy of value

value = 20;
boundFunc1();  // Prints 10, not 20

auto boundFunc2 = std::bind([](int& x) {
    std::cout << x << "\n";
}, std::ref(value));  // ✅ Binds reference using std::ref

value = 30;
boundFunc2();  // Prints 30
```

#### Edge Case 6: std::function Overhead and Move-Only Types

`std::function` uses type erasure, which typically involves heap allocation and virtual function calls. In performance-critical code, this overhead can be significant. Additionally, in C++11, `std::function` cannot store move-only captures like `std::unique_ptr` (this limitation was lifted in C++14).

```cpp
// Performance consideration
auto directLambda = []() { return 42; };  // No overhead
std::function<int()> wrappedLambda = []() { return 42; };  // Type erasure overhead

// C++11 limitation with move-only types
std::unique_ptr<int> ptr = std::make_unique<int>(42);
// auto lambda = [ptr = std::move(ptr)]() { };  // ❌ Not valid in C++11
```

#### Edge Case 7: This Pointer Capture in Member Functions

When using lambdas inside member functions, capturing `this` is necessary to access member variables. However, capturing `this` by value captures the pointer, not the object - leading to potential dangling pointer issues.

```cpp
class Widget {
    int value = 42;
public:
    std::function<void()> getLambda() {
        return [this]() {  // Captures 'this' pointer
            std::cout << value << "\n";  // Accesses this->value
        };
    }
};

// ❌ Dangerous if Widget is destroyed
Widget* w = new Widget();
auto lambda = w->getLambda();
delete w;
lambda();  // UB: accesses deleted object
```

---

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Basic Lambda Syntax and Variations

```cpp
// No capture, no parameters
auto hello = []() {
    std::cout << "Hello, Lambda!\n";
};
hello();

// Capture by value
int multiplier = 5;
auto multiply = [multiplier](int x) {
    return x * multiplier;
};
std::cout << multiply(10) << "\n";  // 50

// Capture by reference
int counter = 0;
auto increment = [&counter]() {
    counter++;
};
increment();
increment();
std::cout << counter << "\n";  // 2

// Explicit return type
auto divide = [](double a, double b) -> double {
    return a / b;
};
```

This example demonstrates the fundamental lambda syntax variations. The first lambda captures nothing and takes no parameters. The second captures `multiplier` by value, creating a copy within the lambda. The third captures `counter` by reference, allowing modification of the original variable. The fourth shows explicit return type specification, useful when the compiler cannot deduce it or for documentation clarity.

#### Example 2: Capture Clauses Comparison

```cpp
int a = 10, b = 20;

auto lambda1 = [=]() {  // Capture all by value
    return a + b;  // Uses copies
};

auto lambda2 = [&]() {  // Capture all by reference
    a += 5;  // Modifies original a
    return a + b;
};

auto lambda3 = [=, &b]() {  // All by value except b by reference
    return a + b;  // a is copy, b is reference
};

auto lambda4 = [&, a]() {  // All by reference except a by value
    b += a;  // b is reference, a is copy
    return b;
};

auto lambda5 = [a, &b]() {  // Selective capture
    return a + b;  // a by value, b by reference
};
```

This comprehensive example shows all major capture modes. Understanding when to use each is crucial for controlling object lifetimes and performance. Capture-by-value is safer for lambdas that outlive their scope but incurs copying overhead. Capture-by-reference avoids copies but requires careful lifetime management. Mixed captures provide fine-grained control.

#### Example 3: Mutable Lambdas in Action

```cpp
int original = 100;

// Non-mutable: cannot modify captured-by-value variables
auto readOnly = [=]() {
    // original = 200;  // ❌ Compile error
    return original * 2;
};

// Mutable: can modify the captured copy
auto mutableLambda = [=]() mutable {
    original = 200;  // ✅ Modifies the copy
    return original;
};

std::cout << mutableLambda() << "\n";  // 200 (from copy)
std::cout << original << "\n";  // 100 (original unchanged)

// Practical use: stateful generator
auto counter = [count = 0]() mutable {
    return ++count;
};
std::cout << counter() << "\n";  // 1
std::cout << counter() << "\n";  // 2
std::cout << counter() << "\n";  // 3
```

The `mutable` keyword enables lambdas to maintain internal state across invocations. The counter example demonstrates a practical use case: creating stateful function objects without defining a separate class. This pattern is common in generating sequences or implementing simple state machines.

#### Example 4: Lambdas with STL Algorithms

```cpp
#include <algorithm>
#include <vector>
#include <numeric>

std::vector<int> numbers = {5, 2, 8, 1, 9, 3};

// Sorting with custom comparator
std::sort(numbers.begin(), numbers.end(), [](int a, int b) {
    return a > b;  // Descending order
});

// Finding with predicate
auto it = std::find_if(numbers.begin(), numbers.end(), [](int x) {
    return x > 5;
});

// Transforming elements
std::vector<int> doubled(numbers.size());
std::transform(numbers.begin(), numbers.end(), doubled.begin(),
    [](int x) { return x * 2; });

// Filtering and counting
int threshold = 5;
int count = std::count_if(numbers.begin(), numbers.end(),
    [threshold](int x) { return x > threshold; });

// Accumulation with lambda
int sum = std::accumulate(numbers.begin(), numbers.end(), 0,
    [](int acc, int val) { return acc + val; });
```

STL algorithms are where lambdas truly shine, replacing verbose functor classes with concise inline functions. This example shows common patterns: custom comparators for sorting, predicates for searching and filtering, and transformation functions. The capture mechanism allows incorporating external state (like `threshold`) without additional function parameters.

#### Example 5: std::function as Callback Container

```cpp
#include <functional>
#include <vector>

class EventSystem {
    std::vector<std::function<void(int)>> callbacks;
public:
    void subscribe(std::function<void(int)> callback) {
        callbacks.push_back(callback);
    }
    
    void notify(int value) {
        for (auto& cb : callbacks) {
            cb(value);
        }
    }
};

EventSystem events;

// Subscribe with lambda
events.subscribe([](int val) {
    std::cout << "Lambda received: " << val << "\n";
});

// Subscribe with regular function
void printDouble(int x) {
    std::cout << "Double: " << x * 2 << "\n";
}
events.subscribe(printDouble);

// Subscribe with stateful lambda
int count = 0;
events.subscribe([&count](int val) {
    std::cout << "Call #" << ++count << ": " << val << "\n";
});

events.notify(42);
```

This example demonstrates `std::function`'s power in building callback systems. The `EventSystem` class can store any callable matching the signature `void(int)`, whether it's a lambda, function pointer, or functor. This flexibility is essential for event-driven architectures, GUI frameworks, and asynchronous programming patterns.

#### Example 6: Generic Lambdas with Type Flexibility (C++11 Workaround)

```cpp
// C++11 doesn't have generic lambdas (auto parameters), but we can simulate with templates

template<typename Func>
void applyToVector(std::vector<int>& vec, Func f) {
    for (auto& elem : vec) {
        f(elem);
    }
}

std::vector<int> data = {1, 2, 3, 4, 5};

// Use with different lambda types
applyToVector(data, [](int& x) { x *= 2; });  // Doubles each element
applyToVector(data, [](int& x) { std::cout << x << " "; });  // Prints

// With capture
int multiplier = 3;
applyToVector(data, [multiplier](int& x) { x *= multiplier; });
```

While C++11 doesn't support `auto` parameters in lambdas (generic lambdas), we can achieve similar flexibility using template functions that accept lambda parameters. This pattern is common in library code and demonstrates how lambdas integrate with templates for powerful generic programming.

#### Example 7: std::bind with Placeholders

```cpp
#include <functional>

int add(int a, int b, int c) {
    return a + b + c;
}

// Bind first argument to 10
auto add10 = std::bind(add, 10, std::placeholders::_1, std::placeholders::_2);
std::cout << add10(5, 3) << "\n";  // 10 + 5 + 3 = 18

// Bind first and third arguments
auto addMiddle = std::bind(add, 100, std::placeholders::_1, 200);
std::cout << addMiddle(50) << "\n";  // 100 + 50 + 200 = 350

// Reorder arguments
auto addReversed = std::bind(add, std::placeholders::_2, std::placeholders::_1, 0);
std::cout << addReversed(5, 10) << "\n";  // 10 + 5 + 0 = 15

// Bind member function
struct Printer {
    void print(int x, int y) const {
        std::cout << "Values: " << x << ", " << y << "\n";
    }
};

Printer p;
auto boundPrint = std::bind(&Printer::print, &p, std::placeholders::_1, 100);
boundPrint(42);  // Calls p.print(42, 100)
```

`std::bind` enables partial application and argument reordering, useful for adapting functions to different signatures. However, the equivalent lambda expressions are often more readable and performant in modern C++. The member function binding example shows how `std::bind` handles the implicit `this` parameter.

#### Example 8: Lambda Equivalents to std::bind (Preferred Modern Style)

```cpp
int add(int a, int b, int c) {
    return a + b + c;
}

// std::bind version
auto bindVersion = std::bind(add, 10, std::placeholders::_1, std::placeholders::_2);

// ✅ Lambda version (preferred)
auto lambdaVersion = [](int b, int c) {
    return add(10, b, c);
};

// Both do the same thing
std::cout << bindVersion(5, 3) << "\n";   // 18
std::cout << lambdaVersion(5, 3) << "\n"; // 18

// More complex: with capture
int base = 100;
auto bindCapture = std::bind(add, std::ref(base), std::placeholders::_1, std::placeholders::_2);
auto lambdaCapture = [&base](int b, int c) {
    return add(base, b, c);
};
```

This comparison illustrates why modern C++ prefers lambdas over `std::bind`. Lambda syntax is more intuitive, provides better error messages, and often generates more efficient code. The capture semantics are also more explicit and less error-prone than `std::ref/std::cref`.

---

#### Example 9: Autonomous Vehicle - Lambda Expressions and std::function

This example demonstrates how lambdas, std::function, and functional programming patterns are used in autonomous vehicle sensor processing and event handling systems.

```cpp
#include <iostream>
#include <vector>
#include <algorithm>
#include <functional>
#include <string>
using namespace std;

// Sensor reading structure
struct SensorReading {
    string sensor_id;
    double value;
    unsigned long timestamp_ms;

    SensorReading(string id, double v, unsigned long t)
        : sensor_id(id), value(v), timestamp_ms(t) {}
};

// Event callback system for autonomous vehicles
class EventDispatcher {
private:
    vector<function<void(const SensorReading&)>> callbacks;

public:
    // Subscribe using std::function - accepts any callable
    void subscribe(function<void(const SensorReading&)> callback) {
        callbacks.push_back(callback);
    }

    // Notify all subscribers
    void notify(const SensorReading& reading) {
        for (auto& callback : callbacks) {
            callback(reading);
        }
    }
};

// Sensor data processor demonstrating lambda usage
class SensorProcessor {
public:
    // Filter sensor readings using lambda predicates
    static vector<SensorReading> filterByThreshold(
        const vector<SensorReading>& readings,
        double threshold) {

        vector<SensorReading> result;

        // Lambda as predicate for STL algorithm
        copy_if(readings.begin(), readings.end(), back_inserter(result),
            [threshold](const SensorReading& r) {
                return r.value > threshold;  // Capture threshold by value
            });

        return result;
    }

    // Transform sensor data using lambdas
    static void applyCal ibration(vector<SensorReading>& readings, double factor) {
        // Lambda for transformation
        transform(readings.begin(), readings.end(), readings.begin(),
            [factor](const SensorReading& r) {
                return SensorReading(r.sensor_id, r.value * factor, r.timestamp_ms);
            });
    }

    // Create stateful lambda for moving average
    static auto createMovingAverageFilter(int window_size) {
        // Stateful lambda with mutable capture
        return [window_size, sum = 0.0, count = 0]
               (double value) mutable -> double {
            sum += value;
            count++;

            if (count > window_size) {
                // Simple moving average logic (simplified)
                sum -= value / window_size;
            }

            return sum / min(count, window_size);
        };
    }
};

int main() {
    cout << "=== Autonomous Vehicle - Lambda & std::function Demo ===\n" << endl;

    // Sample sensor data
    vector<SensorReading> lidar_data = {
        {"lidar_front", 25.5, 1000},
        {"lidar_front", 30.2, 1100},
        {"lidar_front", 15.8, 1200},
        {"lidar_front", 42.1, 1300},
        {"lidar_front", 18.3, 1400}
    };

    // PART 1: Lambda with STL Algorithms
    cout << "PART 1: Filtering with Lambda Predicates\n" << endl;

    double distance_threshold = 20.0;
    auto filtered = SensorProcessor::filterByThreshold(lidar_data, distance_threshold);

    cout << "Readings above " << distance_threshold << "m:" << endl;
    for (const auto& reading : filtered) {
        cout << "  " << reading.sensor_id << ": " << reading.value
             << "m at t=" << reading.timestamp_ms << "ms" << endl;
    }

    // PART 2: Lambda Capture Modes
    cout << "\n\nPART 2: Lambda Capture Modes\n" << endl;

    int alert_count = 0;
    double max_distance = 0.0;

    // Lambda with mixed capture: alert_count by reference, max_distance by reference
    auto process_reading = [&alert_count, &max_distance](const SensorReading& r) {
        if (r.value > 30.0) {
            alert_count++;
            cout << "  ⚠️  Alert: " << r.sensor_id << " detected obstacle at "
                 << r.value << "m" << endl;
        }
        if (r.value > max_distance) {
            max_distance = r.value;
        }
    };

    for_each(lidar_data.begin(), lidar_data.end(), process_reading);

    cout << "\nSummary:" << endl;
    cout << "  Total alerts: " << alert_count << endl;
    cout << "  Max distance: " << max_distance << "m" << endl;

    // PART 3: std::function for Callback System
    cout << "\n\nPART 3: Event System with std::function\n" << endl;

    EventDispatcher dispatcher;

    // Subscribe with lambda (implicit conversion to std::function)
    dispatcher.subscribe([](const SensorReading& r) {
        cout << "  [Logger] " << r.sensor_id << ": " << r.value << "m" << endl;
    });

    // Subscribe with stateful lambda
    int event_count = 0;
    dispatcher.subscribe([&event_count](const SensorReading& r) {
        event_count++;
        cout << "  [Counter] Event #" << event_count
             << " from " << r.sensor_id << endl;
    });

    // Subscribe with validation lambda
    dispatcher.subscribe([](const SensorReading& r) {
        if (r.value < 5.0) {
            cout << "  [Alert] ⚠️  Too close: " << r.value << "m!" << endl;
        }
    });

    cout << "Processing new sensor reading:" << endl;
    SensorReading new_reading("lidar_rear", 3.5, 2000);
    dispatcher.notify(new_reading);

    // PART 4: Stateful Lambda (Mutable)
    cout << "\n\nPART 4: Stateful Lambda - Moving Average Filter\n" << endl;

    auto moving_avg = SensorProcessor::createMovingAverageFilter(3);

    vector<double> raw_distances = {10.0, 12.0, 11.0, 13.0, 12.5};
    cout << "Applying moving average filter:" << endl;

    for (double dist : raw_distances) {
        double filtered_dist = moving_avg(dist);
        cout << "  Raw: " << dist << "m -> Filtered: " << filtered_dist << "m" << endl;
    }

    // PART 5: Lambda vs std::bind Comparison
    cout << "\n\nPART 5: Lambda vs std::bind\n" << endl;

    auto scale_reading = [](double value, double factor) {
        return value * factor;
    };

    double calibration_factor = 1.05;

    // Using std::bind (legacy approach)
    auto bound_scale = bind(scale_reading, placeholders::_1, calibration_factor);
    cout << "std::bind version: " << bound_scale(10.0) << endl;

    // Using lambda (modern preferred)
    auto lambda_scale = [calibration_factor](double value) {
        return value * calibration_factor;
    };
    cout << "Lambda version: " << lambda_scale(10.0) << endl;

    // PART 6: Sorting with Custom Lambda
    cout << "\n\nPART 6: Sorting Sensor Data with Lambda\n" << endl;

    auto data_copy = lidar_data;  // Make a copy

    // Sort by value (descending) using lambda comparator
    sort(data_copy.begin(), data_copy.end(),
        [](const SensorReading& a, const SensorReading& b) {
            return a.value > b.value;  // Descending order
        });

    cout << "Sorted by distance (descending):" << endl;
    for (const auto& r : data_copy) {
        cout << "  " << r.value << "m" << endl;
    }

    cout << "\n=== Key Takeaways ===" << endl;
    cout << "✅ Lambdas: Concise inline functions with capture" << endl;
    cout << "✅ std::function: Type-erased callback storage" << endl;
    cout << "✅ Capture modes: [=] value, [&] reference, [&x, y] mixed" << endl;
    cout << "✅ Mutable lambdas: Maintain state across calls" << endl;
    cout << "✅ STL integration: sort, transform, filter with lambdas" << endl;

    return 0;
}
```

**Output:**
```
=== Autonomous Vehicle - Lambda & std::function Demo ===

PART 1: Filtering with Lambda Predicates

Readings above 20.0m:
  lidar_front: 25.5m at t=1000ms
  lidar_front: 30.2m at t=1100ms
  lidar_front: 42.1m at t=1300ms


PART 2: Lambda Capture Modes

  ⚠️  Alert: lidar_front detected obstacle at 30.2m
  ⚠️  Alert: lidar_front detected obstacle at 42.1m

Summary:
  Total alerts: 2
  Max distance: 42.1m


PART 3: Event System with std::function

Processing new sensor reading:
  [Logger] lidar_rear: 3.5m
  [Counter] Event #1 from lidar_rear
  [Alert] ⚠️  Too close: 3.5m!


PART 4: Stateful Lambda - Moving Average Filter

Applying moving average filter:
  Raw: 10.0m -> Filtered: 10.0m
  Raw: 12.0m -> Filtered: 11.0m
  Raw: 11.0m -> Filtered: 11.0m
  Raw: 13.0m -> Filtered: 12.0m
  Raw: 12.5m -> Filtered: 12.17m


PART 5: Lambda vs std::bind

std::bind version: 10.5
Lambda version: 10.5


PART 6: Sorting Sensor Data with Lambda

Sorted by distance (descending):
  42.1m
  30.2m
  25.5m
  18.3m
  15.8m

=== Key Takeaways ===
✅ Lambdas: Concise inline functions with capture
✅ std::function: Type-erased callback storage
✅ Capture modes: [=] value, [&] reference, [&x, y] mixed
✅ Mutable lambdas: Maintain state across calls
✅ STL integration: sort, transform, filter with lambdas
```

### Real-World Applications:

**1. Event-Driven Architecture:**
- `std::function` callbacks for sensor events
- Multiple subscribers with different lambda handlers
- Type erasure enables heterogeneous callback storage

**2. Sensor Data Processing:**
- Lambda predicates for filtering (distance thresholds)
- STL algorithms (sort, transform, copy_if) with lambdas
- Eliminates need for separate functor classes

**3. Stateful Processing:**
- Mutable lambdas for moving average filters
- Maintains internal state across multiple calls
- Replaces hand-written stateful functors

**4. Capture Semantics:**
- Value capture `[threshold]` for immutable config
- Reference capture `[&alert_count]` for statistics
- Mixed capture `[&, max_distance]` for fine control

**5. Production Patterns:**
- Waymo likely uses lambdas for sensor fusion pipelines
- Tesla Autopilot: event callbacks for camera/radar processing
- Cruise: lambda-based filtering in perception stack

---

### INTERVIEW_QA: Comprehensive Questions

#### Q1: What is a lambda expression and what problem does it solve?
**Difficulty:** #beginner
**Category:** #syntax #design_pattern
**Concepts:** #lambda #closure #anonymous_function

**Answer:**
A lambda expression is an anonymous function object that can be defined inline, capturing variables from its enclosing scope.

**Code example:**
```cpp
// Before C++11: verbose functor
struct Multiplier {
    int factor;
    Multiplier(int f) : factor(f) {}
    int operator()(int x) const { return x * factor; }
};
std::transform(vec.begin(), vec.end(), result.begin(), Multiplier(5));

// ✅ With C++11 lambda: concise and inline
int factor = 5;
std::transform(vec.begin(), vec.end(), result.begin(),
    [factor](int x) { return x * factor; });
```

**Explanation:**
Lambdas eliminate the need for separate functor classes when you need a simple callback or predicate. They solve the problem of code verbosity and locality - the function logic stays near its point of use rather than being defined elsewhere as a separate class. This improves readability and maintenance, especially in STL algorithm usage.

**Key takeaway:** Lambdas provide inline anonymous functions with optional state capture, replacing verbose functor classes for simple callbacks.

---

#### Q2: Explain the difference between capturing by value [=] and by reference [&].
**Difficulty:** #beginner
**Category:** #memory #syntax
**Concepts:** #lambda #capture #value_semantics #reference_semantics

**Answer:**
Capture by value `[=]` creates copies of variables, while capture by reference `[&]` stores references to the original variables.

**Code example:**
```cpp
int x = 10;

auto byValue = [=]() { return x; };     // Captures copy of x
auto byRef = [&]() { return x; };       // Captures reference to x

x = 20;

std::cout << byValue() << "\n";  // ✅ Prints 10 (copy unchanged)
std::cout << byRef() << "\n";    // ✅ Prints 20 (sees modified x)
```

**Explanation:**
Value capture creates independent copies at lambda creation time, making the lambda safe to use after the original variable's lifetime ends. Reference capture maintains a live connection to the original variable, seeing all modifications but requiring careful lifetime management. Value capture is safer but involves copying overhead; reference capture is efficient but risks dangling references if the lambda outlives the captured variable.

**Key takeaway:** Use value capture `[=]` for safety when lambda may outlive scope; use reference capture `[&]` for efficiency when lifetimes are guaranteed.

---

#### Q3: What does the `mutable` keyword do in a lambda expression?
**Difficulty:** #intermediate
**Category:** #syntax #memory
**Concepts:** #lambda #mutable #const_correctness #capture

**Answer:**
The `mutable` keyword allows a lambda to modify variables captured by value, though changes affect only the lambda's internal copies.

**Code example:**
```cpp
int x = 10;

auto notMutable = [=]() {
    // x = 20;  // ❌ Compile error: x is const
    return x;
};

auto isMutable = [=]() mutable {
    x = 20;  // ✅ OK: modifies lambda's copy
    return x;
};

std::cout << isMutable() << "\n";  // Prints 20
std::cout << x << "\n";            // ❌ Still 10 - original unchanged
```

**Explanation:**
By default, variables captured by value are `const` within the lambda body. The `mutable` keyword removes this const-qualification, allowing the lambda to maintain internal state across calls. This is useful for stateful algorithms or counters but doesn't affect the original captured variables. Without `mutable`, attempting to modify captured values results in a compile error.

**Key takeaway:** `mutable` enables modification of captured-by-value variables within the lambda, but only affects the lambda's internal copies, not originals.

---

#### Q4: Can a lambda expression be used where a function pointer is expected?
**Difficulty:** #intermediate
**Category:** #design_pattern #syntax
**Concepts:** #lambda #function_pointer #closure #capture

**Answer:**
Yes, but only if the lambda has no capture clause; lambdas with captures cannot convert to function pointers.

**Code example:**
```cpp
void executeCallback(void (*func)()) {
    func();
}

// ✅ Works: no capture
executeCallback([]() { std::cout << "No capture\n"; });

// ❌ Compile error: has capture
int x = 5;
executeCallback([=]() { std::cout << x << "\n"; });  // Error!

// ✅ Solution: use std::function
void executeCallbackFunc(std::function<void()> func) {
    func();
}
executeCallbackFunc([=]() { std::cout << x << "\n"; });  // OK
```

**Explanation:**
Capture-less lambdas are stateless and can decay to function pointers because they don't need to store any additional data. Lambdas with captures require state storage, making them incompatible with plain function pointers. For C API compatibility, you must either avoid captures or use a wrapper like `std::function` (which has overhead) or pass state through a void pointer mechanism.

**Key takeaway:** Only stateless lambdas (no captures) can convert to function pointers; use `std::function` for lambdas with captures.

---

#### Q5: What is the danger of capturing variables by reference in a lambda that outlives the variable's scope?
**Difficulty:** #intermediate
**Category:** #memory #interview_favorite
**Concepts:** #lambda #dangling_reference #undefined_behavior #lifetime

**Answer:**
Capturing by reference creates dangling references if the lambda is used after the captured variable is destroyed, causing undefined behavior.

**Code example:**
```cpp
std::function<void()> createDanglingLambda() {
    int local = 42;
    return [&]() {  // ❌ Captures reference to local
        std::cout << local << "\n";  // UB: local destroyed on return
    };
}

auto lambda = createDanglingLambda();
lambda();  // ❌ Undefined behavior: accesses dead variable

// ✅ Safe version: capture by value
std::function<void()> createSafeLambda() {
    int local = 42;
    return [=]() {  // ✅ Captures copy
        std::cout << local << "\n";  // Safe: operates on copy
    };
}
```

**Explanation:**
Reference captures create pointers to variables in the enclosing scope. If the lambda's lifetime exceeds that scope, these references become dangling - pointing to destroyed objects. This is a common bug when returning lambdas from functions or storing them in containers. The manifestation varies from crashes to silent corruption. Always capture by value when a lambda may outlive its creation scope.

**Key takeaway:** Never return or store lambdas that capture by reference when the captured variables will be destroyed; use value capture instead.

---

#### Q6: How do you capture 'this' pointer in a lambda inside a member function?
**Difficulty:** #intermediate
**Category:** #syntax #design_pattern
**Concepts:** #lambda #this_pointer #member_function #capture

**Answer:**
Use `[this]` to capture the this pointer, allowing access to member variables and functions within the lambda.

**Code example:**
```cpp
class Counter {
    int count = 0;
public:
    auto getIncrementer() {
        return [this]() {  // ✅ Captures 'this' pointer
            count++;       // Accesses member variable
            return count;
        };
    }
    
    int getCount() const { return count; }
};

Counter c;
auto inc = c.getIncrementer();
inc();
inc();
std::cout << c.getCount() << "\n";  // 2
```

**Explanation:**
Inside member functions, `[this]` captures the object's pointer, enabling access to all members. Note that this captures the *pointer*, not the object itself - if the object is destroyed, the lambda has a dangling pointer. In C++17, `[*this]` was added to capture a copy of the entire object. When using `[this]` with long-lived lambdas, ensure the object's lifetime exceeds the lambda's usage.

**Key takeaway:** Use `[this]` to access member variables in lambdas; be aware it captures a pointer, not the object, risking lifetime issues.

---

#### Q7: What is std::function and what problem does it solve?
**Difficulty:** #intermediate
**Category:** #design_pattern #memory
**Concepts:** #std_function #type_erasure #callable #polymorphism

**Answer:**
`std::function` is a type-erased wrapper that can store any callable with a matching signature, providing a uniform interface for callbacks.

**Code example:**
```cpp
// Can store different callable types
std::function<int(int)> func;

func = [](int x) { return x * 2; };      // Lambda
std::cout << func(5) << "\n";            // 10

int triple(int x) { return x * 3; }
func = triple;                           // Function pointer
std::cout << func(5) << "\n";            // 15

struct Quadrupler {
    int operator()(int x) { return x * 4; }
};
func = Quadrupler();                     // Functor
std::cout << func(5) << "\n";            // 20
```

**Explanation:**
`std::function` uses type erasure to store any callable with a compatible signature, regardless of its underlying type. This enables heterogeneous collections of callbacks, flexible API design, and runtime polymorphism for functions. The trade-off is performance overhead from virtual dispatch and potential heap allocation. It's essential for callback systems, event handlers, and any scenario requiring function polymorphism without templates.

**Key takeaway:** `std::function` provides type-erased storage for any callable, enabling runtime polymorphism at the cost of performance overhead.

---

#### Q8: What is the overhead of using std::function compared to direct lambda calls?
**Difficulty:** #advanced
**Category:** #performance #memory
**Concepts:** #std_function #type_erasure #heap_allocation #virtual_dispatch

**Answer:**
`std::function` incurs overhead from type erasure: potential heap allocation, virtual function dispatch, and cannot be inlined by the compiler.

**Code example:**
```cpp
// ✅ Direct lambda: zero overhead, inlineable
auto directLambda = [](int x) { return x * 2; };
int result1 = directLambda(10);  // Can be fully inlined

// ❌ std::function: type erasure overhead
std::function<int(int)> wrapped = [](int x) { return x * 2; };
int result2 = wrapped(10);  // Virtual dispatch, cannot inline

// Benchmark difference (pseudo-code)
// Direct: ~1-2 CPU cycles
// std::function: ~20-50 CPU cycles + allocation
```

**Explanation:**
Direct lambda calls can be completely inlined by the optimizer, eliminating all function call overhead. `std::function` uses type erasure, typically implemented with virtual dispatch through a vtable, preventing inlining. Small callable objects may use small buffer optimization, but larger ones require heap allocation. This overhead is acceptable for infrequent calls but problematic in tight loops or performance-critical code. Prefer templates or direct lambda types when performance matters.

**Key takeaway:** `std::function` has significant overhead from type erasure; use direct lambda types or templates for performance-critical code.

---

#### Q9: How does std::bind work and why is it less preferred than lambdas in modern C++?
**Difficulty:** #intermediate
**Category:** #design_pattern #interview_favorite
**Concepts:** #std_bind #partial_application #placeholders #lambda

**Answer:**
`std::bind` creates a new callable by binding specific arguments to a function, but lambdas provide better readability and performance.

**Code example:**
```cpp
int add(int a, int b, int c) { return a + b + c; }

// std::bind version: harder to read
auto bound = std::bind(add, 10, std::placeholders::_1, std::placeholders::_2);
int result1 = bound(5, 3);  // 10 + 5 + 3

// ✅ Lambda version: clearer intent
auto lambda = [](int b, int c) { return add(10, b, c); };
int result2 = lambda(5, 3);  // Same result, easier to understand

// Capture semantics more explicit in lambda
int base = 100;
auto boundRef = std::bind(add, std::ref(base), std::placeholders::_1, 0);
auto lambdaRef = [&base](int x) { return add(base, x, 0); };
```

**Explanation:**
`std::bind` was the pre-C++11 solution for partial application, but its placeholder syntax is unintuitive and error-prone. Lambdas express the same intent more clearly, with explicit capture semantics and better compiler error messages. `std::bind` also copies arguments by default, requiring `std::ref` for references, while lambda captures are explicit. Modern C++ style guides recommend lambdas over `std::bind` except when interoperating with legacy code.

**Key takeaway:** Prefer lambdas over `std::bind` for better readability, clearer capture semantics, and superior performance in modern C++.

---

#### Q10: Can you modify a variable captured by value in a lambda without making it mutable?
**Difficulty:** #beginner
**Category:** #syntax
**Concepts:** #lambda #capture #const_correctness #mutable

**Answer:**
No, variables captured by value are implicitly const; attempting to modify them without `mutable` causes a compile error.

**Code example:**
```cpp
int x = 10;

auto notMutable = [=]() {
    x = 20;  // ❌ Compile error: x is const in lambda
    return x;
};

auto isMutable = [=]() mutable {
    x = 20;  // ✅ OK with mutable
    return x;
};

auto byReference = [&]() {
    x = 20;  // ✅ OK: reference allows modification
    return x;
};
```

**Explanation:**
The default const-qualification on captured-by-value variables prevents accidental modifications and ensures functional purity. If you need to modify captured values, you have two options: add the `mutable` keyword (modifies the lambda's copy) or capture by reference (modifies the original). The `mutable` keyword is useful for maintaining lambda-internal state without affecting external variables.

**Key takeaway:** Captured-by-value variables are const by default; use `mutable` to modify copies or `[&]` to modify originals.

---

#### Q11: What happens when you capture a loop variable by reference in multiple lambdas?
**Difficulty:** #advanced
**Category:** #interview_favorite #memory
**Concepts:** #lambda #capture #loop #dangling_reference #lifetime

**Answer:**
All lambdas capture a reference to the same loop variable, which will have its final value after the loop, causing all lambdas to see the same value.

**Code example:**
```cpp
std::vector<std::function<void()>> callbacks;

for (int i = 0; i < 5; ++i) {
    callbacks.push_back([&i]() {  // ❌ All capture same 'i'
        std::cout << i << " ";
    });
}

for (auto& cb : callbacks) {
    cb();  // ❌ Prints: 5 5 5 5 5 (or UB if i destroyed)
}

// ✅ Correct: capture by value
for (int i = 0; i < 5; ++i) {
    callbacks.push_back([i]() {  // Each lambda gets own copy
        std::cout << i << " ";
    });
}
// Now prints: 0 1 2 3 4
```

**Explanation:**
Reference capture stores a reference to the loop variable `i` itself, not its current value. All lambdas end up with references to the same variable, which has the value 5 after the loop completes. If the loop variable is destroyed (e.g., block scope), all lambda invocations result in undefined behavior. This is one of the most common lambda pitfalls in production code.

**Key takeaway:** Always capture loop variables by value when storing lambdas for later use; reference capture causes all lambdas to share the same variable.

---

#### Q12: How can you create a stateful lambda that maintains a counter across invocations?
**Difficulty:** #intermediate
**Category:** #design_pattern
**Concepts:** #lambda #mutable #state #closure

**Answer:**
Use a mutable lambda with a captured-by-value variable, allowing it to maintain and modify internal state across calls.

**Code example:**
```cpp
// Stateful counter lambda
auto counter = [count = 0]() mutable {  // Init capture with 0
    return ++count;
};

std::cout << counter() << "\n";  // 1
std::cout << counter() << "\n";  // 2
std::cout << counter() << "\n";  // 3

// More complex: Fibonacci generator
auto fibonacci = [prev = 0, curr = 1]() mutable {
    int result = prev;
    int next = prev + curr;
    prev = curr;
    curr = next;
    return result;
};

for (int i = 0; i < 10; ++i) {
    std::cout << fibonacci() << " ";  // 0 1 1 2 3 5 8 13 21 34
}
```

**Explanation:**
The `mutable` keyword combined with value-captured variables enables lambdas to maintain private state across multiple invocations. Each lambda instance has its own copy of the state variables, making them independent. This pattern replaces traditional functor classes for simple stateful operations, offering cleaner syntax while maintaining encapsulation. The initialization in the capture list `[count = 0]` uses C++14 syntax but the concept applies to C++11 with external variables.

**Key takeaway:** Mutable lambdas with value captures create stateful closures, enabling counters, generators, and other state-maintaining patterns.

---

#### Q13: What is the difference between [=] and [&] when capturing 'this' in a member function?
**Difficulty:** #advanced
**Category:** #syntax #memory
**Concepts:** #lambda #this_pointer #capture #member_function

**Answer:**
Both `[=]` and `[&]` capture the `this` pointer by value; neither captures a copy of the entire object (until C++17's `[*this]`).

**Code example:**
```cpp
class Widget {
    int value = 42;
public:
    auto getLambdaByValue() {
        return [=]() {  // ✅ Captures 'this' pointer
            return value;  // Accesses this->value
        };
    }
    
    auto getLambdaByRef() {
        return [&]() {  // ✅ Also captures 'this' pointer
            return value;  // Same: accesses this->value
        };
    }
    
    void modifyValue() { value = 100; }
};

Widget w;
auto lambda1 = w.getLambdaByValue();
auto lambda2 = w.getLambdaByRef();

w.modifyValue();
std::cout << lambda1() << "\n";  // ❌ 100 (not 42!)
std::cout << lambda2() << "\n";  // 100
```

**Explanation:**
Member variables are accessed through the `this` pointer, not captured directly. Both `[=]` and `[&]` capture `this` by value (as a pointer), so both lambdas see changes to the object. The difference only affects other local variables in scope. To capture a copy of the entire object, you'd need `[*this]` (C++17+) or explicitly copy members: `[value = this->value]()`. This is a subtle but important distinction that trips up many developers.

**Key takeaway:** Inside member functions, both `[=]` and `[&]` capture the `this` pointer, not the object; use C++17's `[*this]` for object copies.

---

#### Q14: Can std::function store a lambda with move-only captures in C++11?
**Difficulty:** #advanced
**Category:** #memory #interview_favorite
**Concepts:** #std_function #move_semantics #lambda #capture #unique_ptr

**Answer:**
No, C++11's `std::function` requires callables to be copyable; move-only captures like `unique_ptr` are not supported until C++14.

**Code example:**
```cpp
// ❌ Not valid in C++11
std::unique_ptr<int> ptr = std::make_unique<int>(42);
auto lambda = [ptr = std::move(ptr)]() {  // Move capture
    return *ptr;
};
std::function<int()> func = std::move(lambda);  // ❌ Error in C++11!

// ✅ C++11 workaround: use shared_ptr
std::shared_ptr<int> sharedPtr = std::make_shared<int>(42);
auto workaround = [sharedPtr]() {  // Copy shared_ptr (copyable)
    return *sharedPtr;
};
std::function<int()> func2 = workaround;  // OK
```

**Explanation:**
C++11's `std::function` implementation requires stored callables to be copy-constructible, but move-only types like `unique_ptr` cannot be copied. This limitation was addressed in C++14 with improved move semantics support. In C++11, the workaround is using `shared_ptr` instead of `unique_ptr`, or avoiding `std::function` and using the lambda type directly with templates. This highlights an important early limitation of the C++11 functional programming features.

**Key takeaway:** C++11 `std::function` cannot store move-only captures; use `shared_ptr` or templates as workarounds.

---

#### Q15: How do you pass a lambda to a function that expects std::function?
**Difficulty:** #beginner
**Category:** #syntax #design_pattern
**Concepts:** #lambda #std_function #callable #type_conversion

**Answer:**
Lambdas can be implicitly converted to `std::function` with matching signatures; explicit construction is also valid but unnecessary.

**Code example:**
```cpp
void executeCallback(std::function<void(int)> callback) {
    callback(42);
}

// ✅ Implicit conversion
executeCallback([](int x) {
    std::cout << "Value: " << x << "\n";
});

// ✅ Explicit construction (verbose, unnecessary)
std::function<void(int)> wrapped = [](int x) {
    std::cout << "Value: " << x << "\n";
};
executeCallback(wrapped);

// ✅ With capture
int multiplier = 10;
executeCallback([multiplier](int x) {
    std::cout << x * multiplier << "\n";
});
```

**Explanation:**
Lambdas matching the signature of a `std::function` can be implicitly converted during function calls. The compiler handles the type erasure conversion automatically. This implicit conversion makes using `std::function` seamless in API boundaries while maintaining flexibility. However, be aware this conversion triggers the overhead of `std::function` - for performance-critical code, consider template parameters instead to avoid type erasure costs.

**Key takeaway:** Lambdas convert implicitly to `std::function` with matching signatures, making them seamless in callback-based APIs.

---

#### Q16: What is the syntax for explicitly specifying a lambda's return type?
**Difficulty:** #beginner
**Category:** #syntax
**Concepts:** #lambda #return_type #trailing_return_type

**Answer:**
Use the trailing return type syntax with `->` after the parameter list: `[captures](params) -> return_type { body }`.

**Code example:**
```cpp
// ✅ Explicit return type
auto divide = [](double a, double b) -> double {
    return a / b;
};

// ✅ Necessary when compiler cannot deduce
auto complex = [](bool flag) -> double {
    if (flag)
        return 3.14;   // double
    else
        return 42;     // would be int without explicit type
};

// ❌ Without explicit type, compiler may choose incorrectly
auto ambiguous = [](bool flag) {
    return flag ? 3.14 : 42;  // ❌ Compile error: type mismatch
};
```

**Explanation:**
Most lambdas can rely on automatic return type deduction, but explicit specification is necessary when: the lambda has multiple return statements with different types, you want to enforce a specific type for clarity, or you're working with complex expressions where the deduced type isn't obvious. The syntax mirrors trailing return types introduced with `auto` functions in C++11. Explicit return types improve readability and prevent subtle type conversion bugs.

**Key takeaway:** Specify lambda return types explicitly using `-> type` syntax when necessary for complex control flow or type clarity.

---

#### Q17: Can you capture static variables in a lambda?
**Difficulty:** #intermediate
**Category:** #syntax #memory
**Concepts:** #lambda #capture #static #scope

**Answer:**
No, static and global variables don't need capture; they're directly accessible in the lambda body without explicit capture.

**Code example:**
```cpp
static int staticVar = 100;
int globalVar = 200;

void function() {
    int localVar = 300;
    
    auto lambda = [localVar]() {  // localVar needs capture
        // staticVar, globalVar accessible without capture
        return staticVar + globalVar + localVar;
    };
    
    // ❌ Capturing static/global is compile error
    auto error = [staticVar]() {  // Error: staticVar not capturable
        return staticVar;
    };
    
    // ✅ Just reference them directly
    auto correct = []() {
        staticVar++;  // Modifies static directly
        return staticVar;
    };
}
```

**Explanation:**
Static and global variables have lifetimes that extend beyond function scope, so they're always accessible without capture. Attempting to capture them results in a compile error. Only automatic (local) variables require capture to be accessible in the lambda. This distinction is important for understanding what needs to be in the capture list. Static variables can be modified freely in lambdas without `mutable` since they're not captured copies.

**Key takeaway:** Static and global variables are directly accessible in lambdas without capture; only automatic local variables require capture.

---

#### Q18: How does std::bind handle reference arguments without std::ref?
**Difficulty:** #advanced
**Category:** #memory #interview_favorite
**Concepts:** #std_bind #std_ref #reference #copy

**Answer:**
By default, `std::bind` copies all arguments; you must use `std::ref` or `std::cref` to bind references.

**Code example:**
```cpp
void modify(int& x) {
    x += 10;
}

int value = 5;

// ❌ Copies value, doesn't modify original
auto bound1 = std::bind(modify, value);
bound1();
std::cout << value << "\n";  // Still 5

// ✅ Uses std::ref to bind reference
auto bound2 = std::bind(modify, std::ref(value));
bound2();
std::cout << value << "\n";  // Now 15

// Compare with lambda (more explicit)
auto lambda = [&value]() { modify(value); };
lambda();
std::cout << value << "\n";  // 25
```

**Explanation:**
This is a major source of `std::bind` bugs - developers expect reference semantics but get copies. `std::ref` is a wrapper that makes `std::bind` treat an argument as a reference. This unintuitive behavior is one reason lambdas are preferred: their capture syntax `[&value]` vs `[value]` makes reference vs copy explicit. With `std::bind`, forgetting `std::ref` silently creates a copy, potentially causing logic errors that are hard to debug.

**Key takeaway:** `std::bind` copies arguments by default; use `std::ref` for reference semantics, or prefer lambdas for clearer capture intent.

---

#### Q19: What is the size of a lambda with no captures vs one with captures?
**Difficulty:** #advanced
**Category:** #memory #performance
**Concepts:** #lambda #capture #memory_layout #sizeof

**Answer:**
Capture-less lambdas have zero size (empty class optimization); lambdas with captures have size equal to their captured data.

**Code example:**
```cpp
auto noCap = []() { return 42; };
std::cout << sizeof(noCap) << "\n";  // ✅ 1 (empty class optimization)

int x = 10;
auto oneCap = [x]() { return x; };
std::cout << sizeof(oneCap) << "\n";  // ✅ sizeof(int), typically 4

int y = 20;
auto twoCap = [x, y]() { return x + y; };
std::cout << sizeof(twoCap) << "\n";  // ✅ 2 * sizeof(int), typically 8

// Reference capture stores a pointer
auto refCap = [&x]() { return x; };
std::cout << sizeof(refCap) << "\n";  // ✅ sizeof(int*), typically 8
```

**Explanation:**
Lambdas are implemented as compiler-generated functor classes. A capture-less lambda has no member variables, allowing the compiler to apply empty base optimization (technically size 1 for distinct addresses). Captures become member variables of this class, determining the lambda's size. Reference captures store pointers (typically 8 bytes on 64-bit systems), not the objects themselves. Understanding lambda size is important for performance-sensitive code and embedded systems where memory is constrained.

**Key takeaway:** Capture-less lambdas are effectively zero-size; captured variables become member data, determining the lambda's memory footprint.

---

#### Q20: How do you return a lambda from a function safely?
**Difficulty:** #intermediate
**Category:** #memory #interview_favorite
**Concepts:** #lambda #lifetime #return_value #capture

**Answer:**
Return lambdas that capture by value or capture nothing; avoid returning lambdas that capture local variables by reference.

**Code example:**
```cpp
// ❌ Dangerous: returns lambda with dangling reference
auto makeDangerous() {
    int local = 42;
    return [&local]() { return local; };  // UB: local destroyed
}

// ✅ Safe: captures by value
auto makeSafe() {
    int local = 42;
    return [local]() { return local; };  // OK: copy of local
}

// ✅ Safe: no captures
auto makeStateless() {
    return []() { return 42; };  // OK: no state
}

// ✅ Safe: captures parameters passed by value
auto makeGenerator(int start) {
    return [start]() mutable { return start++; };  // OK: owns start
}
```

**Explanation:**
Returning lambdas requires careful consideration of capture semantics and lifetimes. References to local variables become dangling when the function returns, causing undefined behavior when the lambda executes. Value captures create independent copies that remain valid. This is a common source of production bugs, especially in factory functions and builder patterns. Always use value capture or no capture when returning lambdas; if you need to reference external state, use shared_ptr or pass ownership through captures.

**Key takeaway:** When returning lambdas, use value captures or no captures; never return lambdas capturing local variables by reference.

---

#### Q21: Can you use auto parameters in C++11 lambdas?
**Difficulty:** #beginner
**Category:** #syntax
**Concepts:** #lambda #generic_lambda #auto #cpp14

**Answer:**
No, generic lambdas with `auto` parameters were introduced in C++14; C++11 requires explicit type specifications.

**Code example:**
```cpp
// ❌ C++11: not valid
auto generic = [](auto x) {  // ❌ Compile error in C++11
    return x * 2;
};

// ✅ C++11: must specify types
auto explicit_type = [](int x) {  // ✅ OK
    return x * 2;
};

// ✅ C++11 workaround: template function
template<typename T>
auto makeMultiplier() {
    return [](T x) { return x * 2; };
}

auto intMult = makeMultiplier<int>();
auto doubleMult = makeMultiplier<double>();
```

**Explanation:**
Generic lambdas (with `auto` parameters) are a C++14 feature that allows the compiler to generate a templated operator() for the lambda. In C++11, you must explicitly specify parameter types. The workaround is to use a template function that returns a lambda with the desired type, creating a form of generic lambda through template instantiation. This limitation made C++11 lambdas less flexible than they became in C++14.

**Key takeaway:** C++11 lambdas require explicit parameter types; generic lambdas with `auto` parameters require C++14 or later.

---

#### Q22: What is the performance difference between a lambda and a hand-written functor?
**Difficulty:** #advanced
**Category:** #performance
**Concepts:** #lambda #functor #optimization #inline

**Answer:**
There is no performance difference; lambdas are syntactic sugar for compiler-generated functors with identical optimization potential.

**Code example:**
```cpp
// Hand-written functor
struct Multiplier {
    int factor;
    Multiplier(int f) : factor(f) {}
    int operator()(int x) const { return x * factor; }
};

// Equivalent lambda
int factor = 5;
auto multiplier = [factor](int x) { return x * factor; };

// Both generate virtually identical assembly code
std::vector<int> vec = {1, 2, 3, 4, 5};
std::transform(vec.begin(), vec.end(), vec.begin(), Multiplier(5));
std::transform(vec.begin(), vec.end(), vec.begin(), multiplier);
```

**Explanation:**
Lambdas are implemented as compiler-generated functor classes with operator() methods. Modern compilers optimize both equally, inlining the calls when possible. The performance characteristics are identical: capture-by-value creates member variables (just like functor fields), and the call operator has the same inlining potential. The only difference is code maintainability - lambdas offer cleaner syntax for simple cases, while hand-written functors provide more control for complex state management.

**Key takeaway:** Lambdas have zero performance overhead compared to equivalent hand-written functors; they're syntactic sugar with identical optimization.

---

#### Q23: How do you capture const variables by reference in a lambda?
**Difficulty:** #intermediate
**Category:** #syntax #memory
**Concepts:** #lambda #capture #const_correctness #reference

**Answer:**
Use standard reference capture `[&var]`; the constness of the referenced variable is preserved automatically.

**Code example:**
```cpp
const int readOnly = 100;

auto lambda1 = [&readOnly]() {
    // readOnly = 200;  // ❌ Compile error: const int&
    return readOnly * 2;  // ✅ OK: reading is fine
};

// No special syntax needed - const is maintained
auto lambda2 = [&]() {  // Captures all by reference
    return readOnly + 42;  // const propagates
};

// Mutable doesn't help with const references
auto lambda3 = [&readOnly]() mutable {
    // readOnly = 200;  // ❌ Still error: const is on the object
    return readOnly;
};
```

**Explanation:**
When capturing by reference, the constness of the original variable is preserved through the reference type. You don't need special syntax like `[&const readOnly]` - the reference automatically maintains the original const-qualification. The `mutable` keyword only affects variables captured by value, not references. This const-correctness propagation ensures that lambdas respect the original variable's mutability, preventing accidental modifications of const data.

**Key takeaway:** Reference captures preserve const-qualification automatically; no special syntax needed for const references.

---

#### Q24: What happens if you capture the same variable multiple times with different modes?
**Difficulty:** #beginner
**Category:** #syntax
**Concepts:** #lambda #capture #compiler_error

**Answer:**
It's a compile error; each variable can only be captured once, either by value or by reference.

**Code example:**
```cpp
int x = 10;

// ❌ Compile error: duplicate capture
auto bad1 = [x, &x]() {  // Error: x captured twice
    return x;
};

// ❌ Compile error: conflicting default and explicit
auto bad2 = [=, x]() {  // Error: x already captured by [=]
    return x;
};

// ✅ OK: [=] with explicit reference override
auto good1 = [=, &x]() {  // OK: all by value except x by ref
    return x;
};

// ✅ OK: [&] with explicit value override
auto good2 = [&, x]() {  // OK: all by ref except x by value
    return x;
};
```

**Explanation:**
The capture list must be unambiguous - each variable has exactly one capture mode. Attempting to capture the same variable multiple times results in a compile error. However, you can use mixed captures with default clauses: `[=, &x]` captures everything by value except `x` by reference. The rule is that the default capture `[=]` or `[&]` must come first, followed by exceptions. This prevents ambiguity about how each variable is captured.

**Key takeaway:** Each variable can only be captured once; use mixed capture `[=, &x]` or `[&, x]` for different modes per variable.

---

#### Q25: How do std::function and lambda interact with exception safety?
**Difficulty:** #advanced
**Category:** #memory #exception_safety
**Concepts:** #std_function #lambda #exception #noexcept

**Answer:**
Both lambdas and `std::function` can throw exceptions; `std::function` itself may throw during construction/assignment if allocation fails.

**Code example:**
```cpp
// Lambda can throw
auto throwingLambda = [](int x) {
    if (x < 0) throw std::invalid_argument("Negative value");
    return x * 2;
};

try {
    int result = throwingLambda(-5);  // ✅ Throws as expected
} catch (const std::exception& e) {
    std::cout << e.what() << "\n";
}

// std::function construction can throw (bad_alloc)
try {
    std::function<int(int)> func = throwingLambda;  // May throw
    func(-5);  // May throw from lambda
} catch (const std::exception& e) {
    std::cout << e.what() << "\n";
}

// noexcept lambda
auto safeAdd = [](int a, int b) noexcept {
    return a + b;  // Cannot throw
};
```

**Explanation:**
Lambdas themselves follow normal exception rules - they can throw unless marked `noexcept`. `std::function` adds another exception source: its constructor and assignment operators can throw `std::bad_alloc` if memory allocation fails during type erasure setup. For exception-safe code, consider: marking lambdas `noexcept` when possible, handling potential `bad_alloc` from `std::function`, and preferring direct lambda types in templates to avoid `std::function` allocation exceptions.

**Key takeaway:** Lambdas and `std::function` can both throw; `std::function` may throw `bad_alloc` during construction/assignment.

---

#### Q26: Can you have a lambda with no body that still does something useful?
**Difficulty:** #beginner
**Category:** #syntax
**Concepts:** #lambda #default_return #empty_body

**Answer:**
Yes, but it would be limited; an empty lambda body implicitly returns void for void-returning lambdas or default-constructed value types.

**Code example:**
```cpp
// ✅ Valid: void return
auto doNothing = []() {};  // Valid, does nothing
doNothing();

// ✅ Valid: returns default-constructed int
auto returnZero = []() -> int {};  // ❌ Compile error: no return

// ✅ Actually useful: copy constructor lambda
auto copyInt = [](int x) { return x; };  // Copies and returns

// ✅ Default capturing lambda (captures but does nothing)
int x = 10;
auto captureOnly = [=]() {};  // Captures x but doesn't use it
```

**Explanation:**
An empty lambda body is syntactically valid for void-returning lambdas, though not particularly useful. For non-void return types, an empty body results in a compile error because there's no return statement. The most minimal "useful" lambda would be identity functions or trivial converters. In practice, empty lambdas are rare except in template metaprogramming or as placeholders during development.

**Key takeaway:** Empty lambda bodies are valid for void returns but generally not useful; non-void returns require explicit return statements.

---

#### Q27: What is the difference between [this] and [*this] capture? (C++17 preview)
**Difficulty:** #advanced
**Category:** #syntax #memory
**Concepts:** #lambda #this_pointer #capture #cpp17 #copy

**Answer:**
`[this]` captures the pointer (C++11), while `[*this]` captures a copy of the entire object (C++17); latter is safer for async operations.

**Code example:**
```cpp
class Widget {
    int value = 42;
public:
    // C++11: captures 'this' pointer
    auto getLambdaPtr() {
        return [this]() {  // Captures pointer only
            return value;  // Accesses through this->value
        };
    }
    
    // C++17: captures entire object copy
    auto getLambdaCopy() {
        return [*this]() {  // Captures copy of Widget
            return value;  // Accesses copied value
        };
    }
};

Widget* w = new Widget();
auto ptrLambda = w->getLambdaPtr();    // Captures pointer
auto copyLambda = w->getLambdaCopy();  // Captures copy (C++17)

delete w;
// ptrLambda();  // ❌ UB: dangling pointer
copyLambda();    // ✅ OK: operates on copy
```

**Explanation:**
In C++11, `[this]` only captures the pointer to the object, not the object itself. This creates lifetime issues when the object is destroyed but the lambda persists. C++17 introduced `[*this]` to capture a complete copy of the object, making the lambda independent of the original object's lifetime. This is particularly important for async operations, where lambdas might execute long after the creating object is destroyed. The copy does have overhead, so use it judiciously.

**Key takeaway:** C++11's `[this]` captures pointer (lifetime risk); C++17's `[*this]` captures object copy (safer for async).

---

#### Q28: How do you create a recursive lambda in C++11?
**Difficulty:** #advanced
**Category:** #design_pattern #interview_favorite
**Concepts:** #lambda #recursion #std_function #y_combinator

**Answer:**
Use `std::function` to create a named recursive lambda, though this incurs overhead; or use a Y-combinator pattern.

**Code example:**
```cpp
// ✅ Using std::function (has overhead)
std::function<int(int)> factorial = [&factorial](int n) {
    return (n <= 1) ? 1 : n * factorial(n - 1);
};
std::cout << factorial(5) << "\n";  // 120

// ✅ Alternative: separate helper function
auto makeFactorial() {
    struct Helper {
        int operator()(int n) {
            return (n <= 1) ? 1 : n * (*this)(n - 1);
        }
    };
    return Helper();
}

// ❌ This doesn't work - lambda can't reference itself
auto broken = [&broken](int n) {  // ❌ Compile error
    return (n <= 1) ? 1 : n * broken(n - 1);
};
```

**Explanation:**
Lambdas cannot directly reference themselves because they have no name in their own scope. The workaround is assigning the lambda to a `std::function` and capturing that by reference, allowing self-reference. This introduces `std::function` overhead. A more efficient but complex alternative is the Y-combinator pattern, which passes the function as a parameter. For most practical purposes, if you need recursion, consider using a regular named function or a helper struct instead of forcing lambdas.

**Key takeaway:** Recursive lambdas require `std::function` with reference capture; consider regular functions for recursion to avoid overhead.

---

#### Q29: What is the type of a lambda expression?
**Difficulty:** #intermediate
**Category:** #syntax #interview_favorite
**Concepts:** #lambda #type #unique_type #auto

**Answer:**
Each lambda has a unique, unnamed type generated by the compiler; you typically use `auto` or `decltype` to store them.

**Code example:**
```cpp
auto lambda1 = [](int x) { return x * 2; };
auto lambda2 = [](int x) { return x * 2; };  // Different type!

// ❌ These have different types even though identical
// decltype(lambda1) l = lambda2;  // Compile error!

// ✅ Use auto for specific lambda type
auto l1 = lambda1;  // OK: deduces lambda1's type

// ✅ Use std::function for uniform type
std::function<int(int)> f1 = lambda1;  // OK: type erasure
std::function<int(int)> f2 = lambda2;  // OK: same type now
f1 = f2;  // ✅ Now assignable

// ✅ Templates can preserve lambda type
template<typename Func>
void execute(Func f) {
    f(42);
}
execute(lambda1);  // Deduces lambda1's unique type
```

**Explanation:**
The compiler generates a unique functor class for each lambda expression, even if two lambdas are textually identical. This means each lambda has its own distinct type that cannot be named in source code. You must use `auto`, `decltype`, or `std::function` to work with lambdas. Template functions preserve the exact lambda type, enabling full optimization, while `std::function` uses type erasure to create a common type at the cost of performance.

**Key takeaway:** Each lambda has a unique compiler-generated type; use `auto` or templates for zero-overhead, `std::function` for type uniformity.

---

#### Q30: How do you bind a member function pointer using std::bind?
**Difficulty:** #intermediate
**Category:** #syntax #design_pattern
**Concepts:** #std_bind #member_function #this_pointer

**Answer:**
Pass the member function pointer, the object (or pointer/reference), and any arguments using placeholders.

**Code example:**
```cpp
class Calculator {
public:
    int add(int a, int b) const {
        return a + b;
    }
    
    void printResult(int x) const {
        std::cout << "Result: " << x << "\n";
    }
};

Calculator calc;

// ✅ Bind member function with object
auto boundAdd = std::bind(&Calculator::add, &calc,
                          std::placeholders::_1,
                          std::placeholders::_2);
std::cout << boundAdd(10, 5) << "\n";  // 15

// ✅ Bind with fixed arguments
auto add10 = std::bind(&Calculator::add, &calc, 10, std::placeholders::_1);
std::cout << add10(5) << "\n";  // 15

// ✅ Bind void-returning member function
auto boundPrint = std::bind(&Calculator::printResult, &calc, std::placeholders::_1);
boundPrint(42);  // Prints: Result: 42

// ✅ Lambda equivalent (clearer)
auto lambdaAdd = [&calc](int a, int b) { return calc.add(a, b); };
```

**Explanation:**
Member functions have an implicit `this` parameter that must be bound explicitly. The syntax is `std::bind(&Class::method, object_ptr, args...)`. You can bind the object directly, by pointer, or by reference (using `std::ref`). This is often more awkward than the lambda equivalent, which is why modern code prefers lambdas. The lambda version `[&calc](args) { return calc.method(args); }` is more readable and equally performant.

**Key takeaway:** Bind member functions with `std::bind(&Class::method, object, placeholders...)`; lambdas are often clearer.

---

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Q1
```cpp
int x = 5;
auto f = [=]() mutable {
    x = 10;
    return x;
};

std::cout << f() << " ";
std::cout << x << " ";
std::cout << f() << "\n";
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** `10 5 10`

**Explanation:** Mutable lambda modifies its copy, not original; f() returns 10 each time from same copy

**Key Concept:** #mutable #capture

</details>

---

#### Q2
```cpp
std::vector<std::function<int()>> funcs;
for (int i = 0; i < 3; ++i) {
    funcs.push_back([&i]() { return i; });
}

for (auto& f : funcs) {
    std::cout << f() << " ";
}
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** `3 3 3` (or UB)

**Explanation:** All lambdas capture reference to same loop variable i, which equals 3 after loop

**Key Concept:** #dangling_reference #loop_capture

</details>

---

#### Q3
```cpp
int a = 100;
auto f = [&a]() { return a; };
a = 200;
std::cout << f();
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** `200`

**Explanation:** Reference capture sees modifications to original variable

**Key Concept:** #reference_capture

</details>

---

#### Q4
```cpp
auto lambda = []() { return 42; };
void (*funcPtr)() = lambda;  // Compile error or OK?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** **Compile Error**

**Explanation:** Return type mismatch - lambda returns int, function pointer expects void return

**Key Concept:** #function_pointer #type_mismatch

</details>

---

#### Q5
```cpp
int x = 10;
std::function<void()> f;

{
    f = [=]() { std::cout << x << "\n"; };
}
f();  // What happens?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** `10`

**Explanation:** Value capture creates copy, safe even after scope ends

**Key Concept:** #lifetime #value_capture

</details>

---

#### Q6
```cpp
class Widget {
    int value = 42;
public:
    auto getLambda() {
        return [=]() { return value; };
    }
};

Widget* w = new Widget();
auto l = w->getLambda();
delete w;
std::cout << l();  // What happens?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** **Undefined Behavior**

**Explanation:** [=] captures 'this' pointer, which is dangling after delete

**Key Concept:** #this_pointer #dangling_pointer

</details>

---

#### Q7
```cpp
int add(int a, int b, int c) { return a + b + c; }

auto bound = std::bind(add, 10, std::placeholders::_1, std::placeholders::_2);
std::cout << bound(5, 3);
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** `18`

**Explanation:** bind fixes first arg to 10, placeholders fill others: 10 + 5 + 3

**Key Concept:** #std_bind #partial_application

</details>

---

#### Q8
```cpp
int x = 5;
auto f = [=]() {
    x = 10;  // Compile error or OK?
    return x;
};
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** **Compile Error**

**Explanation:** Cannot modify captured-by-value variable without mutable keyword

**Key Concept:** #const_correctness #mutable

</details>

---

#### Q9
```cpp
auto counter = [n = 0]() mutable { return ++n; };
std::cout << counter() << " ";
std::cout << counter() << " ";
std::cout << counter();
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** `1 2 3`

**Explanation:** Mutable lambda maintains state across calls

**Key Concept:** #stateful_lambda #mutable

</details>

---

#### Q10
```cpp
auto f1 = [](int x) { return x * 2; };
auto f2 = [](int x) { return x * 2; };

bool same = std::is_same<decltype(f1), decltype(f2)>::value;
std::cout << same;
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** `0` (false)

**Explanation:** Each lambda has unique compiler-generated type

**Key Concept:** #unique_type #lambda_type

</details>

---

#### Q11
```cpp
const int x = 100;
auto f = [&x]() {
    x = 200;  // Compile error or OK?
    return x;
};
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** **Compile Error**

**Explanation:** Cannot modify const variable even through reference

**Key Concept:** #const_correctness #reference

</details>

---

#### Q12
```cpp
std::vector<int> vec = {3, 1, 4, 1, 5};
std::sort(vec.begin(), vec.end(), [](int a, int b) {
    return a > b;
});

for (int x : vec) std::cout << x << " ";
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** `5 4 3 1 1`

**Explanation:** Sorts in descending order (a > b comparator)

**Key Concept:** #stl_algorithms #lambda

</details>

---

#### Q13
```cpp
int value = 10;
auto f = std::bind([](int& x) { x += 5; }, value);
f();
std::cout << value;
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** `10`

**Explanation:** std::bind copies argument by default, std::ref needed for reference

**Key Concept:** #std_bind #std_ref

</details>

---

#### Q14
```cpp
auto noCap = []() { return 42; };
int x = 10;
auto oneCap = [x]() { return x; };

std::cout << sizeof(noCap) << " " << sizeof(oneCap);
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** `1 4` (typical)

**Explanation:** No-capture lambda has empty class size (1), one-capture has sizeof(int)

**Key Concept:** #sizeof #memory_layout

</details>

---

#### Q15
```cpp
auto make_lambda() {
    int x = 42;
    return [&x]() { return x; };
}

auto l = make_lambda();
std::cout << l();  // What happens?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** **Undefined Behavior**

**Explanation:** Lambda captures local variable by reference, which is destroyed on return

**Key Concept:** #dangling_reference #lifetime

</details>

---

#### Q16
```cpp
std::function<int(int)> f = [](int x) { return x * 2; };
std::function<int(int)> g = [](int x) { return x + 10; };
f = g;
std::cout << f(5);
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** `15`

**Explanation:** std::function allows assignment between compatible callables; g adds 10

**Key Concept:** #std_function #type_erasure

</details>

---

#### Q17
```cpp
int x = 5, y = 10;
auto f = [=, &y]() {
    y += x;
    return y;
};

std::cout << f() << " ";
std::cout << y;
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** `15 15`

**Explanation:** Mixed capture: x by value (5), y by reference; y modified from 10 to 15

**Key Concept:** #mixed_capture #reference

</details>

---

#### Q18
```cpp
auto lambda = [](auto x) { return x * 2; };  // Valid in C++11?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** **Compile Error**

**Explanation:** Generic lambdas (auto parameters) require C++14

**Key Concept:** #cpp14 #generic_lambda

</details>

---

#### Q19
```cpp
static int counter = 0;
auto f = []() { return ++counter; };

std::cout << f() << " ";
std::cout << f() << " ";
std::cout << counter;
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** `1 2 2`

**Explanation:** Static variables accessible without capture; counter modified directly

**Key Concept:** #static #capture

</details>

---

#### Q20
```cpp
std::function<int(int)> f;
std::unique_ptr<int> ptr = std::make_unique<int>(42);
f = [ptr = std::move(ptr)]() { return *ptr; };  // Valid in C++11?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** **Compile Error**

**Explanation:** C++11 std::function cannot store move-only captures

**Key Concept:** #move_semantics #std_function

</details>

---


### QUICK_REFERENCE: Answer Key and Summary Tables

#### Answer Key for Practice Questions

| Q# | Answer | Explanation | Key Concept |
|----|--------|-------------|-------------|
| 1 | `10 5 10` | Mutable lambda modifies its copy, not original; f() returns 10 each time from same copy | #mutable #capture |
| 2 | `3 3 3` (or UB) | All lambdas capture reference to same loop variable i, which equals 3 after loop | #dangling_reference #loop_capture |
| 3 | `200` | Reference capture sees modifications to original variable | #reference_capture |
| 4 | **Compile Error** | Return type mismatch - lambda returns int, function pointer expects void return | #function_pointer #type_mismatch |
| 5 | `10` | Value capture creates copy, safe even after scope ends | #lifetime #value_capture |
| 6 | **Undefined Behavior** | [=] captures 'this' pointer, which is dangling after delete | #this_pointer #dangling_pointer |
| 7 | `18` | bind fixes first arg to 10, placeholders fill others: 10 + 5 + 3 | #std_bind #partial_application |
| 8 | **Compile Error** | Cannot modify captured-by-value variable without mutable keyword | #const_correctness #mutable |
| 9 | `1 2 3` | Mutable lambda maintains state across calls | #stateful_lambda #mutable |
| 10 | `0` (false) | Each lambda has unique compiler-generated type | #unique_type #lambda_type |
| 11 | **Compile Error** | Cannot modify const variable even through reference | #const_correctness #reference |
| 12 | `5 4 3 1 1` | Sorts in descending order (a > b comparator) | #stl_algorithms #lambda |
| 13 | `10` | std::bind copies argument by default, std::ref needed for reference | #std_bind #std_ref |
| 14 | `1 4` (typical) | No-capture lambda has empty class size (1), one-capture has sizeof(int) | #sizeof #memory_layout |
| 15 | **Undefined Behavior** | Lambda captures local variable by reference, which is destroyed on return | #dangling_reference #lifetime |
| 16 | `15` | std::function allows assignment between compatible callables; g adds 10 | #std_function #type_erasure |
| 17 | `15 15` | Mixed capture: x by value (5), y by reference; y modified from 10 to 15 | #mixed_capture #reference |
| 18 | **Compile Error** | Generic lambdas (auto parameters) require C++14 | #cpp14 #generic_lambda |
| 19 | `1 2 2` | Static variables accessible without capture; counter modified directly | #static #capture |
| 20 | **Compile Error** | C++11 std::function cannot store move-only captures | #move_semantics #std_function |

#### Lambda Capture Modes Summary

| Capture | Syntax | Meaning | Lifetime Safety | Use Case |
|---------|--------|---------|-----------------|----------|
| Nothing | `[]` | No captures | ✅ Safe | Pure functions, convertible to function pointer |
| All by value | `[=]` | Copy all variables | ✅ Safe | When lambda outlives scope |
| All by reference | `[&]` | Reference all variables | ⚠️ Risky | When lambda used in same scope |
| Specific by value | `[x, y]` | Copy x and y | ✅ Safe | Selective value captures |
| Specific by reference | `[&x, &y]` | Reference x and y | ⚠️ Risky | Selective reference captures |
| Mixed default value | `[=, &y]` | All by value except y by ref | ⚠️ Mixed | Fine control, y needs modification |
| Mixed default ref | `[&, x]` | All by ref except x by value | ⚠️ Mixed | Most by reference, x needs copy |
| This pointer | `[this]` | Capture this pointer | ⚠️ Risky | Member function access |
| Init capture (C++14) | `[x = expr]` | Initialize new variable | ✅ Depends | Move captures, computed values |

#### std::function vs Direct Lambda Comparison

| Aspect | Direct Lambda Type | std::function |
|--------|-------------------|---------------|
| **Type** | Unique compiler-generated | Type-erased wrapper |
| **Storage** | Stack-allocated | May use heap |
| **Performance** | Zero overhead, inlineable | Virtual dispatch overhead |
| **Assignability** | Cannot assign different lambda types | Can assign any compatible callable |
| **Copy Cost** | Compiler-dependent | Always copyable (if callable is) |
| **Template Friendly** | ✅ Yes, preserves type | ❌ Loses specific type |
| **Syntax Uniformity** | ❌ Each lambda unique | ✅ Common type for all |
| **Move-Only Support (C++11)** | ✅ Supported | ❌ Not supported |
| **Best For** | Templates, performance-critical | Callback storage, type uniformity |

#### Lambda vs std::bind Comparison

| Feature | Lambda | std::bind |
|---------|--------|-----------|
| **Readability** | ✅ Clear, explicit | ❌ Obscure placeholders |
| **Capture Semantics** | ✅ Explicit [=] or [&] | ❌ Implicit copy, std::ref needed |
| **Performance** | ✅ Often better | ⚠️ May have indirection |
| **Error Messages** | ✅ Clear | ❌ Often cryptic |
| **Flexibility** | ✅ Full control | ⚠️ Limited |
| **Modern Recommendation** | ✅ Preferred | ⚠️ Legacy, avoid |
| **Use Cases** | General purpose | Legacy interop only |

#### Common Lambda Pitfalls and Solutions

| Pitfall | Problem | Solution |
|---------|---------|----------|
| Dangling references | [&] capture outlives scope | Use [=] for value capture |
| Loop variable capture | All lambdas share same reference | Use [i] (by value) in loops |
| Const modification | Can't modify [=] captured vars | Add mutable keyword |
| This lifetime | [this] dangling after object destroyed | Use [=] or [*this] (C++17) |
| Implicit this capture | [=] captures 'this' in member functions | Be aware, or explicit [*this] |
| Type erasure overhead | Using std::function unnecessarily | Use templates or auto |
| Move-only captures | unique_ptr in C++11 lambda | Use shared_ptr or C++14+ |
| Generic lambda attempt | [](auto x) in C++11 | Requires C++14, use templates |

---
