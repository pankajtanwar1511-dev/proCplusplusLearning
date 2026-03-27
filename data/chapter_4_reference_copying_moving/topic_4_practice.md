## TOPIC: Copy Elision and Return Value Optimization (RVO)

### PRACTICE_TASKS: Challenge Questions

#### Q1
```cpp
class Widget {
public:
    Widget() { std::cout << "1"; }
    Widget(const Widget&) { std::cout << "2"; }
    Widget(Widget&&) noexcept { std::cout << "3"; }
};

Widget f() { return Widget(); }

int main() {
    Widget w = f();
}
// What is printed in C++17 mode?
```

**Answer:**
```
1
```

**Explanation:**
- C++17 guarantees copy elision for prvalue returns
- Widget() constructed directly in w's location (mandatory elision)
- No copy or move constructors called
- Only default constructor runs once
- Pre-C++17 might print "13" (construct + move)
- **Key Concept:** C++17 mandatory copy elision eliminates all copies/moves for prvalue temporaries

#### Q2
```cpp
class Resource {
public:
    Resource() { std::cout << "A"; }
    Resource(const Resource&) = delete;
    Resource(Resource&&) = delete;
};

Resource create() {
    return Resource();
}

int main() {
    Resource r = create();
}
// Does this compile in C++17? In C++14?
```

**Answer:**
```
C++17: YES, prints "A"
C++14: NO, compilation error
```

**Explanation:**
- C++17: Mandatory copy elision applies, Resource() constructed directly in r
- Copy/move constructors never called, so deleted ones don't matter
- C++14: Requires move constructor for return, even if elided
- Deleted move constructor causes C++14 compilation error
- **Key Concept:** C++17 allows returning non-copyable, non-movable types by value

#### Q3
```cpp
struct S {
    S() { std::cout << "C"; }
    S(S&&) { std::cout << "M"; }
};

S getS() {
    S s;
    return std::move(s);
}

int main() {
    S obj = getS();
}
// What is the output and why?
```

**Answer:**
```
CM
```

**Explanation:**
- `S s;` constructs s → prints "C"
- `return std::move(s);` forces move constructor call → prints "M"
- Anti-pattern: explicit std::move prevents NRVO
- Without std::move, NRVO would apply (no output)
- Compiler warning: pessimizing move prevents copy elision
- **Key Concept:** Don't use std::move on local return values - it disables RVO

#### Q4
```cpp
class Value {
public:
    Value() { std::cout << "1"; }
    Value(const Value&) { std::cout << "2"; }
    Value(Value&&) { std::cout << "3"; }
};

Value get(bool flag) {
    Value a, b;
    return flag ? a : b;
}

int main() {
    Value v = get(true);
}
// What is the output?
```

**Answer:**
```
112
```

**Explanation:**
- `Value a, b;` creates two objects → prints "11"
- `return flag ? a : b;` is conditional expression, not single named variable
- NRVO cannot apply (uncertain which object to return)
- Copy constructor called to return → prints "2"
- Both a and b destroyed when get() exits
- **Key Concept:** NRVO requires single named return value; conditional expressions prevent elision

#### Q5
```cpp
struct Widget {
    Widget() = default;
    Widget(Widget&&) { std::cout << "Move\n"; }
};

Widget create1() {
    Widget w;
    return w;
}

Widget create2() {
    Widget w;
    return std::move(w);
}

int main() {
    Widget w1 = create1();
    Widget w2 = create2();
}
// What is printed?
```

#### Q6
```cpp
class Logger {
public:
    Logger() { std::cout << "C"; }
    Logger(const Logger&) { std::cout << "CC"; }
    Logger(Logger&&) { std::cout << "MC"; }
    ~Logger() { std::cout << "D"; }
};

Logger getLogger() {
    return Logger();
}

int main() {
    Logger log = getLogger();
    std::cout << "X";
}
// What is the output sequence in C++17?
```

#### Q7
```cpp
struct S {
    S(int) { std::cout << "1"; }
    S(const S&) { std::cout << "2"; }
    S(S&&) { std::cout << "3"; }
};

S func(S s) {
    return s;
}

int main() {
    S obj = func(S(5));
}
// What is printed?
```

#### Q8
```cpp
class Data {
public:
    Data() { std::cout << "D"; }
    Data(Data&&) { std::cout << "M"; }
};

Data get1() { return Data(); }
Data get2() { Data d; return d; }
Data get3() { Data d; return std::move(d); }

int main() {
    Data d1 = get1();
    Data d2 = get2();
    Data d3 = get3();
}
// What is printed?
```

#### Q9
```cpp
struct NonMovable {
    NonMovable() { std::cout << "C"; }
    NonMovable(const NonMovable&) = delete;
    NonMovable(NonMovable&&) = delete;
    ~NonMovable() { std::cout << "D"; }
};

NonMovable create() {
    return NonMovable();
}

int main() {
    NonMovable obj = create();
    std::cout << "X";
}
// What is printed in C++17?
```

#### Q10
```cpp
class Resource {
public:
    Resource() { std::cout << "1"; }
    Resource(const Resource&) { std::cout << "2"; }
    Resource(Resource&&) noexcept { std::cout << "3"; }
};

void process(Resource r) {
    std::cout << "P";
}

int main() {
    process(Resource());
}
// What is printed in C++17?
```

#### Q11
```cpp
struct S {
    S() { std::cout << "C"; }
    S(S&&) { std::cout << "M"; }
};

S getS() {
    if (true) {
        return S();
    } else {
        return S();
    }
}

int main() {
    S s = getS();
}
// What is printed?
```

#### Q12
```cpp
class Widget {
public:
    Widget() { std::cout << "W"; }
    Widget(Widget&&) { std::cout << "M"; }
};

Widget getWidget() {
    Widget w;
    // Many lines of code...
    return w;
}

int main() {
    Widget result = getWidget();
}
// With typical modern compiler optimization, what is likely printed?
```

#### Q13
```cpp
const std::string getString() {
    return std::string("Hello");
}

int main() {
    std::string s = getString();
}
// Does RVO apply? Can the returned value be moved?
```

#### Q14
```cpp
struct Counter {
    static int count;
    Counter() { ++count; }
    Counter(const Counter&) { ++count; }
    Counter(Counter&&) { ++count; }
};
int Counter::count = 0;

Counter create() {
    return Counter();
}

int main() {
    Counter c = create();
    std::cout << Counter::count;
}
// What number is printed in C++17?
```

#### Q15
```cpp
class Base {
public:
    Base() { std::cout << "B"; }
    Base(Base&&) { std::cout << "BM"; }
};

class Derived : public Base {
public:
    Derived() { std::cout << "D"; }
    Derived(Derived&&) : Base(std::move(static_cast<Base&&>(std::declval<Derived>()))) {
        std::cout << "DM";
    }
};

Derived create() {
    return Derived();
}

int main() {
    Derived d = create();
}
// What is printed?
```

#### Q16
```cpp
struct S {
    S() { std::cout << "C"; }
    S(S&&) { std::cout << "M"; }
};

S* getPtr() {
    static S s = S();
    return &s;
}

int main() {
    S* ptr = getPtr();
}
// What is printed?
```

#### Q17
```cpp
class Value {
public:
    Value() { std::cout << "V"; }
    Value(Value&&) { std::cout << "M"; }
};

Value getValue() {
    return Value();
}

int main() {
    const Value& ref = getValue();
    std::cout << "X";
}
// What is printed and why?
```

#### Q18
```cpp
struct S {
    S() { std::cout << "1"; }
    S(const S&) { std::cout << "2"; }
    S(S&&) { std::cout << "3"; }
};

S arr[2] = {S(), S()};
// What is printed?
```

#### Q19
```cpp
class Widget {
public:
    Widget() { std::cout << "C"; }
    Widget(Widget&&) { std::cout << "M"; }
};

std::pair<Widget, Widget> getPair() {
    return std::make_pair(Widget(), Widget());
}

int main() {
    auto [w1, w2] = getPair();
}
// What is printed in C++17?
```

#### Q20
```cpp
struct S {
    S() { std::cout << "S"; }
    S(S&&) { std::cout << "M"; }
};

S getS() try {
    return S();
} catch (...) {
    throw;
}

int main() {
    S s = getS();
}
// What is printed?
```

---

**Answer:**
```
Move
```

**Explanation:**
- create1(): NRVO applies, w constructed directly in w1 (no output)
- create2(): std::move forces move, prints "Move"
- create1 demonstrates optimal pattern (NRVO)
- create2 is anti-pattern (explicitly moving prevents NRVO)
- **Key Concept:** Return local variable without std::move for best performance

#### Q6
```cpp
class Logger {
public:
    Logger() { std::cout << "C"; }
    Logger(const Logger&) { std::cout << "CC"; }
    Logger(Logger&&) { std::cout << "MC"; }
    ~Logger() { std::cout << "D"; }
};

Logger getLogger() {
    return Logger();
}

int main() {
    Logger log = getLogger();
    std::cout << "X";
}
// What is the output sequence in C++17?
```

**Answer:**
```
CXD
```

**Explanation:**
- getLogger(): Logger() constructed directly in log (mandatory elision) → prints "C"
- main continues → prints "X"
- End of main: log destroyed → prints "D"
- No copy or move constructors called
- Single construction, single destruction
- **Key Concept:** C++17 elision produces single object lifetime

#### Q7
```cpp
struct S {
    S(int) { std::cout << "1"; }
    S(const S&) { std::cout << "2"; }
    S(S&&) { std::cout << "3"; }
};

S func(S s) {
    return s;
}

int main() {
    S obj = func(S(5));
}
// What is printed?
```

**Answer:**
```
13
```

**Explanation:**
- `S(5)` creates temporary → prints "1"
- Temporary moved into parameter s (mandatory elision in C++17) 
- Actually print "1" for construction
- `return s;` - s is lvalue, automatic move applies → prints "3"
- Parameter treated as rvalue when returned
- **Key Concept:** Function parameters automatically moved on return

#### Q8
```cpp
class Data {
public:
    Data() { std::cout << "D"; }
    Data(Data&&) { std::cout << "M"; }
};

Data get1() { return Data(); }
Data get2() { Data d; return d; }
Data get3() { Data d; return std::move(d); }

int main() {
    Data d1 = get1();
    Data d2 = get2();
    Data d3 = get3();
}
// What is printed?
```

**Answer:**
```
DDDM
```

**Explanation:**
- get1(): prvalue, mandatory elision → prints "D" only
- get2(): NRVO applies, d constructed in d2 → prints "D" only
- get3(): std::move prevents NRVO, forces move → prints "D" then "M"
- get3 is pessimizing: extra move constructor call
- First two demonstrate optimal elision patterns
- **Key Concept:** Avoid std::move on return; let compiler optimize

#### Q9
```cpp
struct NonMovable {
    NonMovable() { std::cout << "C"; }
    NonMovable(const NonMovable&) = delete;
    NonMovable(NonMovable&&) = delete;
    ~NonMovable() { std::cout << "D"; }
};

NonMovable create() {
    return NonMovable();
}

int main() {
    NonMovable obj = create();
    std::cout << "X";
}
// What is printed in C++17?
```

**Answer:**
```
CXD
```

**Explanation:**
- C++17 mandatory elision allows this to compile
- NonMovable() constructed directly in obj → prints "C"
- Deleted constructors never called
- "X" printed in main
- obj destroyed at end → prints "D"
- **Key Concept:** C++17 enables returning non-copyable, non-movable types

#### Q10
```cpp
class Resource {
public:
    Resource() { std::cout << "1"; }
    Resource(const Resource&) { std::cout << "2"; }
    Resource(Resource&&) noexcept { std::cout << "3"; }
};

void process(Resource r) {
    std::cout << "P";
}

int main() {
    process(Resource());
}
// What is printed in C++17?
```

**Answer:**
```
1P
```

**Explanation:**
- `Resource()` temporary constructed directly in parameter r → prints "1"
- C++17 mandatory elision for prvalue argument
- No move constructor called
- process executes → prints "P"
- r destroyed when process exits
- **Key Concept:** C++17 elides temporaries passed as function arguments


#### Q11
```cpp
struct S {
    S() { std::cout << "C"; }
    S(S&&) { std::cout << "M"; }
};

S getS() {
    if (true) {
        return S();
    } else {
        return S();
    }
}

int main() {
    S s = getS();
}
// What is printed?
```

**Answer:**
```
C
```

**Explanation:**
- Despite if-else, both branches return S() prvalue
- Compiler performs mandatory elision on taken branch
- true branch: S() constructed directly in s → prints "C"
- false branch never executed (dead code)
- Mandatory elision applies to prvalue returns regardless of branches
- **Key Concept:** Prvalue elision works with conditional returns

#### Q12
```cpp
class Widget {
public:
    Widget() { std::cout << "W"; }
    Widget(Widget&&) { std::cout << "M"; }
};

Widget getWidget() {
    Widget w;
    // Many lines of code...
    return w;
}

int main() {
    Widget result = getWidget();
}
// With typical modern compiler optimization, what is likely printed?
```

**Answer:**
```
W
```

**Explanation:**
- Modern compilers implement NRVO (Named Return Value Optimization)
- Single named variable w returned from function
- NRVO constructs w directly in result's location
- No move constructor called despite being available
- Optimization applies even with complex code between creation and return
- **Key Concept:** NRVO reliably optimizes single named variable returns

#### Q13
```cpp
const std::string getString() {
    return std::string("Hello");
}

int main() {
    std::string s = getString();
}
// Does RVO apply? Can the returned value be moved?
```

**Answer:**
```
RVO applies despite const
```

**Explanation:**
- const qualifier on return type is redundant and ignored
- Prvalues are never const
- RVO/mandatory elision applies normally
- std::string("Hello") constructed directly in s
- const return type is obsolete C++ practice (pre-move semantics)
- **Key Concept:** const on return by-value is meaningless; RVO applies regardless

#### Q14
```cpp
struct Counter {
    static int count;
    Counter() { ++count; }
    Counter(const Counter&) { ++count; }
    Counter(Counter&&) { ++count; }
};
int Counter::count = 0;

Counter create() {
    return Counter();
}

int main() {
    Counter c = create();
    std::cout << Counter::count;
}
// What number is printed in C++17?
```

**Answer:**
```
1
```

**Explanation:**
- Mandatory elision: Counter() constructed directly in c
- Only default constructor called, count incremented once
- No copy/move constructors called
- Pre-C++17 would print 2 (construct + move)
- Demonstrates efficiency of mandatory elision
- **Key Concept:** C++17 elision reduces constructor calls from multiple to one

#### Q15
```cpp
class Base {
public:
    Base() { std::cout << "B"; }
    Base(Base&&) { std::cout << "BM"; }
};

class Derived : public Base {
public:
    Derived() { std::cout << "D"; }
    Derived(Derived&&) : Base(std::move(static_cast<Base&&>(std::declval<Derived>()))) {
        std::cout << "DM";
    }
};

Derived create() {
    return Derived();
}

int main() {
    Derived d = create();
}
// What is printed?
```

**Answer:**
```
Compilation Error
```

**Explanation:**
- std::declval cannot be used outside unevaluated context
- std::declval triggers static_assert in actual code
- Intended use: decltype(std::declval<T>()) for type traits
- Correct syntax: `Base(std::move(static_cast<Base&>(*this)))`
- With proper code and elision: would print "BD"
- **Key Concept:** std::declval is only for unevaluated contexts (decltype, sizeof)

#### Q16
```cpp
struct S {
    S() { std::cout << "C"; }
    S(S&&) { std::cout << "M"; }
};

S* getPtr() {
    static S s = S();
    return &s;
}

int main() {
    S* ptr = getPtr();
}
// What is printed?
```

**Answer:**
```
C
```

**Explanation:**
- `static S s = S();` initializes static storage
- S() is prvalue, copy elision applies even for static
- Static variable initialized once on first call
- Subsequent calls return same pointer, no construction
- Only prints "C" once in program lifetime
- **Key Concept:** Copy elision applies to static variable initialization

#### Q17
```cpp
class Value {
public:
    Value() { std::cout << "V"; }
    Value(Value&&) { std::cout << "M"; }
};

Value getValue() {
    return Value();
}

int main() {
    const Value& ref = getValue();
    std::cout << "X";
}
// What is printed and why?
```

**Answer:**
```
VX
```

**Explanation:**
- getValue() returns prvalue, elision applies → prints "V"
- const reference binds to temporary, extends its lifetime
- Temporary Value lives until end of scope (after "X")
- "X" printed while reference still valid
- Value destroyed after main exits (not visible)
- **Key Concept:** const reference extends temporary lifetime to end of scope

#### Q18
```cpp
struct S {
    S() { std::cout << "1"; }
    S(const S&) { std::cout << "2"; }
    S(S&&) { std::cout << "3"; }
};

S arr[2] = {S(), S()};
// What is printed?
```

**Answer:**
```
11
```

**Explanation:**
- Array initialization: each S() is prvalue
- Mandatory elision: each S() constructed directly in array element
- arr[0] constructed from S() → prints "1"
- arr[1] constructed from S() → prints "1"
- No copy/move constructors called
- **Key Concept:** Elision applies to aggregate initialization

#### Q19
```cpp
class Widget {
public:
    Widget() { std::cout << "C"; }
    Widget(Widget&&) { std::cout << "M"; }
};

std::pair<Widget, Widget> getPair() {
    return std::make_pair(Widget(), Widget());
}

int main() {
    auto [w1, w2] = getPair();
}
// What is printed in C++17?
```

**Answer:**
```
CCMM
```

**Explanation:**
- make_pair(Widget(), Widget()): constructs 2 Widgets → prints "CC"
- Widgets moved into pair members → prints "MM"
- Structured binding extracts from pair (no additional moves)
- Elision applies to temporaries but pair construction requires moves
- Total: 2 constructions + 2 moves
- **Key Concept:** Elision has limits; aggregate types may require moves

#### Q20
```cpp
struct S {
    S() { std::cout << "S"; }
    S(S&&) { std::cout << "M"; }
};

S getS() try {
    return S();
} catch (...) {
    throw;
}

int main() {
    S s = getS();
}
// What is printed?
```

**Answer:**
```
S
```

**Explanation:**
- Function-try-block doesn't affect elision
- return S() is prvalue, mandatory elision applies
- S() constructed directly in s → prints "S"
- catch block never executed (no exception thrown)
- Elision applies regardless of try-catch blocks
- **Key Concept:** Copy elision works with function-try-blocks

---

