## TOPIC: C++20 Standard Library Additions - New Tools for Modern Development

### PRACTICE_TASKS: Predict Output

---

#### Q1

`std::span` Behavior

```cpp
#include <span>
#include <vector>
#include <iostream>

int main() {
    std::vector<int> vec = {1, 2, 3, 4, 5};
    std::span<int> s(vec);

    s[2] = 10;

    std::cout << vec[2];
}
```

**Answer:**
```
10
```

**Explanation:** `span` is a view (non-owning reference). Modifying through span modifies the underlying container.

---

#### Q2

`std::format` Width

```cpp
#include <format>
#include <iostream>

int main() {
    std::cout << std::format("{:>10}", 42);
}
```

**Answer:**
```
        42
```

**Explanation:** `{:>10}` means right-align within width 10, so 8 spaces + "42".

---

#### Q3

`std::jthread` Auto-Join

```cpp
#include <thread>
#include <iostream>

void task() {
    std::cout << "Task running\n";
}

int main() {
    {
        std::jthread t(task);
        std::cout << "Scope ending\n";
    }
    std::cout << "After scope\n";
}
```

**Answer:**
```
Task running
Scope ending
After scope
```

**Explanation:** `jthread` automatically joins in destructor before "After scope" prints.

---

#### Q4

`std::popcount` Bit Counting

```cpp
#include <bit>
#include <iostream>

int main() {
    uint8_t value = 0b10110100;
    std::cout << std::popcount(value);
}
```

**Answer:**
```
4
```

**Explanation:** `popcount` counts set bits (1s): four 1-bits in `10110100`.

---

#### Q5

`std::format` Alignment

```cpp
#include <format>
#include <iostream>

int main() {
    std::cout << std::format("{:*<8}", 42);
}
```

**Answer:**
```
42******
```

**Explanation:** `{:*<8}` means left-align (`<`), width 8, fill with `*`. Result: "42" + 6 asterisks.

---

#### Q6

`std::bit_cast` with Same Size

```cpp
#include <bit>
#include <iostream>

int main() {
    float f = 1.0f;
    uint32_t bits = std::bit_cast<uint32_t>(f);
    std::cout << std::hex << bits;
}
```

**Answer:**
```
3f800000
```

**Explanation:** IEEE 754 representation of 1.0f is `0x3F800000`.

---

#### Q7

`std::latch` Countdown

```cpp
#include <latch>
#include <thread>
#include <iostream>

std::latch done(2);

void worker(int id) {
    std::cout << id;
    done.count_down();
}

int main() {
    std::thread t1(worker, 1);
    std::thread t2(worker, 2);

    done.wait();
    std::cout << "Done";

    t1.join();
    t2.join();
}
```

**Answer:**
```
12Done (or 21Done)
```

**Explanation:** Two workers count down, main waits. Order of "1" and "2" is non-deterministic, but "Done" prints after both.

---

#### Q8

`std::erase` Return Value

```cpp
#include <vector>
#include <iostream>

int main() {
    std::vector<int> vec = {1, 2, 3, 2, 4, 2};
    auto removed = std::erase(vec, 2);
    std::cout << removed << " " << vec.size();
}
```

**Answer:**
```
3 3
```

**Explanation:** Removes three 2s. Returns count removed (3). Vector size becomes 3 (elements: 1, 3, 4).

---

#### Q9

`std::source_location` in Function

```cpp
#include <source_location>
#include <iostream>

void log(int val, std::source_location loc = std::source_location::current()) {
    std::cout << loc.line() << " ";
}

int main() {
    log(1);  // Line 10
    log(2);  // Line 11
}
```

**Answer:**
```
10 11
```

**Explanation:** `source_location::current()` captures call site line number. Prints line 10, then line 11.

---

#### Q10

`std::midpoint` Overflow Safe

```cpp
#include <numeric>
#include <iostream>
#include <climits>

int main() {
    int a = INT_MAX;
    int b = INT_MAX - 4;
    std::cout << std::midpoint(a, b);
}
```

**Answer:**
```
2147483645
```

**Explanation:** `midpoint` safely computes `(INT_MAX + (INT_MAX-4)) / 2` without overflow → `INT_MAX - 2`.

---

#### Q11

`std::span` Modification

```cpp
#include <span>
#include <array>
#include <iostream>

int main() {
    std::array<int, 3> arr = {1, 2, 3};
    std::span<int> s(arr);

    for (auto& val : s) {
        val *= 2;
    }

    std::cout << arr[1];
}
```

**Answer:**
```
4
```

**Explanation:** `span` is a view. Modifying through span modifies `arr`. `arr[1]` was 2, now is 4.

---

#### Q12

`std::to_array` Type Deduction

```cpp
#include <array>
#include <iostream>

int main() {
    auto arr = std::to_array({10, 20, 30});
    std::cout << sizeof(arr) << " " << arr.size();
}
```

**Answer:**
```
12 3
```

**Explanation:** Deduced as `std::array<int, 3>`. Size: 3 ints × 4 bytes = 12. Element count: 3.

---

#### Q13

`std::barrier` Reusable

```cpp
#include <barrier>
#include <iostream>

std::barrier sync(1);

int main() {
    for (int i = 0; i < 3; ++i) {
        std::cout << i;
        sync.arrive_and_wait();
    }
}
```

**Answer:**
```
012
```

**Explanation:** `barrier` with 1 thread doesn't block (only thread arrives). Prints 0, 1, 2 sequentially.

---

#### Q14

`std::lerp` Interpolation

```cpp
#include <cmath>
#include <iostream>

int main() {
    double result = std::lerp(0.0, 100.0, 0.25);
    std::cout << result;
}
```

**Answer:**
```
25
```

**Explanation:** Linear interpolation: `0 + 0.25 * (100 - 0)` = 25.

---
