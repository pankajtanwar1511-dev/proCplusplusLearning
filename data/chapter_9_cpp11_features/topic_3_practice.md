### PRACTICE_TASKS: Override and Final Scenarios

#### Q1
```cpp
class Base {
    virtual void process() { }
};

class Derived : public Base {
    void proccess() override { }  // Note: typo in name
};
// Does this compile?
```

**Answer:**
```
Compilation error
```

**Explanation:**
- Base has virtual function `process()`
- Derived declares `proccess()` with typo (double 'c')
- `override` keyword enforces matching signature
- No matching virtual function found in Base
- Compilation error: no function to override
- Without `override`, would compile but hide Base function
- `override` catches typos at compile-time
- **Key Concept:** override keyword catches signature mismatches including typos; compile-time safety

---

#### Q2
```cpp
class Base {
    virtual void method() const { }
};

class Derived : public Base {
    void method() override { }
};
// Does this compile?
```

**Answer:**
```
Compilation error
```

**Explanation:**
- Base: `virtual void method() const`
- Derived: `void method()` (missing const)
- const-qualification is part of signature
- Signatures don't match
- override keyword detects mismatch
- Compilation error
- Without override: would hide, not override
- **Fix:** Add const to Derived
  ```cpp
  void method() const override { }
  ```
- **Key Concept:** override checks const-qualification; const is part of function signature

---

#### Q3
```cpp
class Base {
    virtual void func(int x) { }
};

class Derived : public Base {
    void func(long x) override { }
};
// Does this compile?
```

**Answer:**
```
Compilation error
```

**Explanation:**
- Base: parameter type `int`
- Derived: parameter type `long`
- Parameter types differ
- Not an override, would be overload
- override keyword detects mismatch
- Compilation error
- **Fix:** Match parameter type exactly
  ```cpp
  void func(int x) override { }
  ```
- Even compatible types must match exactly
- **Key Concept:** override requires exact parameter type match; no implicit conversions

---

#### Q4
```cpp
class Base {
    void method() { }  // Not virtual
};

class Derived : public Base {
    void method() override { }
};
// Does this compile?
```

**Answer:**
```
Compilation error
```

**Explanation:**
- Base::method() is not virtual
- Cannot override non-virtual function
- override keyword detects error
- Compilation error: nothing to override
- Without override: would hide Base::method()
- **Fix:** Make Base::method() virtual
  ```cpp
  virtual void method() { }
  ```
- override prevents accidentally hiding functions
- **Key Concept:** override only works with virtual functions; catches non-virtual errors

---

#### Q5
```cpp
class Base {
    virtual void method() final { }
};

class Derived : public Base {
    void method() override { }
};
// Does this compile?
```

**Answer:**
```
Compilation error
```

**Explanation:**
- Base::method() marked final
- final prevents further overriding
- Derived attempts to override
- Compilation error: cannot override final
- final seals the virtual function
- No derived class can override
- Used to prevent further customization
- **Key Concept:** final prevents overriding; seals virtual function in inheritance hierarchy

---

#### Q6
```cpp
class Base final {
    virtual void method() { }
};

class Derived : public Base {
};
// Does this compile?
```

**Answer:**
```
Compilation error
```

**Explanation:**
- Base class marked final
- final on class prevents derivation
- Cannot inherit from final class
- Compilation error: cannot derive
- Used to prevent inheritance
- Performance optimization (devirtualization possible)
- Common for leaf classes
- **Key Concept:** final on class prevents all inheritance; seals class hierarchy

---

#### Q7
```cpp
class Base {
    virtual void method() { }
};

class Derived : public Base {
    void method() override final { }
};

class MoreDerived : public Derived {
    void method() override { }
};
// Does this compile?
```

**Answer:**
```
Compilation error
```

**Explanation:**
- Derived::method() marked override final
- override: correctly overrides Base::method()
- final: prevents further overriding
- MoreDerived attempts to override
- Compilation error: cannot override final
- Can combine override and final
- Allows controlled inheritance depth
- **Key Concept:** override final allows overriding once then seals; controls inheritance depth

---

#### Q8
```cpp
class Base {
    virtual ~Base() { }
};

class Derived : public Base {
    ~Derived() override { }
};
// Does this compile and is it good practice?
```

**Answer:**
```
Compiles; good practice in C++11+
```

**Explanation:**
- Virtual destructor can be overridden
- Derived destructor correctly overrides
- override is optional but recommended
- Makes intent explicit
- Catches errors if Base destructor made non-virtual
- **Best practice:** Use override for destructors too
- Ensures polymorphic deletion works correctly
- Compiler verifies virtual inheritance chain
- **Key Concept:** override works with destructors; ensures correct polymorphic destruction

---

#### Q9
```cpp
class Base {
    virtual void method() { }
};

class Derived : public Base {
    virtual void method() final override { }  // Order: final override
};
// Does this compile? Does order matter?
```

**Answer:**
```
Compiles; order doesn't matter
```

**Explanation:**
- Both final and override are valid
- Order is flexible: `final override` or `override final`
- Both compile successfully
- virtual keyword optional in Derived (already virtual)
- Common practice: `override final` (override first)
- Makes it clear: overriding, then sealing
- Stylistic preference
- **Key Concept:** override and final can be combined; order is flexible

---

#### Q10
```cpp
class Interface {
    virtual void method() = 0;
};

class Implementation : public Interface {
    void method() final { }  // No override keyword
};
// Does this compile?
```

**Answer:**
```
Compiles successfully
```

**Explanation:**
- Implements pure virtual function
- override keyword is optional
- final alone is valid
- Implicitly overriding (implementing abstract method)
- final prevents further overriding
- **Best practice:** Use override explicitly
  ```cpp
  void method() override final { }
  ```
- Makes intent clearer
- Catches errors if Interface changes
- **Key Concept:** override is optional but recommended; final alone is valid

---

#### Q11
```cpp
class Base {
    virtual void method() & { }  // Lvalue reference qualifier
};

class Derived : public Base {
    void method() && override { }  // Rvalue reference qualifier
};
// Does this compile?
```

**Answer:**
```
Compilation error
```

**Explanation:**
- Reference qualifiers differ
- Base: & (lvalue reference qualifier)
- Derived: && (rvalue reference qualifier)
- Different reference qualifiers = different signatures
- Not an override
- Compilation error with override keyword
- **Fix:** Match reference qualifier
  ```cpp
  void method() & override { }
  ```
- Reference qualifiers are part of signature
- **Key Concept:** Reference qualifiers must match; part of function signature

---

#### Q12
```cpp
class Base {
    virtual void method() { }
};

class Derived : public Base {
    void method() noexcept override { }
};
// Does this compile?
```

**Answer:**
```
Compiles in C++11-16; deprecated in C++17; error in C++20
```

**Explanation:**
- Base: no noexcept specification
- Derived: noexcept added
- C++11-16: Allowed, weakening exception spec
- Derived more restrictive (noexcept)
- C++17: Deprecated this behavior
- C++20: Compilation error (noexcept part of signature)
- **Modern best practice:** Match exception specs
- **Key Concept:** Exception specs part of signature (C++20); match base class noexcept

---

#### Q13
```cpp
class Base {
    static void method() { }
};

class Derived : public Base {
    static void method() override { }
};
// Does this compile?
```

**Answer:**
```
Compilation error
```

**Explanation:**
- Static functions cannot be virtual
- No polymorphism for static members
- override only works with virtual functions
- Compilation error: static cannot override
- Static methods resolved at compile-time
- Without override: would hide Base::method()
- **Key Concept:** Static functions cannot be virtual or overridden; no polymorphism

---

#### Q14
```cpp
class Base { };

class Derived final : public Base { };

class MoreDerived : public Derived { };
// Does this compile?
```

**Answer:**
```
Compilation error
```

**Explanation:**
- Derived class marked final
- Cannot inherit from final class
- MoreDerived attempts inheritance
- Compilation error
- final prevents any further derivation
- Used for leaf classes
- Performance benefits (no vtable needed)
- **Key Concept:** final class cannot be base; prevents all further inheritance

---

#### Q15
```cpp
class Base {
public:
    virtual Base* create() { return new Base(); }
};

class Derived : public Base {
public:
    Derived* create() override { return new Derived(); }
};
// Does this compile? What concept is this?
```

**Answer:**
```
Compiles; covariant return types
```

**Explanation:**
- Base returns `Base*`
- Derived returns `Derived*`
- Covariant return type: return type can be more derived
- Legal override with more specific return type
- Derived* is-a Base* (compatible)
- Allows type-safe narrowing
- C++ feature for convenience
- **Key Concept:** Covariant return types allow returning more derived type; type-safe override

---

#### Q16
```cpp
class Base {
    virtual void method() = 0;  // Pure virtual
};

class Derived : public Base {
    void method() override final { }
};

Base* ptr = new Derived();
// Is this valid? Can Derived be instantiated?
```

**Answer:**
```
Valid; Derived can be instantiated
```

**Explanation:**
- Base is abstract (has pure virtual)
- Cannot instantiate Base
- Derived implements pure virtual
- Derived is concrete class
- Can instantiate Derived
- `new Derived()` is valid
- Can assign to Base* (polymorphism)
- final prevents further overriding
- **Key Concept:** Implementing pure virtual makes class concrete; can be instantiated

---

#### Q17
```cpp
class Base {
private:
    virtual void method() { }
};

class Derived : public Base {
private:
    void method() override { }
};
// Does this compile? Can private virtual functions be overridden?
```

**Answer:**
```
Compiles; private virtual can be overridden
```

**Explanation:**
- Access specifier doesn't affect overriding
- Private virtual can be overridden
- Derived can override with any access level
- Public, protected, or private in Derived
- NVI pattern (Non-Virtual Interface) uses this
- Public non-virtual calls private virtual
- Allows customization without exposing interface
- **Key Concept:** Access specifiers don't affect virtual override; private virtual is valid pattern

---

#### Q18
```cpp
class Base {
    virtual void method(int x = 10) { }
};

class Derived : public Base {
    void method(int x = 20) override { }
};

Base* ptr = new Derived();
ptr->method();  // Which default value is used?
```

**Answer:**
```
Uses 10 (Base default); calls Derived implementation
```

**Explanation:**
- Default arguments bound at compile-time
- Determined by static type (Base*)
- Uses Base's default: x = 10
- Function dispatch at runtime
- Calls Derived::method() implementation
- Derived::method() receives x = 10 (not 20!)
- Confusing behavior
- **Best practice:** Don't change defaults in overrides
  ```cpp
  void method(int x = 10) override { }  // Match Base
  ```
- **Key Concept:** Default arguments use static type; runtime dispatch uses dynamic type

---

#### Q19
```cpp
class Base {
    virtual void method() { }
};

class Derived : public Base {
    void method() override;  // Declaration only
};

void Derived::method() { }  // Definition outside class
// Is this valid?
```

**Answer:**
```
Valid
```

**Explanation:**
- override in declaration suffices
- Definition outside class doesn't repeat override
- Only declaration needs override keyword
- Definition just implements
- Common pattern for separating interface/implementation
- override not valid in out-of-class definition
- Checked at declaration point
- **Key Concept:** override only in declaration; out-of-class definition doesn't repeat

---

#### Q20
```cpp
class Base {
    virtual void method() final = 0;  // Pure virtual and final
};

class Derived : public Base {
    void method() override { }
};
// Does this compile?
```

**Answer:**
```
Compilation error
```

**Explanation:**
- method() is both pure virtual and final
- Contradictory: requires implementation but prohibits overriding
- Derived cannot provide implementation
- Compilation error: cannot override final
- Logically impossible to satisfy
- Base remains abstract forever
- Cannot be instantiated
- **Key Concept:** final = 0 is contradictory; cannot require and prohibit implementation

---
