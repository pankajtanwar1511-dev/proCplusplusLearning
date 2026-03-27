## TOPIC: Copy Elision and Return Value Optimization (RVO)

### INTERVIEW_QA: Comprehensive Questions

#### Q1: What is copy elision and when does it occur?
**Difficulty:** #beginner
**Category:** #compiler_optimization #language_rules
**Concepts:** #copy_elision #rvo #optimization #object_construction

**Answer:**
Copy elision is a compiler optimization that eliminates unnecessary copy or move operations by constructing objects directly in their final destination, occurring primarily when returning objects from functions or initializing from temporaries.

**Code example:**
```cpp
Widget create() {
    return Widget();  // ✅ Copy elision: Widget constructed directly in caller
}

Widget w = create();  // No copy or move, just one construction
```

**Explanation:**
Rather than constructing a temporary object inside `create()`, copying or moving it to `w`, and destroying the temporary, copy elision allows the compiler to construct the object directly in `w`'s memory location. This eliminates all intermediate copy/move operations. Copy elision can occur in several contexts: returning from functions (RVO), initializing objects from temporaries, passing temporaries to functions, and in exception handling. In C++17 and later, certain forms of copy elision became mandatory rather than optional.

**Key takeaway:** Copy elision is a zero-cost optimization that eliminates copy and move operations entirely by constructing objects directly in their final location.

---

#### Q2: What is the difference between RVO and NRVO?
**Difficulty:** #intermediate
**Category:** #compiler_optimization #language_rules
**Concepts:** #rvo #nrvo #copy_elision #named_return #unnamed_return

**Answer:**
RVO (Return Value Optimization) elides copies when returning unnamed temporaries and is mandatory in C++17, while NRVO (Named Return Value Optimization) elides copies when returning named local variables but remains optional even in C++17.

**Code example:**
```cpp
Widget rvo() {
    return Widget();      // ✅ RVO: mandatory in C++17, returns unnamed temporary
}

Widget nrvo() {
    Widget w;
    return w;             // ✅ NRVO: optional even in C++17, returns named local
}
```

**Explanation:**
The key distinction is whether the returned object has a name. RVO applies to expressions like `return Widget();` where a temporary is created and immediately returned—this is now guaranteed by the C++17 standard. NRVO applies when you construct a named local variable and then return it—while most compilers apply NRVO reliably, the standard doesn't mandate it, so you cannot return non-copyable, non-movable named objects even in C++17. This asymmetry exists because the compiler can always identify the construction site for unnamed temporaries, but named locals might have multiple uses before being returned.

**Key takeaway:** RVO (unnamed temporaries) is guaranteed in C++17; NRVO (named locals) is optional but commonly implemented by modern compilers.

---

#### Q3: Does using std::move in a return statement improve performance?
**Difficulty:** #intermediate
**Category:** #move_semantics #common_mistakes
**Concepts:** #std_move #rvo #nrvo #copy_elision #performance

**Answer:**
No, using `std::move` in a return statement typically hurts performance by preventing copy elision; the compiler automatically treats local returns as rvalues when needed.

**Code example:**
```cpp
Widget good() {
    Widget w;
    return w;              // ✅ Best: NRVO or automatic move
}

Widget bad() {
    Widget w;
    return std::move(w);   // ❌ Worse: prevents NRVO, forces move
}
```

**Explanation:**
When you write `return w;` for a local variable, the compiler first attempts NRVO (constructing directly in caller's space). If NRVO cannot be applied, the compiler automatically treats `w` as an rvalue for the return statement, enabling move semantics without explicit `std::move`. When you write `return std::move(w);`, you prevent NRVO because you're explicitly casting to an rvalue reference, and you force the move constructor call even if NRVO would have been possible. This results in a move operation where no operation at all would have occurred with NRVO.

**Key takeaway:** Never use `std::move` on local objects in return statements; the compiler handles return optimization better without it.

---

#### Q4: Can you return non-copyable, non-movable types in C++17?
**Difficulty:** #advanced
**Category:** #language_rules #type_requirements
**Concepts:** #mandatory_elision #non_copyable #non_movable #prvalue

**Answer:**
Yes, but only when returning prvalues (unnamed temporaries); you cannot return named local variables of non-copyable, non-movable types even in C++17 because NRVO remains optional.

**Code example:**
```cpp
struct Immovable {
    Immovable() = default;
    Immovable(const Immovable&) = delete;
    Immovable(Immovable&&) = delete;
};

Immovable works() {
    return Immovable();    // ✅ C++17: compiles, mandatory elision
}

Immovable fails() {
    Immovable obj;
    return obj;            // ❌ Compile error: NRVO not guaranteed, type not movable
}
```

**Explanation:**
C++17's mandatory copy elision applies only to prvalues—pure rvalues that are temporary expressions without names. When you write `return Immovable();`, the language guarantees that no copy or move constructor is needed; the object is constructed directly in the caller's space. However, when returning a named local variable (`obj`), NRVO is optional, so the compiler might need to move or copy the object. Since `Immovable` has deleted copy and move constructors, this fails to compile. This distinction is important for designing types and APIs.

**Key takeaway:** Mandatory elision in C++17 allows returning non-movable types only as prvalues (unnamed temporaries), not as named locals.

---

#### Q5: How does copy elision interact with exception handling?
**Difficulty:** #advanced
**Category:** #exception_handling #object_lifetime
**Concepts:** #copy_elision #exception_safety #constructor_exception #rvo

**Answer:**
When copy elision is applied, the object is constructed directly in the caller's stack frame, so if the constructor throws, the object never completes initialization and no destructor is called for it.

**Code example:**
```cpp
class Resource {
public:
    Resource() {
        std::cout << "Constructor\n";
        throw std::runtime_error("Failed");
    }
    ~Resource() {
        std::cout << "Destructor\n";  // Never called if constructor throws
    }
};

Resource create() {
    return Resource();  // RVO: constructed in caller's frame
}

int main() {
    try {
        Resource r = create();  // Constructor throws, r never fully constructed
    } catch (...) {
        std::cout << "Caught exception\n";
    }
    // No destructor output: r was never successfully constructed
}
```

**Explanation:**
With copy elision, there's no intermediate temporary object—the returned object is constructed directly where it will be used. If the constructor throws an exception during this construction, the object never reaches a fully-constructed state, so its destructor won't be called. This is different from the non-elided case where a temporary might be constructed (and destroyed) before being copied. This behavior is generally desirable for exception safety: destructors only run for fully-constructed objects. However, it's important to understand for reasoning about resource management and RAII patterns.

**Key takeaway:** Copy elision affects exception handling by constructing objects directly in their final location, meaning failed constructions never trigger destructors.

---

#### Q6: Why do some functions return by const value, and does it affect copy elision?
**Difficulty:** #intermediate
**Category:** #const_correctness #code_patterns
**Concepts:** #const_return #copy_elision #move_semantics #language_rules

**Answer:**
Returning by const value is generally discouraged in modern C++ because it prevents move semantics while not affecting copy elision in C++17, though it was sometimes used in older code to prevent accidental assignment.

**Code example:**
```cpp
const Widget badReturn() {
    return Widget();  // ❌ const prevents move, but RVO still applies
}

Widget goodReturn() {
    return Widget();  // ✅ Allows both RVO and move if needed
}

void usage() {
    Widget w1 = badReturn();   // RVO applies, but if it didn't, can't move
    Widget w2 = goodReturn();  // RVO applies, and can move if needed
}
```

**Explanation:**
In C++17, mandatory copy elision means that for prvalues, the const qualifier on the return type doesn't affect the optimization—the object is constructed in place regardless. However, returning const by value prevents move semantics from being used if copy elision doesn't apply (such as with NRVO). The historical reason for const return was to prevent expressions like `func() = value;`, but this is now considered an anti-pattern because it pessimizes modern code. The const prevents binding to rvalue references, breaking move-only types and preventing move optimizations.

**Key takeaway:** Don't return by const value; it prevents move semantics without providing meaningful benefits in modern C++.

---

#### Q7: Can copy elision occur when passing arguments to functions?
**Difficulty:** #intermediate
**Category:** #function_parameters #compiler_optimization
**Concepts:** #copy_elision #argument_passing #parameter_passing #temporary_materialization

**Answer:**
Yes, when passing temporary objects as arguments, copy elision can construct the temporary directly in the parameter's location (C++17's mandatory elision applies here).

**Code example:**
```cpp
void process(Widget w) {
    // w is constructed from the argument
}

void example() {
    process(Widget());         // ✅ C++17: Widget constructed directly as parameter
    process(createWidget());   // ✅ C++17: Return value constructed directly as parameter
    
    Widget temp;
    process(temp);             // ❌ No elision: copying/moving from existing object
}
```

**Explanation:**
When you pass a prvalue (like `Widget()` or a prvalue-returning function call) to a pass-by-value function parameter, C++17's mandatory copy elision allows the temporary to be constructed directly in the parameter's storage. This is similar to return value optimization but for function arguments. However, this only applies to prvalues being passed directly—if you pass an existing named object (even with `std::move`), copy elision doesn't apply because you're explicitly requesting construction from an existing object. This optimization can significantly improve performance when passing complex objects by value.

**Key takeaway:** C++17 enables copy elision for prvalue arguments passed to functions, constructing temporaries directly in parameter storage.

---

#### Q8: What happens if you try to take the address of a returned temporary?
**Difficulty:** #intermediate
**Category:** #undefined_behavior #lifetime_issues
**Concepts:** #temporary_lifetime #dangling_pointer #rvo #prvalue

**Answer:**
Taking the address of a returned temporary leads to undefined behavior because the temporary's lifetime ends at the end of the full expression unless it's bound to a reference.

**Code example:**
```cpp
Widget* getPointer1() {
    Widget* ptr = &Widget();  // ❌ Undefined behavior: temporary dies immediately
    return ptr;
}

Widget* getPointer2() {
    Widget temp;
    return &temp;             // ❌ Undefined behavior: local dies when function returns
}

const Widget& getReference() {
    return Widget();          // ❌ Undefined behavior: temporary dies when function returns
}

Widget getValue() {
    return Widget();          // ✅ Correct: returns by value with RVO
}
```

**Explanation:**
Temporaries have limited lifetimes: they are destroyed at the end of the full expression that creates them, unless they are bound to a reference (which extends their lifetime). Trying to return a pointer or reference to a temporary or local object creates a dangling pointer/reference. Even with copy elision, you cannot extend an object's lifetime by returning its address—RVO doesn't change the fundamental rule that you cannot return pointers/references to local objects. The correct approach is to return by value, allowing copy elision to optimize the operation.

**Key takeaway:** Never return pointers or references to temporaries or local objects; return by value instead and let copy elision optimize.

---

#### Q9: How do multiple return statements affect copy elision?
**Difficulty:** #intermediate
**Category:** #control_flow #compiler_optimization
**Concepts:** #nrvo #multiple_returns #copy_elision #control_flow

**Answer:**
Multiple return statements returning different named variables prevent NRVO because the compiler cannot determine at compile time which object will be returned, but each path can still use RVO if returning temporaries.

**Code example:**
```cpp
Widget bad(bool flag) {
    Widget a, b;
    return flag ? a : b;  // ❌ NRVO prevented: multiple candidates
}

Widget good(bool flag) {
    if (flag) {
        return Widget(1);  // ✅ RVO on this path
    } else {
        return Widget(2);  // ✅ RVO on this path
    }
}
```

**Explanation:**
For NRVO to work, the compiler must be able to identify a single local variable that will definitely be returned, allowing it to construct that variable directly in the caller's space. When there are multiple named variables that might be returned based on runtime conditions, the compiler cannot perform this optimization—it doesn't know which object to construct in the caller's space. However, if each return statement returns a different temporary (prvalue), each path can benefit from RVO independently. Automatic move conversion will apply in the bad case, so moves occur instead of copies.

**Key takeaway:** Return temporaries from multiple paths to enable RVO; returning different named variables prevents NRVO but automatic move conversion applies.

---

#### Q10: Does copy elision apply to function parameters returned by the function?
**Difficulty:** #advanced
**Category:** #function_parameters #compiler_optimization
**Concepts:** #copy_elision #parameter_return #rvo #nrvo

**Answer:**
No, copy elision typically does not apply when returning a function parameter because the parameter's storage is provided by the caller, not constructed locally in the function, but automatic move conversion applies.

**Code example:**
```cpp
Widget transform(Widget w) {
    // modify w
    return w;  // ❌ Copy elision unlikely: w is a parameter, not local
               // ✅ Automatic move will apply instead
}

Widget transformLocal() {
    Widget w;
    // modify w
    return w;  // ✅ NRVO may apply: w is a local variable
}
```

**Explanation:**
Copy elision works by having the compiler construct an object directly in the caller's destination location. When returning a parameter, that parameter was already constructed (by the caller) in the function's parameter space before the function was called. The compiler cannot retroactively change where the parameter was constructed. However, C++ applies automatic move conversion to parameter returns, treating `w` as an rvalue in the return statement, so the move constructor will be used instead of the copy constructor. This is still less efficient than full copy elision but better than copying.

**Key takeaway:** Function parameters cannot benefit from copy elision when returned, but automatic move conversion makes the return efficient.

---

#### Q11: What is the difference between prvalue and xvalue with respect to copy elision?
**Difficulty:** #advanced
**Category:** #value_categories #language_rules
**Concepts:** #prvalue #xvalue #rvalue #copy_elision #value_category

**Answer:**
Prvalues (pure rvalues like temporaries) are the only value category eligible for mandatory copy elision in C++17, while xvalues (expiring values from `std::move`) cannot be elided because they refer to existing objects.

**Code example:**
```cpp
Widget createPrvalue() {
    return Widget();        // ✅ Prvalue: mandatory elision
}

Widget createXvalue() {
    Widget w;
    return std::move(w);    // ❌ Xvalue: no elision, just moves
}

void test() {
    Widget w1 = createPrvalue();  // Prvalue: elided
    Widget w2 = createXvalue();   // Xvalue: moved, not elided
}
```

**Explanation:**
Value categories determine how expressions can be used. Prvalues represent temporary objects that don't have a name or address yet—they're "pure" rvalues that can be materialized directly in their final location. Xvalues (eXpiring values) are expressions like `std::move(x)` that refer to objects whose resources can be moved from but which already exist at some memory location. C++17's mandatory copy elision only applies to prvalues because the compiler can construct them anywhere. Xvalues already have a location, so copy elision doesn't apply; they can only be moved from, not elided.

**Key takeaway:** Only prvalues can be elided in C++17's mandatory copy elision; xvalues (from `std::move`) can be moved but not elided.

---

#### Q12: How do compiler flags affect copy elision behavior?
**Difficulty:** #intermediate
**Category:** #compiler_behavior #debugging
**Concepts:** #compiler_flags #copy_elision #debug_mode #optimization_levels

**Answer:**
Before C++17, compiler flags like `-fno-elide-constructors` (GCC/Clang) could disable optional copy elision for debugging, but C++17's mandatory elision cannot be disabled as it's required by the standard.

**Code example:**
```cpp
Widget create() {
    return Widget();  // C++17: Always elided, regardless of flags
}

Widget createNamed() {
    Widget w;
    return w;  // Can be affected by optimization flags (NRVO optional)
}
```

**Explanation:**
In pre-C++17 code, developers could use compiler flags to disable copy elision to verify that copy and move constructors were correctly implemented. This was useful for testing since elision could hide missing or incorrect special member functions. However, C++17 made certain forms of copy elision mandatory, meaning code that compiles in C++17 mode with `return T()` doesn't need copy or move constructors at all. Compiler flags cannot disable mandatory elision. NRVO (returning named locals) remains optional and can still be affected by optimization settings and debug modes.

**Key takeaway:** C++17's mandatory copy elision cannot be disabled by compiler flags; only optional forms like NRVO are affected by optimization settings.

---

#### Q13: Can copy elision occur across translation units?
**Difficulty:** #advanced
**Category:** #compiler_behavior #optimization_limits
**Concepts:** #translation_unit #link_time_optimization #copy_elision #cross_tu

**Answer:**
Copy elision is typically a per-translation-unit optimization that occurs during compilation; however, link-time optimization (LTO) can potentially enable cross-translation-unit elision in some cases.

**Code example:**
```cpp
// file1.cpp
Widget create() {
    return Widget();  // RVO within this translation unit
}

// file2.cpp  
void use() {
    Widget w = create();  // Caller in different TU
}
```

**Explanation:**
Copy elision is primarily a compile-time optimization that requires the compiler to see both the construction site and the usage site. When a function is defined in one translation unit and called from another, the compiler typically cannot perform copy elision across this boundary during normal compilation. However, with link-time optimization (LTO) enabled, modern compilers can inline across translation units and potentially apply copy elision. C++17's mandatory elision for prvalues changes this somewhat—the guarantee is at the language level, so even without LTO, prvalues must be elided. In practice, for cross-TU returns, the object is constructed in the callee and the move/copy happens at the TU boundary unless LTO eliminates it.

**Key takeaway:** Copy elision is usually per-translation-unit, but C++17's mandatory elision and LTO can extend optimization across translation units.

---

#### Q14: What is temporary materialization and how does it relate to copy elision?
**Difficulty:** #advanced
**Category:** #language_mechanics #value_categories
**Concepts:** #temporary_materialization #prvalue #glvalue #copy_elision

**Answer:**
Temporary materialization is the process of converting a prvalue into an xvalue by creating a temporary object; copy elision occurs before materialization by constructing the prvalue directly in its final location.

**Code example:**
```cpp
struct S {
    int value;
};

void func(const S& s) {  // Reference parameter
    // Temporary materialization: S() prvalue becomes temporary xvalue
}

int main() {
    func(S{42});         // Prvalue S{42} materialized as temporary, binds to reference
    
    S s = S{42};         // No materialization: copy elision constructs directly in s
}
```

**Explanation:**
Before C++17, prvalues could conceptually represent temporary objects that hadn't been created yet. C++17 formalized this with temporary materialization: when a prvalue is needed in a context requiring an object (like binding to a reference), a temporary is materialized. However, copy elision happens before materialization—when initializing an object from a prvalue, the prvalue is constructed directly in the object's location without materializing a temporary first. This is why `S s = S{42};` involves only one object construction (in `s`'s location) rather than creating a temporary and copying.

**Key takeaway:** Copy elision prevents temporary materialization by constructing prvalues directly in their destination, avoiding temporary object creation.

---

#### Q15: How does copy elision affect RAII and resource management?
**Difficulty:** #intermediate
**Category:** #resource_management #design_patterns
**Concepts:** #raii #resource_management #copy_elision #constructor_destructor

**Answer:**
Copy elision improves RAII efficiency by eliminating unnecessary construction/destruction pairs, but RAII correctness doesn't depend on copy elision since it works correctly with or without optimization.

**Code example:**
```cpp
class FileHandle {
    FILE* file;
public:
    FileHandle(const char* name) {
        file = fopen(name, "r");
        std::cout << "File opened\n";
    }
    ~FileHandle() {
        if (file) fclose(file);
        std::cout << "File closed\n";
    }
    // Move/copy constructors would transfer ownership properly
};

FileHandle openFile() {
    return FileHandle("data.txt");  // RVO: only one open/close pair
}

void process() {
    FileHandle h = openFile();
    // Use h
}  // File automatically closed
```

**Explanation:**
RAII (Resource Acquisition Is Initialization) ties resource lifetime to object lifetime. Without copy elision, returning `FileHandle` would involve: (1) construct in `openFile`, (2) move/copy to return temporary, (3) destroy original, (4) move/copy to `h`, (5) destroy temporary. Each move would need to properly transfer resource ownership. With copy elision, only one construction and one destruction occur, simplifying resource management. However, RAII remains correct regardless—properly written move constructors maintain the invariant that exactly one object owns each resource.

**Key takeaway:** Copy elision makes RAII more efficient by eliminating redundant resource transfer operations, but RAII correctness doesn't depend on elision.

---
