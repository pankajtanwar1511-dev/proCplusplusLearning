## TOPIC: C++20 Modules - Modern Code Organization

### INTERVIEW_QA: Modules Deep Dive

---

#### Q1: What advantages do modules provide over traditional headers?

**Answer:**

**Compilation Speed:**
- **Headers**: Parsed in every translation unit (TU)
- **Modules**: Compiled once, binary representation reused

**Isolation:**
- **Headers**: Macros leak, order matters
- **Modules**: Macros don't cross boundaries, order-independent

**Explicit Exports:**
- **Headers**: Everything is visible
- **Modules**: Only exported names visible

**Example:**

```cpp
// With headers:
// Every .cpp that includes <vector> recompiles the entire vector header

// With modules:
import std.vector;  // Uses precompiled module (10-100x faster)
```

**Measured Impact:**
- Large codebases see 50-90% compile time reduction
- Clean builds become feasible for huge projects

---

#### Q2: How do module partitions work?

**Answer:**

Module partitions split a module into logical parts:

```cpp
// Primary module interface
export module math;

export import :arithmetic;  // Re-export partition
export import :geometry;

// Partition 1
export module math:arithmetic;
export int add(int a, int b);

// Partition 2
export module math:geometry;
export double area(double r);
```

**Rules:**

1. Partition names start with `:` (e.g., `:arithmetic`)
2. Primary module decides what to re-export
3. Users only import primary module: `import math;`
4. Partitions are implementation detail (not visible to users)

**Benefits:**

- Organize large modules
- Separate concerns
- Parallel compilation of partitions

---

#### Q3: Why don't macros cross module boundaries?

**Answer:**

**By Design:** Modules aim to eliminate preprocessor issues.

```cpp
// module.cpp
export module my_module;

#define MAX 100
export int get_max() { return MAX; }

// main.cpp
import my_module;

int x = MAX;  // ❌ Error: MAX not defined
```

**Rationale:**

1. **Isolation**: Macros are preprocessing artifacts, not part of the C++ language proper
2. **Hygiene**: Prevents macro pollution across module boundaries
3. **Predictability**: Module interface is well-defined, not affected by preprocessing

**Solution:**

```cpp
// Use constexpr instead
export module my_module;

export constexpr int MAX = 100;  // ✅ Visible to importers
```

---

#### Q4: How do you migrate existing code from headers to modules?

**Answer:**

**Step-by-Step Migration:**

**Phase 1: Create Module Interface**

```cpp
// Old: math.h
#ifndef MATH_H
#define MATH_H
int add(int a, int b);
#endif

// New: math.ixx
export module math;
export int add(int a, int b);
```

**Phase 2: Provide Compatibility Layer**

```cpp
// math_compat.h
#ifdef __cpp_modules
import math;
#else
#include "math_traditional.h"
#endif
```

**Phase 3: Update Build System**

```cmake
# CMake example
add_library(math)
target_sources(math
    PUBLIC FILE_SET CXX_MODULES FILES
        math.ixx
)
```

**Phase 4: Gradual Transition**

- New code: `import math;`
- Legacy code: `#include "math_compat.h"`
- Eventually remove compatibility headers

**Challenges:**

- Build system support (CMake 3.28+, limited)
- Compiler differences (MSVC, GCC, Clang vary)
- Third-party libraries still use headers

---

#### Q5: What is the global module fragment and when is it needed?

**Answer:**

The **global module fragment** allows including traditional headers before the module declaration.

**Syntax:**

```cpp
module;  // Start global module fragment

#include <iostream>
#include <vector>

export module my_module;  // End global fragment

export void process(const std::vector<int>& vec) {
    for (int val : vec) {
        std::cout << val << ' ';
    }
}
```

**When Needed:**

1. **Standard library**: Most std library isn't modules yet
2. **Third-party headers**: Libraries still use headers
3. **Legacy code**: Interfacing with header-based code

**Rules:**

- Must appear before module declaration
- Only `#include` directives allowed
- Macros from included headers don't leak to importers

**Alternative (Future):**

```cpp
// When standard library modules are available:
export module my_module;

import std;  // No global fragment needed
```

---

(Q6-Q20 would continue covering: Private module fragments, template instantiation in modules, ODR implications, module interface unit vs implementation unit, export rules, and build system integration)

---
