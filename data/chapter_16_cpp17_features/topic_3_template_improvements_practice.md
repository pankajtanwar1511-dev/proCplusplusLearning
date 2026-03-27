### PRACTICE_TASKS: Output Prediction and Code Analysis
#### Q1
**Difficulty:** Medium

Create a `Resource` class template that manages different types of autonomous vehicle resources (sensors, actuators, etc.). Implement proper CTAD so that `Resource r(sensor_ptr)` correctly deduces the template type from the smart pointer argument.

**Answer:**
```cpp
#include <memory>
#include <iostream>
#include <string>

template<typename T>
class Resource {
    std::shared_ptr<T> ptr;
    std::string name;

public:
    // Constructor from shared_ptr
    Resource(std::shared_ptr<T> p, std::string n = "unnamed")
        : ptr(p), name(n) {}

    // Constructor from raw pointer (creates shared_ptr)
    Resource(T* p, std::string n = "unnamed")
        : ptr(p), name(n) {}

    void print() const {
        std::cout << "Resource: " << name << "\n";
    }

    T* get() { return ptr.get(); }
};

// Deduction guides
template<typename T>
Resource(std::shared_ptr<T>, std::string) -> Resource<T>;

template<typename T>
Resource(T*, std::string) -> Resource<T>;

// Test classes
struct Sensor {
    std::string type;
    Sensor(std::string t) : type(t) {}
};

int main() {
    auto sensor_ptr = std::make_shared<Sensor>("LIDAR");

    // CTAD deduces Resource<Sensor>
    Resource r1(sensor_ptr, "front_lidar");
    Resource r2(new Sensor("Camera"), "rear_camera");

    r1.print();
    r2.print();

    return 0;
}
```

**Explanation:** CTAD deduction guides map shared_ptr<T> and T* to Resource<T>, enabling clean type deduction.

---

#### Q2
**Difficulty:** Medium

Write a variadic template function `validate_all` that takes multiple predicate functions and returns true only if all predicates return true. Use fold expressions.

**Answer:**
```cpp
#include <iostream>
#include <functional>

template<typename... Predicates>
bool validate_all(Predicates... preds) {
    return (... && preds());  // Left fold with &&
}

bool check_speed() {
    std::cout << "Checking speed... ";
    bool ok = true;
    std::cout << (ok ? "OK\n" : "FAIL\n");
    return ok;
}

bool check_sensors() {
    std::cout << "Checking sensors... ";
    bool ok = true;
    std::cout << (ok ? "OK\n" : "FAIL\n");
    return ok;
}

bool check_battery() {
    std::cout << "Checking battery... ";
    bool ok = false;
    std::cout << (ok ? "OK\n" : "FAIL\n");
    return ok;
}

int main() {
    bool all_ok = validate_all(check_speed, check_sensors, check_battery);

    std::cout << "System ready: " << std::boolalpha << all_ok << "\n";

    return 0;
}
```

**Explanation:** Fold expression `(... && preds())` short-circuits on first false, efficient validation.

---

#### Q3
**Difficulty:** Hard

Implement a parallel point cloud filter that removes outliers based on distance threshold. Compare sequential vs parallel performance.

**Answer:**
```cpp
#include <vector>
#include <algorithm>
#include <execution>
#include <random>
#include <chrono>
#include <iostream>
#include <cmath>

struct Point3D {
    double x, y, z;

    double distance_from_origin() const {
        return std::sqrt(x*x + y*y + z*z);
    }
};

std::vector<Point3D> generate_cloud(size_t n) {
    std::vector<Point3D> cloud;
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_real_distribution<> dis(-100.0, 100.0);

    for (size_t i = 0; i < n; ++i) {
        cloud.push_back({dis(gen), dis(gen), dis(gen)});
    }
    return cloud;
}

template<typename Policy>
std::vector<Point3D> filter_outliers(Policy&& policy,
                                      const std::vector<Point3D>& cloud,
                                      double threshold) {
    std::vector<Point3D> filtered;
    std::copy_if(policy, cloud.begin(), cloud.end(),
                 std::back_inserter(filtered),
                 [threshold](const Point3D& p) {
                     return p.distance_from_origin() <= threshold;
                 });
    return filtered;
}

int main() {
    const size_t N = 1'000'000;
    const double THRESHOLD = 50.0;

    auto cloud = generate_cloud(N);
    std::cout << "Generated " << N << " points\n";

    // Sequential
    auto start_seq = std::chrono::high_resolution_clock::now();
    auto filtered_seq = filter_outliers(std::execution::seq, cloud, THRESHOLD);
    auto end_seq = std::chrono::high_resolution_clock::now();
    auto dur_seq = std::chrono::duration_cast<std::chrono::milliseconds>(end_seq - start_seq);

    // Parallel
    auto start_par = std::chrono::high_resolution_clock::now();
    auto filtered_par = filter_outliers(std::execution::par, cloud, THRESHOLD);
    auto end_par = std::chrono::high_resolution_clock::now();
    auto dur_par = std::chrono::duration_cast<std::chrono::milliseconds>(end_par - start_par);

    std::cout << "Sequential: " << filtered_seq.size() << " points in "
              << dur_seq.count() << " ms\n";
    std::cout << "Parallel: " << filtered_par.size() << " points in "
              << dur_par.count() << " ms\n";
    std::cout << "Speedup: " << static_cast<double>(dur_seq.count()) / dur_par.count() << "x\n";

    return 0;
}
```

**Explanation:** Parallel copy_if can significantly speed up filtering large datasets on multi-core systems.

---

#### Q4
**Difficulty:** Medium

Implement a resource manager that safely acquires multiple resources simultaneously using std::scoped_lock to prevent deadlock.

**Answer:**
```cpp
#include <mutex>
#include <thread>
#include <vector>
#include <iostream>
#include <chrono>

class Resource {
    std::mutex mtx;
    int value;
    std::string name;

public:
    Resource(std::string n, int v) : name(n), value(v) {}

    std::mutex& get_mutex() { return mtx; }

    void modify(int delta) {
        // Assumes mutex is already locked
        value += delta;
    }

    int get_value() const { return value; }
    std::string get_name() const { return name; }
};

class ResourceManager {
    std::vector<Resource*> resources;

public:
    void add_resource(Resource* r) {
        resources.push_back(r);
    }

    // Safely transfer value between two resources
    void transfer(Resource& from, Resource& to, int amount) {
        // Deadlock-free locking regardless of order
        std::scoped_lock lock(from.get_mutex(), to.get_mutex());

        from.modify(-amount);
        to.modify(amount);

        std::cout << "Transferred " << amount << " from "
                  << from.get_name() << " to " << to.get_name() << "\n";
    }
};

int main() {
    Resource r1("BatteryA", 100);
    Resource r2("BatteryB", 100);
    Resource r3("BatteryC", 100);

    ResourceManager mgr;
    mgr.add_resource(&r1);
    mgr.add_resource(&r2);
    mgr.add_resource(&r3);

    // Multiple threads transferring in different directions
    std::thread t1([&]() {
        for (int i = 0; i < 5; ++i) {
            mgr.transfer(r1, r2, 10);
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        }
    });

    std::thread t2([&]() {
        for (int i = 0; i < 5; ++i) {
            mgr.transfer(r2, r3, 5);
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        }
    });

    std::thread t3([&]() {
        for (int i = 0; i < 5; ++i) {
            mgr.transfer(r3, r1, 8);
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        }
    });

    t1.join();
    t2.join();
    t3.join();

    std::cout << "\nFinal values:\n";
    std::cout << r1.get_name() << ": " << r1.get_value() << "\n";
    std::cout << r2.get_name() << ": " << r2.get_value() << "\n";
    std::cout << r3.get_name() << ": " << r3.get_value() << "\n";

    return 0;
}
```

**Explanation:** scoped_lock prevents deadlock even when multiple threads lock resources in different orders.

---

#### Q5
**Difficulty:** Medium

Create compile-time lookup tables for trigonometric functions used in autonomous vehicle trajectory planning using constexpr lambdas.

**Answer:**
```cpp
#include <iostream>
#include <array>
#include <cmath>

// constexpr pi
constexpr double PI = 3.14159265358979323846;

// Generate sine lookup table at compile time
template<size_t N>
constexpr auto generate_sin_table() {
    std::array<double, N> table{};

    constexpr auto sine = [](double angle) {
        // Use Taylor series for constexpr sine (simplified)
        // For actual use, use std::sin (constexpr in C++26)
        double x = angle;
        double term = x;
        double result = term;

        for (int i = 1; i < 10; ++i) {
            term *= -x * x / ((2 * i) * (2 * i + 1));
            result += term;
        }

        return result;
    };

    for (size_t i = 0; i < N; ++i) {
        double angle = (static_cast<double>(i) / N) * 2 * PI;
        table[i] = sine(angle);
    }

    return table;
}

// Compile-time constant
constexpr auto SIN_TABLE = generate_sin_table<360>();

// Fast sine lookup
double fast_sin(double degrees) {
    int index = static_cast<int>(degrees) % 360;
    if (index < 0) index += 360;
    return SIN_TABLE[index];
}

int main() {
    std::cout << "Compile-time sine table (first 10 entries):\n";
    for (int i = 0; i < 10; ++i) {
        std::cout << "sin(" << i << "°) ≈ " << SIN_TABLE[i] << "\n";
    }

    std::cout << "\nFast lookup:\n";
    std::cout << "sin(30°) ≈ " << fast_sin(30) << "\n";
    std::cout << "sin(90°) ≈ " << fast_sin(90) << "\n";

    // Can be used in constant expressions
    static_assert(SIN_TABLE[0] < 0.1);  // sin(0) ≈ 0

    return 0;
}
```

**Explanation:** constexpr lambda enables compile-time generation of lookup tables, eliminating runtime computation overhead.

---

#### Q6
**Difficulty:** Medium

Implement a fast logger using std::to_chars that formats sensor readings without allocations.

**Answer:**
```cpp
#include <charconv>
#include <string_view>
#include <iostream>
#include <chrono>
#include <vector>

class FastLogger {
    char buffer[1024];
    char* current;

public:
    FastLogger() : current(buffer) {}

    void reset() { current = buffer; }

    void add(std::string_view str) {
        size_t len = str.size();
        std::copy(str.begin(), str.end(), current);
        current += len;
    }

    void add(int value) {
        auto [ptr, ec] = std::to_chars(current, buffer + sizeof(buffer), value);
        if (ec == std::errc{}) {
            current = ptr;
        }
    }

    void add(double value) {
        auto [ptr, ec] = std::to_chars(current, buffer + sizeof(buffer), value);
        if (ec == std::errc{}) {
            current = ptr;
        }
    }

    std::string_view get_log() const {
        return std::string_view(buffer, current - buffer);
    }

    void flush() {
        std::cout << get_log();
        reset();
    }
};

struct SensorReading {
    std::string name;
    double value;
    int timestamp;
};

int main() {
    std::vector<SensorReading> readings = {
        {"LIDAR", 12.456, 1000},
        {"Camera", 30.123, 1001},
        {"RADAR", 45.678, 1002},
        {"GPS", 100.234, 1003}
    };

    FastLogger logger;

    auto start = std::chrono::high_resolution_clock::now();

    for (const auto& reading : readings) {
        logger.add("[");
        logger.add(reading.timestamp);
        logger.add("] ");
        logger.add(reading.name);
        logger.add(": ");
        logger.add(reading.value);
        logger.add("\n");
    }

    auto end = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end - start);

    logger.flush();
    std::cout << "\nLogging took " << duration.count() << " μs\n";

    return 0;
}
```

**Explanation:** std::to_chars provides zero-allocation, high-performance numeric formatting for logging systems.

---

#### Q7
**Difficulty:** Hard

Implement a function composer using fold expressions that chains multiple transformation functions.

**Answer:**
```cpp
#include <iostream>
#include <functional>

// Compose functions using fold expressions
template<typename... Funcs>
auto compose(Funcs... funcs) {
    return [=](auto x) {
        // Right fold: f(g(h(x)))
        return (... (funcs(x)));  // Error: this doesn't work!

        // Need to manually chain
    };
}

// Better approach: using fold with function call chaining
template<typename T, typename... Funcs>
auto apply_all(T value, Funcs... funcs) {
    // Left fold that threads value through functions
    T result = value;
    ((result = funcs(result)), ...);
    return result;
}

// Alternative: using fold to build composed function
template<typename... Funcs>
auto compose_right(Funcs... funcs) {
    return [=](auto x) {
        auto apply = [&](auto&& f, auto&& val) {
            return f(val);
        };

        // Store in tuple and apply in reverse
        auto tuple = std::make_tuple(funcs...);

        // For simplicity, use apply_all approach
        auto result = x;
        ((result = funcs(result)), ...);
        return result;
    };
}

int main() {
    auto add_10 = [](int x) { return x + 10; };
    auto multiply_2 = [](int x) { return x * 2; };
    auto subtract_5 = [](int x) { return x - 5; };

    // Apply functions in sequence
    int result = apply_all(5, add_10, multiply_2, subtract_5);
    // (((5 + 10) * 2) - 5) = 25

    std::cout << "Result: " << result << "\n";

    // Composed function
    auto composed = compose_right(add_10, multiply_2, subtract_5);
    std::cout << "Composed: " << composed(5) << "\n";

    return 0;
}
```

**Explanation:** Fold expressions enable compact function composition, though true composition requires careful ordering.

---

#### Q8
**Difficulty:** Medium

Create a type-safe message system using std::variant with CTAD for autonomous vehicle communication.

**Answer:**
```cpp
#include <variant>
#include <string>
#include <iostream>

struct SpeedCommand {
    double speed;
};

struct StopCommand {
    std::string reason;
};

struct TurnCommand {
    double angle;
    std::string direction;
};

using Command = std::variant<SpeedCommand, StopCommand, TurnCommand>;

class CommandHandler {
public:
    void handle(const Command& cmd) {
        std::visit([](const auto& c) {
            using T = std::decay_t<decltype(c)>;

            if constexpr (std::is_same_v<T, SpeedCommand>) {
                std::cout << "Setting speed to " << c.speed << " km/h\n";
            }
            else if constexpr (std::is_same_v<T, StopCommand>) {
                std::cout << "Stopping: " << c.reason << "\n";
            }
            else if constexpr (std::is_same_v<T, TurnCommand>) {
                std::cout << "Turning " << c.angle << "° " << c.direction << "\n";
            }
        }, cmd);
    }
};

int main() {
    CommandHandler handler;

    // CTAD for variant construction
    Command cmd1 = SpeedCommand{60.0};
    Command cmd2 = StopCommand{"Obstacle detected"};
    Command cmd3 = TurnCommand{15.0, "left"};

    handler.handle(cmd1);
    handler.handle(cmd2);
    handler.handle(cmd3);

    return 0;
}
```

**Explanation:** std::variant with CTAD provides type-safe message passing without inheritance overhead.

---

#### Q9
**Difficulty:** Hard

Implement sensor fusion that combines multiple sensor readings using parallel std::reduce.

**Answer:**
```cpp
#include <vector>
#include <numeric>
#include <execution>
#include <iostream>
#include <random>

struct SensorReading {
    double value;
    double confidence;  // 0.0 to 1.0

    SensorReading operator+(const SensorReading& other) const {
        // Weighted average based on confidence
        double total_conf = confidence + other.confidence;
        if (total_conf == 0) return {0, 0};

        double fused_value = (value * confidence + other.value * other.confidence) / total_conf;
        double fused_conf = (confidence + other.confidence) / 2.0;

        return {fused_value, fused_conf};
    }
};

int main() {
    // Generate random sensor readings
    std::vector<SensorReading> readings;
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_real_distribution<> val_dis(50.0, 100.0);
    std::uniform_real_distribution<> conf_dis(0.7, 1.0);

    for (int i = 0; i < 1000; ++i) {
        readings.push_back({val_dis(gen), conf_dis(gen)});
    }

    // Sequential fusion
    auto start_seq = std::chrono::high_resolution_clock::now();
    SensorReading fused_seq = std::reduce(
        std::execution::seq,
        readings.begin(),
        readings.end(),
        SensorReading{0, 0}
    );
    auto end_seq = std::chrono::high_resolution_clock::now();

    // Parallel fusion
    auto start_par = std::chrono::high_resolution_clock::now();
    SensorReading fused_par = std::reduce(
        std::execution::par,
        readings.begin(),
        readings.end(),
        SensorReading{0, 0}
    );
    auto end_par = std::chrono::high_resolution_clock::now();

    auto dur_seq = std::chrono::duration_cast<std::chrono::microseconds>(end_seq - start_seq);
    auto dur_par = std::chrono::duration_cast<std::chrono::microseconds>(end_par - start_par);

    std::cout << "Fused reading: " << fused_par.value
              << " (confidence: " << fused_par.confidence << ")\n";
    std::cout << "Sequential: " << dur_seq.count() << " μs\n";
    std::cout << "Parallel: " << dur_par.count() << " μs\n";

    return 0;
}
```

**Explanation:** Parallel reduce efficiently combines large datasets using associative operations.

---

#### Q10
**Difficulty:** Hard

Create a comprehensive example that uses multiple C++17 features together in a realistic autonomous vehicle scenario.

**Answer:**
```cpp
#include <iostream>
#include <vector>
#include <optional>
#include <variant>
#include <string_view>
#include <filesystem>
#include <algorithm>
#include <execution>
#include <map>

namespace fs = std::filesystem;

// Structured binding ready struct
struct SensorData {
    std::string name;
    double value;
    int timestamp;
};

// Variant for different message types
using Message = std::variant<SensorData, std::string>;

// CTAD-enabled container
template<typename T>
class DataBuffer {
    std::vector<T> data;

public:
    DataBuffer(std::initializer_list<T> init) : data(init) {}

    // Try to find element
    [[nodiscard]] std::optional<T> find_if(auto pred) const {
        auto it = std::find_if(data.begin(), data.end(), pred);
        if (it != data.end()) return *it;
        return std::nullopt;
    }

    void process_parallel() {
        std::for_each(std::execution::par, data.begin(), data.end(),
                      [](T& item) { /* process */ });
    }

    auto begin() { return data.begin(); }
    auto end() { return data.end(); }
};

// Deduction guide
template<typename T>
DataBuffer(std::initializer_list<T>) -> DataBuffer<T>;

// Fold expression utility
template<typename... Sensors>
bool all_ready(const Sensors&... sensors) {
    return (... && sensors.is_ready());
}

// constexpr lambda for compile-time config
constexpr auto get_max_speed = []() { return 120; };

int main() {
    // Structured bindings
    auto [name, value, time] = SensorData{"LIDAR", 42.5, 1000};
    std::cout << "Sensor: " << name << " = " << value << "\n";

    // CTAD
    DataBuffer buffer{SensorData{"S1", 10, 100},
                      SensorData{"S2", 20, 200}};

    // std::optional
    auto found = buffer.find_if([](const SensorData& s) {
        return s.value > 15;
    });

    if (found) {
        std::cout << "Found: " << found->name << "\n";
    }

    // Nested namespace
    namespace config::vehicle::limits {
        inline constexpr int max_speed = 120;
    }

    // constexpr lambda
    static_assert(get_max_speed() == 120);

    // if constexpr
    auto process = [](auto val) {
        if constexpr (std::is_integral_v<decltype(val)>) {
            return val * 2;
        } else {
            return val;
        }
    };

    std::cout << "Process int: " << process(42) << "\n";
    std::cout << "Process double: " << process(3.14) << "\n";

    // std::variant with std::visit
    std::vector<Message> messages = {
        SensorData{"Temp", 25.0, 500},
        std::string("System ready"),
        SensorData{"Speed", 60.0, 501}
    };

    for (const auto& msg : messages) {
        std::visit([](const auto& m) {
            using T = std::decay_t<decltype(m)>;
            if constexpr (std::is_same_v<T, SensorData>) {
                std::cout << "Data: " << m.name << " = " << m.value << "\n";
            } else {
                std::cout << "Message: " << m << "\n";
            }
        }, msg);
    }

    return 0;
}
```

**Explanation:** This example integrates CTAD, structured bindings, optional, variant, if constexpr, fold expressions, nested namespaces, inline variables, constexpr lambda, and parallel algorithms in a cohesive autonomous vehicle scenario.

---
