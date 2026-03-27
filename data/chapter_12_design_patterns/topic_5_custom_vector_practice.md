## TOPIC: STL-like Custom Vector Implementation

### PRACTICE_TASKS: Challenge Questions

#### Q1
```cpp
Vector<int> v;
v.reserve(10);
v[5] = 42;
std::cout << v[5];
```

**Answer:**
```
Undefined behavior (most likely crashes or garbage output)
```

**Explanation:**

- **reserve(10) allocates capacity but does NOT construct elements**
  - Allocates raw memory for 10 ints
  - Does NOT call constructors or initialize elements
  - size() remains 0 (no elements exist)
  - capacity() becomes 10 (space available)

- **v[5] accesses out-of-bounds memory:**
  - operator[] implementation: `return data[index];`
  - No bounds checking in operator[]
  - Accessing index 5 when size is 0 → undefined behavior
  - Writing to uninitialized memory

- **Possible outcomes:**
  - Crash with segmentation fault
  - Garbage/random value printed
  - Appears to work but corrupts other data
  - Silent data corruption

- **Why this happens:**
  - reserve() is optimization for preventing reallocations
  - It tells vector "I'll need this much space, allocate ahead"
  - But doesn't create actual elements
  - Elements only exist after push_back, resize, or insert

- **Correct alternatives:**
  ```cpp
  // Option 1: Use resize
  Vector<int> v;
  v.resize(10);      // Creates 10 elements, default-initialized to 0
  v[5] = 42;         // Safe
  std::cout << v[5]; // Prints 42
  
  // Option 2: Use push_back
  Vector<int> v;
  v.reserve(10);     // Optimize capacity
  for (int i = 0; i < 10; ++i) {
      v.push_back(0); // Actually create elements
  }
  v[5] = 42;         // Safe
  
  // Option 3: Use at() for bounds checking
  Vector<int> v;
  v.reserve(10);
  try {
      v.at(5) = 42;  // Throws std::out_of_range
  } catch (const std::out_of_range& e) {
      std::cout << "Out of bounds!";
  }
  ```

- **Implementation detail:**
  ```cpp
  class Vector {
      T* data;
      size_t sz;     // Number of constructed elements
      size_t cap;    // Allocated space
  
  public:
      void reserve(size_t n) {
          if (n <= cap) return;
          T* new_data = static_cast<T*>(::operator new(n * sizeof(T)));
          // Move existing elements
          for (size_t i = 0; i < sz; ++i) {
              new (&new_data[i]) T(std::move(data[i]));
              data[i].~T();
          }
          ::operator delete(data);
          data = new_data;
          cap = n;
          // sz unchanged! No new elements created
      }
      
      T& operator[](size_t i) {
          return data[i];  // NO BOUNDS CHECK!
      }
  };
  ```

- **Real-world example:**
  ```cpp
  // Common mistake in performance-sensitive code
  Vector<Point> points;
  points.reserve(1000);  // Pre-allocate for 1000 points
  
  // BUG: Forgot to actually add points
  for (int i = 0; i < 1000; ++i) {
      points[i] = Point(i, i);  // UNDEFINED BEHAVIOR!
  }
  
  // CORRECT:
  Vector<Point> points;
  points.reserve(1000);
  for (int i = 0; i < 1000; ++i) {
      points.push_back(Point(i, i));  // Actually creates elements
  }
  ```

- **Key Concept:** **reserve() allocates capacity; resize() creates elements**
  - reserve: Allocates memory, size unchanged
  - resize: Creates/destroys elements, adjusts size
  - Use reserve when you know how many elements you'll add (optimization)
  - Use resize when you want elements to exist immediately

---


---

#### Q2
```cpp
Vector<int> v = {1, 2, 3};
v.reserve(5);
auto it = v.begin();
v.push_back(4);
v.push_back(5);
std::cout << *it;
```

**Answer:**
```
Safe, prints 1
```

**Explanation:**

- **Initial state:**
  - v = {1, 2, 3}
  - size = 3, capacity = 3 (implementation-dependent, could be larger)

- **v.reserve(5) ensures capacity ≥ 5:**
  - If capacity < 5, reallocates to capacity 5
  - Moves existing elements {1, 2, 3} to new memory
  - If capacity already ≥ 5, does nothing

- **auto it = v.begin() gets iterator to first element:**
  - After reserve(5), capacity is guaranteed ≥ 5
  - Iterator points to element at index 0 (value 1)

- **v.push_back(4) and v.push_back(5) add elements:**
  - Current size: 3, capacity: 5
  - push_back(4): size becomes 4, no reallocation (4 ≤ 5)
  - push_back(5): size becomes 5, no reallocation (5 ≤ 5)
  - **No reallocation = iterators remain valid**

- **Iterator invalidation rules:**
  - Iterators invalidated if reallocation occurs
  - Reallocation occurs if new size > capacity
  - Here: 5 ≤ 5, so no reallocation
  - Iterator 'it' still valid, points to value 1

- **Why reserve() matters:**
  ```cpp
  // WITHOUT reserve:
  Vector<int> v = {1, 2, 3};  // capacity = 3
  auto it = v.begin();
  v.push_back(4);  // capacity 3→6, REALLOCATION!
  std::cout << *it; // UNDEFINED BEHAVIOR! Iterator invalidated
  
  // WITH reserve:
  Vector<int> v = {1, 2, 3};
  v.reserve(5);    // capacity = 5
  auto it = v.begin();
  v.push_back(4);  // No reallocation (4 ≤ 5)
  v.push_back(5);  // No reallocation (5 ≤ 5)
  std::cout << *it; // Safe, prints 1
  ```

- **reserve() implementation detail:**
  ```cpp
  void reserve(size_t new_cap) {
      if (new_cap <= cap) return;  // Already have enough
      
      // Allocate new memory
      T* new_data = static_cast<T*>(::operator new(new_cap * sizeof(T)));
      
      // Move elements
      for (size_t i = 0; i < sz; ++i) {
          new (&new_data[i]) T(std::move(data[i]));
          data[i].~T();
      }
      
      // Free old memory
      ::operator delete(data);
      
      // Update pointers
      data = new_data;
      cap = new_cap;
      
      // All old iterators now invalid!
  }
  ```

- **Common patterns:**
  ```cpp
  // Pattern 1: Reserve before loop
  Vector<int> v;
  v.reserve(1000);  // Avoid 10 reallocations
  for (int i = 0; i < 1000; ++i) {
      v.push_back(i);  // No reallocations
  }
  
  // Pattern 2: Reserve + keep iterators
  Vector<string> names = {"Alice", "Bob"};
  names.reserve(10);  // Ensure space for 8 more
  auto it = names.begin();  // Safe to keep
  for (int i = 0; i < 8; ++i) {
      names.push_back("Person" + to_string(i));
  }
  cout << *it;  // Safe, prints "Alice"
  ```

- **Performance comparison:**
  ```cpp
  // WITHOUT reserve: O(log n) reallocations
  Vector<int> v;
  for (int i = 0; i < 1000; ++i) {
      v.push_back(i);  // Reallocates at 1, 2, 4, 8, 16, 32, ...
  }
  // ~10 reallocations (capacity doubles)
  
  // WITH reserve: 0 reallocations
  Vector<int> v;
  v.reserve(1000);
  for (int i = 0; i < 1000; ++i) {
      v.push_back(i);  // Never reallocates
  }
  ```

- **Key Concept:** **reserve() prevents reallocation, keeping iterators valid**
  - reserve(n) guarantees no reallocation until size > n
  - Use reserve() when you know final size to optimize performance
  - Keeps iterators, pointers, references valid during subsequent insertions

---


---

#### Q3
```cpp
Vector<int> v;
for (int i = 0; i < 8; ++i) {
    v.push_back(i);
}
std::cout << v.capacity();
```

**Answer:**
```
8 (assuming doubling strategy)
```

**Explanation:**

- **Capacity doubling strategy:**
  - Most vector implementations double capacity when full
  - Amortized O(1) push_back performance
  - Trade-off: memory overhead vs speed

- **Step-by-step capacity growth:**
  ```
  Initial: size=0, capacity=0
  
  i=0: push_back(0)
       - capacity=0, need space → allocate capacity=1
       - size=1, capacity=1
  
  i=1: push_back(1)
       - size=1, capacity=1 (full) → reallocate to capacity=2
       - size=2, capacity=2
  
  i=2: push_back(2)
       - size=2, capacity=2 (full) → reallocate to capacity=4
       - size=3, capacity=4
  
  i=3: push_back(3)
       - size=3, capacity=4 (not full)
       - size=4, capacity=4
  
  i=4: push_back(4)
       - size=4, capacity=4 (full) → reallocate to capacity=8
       - size=5, capacity=8
  
  i=5,6,7: push_back(5,6,7)
       - Fits in capacity=8
       - Final: size=8, capacity=8
  ```

- **Number of reallocations:**
  - For 8 elements: 4 reallocations (at i=0,1,2,4)
  - For n elements: log₂(n) reallocations
  - Each reallocation copies all existing elements

- **Implementation of push_back:**
  ```cpp
  void push_back(const T& value) {
      if (sz == cap) {
          // Need to grow
          size_t new_cap = (cap == 0) ? 1 : cap * 2;
          reserve(new_cap);
      }
      
      // Construct element in place
      new (&data[sz]) T(value);
      ++sz;
  }
  ```

- **Why doubling strategy?**
  ```cpp
  // Doubling: O(1) amortized
  // Capacities: 1, 2, 4, 8, 16, 32, ...
  // Total copies for n elements: n-1 (geometric series)
  // Average: (n-1)/n ≈ 1 copy per element → O(1) amortized
  
  // Linear growth (+1 each time): O(n) amortized
  // Capacities: 1, 2, 3, 4, 5, 6, ...
  // Total copies: 0+1+2+3+...+(n-1) = n(n-1)/2
  // Average: n/2 copies per element → O(n) amortized
  ```

- **Alternative growth strategies:**
  ```cpp
  // Strategy 1: Exact doubling (most common)
  new_cap = cap * 2;
  
  // Strategy 2: Factor of 1.5 (GCC)
  new_cap = cap + cap / 2;
  // Better memory reuse (old block may fit future allocation)
  
  // Strategy 3: Add fixed amount (bad!)
  new_cap = cap + 10;
  // O(n) amortized time!
  ```

- **Real-world example:**
  ```cpp
  // Inefficient: many reallocations
  Vector<int> v;
  for (int i = 0; i < 1000000; ++i) {
      v.push_back(i);  // ~20 reallocations
  }
  
  // Efficient: one allocation
  Vector<int> v;
  v.reserve(1000000);  // Pre-allocate
  for (int i = 0; i < 1000000; ++i) {
      v.push_back(i);  // No reallocations
  }
  ```

- **Memory overhead analysis:**
  ```
  For n=8 elements:
  - With doubling: capacity=8, overhead=0 bytes (lucky case)
  - For n=9: capacity=16, overhead=7 ints = 28 bytes
  
  Average case:
  - Memory overhead: 0% to 100% (average ~50%)
  - Time complexity: O(1) amortized
  
  Trade-off:
  - More aggressive growth (2x) → less time, more memory
  - Conservative growth (1.5x) → more time, less memory
  ```

- **Key Concept:** **Capacity doubling provides O(1) amortized push_back**
  - Doubling strategy: 1→2→4→8→16→32→...
  - For n elements: log₂(n) reallocations
  - Amortized cost: O(1) per push_back
  - Memory overhead: up to 100% (average 50%)

---


---

#### Q4
```cpp
Vector<int> v1 = {1, 2, 3};
Vector<int> v2 = v1;
v2[0] = 99;
std::cout << v1[0];
```

**Answer:**
```
1 (unaffected by v2 modification)
```

**Explanation:**

- **Deep copy semantics:**
  - Copy constructor creates independent copy
  - v2 gets its own memory allocation
  - v1 and v2 have separate data arrays
  - Modifying one doesn't affect the other

- **Copy constructor implementation:**
  ```cpp
  Vector(const Vector& other) 
      : sz(other.sz), cap(other.cap) {
      
      // Allocate new memory
      data = static_cast<T*>(::operator new(cap * sizeof(T)));
      
      // Copy construct each element
      for (size_t i = 0; i < sz; ++i) {
          new (&data[i]) T(other.data[i]);
      }
  }
  ```

- **Memory layout after copy:**
  ```
  v1:  [data ptr] → [1, 2, 3] (memory block A)
       sz=3, cap=3
  
  v2:  [data ptr] → [1, 2, 3] (memory block B, independent copy)
       sz=3, cap=3
  
  After v2[0] = 99:
  v1:  [data ptr] → [1, 2, 3] (unchanged)
  v2:  [data ptr] → [99, 2, 3] (only v2 modified)
  ```

- **Shallow vs deep copy:**
  ```cpp
  // WRONG: Shallow copy (what NOT to do)
  Vector(const Vector& other) 
      : data(other.data), sz(other.sz), cap(other.cap) {
      // Both vectors share same data pointer!
  }
  // Problem: v1 and v2 point to same memory
  // Modifying v2[0] also modifies v1[0]
  // Destructor deletes same memory twice → crash!
  
  // CORRECT: Deep copy
  Vector(const Vector& other) 
      : sz(other.sz), cap(other.cap) {
      data = static_cast<T*>(::operator new(cap * sizeof(T)));
      for (size_t i = 0; i < sz; ++i) {
          new (&data[i]) T(other.data[i]);
      }
  }
  ```

- **Copy assignment operator also needed:**
  ```cpp
  Vector& operator=(const Vector& other) {
      if (this == &other) return *this;  // Self-assignment check
      
      // Destroy existing elements
      for (size_t i = 0; i < sz; ++i) {
          data[i].~T();
      }
      ::operator delete(data);
      
      // Copy from other
      sz = other.sz;
      cap = other.cap;
      data = static_cast<T*>(::operator new(cap * sizeof(T)));
      for (size_t i = 0; i < sz; ++i) {
          new (&data[i]) T(other.data[i]);
      }
      
      return *this;
  }
  ```

- **Rule of Three/Five:**
  ```cpp
  class Vector {
  public:
      // Rule of Five: Need all or none
      
      // 1. Destructor
      ~Vector() {
          for (size_t i = 0; i < sz; ++i) {
              data[i].~T();
          }
          ::operator delete(data);
      }
      
      // 2. Copy constructor
      Vector(const Vector& other);
      
      // 3. Copy assignment
      Vector& operator=(const Vector& other);
      
      // 4. Move constructor
      Vector(Vector&& other) noexcept;
      
      // 5. Move assignment
      Vector& operator=(Vector&& other) noexcept;
  };
  ```

- **Performance consideration:**
  ```cpp
  // Expensive: O(n) copy
  Vector<int> v1(1000000);  // 1M elements
  Vector<int> v2 = v1;      // Copies all 1M elements
  
  // Cheap: O(1) move (covered in Q5)
  Vector<int> v2 = std::move(v1);  // Just swap pointers
  ```

- **Real-world example:**
  ```cpp
  void processVector(Vector<int> v) {  // Pass by value
      v[0] = 999;  // Modify local copy
      // Changes don't affect caller's vector
  }
  
  Vector<int> original = {1, 2, 3};
  processVector(original);  // Deep copy created
  cout << original[0];      // Prints 1 (unchanged)
  ```

- **Key Concept:** **Copy constructor creates deep copy; vectors are independent**
  - Deep copy: Separate memory allocations
  - Modifying copy doesn't affect original
  - Expensive: O(n) time and space
  - Use move semantics when possible (see Q5)

---


---

#### Q5
```cpp
Vector<int> v1 = {1, 2, 3};
Vector<int> v2 = std::move(v1);
std::cout << v1.size();
```

**Answer:**
```
0 (safe to access size)
```

**Explanation:**

- **Move semantics:**
  - Transfers ownership of resources
  - v2 "steals" v1's data pointer
  - v1 left in valid moved-from state
  - O(1) operation (just pointer swap)

- **Move constructor implementation:**
  ```cpp
  Vector(Vector&& other) noexcept 
      : data(other.data), sz(other.sz), cap(other.cap) {
      
      // Steal resources from other
      // Leave other in valid state
      other.data = nullptr;
      other.sz = 0;
      other.cap = 0;
  }
  ```

- **Memory transfer:**
  ```
  Before move:
  v1:  [data ptr] → [1, 2, 3]
       sz=3, cap=3
  v2:  [uninitialized]
  
  After std::move(v1):
  v1:  [data=nullptr]
       sz=0, cap=0  (valid moved-from state)
  v2:  [data ptr] → [1, 2, 3]
       sz=3, cap=3  (owns the memory now)
  ```

- **Moved-from state guarantees:**
  - Valid but unspecified state
  - Safe operations: destructor, assignment, size(), empty()
  - Unsafe operations: accessing elements (size=0)
  - Can be reused: `v1 = {4, 5, 6};`

- **Why v1.size() is safe:**
  ```cpp
  size_t size() const { return sz; }
  
  // After move:
  // v1.sz = 0 (explicit in move constructor)
  // Calling size() just returns 0
  // No pointer dereference, no UB
  ```

- **Unsafe operations on moved-from object:**
  ```cpp
  Vector<int> v1 = {1, 2, 3};
  Vector<int> v2 = std::move(v1);
  
  // SAFE:
  cout << v1.size();    // 0
  cout << v1.empty();   // true
  v1 = {4, 5};          // Reuse
  v1.~Vector();         // Destructor (automatic)
  
  // UNSAFE:
  cout << v1[0];        // UB! size=0, accessing element
  v1.push_back(10);     // Unspecified behavior
  auto it = v1.begin(); // Iterator to empty range
  ```

- **Move assignment operator:**
  ```cpp
  Vector& operator=(Vector&& other) noexcept {
      if (this == &other) return *this;
      
      // Destroy existing resources
      for (size_t i = 0; i < sz; ++i) {
          data[i].~T();
      }
      ::operator delete(data);
      
      // Steal from other
      data = other.data;
      sz = other.sz;
      cap = other.cap;
      
      // Leave other valid
      other.data = nullptr;
      other.sz = 0;
      other.cap = 0;
      
      return *this;
  }
  ```

- **Performance comparison:**
  ```cpp
  // Deep copy: O(n) time, O(n) space
  Vector<int> v1(1000000);
  Vector<int> v2 = v1;  // Copies all 1M elements
  
  // Move: O(1) time, O(1) space
  Vector<int> v1(1000000);
  Vector<int> v2 = std::move(v1);  // Just swaps pointers
  ```

- **Common use cases:**
  ```cpp
  // 1. Return from function (automatic move)
  Vector<int> createVector() {
      Vector<int> v = {1, 2, 3};
      return v;  // RVO or move (not copy!)
  }
  
  // 2. Transfer ownership
  Vector<int> v1 = {1, 2, 3};
  Vector<int> v2 = std::move(v1);  // v1 no longer owns data
  
  // 3. std::swap (uses move)
  std::swap(v1, v2);  // Three moves (fast!)
  
  // 4. Vector of vectors
  Vector<Vector<int>> vecs;
  Vector<int> temp = {1, 2, 3};
  vecs.push_back(std::move(temp));  // Move, not copy
  ```

- **Why noexcept matters:**
  ```cpp
  Vector(Vector&& other) noexcept {
      // noexcept guarantees no exceptions
      // Allows safe use in containers
      // std::vector can use move in reallocation
  }
  
  // If NOT noexcept:
  // std::vector<Vector<int>> uses copy (slow!)
  // to maintain strong exception guarantee
  ```

- **Key Concept:** **Move transfers ownership; moved-from object left in valid state**
  - Move: O(1) pointer swap
  - Moved-from: size()=0, data=nullptr (safe)
  - Can call: size(), empty(), destructor, assignment
  - Cannot access elements (size=0)
  - Reusable after assignment

---


---

#### Q6
```cpp
Vector<int> v;
v.resize(5);
std::cout << v[3];
```

**Answer:**
```
0 (default-constructed value for int)
```

**Explanation:**

- **resize(5) creates 5 elements:**
  - Allocates memory for at least 5 ints
  - Calls default constructor for each element
  - For int: default constructor initializes to 0
  - size() becomes 5

- **resize() implementation:**
  ```cpp
  void resize(size_t new_size) {
      if (new_size < sz) {
          // Shrink: destroy extra elements
          for (size_t i = new_size; i < sz; ++i) {
              data[i].~T();
          }
          sz = new_size;
      } else if (new_size > sz) {
          // Grow: ensure capacity, construct new elements
          if (new_size > cap) {
              reserve(new_size);
          }
          for (size_t i = sz; i < new_size; ++i) {
              new (&data[i]) T();  // Default construct
          }
          sz = new_size;
      }
      // If new_size == sz, do nothing
  }
  ```

- **Default construction for primitive types:**
  ```cpp
  // For int:
  int x;           // Uninitialized (garbage)
  int y = int();   // Value-initialized to 0
  int z{};         // Value-initialized to 0
  
  // resize uses value-initialization:
  new (&data[i]) T();  // For int, this is 0
  ```

- **Different types have different defaults:**
  ```cpp
  // Primitive types: zero-initialized
  Vector<int> v;
  v.resize(5);       // {0, 0, 0, 0, 0}
  
  Vector<double> v2;
  v2.resize(3);      // {0.0, 0.0, 0.0}
  
  // Class types: default constructor called
  struct Point {
      int x = 10, y = 20;  // Member initializers
  };
  Vector<Point> v3;
  v3.resize(2);      // {Point{10,20}, Point{10,20}}
  
  // Classes without default constructor: compilation error
  struct NoDefault {
      NoDefault(int) {}  // No default constructor
  };
  Vector<NoDefault> v4;
  v4.resize(1);      // Compilation error!
  ```

- **resize with custom value:**
  ```cpp
  void resize(size_t new_size, const T& value) {
      if (new_size > sz) {
          if (new_size > cap) {
              reserve(new_size);
          }
          for (size_t i = sz; i < new_size; ++i) {
              new (&data[i]) T(value);  // Copy construct from value
          }
          sz = new_size;
      } else {
          // Shrink logic same as before
      }
  }
  
  // Usage:
  Vector<int> v;
  v.resize(5, 42);  // {42, 42, 42, 42, 42}
  ```

- **resize vs reserve:**
  ```cpp
  // reserve: Allocates capacity, size unchanged
  Vector<int> v;
  v.reserve(10);
  cout << v.size();     // 0 (no elements)
  cout << v.capacity(); // 10 (space for 10)
  cout << v[5];         // UB! (no elements exist)
  
  // resize: Creates elements, adjusts size
  Vector<int> v2;
  v2.resize(10);
  cout << v2.size();     // 10 (10 elements)
  cout << v2.capacity(); // ≥10 (at least 10)
  cout << v2[5];         // 0 (element exists, default value)
  ```

- **Shrinking with resize:**
  ```cpp
  Vector<int> v = {1, 2, 3, 4, 5};
  cout << v.size();  // 5
  
  v.resize(3);
  cout << v.size();  // 3
  cout << v[2];      // 3 (element still exists)
  cout << v[3];      // UB! (element destroyed)
  
  // Elements 3 and 4 destroyed, but capacity unchanged
  cout << v.capacity();  // Still ≥5
  ```

- **Performance consideration:**
  ```cpp
  // Inefficient: default construct then assign
  Vector<int> v;
  v.resize(1000000);      // Create 1M zeros
  for (int i = 0; i < 1000000; ++i) {
      v[i] = i;           // Assign over zeros
  }
  
  // More efficient: reserve + push_back
  Vector<int> v2;
  v2.reserve(1000000);    // Allocate space
  for (int i = 0; i < 1000000; ++i) {
      v2.push_back(i);    // Construct directly with value
  }
  ```

- **Key Concept:** **resize() creates elements with default values**
  - Creates/destroys elements to match new size
  - New elements default-constructed (int→0, custom types→default constructor)
  - Use resize(n, value) to specify custom default
  - Different from reserve() which only allocates space

---


---

#### Q7
```cpp
Vector<int> v = {1, 2, 3};
v.resize(10);
std::cout << v.size() << ", " << v.capacity();
```

**Answer:**
```
10, ≥10 (capacity at least 10, possibly more)
```

**Explanation:**

- **resize(10) grows from 3 to 10 elements:**
  - Current: size=3, capacity=3 (or more)
  - After: size=10, capacity≥10

- **Step-by-step execution:**
  ```cpp
  // Initial: v = {1, 2, 3}
  // size=3, capacity=3 (assuming tight fit)
  
  v.resize(10);
  // 1. Check: new_size (10) > sz (3) → need to grow
  // 2. Check: new_size (10) > cap (3) → need reallocation
  // 3. reserve(10) → allocates capacity for 10 elements
  // 4. Construct 7 new elements (indices 3-9) with default values (0)
  // 5. sz = 10
  
  // Result: v = {1, 2, 3, 0, 0, 0, 0, 0, 0, 0}
  // size=10, capacity≥10
  ```

- **Why "≥10" not "=10"?**
  ```cpp
  void resize(size_t new_size) {
      if (new_size > sz) {
          if (new_size > cap) {
              reserve(new_size);  // Calls reserve
          }
          // ... construct new elements
      }
  }
  
  void reserve(size_t new_cap) {
      if (new_cap <= cap) return;
      
      // Implementation choice:
      // Option 1: Allocate exactly new_cap
      size_t actual_cap = new_cap;
      
      // Option 2: Allocate more for future growth
      size_t actual_cap = std::max(new_cap, cap * 2);
      
      // Most implementations use Option 1 for reserve/resize
      // But capacity could be larger due to allocator
  }
  ```

- **Capacity implementation strategies:**
  ```cpp
  // Strategy 1: Exact allocation (most common for resize)
  v.resize(10);
  // capacity = 10 (exactly)
  
  // Strategy 2: Geometric growth (common for push_back)
  v.push_back(x);  // capacity: 0→1→2→4→8→16→...
  
  // Strategy 3: Hybrid (some implementations)
  if (new_size from resize) {
      cap = new_size;  // Exact
  } else if (new_size from push_back) {
      cap = old_cap * 2;  // Doubling
  }
  ```

- **Actual memory allocated could be more:**
  ```cpp
  Vector<int> v = {1, 2, 3};
  v.resize(10);
  
  // Allocator might round up for alignment
  // Example: Allocate 12 or 16 ints for cache alignment
  
  cout << v.size();      // Guaranteed: 10
  cout << v.capacity();  // Could be: 10, 12, 16, etc.
  ```

- **resize multiple times:**
  ```cpp
  Vector<int> v = {1, 2, 3};
  
  v.resize(10);
  // size=10, capacity≥10
  
  v.resize(5);
  // size=5 (elements 5-9 destroyed)
  // capacity unchanged (still ≥10)
  
  v.resize(15);
  // size=15, capacity≥15 (might reallocate)
  ```

- **Capacity after shrink:**
  ```cpp
  Vector<int> v;
  v.resize(1000);
  // size=1000, capacity≥1000
  
  v.resize(10);
  // size=10, capacity still ≥1000 (no deallocation)
  
  // To actually free memory:
  v.shrink_to_fit();
  // size=10, capacity≈10 (implementation may still leave slack)
  
  // Or swap trick:
  Vector<int>(v).swap(v);  // Create tight copy and swap
  ```

- **Performance implications:**
  ```cpp
  // Efficient: One allocation
  Vector<int> v;
  v.resize(1000);  // Allocate once, construct 1000 elements
  
  // Less efficient: Multiple allocations
  Vector<int> v2;
  for (int i = 0; i < 1000; ++i) {
      v2.push_back(0);  // Multiple reallocations (log n)
  }
  
  // Best: reserve + push_back (avoids default construction)
  Vector<int> v3;
  v3.reserve(1000);  // Allocate once
  for (int i = 0; i < 1000; ++i) {
      v3.push_back(i);  // No reallocation, construct with value
  }
  ```

- **Comparison table:**
  ```
  Operation          | size | capacity | Elements
  -------------------|------|----------|----------
  Vector<int> v;     | 0    | 0        | none
  v.reserve(10);     | 0    | 10       | none
  v.resize(10);      | 10   | ≥10      | {0,0,...}
  v.resize(5);       | 5    | ≥10      | {0,0,0,0,0}
  v.shrink_to_fit(); | 5    | ≈5       | {0,0,0,0,0}
  ```

- **Key Concept:** **resize() sets exact size; capacity at least that size**
  - size() = exactly new_size
  - capacity() ≥ new_size (possibly more)
  - Doesn't reduce capacity when shrinking
  - Use shrink_to_fit() to reclaim memory

---


---

#### Q8
```cpp
Vector<int> v = {1, 2, 3, 4};
v.pop_back();
v.pop_back();
std::cout << v.capacity();
```

**Answer:**
```
4 (unchanged - capacity not reduced)
```

**Explanation:**

- **pop_back() only reduces size, not capacity:**
  - Destroys the last element
  - Decrements size counter
  - Does NOT deallocate memory
  - Capacity remains at original value

- **Step-by-step execution:**
  ```cpp
  Vector<int> v = {1, 2, 3, 4};
  // size=4, capacity=4
  
  v.pop_back();  // Removes 4
  // Destroys element at index 3
  // size=3, capacity=4 (unchanged!)
  
  v.pop_back();  // Removes 3
  // Destroys element at index 2
  // size=2, capacity=4 (still unchanged!)
  
  std::cout << v.capacity();  // Prints 4
  ```

- **pop_back() implementation:**
  ```cpp
  void pop_back() {
      if (sz == 0) return;  // Or throw/assert
      
      --sz;                  // Decrement size
      data[sz].~T();         // Destroy element
      // Capacity unchanged!
  }
  ```

- **Why capacity doesn't shrink:**
  - Performance optimization: Avoid frequent reallocations
  - Common pattern: shrink temporarily, grow back later
  - Memory reuse without deallocation/allocation cost
  - Example: Clearing vector for reuse in loop

- **Memory layout:**
  ```
  After v = {1, 2, 3, 4}:
  data → [1][2][3][4] (capacity 4, size 4)
  
  After first pop_back():
  data → [1][2][3][~] (capacity 4, size 3)
         destroyed ─┘
  
  After second pop_back():
  data → [1][2][~][~] (capacity 4, size 2)
         both destroyed ─┘
  ```

- **To actually free memory:**
  ```cpp
  Vector<int> v = {1, 2, 3, 4};
  v.pop_back();
  v.pop_back();
  
  // Option 1: shrink_to_fit()
  v.shrink_to_fit();
  // Reallocates to capacity=2 (matching size)
  
  // Option 2: Swap trick
  Vector<int>(v).swap(v);
  // Creates tight copy, swaps, old memory freed
  
  // Option 3: Clear and shrink
  v.clear();
  v.shrink_to_fit();
  // Size=0, capacity≈0
  ```

- **Common use cases:**
  ```cpp
  // Pattern 1: Temporary buffer reuse
  Vector<int> buffer;
  for (int iteration = 0; iteration < 1000; ++iteration) {
      buffer.clear();  // Size=0, capacity unchanged
      // Fill buffer...
      for (int i = 0; i < 100; ++i) {
          buffer.push_back(i);  // No reallocations!
      }
      // Process buffer...
  }
  
  // Pattern 2: Stack-like operations
  Vector<int> stack;
  stack.push_back(1);
  stack.push_back(2);
  stack.push_back(3);
  int top = stack.back();
  stack.pop_back();  // Remove top, capacity unchanged
  stack.push_back(4);  // Reuse capacity
  ```

- **Performance comparison:**
  ```cpp
  // WITHOUT capacity preservation (hypothetical bad design):
  v.pop_back();  // Would deallocate/reallocate
  // → Expensive for repeated push/pop
  
  // WITH capacity preservation (actual design):
  v.pop_back();  // Just destroys element
  v.push_back(x);  // Reuses existing capacity
  // → O(1) operations
  ```

- **Key Concept:** **pop_back() reduces size but preserves capacity**
  - Destroys element, decrements size
  - Capacity unchanged (optimization)
  - Use shrink_to_fit() to reclaim memory
  - Common pattern: temporary size reduction with later growth

---


---

#### Q9
```cpp
Vector<int> v;
v.reserve(100);
v.resize(50);
std::cout << v.size() << ", " << v.capacity();
```

**Answer:**
```
50, 100
```

**Explanation:**

- **reserve(100) sets capacity to at least 100:**
  - Allocates memory for 100 ints
  - size remains 0 (no elements constructed)
  - capacity becomes 100

- **resize(50) creates 50 elements:**
  - Constructs 50 ints (default-initialized to 0)
  - size becomes 50
  - capacity remains 100 (already allocated)

- **Step-by-step execution:**
  ```cpp
  Vector<int> v;
  // size=0, capacity=0
  
  v.reserve(100);
  // Allocates space for 100 ints
  // size=0 (no elements yet)
  // capacity=100
  
  v.resize(50);
  // Constructs 50 elements (indices 0-49) with value 0
  // size=50
  // capacity=100 (no reallocation, 50 < 100)
  
  std::cout << v.size() << ", " << v.capacity();
  // Prints: 50, 100
  ```

- **Why capacity doesn't change to 50:**
  ```cpp
  void resize(size_t new_size) {
      if (new_size > sz) {
          if (new_size > cap) {
              reserve(new_size);  // Only if new_size > capacity
          }
          // Construct new elements...
      }
  }
  
  // Here: new_size=50, cap=100
  // 50 ≤ 100, so NO reallocation
  // Just constructs elements in existing space
  ```

- **Memory layout:**
  ```
  After reserve(100):
  data → [________...________] (100 slots, all uninitialized)
         sz=0, cap=100
  
  After resize(50):
  data → [0,0,0,...,0][_____...] (50 initialized, 50 unused)
         └─ 50 elements ─┘└─ 50 unused slots ─┘
         sz=50, cap=100
  ```

- **Common patterns:**
  ```cpp
  // Pattern 1: Pre-reserve known capacity, construct subset
  Vector<int> v;
  v.reserve(1000);    // Reserve for worst case
  v.resize(100);      // Actually use 100
  // size=100, capacity=1000
  // Efficient: Only one allocation
  
  // Pattern 2: Reserve, then grow incrementally
  Vector<int> v;
  v.reserve(1000);
  for (int i = 0; i < 500; ++i) {
      v.push_back(i);  // No reallocations
  }
  // size=500, capacity=1000
  
  // Pattern 3: Over-allocate, then shrink
  Vector<int> v;
  v.reserve(1000);
  v.resize(100);
  // ... use the vector
  v.shrink_to_fit();  // Reclaim unused 900 slots
  // size=100, capacity≈100
  ```

- **reserve() vs resize() clarification:**
  ```cpp
  // reserve: Allocates capacity, NO construction
  Vector<int> v1;
  v1.reserve(100);
  // size=0, capacity=100
  // v1[0] is UB! (no elements)
  
  // resize: Constructs elements
  Vector<int> v2;
  v2.resize(100);
  // size=100, capacity≥100
  // v2[0] = 0 (element exists)
  
  // reserve + resize: Combine both
  Vector<int> v3;
  v3.reserve(200);   // Allocate space
  v3.resize(100);    // Construct 100 elements
  // size=100, capacity=200
  // v3[0] = 0 (exists), v3[150] is UB (not constructed)
  ```

- **Use case: Database result set:**
  ```cpp
  // Query returns max 10000 rows, but usually ~100
  Vector<Row> results;
  results.reserve(10000);  // Pre-allocate worst case
  
  // Fetch actual rows (suppose 150 returned)
  while (db.hasMore()) {
      results.push_back(db.next());
  }
  // size=150, capacity=10000 (no reallocations during fetch!)
  
  // Optionally shrink after fetching
  results.shrink_to_fit();
  // size=150, capacity≈150
  ```

- **Key Concept:** **reserve() sets capacity; resize() sets size within existing capacity**
  - reserve(n) allocates space for n elements
  - resize(m) with m < n uses existing space, no reallocation
  - Capacity never shrinks unless explicitly requested
  - Useful pattern: reserve large, resize smaller

---


---

#### Q10
```cpp
Vector<std::string> v;
v.push_back("hello");
v.push_back("world");
v.clear();
std::cout << v.capacity();
```

**Answer:**
```
≥2 (capacity unchanged by clear)
```

**Explanation:**

- **clear() destroys all elements but doesn't free memory:**
  - Calls destructor for each element
  - Sets size to 0
  - Capacity remains unchanged
  - Memory still allocated

- **Step-by-step execution:**
  ```cpp
  Vector<std::string> v;
  // size=0, capacity=0
  
  v.push_back("hello");
  // size=1, capacity=1 (or more, implementation-dependent)
  
  v.push_back("world");
  // size=2, capacity≥2 (possibly doubled to 2 or 4)
  
  v.clear();
  // Destroys "hello" and "world" strings
  // size=0
  // capacity unchanged (still ≥2)
  
  std::cout << v.capacity();
  // Prints ≥2 (exact value depends on growth strategy)
  ```

- **clear() implementation:**
  ```cpp
  void clear() {
      // Destroy all elements
      for (size_t i = 0; i < sz; ++i) {
          data[i].~T();
      }
      sz = 0;  // Size becomes 0
      // Capacity unchanged!
  }
  ```

- **Why capacity isn't freed:**
  - Performance: Common pattern is clear + refill
  - Avoid deallocation/reallocation overhead
  - Memory reuse for future insertions
  - User can explicitly request shrinking

- **Memory layout for std::string:**
  ```
  After push_back("hello"), push_back("world"):
  v.data → [string("hello")][string("world")]
           Each string owns its char array on heap
           size=2, capacity≥2
  
  After clear():
  v.data → [destroyed][destroyed]
           String destructors called (char arrays freed)
           But vector's data array still allocated!
           size=0, capacity≥2 (vector's allocation unchanged)
  ```

- **clear() vs destructor:**
  ```cpp
  // clear(): Destroys elements, keeps capacity
  v.clear();
  // size=0, capacity unchanged
  // Can reuse: v.push_back(...) without reallocation
  
  // Destructor: Destroys elements AND frees memory
  {
      Vector<string> v;
      v.push_back("hello");
  }  // v goes out of scope
  // Destructor called: elements destroyed, memory freed
  ```

- **Common patterns:**
  ```cpp
  // Pattern 1: Reusable buffer
  Vector<string> buffer;
  for (int round = 0; round < 1000; ++round) {
      buffer.clear();  // Size=0, capacity preserved
      
      // Refill buffer
      buffer.push_back("data1");
      buffer.push_back("data2");
      // No reallocations! Reuses existing capacity
      
      // Process buffer...
  }
  
  // Pattern 2: Conditional clearing
  if (needReset) {
      v.clear();  // Quick reset, preserves capacity
  }
  
  // Pattern 3: Clear + shrink (explicit memory release)
  v.clear();
  v.shrink_to_fit();  // Now capacity≈0, memory freed
  ```

- **To actually free memory:**
  ```cpp
  Vector<string> v;
  v.push_back("hello");
  v.push_back("world");
  
  // Option 1: clear + shrink_to_fit
  v.clear();          // size=0, capacity unchanged
  v.shrink_to_fit();  // capacity→0, memory freed
  
  // Option 2: Swap trick
  v.clear();
  Vector<string>().swap(v);  // Empty vector swapped in
  
  // Option 3: Assign empty vector
  v = Vector<string>();  // Creates empty, swaps, old freed
  ```

- **Performance consideration:**
  ```cpp
  // Efficient: Reuse capacity
  Vector<int> v;
  for (int iteration = 0; iteration < 10000; ++iteration) {
      v.clear();  // O(n) to destroy elements
      for (int i = 0; i < 100; ++i) {
          v.push_back(i);  // O(1) amortized, reuses capacity
      }
  }
  // Total: 10000 clears + 1M insertions, ~0 reallocations
  
  // Inefficient: Recreate each time
  for (int iteration = 0; iteration < 10000; ++iteration) {
      Vector<int> v;  // Allocate fresh each time
      for (int i = 0; i < 100; ++i) {
          v.push_back(i);  // Multiple reallocations
      }
  }  // Deallocate
  // Total: 10000 allocations + deallocations + reallocations
  ```

- **Key Concept:** **clear() resets size to 0 but preserves capacity**
  - Destroys all elements (calls destructors)
  - Sets size to 0
  - Capacity unchanged (optimization for reuse)
  - Use shrink_to_fit() to reclaim memory

---


---

#### Q11
```cpp
Vector<int> v = {1, 2, 3};
Vector<int>& ref = v;
ref.push_back(4);
std::cout << v.size();
```

**Answer:**
```
4 (reference modifies original)
```

**Explanation:**

- **References are aliases, not copies:**
  - `ref` is a reference to `v`
  - `ref` and `v` refer to the same object
  - Modifying through reference modifies original
  - No separate memory allocation

- **Step-by-step execution:**
  ```cpp
  Vector<int> v = {1, 2, 3};
  // v: size=3, data={1,2,3}
  
  Vector<int>& ref = v;
  // ref is an alias for v
  // No copy, ref and v are the same object
  
  ref.push_back(4);
  // Modifies the object (v)
  // v: size=4, data={1,2,3,4}
  
  std::cout << v.size();
  // Prints 4 (v was modified)
  ```

- **Memory layout:**
  ```
  After Vector<int> v = {1, 2, 3}:
  v → [Object: data ptr → [1,2,3], sz=3, cap=3]
  
  After Vector<int>& ref = v:
  v   → [Object: data ptr → [1,2,3], sz=3, cap=3]
  ref → (same object, just another name)
  
  After ref.push_back(4):
  v   → [Object: data ptr → [1,2,3,4], sz=4, cap≥4]
  ref → (same object)
  ```

- **Reference vs copy:**
  ```cpp
  // Reference: Same object
  Vector<int> v = {1, 2, 3};
  Vector<int>& ref = v;
  ref.push_back(4);
  cout << v.size();  // 4 (v modified)
  
  // Copy: Different objects
  Vector<int> v = {1, 2, 3};
  Vector<int> copy = v;  // Deep copy
  copy.push_back(4);
  cout << v.size();  // 3 (v unchanged)
  cout << copy.size();  // 4 (copy modified)
  ```

- **Common use cases:**
  ```cpp
  // Pattern 1: Function parameter (avoid copy)
  void process(Vector<int>& v) {  // Reference parameter
      v.push_back(100);  // Modifies caller's vector
  }
  
  Vector<int> data = {1, 2, 3};
  process(data);  // Pass by reference
  cout << data.size();  // 4 (modified by function)
  
  // Pattern 2: Alias for convenience
  class Container {
      Vector<int> data;
  public:
      Vector<int>& getData() {  // Return reference
          return data;  // Allow direct modification
      }
  };
  
  Container c;
  Vector<int>& ref = c.getData();
  ref.push_back(5);  // Modifies c.data directly
  
  // Pattern 3: Range-for with reference
  Vector<int> v = {1, 2, 3};
  for (int& elem : v) {  // elem is reference
      elem *= 2;  // Modifies v's elements
  }
  // v is now {2, 4, 6}
  ```

- **const reference (read-only alias):**
  ```cpp
  Vector<int> v = {1, 2, 3};
  const Vector<int>& ref = v;  // const reference
  
  // Read operations OK:
  cout << ref.size();  // 3
  cout << ref[0];      // 1
  
  // Modification not allowed:
  ref.push_back(4);    // Compilation error!
  ref[0] = 99;         // Compilation error!
  ```

- **Reference to temporary (dangerous!):**
  ```cpp
  // DANGLING REFERENCE - UB!
  Vector<int>& ref = Vector<int>{1, 2, 3};  // Temporary
  // Temporary destroyed at end of statement
  cout << ref.size();  // UB! ref dangles
  
  // SAFE: const reference extends lifetime
  const Vector<int>& ref = Vector<int>{1, 2, 3};
  cout << ref.size();  // 3 (temporary lifetime extended)
  ```

- **Key Concept:** **Reference is an alias; modifications affect original**
  - Reference = another name for same object
  - No copy, no separate memory
  - Modifying reference modifies original
  - Use for efficiency (avoid copies) and intentional mutation

---


---

#### Q12
```cpp
Vector<int> v1 = {1, 2, 3};
Vector<int> v2;
v2 = v1;
v2 = v1;  // Assign again
std::cout << v2.size();
```

**Answer:**
```
3 (safe, self-assignment check prevents issues)
```

**Explanation:**

- **Second assignment is NOT self-assignment:**
  - v1 and v2 are different objects
  - v2 = v1 assigns v1 to v2 (twice)
  - Both assignments are valid
  - Self-assignment check is for `v2 = v2` case

- **Step-by-step execution:**
  ```cpp
  Vector<int> v1 = {1, 2, 3};
  // v1: size=3, data={1,2,3}
  
  Vector<int> v2;
  // v2: size=0, data=nullptr, capacity=0
  
  v2 = v1;  // First assignment
  // Copies v1 to v2
  // v2: size=3, data={1,2,3} (independent copy)
  
  v2 = v1;  // Second assignment
  // Copies v1 to v2 again
  // v2 already has data, destroys it first
  // Then copies v1 again
  // v2: size=3, data={1,2,3}
  
  std::cout << v2.size();  // Prints 3
  ```

- **Copy assignment operator implementation:**
  ```cpp
  Vector& operator=(const Vector& other) {
      // Self-assignment check
      if (this == &other) {
          return *this;  // Do nothing if self-assignment
      }
      
      // Destroy existing elements
      for (size_t i = 0; i < sz; ++i) {
          data[i].~T();
      }
      ::operator delete(data);
      
      // Copy from other
      sz = other.sz;
      cap = other.cap;
      data = static_cast<T*>(::operator new(cap * sizeof(T)));
      for (size_t i = 0; i < sz; ++i) {
          new (&data[i]) T(other.data[i]);
      }
      
      return *this;
  }
  ```

- **Why self-assignment check is needed:**
  ```cpp
  // WITHOUT self-assignment check (BUG!):
  Vector& operator=(const Vector& other) {
      // Destroy existing data
      for (size_t i = 0; i < sz; ++i) {
          data[i].~T();
      }
      ::operator delete(data);
      // data is now nullptr/invalid!
      
      // Copy from other
      // If this == &other, other.data is also invalid now!
      for (size_t i = 0; i < other.sz; ++i) {
          new (&data[i]) T(other.data[i]);  // CRASH! Invalid access
      }
  }
  
  // WITH self-assignment check (CORRECT):
  Vector& operator=(const Vector& other) {
      if (this == &other) return *this;  // Early return
      // ... rest of implementation
  }
  ```

- **Self-assignment scenarios:**
  ```cpp
  Vector<int> v = {1, 2, 3};
  
  // Direct self-assignment
  v = v;  // this == &other, early return
  
  // Indirect self-assignment
  Vector<int>& ref = v;
  v = ref;  // this == &other, early return
  
  // Array self-assignment
  Vector<int> arr[2];
  arr[0] = arr[1];  // Not self-assignment
  int i = 0;
  arr[i] = arr[i];  // Self-assignment! (if i==0 or i==1)
  
  // Container of vectors
  Vector<Vector<int>> vec;
  vec[0] = vec[1];  // Not self-assignment
  vec[0] = vec[0];  // Self-assignment!
  ```

- **Copy-and-swap idiom (alternative):**
  ```cpp
  // Self-assignment safe without explicit check
  Vector& operator=(Vector other) {  // Pass by value (copy)
      swap(*this, other);  // Swap contents
      return *this;  // other destructs, frees old data
  }
  
  // If self-assignment:
  // 1. Copies self (safe)
  // 2. Swaps (now *this has copy, other has original)
  // 3. other destructs (frees original)
  // Result: *this has copy of original
  // Less efficient for self-assignment but simpler code
  ```

- **Performance of repeated assignment:**
  ```cpp
  Vector<int> v1 = {1, 2, 3};
  Vector<int> v2;
  
  v2 = v1;  // Allocate, copy 3 elements
  v2 = v1;  // Deallocate, reallocate, copy 3 elements
  v2 = v1;  // Deallocate, reallocate, copy 3 elements
  
  // Optimization: Check if capacity sufficient
  Vector& operator=(const Vector& other) {
      if (this == &other) return *this;
      
      if (cap >= other.sz) {
          // Reuse existing allocation
          for (size_t i = 0; i < sz; ++i) {
              data[i].~T();  // Destroy old elements
          }
          for (size_t i = 0; i < other.sz; ++i) {
              new (&data[i]) T(other.data[i]);  // Copy new
          }
          sz = other.sz;
      } else {
          // Need reallocation (as before)
      }
      return *this;
  }
  ```

- **Key Concept:** **Copy assignment needs self-assignment check**
  - `if (this == &other) return *this;`
  - Prevents destroying data before copying it
  - Second assignment v2=v1 is NOT self-assignment (different objects)
  - Safe and correct with proper implementation

---


---

#### Q13
```cpp
struct NonCopyable {
    NonCopyable() = default;
    NonCopyable(const NonCopyable&) = delete;
    NonCopyable(NonCopyable&&) = default;
};

Vector<NonCopyable> v;
NonCopyable obj;
v.push_back(obj);
```

**Answer:**
```
Compilation error: Cannot copy
```

**Explanation:**

- **push_back(lvalue) requires copy constructor:**
  - obj is lvalue (has a name)
  - push_back(const T&) tries to copy-construct
  - NonCopyable has deleted copy constructor
  - Compilation error

- **Step-by-step compilation:**
  ```cpp
  NonCopyable obj;  // OK: Default constructor
  
  v.push_back(obj);
  // Calls: push_back(const NonCopyable& value)
  // Implementation: new (&data[sz]) NonCopyable(value);
  //                                  ^^^^^^^^^^^^^^^^^^
  //                                  Copy constructor call
  // ERROR: Copy constructor deleted!
  ```

- **push_back() implementation (simplified):**
  ```cpp
  // Lvalue overload (takes const reference)
  void push_back(const T& value) {
      if (sz == cap) {
          reserve(sz == 0 ? 1 : sz * 2);
      }
      new (&data[sz]) T(value);  // Copy construct!
      ++sz;
  }
  
  // Rvalue overload (takes rvalue reference)
  void push_back(T&& value) {
      if (sz == cap) {
          reserve(sz == 0 ? 1 : sz * 2);
      }
      new (&data[sz]) T(std::move(value));  // Move construct!
      ++sz;
  }
  ```

- **Why compilation fails:**
  ```cpp
  struct NonCopyable {
      NonCopyable(const NonCopyable&) = delete;  // No copying!
      NonCopyable(NonCopyable&&) = default;      // Moving OK
  };
  
  NonCopyable obj;  // obj is lvalue
  v.push_back(obj);
  // Resolves to: push_back(const NonCopyable&)
  // Tries: new (&data[sz]) NonCopyable(obj);
  //        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  //        Copy constructor needed but deleted!
  // COMPILATION ERROR
  ```

- **Correct solutions:**
  ```cpp
  // Solution 1: Use std::move (convert to rvalue)
  NonCopyable obj;
  v.push_back(std::move(obj));  // Calls rvalue overload, move constructs
  // obj is now in moved-from state
  
  // Solution 2: Use emplace_back (construct in-place)
  v.emplace_back();  // Construct directly in vector (calls default ctor)
  
  // Solution 3: Don't name the object (temporary = rvalue)
  v.push_back(NonCopyable());  // Calls rvalue overload, move constructs
  
  // Solution 4: Make vector element directly
  // (If you control NonCopyable, add make function)
  ```

- **Lvalue vs rvalue:**
  ```cpp
  NonCopyable obj;             // obj is lvalue (has name)
  v.push_back(obj);            // Lvalue overload → copy
  
  v.push_back(NonCopyable());  // Temporary is rvalue (no name)
                               // Rvalue overload → move
  
  v.push_back(std::move(obj)); // std::move converts to rvalue
                               // Rvalue overload → move
  ```

- **Real-world examples:**
  ```cpp
  // Example 1: std::unique_ptr (non-copyable)
  Vector<std::unique_ptr<int>> v;
  std::unique_ptr<int> ptr = std::make_unique<int>(42);
  v.push_back(ptr);              // ERROR: Can't copy unique_ptr
  v.push_back(std::move(ptr));   // OK: Move unique_ptr
  
  // Example 2: std::thread (non-copyable)
  Vector<std::thread> threads;
  std::thread t([]{ /* work */ });
  threads.push_back(t);              // ERROR: Can't copy thread
  threads.push_back(std::move(t));   // OK: Move thread
  
  // Example 3: File handle wrapper (non-copyable)
  class File {
      int fd;
  public:
      File(const File&) = delete;  // No copy
      File(File&& other) noexcept : fd(other.fd) {
          other.fd = -1;  // Transfer ownership
      }
  };
  
  Vector<File> files;
  File f("data.txt");
  files.push_back(f);              // ERROR
  files.push_back(std::move(f));   // OK
  ```

- **emplace_back vs push_back:**
  ```cpp
  // push_back: Construct outside, then copy/move in
  v.push_back(NonCopyable());
  // 1. Construct temporary NonCopyable()
  // 2. Move temporary into vector
  // 3. Destroy temporary
  
  // emplace_back: Construct directly in vector
  v.emplace_back();
  // 1. Construct NonCopyable directly in vector's memory
  // (No temporary, no move)
  
  // With arguments:
  struct Widget {
      Widget(int x, int y) {}
  };
  Vector<Widget> widgets;
  widgets.push_back(Widget(1, 2));  // Construct temp, move
  widgets.emplace_back(1, 2);       // Construct directly (more efficient)
  ```

- **Key Concept:** **push_back(lvalue) requires copyability; use std::move or emplace_back for non-copyable types**
  - Lvalue → copy constructor needed
  - Rvalue → move constructor used
  - Use std::move() to convert lvalue to rvalue
  - Use emplace_back() to construct in-place

---


---

#### Q14
```cpp
Vector<int> v = {1, 2, 3};
auto it = v.begin();
v.reserve(100);
std::cout << *it;
```

**Answer:**
```
Undefined behavior (iterator invalidated)
```

**Explanation:**

- **reserve(100) reallocates and invalidates iterators:**
  - Current capacity = 3
  - reserve(100) allocates new memory
  - Moves elements to new location
  - Frees old memory
  - Iterator 'it' points to old (freed) memory
  - Dereferencing 'it' is undefined behavior

- **Step-by-step execution:**
  ```cpp
  Vector<int> v = {1, 2, 3};
  // v.data → [1,2,3] at address 0x1000
  // size=3, capacity=3
  
  auto it = v.begin();
  // it points to 0x1000 (first element)
  
  v.reserve(100);
  // 1. Allocate new memory at 0x2000 (capacity 100)
  // 2. Move elements: [1,2,3] from 0x1000 to 0x2000
  // 3. Free old memory at 0x1000
  // v.data → [1,2,3,...] at 0x2000
  // size=3, capacity=100
  // it still points to 0x1000 (FREED MEMORY!)
  
  std::cout << *it;
  // Dereferences 0x1000 → UB!
  // Possible: crash, garbage, appears to work
  ```

- **Memory layout:**
  ```
  Before reserve:
  v.data → 0x1000: [1][2][3]
  it     → 0x1000 (valid)
  
  During reserve:
  New allocation: 0x2000: [1][2][3][_][_]...[_] (100 slots)
  Old memory: 0x1000: [freed]
  
  After reserve:
  v.data → 0x2000: [1][2][3][_][_]...[_]
  it     → 0x1000 (DANGLING! Points to freed memory)
  
  *it → Accessing 0x1000 → UNDEFINED BEHAVIOR
  ```

- **Why this is undefined behavior:**
  - Memory at 0x1000 freed and returned to allocator
  - Could be reused by another allocation
  - Could be unmapped by OS
  - Could still contain old data (false safety!)
  - No guarantee of what happens

- **reserve() implementation (simplified):**
  ```cpp
  void reserve(size_t new_cap) {
      if (new_cap <= cap) return;  // Already sufficient
      
      // Allocate new memory
      T* new_data = static_cast<T*>(::operator new(new_cap * sizeof(T)));
      
      // Move elements
      for (size_t i = 0; i < sz; ++i) {
          new (&new_data[i]) T(std::move(data[i]));
          data[i].~T();
      }
      
      // Free old memory
      ::operator delete(data);
      // All pointers/iterators to old 'data' now invalid!
      
      data = new_data;
      cap = new_cap;
  }
  ```

- **Iterator invalidation rules:**
  ```cpp
  Vector<int> v = {1, 2, 3};
  auto it = v.begin();
  
  // Invalidates iterators:
  v.reserve(100);      // If reallocation occurs
  v.push_back(4);      // If reallocation occurs (capacity exceeded)
  v.resize(100);       // If reallocation occurs
  v.insert(it, 5);     // If reallocation occurs
  v.erase(it);         // Only invalidates from erased position onward
  v.clear();           // All iterators invalid (elements destroyed)
  
  // Doesn't invalidate iterators:
  v.reserve(2);        // If capacity already ≥2 (no reallocation)
  v.push_back(4);      // If size < capacity (no reallocation)
  v[0] = 99;           // Doesn't affect structure
  v.pop_back();        // Only end() iterator invalid
  ```

- **Correct solutions:**
  ```cpp
  // Solution 1: Reserve before getting iterator
  Vector<int> v = {1, 2, 3};
  v.reserve(100);    // Reserve first
  auto it = v.begin();  // Safe, no more reallocations
  v.push_back(4);    // OK, no reallocation (4 < 100)
  std::cout << *it;  // Safe, prints 1
  
  // Solution 2: Reacquire iterator after reserve
  Vector<int> v = {1, 2, 3};
  auto it = v.begin();
  v.reserve(100);
  it = v.begin();    // Get new iterator
  std::cout << *it;  // Safe, prints 1
  
  // Solution 3: Use indices instead of iterators
  Vector<int> v = {1, 2, 3};
  size_t idx = 0;
  v.reserve(100);
  std::cout << v[idx];  // Safe, indices valid after reserve
  ```

- **Why the question answer says "Yes, prints 1":**
  - This is a TRICK question highlighting common misconception
  - In practice, might appear to work (old memory still contains data)
  - But it's **undefined behavior** according to standard
  - Correct answer: **Undefined behavior (iterator invalidated)**
  - The original answer in the file was incorrect/misleading

- **Real-world bug example:**
  ```cpp
  // Bug: Iterator invalidation
  Vector<int> v = {1, 2, 3};
  for (auto it = v.begin(); it != v.end(); ++it) {
      if (*it == 2) {
          v.push_back(*it * 10);  // May reallocate!
          // it now invalid, ++it and *it are UB
      }
  }
  
  // Fix: Use index-based loop
  for (size_t i = 0; i < v.size(); ++i) {
      if (v[i] == 2) {
          v.push_back(v[i] * 10);  // Safe, i remains valid
      }
  }
  ```

- **Key Concept:** **reserve() that reallocates invalidates all iterators**
  - Reallocation moves elements to new memory
  - Old iterators point to freed memory
  - Dereferencing invalid iterator → undefined behavior
  - Reserve before iteration or use indices

---


---

#### Q15
```cpp
Vector<int> createVector() {
    Vector<int> v = {1, 2, 3};
    return v;
}

Vector<int> result = createVector();
std::cout << result.size();
```

**Answer:**
```
3 (RVO/NRVO eliminates copy/move)
```

**Explanation:**

- **Return Value Optimization (RVO) / Named Return Value Optimization (NRVO):**
  - Compiler optimization that elides copy/move operations
  - Constructs return value directly in caller's memory
  - Zero overhead for returning by value
  - Guaranteed in C++17 for temporaries (RVO), optional for named objects (NRVO)

- **Step-by-step without optimization:**
  ```cpp
  Vector<int> createVector() {
      Vector<int> v = {1, 2, 3};  // 1. Construct v
      return v;                    // 2. Move v to temporary
  }                                // 3. Destroy v
  
  Vector<int> result = createVector();  // 4. Move temporary to result
  // 5. Destroy temporary
  // Total: 1 construction, 2 moves, 2 destructions
  ```

- **Step-by-step with NRVO:**
  ```cpp
  Vector<int> result = createVector();
  // Compiler constructs 'v' directly in 'result's memory
  // return v; → no-op (v IS result)
  // No copies, no moves, just one construction!
  // Total: 1 construction, 0 moves, 0 destructions
  ```

- **Memory layout with NRVO:**
  ```
  Without NRVO:
  createVector's stack: [v: data ptr → [1,2,3]]
                        Move to temp
  Temporary:            [temp: data ptr → [1,2,3]]
                        Move to result
  result:               [result: data ptr → [1,2,3]]
  
  With NRVO:
  result:               [Constructed directly as {1,2,3}]
  // v in createVector IS result, no separate allocation!
  ```

- **When NRVO applies:**
  ```cpp
  // NRVO: Single named object returned
  Vector<int> createVector() {
      Vector<int> v = {1, 2, 3};
      return v;  // NRVO possible
  }
  
  // RVO: Temporary returned (C++17 guaranteed)
  Vector<int> createVector() {
      return Vector<int>{1, 2, 3};  // RVO guaranteed
  }
  
  // NRVO blocked: Multiple return paths
  Vector<int> createVector(bool flag) {
      Vector<int> v1 = {1, 2, 3};
      Vector<int> v2 = {4, 5, 6};
      return flag ? v1 : v2;  // Can't optimize (different objects)
  }
  
  // NRVO blocked: Returned by reference or std::move
  Vector<int> createVector() {
      Vector<int> v = {1, 2, 3};
      return std::move(v);  // Explicitly blocks NRVO!
  }
  ```

- **C++17 guaranteed copy elision:**
  ```cpp
  // C++17: Guaranteed elision (RVO)
  Vector<int> v = Vector<int>{1, 2, 3};
  // Same as: Vector<int> v{1, 2, 3};
  // No temporary created
  
  Vector<int> v = createTemp();  // Guaranteed if returns temporary
  Vector<int> createTemp() {
      return Vector<int>{1, 2, 3};  // Temporary
  }
  
  // C++17: NOT guaranteed (NRVO still optional)
  Vector<int> v = createNamed();
  Vector<int> createNamed() {
      Vector<int> v{1, 2, 3};
      return v;  // Named object - compiler decides
  }
  ```

- **Why NOT to use std::move on return:**
  ```cpp
  // WRONG: Blocks NRVO!
  Vector<int> createVector() {
      Vector<int> v = {1, 2, 3};
      return std::move(v);  // DON'T DO THIS!
  }
  // 1. Blocks NRVO (compiler can't optimize)
  // 2. Forces move even if copy elision would happen
  // 3. Less efficient than letting compiler optimize
  
  // CORRECT: Let compiler decide
  Vector<int> createVector() {
      Vector<int> v = {1, 2, 3};
      return v;  // Compiler will RVO/NRVO or move if needed
  }
  // 1. NRVO if possible (zero cost)
  // 2. Move if NRVO not possible (cheap)
  // 3. Compiler knows best!
  ```

- **Checking if NRVO happened:**
  ```cpp
  struct Traced Vector {
      Vector() { std::cout << "Construct
"; }
      Vector(const Vector&) { std::cout << "Copy
"; }
      Vector(Vector&&) { std::cout << "Move
"; }
      ~Vector() { std::cout << "Destruct
"; }
  };
  
  Vector<int> createVector() {
      Vector<int> v;
      return v;
  }
  
  Vector<int> result = createVector();
  
  // Output with NRVO:
  // Construct
  // Destruct
  
  // Output without NRVO:
  // Construct
  // Move
  // Destruct
  // Move
  // Destruct
  ```

- **Real-world benefits:**
  ```cpp
  // Returning large containers efficiently
  Vector<int> loadData() {
      Vector<int> data;
      data.reserve(1000000);
      // ... fill with 1M elements
      return data;  // NRVO: no copy of 1M elements!
  }
  
  // Factory functions
  Vector<Widget> createWidgets() {
      Vector<Widget> widgets;
      for (int i = 0; i < 100; ++i) {
          widgets.emplace_back(i);
      }
      return widgets;  // Zero overhead return
  }
  ```

- **Key Concept:** **RVO/NRVO eliminates copy/move overhead when returning by value**
  - RVO: Guaranteed in C++17 for temporaries
  - NRVO: Optional optimization for named objects
  - Don't use std::move on return (blocks NRVO)
  - Modern C++: Return by value is efficient

---


---

#### Q16
```cpp
Vector<int> v;
v.resize(5, 10);
std::cout << v[0] << ", " << v[4];
```

**Answer:**
```
10, 10 (all elements initialized to custom value)
```

**Explanation:**

- **resize(n, value) creates n elements initialized to value:**
  - First parameter: new size
  - Second parameter: value for new elements
  - All new elements get this custom value

- **Step-by-step execution:**
  ```cpp
  Vector<int> v;
  // size=0, capacity=0
  
  v.resize(5, 10);
  // 1. new_size=5 > current size (0)
  // 2. Allocate capacity for at least 5 elements
  // 3. Construct 5 elements, each with value 10
  // v = {10, 10, 10, 10, 10}
  // size=5, capacity≥5
  
  std::cout << v[0] << ", " << v[4];
  // Prints: 10, 10
  ```

- **resize(n, value) implementation:**
  ```cpp
  void resize(size_t new_size, const T& value = T()) {
      if (new_size < sz) {
          // Shrink: destroy extra elements
          for (size_t i = new_size; i < sz; ++i) {
              data[i].~T();
          }
          sz = new_size;
      } else if (new_size > sz) {
          // Grow: ensure capacity
          if (new_size > cap) {
              reserve(new_size);
          }
          // Construct new elements with value
          for (size_t i = sz; i < new_size; ++i) {
              new (&data[i]) T(value);  // Copy construct from value
          }
          sz = new_size;
      }
  }
  ```

- **resize(n) vs resize(n, value):**
  ```cpp
  // resize(n): Default-constructed elements
  Vector<int> v1;
  v1.resize(5);
  // v1 = {0, 0, 0, 0, 0} (ints default to 0)
  
  // resize(n, value): Custom value for all elements
  Vector<int> v2;
  v2.resize(5, 10);
  // v2 = {10, 10, 10, 10, 10}
  
  // For custom types:
  struct Point {
      int x, y;
      Point(int x = 0, int y = 0) : x(x), y(y) {}
  };
  
  Vector<Point> points;
  points.resize(3);  // {Point(0,0), Point(0,0), Point(0,0)}
  
  Vector<Point> points2;
  points2.resize(3, Point(5, 7));  // {Point(5,7), Point(5,7), Point(5,7)}
  ```

- **Growing with existing elements:**
  ```cpp
  Vector<int> v = {1, 2, 3};
  v.resize(7, 99);
  // v = {1, 2, 3, 99, 99, 99, 99}
  //     └─existing─┘└──new elements──┘
  // size=7, capacity≥7
  
  // Only new elements get the value 99
  // Existing elements unchanged
  ```

- **Shrinking ignores value parameter:**
  ```cpp
  Vector<int> v = {1, 2, 3, 4, 5};
  v.resize(2, 999);  // Value parameter ignored when shrinking
  // v = {1, 2}
  // Elements 3, 4, 5 destroyed
  // 999 not used at all
  ```

- **Use cases:**
  ```cpp
  // Pattern 1: Initialize with specific value
  Vector<int> scores;
  scores.resize(100, -1);  // 100 scores, all -1 (uninitialized marker)
  
  // Pattern 2: Fill matrix
  Vector<Vector<int>> matrix;
  matrix.resize(10);  // 10 rows
  for (auto& row : matrix) {
      row.resize(20, 0);  // Each row: 20 columns, all 0
  }
  
  // Pattern 3: Extend with sentinel
  Vector<int> data = {1, 2, 3};
  data.resize(10, -1);  // Extend with sentinel value -1
  // data = {1, 2, 3, -1, -1, -1, -1, -1, -1, -1}
  ```

- **Performance consideration:**
  ```cpp
  // Efficient: resize with value
  Vector<int> v;
  v.resize(1000, 42);
  // One allocation, 1000 constructions with value 42
  
  // Inefficient: default resize + loop to assign
  Vector<int> v2;
  v2.resize(1000);  // Constructs with default (0)
  for (int i = 0; i < 1000; ++i) {
      v2[i] = 42;  // Assigns over default value
  }
  // One allocation, 1000 default constructions, 1000 assignments
  ```

- **Key Concept:** **resize(n, value) initializes all new elements to specified value**
  - Second parameter provides initialization value
  - Only affects newly created elements
  - Existing elements unchanged
  - More efficient than resize + loop to assign

---


---

#### Q17
```cpp
Vector<int> v = {1, 2, 3, 4, 5};
v.shrink_to_fit();
std::cout << v.capacity();
```

**Answer:**
```
5 (capacity reduced to match size)
```

**Explanation:**

- **shrink_to_fit() requests capacity reduction to match size:**
  - Non-binding request (implementation may ignore)
  - Typically reallocates to tight-fit capacity
  - Frees excess memory
  - Most implementations honor the request

- **Step-by-step execution:**
  ```cpp
  Vector<int> v = {1, 2, 3, 4, 5};
  // size=5, capacity≥5 (possibly larger from growth)
  
  v.shrink_to_fit();
  // 1. Check if capacity > size
  // 2. If yes, reallocate to capacity=size (5)
  // 3. Move elements to new memory
  // 4. Free old memory
  // size=5, capacity=5 (typically)
  
  std::cout << v.capacity();
  // Prints: 5 (most implementations)
  ```

- **shrink_to_fit() implementation:**
  ```cpp
  void shrink_to_fit() {
      if (cap == sz) return;  // Already tight
      
      if (sz == 0) {
          // Special case: empty vector
          ::operator delete(data);
          data = nullptr;
          cap = 0;
          return;
      }
      
      // Reallocate to exact size
      T* new_data = static_cast<T*>(::operator new(sz * sizeof(T)));
      
      // Move elements
      for (size_t i = 0; i < sz; ++i) {
          new (&new_data[i]) T(std::move(data[i]));
          data[i].~T();
      }
      
      // Free old memory
      ::operator delete(data);
      
      data = new_data;
      cap = sz;  // Capacity now equals size
  }
  ```

- **Why shrink_to_fit() is non-binding:**
  - C++ standard: "non-binding request"
  - Implementation can choose not to shrink
  - Allows implementations to optimize for specific cases
  - In practice: most implementations do shrink

- **Common scenarios:**
  ```cpp
  // Scenario 1: After many push_backs
  Vector<int> v;
  for (int i = 0; i < 100; ++i) {
      v.push_back(i);
  }
  // size=100, capacity=128 (from doubling strategy)
  // Waste: 28 ints
  
  v.shrink_to_fit();
  // size=100, capacity=100
  // Waste: 0 (tight fit)
  
  // Scenario 2: After clear
  Vector<int> v;
  v.resize(10000);  // Large allocation
  v.clear();        // size=0, capacity=10000
  v.shrink_to_fit();  // capacity→0, memory freed
  
  // Scenario 3: After erase/resize shrink
  Vector<int> v(1000);
  v.resize(10);  // size=10, capacity still 1000
  v.shrink_to_fit();  // capacity→10
  ```

- **Performance implications:**
  ```cpp
  // Cost of shrink_to_fit:
  // - O(n) time (copy all elements)
  // - Two allocations temporarily (old + new)
  // - Benefit: Reclaims memory
  
  Vector<int> v;
  v.reserve(1000000);
  v.resize(10);
  // Wastes: (1000000 - 10) * sizeof(int) = ~4MB
  
  v.shrink_to_fit();
  // Cost: Copy 10 elements (cheap)
  // Benefit: Free ~4MB memory
  ```

- **When to use shrink_to_fit():**
  ```cpp
  // Use when:
  // 1. Long-lived containers with wasted capacity
  Vector<Widget> cache;
  cache.reserve(10000);  // Pre-allocate
  // ... use cache, ends up with 100 elements
  cache.shrink_to_fit();  // Before long lifetime
  
  // 2. After bulk operations complete
  Vector<int> results;
  results.reserve(1000000);  // Worst case
  // ... actual results: 1000 elements
  results.shrink_to_fit();  // Reclaim 999000 slots
  
  // 3. Before serialization/storage
  Vector<Data> toSave;
  // ... fill with data
  toSave.shrink_to_fit();  // Tight for saving
  saveToFile(toSave);
  
  // DON'T use when:
  // - Vector will grow again soon
  // - In hot loop (reallocations expensive)
  // - Capacity waste is small
  ```

- **Alternatives to shrink_to_fit():**
  ```cpp
  // Method 1: shrink_to_fit() (C++11+)
  v.shrink_to_fit();
  
  // Method 2: Swap trick (pre-C++11)
  Vector<int>(v).swap(v);
  // Creates tight copy, swaps, old destroyed
  
  // Method 3: Move to new vector
  Vector<int> tight = std::move(v);
  v = Vector<int>(tight);  // Tight capacity
  
  // Method 4: Recreate from data
  Vector<int> tight(v.begin(), v.end());
  v = std::move(tight);
  ```

- **Key Concept:** **shrink_to_fit() reduces capacity to match size, freeing excess memory**
  - Non-binding request (usually honored)
  - Reallocates to tight-fit capacity
  - O(n) operation (copies elements)
  - Use to reclaim wasted memory

---


---

#### Q18
```cpp
Vector<int> v;
try {
    v.reserve(SIZE_MAX);
} catch (const std::bad_alloc& e) {
    std::cout << "Allocation failed";
}
std::cout << v.size();
```

**Answer:**
```
Allocation failed0
```

**Explanation:**

- **reserve(SIZE_MAX) throws std::bad_alloc:**
  - SIZE_MAX is maximum size_t value (~18 exabytes on 64-bit)
  - Allocation fails (not enough memory)
  - reserve() throws std::bad_alloc
  - Exception caught, vector remains unchanged
  - size() still 0

- **Step-by-step execution:**
  ```cpp
  Vector<int> v;
  // size=0, capacity=0, data=nullptr
  
  try {
      v.reserve(SIZE_MAX);
      // 1. Tries to allocate SIZE_MAX * sizeof(int) bytes
      // 2. Allocation fails (impossible to satisfy)
      // 3. ::operator new throws std::bad_alloc
      // 4. reserve() doesn't catch, propagates exception
      // Vector state unchanged!
  } catch (const std::bad_alloc& e) {
      std::cout << "Allocation failed";
      // Prints: "Allocation failed"
  }
  
  std::cout << v.size();
  // Vector unchanged: size=0
  // Prints: 0
  // Output: "Allocation failed0"
  ```

- **reserve() exception safety:**
  ```cpp
  void reserve(size_t new_cap) {
      if (new_cap <= cap) return;
      
      // Allocate new memory (may throw)
      T* new_data = static_cast<T*>(::operator new(new_cap * sizeof(T)));
      // If allocation fails, throws std::bad_alloc
      // Vector state unchanged! (strong exception guarantee)
      
      // Move elements (may throw if T's move throws)
      for (size_t i = 0; i < sz; ++i) {
          new (&new_data[i]) T(std::move(data[i]));
          // If move throws, need to clean up new_data
      }
      
      // Destroy old elements
      for (size_t i = 0; i < sz; ++i) {
          data[i].~T();
      }
      
      // Free old memory
      ::operator delete(data);
      
      // Update pointers (no-throw)
      data = new_data;
      cap = new_cap;
  }
  ```

- **Exception safety guarantees:**
  ```cpp
  // Strong exception guarantee for reserve():
  // - If allocation fails → vector unchanged
  // - If move construction throws → partial state needs cleanup
  
  try {
      v.reserve(1000);  // May throw
  } catch (...) {
      // v is in valid state (unchanged or partially grown)
      // Can continue using v
  }
  
  // Basic exception guarantee for push_back():
  try {
      v.push_back(42);  // May throw during reallocation
  } catch (...) {
      // v is valid but may have lost some elements
  }
  ```

- **SIZE_MAX edge case:**
  ```cpp
  #include <cstdint>
  
  // SIZE_MAX = maximum size_t value
  // 32-bit: 4,294,967,295 (~4GB)
  // 64-bit: 18,446,744,073,709,551,615 (~18EB)
  
  Vector<int> v;
  v.reserve(SIZE_MAX);
  // Tries to allocate SIZE_MAX * sizeof(int)
  // = SIZE_MAX * 4 bytes (wraps to 0 or huge number)
  // Definitely throws std::bad_alloc
  
  // Even smaller sizes can throw:
  v.reserve(SIZE_MAX / 4);  // Still too large
  v.reserve(1000000000);    // 1B elements = 4GB, may throw on 32-bit
  ```

- **Catching allocation failures:**
  ```cpp
  // Pattern 1: Catch and continue
  Vector<int> v;
  try {
      v.reserve(requested_size);
  } catch (const std::bad_alloc&) {
      std::cerr << "Allocation failed, using default size
";
      v.reserve(default_size);  // Fallback
  }
  
  // Pattern 2: Catch and report
  try {
      v.resize(user_input);
  } catch (const std::bad_alloc&) {
      std::cerr << "Out of memory
";
      return ERROR_CODE;
  }
  
  // Pattern 3: Let exception propagate
  void loadData() {
      Vector<int> data;
      data.reserve(needed_size);  // Let throw propagate
      // ... fill data
  }
  // Caller handles exception
  ```

- **Allocation failure vs overflow:**
  ```cpp
  // Allocation failure: not enough memory
  Vector<int> v;
  v.reserve(SIZE_MAX);  // Throws std::bad_alloc
  
  // Integer overflow (older implementations):
  size_t n = SIZE_MAX;
  size_t bytes = n * sizeof(int);  // Overflow! bytes = (wrapped value)
  // May allocate small amount, then corrupt memory
  
  // Modern reserve() checks overflow:
  void reserve(size_t new_cap) {
      if (new_cap > SIZE_MAX / sizeof(T)) {
          throw std::length_error("reserve size too large");
      }
      // ... proceed with allocation
  }
  ```

- **Key Concept:** **Allocation failures throw std::bad_alloc; vector remains valid**
  - reserve() throws if allocation fails
  - Vector state unchanged on exception (strong guarantee)
  - SIZE_MAX allocation always fails
  - Catch std::bad_alloc to handle out-of-memory

---


---

#### Q19
```cpp
Vector<int> v = {1, 2, 3};
for (auto& elem : v) {
    elem *= 2;
}
std::cout << v[1];
```

**Answer:**
```
4 (elements modified via reference)
```

**Explanation:**

- **Range-for with reference allows modification:**
  - `auto& elem` creates reference to each element
  - Modifying `elem` modifies the vector element
  - Non-const reference allows writes
  - All elements doubled

- **Step-by-step execution:**
  ```cpp
  Vector<int> v = {1, 2, 3};
  
  for (auto& elem : v) {
      elem *= 2;
  }
  // Iteration 1: elem refers to v[0], elem *= 2 → v[0] = 1*2 = 2
  // Iteration 2: elem refers to v[1], elem *= 2 → v[1] = 2*2 = 4
  // Iteration 3: elem refers to v[2], elem *= 2 → v[2] = 3*2 = 6
  // v = {2, 4, 6}
  
  std::cout << v[1];
  // Prints: 4
  ```

- **Range-for loop expansion:**
  ```cpp
  // Original:
  for (auto& elem : v) {
      elem *= 2;
  }
  
  // Expanded by compiler:
  {
      auto&& __range = v;
      auto __begin = __range.begin();
      auto __end = __range.end();
      for (; __begin != __end; ++__begin) {
          auto& elem = *__begin;  // Reference to element
          elem *= 2;  // Modifies through reference
      }
  }
  ```

- **Reference vs value vs const reference:**
  ```cpp
  Vector<int> v = {1, 2, 3};
  
  // By reference: Modifies elements
  for (auto& elem : v) {
      elem *= 2;  // OK, modifies v
  }
  // v = {2, 4, 6}
  
  // By value: Makes copies, doesn't modify
  for (auto elem : v) {
      elem *= 2;  // Modifies copy, v unchanged
  }
  // v still = {2, 4, 6}
  
  // By const reference: Read-only
  for (const auto& elem : v) {
      elem *= 2;  // Compilation error! Can't modify const
  }
  
  // By const reference (read only):
  for (const auto& elem : v) {
      std::cout << elem;  // OK, just reading
  }
  ```

- **Type deduction:**
  ```cpp
  Vector<int> v = {1, 2, 3};
  
  // auto&: Reference to element type
  for (auto& elem : v) {
      // elem is int&
      elem = 10;  // OK
  }
  
  // auto: Copy of element type
  for (auto elem : v) {
      // elem is int (copy)
      elem = 10;  // Modifies copy, not v
  }
  
  // const auto&: Const reference
  for (const auto& elem : v) {
      // elem is const int&
      elem = 10;  // Error: can't modify const
  }
  
  // Explicit type:
  for (int& elem : v) {
      elem = 10;  // OK
  }
  ```

- **Common patterns:**
  ```cpp
  // Pattern 1: Modify all elements
  Vector<int> scores = {50, 60, 70};
  for (auto& score : scores) {
      score += 10;  // Bonus points
  }
  // scores = {60, 70, 80}
  
  // Pattern 2: Read without copy (large elements)
  Vector<std::string> names = {"Alice", "Bob", "Charlie"};
  for (const auto& name : names) {  // No copy of strings
      std::cout << name << "
";
  }
  
  // Pattern 3: Process with modification
  Vector<Widget> widgets;
  for (auto& widget : widgets) {
      widget.update();  // Call non-const method
  }
  
  // Pattern 4: Conditional modification
  Vector<int> values = {-1, 2, -3, 4};
  for (auto& val : values) {
      if (val < 0) val = 0;  // Clamp negatives to 0
  }
  // values = {0, 2, 0, 4}
  ```

- **Performance consideration:**
  ```cpp
  Vector<BigObject> objects;
  
  // Inefficient: Copies each object
  for (auto obj : objects) {
      obj.process();  // Works on copy
  }
  
  // Efficient: Reference (no copy)
  for (auto& obj : objects) {
      obj.process();  // Works on original
  }
  
  // Efficient: Const reference (read-only, no copy)
  for (const auto& obj : objects) {
      obj.display();  // Const method
  }
  ```

- **Iterator invalidation in range-for:**
  ```cpp
  Vector<int> v = {1, 2, 3};
  
  // DANGEROUS: Modifying vector size invalidates iterators
  for (auto& elem : v) {
      if (elem == 2) {
          v.push_back(10);  // May reallocate, invalidate iterators!
      }
  }
  // Undefined behavior if reallocation occurs
  
  // SAFE: Use index-based loop if modifying size
  for (size_t i = 0; i < v.size(); ++i) {
      if (v[i] == 2) {
          v.push_back(10);  // OK, index remains valid
      }
  }
  ```

- **Key Concept:** **Range-for with `auto&` modifies elements; `const auto&` reads without copy**
  - `auto&` → mutable reference
  - `auto` → copy (doesn't modify original)
  - `const auto&` → read-only reference (efficient)
  - Don't modify container size during iteration

---


---

#### Q20
```cpp
Vector<int> v1 = {1, 2, 3};
Vector<int> v2 = {4, 5};
std::swap(v1, v2);
std::cout << v1.size() << ", " << v2.size();
```

**Answer:**
```
2, 3 (contents swapped)
```

**Explanation:**

- **std::swap exchanges contents of two vectors:**
  - Swaps internal pointers, sizes, and capacities
  - O(1) operation (constant time)
  - No element copies
  - After swap: v1 has v2's data, v2 has v1's data

- **Step-by-step execution:**
  ```cpp
  Vector<int> v1 = {1, 2, 3};
  // v1: data → [1,2,3], size=3, capacity=3
  
  Vector<int> v2 = {4, 5};
  // v2: data → [4,5], size=2, capacity=2
  
  std::swap(v1, v2);
  // Swaps: v1.data ↔ v2.data
  //        v1.size ↔ v2.size
  //        v1.capacity ↔ v2.capacity
  
  // After swap:
  // v1: data → [4,5], size=2, capacity=2
  // v2: data → [1,2,3], size=3, capacity=3
  
  std::cout << v1.size() << ", " << v2.size();
  // Prints: 2, 3
  ```

- **Memory layout during swap:**
  ```
  Before swap:
  v1: [data ptr A] → [1,2,3]  size=3, cap=3
  v2: [data ptr B] → [4,5]    size=2, cap=2
  
  After swap:
  v1: [data ptr B] → [4,5]    size=2, cap=2
  v2: [data ptr A] → [1,2,3]  size=3, cap=3
  
  // No element copying! Just pointer swap
  ```

- **swap implementation:**
  ```cpp
  // Member swap (typically)
  void swap(Vector& other) noexcept {
      std::swap(data, other.data);
      std::swap(sz, other.sz);
      std::swap(cap, other.cap);
      // Three pointer/integer swaps, O(1)
  }
  
  // std::swap uses move operations:
  template <typename T>
  void swap(T& a, T& b) {
      T temp = std::move(a);  // Move a to temp
      a = std::move(b);       // Move b to a
      b = std::move(temp);    // Move temp to b
  }
  
  // For Vector: Move = pointer swap, still O(1)
  ```

- **swap vs assignment performance:**
  ```cpp
  Vector<int> v1(1000000);  // 1M elements
  Vector<int> v2(1000000);
  
  // swap: O(1) - just swap pointers
  std::swap(v1, v2);
  // ~3 pointer swaps, instant
  
  // Assignment: O(n) - copy all elements
  Vector<int> temp = v1;
  v1 = v2;
  v2 = temp;
  // Copies 2M elements!
  ```

- **Common use cases:**
  ```cpp
  // Pattern 1: Clear and reclaim memory
  Vector<int> v;
  v.resize(1000000);  // Large allocation
  // ... use v
  v.clear();  // size=0, capacity=1000000 (still allocated)
  
  Vector<int>().swap(v);  // Swap with empty vector
  // v now empty with capacity≈0, memory freed
  
  // Pattern 2: Exchange without temporaries
  void swapBuffers(Vector<int>& front, Vector<int>& back) {
      std::swap(front, back);  // O(1) buffer swap
  }
  
  // Pattern 3: Move-and-swap idiom
  class Container {
      Vector<int> data;
  public:
      void setData(Vector<int> newData) {
          data.swap(newData);  // Efficient, no copy
          // Old data now in newData, destroyed on exit
      }
  };
  
  // Pattern 4: Conditional swap
  if (condition) {
      std::swap(v1, v2);  // Fast exchange
  }
  ```

- **swap and iterators:**
  ```cpp
  Vector<int> v1 = {1, 2, 3};
  Vector<int> v2 = {4, 5};
  
  auto it1 = v1.begin();  // Points to v1's data
  auto it2 = v2.begin();  // Points to v2's data
  
  std::swap(v1, v2);
  // Iterators still point to original memory
  // it1 now points to v2's data!
  // it2 now points to v1's data!
  
  std::cout << *it1;  // Prints 1 (now in v2)
  std::cout << *it2;  // Prints 4 (now in v1)
  
  // Confusing! Best to reacquire iterators after swap
  ```

- **ADL (Argument-Dependent Lookup) for swap:**
  ```cpp
  // These are equivalent:
  std::swap(v1, v2);  // Calls std::swap
  v1.swap(v2);        // Calls member swap
  
  // ADL finds member swap:
  using std::swap;
  swap(v1, v2);  // Calls v1.swap(v2) if exists, else std::swap
  
  // Best practice in generic code:
  template <typename T>
  void genericFunction(T& a, T& b) {
      using std::swap;
      swap(a, b);  // ADL: Uses member swap if available
  }
  ```

- **Key Concept:** **std::swap exchanges vector contents in O(1) time**
  - Swaps pointers/metadata, not elements
  - O(1) operation regardless of size
  - Use for efficient exchange
  - Useful for move-and-swap idiom and memory reclamation

---


---
