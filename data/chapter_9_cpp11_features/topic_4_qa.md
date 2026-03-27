## TOPIC: Lambda Expressions, std::function, and std::bind

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
