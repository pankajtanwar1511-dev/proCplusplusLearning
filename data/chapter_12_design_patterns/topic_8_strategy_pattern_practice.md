## TOPIC: Strategy Pattern (Policy-Based Design)

### PRACTICE_TASKS: Code Analysis and Implementation Challenges

#### Q1
```cpp
class Calculator {
    int (*operation)(int, int);
public:
    void setOperation(int (*op)(int, int)) {
        operation = op;
    }

    int calculate(int a, int b) {
        return operation(a, b);  // What if operation is null?
    }
};

// What's the problem?
```

**Answer:**

Null pointer dereference if `operation` not initialized. Calling null function pointer causes undefined behavior (typically crashes).

**Explanation:**

**Why This is Dangerous:**

Function pointer initialized to garbage value by default. If `calculate()` called before `setOperation()`, dereferencing null/garbage pointer crashes program.

```cpp
Calculator calc;
// operation = <uninitialized garbage>

int result = calc.calculate(5, 3);  // ❌ CRASH
// Dereferencing uninitialized function pointer
```

**Concrete Failure:**

```cpp
void testCalculator() {
    Calculator calc;
    // Forgot to call setOperation()

    int result = calc.calculate(10, 5);
    // → operation() is null or garbage
    // → Segmentation fault or undefined behavior
}
```

**Fix #1: Require Strategy in Constructor**

```cpp
class Calculator {
    int (*operation)(int, int);
public:
    Calculator(int (*op)(int, int)) : operation(op) {}
    // Cannot create Calculator without strategy

    int calculate(int a, int b) {
        return operation(a, b);  // Safe: always initialized
    }
};

// Usage:
int add(int a, int b) { return a + b; }
Calculator calc(add);  // ✅ Must provide strategy
```

**Fix #2: Check for Null Before Calling**

```cpp
class Calculator {
    int (*operation)(int, int) = nullptr;
public:
    int calculate(int a, int b) {
        if (!operation) {
            throw runtime_error("Strategy not set");
        }
        return operation(a, b);
    }
};
```

**Fix #3: Default Strategy**

```cpp
class Calculator {
    static int defaultOp(int a, int b) { return 0; }
    int (*operation)(int, int) = defaultOp;
public:
    int calculate(int a, int b) {
        return operation(a, b);  // Always safe
    }
};
```

**Key Takeaway:** Always initialize function pointers (constructor, default value, or null check) to prevent undefined behavior.

---

#### Q2
```cpp
class Sorter {
    bool (*compare)(int, int);
public:
    void sort(vector<int>& data) {
        std::sort(data.begin(), data.end(), compare);
    }
};

// Usage:
bool ascending(int a, int b) { return a < b; }
Sorter sorter;
sorter.setCompare(ascending);

// What are the limitations of function pointers for strategies?
```

**Answer:**

Function pointers cannot capture state (no closures) and have limited type safety compared to functors or lambdas.

**Explanation:**

**Limitation #1: No State/Context**

Function pointers are just addresses - cannot carry additional data or configuration.

```cpp
// Want to sort with custom threshold:
bool closeEnough(int a, int b) {
    int threshold = ???;  // ❌ No way to pass threshold
    return abs(a - b) < threshold;
}

// Cannot do this with function pointers:
sorter.setCompare(closeEnough_with_threshold_5);
```

**Limitation #2: Cannot Use Lambdas with Captures**

```cpp
int threshold = 10;
auto compare = [threshold](int a, int b) {
    return abs(a - b) < threshold;
};

Sorter sorter;
sorter.setCompare(compare);  // ❌ Compile error
// Lambda with capture cannot convert to function pointer
```

**Limitation #3: No Polymorphism**

```cpp
// Cannot use inheritance:
class Comparator {
    virtual bool compare(int, int) = 0;
};

class AscendingComparator : public Comparator { /*...*/ };

Sorter sorter;
sorter.setCompare(&AscendingComparator::compare);  // ❌ Won't work
```

**Better Alternative: std::function**

```cpp
class Sorter {
    function<bool(int, int)> compare;
public:
    void setCompare(function<bool(int, int)> cmp) {
        compare = cmp;
    }

    void sort(vector<int>& data) {
        std::sort(data.begin(), data.end(), compare);
    }
};

// Now works with everything:
int threshold = 10;
sorter.setCompare([threshold](int a, int b) {
    return abs(a - b) < threshold;  // ✅ Works!
});
```

**Performance Comparison:**

| Approach | State | Type Safety | Performance |
|----------|-------|-------------|-------------|
| Function pointer | ❌ No | Low | Fastest (direct call) |
| std::function | ✅ Yes | Medium | Slower (~10ns overhead) |
| Functor class | ✅ Yes | High | Fast (inlinable) |
| Virtual function | ✅ Yes | High | Moderate (vtable lookup) |

**Key Takeaway:** Function pointers limited to stateless strategies. Use `std::function`, functors, or virtual functions for stateful strategies.

---

#### Q3
```cpp
class FileCompressor {
    unique_ptr<CompressionStrategy> strategy;
public:
    void compress(const string& file) {
        auto data = readFile(file);
        auto compressed = strategy->compress(data);
        writeFile(file + ".compressed", compressed);
    }

    void setStrategy(unique_ptr<CompressionStrategy> s) {
        strategy = std::move(s);
    }
};

// Usage:
FileCompressor compressor;
compressor.setStrategy(make_unique<ZipStrategy>());
compressor.compress("data.txt");

compressor.setStrategy(make_unique<GzipStrategy>());
compressor.compress("data.txt");  // ❌ What's wrong?
```

**Answer:**

First compression overwrites input file, making second compression attempt on corrupted/compressed data instead of original.

**Explanation:**

**Execution Flow:**

```cpp
// State: data.txt (original uncompressed)
compressor.setStrategy(make_unique<ZipStrategy>());
compressor.compress("data.txt");
// → Reads data.txt
// → Compresses with ZIP
// → Writes data.txt.compressed
// State: data.txt (still original), data.txt.compressed (ZIP)

compressor.setStrategy(make_unique<GzipStrategy>());
compressor.compress("data.txt");
// → Reads data.txt (ORIGINAL uncompressed)
// → Compresses with GZIP
// → Writes data.txt.compressed (OVERWRITES ZIP version!)
// State: data.txt (original), data.txt.compressed (GZIP, ZIP lost)
```

**Problem:** Output filename collision - both strategies write to same file, second overwrites first.

**Fix #1: Strategy-Specific Extensions**

```cpp
class CompressionStrategy {
public:
    virtual string getExtension() const = 0;
    virtual vector<byte> compress(const vector<byte>&) = 0;
};

class ZipStrategy : public CompressionStrategy {
    string getExtension() const override { return ".zip"; }
};

class GzipStrategy : public CompressionStrategy {
    string getExtension() const override { return ".gz"; }
};

void FileCompressor::compress(const string& file) {
    auto data = readFile(file);
    auto compressed = strategy->compress(data);
    string outFile = file + strategy->getExtension();
    writeFile(outFile, compressed);  // ✅ Unique per strategy
}

// Now:
// data.txt → data.txt.zip
// data.txt → data.txt.gz (both coexist)
```

**Fix #2: User-Specified Output**

```cpp
void compress(const string& input, const string& output) {
    auto data = readFile(input);
    auto compressed = strategy->compress(data);
    writeFile(output, compressed);
}

// Usage:
compressor.compress("data.txt", "data.zip");
compressor.compress("data.txt", "data.gz");
```

**Fix #3: Batch Different Strategies**

```cpp
void compressWithAll(const string& file,
                     const vector<unique_ptr<CompressionStrategy>>& strategies) {
    auto data = readFile(file);

    for (auto& strategy : strategies) {
        auto compressed = strategy->compress(data);
        writeFile(file + strategy->getExtension(), compressed);
    }
}
```

**Key Takeaway:** Strategy pattern execution can have side effects (file writes, state changes). Design strategies to avoid conflicts when switching between them.

---

#### Q4
```cpp
template<typename Strategy>
class Processor {
    Strategy strategy;
public:
    void process(Data& data) {
        strategy.execute(data);
    }
};

// Strategies:
struct FastStrategy {
    void execute(Data& d) { /* fast algorithm */ }
};

struct AccurateStrategy {
    void execute(Data& d) { /* accurate but slow */ }
};

// Usage:
Processor<FastStrategy> fastProcessor;
Processor<AccurateStrategy> accurateProcessor;

// What's the difference from runtime polymorphism?
```

**Answer:**

Compile-time (template-based) strategy has zero runtime overhead but cannot switch strategies at runtime, unlike runtime polymorphism.

**Explanation:**

**Compile-Time Strategy (Templates):**

```cpp
template<typename Strategy>
class Processor {
    Strategy strategy;  // No virtual function, no pointer
public:
    void process(Data& data) {
        strategy.execute(data);  // Direct call, can be inlined
    }
};

// Compiler generates separate classes:
// Processor<FastStrategy> → separate type
// Processor<AccurateStrategy> → separate type
```

**Benefits:**
- **Zero overhead:** Direct function call, fully inlinable
- **Type safety:** Compile-time checks
- **Performance:** Same as hand-written specialized code

**Drawbacks:**
- **Cannot change at runtime:** Type fixed at compile time
  ```cpp
  Processor<FastStrategy> proc;
  // ❌ Cannot switch to AccurateStrategy later
  ```
- **Code bloat:** Separate code generated for each strategy type
- **No heterogeneous containers:**
  ```cpp
  vector<Processor<???>> processors;  // ❌ What type?
  ```

**Runtime Strategy (Polymorphism):**

```cpp
class Strategy {
public:
    virtual void execute(Data&) = 0;
};

class Processor {
    unique_ptr<Strategy> strategy;  // Pointer to base class
public:
    void process(Data& data) {
        strategy->execute(data);  // Virtual call (~5ns overhead)
    }

    void setStrategy(unique_ptr<Strategy> s) {
        strategy = std::move(s);  // ✅ Can switch at runtime
    }
};
```

**Benefits:**
- **Runtime flexibility:** Change strategy dynamically
- **Homogeneous containers:** `vector<unique_ptr<Strategy>>`
- **Plugin architecture:** Load strategies from DLLs

**Drawbacks:**
- **Virtual call overhead:** ~5-10ns per call
- **Cannot inline:** Compiler doesn't know which function to call

**When to Use Each:**

| Scenario | Use Template Strategy | Use Runtime Strategy |
|----------|---------------------|---------------------|
| Strategy known at compile time | ✅ Yes | ❌ Overkill |
| Need runtime switching | ❌ No | ✅ Yes |
| Performance critical (hot path) | ✅ Yes | ⚠️ Maybe |
| Plugin system | ❌ No | ✅ Yes |
| STL-style generic code | ✅ Yes | ❌ No |

**Benchmark:**

```cpp
// Template strategy: 100M operations
// Time: 850ms (fully inlined)

// Virtual strategy: 100M operations
// Time: 1250ms (~40% slower due to virtual calls)
```

**Key Takeaway:** Template-based strategy (compile-time) offers zero overhead but no runtime flexibility. Virtual functions (runtime) allow dynamic strategy switching with small overhead.

---

#### Q5
```cpp
class Context {
    Strategy* strategy;
public:
    void executeStrategy(Data& data) {
        if (data.isLarge()) {
            strategy = &parallelStrategy;
        } else {
            strategy = &sequentialStrategy;
        }
        strategy->process(data);
    }

private:
    ParallelStrategy parallelStrategy;
    SequentialStrategy sequentialStrategy;
};

// Is it good practice to change strategy inside execution?
```

**Answer:**

Generally not recommended - strategy selection should happen before execution, not during. Mixing selection logic with execution violates separation of concerns.

**Explanation:**

**Why This is Problematic:**

**Problem #1: Mixed Responsibilities**

Context now has two jobs:
1. Choose appropriate strategy (selection logic)
2. Execute strategy (delegation)

This violates Single Responsibility Principle.

```cpp
// Context knows too much about when to use each strategy
void executeStrategy(Data& data) {
    if (data.isLarge()) {  // ❌ Business logic in Context
        strategy = &parallelStrategy;
    } else if (data.isCritical()) {
        strategy = &accurateStrategy;
    } else {
        strategy = &fastStrategy;
    }
    strategy->process(data);
}
```

**Problem #2: Testing Difficulty**

Cannot test strategy selection separately from execution.

```cpp
// Want to test: "Does Context choose parallel for large data?"
// But test also executes the strategy (side effects)
Context ctx;
ctx.executeStrategy(largeData);  // Selection + Execution coupled
```

**Problem #3: Unpredictable Behavior**

Client sets strategy, but Context overrides it internally - confusing API.

```cpp
Context ctx;
ctx.setStrategy(&myCustomStrategy);  // User sets strategy
ctx.executeStrategy(largeData);      // Context ignores it, uses parallelStrategy!
```

**Better Design: Separate Selection from Execution**

**Approach #1: Factory Selects Strategy**

```cpp
class StrategyFactory {
public:
    unique_ptr<Strategy> selectStrategy(const Data& data) {
        if (data.isLarge()) {
            return make_unique<ParallelStrategy>();
        } else {
            return make_unique<SequentialStrategy>();
        }
    }
};

class Context {
    unique_ptr<Strategy> strategy;
public:
    void setStrategy(unique_ptr<Strategy> s) {
        strategy = std::move(s);
    }

    void execute(Data& data) {
        strategy->process(data);  // Pure delegation
    }
};

// Usage:
StrategyFactory factory;
Context context;

auto strategy = factory.selectStrategy(data);  // Selection
context.setStrategy(std::move(strategy));      // Configuration
context.execute(data);                         // Execution
```

**Approach #2: Strategy Handles Selection Internally**

```cpp
class AdaptiveStrategy : public Strategy {
    ParallelStrategy parallel;
    SequentialStrategy sequential;
public:
    void process(Data& data) override {
        if (data.isLarge()) {
            parallel.process(data);
        } else {
            sequential.process(data);
        }
    }
};

// Context just executes, doesn't know about selection
Context ctx;
ctx.setStrategy(make_unique<AdaptiveStrategy>());
ctx.execute(data);  // AdaptiveStrategy decides internally
```

**Approach #3: Client Controls Selection**

```cpp
Context ctx;
Data data = loadData();

if (data.isLarge()) {
    ctx.setStrategy(make_unique<ParallelStrategy>());
} else {
    ctx.setStrategy(make_unique<SequentialStrategy>());
}

ctx.execute(data);  // Client already chose strategy
```

**When Internal Selection is Acceptable:**

Sometimes internal strategy switching is justified:

```cpp
class CacheStrategy : public Strategy {
    LRUCache cache;
public:
    void process(Request& req) override {
        if (cache.contains(req.key)) {
            return cache.get(req.key);  // Fast path
        } else {
            auto result = expensiveComputation(req);
            cache.put(req.key, result);
            return result;
        }
    }
};

// Here, cache check is implementation detail, not external concern
```

**Key Takeaway:** Strategy selection logic should be separate from execution logic. Use factories, adaptive strategies, or client-side selection instead of embedding selection in Context.

---
