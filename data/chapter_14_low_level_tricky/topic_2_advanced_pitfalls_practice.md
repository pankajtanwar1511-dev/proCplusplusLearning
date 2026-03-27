## TOPIC: Advanced C++ Pitfalls - Compiler Optimizations, UB, and Modern C++ Traps

### PRACTICE_TASKS: Code Analysis and Prediction

#### Q1
```cpp
#include <iostream>

int search(int* arr, int size, int target) {
    for (int i = 0; i <= size; ++i) {  // Note: <= size
        if (arr[i] == target) {
            return i;
        }
    }
    return -1;
}

int main() {
    int data[] = {1, 2, 3, 4, 5};
    std::cout << search(data, 5, 10) << "\n";
}

// What can the optimizer do to this code?
```

#### Q2
```cpp
void process(int* ptr) {
    int value = *ptr;

    // ... 100 lines of code using value ...

    if (ptr == nullptr) {
        std::cerr << "Error: null pointer\n";
        return;
    }

    std::cout << "Value: " << value << "\n";
}

// Is the null check effective? Why or why not?
```

#### Q3
```cpp
class Data {
    std::vector<int> vec;
public:
    Data(Data&& other)
        : vec(other.vec)  // Move constructor
    {}
};

// Does this actually move the vector? Explain.
```

#### Q4
```cpp
template<typename T>
void forward_call(T&& arg) {
    func(arg);
}

void func(std::vector<int>&& v) {
    std::cout << "Rvalue\n";
}

void func(const std::vector<int>& v) {
    std::cout << "Lvalue\n";
}

int main() {
    forward_call(std::vector<int>{1, 2, 3});
}

// What is printed? Why?
```

#### Q5
```cpp
constexpr int compute(int x) {
    return x * x + 10;
}

consteval int compute_compile(int x) {
    return x * x + 10;
}

int main() {
    int runtime_value = 5;
    std::cin >> runtime_value;

    int a = compute(runtime_value);
    int b = compute_compile(runtime_value);

    std::cout << a << " " << b << "\n";
}

// Does this compile? Which lines have issues?
```

#### Q6
```cpp
bool check_overflow(int x, int y) {
    int sum = x + y;
    if (sum < x) {
        return true;  // Overflow detected
    }
    return false;
}

int main() {
    std::cout << check_overflow(INT_MAX, 10) << "\n";
}

// With -O3 optimization, what does this print?
```

#### Q7
```cpp
template<typename T>
class Container {
public:
    void process(T&& item) {
        // Process item
    }
};

int main() {
    Container<int> c;
    int x = 42;
    c.process(x);  // Does this compile?
}
```

#### Q8
```cpp
const Widget make_widget() {
    Widget w;
    // ... initialize w ...
    return w;
}

Widget w = make_widget();

// Is move constructor or copy constructor called for w?
```

#### Q9
```cpp
template<typename T>
void call_func(T&& arg) {
    func(std::forward<T>(arg));
}

void func(std::vector<int> v) {
    std::cout << "Received: " << v.size() << "\n";
}

int main() {
    call_func({1, 2, 3, 4, 5});
}

// Does this compile? Why or why not?
```

#### Q10
```cpp
constinit int counter = 0;

void increment() {
    counter++;
}

int main() {
    increment();
    std::cout << counter << "\n";
}

// Is this valid? What guarantees does constinit provide?
```

---
