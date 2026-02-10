# Topic 1.2: Nodes & Executors

## THEORY_SECTION

### 1. Node Fundamentals

**What is a ROS2 Node?**

A node is the fundamental computational unit in ROS2. Each node is an independent process that performs specific computation, communicates via topics/services/actions, and can be configured with parameters.

```
Key Properties:
- Unique name within a namespace
- Can have multiple publishers, subscribers, services, actions
- Runs within an executor for callback processing
- Can be lifecycle-managed or simple
- Supports composition for intra-process communication
```

**Node vs Process:**
- One process can contain multiple nodes (composition)
- Each node has independent namespace and name
- Nodes in same process can use zero-copy shared memory communication

**Node Naming:**
```cpp
// Fully Qualified Name (FQN): /namespace/node_name
rclcpp::Node node("camera_driver", "/sensors");
// FQN: /sensors/camera_driver

// Remapping at runtime:
// ros2 run pkg node --ros-args -r __node:=new_name -r __ns:=/new_ns
```

---

### 2. Node Lifecycle Management

**Lifecycle States (Managed Nodes):**

ROS2 provides lifecycle management for controlled state transitions, critical in robotics for graceful startup/shutdown.

```
State Machine:
┌─────────────┐
│ Unconfigured│ ◄─── Initial state
└──────┬──────┘
       │ configure()
       ▼
┌─────────────┐      cleanup()
│  Inactive   │ ◄───────────────┐
└──────┬──────┘                 │
       │ activate()      ┌──────┴──────┐
       ▼                 │   Active    │
┌─────────────┐          └──────┬──────┘
│   Active    │                 │ deactivate()
└──────┬──────┘                 │
       │ shutdown()      ┌──────┴──────┐
       ▼                 │  Finalized  │
┌─────────────┐          └─────────────┘
│  Finalized  │ ◄─── Terminal state
└─────────────┘
```

**State Descriptions:**

| State | Description | Transitions | Use Case |
|-------|-------------|-------------|----------|
| **Unconfigured** | Node exists but not configured | configure() → Inactive | Initial state after construction |
| **Inactive** | Configured but not processing | activate() → Active, cleanup() → Unconfigured | Resources allocated, not running |
| **Active** | Fully operational | deactivate() → Inactive, shutdown() → Finalized | Normal operation |
| **Finalized** | Terminal state | None | Cleanup complete, node shutting down |

**Why Lifecycle Nodes?**

1. **Resource Management**: Allocate expensive resources (cameras, sensors) only when needed
2. **Graceful Degradation**: Deactivate faulty nodes without killing the process
3. **System Coordination**: Ensure all nodes are configured before activation
4. **Testing**: Start nodes in inactive state for testing

**Lifecycle Node Implementation:**

```cpp
#include "rclcpp_lifecycle/lifecycle_node.hpp"

class SensorDriver : public rclcpp_lifecycle::LifecycleNode {
public:
    SensorDriver() : LifecycleNode("sensor_driver") {}

    // Called on configure transition
    CallbackReturn on_configure(const rclcpp_lifecycle::State &) override {
        RCLCPP_INFO(get_logger(), "Configuring sensor...");
        // Allocate resources: open device, allocate buffers
        try {
            sensor_handle_ = open_sensor_device();
            pub_ = create_publisher<SensorMsg>("sensor_data", 10);
            return CallbackReturn::SUCCESS;
        } catch (std::exception &e) {
            RCLCPP_ERROR(get_logger(), "Configuration failed: %s", e.what());
            return CallbackReturn::FAILURE;
        }
    }

    // Called on cleanup transition
    CallbackReturn on_cleanup(const rclcpp_lifecycle::State &) override {
        RCLCPP_INFO(get_logger(), "Cleaning up...");
        // Release resources but keep node alive
        pub_.reset();
        close_sensor_device(sensor_handle_);
        return CallbackReturn::SUCCESS;
    }

    // Called on activate transition
    CallbackReturn on_activate(const rclcpp_lifecycle::State &) override {
        RCLCPP_INFO(get_logger(), "Activating sensor...");
        // Start data acquisition
        pub_->on_activate();  // Lifecycle publisher activation
        timer_ = create_wall_timer(100ms, std::bind(&SensorDriver::read_sensor, this));
        return CallbackReturn::SUCCESS;
    }

    // Called on deactivate transition
    CallbackReturn on_deactivate(const rclcpp_lifecycle::State &) override {
        RCLCPP_INFO(get_logger(), "Deactivating sensor...");
        // Stop data acquisition but keep resources
        timer_->cancel();
        pub_->on_deactivate();  // Stop publishing
        return CallbackReturn::SUCCESS;
    }

    // Called on shutdown transition
    CallbackReturn on_shutdown(const rclcpp_lifecycle::State &) override {
        RCLCPP_INFO(get_logger(), "Shutting down...");
        // Final cleanup
        timer_.reset();
        pub_.reset();
        return CallbackReturn::SUCCESS;
    }

private:
    void read_sensor() {
        // Only called when Active state
        auto msg = read_sensor_data(sensor_handle_);
        pub_->publish(msg);
    }

    void* sensor_handle_;
    rclcpp_lifecycle::LifecyclePublisher<SensorMsg>::SharedPtr pub_;
    rclcpp::TimerBase::SharedPtr timer_;
};
```

**Lifecycle State Transitions:**

```bash
# Command-line lifecycle management
ros2 lifecycle set /sensor_driver configure
ros2 lifecycle set /sensor_driver activate
ros2 lifecycle get /sensor_driver  # Check current state
ros2 lifecycle list /sensor_driver  # Show available transitions
```

---

### 3. Executors: The Callback Processing Engine

**What is an Executor?**

An executor is responsible for:
1. **Polling** DDS for incoming messages/service requests
2. **Selecting** which callbacks to execute
3. **Executing** callbacks in one or more threads
4. **Managing** callback ordering and concurrency

**Executor Types:**

| Executor | Threads | Use Case | Concurrency | Overhead |
|----------|---------|----------|-------------|----------|
| **SingleThreadedExecutor** | 1 | Simple nodes, deterministic execution | None (sequential) | Lowest |
| **MultiThreadedExecutor** | N (configurable) | Concurrent callback processing | High (thread pool) | Medium |
| **StaticSingleThreadedExecutor** | 1 | Memory-constrained, real-time | None | Lowest (no dynamic allocation) |

**SingleThreadedExecutor (Default):**

```cpp
#include "rclcpp/rclcpp.hpp"

int main(int argc, char **argv) {
    rclcpp::init(argc, argv);
    auto node = std::make_shared<MyNode>();

    // Default: SingleThreadedExecutor
    rclcpp::spin(node);  // Equivalent to:

    // rclcpp::executors::SingleThreadedExecutor executor;
    // executor.add_node(node);
    // executor.spin();

    rclcpp::shutdown();
    return 0;
}
```

**Execution Model:**
```
Loop:
1. Wait for DDS events (epoll/select on sockets)
2. Collect all ready callbacks (subscriptions, timers, services)
3. Execute callbacks ONE AT A TIME in arrival order
4. Repeat
```

**Pros:**
- Simple, deterministic
- No race conditions between callbacks
- Minimal overhead

**Cons:**
- Slow callbacks block others (head-of-line blocking)
- Cannot utilize multiple CPU cores
- Bad for mixed latency requirements (fast sensor + slow processing)

---

**MultiThreadedExecutor:**

```cpp
int main(int argc, char **argv) {
    rclcpp::init(argc, argv);
    auto node = std::make_shared<MyNode>();

    // Create executor with 4 worker threads
    rclcpp::executors::MultiThreadedExecutor executor(
        rclcpp::ExecutorOptions(),
        4  // num_threads
    );
    executor.add_node(node);
    executor.spin();

    rclcpp::shutdown();
    return 0;
}
```

**Execution Model:**
```
Thread Pool (4 threads):
1. All threads wait for DDS events
2. When callback ready, ANY available thread picks it up
3. Multiple callbacks execute CONCURRENTLY
4. No ordering guarantees between callbacks
```

**Pros:**
- Parallelism: utilize multiple cores
- No head-of-line blocking: slow callbacks don't block fast ones

**Cons:**
- **Race conditions**: callbacks can run simultaneously
- **Need synchronization**: protect shared state with mutexes
- Higher overhead (thread management, context switching)

**When to Use:**
- Node has expensive, independent callbacks
- Mixing fast (sensor input) and slow (processing) operations
- Need to maximize throughput

---

**StaticSingleThreadedExecutor:**

Optimized version of SingleThreadedExecutor with:
- **No dynamic memory allocation** during spinning
- **Pre-allocated** callback structures
- **Better real-time** performance (no malloc/free)

```cpp
rclcpp::executors::StaticSingleThreadedExecutor executor;
executor.add_node(node);
executor.spin();
```

**Use Case:**
- Real-time systems (avoid non-deterministic allocations)
- Memory-constrained embedded systems
- Safety-critical applications

---

### 4. Callback Groups: Fine-Grained Concurrency Control

**Problem:** With MultiThreadedExecutor, ALL callbacks can run concurrently. But what if:
- Some callbacks must never run simultaneously (access shared state)
- Other callbacks can run in parallel (independent)

**Solution:** Callback Groups

**Two Types:**

1. **MutuallyExclusive (Default)**
   - Callbacks in this group NEVER run simultaneously
   - Acts like a mutex for callbacks
   - Used for callbacks sharing state

2. **Reentrant**
   - Callbacks CAN run simultaneously
   - Must be thread-safe
   - Used for independent operations

**Example: Camera Node with Mixed Callbacks**

```cpp
class CameraNode : public rclcpp::Node {
public:
    CameraNode() : Node("camera_node") {
        // Create callback groups
        mutually_exclusive_group_ = create_callback_group(
            rclcpp::CallbackGroupType::MutuallyExclusive
        );
        reentrant_group_ = create_callback_group(
            rclcpp::CallbackGroupType::Reentrant
        );

        // Timer 1: Fast image capture (50 Hz) - shares camera_buffer_
        // Must be mutually exclusive with image processing
        auto timer_opt = rclcpp::SubscriptionOptions();
        timer_opt.callback_group = mutually_exclusive_group_;

        capture_timer_ = create_wall_timer(
            20ms,
            std::bind(&CameraNode::capture_image, this),
            mutually_exclusive_group_
        );

        // Timer 2: Slow image processing (10 Hz) - shares camera_buffer_
        // Must be mutually exclusive with capture
        process_timer_ = create_wall_timer(
            100ms,
            std::bind(&CameraNode::process_image, this),
            mutually_exclusive_group_
        );

        // Service: Get camera info (independent, fast)
        // Can run in parallel with everything
        auto service_opt = rclcpp::ServiceOptions();
        service_opt.callback_group = reentrant_group_;

        info_service_ = create_service<CameraInfo>(
            "camera_info",
            std::bind(&CameraNode::get_info, this, _1, _2),
            rmw_qos_profile_services_default,
            reentrant_group_
        );
    }

private:
    void capture_image() {
        // Accesses camera_buffer_ - needs exclusive access
        camera_buffer_ = read_from_camera();
        publish_raw_image(camera_buffer_);
    }

    void process_image() {
        // Accesses camera_buffer_ - needs exclusive access
        auto processed = apply_filters(camera_buffer_);
        publish_processed_image(processed);
    }

    void get_info(const Request::SharedPtr req, Response::SharedPtr res) {
        // Independent operation - can run in parallel
        res->width = camera_width_;
        res->height = camera_height_;
    }

    std::vector<uint8_t> camera_buffer_;  // Shared state
    int camera_width_ = 1920;             // Read-only (safe)
    int camera_height_ = 1080;            // Read-only (safe)

    rclcpp::CallbackGroup::SharedPtr mutually_exclusive_group_;
    rclcpp::CallbackGroup::SharedPtr reentrant_group_;
    rclcpp::TimerBase::SharedPtr capture_timer_;
    rclcpp::TimerBase::SharedPtr process_timer_;
};
```

**Execution with MultiThreadedExecutor (4 threads):**

```
Thread 1: capture_image()  ──────────────►
Thread 2:                       process_image() ───────►  (waits for capture to finish)
Thread 3: get_info() ──►  get_info() ──►  get_info() ──►  (runs in parallel)
Thread 4: get_info() ──►  (runs in parallel)

Timeline:
- capture_image() and process_image() NEVER overlap (mutually exclusive)
- get_info() can run ANYTIME, even during capture/process (reentrant)
```

**Key Insight:**
- Default callback group: MutuallyExclusive (safe but limiting)
- Explicitly create Reentrant groups for independent, thread-safe operations
- Use MultiThreadedExecutor to actually get parallelism

---

### 5. Spinning Strategies

**Different ways to process callbacks:**

| Method | Blocking | Use Case |
|--------|----------|----------|
| `spin()` | Yes (infinite loop) | Dedicated ROS2 process |
| `spin_once()` | Yes (single wait) | Custom event loop integration |
| `spin_some()` | No (process ready callbacks) | Non-blocking polling |
| `spin_until_future_complete()` | Yes (until condition) | Synchronous service calls |

**spin() - Standard Approach:**

```cpp
rclcpp::spin(node);  // Blocks forever, processes all callbacks
```

**spin_some() - Non-Blocking:**

```cpp
while (running) {
    executor.spin_some();  // Process ready callbacks, return immediately
    do_other_work();       // Custom logic
    std::this_thread::sleep_for(10ms);
}
```

**spin_until_future_complete() - Synchronous Service Call:**

```cpp
auto client = node->create_client<AddTwoInts>("add_two_ints");
auto request = std::make_shared<AddTwoInts::Request>();
auto future = client->async_send_request(request);

// Block until response received
if (rclcpp::spin_until_future_complete(node, future) ==
    rclcpp::FutureReturnCode::SUCCESS) {
    auto result = future.get();
    RCLCPP_INFO(node->get_logger(), "Result: %ld", result->sum);
}
```

**spin_once() - Custom Control:**

```cpp
rclcpp::WaitSet wait_set;
wait_set.add_subscription(subscription);

while (running) {
    auto wait_result = wait_set.wait(100ms);  // Wait up to 100ms
    if (wait_result.kind() == rclcpp::WaitResultKind::Ready) {
        executor.spin_once();  // Process one callback
    }
}
```

---

### 6. Node Composition: Intra-Process Communication

**Problem:** Traditional ROS2 uses DDS for all communication (even same process):
```
Node A → Serialize → DDS → Deserialize → Node B
        (copy)           (copy)
```

**Solution:** Node composition allows multiple nodes in one process with **zero-copy** communication.

**Benefits:**
1. **Zero-copy** shared memory (no serialization)
2. **Lower latency** (no DDS overhead)
3. **Lower CPU usage** (no copying)
4. **Memory efficiency** (single copy of message)

**How it Works:**

```cpp
// Component-style node (plugin)
class CameraComponent : public rclcpp::Node {
public:
    CameraComponent(const rclcpp::NodeOptions &options)
        : Node("camera", options) {
        pub_ = create_publisher<Image>("image", 10);
        timer_ = create_wall_timer(33ms, [this]() {
            pub_->publish(std::make_unique<Image>());  // Zero-copy!
        });
    }
private:
    rclcpp::Publisher<Image>::SharedPtr pub_;
    rclcpp::TimerBase::SharedPtr timer_;
};

class ProcessorComponent : public rclcpp::Node {
public:
    ProcessorComponent(const rclcpp::NodeOptions &options)
        : Node("processor", options) {
        // Enable intra-process comms
        auto qos = rclcpp::QoS(10).transient_local();
        sub_ = create_subscription<Image>(
            "image", qos,
            [this](Image::UniquePtr msg) {  // UniquePtr = zero-copy!
                process(std::move(msg));
            }
        );
    }
private:
    void process(Image::UniquePtr msg) {
        // msg is moved, not copied!
    }
    rclcpp::Subscription<Image>::SharedPtr sub_;
};

// Register as components
#include "rclcpp_components/register_node_macro.hpp"
RCLCPP_COMPONENTS_REGISTER_NODE(CameraComponent)
RCLCPP_COMPONENTS_REGISTER_NODE(ProcessorComponent)
```

**Composition Container:**

```cpp
int main(int argc, char **argv) {
    rclcpp::init(argc, argv);

    // Single process, multiple nodes
    rclcpp::executors::MultiThreadedExecutor executor;

    auto camera = std::make_shared<CameraComponent>(
        rclcpp::NodeOptions().use_intra_process_comms(true)
    );
    auto processor = std::make_shared<ProcessorComponent>(
        rclcpp::NodeOptions().use_intra_process_comms(true)
    );

    executor.add_node(camera);
    executor.add_node(processor);
    executor.spin();

    rclcpp::shutdown();
    return 0;
}
```

**Command-Line Composition:**

```bash
# Load components dynamically into container
ros2 run rclcpp_components component_container

# In another terminal, load components
ros2 component load /ComponentManager camera_pkg CameraComponent
ros2 component load /ComponentManager processor_pkg ProcessorComponent

# List loaded components
ros2 component list
```

**Intra-Process Requirements:**
1. Use `std::unique_ptr<Msg>` for zero-copy (not `shared_ptr`)
2. Enable `use_intra_process_comms(true)` in NodeOptions
3. Publisher and subscriber in SAME PROCESS
4. Message type must be movable

---

## EDGE_CASES

### Edge Case 1: Callback Deadlock with MutuallyExclusive Group

**Scenario:**
Two callbacks in same MutuallyExclusive group, where one callback triggers the other (e.g., subscription callback calls service).

```cpp
class DeadlockNode : public rclcpp::Node {
public:
    DeadlockNode() : Node("deadlock") {
        auto group = create_callback_group(
            rclcpp::CallbackGroupType::MutuallyExclusive
        );

        // Both in same group!
        sub_ = create_subscription<Int32>(
            "trigger", 10,
            [this](Int32::SharedPtr msg) {
                // This callback holds the mutex
                auto request = std::make_shared<Trigger::Request>();
                auto future = client_->async_send_request(request);

                // DEADLOCK! Service callback can't run because this callback
                // holds the MutuallyExclusive mutex
                rclcpp::spin_until_future_complete(shared_from_this(), future);
            },
            rclcpp::SubscriptionOptions().callback_group = group
        );

        service_ = create_service<Trigger>(
            "my_service",
            [](Request::SharedPtr, Response::SharedPtr res) {
                res->success = true;
            },
            rmw_qos_profile_services_default,
            group  // SAME GROUP = DEADLOCK
        );

        client_ = create_client<Trigger>("my_service");
    }
};
```

**Why Deadlock?**
1. Subscription callback runs (holds MutuallyExclusive mutex)
2. Tries to call service (in same group)
3. Service callback can't run (needs same mutex)
4. `spin_until_future_complete()` waits forever

**Solution:**
```cpp
// Put service in different callback group
auto service_group = create_callback_group(
    rclcpp::CallbackGroupType::MutuallyExclusive
);

service_ = create_service<Trigger>(
    "my_service",
    service_callback,
    rmw_qos_profile_services_default,
    service_group  // Different group!
);
```

**Interview Insight:**
Understanding callback group semantics prevents subtle deadlocks in complex nodes.

---

### Edge Case 2: Timer Overrun with SingleThreadedExecutor

**Scenario:**
Timer callback takes longer than timer period, causing queued callbacks.

```cpp
class TimerOverrun : public rclcpp::Node {
public:
    TimerOverrun() : Node("overrun") {
        // 10 Hz timer (100ms period)
        timer_ = create_wall_timer(100ms, [this]() {
            auto start = std::chrono::steady_clock::now();

            // Slow operation: 250ms (2.5x timer period!)
            expensive_computation();

            auto end = std::chrono::steady_clock::now();
            auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(
                end - start
            ).count();

            RCLCPP_WARN(get_logger(), "Callback took %ld ms", duration);
        });
    }
};
```

**What Happens?**
```
t=0ms:    Timer fires → callback starts
t=100ms:  Timer fires → callback queued (previous still running)
t=200ms:  Timer fires → callback queued
t=250ms:  First callback finishes
t=250ms:  Second callback starts (immediately)
t=500ms:  Second callback finishes
t=500ms:  Third callback starts (immediately)
...
```

**Result:**
- Callbacks run back-to-back with NO spacing
- Effective rate becomes 1 / (callback_duration), not timer period
- Queue builds up if callbacks keep arriving faster than execution

**Detection:**

```cpp
timer_ = create_wall_timer(100ms, [this]() {
    auto now = this->now();
    if (last_execution_.nanoseconds() > 0) {
        auto actual_period = (now - last_execution_).seconds();
        if (actual_period > 0.150) {  // 50% over expected
            RCLCPP_WARN(get_logger(),
                "Timer overrun: actual period %.3f s (expected 0.100 s)",
                actual_period
            );
        }
    }
    last_execution_ = now;

    expensive_computation();
});
```

**Solutions:**

1. **Optimize callback** (make it faster)
2. **Increase timer period** (slower rate)
3. **Use MultiThreadedExecutor** (if callback is independent)
4. **Skip work if overrun:**

```cpp
timer_ = create_wall_timer(100ms, [this]() {
    if (processing_) {
        RCLCPP_WARN_THROTTLE(get_logger(), *get_clock(), 1000,
            "Skipping timer callback, previous still running");
        return;  // Skip this iteration
    }

    processing_ = true;
    expensive_computation();
    processing_ = false;
});
```

---

### Edge Case 3: Lifecycle Transition Failures

**Scenario:**
Lifecycle transition callback fails (returns ERROR), leaving node in unexpected state.

```cpp
CallbackReturn on_configure(const rclcpp_lifecycle::State &) override {
    try {
        camera_handle_ = open_camera("/dev/video0");
        pub_ = create_publisher<Image>("image", 10);
        return CallbackReturn::SUCCESS;
    } catch (CameraException &e) {
        RCLCPP_ERROR(get_logger(), "Failed to open camera: %s", e.what());
        return CallbackReturn::FAILURE;  // Transition fails!
    }
}
```

**What Happens on FAILURE?**

```
State transition: Unconfigured → configure() → FAILURE
Result: Node stays in Unconfigured state

Partial Resource Allocation Risk:
- If pub_ was created before camera open failed
- Publisher exists but node is Unconfigured
- Resource leak!
```

**Best Practice - Atomic Transitions:**

```cpp
CallbackReturn on_configure(const rclcpp_lifecycle::State &) override {
    void* temp_camera = nullptr;
    LifecyclePublisher<Image>::SharedPtr temp_pub;

    try {
        // Allocate resources WITHOUT modifying node state
        temp_camera = open_camera("/dev/video0");
        temp_pub = create_publisher<Image>("image", 10);

        // ALL succeeded → commit to member variables
        camera_handle_ = temp_camera;
        pub_ = temp_pub;

        return CallbackReturn::SUCCESS;

    } catch (std::exception &e) {
        RCLCPP_ERROR(get_logger(), "Configuration failed: %s", e.what());

        // Cleanup temp resources
        if (temp_camera) close_camera(temp_camera);
        temp_pub.reset();

        return CallbackReturn::FAILURE;
    }
}
```

**Error Recovery Pattern:**

```cpp
// Lifecycle state machine supports ERROR state
CallbackReturn on_error(const rclcpp_lifecycle::State & previous_state) override {
    RCLCPP_ERROR(get_logger(), "Entering error recovery from state: %s",
                 previous_state.label().c_str());

    // Cleanup whatever might be partially allocated
    cleanup_all_resources();

    return CallbackReturn::SUCCESS;
}
```

**Interview Insight:**
Lifecycle callbacks must be transactional (all-or-nothing) to avoid partial resource allocation.

---

### Edge Case 4: Intra-Process Communication Fallback

**Scenario:**
Enabling intra-process comms doesn't guarantee zero-copy. Falls back to DDS in certain conditions.

**Conditions Preventing Zero-Copy:**

1. **Shared Ownership:**
```cpp
// Publisher keeps reference
auto msg = std::make_shared<Image>();
fill_image(msg);
pub_->publish(msg);  // Can't move - publisher still has shared_ptr
// Result: Falls back to DDS (serialization + copy)
```

**Solution:**
```cpp
auto msg = std::make_unique<Image>();  // Unique ownership
fill_image(msg.get());
pub_->publish(std::move(msg));  // True zero-copy
```

2. **Multiple Subscribers:**
```cpp
// Two subscribers to same topic in same process
auto sub1 = create_subscription<Image>(...);
auto sub2 = create_subscription<Image>(...);

// Publisher publishes unique_ptr
pub_->publish(std::make_unique<Image>());

// Problem: Can't give unique_ptr to both subscribers!
// Result: First subscriber gets moved message, second gets DDS copy
```

3. **Different QoS Settings:**
```cpp
// Publisher: RELIABLE
pub_ = create_publisher<Image>("image",
    rclcpp::QoS(10).reliable()
);

// Subscriber: BEST_EFFORT
sub_ = create_subscription<Image>("image",
    rclcpp::QoS(10).best_effort(),
    callback
);

// Result: QoS mismatch → falls back to DDS
```

**Detection:**

```cpp
// Check if intra-process is actually being used
pub_ = create_publisher<Image>("image", 10);

if (pub_->get_intra_process_publisher_count() > 0) {
    RCLCPP_INFO(get_logger(), "Intra-process enabled");
} else {
    RCLCPP_WARN(get_logger(), "Falling back to DDS");
}
```

**Interview Insight:**
Intra-process communication requires matching QoS, unique_ptr publishing, and careful ownership management.

---

## CODE_EXAMPLES

### Example 1: Multi-Node System with Different Executor Strategies

**File: `executor_comparison.cpp`**

```cpp
#include "rclcpp/rclcpp.hpp"
#include <chrono>
#include <memory>

using namespace std::chrono_literals;

// Fast sensor node: 100 Hz
class FastSensor : public rclcpp::Node {
public:
    FastSensor() : Node("fast_sensor"), counter_(0) {
        pub_ = create_publisher<std_msgs::msg::Int32>("sensor_data", 100);
        timer_ = create_wall_timer(10ms, std::bind(&FastSensor::publish_data, this));
    }

private:
    void publish_data() {
        auto msg = std_msgs::msg::Int32();
        msg.data = counter_++;
        pub_->publish(msg);
    }

    rclcpp::Publisher<std_msgs::msg::Int32>::SharedPtr pub_;
    rclcpp::TimerBase::SharedPtr timer_;
    int counter_;
};

// Slow processor node: expensive computation
class SlowProcessor : public rclcpp::Node {
public:
    SlowProcessor(int processing_time_ms)
        : Node("slow_processor"), processing_time_(processing_time_ms) {

        sub_ = create_subscription<std_msgs::msg::Int32>(
            "sensor_data", 100,
            std::bind(&SlowProcessor::process, this, std::placeholders::_1)
        );
    }

private:
    void process(std_msgs::msg::Int32::SharedPtr msg) {
        auto start = std::chrono::steady_clock::now();

        RCLCPP_INFO(get_logger(), "Processing message: %d", msg->data);

        // Simulate expensive computation
        std::this_thread::sleep_for(std::chrono::milliseconds(processing_time_));

        auto end = std::chrono::steady_clock::now();
        auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(
            end - start
        ).count();

        RCLCPP_INFO(get_logger(), "Processed in %ld ms", duration);
    }

    rclcpp::Subscription<std_msgs::msg::Int32>::SharedPtr sub_;
    int processing_time_;
};

// Test with SingleThreadedExecutor
void test_single_threaded() {
    RCLCPP_INFO(rclcpp::get_logger("main"),
                "=== Testing SingleThreadedExecutor ===");

    auto fast = std::make_shared<FastSensor>();
    auto slow = std::make_shared<SlowProcessor>(100);  // 100ms processing

    rclcpp::executors::SingleThreadedExecutor executor;
    executor.add_node(fast);
    executor.add_node(slow);

    // Run for 2 seconds
    auto start = std::chrono::steady_clock::now();
    while (std::chrono::steady_clock::now() - start < 2s) {
        executor.spin_some();
    }

    RCLCPP_INFO(rclcpp::get_logger("main"),
                "SingleThreaded: Callbacks executed sequentially, "
                "slow processing blocks fast publisher");
}

// Test with MultiThreadedExecutor
void test_multi_threaded() {
    RCLCPP_INFO(rclcpp::get_logger("main"),
                "=== Testing MultiThreadedExecutor ===");

    auto fast = std::make_shared<FastSensor>();
    auto slow = std::make_shared<SlowProcessor>(100);

    rclcpp::executors::MultiThreadedExecutor executor(
        rclcpp::ExecutorOptions(),
        2  // 2 threads
    );
    executor.add_node(fast);
    executor.add_node(slow);

    // Run for 2 seconds
    auto start = std::chrono::steady_clock::now();
    while (std::chrono::steady_clock::now() - start < 2s) {
        executor.spin_some();
        std::this_thread::sleep_for(10ms);
    }

    RCLCPP_INFO(rclcpp::get_logger("main"),
                "MultiThreaded: Fast publisher runs independently, "
                "not blocked by slow processing");
}

int main(int argc, char **argv) {
    rclcpp::init(argc, argv);

    test_single_threaded();
    std::this_thread::sleep_for(1s);

    test_multi_threaded();

    rclcpp::shutdown();
    return 0;
}
```

**Key Observations:**
- SingleThreaded: Slow callback blocks fast timer (head-of-line blocking)
- MultiThreaded: Callbacks run in parallel, no blocking

---

### Example 2: Lifecycle Node with State Monitoring

**File: `lifecycle_camera.cpp`**

```cpp
#include "rclcpp_lifecycle/lifecycle_node.hpp"
#include "rclcpp_lifecycle/lifecycle_publisher.hpp"
#include "sensor_msgs/msg/image.hpp"
#include <memory>

using CallbackReturn = rclcpp_lifecycle::node_interfaces::LifecycleNodeInterface::CallbackReturn;

class LifecycleCamera : public rclcpp_lifecycle::LifecycleNode {
public:
    LifecycleCamera() : LifecycleNode("lifecycle_camera") {
        RCLCPP_INFO(get_logger(), "Lifecycle Camera created (Unconfigured)");
    }

    // CONFIGURE: Allocate resources
    CallbackReturn on_configure(const rclcpp_lifecycle::State & previous_state) override {
        RCLCPP_INFO(get_logger(), "Configuring from %s", previous_state.label().c_str());

        try {
            // Simulate camera initialization
            camera_device_ = "/dev/video0";
            frame_rate_ = 30;

            // Create lifecycle publisher (inactive by default)
            pub_ = create_lifecycle_publisher<sensor_msgs::msg::Image>("camera/image", 10);

            RCLCPP_INFO(get_logger(), "Camera configured: %s @ %d fps",
                        camera_device_.c_str(), frame_rate_);

            return CallbackReturn::SUCCESS;

        } catch (std::exception &e) {
            RCLCPP_ERROR(get_logger(), "Configuration failed: %s", e.what());
            return CallbackReturn::FAILURE;
        }
    }

    // CLEANUP: Release resources but keep node alive
    CallbackReturn on_cleanup(const rclcpp_lifecycle::State & previous_state) override {
        RCLCPP_INFO(get_logger(), "Cleaning up from %s", previous_state.label().c_str());

        pub_.reset();
        camera_device_.clear();

        RCLCPP_INFO(get_logger(), "Cleanup complete, ready to reconfigure");
        return CallbackReturn::SUCCESS;
    }

    // ACTIVATE: Start publishing
    CallbackReturn on_activate(const rclcpp_lifecycle::State & previous_state) override {
        RCLCPP_INFO(get_logger(), "Activating from %s", previous_state.label().c_str());

        // Activate publisher (allows publishing)
        pub_->on_activate();

        // Start capture timer
        timer_ = create_wall_timer(
            std::chrono::milliseconds(1000 / frame_rate_),
            std::bind(&LifecycleCamera::capture_and_publish, this)
        );

        RCLCPP_INFO(get_logger(), "Camera active, publishing at %d fps", frame_rate_);
        return CallbackReturn::SUCCESS;
    }

    // DEACTIVATE: Stop publishing but keep resources
    CallbackReturn on_deactivate(const rclcpp_lifecycle::State & previous_state) override {
        RCLCPP_INFO(get_logger(), "Deactivating from %s", previous_state.label().c_str());

        // Stop timer
        timer_->cancel();
        timer_.reset();

        // Deactivate publisher (blocks publishing)
        pub_->on_deactivate();

        RCLCPP_INFO(get_logger(), "Camera deactivated, resources retained");
        return CallbackReturn::SUCCESS;
    }

    // SHUTDOWN: Final cleanup
    CallbackReturn on_shutdown(const rclcpp_lifecycle::State & previous_state) override {
        RCLCPP_INFO(get_logger(), "Shutting down from %s", previous_state.label().c_str());

        timer_.reset();
        pub_.reset();

        RCLCPP_INFO(get_logger(), "Shutdown complete");
        return CallbackReturn::SUCCESS;
    }

    // ERROR HANDLING
    CallbackReturn on_error(const rclcpp_lifecycle::State & previous_state) override {
        RCLCPP_ERROR(get_logger(), "Error occurred in %s state", previous_state.label().c_str());

        // Attempt recovery
        timer_.reset();
        if (pub_) pub_->on_deactivate();

        return CallbackReturn::SUCCESS;
    }

private:
    void capture_and_publish() {
        if (!pub_->is_activated()) {
            RCLCPP_WARN(get_logger(), "Attempted to publish while inactive!");
            return;
        }

        auto msg = std::make_unique<sensor_msgs::msg::Image>();
        msg->header.stamp = now();
        msg->header.frame_id = "camera_frame";
        msg->width = 640;
        msg->height = 480;

        pub_->publish(std::move(msg));
    }

    std::string camera_device_;
    int frame_rate_;
    rclcpp_lifecycle::LifecyclePublisher<sensor_msgs::msg::Image>::SharedPtr pub_;
    rclcpp::TimerBase::SharedPtr timer_;
};

int main(int argc, char **argv) {
    rclcpp::init(argc, argv);

    auto node = std::make_shared<LifecycleCamera>();
    rclcpp::spin(node->get_node_base_interface());

    rclcpp::shutdown();
    return 0;
}
```

**Lifecycle State Control:**

```bash
# Terminal 1: Run node
ros2 run camera_pkg lifecycle_camera

# Terminal 2: Control lifecycle
ros2 lifecycle set /lifecycle_camera configure  # Unconfigured → Inactive
ros2 lifecycle set /lifecycle_camera activate   # Inactive → Active
ros2 lifecycle set /lifecycle_camera deactivate # Active → Inactive
ros2 lifecycle set /lifecycle_camera cleanup    # Inactive → Unconfigured
```

---

## INTERVIEW_QA

### Q1: What's the difference between a regular Node and a LifecycleNode?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

Regular nodes start immediately and have no managed states, while lifecycle nodes follow a state machine with controlled transitions.

**Key Differences:**

| Aspect | Regular Node | Lifecycle Node |
|--------|-------------|----------------|
| **Initialization** | Constructor only | Constructor + on_configure() |
| **States** | Running or shutdown | Unconfigured → Inactive → Active → Finalized |
| **Resource Control** | Immediate allocation | Deferred to configure transition |
| **Graceful Degradation** | Must kill process | Can deactivate/cleanup without shutdown |
| **Coordination** | Nodes start independently | External lifecycle manager coordinates startup |

**When to use LifecycleNode:**
- Hardware drivers (camera, lidar, motors)
- System components needing coordinated startup
- Nodes with expensive resources (can stay Inactive when not needed)
- Safety-critical systems (controlled shutdown)

**Implementation difference:**
```cpp
// Regular node
class MyNode : public rclcpp::Node {
    MyNode() : Node("my_node") {
        // Immediately start
        pub_ = create_publisher<Msg>("topic", 10);
        timer_ = create_wall_timer(...);
    }
};

// Lifecycle node
class MyLifecycleNode : public rclcpp_lifecycle::LifecycleNode {
    MyLifecycleNode() : LifecycleNode("my_node") {
        // Do minimal work, defer to transitions
    }

    CallbackReturn on_configure(...) {
        pub_ = create_publisher(...);  // Deferred
        return SUCCESS;
    }

    CallbackReturn on_activate(...) {
        timer_ = create_wall_timer(...);  // Start only when active
        return SUCCESS;
    }
};
```

---

### Q2: Explain the difference between SingleThreadedExecutor and MultiThreadedExecutor. When would you choose one over the other?

**Difficulty:** ⭐⭐⭐⭐ (Hard)

**Answer:**

**SingleThreadedExecutor:**
- **Execution:** Processes all callbacks sequentially in one thread
- **Concurrency:** None - callbacks never overlap
- **Ordering:** Deterministic (FIFO by arrival)
- **Thread Safety:** No synchronization needed
- **Performance:** Lower overhead, but head-of-line blocking

**MultiThreadedExecutor:**
- **Execution:** Thread pool processes callbacks concurrently
- **Concurrency:** Multiple callbacks can run simultaneously
- **Ordering:** Non-deterministic (depends on thread scheduling)
- **Thread Safety:** Must protect shared state with mutexes
- **Performance:** Higher throughput, no head-of-line blocking, but more overhead

**Choose SingleThreaded when:**
1. Callbacks are fast (< 1ms)
2. Callbacks share state (avoid synchronization complexity)
3. Deterministic ordering required
4. CPU-constrained embedded system (minimize threads)
5. Simplicity preferred over performance

**Choose MultiThreaded when:**
1. Callbacks have varying latencies (fast sensor + slow processing)
2. Want to utilize multiple CPU cores
3. High throughput required
4. Callbacks are independent (thread-safe)

**Real-World Example:**
```cpp
// Bad: SingleThreaded with mixed latencies
class BadNode : public rclcpp::Node {
    void fast_callback() {
        // 1ms operation
    }

    void slow_callback() {
        // 500ms operation - BLOCKS fast_callback!
    }
};

// Good: MultiThreaded with callback groups
class GoodNode : public rclcpp::Node {
    GoodNode() {
        auto fast_group = create_callback_group(Reentrant);
        auto slow_group = create_callback_group(MutuallyExclusive);

        // Can run in parallel
        fast_sub_ = create_subscription(..., fast_group);
        slow_sub_ = create_subscription(..., slow_group);
    }
};
```

---

### Q3: What are callback groups and why are they important?

**Difficulty:** ⭐⭐⭐⭐ (Hard)

**Answer:**

Callback groups control **which callbacks can run concurrently** in a MultiThreadedExecutor.

**Two Types:**

1. **MutuallyExclusive (default):**
   - Callbacks in this group NEVER run simultaneously
   - Acts like a mutex protecting shared state
   - Multiple callbacks = sequential execution

2. **Reentrant:**
   - Callbacks CAN run concurrently
   - Must be thread-safe (no shared mutable state)
   - Enables true parallelism

**Why Important:**

Without callback groups, MultiThreadedExecutor would either:
- Run ALL callbacks concurrently (race conditions everywhere)
- Run ALL callbacks sequentially (defeats purpose of multi-threading)

**Solution:** Fine-grained control over concurrency.

**Example:**
```cpp
class RobotController : public rclcpp::Node {
    RobotController() {
        // Group 1: Sensor callbacks (can run in parallel)
        auto sensor_group = create_callback_group(Reentrant);
        camera_sub_ = create_subscription(..., sensor_group);
        lidar_sub_ = create_subscription(..., sensor_group);

        // Group 2: Control callbacks (mutually exclusive - share robot_state_)
        auto control_group = create_callback_group(MutuallyExclusive);
        cmd_vel_sub_ = create_subscription(..., control_group);
        emergency_stop_sub_ = create_subscription(..., control_group);
    }

    RobotState robot_state_;  // Shared by control callbacks
};
```

**Execution:**
```
Thread 1: camera_callback()  ───────►  (independent)
Thread 2: lidar_callback()   ───────►  (runs in parallel with camera)
Thread 3: cmd_vel_callback() ───────►  (exclusive with emergency_stop)
Thread 4:                         emergency_stop_callback() ──► (waits for cmd_vel)
```

**Interview Insight:**
Default behavior (all callbacks in one MutuallyExclusive group) makes MultiThreadedExecutor almost useless. Must explicitly create Reentrant groups for parallelism.

---

### Q4: What is intra-process communication and what are its limitations?

**Difficulty:** ⭐⭐⭐⭐ (Hard)

**Answer:**

Intra-process communication allows **zero-copy message passing** between nodes in the same process, bypassing DDS serialization.

**How it Works:**

Normal (inter-process):
```
Node A → serialize → DDS → deserialize → Node B
         (copy)            (copy)
```

Intra-process (same process):
```
Node A → std::move(msg) → Node B
         (zero-copy!)
```

**Benefits:**
- **Lower latency:** No serialization/deserialization
- **Lower CPU:** No memcpy
- **Lower memory:** Single message copy
- **Higher throughput:** No DDS overhead

**Limitations:**

1. **Requires unique_ptr:**
```cpp
// Zero-copy
pub->publish(std::make_unique<Msg>());  ✓

// Falls back to DDS (shared ownership)
auto msg = std::make_shared<Msg>();
pub->publish(msg);  ✗
```

2. **Same process only:**
```cpp
// Must be composed in same executable
auto node1 = std::make_shared<Node1>(
    NodeOptions().use_intra_process_comms(true)
);
auto node2 = std::make_shared<Node2>(
    NodeOptions().use_intra_process_comms(true)
);
// Different processes → always uses DDS
```

3. **QoS must match:**
```cpp
// Publisher: RELIABLE
pub_ = create_publisher<Msg>("topic", QoS(10).reliable());

// Subscriber: BEST_EFFORT
sub_ = create_subscription<Msg>("topic", QoS(10).best_effort(), ...);

// Mismatch → falls back to DDS
```

4. **Multiple subscribers:**
```cpp
// pub publishes unique_ptr
// sub1 gets moved message (zero-copy)
// sub2 gets DDS copy (can't move twice!)
```

**When to Use:**
- High-frequency data (camera images, lidar scans)
- Same-process node composition
- Latency-critical pipelines (sensor → processing → actuator)

**Detection:**
```cpp
if (pub_->get_intra_process_publisher_count() == 0) {
    RCLCPP_WARN(logger, "Intra-process disabled, using DDS");
}
```

---

### Q5: How do you prevent timer callback overruns?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

Timer overrun occurs when callback execution time exceeds timer period, causing queued callbacks and unpredictable timing.

**Detection:**
```cpp
auto last_call = steady_clock::now();

timer_ = create_wall_timer(100ms, [&]() {
    auto now = steady_clock::now();
    auto actual_period = duration_cast<milliseconds>(now - last_call).count();

    if (actual_period > 150) {  // 50% tolerance
        RCLCPP_WARN(logger, "Overrun: %ld ms (expected 100 ms)", actual_period);
    }

    last_call = now;
    expensive_work();
});
```

**Prevention Strategies:**

1. **Skip work if overrunning:**
```cpp
std::atomic<bool> processing{false};

timer_ = create_wall_timer(100ms, [&]() {
    if (processing.load()) {
        RCLCPP_WARN_THROTTLE(logger, clock, 1000, "Skipping, still processing");
        return;  // Skip this iteration
    }

    processing = true;
    expensive_work();
    processing = false;
});
```

2. **Offload work to separate thread:**
```cpp
timer_ = create_wall_timer(100ms, [&]() {
    // Quick handoff to worker thread
    work_queue.push(data);  // Non-blocking
});

// Separate worker thread processes queue
std::thread worker([&]() {
    while (running) {
        auto data = work_queue.pop();  // Blocking
        expensive_work(data);
    }
});
```

3. **Use MultiThreadedExecutor:**
```cpp
// Timer won't block other callbacks
rclcpp::executors::MultiThreadedExecutor executor(
    rclcpp::ExecutorOptions(), 4
);
```

4. **Reduce timer rate:**
```cpp
// If work takes 150ms, set period to 200ms
timer_ = create_wall_timer(200ms, callback);
```

---

### Q6: Explain the lifecycle state machine. What transitions are allowed?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

Lifecycle nodes follow a state machine with 4 primary states and defined transitions:

**States:**

```
┌─────────────┐  configure()  ┌─────────────┐  activate()  ┌─────────────┐
│ Unconfigured│──────────────►│  Inactive   │─────────────►│   Active    │
└──────┬──────┘               └──────┬──────┘              └──────┬──────┘
       │                             │                            │
       │        cleanup()            │       deactivate()         │
       │◄────────────────────────────┘                            │
       │                                                          │
       │                     shutdown()                           │
       └─────────────────────────────────────────────────────────►│
                                                                  ▼
                                                           ┌─────────────┐
                                                           │  Finalized  │
                                                           └─────────────┘
```

**Allowed Transitions:**

| From State | Transition | To State | Purpose |
|------------|------------|----------|---------|
| Unconfigured | `configure()` | Inactive | Allocate resources |
| Inactive | `activate()` | Active | Start operation |
| Inactive | `cleanup()` | Unconfigured | Release resources |
| Active | `deactivate()` | Inactive | Stop operation |
| Any | `shutdown()` | Finalized | Final cleanup |

**Callback Return Values:**

```cpp
CallbackReturn::SUCCESS  // Transition succeeds
CallbackReturn::FAILURE  // Transition fails, state unchanged
CallbackReturn::ERROR    // Error occurred, enter error state
```

**Example Flow:**

```bash
# Normal startup
Unconfigured → configure() → Inactive → activate() → Active

# Graceful shutdown
Active → deactivate() → Inactive → cleanup() → Unconfigured

# Full shutdown
Active → shutdown() → Finalized

# Reconfiguration
Active → deactivate() → Inactive → cleanup() → Unconfigured → configure() → ...
```

**Interview Insight:**
Not all transitions are bidirectional. Can't go directly from Active to Unconfigured (must deactivate first). Shutdown is irreversible (Finalized is terminal).

---

### Q7: What happens if you call `spin()` from within a callback?

**Difficulty:** ⭐⭐⭐⭐⭐ (Very Hard)

**Answer:**

Calling `spin()` from within a callback causes **deadlock** (SingleThreadedExecutor) or **recursive spinning** (MultiThreadedExecutor).

**Scenario:**
```cpp
class BadNode : public rclcpp::Node {
    BadNode() : Node("bad") {
        sub_ = create_subscription<Int32>("topic", 10,
            [this](Int32::SharedPtr msg) {
                RCLCPP_INFO(get_logger(), "Callback received: %d", msg->data);

                // DEADLOCK!
                rclcpp::spin(shared_from_this());
            }
        );
    }
};
```

**What Happens (SingleThreadedExecutor):**

```
1. Executor calls subscription callback
2. Callback calls spin()
3. spin() tries to process callbacks
4. Executor is already executing → DEADLOCK
```

**Why:** Executor is not reentrant. Single thread can't process callbacks while already processing one.

**MultiThreadedExecutor:**
Might not deadlock immediately but causes:
- **Recursive spinning:** Multiple spin loops running
- **Callback queue exhaustion:** All threads stuck spinning
- **Unpredictable behavior:** Callbacks triggering more spins

**Correct Solutions:**

1. **Use `spin_until_future_complete()` for synchronous service calls:**
```cpp
auto future = client->async_send_request(request);
rclcpp::spin_until_future_complete(node, future);  // OK (handles this case)
```

2. **Never call `spin()` from callbacks:**
```cpp
// Bad
void callback() {
    rclcpp::spin(node);  ✗
}

// Good: use async patterns
void callback() {
    client->async_send_request(request);  ✓
}
```

3. **Use separate executor for nested spinning:**
```cpp
void callback() {
    // Create temporary executor for service call
    rclcpp::executors::SingleThreadedExecutor temp_executor;
    auto future = client->async_send_request(request);
    temp_executor.spin_until_future_complete(future);
}
```

**Interview Insight:**
Executors are not reentrant. Calling spin() from callback violates fundamental executor design assumption (callbacks don't block).

---

### Q8: How does node composition differ from running nodes in separate processes?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

**Separate Processes (traditional):**
```bash
ros2 run pkg node1
ros2 run pkg node2
```

- Each node in own process
- Communication via DDS (serialization, network stack)
- Process isolation (crash doesn't affect others)
- Higher overhead (multiple processes)

**Composed (single process):**
```cpp
int main() {
    auto node1 = std::make_shared<Node1>(
        NodeOptions().use_intra_process_comms(true)
    );
    auto node2 = std::make_shared<Node2>(
        NodeOptions().use_intra_process_comms(true)
    );

    rclcpp::spin(node1);  // Both in same process
}
```

- Multiple nodes in one process
- Zero-copy intra-process communication
- Shared memory space (no isolation)
- Lower overhead

**Comparison:**

| Aspect | Separate Processes | Composed |
|--------|-------------------|----------|
| **Communication** | DDS (serialize/deserialize) | Shared memory (zero-copy) |
| **Latency** | Higher (network stack) | Lower (direct pointer) |
| **Isolation** | Crash isolated | Crash kills all nodes |
| **Memory** | Each process has own heap | Shared heap |
| **Startup** | Multiple executables | Single executable |
| **Deployment** | Flexible (distribute across machines) | Single machine only |

**When to Compose:**
- Nodes always run together (sensor + driver)
- High-frequency data (images, lidar)
- Latency-critical pipelines
- Resource-constrained systems

**When to Separate:**
- Fault isolation needed
- Distributed system (across machines)
- Different lifecycles (start/stop independently)
- Security boundaries

**Dynamic Composition:**
```bash
# Start container
ros2 run rclcpp_components component_container

# Load components
ros2 component load /ComponentManager pkg Node1
ros2 component load /ComponentManager pkg Node2

# Unload
ros2 component unload /ComponentManager 1
```

---

### Q9: What is the default callback group type and when would you change it?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

**Default:** `MutuallyExclusive`

When you create a subscription/timer/service without specifying a callback group, it's added to the node's **default MutuallyExclusive group**.

```cpp
class MyNode : public rclcpp::Node {
    MyNode() {
        // Both use default MutuallyExclusive group
        sub1_ = create_subscription<Msg>("topic1", 10, callback1);
        sub2_ = create_subscription<Msg>("topic2", 10, callback2);

        // callback1 and callback2 NEVER run concurrently
    }
};
```

**Effect with MultiThreadedExecutor:**
- All callbacks in default group execute sequentially
- MultiThreadedExecutor behaves like SingleThreadedExecutor for these callbacks
- No benefit from multiple threads

**When to Change:**

1. **Create Reentrant group for independent callbacks:**
```cpp
auto sensor_group = create_callback_group(Reentrant);

auto camera_sub = create_subscription<Image>(
    "camera", 10, camera_callback,
    SubscriptionOptions().callback_group = sensor_group
);

auto lidar_sub = create_subscription<Lidar>(
    "lidar", 10, lidar_callback,
    SubscriptionOptions().callback_group = sensor_group
);

// camera_callback and lidar_callback CAN run in parallel
```

2. **Separate MutuallyExclusive groups for different shared states:**
```cpp
auto robot_state_group = create_callback_group(MutuallyExclusive);
auto map_group = create_callback_group(MutuallyExclusive);

// Share robot_state_
cmd_vel_sub = create_subscription(..., robot_state_group);
odom_sub = create_subscription(..., robot_state_group);

// Share map_ (independent from robot_state_)
map_sub = create_subscription(..., map_group);

// cmd_vel and odom are mutually exclusive (same group)
// But map_callback can run in parallel with them (different group)
```

**Best Practice:**
- Keep default for simple nodes
- Create explicit groups when using MultiThreadedExecutor
- Document which callbacks share state (MutuallyExclusive) vs independent (Reentrant)

---

### Q10: How do you debug which thread is executing a callback?

**Difficulty:** ⭐⭐ (Easy)

**Answer:**

Use `std::this_thread::get_id()` to identify executing thread:

```cpp
#include <thread>
#include <sstream>

class DebugNode : public rclcpp::Node {
public:
    DebugNode() : Node("debug") {
        sub1_ = create_subscription<Int32>("topic1", 10,
            [this](Int32::SharedPtr msg) {
                log_thread_info("callback1", msg->data);
            }
        );

        sub2_ = create_subscription<Int32>("topic2", 10,
            [this](Int32::SharedPtr msg) {
                log_thread_info("callback2", msg->data);
            }
        );
    }

private:
    void log_thread_info(const std::string& callback_name, int value) {
        std::stringstream ss;
        ss << std::this_thread::get_id();

        RCLCPP_INFO(get_logger(),
            "[Thread %s] %s received: %d",
            ss.str().c_str(),
            callback_name.c_str(),
            value
        );
    }
};

int main(int argc, char **argv) {
    rclcpp::init(argc, argv);
    auto node = std::make_shared<DebugNode>();

    // Try with different executors
    rclcpp::executors::MultiThreadedExecutor executor(
        rclcpp::ExecutorOptions(), 4
    );
    executor.add_node(node);
    executor.spin();

    rclcpp::shutdown();
}
```

**Output (MultiThreadedExecutor):**
```
[Thread 140234567890] callback1 received: 1
[Thread 140234567891] callback2 received: 2
[Thread 140234567890] callback1 received: 3
```

**Output (SingleThreadedExecutor):**
```
[Thread 140234567890] callback1 received: 1
[Thread 140234567890] callback2 received: 2
[Thread 140234567890] callback1 received: 3
```

**Advanced: Track callback group execution:**
```cpp
void log_callback_group_info() {
    auto cb_group = get_callback_group();

    RCLCPP_INFO(get_logger(),
        "Callback group type: %s",
        cb_group->type() == CallbackGroupType::Reentrant
            ? "Reentrant"
            : "MutuallyExclusive"
    );
}
```

---

## PRACTICE_TASKS

### Task 1: Implement Multi-Rate Node with Callback Groups

Create a node with three timers:
- Fast timer (100 Hz): Read sensor, publish raw data
- Medium timer (10 Hz): Process data, publish result
- Slow timer (1 Hz): Compute statistics

**Requirements:**
- Use MultiThreadedExecutor
- Fast timer should never be blocked by slow timer
- Processing and stats share data structure (use mutex)

**Expected Behavior:**
- Fast timer runs independently
- Stats computation doesn't block sensor reading

---

### Task 2: Lifecycle-Managed Hardware Driver

Implement a lifecycle node simulating a camera driver:

**States:**
- Unconfigured: Camera not initialized
- Inactive: Camera configured but not capturing
- Active: Camera capturing and publishing

**Resources:**
- File descriptor (allocated in configure, freed in cleanup)
- Timer (started in activate, stopped in deactivate)
- Publisher (lifecycle publisher)

**Error Handling:**
- Simulate hardware failure in configure (return FAILURE)
- Implement on_error callback

---

### Task 3: Composed Pipeline with Intra-Process

Create a 3-node pipeline in single process:
1. CameraNode: Generates large images (1920x1080 RGB)
2. FilterNode: Applies Gaussian blur
3. DetectorNode: Runs object detection

**Requirements:**
- Use intra-process communication (zero-copy)
- Publish unique_ptr for zero-copy
- Measure latency with/without intra-process

**Metrics:**
- End-to-end latency
- CPU usage
- Memory allocations

---

## QUICK_REFERENCE

### Node Types Comparison

| Feature | Regular Node | Lifecycle Node | Component Node |
|---------|--------------|----------------|----------------|
| **Base Class** | `rclcpp::Node` | `rclcpp_lifecycle::LifecycleNode` | `rclcpp::Node` + plugin |
| **State Management** | None | 4-state machine | None (runtime loading) |
| **Startup** | Immediate | Controlled transitions | Dynamic loading |
| **Use Case** | Simple nodes | Hardware drivers | Composition |

---

### Executor Types

| Executor | Threads | Overhead | Use Case |
|----------|---------|----------|----------|
| **SingleThreadedExecutor** | 1 | Lowest | Simple nodes, deterministic |
| **MultiThreadedExecutor** | N | Medium | Concurrent callbacks |
| **StaticSingleThreadedExecutor** | 1 | Lowest | Real-time, embedded |

---

### Callback Group Rules

| Group Type | Concurrency | Thread Safety | Use Case |
|------------|-------------|---------------|----------|
| **MutuallyExclusive** | Sequential | Not needed | Callbacks share state |
| **Reentrant** | Concurrent | Required | Independent callbacks |

---

### Spinning Methods

| Method | Blocking | Processes | Use Case |
|--------|----------|-----------|----------|
| `spin()` | Yes (infinite) | All callbacks | Standard daemon |
| `spin_once()` | Yes (one iteration) | Ready callbacks | Custom event loop |
| `spin_some()` | No | Ready callbacks | Non-blocking polling |
| `spin_until_future_complete()` | Yes (conditional) | Until future ready | Synchronous service |

---

### Lifecycle State Transitions

```
configure():    Unconfigured → Inactive
cleanup():      Inactive → Unconfigured
activate():     Inactive → Active
deactivate():   Active → Inactive
shutdown():     Any → Finalized
```

---

### Intra-Process Requirements

1. **Enable in NodeOptions:**
   ```cpp
   NodeOptions().use_intra_process_comms(true)
   ```

2. **Publish with unique_ptr:**
   ```cpp
   pub->publish(std::make_unique<Msg>());
   ```

3. **Matching QoS:** Publisher and subscriber QoS must be compatible

4. **Same Process:** Nodes must be composed in same executable

---

**END OF TOPIC 1.2**
