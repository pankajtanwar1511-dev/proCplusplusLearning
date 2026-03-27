## TOPIC: Move Semantics and std::move

### INTERVIEW_QA: Move Semantics Deep Dive

#### Q1: What problem does move semantics solve in C++?
**Difficulty:** #beginner
**Category:** #fundamentals #motivation
**Concepts:** #move_semantics #performance #copying

**Answer:**
Move semantics eliminates unnecessary copying of temporary objects by allowing efficient resource transfer, significantly improving performance for resource-owning types.

**Code example:**
```cpp
// Without move semantics (C++03):
std::vector<int> getData() {
    std::vector<int> result(1000000);
    return result;  // ❌ Forces expensive copy
}

// With move semantics (C++11+):
std::vector<int> getData() {
    std::vector<int> result(1000000);
    return result;  // ✅ Move or RVO - no copy
}
```

**Explanation:**
Before C++11, returning large objects meant copying all data even when the original would be destroyed immediately. Move semantics allows detecting temporaries and transferring ownership of their resources instead of duplicating them, providing automatic optimization without changing calling code.

**Key takeaway:** Move semantics enables efficient resource transfer from temporaries, avoiding expensive copies.

---

#### Q2: What does std::move actually do?
**Difficulty:** #beginner
**Category:** #fundamentals #common_pitfall
**Concepts:** #std_move #rvalue_cast #move_semantics

**Answer:**
`std::move` is simply a cast that converts an lvalue to an rvalue reference—it doesn't move anything itself, but enables move operations to be called.

**Code example:**
```cpp
std::string s1 = "hello";
std::string s2 = std::move(s1);  // Move constructor called here, not at std::move

// Equivalent to:
std::string s3 = static_cast<std::string&&>(s1);
```

**Explanation:**
Despite its name, `std::move` performs no moving—it's just `static_cast<T&&>`. The actual resource transfer happens in move constructors or move assignment operators when they receive the rvalue reference. `std::move` is permission for moving, not the move itself.

**Key takeaway:** `std::move` is a cast to rvalue reference, enabling but not performing the actual move.

---

#### Q3: What is the "valid but unspecified" state after moving?
**Difficulty:** #intermediate
**Category:** #move_semantics #object_state
**Concepts:** #moved_from_state #valid_but_unspecified #object_lifetime

**Answer:**
A moved-from object remains in a valid state where it can be destroyed or assigned new values, but its specific contents are unspecified and shouldn't be relied upon.

**Code example:**
```cpp
std::vector<int> v1 = {1, 2, 3};
std::vector<int> v2 = std::move(v1);

// Safe operations on v1:
v1.clear();                  // ✅ OK
v1 = {4, 5, 6};             // ✅ OK  
std::cout << v1.size();     // ✅ OK to call, but value is unspecified

// Unsafe operations:
// Assuming v1 is empty       // ❌ Not guaranteed
// Using v1's data            // ❌ Contents are unspecified
```

**Explanation:**
The C++ standard requires moved-from objects to be in a state where all operations are valid, but the actual value is implementation-defined. For standard types, this typically means empty/default state, but portable code shouldn't assume this. You can safely destroy the object, assign to it, or call methods, but reading its data is unreliable.

**Key takeaway:** Moved-from objects are safe for destruction and assignment but not for reading their supposedly-moved data.

---

#### Q4: How do you implement a move constructor?
**Difficulty:** #intermediate
**Category:** #implementation #move_semantics
**Concepts:** #move_constructor #resource_management #noexcept

**Answer:**
A move constructor transfers ownership by copying pointers/handles and nullifying the source, typically marked `noexcept` for optimal container performance.

**Code example:**
```cpp
class Buffer {
    int* data;
    size_t size;
public:
    // Move constructor
    Buffer(Buffer&& other) noexcept 
        : data(other.data), size(other.size) {
        other.data = nullptr;  // Nullify source
        other.size = 0;
    }
};
```

**Explanation:**
Move constructors steal resources by copying pointers and resetting the source to a safe state. The `noexcept` specification is crucial—without it, standard containers use copy constructors during reallocation for exception safety. The source must be left in a valid state where its destructor can run safely (hence nullifying pointers).

**Key takeaway:** Move constructors transfer ownership by copying handles and nullifying the source, marked `noexcept` for performance.

---

#### Q5: What's the difference between a move constructor and copy constructor?
**Difficulty:** #beginner
**Category:** #fundamentals #move_semantics
**Concepts:** #move_constructor #copy_constructor #resource_transfer

**Answer:**
Copy constructors create independent duplicates of resources (deep copy), while move constructors transfer ownership by stealing resources, leaving the source empty.

**Code example:**
```cpp
class Data {
    int* ptr;
public:
    // Copy: allocates new memory
    Data(const Data& other) {
        ptr = new int(*other.ptr);  // Deep copy
    }
    
    // Move: steals pointer
    Data(Data&& other) noexcept {
        ptr = other.ptr;       // Steal
        other.ptr = nullptr;   // Nullify
    }
};
```

**Explanation:**
Copy constructors preserve both objects independently, requiring resource duplication. Move constructors optimize for temporaries by transferring ownership instead of duplicating. The copy parameter is `const T&` (must preserve source), move parameter is `T&&` (can modify source). Moves are much faster for resource-heavy types.

**Key takeaway:** Copy duplicates resources; move transfers them—fundamentally different resource management strategies.

---

#### Q6: Why should move constructors be marked noexcept?
**Difficulty:** #intermediate
**Category:** #performance #exception_safety
**Concepts:** #noexcept #move_constructor #container_optimization

**Answer:**
Containers like `std::vector` only use move operations during reallocation if they're `noexcept`, otherwise they use copying for strong exception safety guarantee.

**Code example:**
```cpp
class Data {
public:
    Data(Data&& other);  // Not noexcept
    // std::vector will COPY when reallocating
    
    Data(Data&& other) noexcept;  // ✅ noexcept
    // std::vector will MOVE when reallocating
};

std::vector<Data> vec;
vec.push_back(Data());
vec.push_back(Data());  // May trigger reallocation
// Without noexcept: copies existing elements
// With noexcept: moves existing elements
```

**Explanation:**
When `std::vector` grows, it must relocate existing elements. If move operations can throw, a partial move followed by exception would leave the vector corrupted. To maintain strong exception safety, the vector copies instead of moving unless moves are guaranteed not to throw. Marking moves `noexcept` unlocks container optimizations.

**Key takeaway:** `noexcept` on move operations enables container optimizations by guaranteeing exception safety.

---

#### Q7: Can you move from a const object?
**Difficulty:** #intermediate
**Category:** #const_correctness #move_semantics
**Concepts:** #const #move_semantics #std_move

**Answer:**
You can call `std::move` on const objects, but it produces `const T&&` which cannot bind to move constructors, resulting in copying instead.

**Code example:**
```cpp
const std::string cs = "hello";
std::string s = std::move(cs);  // ❌ Calls COPY constructor, not move

void take(std::string&& s) { }
// take(std::move(cs));  // ❌ Error: const string&& → string&& conversion fails
```

**Explanation:**
Moving requires modifying the source (setting pointers to null, etc.), which const forbids. When you `std::move` a const object, you get `const T&&`, but move constructors expect `T&&` (non-const). The compiler falls back to the copy constructor which accepts `const T&`. This defeats the purpose of moving and indicates incorrect code.

**Key takeaway:** Moving from const objects fails or falls back to copying—const prevents resource transfer.

---

#### Q8: Is it safe to use an object after calling std::move on it?
**Difficulty:** #intermediate
**Category:** #move_semantics #object_lifetime
**Concepts:** #std_move #moved_from_state #safe_operations

**Answer:**
Yes, the object remains valid and can be destroyed or assigned new values, but you shouldn't assume anything about its contents until reassignment.

**Code example:**
```cpp
std::string s1 = "hello";
std::string s2 = std::move(s1);

// Safe operations:
s1.clear();          // ✅ OK
s1 = "world";        // ✅ OK
s1.~basic_string();  // ✅ OK (automatic in scope)

// Unsafe assumptions:
// if (s1.empty()) { }  // ❌ Not guaranteed
// std::cout << s1;     // ❌ Contents unspecified
```

**Explanation:**
Moved-from objects are guaranteed valid but not empty or in any specific state. All operations must remain safe, but observable state is implementation-defined. Best practice: after moving from an object, either let it be destroyed, or explicitly assign a new value before using it again.

**Key takeaway:** Moved-from objects are safe for assignment and destruction but not for reading data.

---

#### Q9: What's wrong with `return std::move(local);` for local variables?
**Difficulty:** #advanced
**Category:** #optimization #copy_elision
**Concepts:** #return_value #rvo #std_move #copy_elision

**Answer:**
Using `std::move` on returned locals can prevent Return Value Optimization (RVO), forcing a move instead of allowing the compiler to elide copies entirely.

**Code example:**
```cpp
std::vector<int> bad() {
    std::vector<int> v = {1, 2, 3};
    return std::move(v);  // ❌ Prevents RVO, forces move
}

std::vector<int> good() {
    std::vector<int> v = {1, 2, 3};
    return v;  // ✅ Allows RVO (zero copies/moves)
}
```

**Explanation:**
C++17 guarantees copy elision in many cases, constructing the return value directly in the caller's space with zero copies or moves. Writing `return std::move(v)` converts the return statement to a move, which while fast, is still slower than elision. The compiler automatically moves from locals when needed, so explicit `std::move` is both unnecessary and harmful.

**Key takeaway:** Never use `std::move` on returned locals—it prevents RVO and hurts performance.

---

#### Q10: What is the Rule of Five?
**Difficulty:** #intermediate
**Category:** #design_pattern #resource_management
**Concepts:** #rule_of_five #special_member_functions #move_semantics

**Answer:**
If you define any of destructor, copy constructor, copy assignment, move constructor, or move assignment, you should define all five to properly manage resources.

**Code example:**
```cpp
class Resource {
public:
    ~Resource();                              // 1. Destructor
    Resource(const Resource&);                // 2. Copy constructor
    Resource& operator=(const Resource&);     // 3. Copy assignment
    Resource(Resource&&) noexcept;            // 4. Move constructor
    Resource& operator=(Resource&&) noexcept; // 5. Move assignment
};
```

**Explanation:**
Classes managing resources (memory, files, locks) need custom special member functions. If you define a destructor to clean up, you likely need copy operations for correct duplication and move operations for efficient transfer. Defining only some can lead to resource leaks, double-frees, or performance issues. Modern C++ prefers the Rule of Zero using smart pointers to avoid this.

**Key takeaway:** Custom resource management requires all five special member functions for correctness and performance.

---

#### Q11: Why can't you return an rvalue reference to a local variable?
**Difficulty:** #intermediate
**Category:** #lifetime #undefined_behavior
**Concepts:** #dangling_reference #local_variable #return_value

**Answer:**
Local variables are destroyed when the function returns, so returning a reference (including rvalue reference) to them creates dangling references pointing to destroyed memory.

**Code example:**
```cpp
int&& dangerous() {
    int x = 42;
    return std::move(x);  // ❌ UB: x destroyed, reference dangles
}

int safe() {
    int x = 42;
    return x;  // ✅ OK: return by value (copy/move/RVO)
}
```

**Explanation:**
`std::move` only casts to rvalue reference—it doesn't prevent the local variable from being destroyed. When the function returns, `x` is destroyed and stack memory is reclaimed. Any reference to `x` (lvalue or rvalue) now points to invalid memory. Functions should return by value, letting the compiler optimize with RVO or automatic moves.

**Key takeaway:** Never return references to locals—return by value and let the compiler optimize.

---

#### Q12: What happens when you move from a container element?
**Difficulty:** #intermediate
**Category:** #containers #move_semantics
**Concepts:** #container #moved_from_state #element_access

**Answer:**
The element remains in the container in a moved-from state; the container's size doesn't change, but the element is now empty or invalid.

**Code example:**
```cpp
std::vector<std::string> vec = {"one", "two", "three"};
std::string s = std::move(vec[1]);  // Move from vec[1]

std::cout << vec.size() << "\n";    // Still 3
std::cout << vec[1] << "\n";        // Empty string (moved-from)

// To actually remove: vec.erase(vec.begin() + 1);
```

**Explanation:**
Moving from a container element doesn't remove it—it just leaves an empty-but-valid element in place. For `std::string`, this means an empty string. For `std::unique_ptr`, it means `nullptr`. The container still has the same number of elements. To remove elements, use `erase()` or algorithms like `std::remove_if` followed by `erase`.

**Key takeaway:** Moving from container elements leaves moved-from elements in place—use erase to actually remove them.

---

#### Q13: How does std::move interact with const references?
**Difficulty:** #intermediate
**Category:** #const_correctness #reference_binding
**Concepts:** #std_move #const_reference #type_mismatch

**Answer:**
`std::move` on const objects produces `const T&&`, which cannot bind to most move operations, causing copies or compilation errors.

**Code example:**
```cpp
void accept_move(std::string&& s) { }

const std::string cs = "hello";
// accept_move(std::move(cs));  // ❌ Error: const string&& vs string&&

const std::string& cref = "world";
// accept_move(std::move(cref)); // ❌ Same error
```

**Explanation:**
Move operations need to modify the source (nullifying pointers, etc.). When you `std::move` a const object or const reference, you get `const T&&`, which cannot bind to `T&&` parameters in move constructors or functions accepting rvalue references. This either causes compilation errors or falls back to copying.

**Key takeaway:** Const and move semantics are incompatible—moving requires modification which const forbids.

---

#### Q14: What is a move-only type and when would you use one?
**Difficulty:** #intermediate
**Category:** #design_pattern #ownership
**Concepts:** #move_only #unique_ownership #deleted_functions

**Answer:**
A move-only type deletes copy operations but allows moves, enforcing unique ownership semantics like `std::unique_ptr` or `std::thread`.

**Code example:**
```cpp
class FileHandle {
public:
    FileHandle(const char* path);
    
    // Delete copies
    FileHandle(const FileHandle&) = delete;
    FileHandle& operator=(const FileHandle&) = delete;
    
    // Allow moves
    FileHandle(FileHandle&&) noexcept = default;
    FileHandle& operator=(FileHandle&&) noexcept = default;
};
```

**Explanation:**
Move-only types represent resources that should have exactly one owner, like file handles, network connections, or unique pointers. Copying them would create shared ownership and require complex management. By deleting copy operations, you enforce unique ownership at compile time, preventing bugs from accidental copies while still allowing explicit ownership transfer via moves.

**Key takeaway:** Move-only types enforce unique ownership by deleting copies while allowing explicit ownership transfer.

---

#### Q15: Does std::move delete or invalidate the source object?
**Difficulty:** #beginner
**Category:** #common_pitfall #move_semantics
**Concepts:** #std_move #object_lifetime #moved_from_state

**Answer:**
No, `std::move` doesn't delete, invalidate, or even modify the object—it only casts to rvalue, enabling move operations that may modify it.

**Code example:**
```cpp
std::string s1 = "hello";
auto&& ref = std::move(s1);  // Just a cast
std::cout << s1 << "\n";     // Still prints "hello"

std::string s2 = std::move(s1);  // NOW move constructor executes
std::cout << s1.length() << "\n"; // Probably 0 (moved-from)
```

**Explanation:**
`std::move` is purely a type conversion—it doesn't call any functions or modify any data. After `std::move(x)`, the object `x` is unchanged until a move constructor or move assignment operator uses the returned rvalue reference. Only then does resource transfer occur, leaving the source in a valid-but-empty state.

**Key takeaway:** `std::move` is a cast, not an action—the object is unchanged until used in a move operation.

---

#### Q16: How do you implement move assignment with self-assignment safety?
**Difficulty:** #advanced
**Category:** #implementation #correctness
**Concepts:** #move_assignment #self_assignment #resource_management

**Answer:**
Check `this != &other` before moving to prevent destroying resources you're about to use in self-assignment scenarios.

**Code example:**
```cpp
class Buffer {
    int* data;
public:
    Buffer& operator=(Buffer&& other) noexcept {
        if (this != &other) {  // ✅ Essential check
            delete[] data;      // Safe: not deleting other's data
            data = other.data;
            other.data = nullptr;
        }
        return *this;
    }
};

Buffer b(100);
b = std::move(b);  // Without check: deletes own data!
```

**Explanation:**
Self-move assignment `x = std::move(x)` is valid code that must be handled correctly. Without the self-assignment check, you'd delete your own resources before trying to "steal" them from yourself, resulting in nullptr. While self-moves are rare, the standard requires them to be safe, and the check adds negligible overhead.

**Key takeaway:** Always check for self-assignment in move assignment to prevent destroying your own resources.

---

#### Q17: What's the difference between std::move and std::forward?
**Difficulty:** #advanced
**Category:** #template #perfect_forwarding
**Concepts:** #std_move #std_forward #conditional_cast

**Answer:**
`std::move` unconditionally casts to rvalue, while `std::forward` conditionally casts to rvalue only if the original argument was an rvalue.

**Code example:**
```cpp
template<typename T>
void wrapper(T&& arg) {
    func(std::move(arg));      // Always rvalue
    func(std::forward<T>(arg)); // Preserves original category
}

int x = 10;
wrapper(x);      // std::forward keeps as lvalue
wrapper(20);     // std::forward keeps as rvalue
```

**Explanation:**
`std::move` is for when you know you want to move regardless of the source. `std::forward` is for perfect forwarding in templates where you want to preserve the original value category (lvalue stays lvalue, rvalue stays rvalue). `std::forward` is conditional based on the template parameter, while `std::move` is unconditional.

**Key takeaway:** Use `std::move` for unconditional rvalue cast; use `std::forward` to preserve original value category.

---

#### Q18: Why do standard library types have both copy and move operations?
**Difficulty:** #intermediate
**Category:** #design_pattern #standard_library
**Concepts:** #move_semantics #copy_semantics #backward_compatibility

**Answer:**
Copy operations preserve both source and destination (needed for lvalues), while move operations optimize for temporaries (rvalues), providing both correctness and performance.

**Code example:**
```cpp
std::vector<int> v1 = {1, 2, 3};
std::vector<int> v2 = v1;           // Copy: v1 still usable
std::vector<int> v3 = std::move(v1); // Move: v1 is empty

void use_vector(std::vector<int> v);
use_vector(v2);           // Copy (v2 needed later)
use_vector(std::move(v3)); // Move (v3 not needed)
```

**Explanation:**
Different scenarios require different behaviors. When you need both the source and destination (lvalues), copying is essential. When the source is temporary (rvalue), moving is more efficient. By providing both, the standard library automatically selects the optimal operation based on value category through overload resolution, giving correctness and performance without manual intervention.

**Key takeaway:** Copy and move operations handle different scenarios—both are needed for complete, efficient resource management.

---

#### Q19: Can you move from an object multiple times?
**Difficulty:** #advanced
**Category:** #move_semantics #edge_cases
**Concepts:** #moved_from_state #multiple_moves #valid_but_unspecified

**Answer:**
Yes, you can move from an already-moved-from object, but the result is implementation-defined since the object is in an unspecified state.

**Code example:**
```cpp
std::string s1 = "hello";
std::string s2 = std::move(s1);  // First move: s1 likely empty
std::string s3 = std::move(s1);  // ✅ Legal: second move
// s3 likely empty, behavior depends on what s1's move constructor does
```

**Explanation:**
After moving, an object is valid but unspecified, meaning all operations are legal but state is undefined. Moving again is syntactically valid, but you're moving from an unknown state. For `std::string`, moving from an empty string likely gives another empty string. However, relying on this is poor practice—if you need to reuse an object after moving, explicitly assign a known value.

**Key takeaway:** Multiple moves are legal but unreliable—explicitly assign new values to moved-from objects before reuse.

---

#### Q20: How do move semantics interact with exception safety?
**Difficulty:** #advanced
**Category:** #exception_safety #move_semantics
**Concepts:** #noexcept #exception_safety #strong_guarantee

**Answer:**
Move operations should be `noexcept` to guarantee exception safety; throwing moves can violate strong exception guarantee in containers and algorithms.

**Code example:**
```cpp
class Data {
public:
    Data(Data&&);  // Can throw
    // Problem: std::vector uses copies to maintain strong guarantee
    
    Data(Data&&) noexcept;  // Cannot throw
    // std::vector can safely use moves
};

void risky() {
    std::vector<Data> v;
    v.resize(1000);  // Without noexcept: copies during reallocation
}
```

**Explanation:**
Strong exception guarantee promises that if an operation fails, the state is unchanged. With throwing move operations, this becomes impossible—partial moves followed by exceptions leave objects in inconsistent states. Standard containers check `noexcept` and only use moves if they're guaranteed not to throw, otherwise falling back to copies for safety.

**Key takeaway:** Mark move operations `noexcept` to enable optimizations and maintain exception safety guarantees.

---

#### Q21: What is copy elision and how does it relate to move semantics?
**Difficulty:** #intermediate
**Category:** #optimization #copy_elision
**Concepts:** #rvo #copy_elision #move_semantics

**Answer:**
Copy elision is a compiler optimization that eliminates copies/moves entirely by constructing objects directly in their final location, even more efficient than moving.

**Code example:**
```cpp
std::string create() {
    return std::string("hello");  // Copy elision: no copy, no move
}

std::string s = create();  // Constructed directly in s
// No copy constructor called, no move constructor called
```

**Explanation:**
Copy elision (including RVO) allows the compiler to skip copy/move constructors entirely, constructing the return value directly in the caller's space. C++17 guarantees this in many cases. Move semantics is a fallback when elision isn't possible—better than copying but not as fast as elision. Modern code relies on both: elision where possible, moves as fallback.

**Key takeaway:** Copy elision is better than moving; modern C++ uses both for optimal performance.

---

#### Q22: Why doesn't std::move work on arrays directly?
**Difficulty:** #advanced
**Category:** #arrays #move_semantics
**Concepts:** #array #std_move #element_wise_move

**Answer:**
Arrays decay to pointers, which are trivial types, so moving arrays requires element-wise moves using algorithms like `std::move` (the algorithm, not the cast).

**Code example:**
```cpp
std::string arr1[3] = {"one", "two", "three"};
// std::string arr2[3] = std::move(arr1);  // ❌ Cannot move array

std::string arr2[3];
std::move(std::begin(arr1), std::end(arr1), std::begin(arr2));  // ✅ OK
```

**Explanation:**
The array type itself doesn't have move operations—arrays aren't movable in C++. The `std::move` algorithm (different from `std::move` cast) applies the cast to each element, enabling element-wise moves. For containers and objects owning arrays, the containing object's move operations handle the transfer, but raw arrays need manual element-wise moves.

**Key takeaway:** Use `std::move` algorithm for element-wise moves; raw arrays don't have move operations.

---

#### Q23: How do you move data members in a move constructor?
**Difficulty:** #intermediate
**Category:** #implementation #move_semantics
**Concepts:** #move_constructor #member_initialization #std_move

**Answer:**
Use member initializer lists with `std::move` on each member that should be moved, as members aren't automatically moved even in move constructors.

**Code example:**
```cpp
class Composite {
    std::string name;
    std::vector<int> data;
    int* ptr;
public:
    Composite(Composite&& other) noexcept
        : name(std::move(other.name)),    // ✅ Explicitly move
          data(std::move(other.data)),    // ✅ Explicitly move
          ptr(other.ptr) {                // Just copy pointer
        other.ptr = nullptr;
    }
};
```

**Explanation:**
Even inside a move constructor, member variables are lvalues (they have names), so you must explicitly `std::move` them to invoke their move constructors. Without `std::move`, you'd call copy constructors instead. For pointers, direct copying followed by nullification is appropriate. Each member needs individual attention based on its type.

**Key takeaway:** Explicitly `std::move` each data member in move constructors—automatic moving doesn't happen.

---

#### Q24: What's the relationship between move semantics and smart pointers?
**Difficulty:** #intermediate
**Category:** #smart_pointers #move_semantics
**Concepts:** #unique_ptr #shared_ptr #move_only #ownership

**Answer:**
Smart pointers use move semantics to transfer ownership efficiently—`unique_ptr` is move-only to enforce exclusive ownership, while `shared_ptr` uses moves to avoid reference count overhead when possible.

**Code example:**
```cpp
std::unique_ptr<int> p1 = std::make_unique<int>(42);
// std::unique_ptr<int> p2 = p1;  // ❌ Copy deleted
std::unique_ptr<int> p2 = std::move(p1);  // ✅ Transfer ownership

std::shared_ptr<int> s1 = std::make_shared<int>(100);
std::shared_ptr<int> s2 = s1;           // Copy: increment refcount
std::shared_ptr<int> s3 = std::move(s1); // Move: no refcount change
```

**Explanation:**
`unique_ptr` embodies exclusive ownership through move-only semantics—you cannot copy it, only transfer ownership via move. `shared_ptr` allows copying but also provides move operations to avoid atomic reference count operations when transferring ownership. This makes smart pointers efficient and safe through judicious use of move semantics.

**Key takeaway:** Smart pointers leverage move semantics for efficient ownership transfer with strong type safety.

---

#### Q25: How does std::move affect primitive types?
**Difficulty:** #beginner
**Category:** #primitive_types #move_semantics
**Concepts:** #primitive_type #trivial_move #copy_vs_move

**Answer:**
For primitive types like `int`, `float`, `char`, etc., moving is identical to copying—there's no performance benefit since they don't manage resources.

**Code example:**
```cpp
int x = 42;
int y = std::move(x);  // Just copies the value

std::cout << x << "\n";  // Still 42 (unlike with std::string)
std::cout << y << "\n";  // Also 42

// Move constructor for int is same as copy
// No such thing as "moved-from int"
```

**Explanation:**
Primitive types are trivially copyable—they have no resources to manage, just bit patterns. Their move constructors are identical to copy constructors, performing simple memory copies. After moving a primitive, the source retains its value. Move semantics provides no benefit for primitives but causes no harm either.

**Key takeaway:** Moving primitives is identical to copying—move semantics only benefits resource-managing types.

---
