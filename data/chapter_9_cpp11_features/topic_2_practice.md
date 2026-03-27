### PRACTICE_TASKS: Safety and Correctness Challenges

#### Q1
```cpp
std::vector<int> vec{1, 2, 3, 4, 5};
for (auto x : vec) {
    x *= 2;
}
for (auto x : vec) {
    std::cout << x << " ";
}
// What is printed?
```

**Answer:**
```
1 2 3 4 5
```

**Explanation:**
- First loop: `auto x` creates copy
- Modifications affect copy only
- vec unchanged
- Second loop prints original values
- Use `auto& x` to modify originals
- **Key Concept:** Range-for with auto copies; use auto& for modification

---

#### Q2
```cpp
void func(int x) { std::cout << "int\n"; }
void func(char* ptr) { std::cout << "pointer\n"; }

func(0);
func(NULL);
func(nullptr);
// What is printed for each call?
```

**Answer:**
```
int
int (or ambiguous)
pointer
```

**Explanation:**
- `func(0)` calls int overload (0 is int)
- `func(NULL)` ambiguous: NULL often defined as 0 or ((void*)0)
- C++11: NULL typically resolves to int overload
- `func(nullptr)` calls pointer overload
- nullptr has type std::nullptr_t, converts to any pointer
- nullptr designed to fix NULL ambiguity
- **Key Concept:** nullptr solves NULL overload ambiguity; always prefer nullptr for pointers

---

#### Q3
```cpp
enum class Status { OK = 0, Error = 1 };
Status s = Status::OK;
if (s == 0) {
    std::cout << "Status is OK\n";
}
// Does this compile? If not, why?
```

**Answer:**
```
Compilation error
```

**Explanation:**
- enum class (scoped enum) doesn't implicitly convert to int
- `s == 0` compares Status with int
- Type mismatch, no implicit conversion
- **Fix:** Explicit cast or compare with enum value
  ```cpp
  if (s == Status::OK)  // Correct
  if (static_cast<int>(s) == 0)  // Also works
  ```
- Old-style enum would compile (implicit conversion)
- enum class provides type safety
- **Key Concept:** enum class prevents implicit conversion; ensures type safety

---

#### Q4
```cpp
std::vector<int> get_vec() { return {1, 2, 3}; }

for (const auto& x : get_vec()) {
    std::cout << x << " ";
}
// Is this safe? What's the behavior?
```

**Answer:**
```
Safe in C++11+; prints 1 2 3
```

**Explanation:**
- get_vec() returns temporary vector
- Range-for extends temporary's lifetime
- Temporary lives for entire loop
- Safe to iterate
- x binds to elements of temporary
- Prints "1 2 3"
- Lifetime extension applies to range-for init
- This is a special C++11 rule
- **Key Concept:** Range-for extends temporary lifetime; safe to iterate temporaries

---

#### Q5
```cpp
enum class Color { Red, Green, Blue };
enum class Size { Small, Medium, Large };

Color c = Color::Red;
Size s = Size::Small;

if (c == s) {
    std::cout << "Equal\n";
}
// Does this compile?
```

**Answer:**
```
Compilation error
```

**Explanation:**
- Different enum class types
- No implicit conversion between enum classes
- Cannot compare Color with Size
- Type safety enforced
- Old-style enums would compile (both convert to int 0)
- **Fix:** Not fixable, comparison is meaningless
- This is intentional type safety
- enum class prevents accidental comparisons
- **Key Concept:** enum class types are distinct; prevents cross-type comparison errors

---

#### Q6
```cpp
int* ptr = nullptr;
if (ptr == NULL) {
    std::cout << "ptr is null\n";
}
// Does this compile and what does it print?
```

**Answer:**
```
Compiles; prints "ptr is null"
```

**Explanation:**
- nullptr converts to any pointer type
- NULL typically defined as 0 or ((void*)0)
- Comparison works (both represent null)
- Prints "ptr is null"
- **Best practice:** Compare with nullptr, not NULL
  ```cpp
  if (ptr == nullptr)  // Modern C++
  ```
- nullptr is type-safe replacement for NULL
- **Key Concept:** nullptr and NULL both represent null, but nullptr is type-safe

---

#### Q7
```cpp
enum class Flags : uint8_t { Read = 1, Write = 2, Execute = 4 };
Flags combined = Flags::Read | Flags::Write;
// Does this compile?
```

**Answer:**
```
Compilation error
```

**Explanation:**
- enum class doesn't support bitwise operations by default
- | operator not defined for enum class
- Returns int, can't assign to Flags without cast
- **Fix:** Overload operators or use explicit casts
  ```cpp
  Flags operator|(Flags a, Flags b) {
      return static_cast<Flags>(
          static_cast<uint8_t>(a) | static_cast<uint8_t>(b));
  }
  ```
- Or define with underlying type operations:
  ```cpp
  auto combined = static_cast<Flags>(
      static_cast<uint8_t>(Flags::Read) | 
      static_cast<uint8_t>(Flags::Write));
  ```
- enum class sacrifices convenience for type safety
- **Key Concept:** enum class requires explicit operator overloads for bitwise operations

---

#### Q8
```cpp
std::map<int, std::string> map{{1, "one"}, {2, "two"}};
for (auto pair : map) {
    pair.second = "modified";
}
// Does map contain "modified" values after the loop?
```

**Answer:**
```
NO - map unchanged
```

**Explanation:**
- `auto pair` creates copy of each pair
- Modifications affect copy only
- Original map unchanged
- **Fix:** Use reference
  ```cpp
  for (auto& pair : map) {  // Reference
      pair.second = "modified";  // Modifies original
  }
  ```
- Remember: map key is const, only value modifiable
- Pattern: auto& for modification, auto for read-only
- **Key Concept:** Range-for auto copies; use auto& to modify container elements

---

#### Q9
```cpp
for (int x : {10, 20, 30, 40, 50}) {
    std::cout << x << " ";
}
// Is this valid C++11 code?
```

**Answer:**
```
YES - Valid; prints 10 20 30 40 50
```

**Explanation:**
- Braced initializer list in range-for
- Creates temporary std::initializer_list<int>
- Iterates over temporary
- Prints "10 20 30 40 50"
- Lifetime extended for loop duration
- C++11 feature
- Convenient for iterating literal values
- **Key Concept:** Range-for works with initializer lists; convenient for literal sequences

---

#### Q10
```cpp
enum class Status : uint8_t { OK = 0, Error = 255 };
int status_code = static_cast<int>(Status::Error);
std::cout << status_code;
// What is printed?
```

**Answer:**
```
255
```

**Explanation:**
- Status::Error has value 255
- static_cast converts to int
- Prints 255
- Underlying type is uint8_t (8-bit unsigned)
- Explicit cast required for enum class
- No implicit conversion
- Cast preserves numerical value
- **Key Concept:** enum class requires explicit cast to underlying type; preserves numerical value

---

#### Q11
```cpp
std::vector<bool> vec{true, false, true};
for (auto& x : vec) {
    x = !x;
}
// What happens? Is there an issue?
```

**Answer:**
```
Works correctly; flips all bools
```

**Explanation:**
- std::vector<bool> specialization returns proxy
- Proxy type: std::vector<bool>::reference
- auto& deduces proxy reference type
- Proxy supports assignment
- Elements correctly flipped: {false, true, false}
- Unlike `auto x` which creates copy
- auto& works correctly with vector<bool>
- **Key Concept:** auto& with vector<bool> deduces proxy reference; allows modification

---

#### Q12
```cpp
void accept(std::nullptr_t) { std::cout << "nullptr_t\n"; }
void accept(int*) { std::cout << "int*\n"; }

accept(nullptr);
accept(NULL);
// What is printed for each call (if they compile)?
```

**Answer:**
```
nullptr_t
int* (or compilation error depending on NULL definition)
```

**Explanation:**
- `accept(nullptr)` calls nullptr_t overload (exact match)
- nullptr has type std::nullptr_t
- `accept(NULL)` typically calls int* overload
- NULL converts to pointer (if defined as 0)
- May be ambiguous if NULL is 0 (prefers nullptr_t)
- Implementation-dependent
- Demonstrates nullptr type safety
- **Key Concept:** nullptr has distinct type std::nullptr_t; preferred over NULL

---

#### Q13
```cpp
enum class Color : int { Red = 1, Green = 2, Blue = 3 };
sizeof(Color);
// What is the size in bytes?
```

**Answer:**
```
4 (typically)
```

**Explanation:**
- Underlying type specified as int
- sizeof(Color) == sizeof(int)
- Typically 4 bytes on most platforms
- Can specify smaller types: uint8_t, uint16_t
- Without explicit type: implementation-defined
- Forward-declarable due to fixed underlying type
- Size independent of enumerator values
- **Key Concept:** enum class size equals underlying type size; explicit type enables forward declaration

---

#### Q14
```cpp
std::vector<std::string> vec{"hello", "world"};
for (auto s : vec) {
    s += " modified";
}
std::cout << vec[0];
// What is printed?
```

**Answer:**
```
hello
```

**Explanation:**
- `auto s` creates copy of each string
- Expensive for strings (full copy)
- Modifications affect copy only
- vec unchanged
- vec[0] still "hello"
- **Better:** Use const auto& for read-only
  ```cpp
  for (const auto& s : vec)  // No copy
  ```
- Or auto& for modification
- Copying strings is expensive
- **Key Concept:** auto copies expensive objects; use const auto& to avoid copies

---

#### Q15
```cpp
int arr[5] = {1, 2, 3, 4, 5};
for (auto& x : arr) {
    x *= 2;
}
std::cout << arr[0];
// What is printed?
```

**Answer:**
```
2
```

**Explanation:**
- Range-for works with arrays
- `auto& x` binds to array elements
- Modifications affect original array
- arr becomes {2, 4, 6, 8, 10}
- Prints 2
- Range-for determines array size automatically
- No decay to pointer
- Safe and convenient
- **Key Concept:** Range-for works with arrays; auto& modifies originals

---

#### Q16
```cpp
void* generic_ptr = nullptr;
char* char_ptr = nullptr;

if (generic_ptr == char_ptr) {
    std::cout << "Equal\n";
}
// Does this compile?
```

**Answer:**
```
YES - Compiles; prints "Equal"
```

**Explanation:**
- Both pointers are nullptr
- Comparison allowed (common type: const void*)
- char* converts to void* for comparison
- Both null, comparison true
- Prints "Equal"
- Different pointer types can compare
- Standard conversion applies
- **Key Concept:** Pointer comparisons convert to common type; nullptr compares equal across types

---

#### Q17
```cpp
enum class Status { Running, Stopped };
switch (Status::Running) {
    case Running:  // Without Status:: qualifier
        std::cout << "Running\n";
        break;
}
// Does this compile?
```

**Answer:**
```
Compilation error
```

**Explanation:**
- enum class requires fully qualified names
- `Running` not in scope
- Must use `Status::Running`
- **Fix:**
  ```cpp
  case Status::Running:  // Correct
  ```
- Old-style enums inject names into enclosing scope
- enum class keeps names scoped
- Prevents name pollution
- **Key Concept:** enum class requires scope qualification; prevents namespace pollution

---

#### Q18
```cpp
std::vector<int> vec{1, 2, 3};
for (const auto& x : vec) {
    vec.push_back(x * 2);
}
// What happens?
```

**Answer:**
```
Undefined behavior (iterator invalidation)
```

**Explanation:**
- Range-for uses iterators
- push_back may reallocate
- Reallocation invalidates iterators
- Loop continues with invalidated iterators
- Undefined behavior: crash or infinite loop
- Never modify container during range-for iteration
- **Fix:** Use index-based loop or collect values first
  ```cpp
  std::vector<int> toAdd;
  for (const auto& x : vec) toAdd.push_back(x * 2);
  vec.insert(vec.end(), toAdd.begin(), toAdd.end());
  ```
- **Key Concept:** Modifying container during range-for invalidates iterators; causes undefined behavior

---

#### Q19
```cpp
enum class Level : uint8_t { Low = 1, Medium = 50, High = 100 };
Level level = static_cast<Level>(75);
// Is this valid? What does level represent?
```

**Answer:**
```
Valid; level has value 75 (not a named enumerator)
```

**Explanation:**
- Cast creates Level with value 75
- 75 not a named enumerator
- Still valid Level value
- Underlying type is uint8_t
- Any value 0-255 valid for uint8_t
- level represents arbitrary Level value
- Not Low, Medium, or High
- This can be problematic in switches
- **Caution:** Undefined enumerator values possible with casts
- **Key Concept:** enum class can hold any underlying type value; casts bypass named enumerators

---

#### Q20
```cpp
std::map<int, int> map{{1, 10}, {2, 20}};
for (auto [key, val] : map) {
    std::cout << key << ":" << val << "\n";
}
// Is this valid C++11 code?
```

**Answer:**
```
NO - Compilation error in C++11
```

**Explanation:**
- Structured bindings introduced in C++17
- `auto [key, val]` is C++17 syntax
- C++11 equivalent:
  ```cpp
  for (const auto& pair : map) {
      std::cout << pair.first << ":" << pair.second << "\n";
  }
  ```
- Must use .first and .second in C++11
- Structured bindings are syntactic sugar
- **Key Concept:** Structured bindings require C++17; C++11 uses pair.first/second

---
