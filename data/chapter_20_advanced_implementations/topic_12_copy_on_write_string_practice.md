## TOPIC: Copy-on-Write String - Shared Reference Counting

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Q1
```cpp
class COWString {
    struct Data {
        char* str;
        int refcount;
    };
    Data* data_;

public:
    COWString(const char* s) {
        data_ = new Data{new char[strlen(s) + 1], 1};
        strcpy(data_->str, s);
    }

    COWString(const COWString& other) : data_(other.data_) {
        data_->refcount++;  // Bug: not thread-safe!
    }

    ~COWString() {
        if (--data_->refcount == 0) {  // Bug: not thread-safe!
            delete[] data_->str;
            delete data_;
        }
    }
};
```

**Answer:**
```
Data race (refcount++ and refcount-- not atomic, causing use-after-free or leaks)
```

**Explanation:**
- `refcount++` and `--refcount` are non-atomic read-modify-write
- Thread 1 copies, Thread 2 destructs simultaneously → race
- Lost increments → premature deletion → use-after-free
- Lost decrements → memory leak
- Must use `std::atomic<int>` for thread-safe reference counting
- **Key Concept:** Reference counting in multi-threaded code requires atomic operations; non-atomic increment/decrement cause races leading to use-after-free or leaks

**Fixed Version:**
```cpp
struct Data {
    char* str;
    std::atomic<int> refcount;
};

COWString(const COWString& other) : data_(other.data_) {
    data_->refcount.fetch_add(1, std::memory_order_relaxed);
}

~COWString() {
    if (data_->refcount.fetch_sub(1, std::memory_order_acq_rel) == 1) {
        delete[] data_->str;
        delete data_;
    }
}
```

---

#### Q2
```cpp
class COWString {
    struct Data {
        char* str;
        std::atomic<int> refcount;
    };
    Data* data_;

public:
    char& operator[](size_t index) {
        if (data_->refcount > 1) {  // Bug: not atomic read!
            // Copy-on-write
            Data* new_data = new Data{new char[strlen(data_->str) + 1], 1};
            strcpy(new_data->str, data_->str);
            data_->refcount--;
            data_ = new_data;
        }
        return data_->str[index];
    }
};
```

**Answer:**
```
Race condition (refcount check not atomic with decrement, multiple threads may all copy)
```

**Explanation:**
- Thread 1 reads `refcount > 1` → true
- Thread 2 also reads `refcount > 1` → true
- Both threads allocate new data and decrement refcount
- Original data may be deleted while still in use
- Check-and-modify must be atomic operation
- Need mutex or atomic compare-exchange
- **Key Concept:** Check-then-act on atomic is race condition; must use atomic RMW operations or lock; load() + compare + decrement is three separate operations

**Fixed Version:**
```cpp
char& operator[](size_t index) {
    std::lock_guard<std::mutex> lock(mutex_);  // Protect entire COW operation

    if (data_->refcount.load() > 1) {
        Data* new_data = new Data{new char[strlen(data_->str) + 1], 1};
        strcpy(new_data->str, data_->str);
        data_->refcount.fetch_sub(1);
        data_ = new_data;
    }
    return data_->str[index];
}
```

---

#### Q3
```cpp
class COWString {
    // ... COW implementation ...

public:
    const char* c_str() const {
        return data_->str;  // Bug: returns pointer to shared data!
    }
};

int main() {
    COWString s1("hello");
    const char* ptr = s1.c_str();

    COWString s2 = s1;  // Shares data
    s2[0] = 'H';  // Triggers COW, allocates new buffer

    std::cout << ptr;  // Bug: ptr may be dangling if s1 was last reference!
}
```

**Answer:**
```
Dangling pointer (c_str() returns pointer to shared buffer that may be reallocated)
```

**Explanation:**
- `c_str()` returns raw pointer to internal buffer
- If COW triggered, original buffer may be deleted
- Returned pointer dangles
- Similar issue to returning reference from `operator[]`
- C-string APIs expect stable pointers, COW violates this
- Must detach or document lifetime
- **Key Concept:** Returning pointers from COW types dangerous; internal buffer may be reallocated; pointers/references invalidated on write; COW incompatible with pointer stability

**Fixed Version:**
```cpp
// Option 1: Detach on c_str() (expensive)
const char* c_str() {
    detach();  // Force unique ownership
    return data_->str;
}

// Option 2: Document lifetime (like std::string_view)
// "Pointer valid only until next non-const operation"

// Option 3: Return by value (copy)
std::string c_str() const {
    return std::string(data_->str);
}
```

---

#### Q4
```cpp
class COWString {
    struct Data {
        char* str;
        size_t length;
        std::atomic<int> refcount;

        Data(const char* s) : refcount(1) {
            length = strlen(s);
            str = new char[length + 1];
            strcpy(str, s);
        }
    };
    Data* data_;

public:
    COWString& operator+=(const COWString& other) {
        detach();  // Ensure unique ownership

        size_t new_len = data_->length + other.data_->length;
        char* new_str = new char[new_len + 1];

        strcpy(new_str, data_->str);
        strcat(new_str, other.data_->str);

        delete[] data_->str;
        data_->str = new_str;  // Bug: doesn't update length!
        return *this;
    }
};
```

**Answer:**
```
Incorrect length (length field not updated after concatenation)
```

**Explanation:**
- Concatenates strings correctly
- But `data_->length` still holds old length
- Subsequent operations using `length` will be incorrect
- May cause buffer overruns or truncation
- Must update `length` after any modification
- **Key Concept:** COW strings maintain length for O(1) size(); must update length on modification; forgetting causes stale metadata

**Fixed Version:**
```cpp
COWString& operator+=(const COWString& other) {
    detach();

    size_t new_len = data_->length + other.data_->length;
    char* new_str = new char[new_len + 1];

    strcpy(new_str, data_->str);
    strcat(new_str, other.data_->str);

    delete[] data_->str;
    data_->str = new_str;
    data_->length = new_len;  // Update length!
    return *this;
}
```

---

#### Q5
```cpp
class COWString {
    // ... implementation ...

public:
    char operator[](size_t index) const {  // Returns by value
        return data_->str[index];
    }

    char& operator[](size_t index) {  // Returns by reference
        detach();  // Force COW
        return data_->str[index];
    }
};

int main() {
    COWString s1("hello");
    COWString s2 = s1;  // Share data

    char c = s1[0];  // Calls non-const version! Bug: unnecessary COW!
}
```

**Answer:**
```
Unnecessary copy (non-const operator[] called on non-const object, triggers COW even for read)
```

**Explanation:**
- `s1` is non-const → calls non-const `operator[]`
- Triggers `detach()` even though only reading
- Allocates new buffer unnecessarily
- Defeats COW optimization
- C++ overload resolution prefers non-const for non-const objects
- No way to tell if reference will be read or written
- **Key Concept:** Non-const operator[] must assume write, triggers COW even for reads; COW pessimistic for non-const access; use const when possible or lazy COW

**No perfect fix - this is inherent COW trade-off:**
```cpp
// Workaround: Use const reference
const COWString& s1_const = s1;
char c = s1_const[0];  // Calls const version, no COW

// Or: Use at() for read-only access
char at(size_t index) const {
    return data_->str[index];
}
char c = s1.at(0);  // No COW
```

---

#### Q6
```cpp
class COWString {
    struct Data {
        char* str;
        std::atomic<int> refcount;
    };
    Data* data_;

public:
    ~COWString() {
        if (data_->refcount.fetch_sub(1) == 1) {
            delete[] data_->str;
            delete data_;  // Bug: data_ contains atomic, not trivially destructible!
        }
    }
};
```

**Answer:**
```
Actually safe (atomic<int> destructor is trivial, delete works correctly)
```

**Explanation:**
- `std::atomic<int>` has trivial destructor
- `delete data_` calls `Data` destructor, which destroys atomic
- Atomic destroyed before memory freed
- This is correct!
- **No bug** - atomic types designed for this use case
- **Key Concept:** std::atomic has trivial destructor for trivial types; safe to delete structs containing atomics; destructor called before deallocation

---

#### Q7
```cpp
class COWString {
    // ... implementation ...

    void detach() {
        if (data_->refcount > 1) {  // Make unique copy
            Data* new_data = new Data(*data_);  // Bug: shallow copy of Data!
            data_->refcount--;
            data_ = new_data;
        }
    }
};
```

**Answer:**
```
Shallow copy (both old and new Data share same str pointer, double-delete)
```

**Explanation:**
- `new Data(*data_)` uses default copy constructor
- Copies `str` pointer (shallow copy)
- Both `Data` instances point to same string buffer
- Both destructors call `delete[] str` → double-delete
- Must deep-copy the string buffer
- **Key Concept:** Default copy constructor performs shallow copy; pointers copied by value; must implement deep copy for resource-owning types

**Fixed Version:**
```cpp
struct Data {
    char* str;
    std::atomic<int> refcount;

    // Deep copy constructor
    Data(const Data& other) : refcount(1) {
        str = new char[strlen(other.str) + 1];
        strcpy(str, other.str);
    }
};

void detach() {
    if (data_->refcount.load() > 1) {
        Data* new_data = new Data(*data_);  // Now does deep copy
        data_->refcount.fetch_sub(1);
        data_ = new_data;
    }
}
```

---

#### Q8
```cpp
class COWString {
    struct Data {
        std::string str;  // Bug: using std::string inside COW string!
        std::atomic<int> refcount;
    };
    Data* data_;
};
```

**Answer:**
```
Design flaw (std::string already optimized with SSO, COW on top adds overhead)
```

**Explanation:**
- `std::string` has Small String Optimization (SSO)
- COW on top of std::string adds indirection and refcounting overhead
- Double indirection: `COWString -> Data* -> std::string -> char*`
- No performance benefit, only overhead
- Should use `char*` directly if implementing COW
- **Key Concept:** Layering optimizations causes overhead; COW string should manage raw char* directly; using std::string defeats purpose

**Fixed Version:**
```cpp
struct Data {
    char* str;  // Raw pointer, not std::string
    size_t length;
    std::atomic<int> refcount;
};
```

---

#### Q9
```cpp
class COWString {
    // ... implementation with proper COW ...

public:
    void clear() {
        if (data_->refcount.load() > 1) {
            data_->refcount.fetch_sub(1);
            data_ = new Data("", 1);  // Bug: allocates for empty string!
        } else {
            data_->str[0] = '\0';
            data_->length = 0;
        }
    }
};
```

**Answer:**
```
Unnecessary allocation (allocates new Data for empty string instead of reusing)
```

**Explanation:**
- When shared, detaches and allocates new empty buffer
- But empty string could use singleton empty buffer
- Wastes memory for common case
- Better: use static empty Data shared by all empty strings
- Or: always detach and reuse current buffer
- **Key Concept:** Empty strings common; COW should use shared empty buffer singleton to avoid per-string allocation; reduces memory and allocation overhead

**Fixed Version:**
```cpp
class COWString {
    static Data* empty_data() {
        static Data empty{"", 1000000};  // High refcount, never deleted
        return &empty;
    }

public:
    void clear() {
        if (data_ != empty_data()) {
            if (data_->refcount.fetch_sub(1) == 1) {
                delete[] data_->str;
                delete data_;
            }
        }
        data_ = empty_data();
    }
};
```

---

#### Q10
```cpp
class COWString {
    // ... proper COW implementation ...
};

int main() {
    std::vector<COWString> vec;
    vec.push_back(COWString("hello"));

    COWString& ref = vec[0];
    ref[0] = 'H';  // Bug: triggers COW, but vector may reallocate!

    // If vector reallocates, ref invalidated
}
```

**Answer:**
```
Potential dangling reference (COW modification may trigger but vector reallocation separate issue)
```

**Explanation:**
- `ref[0] = 'H'` calls non-const `operator[]`
- Triggers COW on the string (allocates new buffer)
- Reference `ref` to vector element remains valid (vector not modified)
- This specific case is SAFE
- But demonstrates COW hides internal allocations
- User must still worry about container invalidation rules
- **Key Concept:** COW modifications allocate internally but don't invalidate external references to the COW object itself; container rules still apply; internal buffer pointers may change

**Note:** This is actually safe, but tests understanding of invalidation rules.

---
