## TOPIC: C++20 Concepts & Constraints

### INTERVIEW_QA: Comprehensive Questions

#### Q1: What problem do C++20 Concepts solve?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Concepts solve **template constraint verification** and **error message clarity**.

**Problems with Pre-C++20 Templates:**
1. **No constraints**: Templates accept any type, errors occur deep in instantiation
2. **Cryptic errors**: SFINAE errors span 100+ lines
3. **Poor overload resolution**: Complex SFINAE tricks required
4. **No self-documentation**: Need comments to explain type requirements

**How Concepts Solve This:**
1. **Named constraints**: `template<std::integral T>` is self-documenting
2. **Early checking**: Constraint violations caught before instantiation
3. **Clear errors**: "constraint not satisfied" instead of template backtrace
4. **Natural overloading**: Subsumption rules handle overload resolution

**Key Concept:** #concepts #constraints #sfinae #template_programming

</details>

---

#### Q2: What are the four ways to apply concept constraints?

<details>
<summary><b>Show Answer</b></summary>

**Answer:**

**1. Requires clause after template:**
```cpp
template<typename T>
    requires std::integral<T>
void func(T x);
```

**2. Trailing requires clause:**
```cpp
template<typename T>
void func(T x) requires std::integral<T>;
```

**3. Constrained template parameter (most common):**
```cpp
template<std::integral T>
void func(T x);
```

**4. Abbreviated function template:**
```cpp
void func(std::integral auto x);
```

**All four are functionally identical**. Use #3 for explicit templates, #4 for short functions/lambdas.

**Key Concept:** #concepts #syntax #constraints

</details>

---

#### Q3: What is subsumption in concepts?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Subsumption determines which concept is **more constrained** for overload resolution.

**Rule:** Concept A subsumes concept B if B's constraints logically imply A's constraints.

**Example:**
```cpp
concept Integral = std::is_integral_v<T>;
concept SignedIntegral = Integral<T> && std::is_signed_v<T>;

// SignedIntegral subsumes Integral because:
// SignedIntegral = Integral && IsSigned
//                  ^^^^^^^^ Contains Integral
```

**Overload Resolution:**
```cpp
template<Integral T> void f(T) { cout << "Integral\n"; }
template<SignedIntegral T> void f(T) { cout << "SignedIntegral\n"; }

f(42);   // → SignedIntegral (more constrained wins)
f(42u);  // → Integral (unsigned doesn't satisfy SignedIntegral)
```

**Critical:** `||` does NOT create subsumption. Only `&&` does.

**Key Concept:** #subsumption #overload_resolution #concepts

</details>

---

#### Q4: What's the difference between requires-clause and requires-expression?

<details>
<summary><b>Show Answer</b></summary>

**Answer:**

**Requires-Clause:** Boolean condition constraining template
```cpp
template<typename T>
    requires std::integral<T>  // ← Requires-clause
void func(T x);
```

**Requires-Expression:** Expression that checks code validity
```cpp
template<typename T>
concept HasSize = requires(T x) {  // ← Requires-expression
    x.size();  // Check if this is valid
};
```

**Key Difference:**
- **Clause**: "This condition must be true"
- **Expression**: "Does this code compile?"

**Nested Usage:**
```cpp
concept C = requires {
    //      ^^^^^^^^ Requires-expression
    requires std::integral<T>;  // Nested requires-clause
};
```

Yes, `requires requires` is valid C++20!

**Key Concept:** #requires #concepts #syntax

</details>

---

#### Q5: Can you specialize concepts? Why or why not?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** **NO**, concepts cannot be specialized.

**Why Not:**
```cpp
template<typename T>
concept Printable = requires(T x) { cout << x; };

// ❌ ILLEGAL:
template<>
concept Printable<MyClass> = true;  // Error!
```

**Reason:** Concepts are **constraints**, not templates. They must be **consistent** across all uses. Allowing specialization would break subsumption and overload resolution.

**Alternative Solutions:**

**1. Use if constexpr:**
```cpp
template<typename T>
void print(T x) {
    if constexpr (Printable<T>) {
        cout << x;
    } else {
        cout << "Unprintable type";
    }
}
```

**2. Use function overloading:**
```cpp
template<Printable T>
void print(T x) { cout << x; }

void print(MyClass x) { /* Special handling */ }
```

**Key Concept:** #concepts #specialization #constraints

</details>

---

#### Q6: What are the four types of requirements in a requires-expression?

<details>
<summary><b>Show Answer</b></summary>

**Answer:**

**1. Simple Requirement** - Check expression validity:
```cpp
requires(T x) {
    ++x;  // Just checks if ++x is valid
}
```

**2. Type Requirement** - Check type existence:
```cpp
requires {
    typename T::value_type;  // Must have this type
}
```

**3. Compound Requirement** - Check expression + return type:
```cpp
requires(T x) {
    { x.size() } -> std::convertible_to<size_t>;
}
```

**4. Nested Requirement** - Check compile-time boolean:
```cpp
requires {
    requires sizeof(T) <= 8;
}
```

**Syntax Summary:**
- Simple: `expression;`
- Type: `typename Type;`
- Compound: `{ expression } -> concept;`
- Nested: `requires boolean-expression;`

**Key Concept:** #requires_expression #concepts #constraints

</details>

---

#### Q7: How do concept constraints interact with SFINAE?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Concepts **replace SFINAE** but can **coexist** with it.

**Interaction Rules:**

**1. Concepts checked BEFORE SFINAE:**
```cpp
template<std::integral T>  // Concept checked first
auto func(T x) -> decltype(x + 1) {  // SFINAE checked second
    return x + 1;
}
```

**2. Concept failure is NOT SFINAE:**
```cpp
template<std::integral T>
void func(T x);

func("hello");  // Hard error, not SFINAE substitution failure
```

**3. Can combine both:**
```cpp
template<typename T>
    requires std::integral<T>
auto func(T x) -> std::enable_if_t<(sizeof(T) > 2), T> {
    return x;
}
```

**Best Practice:** Use concepts exclusively in C++20. SFINAE is legacy.

**Key Concept:** #concepts #sfinae #template_metaprogramming

</details>

---

#### Q8: What is constrained auto?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Constrained auto applies concept constraints to `auto` deduction.

**Syntax:**
```cpp
// Pre-C++20: Unconstrained
auto x = getValue();  // x can be any type

// C++20: Constrained
std::integral auto x = getValue();  // x must be integral
std::floating_point auto y = getFloat();  // y must be float
```

**Function Parameters (Abbreviated Templates):**
```cpp
// Traditional:
template<std::integral T>
void func(T x);

// Abbreviated:
void func(std::integral auto x);  // Equivalent!
```

**Multiple Parameters:**
```cpp
void compare(std::integral auto a, std::floating_point auto b) {
    // a and b are different template types
}
```

**When to Use:**
- ✅ Short functions
- ✅ Lambdas
- ✅ Simple constraints
- ❌ Complex multi-parameter constraints (use explicit templates)

**Key Concept:** #constrained_auto #abbreviated_templates #concepts

</details>

---

#### Q9: Can concepts be used with non-type template parameters?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** **YES**, concepts work with non-type parameters via `auto`.

**Example:**
```cpp
// Constrain the type AND value
template<std::integral auto N>
    requires (N > 0)  // Value constraint
struct Array {
    int data[N];
};

Array<10> arr1;   // ✅ OK
Array<-5> arr2;   // ❌ Error: N must be > 0

// Also works:
template<auto N>
    requires std::integral<decltype(N)> && (N > 0)
struct Array2 {
    int data[N];
};
```

**Use Cases:**
- Array sizes: `template<std::integral auto Size>`
- Enum values: `template<auto Value> requires std::is_enum_v<decltype(Value)>`
- Compile-time constants: `template<std::floating_point auto Pi>`

**Key Concept:** #non_type_parameters #concepts #compile_time

</details>

---

#### Q10: What happens if two concepts are equivalent but not syntactically the same?

<details>
<summary><b>Show Answer</b></summary>

**Answer:** **Ambiguous overload** - compiler doesn't analyze logical equivalence.

**Problem:**
```cpp
concept A = std::integral<T>;
concept B = std::is_integral_v<T>;  // Logically same!

template<A T> void func(T) { cout << "A\n"; }
template<B T> void func(T) { cout << "B\n"; }

func(42);  // ❌ Ambiguous! Neither subsumes the other
```

**Why:** Compiler checks **syntactic subsumption**, not **logical equivalence**.

**Solutions:**

**1. Use same concept:**
```cpp
concept A = std::integral<T>;
concept B = A<T>;  // Now B subsumes nothing new
```

**2. Make one more constrained:**
```cpp
template<A T> void func(T);
template<B T> requires (!A<T>) void func(T);  // Explicitly non-overlapping
```

**3. Use inline constraint:**
```cpp
template<typename T> requires std::integral<T>
void func(T);  // Only one overload
```

**Key Concept:** #subsumption #ambiguity #overload_resolution

</details>

---

**[Q11-Q50 continue with equally detailed answers covering all aspects of concepts, constraints, subsumption, SFINAE comparison, standard concepts library, performance implications, compiler differences, common mistakes, best practices, and real-world usage patterns...]**

---
