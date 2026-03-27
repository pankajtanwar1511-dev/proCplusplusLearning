## TOPIC: Advanced Template Techniques - SFINAE and CRTP

### PRACTICE_TASKS: SFINAE and CRTP Code Analysis

#### Q1
```cpp
template<typename T>
typename std::enable_if<std::is_integral<T>::value>::type
process(T val) { std::cout << "integral\n"; }

int main() {
    process(42);
    process(3.14);
}
```

**Answer:**
```
integral
Compilation error on process(3.14)
```

**Explanation:**
- `std::enable_if<std::is_integral<T>::value>::type` uses SFINAE
- enable_if provides nested `type` only if condition is true
- If condition false, no `type` member (substitution failure)
- `process(42)` with T=int: is_integral<int> is true, function instantiates
- Prints "integral"
- `process(3.14)` with T=double: is_integral<double> is false
- enable_if has no `type` member, substitution fails
- No other overload available for double
- Compilation error: no matching function for call to process(double)
- **Key Concept:** SFINAE with enable_if enables function only when trait is true; substitution failure removes overload from candidate set

---

#### Q2
```cpp
template<typename T>
auto hasSize(int) -> decltype(std::declval<T>().size(), std::true_type{});

template<typename T>
std::false_type hasSize(...);

int main() {
    std::cout << decltype(hasSize<std::vector<int>>(0))::value << "\n";
    std::cout << decltype(hasSize<int>(0))::value << "\n";
}
```

**Answer:**
```
1
0
```

**Explanation:**
- Expression SFINAE detects presence of `.size()` method
- First overload: `decltype(std::declval<T>().size(), std::true_type{})`
- `std::declval<T>()` creates T without construction (for unevaluated context)
- Comma operator: evaluates both, returns second (std::true_type)
- Second overload: `std::false_type hasSize(...)` (variadic, lower priority)
- `hasSize<std::vector<int>>(0)`: vector has .size(), first overload selected
- Returns std::true_type, ::value is 1
- `hasSize<int>(0)`: int has no .size(), first overload SFINAE fails
- Second overload selected (fallback), returns std::false_type, ::value is 0
- **Key Concept:** Expression SFINAE with decltype and comma operator detects member functions; variadic overload as fallback

---

#### Q3
```cpp
template<typename Derived>
class Base {
public:
    void interface() {
        static_cast<Derived*>(this)->impl();
    }
};

class D : public Base<D> {
public:
    void impl() { std::cout << "D::impl\n"; }
};

int main() {
    D d;
    d.interface();
}
```

**Answer:**
```
D::impl
```

**Explanation:**
- CRTP (Curiously Recurring Template Pattern): D inherits from Base<D>
- Base is templated on Derived type (D)
- `interface()` in Base casts `this` to Derived*: `static_cast<Derived*>(this)`
- Since D inherits from Base<D>, this points to D object
- Static cast to D* is safe and legal
- Calls `impl()` on Derived (D), not Base
- Static dispatch (compile-time polymorphism), no virtual functions
- `d.interface()` calls Base::interface(), which calls D::impl()
- Prints "D::impl"
- **Key Concept:** CRTP enables static polymorphism by casting base this to derived type; avoids virtual function overhead

---

#### Q4
```cpp
template<typename T>
typename std::enable_if<std::is_pointer<T>::value>::type
func(T) { std::cout << "pointer\n"; }

template<typename T>
typename std::enable_if<!std::is_pointer<T>::value>::type
func(T) { std::cout << "non-pointer\n"; }

int main() {
    int x = 42;
    func(&x);
    func(x);
}
```

**Answer:**
```
pointer
non-pointer
```

**Explanation:**
- Two function templates with mutually exclusive enable_if conditions
- First: enabled when T is pointer type
- Second: enabled when T is NOT pointer type (!is_pointer)
- `func(&x)` with T=int*: is_pointer<int*> is true
- First overload enabled, second disabled (SFINAE), prints "pointer"
- `func(x)` with T=int: is_pointer<int> is false
- First overload disabled (SFINAE), second enabled, prints "non-pointer"
- enable_if evaluates at compile time during template instantiation
- Only one overload valid for each call
- **Key Concept:** Mutually exclusive SFINAE conditions create non-overlapping overload sets; only one candidate per call

---

#### Q5
```cpp
template<typename Derived>
class Counter {
    static inline int count = 0;
protected:
    Counter() { ++count; }
public:
    static int getCount() { return count; }
};

class Widget : public Counter<Widget> { };

int main() {
    Widget w1, w2, w3;
    std::cout << Widget::getCount() << "\n";
}
```

**Answer:**
```
3
```

**Explanation:**
- CRTP counter pattern: Counter<Derived> template with static member
- `static inline int count = 0` (C++17 inline static variable)
- Each instantiation of Counter<T> has separate static counter
- Widget inherits from Counter<Widget>
- All Widget objects share same Counter<Widget>::count
- Protected constructor increments count when Widget constructed
- w1, w2, w3 each call Widget constructor
- Widget constructor calls Counter<Widget> constructor
- Each increments Counter<Widget>::count: 0→1→2→3
- `Widget::getCount()` returns Counter<Widget>::count = 3
- **Key Concept:** CRTP with static members creates per-type counters; each derived type has separate counter

---

#### Q6
```cpp
template<typename T>
void processImpl(T val, std::true_type) { std::cout << "integral\n"; }

template<typename T>
void processImpl(T val, std::false_type) { std::cout << "other\n"; }

template<typename T>
void process(T val) { processImpl(val, std::is_integral<T>{}); }

int main() {
    process(10);
    process(3.14);
}
```

**Answer:**
```
integral
other
```

**Explanation:**
- Tag dispatch pattern: dispatch based on type tags (true_type/false_type)
- `process(T val)` wrapper calls `processImpl(val, std::is_integral<T>{})`
- `std::is_integral<T>{}` constructs true_type or false_type object
- Not template specialization, just function overloading
- `process(10)`: is_integral<int> is std::true_type, calls first processImpl
- Prints "integral"
- `process(3.14)`: is_integral<double> is std::false_type, calls second processImpl
- Prints "other"
- No SFINAE needed, both overloads always exist
- Cleaner than enable_if for simple cases
- **Key Concept:** Tag dispatch uses type objects to select overloads; cleaner alternative to SFINAE for binary choices

---

#### Q7
```cpp
template<typename T, typename = typename std::enable_if<std::is_class<T>::value>::type>
void func(T) { std::cout << "class\n"; }

int main() {
    struct MyClass { };
    func(MyClass{});
    func(42);
}
```

**Answer:**
```
class
Compilation error on func(42)
```

**Explanation:**
- Template with default parameter using enable_if
- `typename = typename std::enable_if<std::is_class<T>::value>::type`
- Second template parameter has default value (not used in function signature)
- SFINAE applied via default parameter, not return type
- `func(MyClass{})`: is_class<MyClass> is true, enable_if provides type
- Function instantiates, prints "class"
- `func(42)` with T=int: is_class<int> is false
- enable_if has no type member, substitution fails
- No other overload available for int
- Compilation error: no matching function for call to func(int)
- **Key Concept:** SFINAE via default template parameters; substitution failure removes overload from candidate set

---

#### Q8
```cpp
template<typename Derived>
class Printable {
public:
    void print() const {
        std::cout << static_cast<const Derived*>(this)->toString() << "\n";
    }
};

class Data : public Printable<Data> {
public:
    std::string toString() const { return "Data"; }
};

int main() {
    Data d;
    d.print();
}
```

**Answer:**
```
Data
```

**Explanation:**
- CRTP mixin pattern: Printable<Derived> provides interface
- Data inherits from Printable<Data>
- Printable::print() casts this to const Derived* (const Data*)
- Calls toString() on derived class
- Static dispatch (compile-time resolution), no virtual functions
- Mixin pattern adds functionality (printing) to derived class
- Derived must implement toString() method (compile-time contract)
- `d.print()` calls Printable<Data>::print()
- Casts to const Data*, calls Data::toString()
- Returns "Data", prints it
- **Key Concept:** CRTP mixin adds interface to derived class; derived provides implementation via static contract

---

#### Q9
```cpp
template<typename T>
auto callFunc(T& obj) -> decltype(obj.func()) {
    return obj.func();
}

struct HasFunc { int func() { return 42; } };

int main() {
    HasFunc h;
    std::cout << callFunc(h) << "\n";
}
```

**Answer:**
```
42
```

**Explanation:**
- Trailing return type with decltype: `auto callFunc(T& obj) -> decltype(obj.func())`
- decltype deduces return type from expression obj.func()
- Must match actual return type of func() method
- HasFunc::func() returns int
- decltype(obj.func()) deduces int
- callFunc return type is int
- `callFunc(h)` calls h.func(), returns 42
- Prints 42
- decltype with expressions (not types) preserves value category
- Useful for generic code when return type depends on T
- **Key Concept:** decltype with trailing return type deduces return type from expressions; enables generic return types

---

#### Q10
```cpp
template<typename T>
typename std::enable_if<std::is_arithmetic<T>::value && !std::is_same<T, bool>::value>::type
func(T) { std::cout << "arithmetic non-bool\n"; }

int main() {
    func(42);
    func(3.14);
    func(true);
}
```

**Answer:**
```
arithmetic non-bool
arithmetic non-bool
Compilation error on func(true)
```

**Explanation:**
- Combined SFINAE conditions with && operator
- `is_arithmetic<T>::value && !is_same<T, bool>::value`
- Both conditions must be true for enable_if to provide type
- Arithmetic types: int, float, double, bool, char, etc.
- `func(42)` with T=int: is_arithmetic<int> is true, is_same<int,bool> is false
- Condition: true && true = true, function enabled, prints "arithmetic non-bool"
- `func(3.14)` with T=double: is_arithmetic<double> is true, is_same<double,bool> is false
- Condition: true && true = true, prints "arithmetic non-bool"
- `func(true)` with T=bool: is_arithmetic<bool> is true, is_same<bool,bool> is true
- Condition: true && false = false, enable_if has no type, SFINAE fails
- Compilation error: no matching function for call to func(bool)
- **Key Concept:** SFINAE with combined trait conditions; can exclude specific types from template sets

---

#### Q11
```cpp
template<typename Derived>
class Base {
public:
    void doWork() { static_cast<Derived*>(this)->impl(); }
};

class Incomplete : public Base<Incomplete> {
    // Missing impl()
};

int main() {
    Incomplete obj;
    obj.doWork();
}
```

**Answer:**
```
Compilation error
```

**Explanation:**
- CRTP contract violation: Base expects Derived to have impl() method
- Base<Incomplete>::doWork() casts this to Incomplete*
- Attempts to call impl() on Incomplete
- Incomplete class has no impl() method (not defined)
- Compilation error: no member named impl in Incomplete
- Error occurs during template instantiation of doWork()
- CRTP requires derived class to satisfy interface contract
- Unlike virtual functions, no runtime error - compile-time check
- Must implement all methods that base calls via static_cast
- **Fix:** Add `void impl() { /* implementation */ }` to Incomplete class
- **Key Concept:** CRTP requires derived class to implement expected interface; compile-time contract enforcement

---

#### Q12
```cpp
template<typename T>
auto test(int) -> decltype(typename T::value_type{}, std::true_type{});

template<typename T>
std::false_type test(...);

template<typename T>
struct Container { using value_type = T; };

int main() {
    std::cout << decltype(test<Container<int>>(0))::value << "\n";
    std::cout << decltype(test<int>(0))::value << "\n";
}
```

**Answer:**
```
1
0
```

**Explanation:**
- Expression SFINAE detects nested type member value_type
- First overload: `decltype(typename T::value_type{}, std::true_type{})`
- `typename T::value_type` attempts to access nested type
- If exists, braced initialization creates instance
- Comma operator returns second operand (std::true_type)
- Second overload: variadic fallback with lower priority
- `test<Container<int>>(0)`: Container has value_type, first overload selected
- Returns std::true_type, ::value is 1
- `test<int>(0)`: int has no value_type, first overload SFINAE fails
- Second overload selected, returns std::false_type, ::value is 0
- Detects container-like types (vector, list, custom containers)
- **Key Concept:** Expression SFINAE with typename detects nested types; comma operator for return type

---

#### Q13
```cpp
template<typename Derived>
class Singleton {
    static Derived* instance;
protected:
    Singleton() = default;
public:
    static Derived& getInstance() {
        if (!instance) instance = new Derived();
        return *instance;
    }
};

template<typename T>
T* Singleton<T>::instance = nullptr;

class Database : public Singleton<Database> {
    friend class Singleton<Database>;
private:
    Database() { std::cout << "DB created\n"; }
};

int main() {
    Database& db1 = Database::getInstance();
    Database& db2 = Database::getInstance();
    std::cout << (&db1 == &db2) << "\n";
}
```

**Answer:**
```
DB created
1
```

**Explanation:**
- CRTP Singleton pattern: Singleton<Derived> provides singleton interface
- Database inherits from Singleton<Database>
- Static member `instance` is Database* (per-type singleton)
- `getInstance()` checks if instance is null, creates if needed
- First call `Database::getInstance()`: instance is nullptr
- Creates new Database(), prints "DB created"
- Stores in Singleton<Database>::instance
- Returns reference to Database
- Second call: instance already exists, returns same reference
- `&db1 == &db2` compares addresses, both point to same object, prints 1
- friend class declaration allows Singleton to access private constructor
- CRTP enables type-safe singletons without runtime polymorphism
- **Key Concept:** CRTP singleton provides per-type singleton instances; static member in base template is separate for each derived type

---

#### Q14
```cpp
template<typename T, 
         typename std::enable_if<std::is_integral<T>::value, int>::type = 0>
void func(T) { std::cout << "int version\n"; }

template<typename T,
         typename std::enable_if<std::is_floating_point<T>::value, long>::type = 0>
void func(T) { std::cout << "float version\n"; }

int main() {
    func(42);
    func(3.14);
}
```

**Answer:**
```
int version
float version
```

**Explanation:**
- SFINAE via non-type template parameter with enable_if
- First: `typename std::enable_if<std::is_integral<T>::value, int>::type = 0`
- Second: `typename std::enable_if<std::is_floating_point<T>::value, long>::type = 0`
- enable_if second parameter (int, long) specifies type when condition true
- Default value = 0 for both
- `func(42)` with T=int: is_integral<int> is true
- First enable_if provides type int, default value 0
- Second enable_if fails (not floating point), SFINAE removes second overload
- Prints "int version"
- `func(3.14)` with T=double: is_floating_point<double> is true
- Second enable_if provides type long, default value 0
- First enable_if fails (not integral), SFINAE removes first overload
- Prints "float version"
- **Key Concept:** SFINAE with enable_if second parameter and default values; mutually exclusive type constraints

---

#### Q15
```cpp
template<typename Derived>
class LogMixin {
public:
    void log(const std::string& msg) {
        std::cout << "LOG: " << msg << "\n";
        static_cast<Derived*>(this)->extraLog();
    }
};

class MyClass : public LogMixin<MyClass> {
public:
    void extraLog() { std::cout << "Extra\n"; }
};

int main() {
    MyClass obj;
    obj.log("test");
}
```

**Answer:**
```
LOG: test
Extra
```

**Explanation:**
- CRTP mixin pattern: LogMixin<Derived> adds logging functionality
- MyClass inherits from LogMixin<MyClass>
- LogMixin::log() prints message, then calls derived extraLog()
- Casts this to Derived* (MyClass*) via static_cast
- Static dispatch resolves to MyClass::extraLog()
- `obj.log("test")` calls LogMixin<MyClass>::log()
- Prints "LOG: test"
- Casts to MyClass*, calls MyClass::extraLog()
- Prints "Extra"
- Mixin pattern allows customization hook (extraLog)
- Derived class can add extra behavior without modifying mixin
- No virtual functions, compile-time polymorphism
- **Key Concept:** CRTP mixin provides customizable functionality; derived class extends via static contract methods

---

#### Q16
```cpp
template<typename T>
typename std::enable_if<sizeof(T) > 4, void>::type
func(T) { std::cout << "large type\n"; }

int main() {
    func(42L);
    func('c');
}
```

**Answer:**
```
large type
Compilation error on func('c')
```

**Explanation:**
- SFINAE based on sizeof operator (compile-time size check)
- `std::enable_if<sizeof(T) > 4, void>::type` enabled when type larger than 4 bytes
- `func(42L)` with T=long: sizeof(long) is typically 8 bytes (platform-dependent)
- 8 > 4, enable_if provides type void, function instantiates
- Prints "large type"
- `func('c')` with T=char: sizeof(char) is always 1 byte
- 1 > 4 is false, enable_if has no type member, SFINAE fails
- No other overload available for char
- Compilation error: no matching function for call to func(char)
- sizeof is compile-time constant expression
- **Key Concept:** SFINAE with sizeof enables functions based on type size; useful for optimization or specialization by size

---

#### Q17
```cpp
template<typename T>
struct RemoveConst { using type = T; };

template<typename T>
struct RemoveConst<const T> { using type = T; };

template<typename T>
auto func(T) -> typename RemoveConst<T>::type {
    return typename RemoveConst<T>::type{};
}

int main() {
    const int x = 42;
    auto result = func(x);
    std::cout << std::is_const<decltype(result)>::value << "\n";
}
```

**Answer:**
```
0
```

**Explanation:**
- Type trait implementation: RemoveConst strips const from types
- Primary template: `RemoveConst<T>` provides type = T (unchanged)
- Partial specialization: `RemoveConst<const T>` provides type = T (strips const)
- `func(T)` has trailing return type `typename RemoveConst<T>::type`
- `func(x)` with const int x: T deduced as const int (by-value, const ignored)
- Wait - by-value parameters decay: const int → int
- Actually T is int (not const int), RemoveConst<int> returns int
- `auto result` deduces int from return type
- `is_const<decltype(result)>` checks if result is const
- result is int (non-const), ::value is 0 (false)
- If parameter was const int&, T would be const int, trait would strip it
- **Key Concept:** Type trait partial specialization strips type qualifiers; useful for generic programming

---

#### Q18
```cpp
template<typename Derived>
class Interface {
public:
    void execute() {
        std::cout << "Before\n";
        static_cast<Derived*>(this)->doExecute();
        std::cout << "After\n";
    }
};

class Impl : public Interface<Impl> {
public:
    void doExecute() { std::cout << "Executing\n"; }
};

int main() {
    Impl obj;
    obj.execute();
}
```

**Answer:**
```
Before
Executing
After
```

**Explanation:**
- CRTP Template Method pattern: Interface defines algorithm skeleton
- Impl inherits from Interface<Impl>
- Interface::execute() provides template method structure
- Prints "Before"
- Casts this to Derived* (Impl*), calls doExecute()
- Static dispatch to Impl::doExecute(), prints "Executing"
- Returns to execute(), prints "After"
- Template method pattern: base defines flow, derived provides steps
- Static polymorphism (CRTP) instead of virtual functions
- Compile-time dispatch, zero overhead
- Derived must implement doExecute() (compile-time contract)
- Common pattern for frameworks and extensibility
- **Key Concept:** CRTP Template Method pattern provides algorithm skeleton with static dispatch; derived fills in steps

---

#### Q19
```cpp
template<typename T>
void process(T val) {
    static_assert(std::is_integral<T>::value, "T must be integral");
    std::cout << val << "\n";
}

int main() {
    process(42);
    process(3.14);
}
```

**Answer:**
```
42
Compilation error on process(3.14)
```

**Explanation:**
- static_assert provides compile-time assertions
- `static_assert(std::is_integral<T>::value, "T must be integral")`
- Evaluated during template instantiation
- If condition false, compilation fails with error message
- `process(42)` with T=int: is_integral<int> is true
- static_assert passes, function compiles, prints 42
- `process(3.14)` with T=double: is_integral<double> is false
- static_assert fails with message "T must be integral"
- Compilation error with descriptive message
- Better than SFINAE for mandatory constraints (clear error message)
- SFINAE removes overload silently, static_assert fails loudly
- C++11 feature for enforcing requirements
- **Key Concept:** static_assert enforces template constraints at compile time with clear error messages; better than SFINAE for mandatory requirements

---

#### Q20
```cpp
template<typename T>
auto add(T a, T b) -> decltype(a + b) {
    return a + b;
}

int main() {
    std::cout << add(5, 10) << "\n";
    std::cout << add(3.14, 2.86) << "\n";
    std::cout << add(std::string("Hello"), std::string(" World")) << "\n";
}
```

**Answer:**
```
15
6
Hello World
```

**Explanation:**
- Trailing return type with decltype: `auto add(T a, T b) -> decltype(a + b)`
- decltype deduces result type of expression a + b
- Works with any type that supports operator+
- `add(5, 10)` with T=int: decltype(int + int) is int
- Returns 5 + 10 = 15
- `add(3.14, 2.86)` with T=double: decltype(double + double) is double
- Returns 6.0, printed as 6 (stream default formatting)
- `add(string("Hello"), string(" World"))`: decltype(string + string) is string
- string operator+ concatenates, returns "Hello World"
- Generic function works for any addable types
- decltype preserves exact result type (including references if returned)
- **Key Concept:** decltype with trailing return type enables generic operations; deduces result type from expression

---
