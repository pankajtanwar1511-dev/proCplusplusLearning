## TOPIC: C++26 Contracts - Preconditions, Postconditions, and Assertions

### PRACTICE_TASKS: Contract Scenarios and Code Analysis

#### Q1
```cpp
int find_first_negative(const std::vector<int>& v)
    pre(!v.empty())
    post(r: r == -1 || r < 0)
{
    for (int x : v) {
        if (x < 0) {
            return x;
        }
    }
    return v.front();  // Bug: falls through here if nothing is negative!
}
```

**Answer:**
```
Postcondition violation when v contains no negative values and v.front() >= 0
```

**Explanation:**
- The author meant "return -1 if nothing negative is found"
- Instead, the fallthrough returns `v.front()`, which may be non-negative
- `post(r: r == -1 || r < 0)` fires on **every** return path, including this one
- If `v = {5, 10, 3}`, the function returns `3`, violating the postcondition
- **Key Concept:** A postcondition attached to a declaration is checked on every exit path automatically — a bug that only a full-coverage test (not just the "happy path") would otherwise catch

**Fixed Version:**
```cpp
int find_first_negative(const std::vector<int>& v)
    pre(!v.empty())
    post(r: r == -1 || r < 0)
{
    for (int x : v) {
        if (x < 0) {
            return x;
        }
    }
    return -1;  // Now every exit path satisfies the postcondition
}
```

---

#### Q2
```cpp
void append_unique(std::vector<int>& v, int value)
    pre(std::find(v.begin(), v.end(), value) == v.end())  // Bug: value already appended below!
{
    v.push_back(value);
    // caller mutates value here in some versions... but the real bug is timing:
}

int main() {
    std::vector<int> data = {1, 2, 3};
    append_unique(data, 2);  // 2 is already present
}
```

**Answer:**
```
Precondition "2 is not already in v" is false at the call -> violation under enforce/observe
```

**Explanation:**
- `pre(...)` is evaluated **before** the body runs, using the state of `v` at the call
- `data` already contains `2`, so `std::find(...) == v.end()` is `false`
- Under `enforce`, the violation handler runs and the program terminates before `push_back` executes
- Under `ignore`, the check never runs at all, and `push_back` silently inserts a duplicate
- **Key Concept:** A precondition only ever inspects state as it exists at the moment of the call — it is not a promise about what the function itself is about to do

**Fixed Version:**
```cpp
void append_unique(std::vector<int>& v, int value)
    pre(std::find(v.begin(), v.end(), value) == v.end())
{
    v.push_back(value);
}

int main() {
    std::vector<int> data = {1, 2, 3};
    append_unique(data, 4);  // Only call it with values not already present
}
```

---

#### Q3
```cpp
bool try_register(Registry& reg, int id)
    pre(reg.register_id(id))  // Bug: register_id() both registers AND reports success!
{
    return true;
}
```

**Answer:**
```
Under "ignore" semantics, id is never registered at all -- register_id() never runs
```

**Explanation:**
- `register_id(id)` performs the actual registration as a side effect *and* returns whether it succeeded
- Embedding it directly inside `pre(...)` means its execution depends on the active semantic
- Under `enforce`/`observe`: `register_id(id)` runs as part of evaluating the precondition
- Under `ignore`: the entire expression is skipped — `id` is silently never registered
- **Key Concept:** A contract-assertion expression must not have a side effect the program depends on; `ignore` semantics guarantee the expression is never evaluated at all

**Fixed Version:**
```cpp
bool try_register(Registry& reg, int id) {
    bool ok = reg.register_id(id);  // Side effect happens unconditionally, as an ordinary statement
    contract_assert(ok);            // Now purely a check -- safe to skip under "ignore"
    return ok;
}
```

---

#### Q4
```cpp
double average(const std::vector<double>& values) {
    double sum = 0.0;
    for (double v : values) sum += v;
    assert(!values.empty());  // Bug: written AFTER the loop already ran on possibly-empty input
    return sum / values.size();
}
```

**Answer:**
```
No crash on empty input under NDEBUG; division by values.size() == 0 -> UB/NaN either way
```

**Explanation:**
- Placing `assert()` after the loop doesn't protect anything -- the loop already executed
- Under `NDEBUG`, the assert is compiled out entirely and never even reports the problem
- This is exactly the class of bug `pre(...)` is meant to eliminate by moving the check to the declaration, evaluated before the body runs
- **Key Concept:** An `assert()` (or `contract_assert`) placed after the code it was meant to guard provides no protection; a true precondition must be checked before the body executes, which is precisely what `pre(...)` guarantees by construction

**Fixed Version:**
```cpp
double average(const std::vector<double>& values)
    pre(!values.empty())   // Checked before the body runs, guaranteed by the language
{
    double sum = 0.0;
    for (double v : values) sum += v;
    return sum / values.size();
}
```

---

#### Q5
```cpp
struct Shape {
    virtual double area() const
        post(r: r >= 0)
    = 0;
};

struct BuggyCircle : Shape {
    double radius;
    double area() const override {
        return -3.14 * radius * radius;  // Negative on purpose to illustrate the question
    }
};

int main() {
    Shape* s = new BuggyCircle{5.0};
    double a = s->area();  // Is Shape's post(r: r >= 0) checked here?
}
```

**Answer:**
```
Unsettled in the MVP -- whether the base class's postcondition is enforced through an override
is one of the areas the C++26 Contracts MVP deliberately leaves open / restricts
```

**Explanation:**
- Contracts on virtual functions were one of the open questions that helped sink the earlier C++20 contracts attempt
- The MVP is intentionally cautious here rather than fully specifying inherited-contract-checking semantics
- Do not rely on a base class's `post()` being automatically enforced against every override today
- **Key Concept:** Virtual function contracts are explicitly called out as a deliberately unsettled area of the MVP, not a bug in this specific code -- treat it as "implementation-defined / evolving" rather than assuming a guaranteed behavior

*(No single "Fixed Version" applies here -- this task is about recognizing an open design area, not a code defect.)*

---

#### Q6
```cpp
int divide(int a, int b)
    pre(b != 0)
{
    return a / b;
}

int main() {
    int result = divide(10, 0);  // Compiled with contracts semantic = "ignore" for release perf
}
```

**Answer:**
```
Under "ignore": pre(b != 0) is never evaluated -> a / b executes with b == 0 -> undefined behavior
```

**Explanation:**
- `ignore` semantics mean the precondition expression is not evaluated at all -- zero runtime cost, but zero protection
- The division by zero is not "caught" by the contract in this build configuration
- This is expected, documented behavior of `ignore` mode, not a language bug
- **Key Concept:** `ignore` is the C++26 analogue of `NDEBUG` for `assert()` -- maximum performance, but the program is exactly as unprotected as if the contract-assertion were never written

*(No "Fixed Version" needed -- the code is correct; the takeaway is about which build semantic is in effect.)*

---

#### Q7
```cpp
void ensure_capacity(std::vector<char>& buf, size_t n)
    pre(n > 0)
    post(buf.size() >= n)
{
    if (buf.size() < n) {
        buf.resize(n);
    }
}

int main() {
    std::vector<char> b(50);
    ensure_capacity(b, 20);  // b already has capacity -- what happens?
}
```

**Answer:**
```
No violation -- post(buf.size() >= n) holds (50 >= 20), even though the body did nothing
```

**Explanation:**
- `pre(n > 0)` holds: `20 > 0`
- The body's `if` is false (50 is not `< 20`), so `buf` is left untouched at size 50
- `post(buf.size() >= n)` checks `50 >= 20`, which is true
- **No bug here** -- this demonstrates that a postcondition constrains the *result*, not that a specific code path must run
- **Key Concept:** A postcondition is a guarantee about the observable outcome, not a mandate on how the implementation gets there; multiple different internal paths can all satisfy the same contract

*(No "Fixed Version" needed -- correct behavior.)*

---

#### Q8
```cpp
double compute_sqrt(double x)
    pre(x >= 0)
    post(r: r >= 0)
{
    if (x > 1e300) {
        throw std::overflow_error("input too large");
    }
    return std::sqrt(x);
}

int main() {
    try {
        double a = compute_sqrt(1e400);  // Does post(r: r >= 0) get checked here?
    } catch (const std::overflow_error&) {
        // ...
    }
}
```

**Answer:**
```
post(r: r >= 0) is NOT evaluated -- the function exits via an exception, never producing a result 'r'
```

**Explanation:**
- A postcondition binds to the return value on a **normal** return
- Throwing an exception is a different kind of exit -- there is no `r` to check
- `pre(x >= 0)` was already satisfied on entry (`1e400 >= 0` is true), so the precondition is not the issue
- **Key Concept:** A precondition violation and "the function threw instead of returning" are not the same event; `post()` only ever governs the normal-return path, not exceptional exits

*(No "Fixed Version" needed -- this is correct, expected contracts-and-exceptions interaction, not a bug.)*

---

#### Q9
```cpp
int clamp_to_range(int value, int lo, int hi)
    pre(lo <= hi)
    post(r: r >= lo && r <= hi)
{
    if (value < lo) return lo;
    if (value > hi) return value;  // Bug: should return hi, not value, when value > hi!
    return value;
}
```

**Answer:**
```
Postcondition violation when value > hi: returns value (which is > hi), violating r <= hi
```

**Explanation:**
- The second branch was meant to clamp down to `hi`, but returns the unclamped `value` instead
- For `clamp_to_range(100, 0, 10)`: `value(100) > hi(10)` is true, so it returns `100`
- `post(r: r >= lo && r <= hi)` checks `100 >= 0 && 100 <= 10` -- the second half is false
- **Key Concept:** Just like Q1, this is a bug the postcondition is specifically designed to surface at the point of the mistake, rather than silently propagating a wrong value to the caller

**Fixed Version:**
```cpp
int clamp_to_range(int value, int lo, int hi)
    pre(lo <= hi)
    post(r: r >= lo && r <= hi)
{
    if (value < lo) return lo;
    if (value > hi) return hi;   // Correctly clamp to hi
    return value;
}
```

---

#### Q10
```cpp
void log_event(const std::string& message) {
    contract_assert(message.length() < 1000);
    std::cout << message << "\n";
}

int main() {
    std::string huge(5000, 'x');
    log_event(huge);
}
```

**Answer:**
```
Depends entirely on the active semantic: ignore -> nothing happens, message just prints;
observe -> violation handler runs, then message still prints; enforce -> program terminates
before the message is printed
```

**Explanation:**
- `contract_assert` is governed by the same ignore/observe/enforce model as `pre`/`post`, not by `NDEBUG`
- Unlike the old `assert()` macro, there is no single global on/off switch -- the outcome depends on which semantic is configured for this build
- **Key Concept:** `contract_assert` is a real statement participating in the standardized contracts semantic system, so reasoning about "will this fire" requires knowing the build's active semantic, not just whether a macro flag was defined

*(No single "Fixed Version" -- the code is a reasonable use of `contract_assert`; the exercise is understanding semantic-dependent behavior.)*

---
