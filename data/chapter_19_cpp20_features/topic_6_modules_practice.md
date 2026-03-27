## TOPIC: C++20 Modules - Modern Code Organization

### PRACTICE_TASKS: Module Scenarios and Code Analysis

#### Q1
```cpp
// math.cppm
export module math;

export int add(int a, int b) { return a + b; }
int multiply(int a, int b) { return a * b; }  // Bug: not exported!

// main.cpp
import math;

int main() {
    int x = add(5, 3);          // OK
    int y = multiply(5, 3);     // Bug: multiply not visible!
    return x + y;
}
```

**Answer:**
```
Compilation error: multiply() not declared in this scope
```

**Explanation:**
- `add()` has `export` keyword → visible to importers
- `multiply()` lacks `export` → module-internal only
- `main.cpp` imports `math` but can only see exported entities
- `multiply(5, 3)` → undefined identifier
- **Key Concept:** Only exported entities visible to module importers; non-exported functions are module-internal (like static in headers)

**Fixed Version:**
```cpp
export int add(int a, int b) { return a + b; }
export int multiply(int a, int b) { return a * b; }  // Now exported
```

---

#### Q2
```cpp
// utils.cppm
export module utils;

#define MAX_SIZE 100  // Bug: macros don't export!

export int get_max() { return MAX_SIZE; }

// main.cpp
import utils;
#include <iostream>

int main() {
    int arr[MAX_SIZE];  // Bug: MAX_SIZE undefined!
    std::cout << get_max() << "\n";  // OK
}
```

**Answer:**
```
Compilation error: MAX_SIZE not declared
```

**Explanation:**
- Macros do NOT cross module boundaries
- `#define MAX_SIZE 100` in module → local to module compilation
- `import utils` imports declarations, NOT preprocessor definitions
- `MAX_SIZE` undefined in `main.cpp`
- `get_max()` works (uses module-internal macro)
- **Key Concept:** Modules don't export macros; use constexpr variables instead of macros for cross-module constants

**Fixed Version:**
```cpp
// utils.cppm
export module utils;

export constexpr int MAX_SIZE = 100;  // Export constexpr, not macro

export int get_max() { return MAX_SIZE; }
```

---

#### Q3
```cpp
// lib.cppm
export module lib;

#include <vector>  // Bug: imports <vector> into global module fragment!

export std::vector<int> get_data() {
    return {1, 2, 3};
}

// main.cpp
import lib;

int main() {
    auto data = get_data();  // OK
    std::vector<int> vec;    // Bug: std::vector not visible!
}
```

**Answer:**
```
Compilation error: std::vector not declared (depends on implementation)
```

**Explanation:**
- `#include <vector>` in module brings `<vector>` into module's private context
- Exported function uses `std::vector` → type implicitly reachable
- BUT `main.cpp` doesn't explicitly import `<vector>`
- Whether `std::vector` visible depends on compiler (implementation-defined)
- Some compilers: works (implicit reachability)
- Others: error (must explicitly import or include `<vector>`)
- **Key Concept:** Module importers should explicitly import/include dependencies; don't rely on implicit reachability of types used in exported interfaces

**Fixed Version:**
```cpp
// lib.cppm
export module lib;

import <vector>;  // Import as module (if supported)
// OR keep #include but document that users must include <vector>

export std::vector<int> get_data();

// main.cpp
import lib;
#include <vector>  // OR: import <vector>;

int main() {
    auto data = get_data();
    std::vector<int> vec;
}
```

---

#### Q4
```cpp
// math.cppm
export module math;

export namespace calc {
    int add(int a, int b) { return a + b; }  // Bug: function not exported individually!
}

// main.cpp
import math;

int main() {
    return calc::add(5, 3);  // Will this work?
}
```

**Answer:**
```
Compilation error: add() not accessible (or works, depending on interpretation)
```

**Explanation:**
- `export namespace calc { ... }` exports the namespace
- BUT individual function `add()` inside lacks `export` keyword
- Behavior is ambiguous/compiler-dependent
- Correct: export each entity OR use `export { ... }` block
- **Key Concept:** Exporting namespace doesn't automatically export contents; must export individual entities or use export block

**Fixed Version:**
```cpp
export module math;

export namespace calc {
    export int add(int a, int b) { return a + b; }  // Explicit export
}

// OR use export block:
export {
    namespace calc {
        int add(int a, int b) { return a + b; }
    }
}
```

---

#### Q5
```cpp
// shapes.cppm
export module shapes;

class Rectangle {  // Bug: class not exported!
    int width, height;
public:
    Rectangle(int w, int h) : width(w), height(h) {}
    int area() { return width * height; }
};

export Rectangle make_rect(int w, int h) {
    return Rectangle(w, h);
}

// main.cpp
import shapes;

int main() {
    auto rect = make_rect(5, 3);
    return rect.area();  // Bug: Rectangle definition not visible!
}
```

**Answer:**
```
Compilation error: Rectangle incomplete type or member access error
```

**Explanation:**
- `Rectangle` class not exported → definition not visible to importers
- `make_rect()` returns `Rectangle` → return type visible (reachable)
- But complete definition (members) NOT visible
- Cannot call `rect.area()` → member access on incomplete type
- **Key Concept:** Exporting function doesn't export types used in signature; must explicitly export classes if users need to access members

**Fixed Version:**
```cpp
export module shapes;

export class Rectangle {  // Export the class!
    int width, height;
public:
    Rectangle(int w, int h) : width(w), height(h) {}
    int area() { return width * height; }
};

export Rectangle make_rect(int w, int h) {
    return Rectangle(w, h);
}
```

---

#### Q6
```cpp
// module.cppm
export module mymod;

export template<typename T>
class Container {
    T value;
public:
    Container(T v) : value(v) {}
    T get() { return value; }  // Bug: not defined in module interface!
};

// main.cpp
import mymod;

int main() {
    Container<int> c(42);
    return c.get();  // May fail to instantiate!
}
```

**Answer:**
```
Possible linker error or instantiation failure (depends on compiler)
```

**Explanation:**
- Template class exported
- Member function `get()` defined inline → should be fine
- BUT if member defined out-of-line in module implementation, linker error occurs
- Templates must have definitions reachable at point of instantiation
- **Key Concept:** Template definitions must be in module interface (or module partition interface); out-of-line definitions in implementation unit cause instantiation failures

**Safe Version:**
```cpp
export module mymod;

export template<typename T>
class Container {
    T value;
public:
    Container(T v) : value(v) {}
    T get();  // Declaration
};

// Definition must be in interface!
template<typename T>
T Container<T>::get() { return value; }  // Still in module interface unit
```

---

#### Q7
```cpp
// utils.cppm
export module utils;

export int global_counter = 0;  // Bug: mutable global in module!

export void increment() {
    global_counter++;
}

export int get_counter() {
    return global_counter;
}

// a.cpp
import utils;
void func_a() { increment(); }

// b.cpp
import utils;
void func_b() { increment(); }

// main.cpp
import utils;
int main() {
    func_a();
    func_b();
    return get_counter();  // How many times incremented?
}
```

**Answer:**
```
2 (if a.cpp and b.cpp linked, share single global_counter)
```

**Explanation:**
- Module-exported global variables have external linkage
- All translation units importing module share SAME `global_counter`
- `func_a()` increments → 1
- `func_b()` increments → 2
- Result: 2
- **Note:** No bug here, this is correct module behavior
- **Key Concept:** Exported globals have external linkage; all importers share single instance (unlike headers where each TU gets own copy without inline/extern)

---

#### Q8
```cpp
// logger.cppm
export module logger;

#include <iostream>  // Bug: brings iostream into module

export void log(const std::string& msg) {
    std::cout << msg << "\n";
}

// main.cpp
import logger;

int main() {
    std::cout << "Direct output\n";  // Bug: std::cout not visible!
    log("Via logger");  // OK
}
```

**Answer:**
```
Compilation error: std::cout not declared (or works if #include <iostream> added)
```

**Explanation:**
- Module imports `<iostream>` privately
- `std::cout` available inside module
- But NOT exported or made visible to importers
- `main.cpp` must explicitly `#include <iostream>` or `import <iostream>;`
- Importing module doesn't transitively import its includes
- **Key Concept:** Modules are isolated; imports/includes in module don't automatically propagate to importers; each TU must explicitly import dependencies

**Fixed Version:**
```cpp
// main.cpp
import logger;
#include <iostream>  // OR: import <iostream>; if supported

int main() {
    std::cout << "Direct output\n";  // Now OK
    log("Via logger");
}
```

---

#### Q9
```cpp
// math.cppm
module;  // Global module fragment

#include <cmath>  // Bug: include in global fragment leaks to importers!

export module math;

export double sqrt_wrapper(double x) {
    return std::sqrt(x);
}

// main.cpp
import math;

int main() {
    double x = std::sqrt(16.0);  // Will this work?
}
```

**Answer:**
```
Implementation-defined (likely works but not guaranteed)
```

**Explanation:**
- `module;` starts global module fragment
- `#include <cmath>` in global fragment → brings `<cmath>` into "purview"
- Global module fragment declarations MAY be visible to importers (implementation-defined)
- Some compilers: `std::sqrt` visible in `main.cpp`
- Others: not visible → compilation error
- **Key Concept:** Global module fragment includes have undefined propagation behavior; always explicitly include/import dependencies in importing TU

**Fixed Version:**
```cpp
// math.cppm
module;
#include <cmath>

export module math;

export double sqrt_wrapper(double x) {
    return std::sqrt(x);
}

// main.cpp
import math;
#include <cmath>  // Explicit include!

int main() {
    double x = std::sqrt(16.0);
}
```

---

#### Q10
```cpp
// utils.cppm
export module utils;

export inline int get_value() {  // Bug: inline in module!
    static int counter = 0;
    return ++counter;
}

// a.cpp
import utils;
int a_val = get_value();

// b.cpp
import utils;
int b_val = get_value();

// main.cpp
import utils;
#include <iostream>

int main() {
    std::cout << get_value() << "\n";  // What value?
}
```

**Answer:**
```
3
```

**Explanation:**
- `inline` function in module has external linkage by default
- All importers share SAME definition (single instantiation)
- `static counter` shared across all TUs
- `a.cpp` calls → counter = 1
- `b.cpp` calls → counter = 2
- `main.cpp` calls → counter = 3
- **Note:** No bug, this is correct module inline behavior!
- **Key Concept:** Inline functions in modules have external linkage; static locals shared across TUs (unlike headers where each TU gets own copy)

---

#### Q11
```cpp
// shapes.cppm
export module shapes:partition;  // Bug: partition name but no primary module!

export struct Circle {
    double radius;
    double area();
};

// main.cpp
import shapes:partition;  // Can we import partition directly?

int main() {
    Circle c{5.0};
}
```

**Answer:**
```
Compilation error: partition cannot be imported directly without primary module interface
```

**Explanation:**
- Module partitions (`:partition`) are internal to module
- Cannot be imported directly by external code
- Must create primary module interface (`export module shapes;`)
- Primary interface exports partition: `export import :partition;`
- Importers import primary module: `import shapes;`
- **Key Concept:** Module partitions are implementation detail; external code imports primary module interface, not partitions directly

**Fixed Version:**
```cpp
// shapes-partition.cppm
export module shapes:circle;  // Partition

export struct Circle {
    double radius;
    double area();
};

// shapes.cppm
export module shapes;  // Primary interface

export import :circle;  // Re-export partition

// main.cpp
import shapes;  // Import primary module

int main() {
    Circle c{5.0};
}
```

---

#### Q12
```cpp
// lib.cppm
export module lib;

export class Base {
public:
    virtual void func() {}
};

export class Derived : public Base {  // Bug: inheritance from exported class
public:
    void func() override {}
};

// main.cpp
import lib;

int main() {
    Base* ptr = new Derived();
    ptr->func();  // Virtual dispatch works?
    delete ptr;
}
```

**Answer:**
```
Works correctly - virtual dispatch functions as expected
```

**Explanation:**
- Both `Base` and `Derived` exported
- Full definitions visible to importers
- Virtual table and dispatch mechanism work normally
- No ODR violations (single module definition)
- **No bug here!** Modules handle inheritance correctly
- **Key Concept:** Modules preserve C++ semantics including virtual dispatch, inheritance, and polymorphism; exported class hierarchies work identically to headers

---

---
