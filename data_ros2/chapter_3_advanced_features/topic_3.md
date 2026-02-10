# Topic 3.3: Component Composition

## THEORY_SECTION

### 1. Component Composition Fundamentals

**What is Component Composition?**

Component composition allows **multiple nodes to run in a single process**, enabling:
- **Intra-process communication** (zero-copy)
- **Lower overhead** (fewer processes)
- **Better resource utilization**
- **Easier deployment**

**Traditional vs Composed:**

```
Traditional (Separate Processes):
Process 1: camera_node
Process 2: image_processor
Process 3: object_detector

Communication: camera → DDS → processor → DDS → detector
             (serialize, copy, deserialize at each step)

Composed (Single Process):
Process 1: container
  ├─ camera_component
  ├─ image_processor_component
  └─ object_detector_component

Communication: camera → shared_ptr → processor → shared_ptr → detector
             (zero-copy, direct pointer passing!)
```

**Benefits:**

| Benefit | Impact |
|---------|--------|
| **Zero-copy** | No serialization overhead |
| **Lower latency** | Direct function calls vs network |
| **Reduced CPU** | No context switching between processes |
| **Memory efficiency** | Shared memory, single message copy |
| **Easier debugging** | Single process to attach debugger |

**Trade-offs:**

| Aspect | Separate Processes | Composed |
|--------|-------------------|----------|
| **Isolation** | High (crash isolated) | None (crash kills all) |
| **Flexibility** | Run on different machines | Same machine only |
| **Resource limits** | Per-process limits | Shared limits |
| **Development** | Independent testing | Must test together |

---

### 2. Creating a Component

**Component vs Regular Node:**

**Regular Node:**
```cpp
class MyNode : public rclcpp::Node {
public:
    MyNode() : Node("my_node") {
        // ...
    }
};

int main(int argc, char **argv) {
    rclcpp::init(argc, argv);
    rclcpp::spin(std::make_shared<MyNode>());
    rclcpp::shutdown();
}
```

**Component (Composable Node):**
```cpp
#include "rclcpp/rclcpp.hpp"
#include "rclcpp_components/register_node_macro.hpp"

class MyComponent : public rclcpp::Node {
public:
    // Constructor takes NodeOptions (REQUIRED for components)
    MyComponent(const rclcpp::NodeOptions &options)
        : Node("my_component", options)
    {
        // Enable intra-process comms
        pub_ = create_publisher<std_msgs::msg::String>("topic", 10);

        timer_ = create_wall_timer(
            std::chrono::seconds(1),
            [this]() {
                auto msg = std::make_unique<std_msgs::msg::String>();
                msg->data = "Hello from component";
                pub_->publish(std::move(msg));  // Zero-copy!
            }
        );
    }

private:
    rclcpp::Publisher<std_msgs::msg::String>::SharedPtr pub_;
    rclcpp::TimerBase::SharedPtr timer_;
};

// Register as component (REQUIRED)
RCLCPP_COMPONENTS_REGISTER_NODE(MyComponent)
```

**Key Differences:**

1. **Constructor signature:**
   ```cpp
   MyComponent(const rclcpp::NodeOptions &options)  // Component
   MyNode()  // Regular node
   ```

2. **No main() function** (component is loaded dynamically)

3. **Registration macro:**
   ```cpp
   RCLCPP_COMPONENTS_REGISTER_NODE(MyComponent)
   ```

4. **Enable intra-process in NodeOptions:**
   ```cpp
   NodeOptions().use_intra_process_comms(true)
   ```

---

### 3. Building Components

**CMakeLists.txt:**

```cmake
find_package(rclcpp REQUIRED)
find_package(rclcpp_components REQUIRED)
find_package(std_msgs REQUIRED)

# Build component as shared library
add_library(my_component SHARED src/my_component.cpp)
ament_target_dependencies(my_component
  rclcpp
  rclcpp_components
  std_msgs
)

# Register component with rclcpp_components
rclcpp_components_register_nodes(my_component "MyComponent")

# Install component library
install(TARGETS my_component
  ARCHIVE DESTINATION lib
  LIBRARY DESTINATION lib
  RUNTIME DESTINATION bin
)
```

**package.xml:**

```xml
<depend>rclcpp</depend>
<depend>rclcpp_components</depend>
<depend>std_msgs</depend>
```

**Build:**

```bash
colcon build --packages-select my_component_pkg
```

**Verify Component Registration:**

```bash
ros2 component types

# Output:
# my_component_pkg
#   MyComponent
```

---

### 4. Running Components

**Method 1: Component Container (Manual Loading)**

**Terminal 1 - Start Container:**
```bash
ros2 run rclcpp_components component_container
```

**Terminal 2 - Load Components:**
```bash
# Load first component
ros2 component load /ComponentManager my_component_pkg MyComponent

# Load second component
ros2 component load /ComponentManager image_processor_pkg ImageProcessor

# List loaded components
ros2 component list

# Unload component
ros2 component unload /ComponentManager 1
```

**Method 2: Launch File (Automatic Loading)**

```python
from launch import LaunchDescription
from launch_ros.actions import ComposableNodeContainer
from launch_ros.descriptions import ComposableNode

def generate_launch_description():
    container = ComposableNodeContainer(
        name='my_container',
        namespace='',
        package='rclcpp_components',
        executable='component_container',
        composable_node_descriptions=[
            ComposableNode(
                package='camera_pkg',
                plugin='camera::CameraComponent',  # Fully qualified class name
                name='camera',
                parameters=[{
                    'fps': 30,
                    'resolution': '1920x1080'
                }],
                extra_arguments=[{
                    'use_intra_process_comms': True
                }]
            ),
            ComposableNode(
                package='image_processor_pkg',
                plugin='processor::ImageProcessor',
                name='image_processor',
                parameters=[{
                    'algorithm': 'fast'
                }],
                extra_arguments=[{
                    'use_intra_process_comms': True
                }]
            ),
        ],
        output='screen',
    )

    return LaunchDescription([container])
```

**Method 3: Standalone Executable (for Development)**

```cpp
// main.cpp (for testing components standalone)
#include "rclcpp/rclcpp.hpp"
#include "my_component.hpp"

int main(int argc, char **argv) {
    rclcpp::init(argc, argv);

    auto node = std::make_shared<MyComponent>(
        rclcpp::NodeOptions().use_intra_process_comms(true)
    );

    rclcpp::spin(node);
    rclcpp::shutdown();
    return 0;
}
```

---

### 5. Intra-Process Communication

**Zero-Copy Publishing:**

```cpp
class ProducerComponent : public rclcpp::Node {
public:
    ProducerComponent(const rclcpp::NodeOptions &options)
        : Node("producer", options)
    {
        pub_ = create_publisher<sensor_msgs::msg::Image>("image", 10);

        timer_ = create_wall_timer(33ms, [this]() {
            // Create message with unique_ptr (REQUIRED for zero-copy)
            auto msg = std::make_unique<sensor_msgs::msg::Image>();

            msg->header.stamp = now();
            msg->height = 480;
            msg->width = 640;
            msg->data.resize(640 * 480 * 3);

            // Fill image data...
            fill_image_data(msg->data);

            // Publish with move (zero-copy to subscribers in same process!)
            pub_->publish(std::move(msg));
        });
    }

private:
    rclcpp::Publisher<sensor_msgs::msg::Image>::SharedPtr pub_;
    rclcpp::TimerBase::SharedPtr timer_;
};

RCLCPP_COMPONENTS_REGISTER_NODE(ProducerComponent)
```

**Zero-Copy Subscribing:**

```cpp
class ConsumerComponent : public rclcpp::Node {
public:
    ConsumerComponent(const rclcpp::NodeOptions &options)
        : Node("consumer", options)
    {
        sub_ = create_subscription<sensor_msgs::msg::Image>(
            "image", 10,
            [this](sensor_msgs::msg::Image::UniquePtr msg) {  // UniquePtr!
                // Message received via zero-copy (direct pointer)
                RCLCPP_INFO(get_logger(), "Received image %dx%d (zero-copy!)",
                           msg->width, msg->height);

                process_image(std::move(msg));  // Move ownership
            }
        );
    }

private:
    void process_image(sensor_msgs::msg::Image::UniquePtr img) {
        // Process image...
    }

    rclcpp::Subscription<sensor_msgs::msg::Image>::SharedPtr sub_;
};

RCLCPP_COMPONENTS_REGISTER_NODE(ConsumerComponent)
```

**Key Requirements for Zero-Copy:**

1. **Use `std::unique_ptr`:**
   ```cpp
   auto msg = std::make_unique<Msg>();  // ✓ Zero-copy
   auto msg = std::make_shared<Msg>();  // ✗ DDS fallback
   ```

2. **Enable intra-process comms:**
   ```cpp
   NodeOptions().use_intra_process_comms(true)
   ```

3. **Same process:**
   - Must be in same container
   - Or composed manually in same executable

4. **Matching QoS:**
   - Publisher and subscriber QoS must be compatible

**Performance Comparison:**

```
DDS (separate processes):
Publisher → serialize → DDS → deserialize → Subscriber
Time: ~500μs (for 1MB image)
CPU: High (serialization + network)

Intra-process (composed):
Publisher → std::move(unique_ptr) → Subscriber
Time: ~5μs (100x faster!)
CPU: Minimal (pointer move)
```

---

### 6. Lifecycle Components

**Combining Composition with Lifecycle:**

```cpp
#include "rclcpp_lifecycle/lifecycle_node.hpp"
#include "rclcpp_components/register_node_macro.hpp"

class LifecycleComponent : public rclcpp_lifecycle::LifecycleNode {
public:
    LifecycleComponent(const rclcpp::NodeOptions &options)
        : LifecycleNode("lifecycle_component", options)
    {
        RCLCPP_INFO(get_logger(), "Lifecycle component created");
    }

    CallbackReturn on_configure(const rclcpp_lifecycle::State &) override {
        RCLCPP_INFO(get_logger(), "Configuring...");

        pub_ = create_publisher<std_msgs::msg::String>("output", 10);

        return CallbackReturn::SUCCESS;
    }

    CallbackReturn on_activate(const rclcpp_lifecycle::State &) override {
        RCLCPP_INFO(get_logger(), "Activating...");

        pub_->on_activate();

        timer_ = create_wall_timer(1s, [this]() {
            auto msg = std::make_unique<std_msgs::msg::String>();
            msg->data = "Hello";
            pub_->publish(std::move(msg));
        });

        return CallbackReturn::SUCCESS;
    }

    CallbackReturn on_deactivate(const rclcpp_lifecycle::State &) override {
        RCLCPP_INFO(get_logger(), "Deactivating...");

        timer_->cancel();
        pub_->on_deactivate();

        return CallbackReturn::SUCCESS;
    }

private:
    rclcpp_lifecycle::LifecyclePublisher<std_msgs::msg::String>::SharedPtr pub_;
    rclcpp::TimerBase::SharedPtr timer_;
};

RCLCPP_COMPONENTS_REGISTER_NODE(LifecycleComponent)
```

**Launch Lifecycle Component:**

```python
ComposableNode(
    package='my_pkg',
    plugin='LifecycleComponent',
    name='lifecycle_comp',
    extra_arguments=[{'use_intra_process_comms': True}]
)

# Transition lifecycle states manually or via lifecycle manager
```

---

### 7. Multi-Threaded Container

**Single-Threaded Container (Default):**
```bash
ros2 run rclcpp_components component_container
```
- All components in one thread
- Callbacks execute sequentially

**Multi-Threaded Container:**
```bash
ros2 run rclcpp_components component_container_mt
```
- Thread pool for callbacks
- Components can execute concurrently

**Launch File:**

```python
ComposableNodeContainer(
    package='rclcpp_components',
    executable='component_container_mt',  # Multi-threaded
    composable_node_descriptions=[...],
)
```

**When to Use:**
- **Single-threaded:** Simple pipelines, no blocking operations
- **Multi-threaded:** Mixed fast/slow components, utilize multiple cores

---

## EDGE_CASES

### Edge Case 1: Missing RCLCPP_COMPONENTS_REGISTER_NODE Macro

**Scenario:**
Component class defined but registration macro forgotten.

**Code:**
```cpp
class MyComponent : public rclcpp::Node {
public:
    MyComponent(const rclcpp::NodeOptions &options)
        : Node("my_component", options)
    {
        // ...
    }
};

// BUG: Missing registration macro!
// RCLCPP_COMPONENTS_REGISTER_NODE(MyComponent)
```

**Build succeeds, but:**
```bash
ros2 component types
# my_pkg not listed (component not registered)

ros2 component load /ComponentManager my_pkg MyComponent
# Error: Failed to find class with the requested plugin name 'MyComponent'
```

**Why:**
- Macro generates code to register component with plugin system
- Without it, component exists but isn't discoverable

**Solution:**

```cpp
#include "rclcpp_components/register_node_macro.hpp"

class MyComponent : public rclcpp::Node {
    // ...
};

// REQUIRED: Register component
RCLCPP_COMPONENTS_REGISTER_NODE(MyComponent)
```

**Verification:**

```bash
ros2 component types | grep MyComponent
# my_pkg
#   MyComponent
```

**Interview Insight:**
Always add `RCLCPP_COMPONENTS_REGISTER_NODE` macro. Without it, component won't be loadable.

---

### Edge Case 2: Intra-Process Fallback to DDS

**Scenario:**
Expected zero-copy but messages still serialized.

**Code:**
```cpp
// Publisher (component)
auto msg = std::make_shared<Image>();  // BUG: shared_ptr instead of unique_ptr
pub_->publish(msg);

// Subscriber (component, same container)
sub_ = create_subscription<Image>("topic", 10,
    [](Image::SharedPtr msg) {  // Receives via DDS (not zero-copy!)
        // ...
    }
);
```

**Why Fallback Occurs:**

1. **Using shared_ptr instead of unique_ptr:**
   ```cpp
   auto msg = std::make_shared<Image>();  // ✗ Can't move (shared ownership)
   pub_->publish(msg);  // Falls back to DDS

   auto msg = std::make_unique<Image>();  // ✓ Can move
   pub_->publish(std::move(msg));  // Zero-copy
   ```

2. **QoS mismatch:**
   ```cpp
   // Publisher: RELIABLE
   pub_ = create_publisher<Image>("topic", rclcpp::QoS(10).reliable());

   // Subscriber: BEST_EFFORT
   sub_ = create_subscription<Image>("topic", rclcpp::SensorDataQoS(), ...);
   // QoS incompatible → DDS fallback
   ```

3. **Multiple subscribers (can't move to both):**
   ```cpp
   // Subscriber 1 (in container)
   sub1_ = create_subscription<Image>(...);

   // Subscriber 2 (in container)
   sub2_ = create_subscription<Image>(...);

   // Publisher publishes unique_ptr
   pub_->publish(std::make_unique<Image>());

   // Result: sub1 gets zero-copy, sub2 gets DDS copy (can't move twice!)
   ```

**Detection:**

```cpp
// Check if intra-process is active
if (pub_->get_intra_process_publisher_count() > 0) {
    RCLCPP_INFO(logger, "Intra-process active");
} else {
    RCLCPP_WARN(logger, "Falling back to DDS");
}
```

**Solution:**

```cpp
// Use unique_ptr
auto msg = std::make_unique<Image>();
pub_->publish(std::move(msg));

// Match QoS
auto qos = rclcpp::QoS(10).reliable();
pub_ = create_publisher<Image>("topic", qos);
sub_ = create_subscription<Image>("topic", qos, ...);

// For multiple subscribers, accept that second gets DDS copy
// (or redesign to avoid multiple subscribers)
```

**Interview Insight:**
Intra-process requires unique_ptr, matching QoS, and same process. Falls back to DDS silently if requirements not met.

---

### Edge Case 3: Component Crashes Entire Container

**Scenario:**
One component segfaults, killing all components in container.

**Code:**
```cpp
class BuggyComponent : public rclcpp::Node {
public:
    BuggyComponent(const rclcpp::NodeOptions &options)
        : Node("buggy", options)
    {
        timer_ = create_wall_timer(1s, [this]() {
            int *ptr = nullptr;
            *ptr = 42;  // SEGFAULT!
        });
    }
};

RCLCPP_COMPONENTS_REGISTER_NODE(BuggyComponent)
```

**Container with 3 components:**
```python
ComposableNodeContainer(
    composable_node_descriptions=[
        ComposableNode(package='pkg1', plugin='GoodComponent1'),
        ComposableNode(package='pkg2', plugin='BuggyComponent'),  # Crashes!
        ComposableNode(package='pkg3', plugin='GoodComponent3'),
    ]
)
```

**Result:**
- BuggyComponent crashes
- **Entire container dies** (segfault)
- GoodComponent1 and GoodComponent3 also killed (same process)

**Trade-off:**

| Approach | Isolation | Performance |
|----------|-----------|-------------|
| **Separate processes** | High (crash isolated) | Lower (DDS overhead) |
| **Composed** | None (crash kills all) | Higher (zero-copy) |

**Mitigation:**

**1. Thorough testing:**
```bash
# Test component standalone first
ros2 run my_pkg buggy_component_node

# Then compose
```

**2. Separate containers for critical components:**
```python
# Container 1: Critical components (isolated)
container1 = ComposableNodeContainer(
    composable_node_descriptions=[
        ComposableNode(package='safety', plugin='SafetyMonitor'),
    ]
)

# Container 2: Non-critical components
container2 = ComposableNodeContainer(
    composable_node_descriptions=[
        ComposableNode(package='vision', plugin='ImageProcessor'),
        ComposableNode(package='planning', plugin='PathPlanner'),
    ]
)
```

**3. Crash recovery:**
```python
# Launch with respawn
container = ComposableNodeContainer(
    ...,
    respawn=True,  # Restart container on crash
    respawn_delay=2.0
)
```

**Interview Insight:**
Composition sacrifices fault isolation for performance. Test components thoroughly and isolate critical ones in separate containers.

---

### Edge Case 4: Component Constructor Throws Exception

**Scenario:**
Component throws exception in constructor, preventing container from starting.

**Code:**
```cpp
class FailingComponent : public rclcpp::Node {
public:
    FailingComponent(const rclcpp::NodeOptions &options)
        : Node("failing", options)
    {
        // Exception in constructor!
        if (!initialize_hardware()) {
            throw std::runtime_error("Hardware initialization failed");
        }
    }

private:
    bool initialize_hardware() {
        return false;  // Simulate failure
    }
};

RCLCPP_COMPONENTS_REGISTER_NODE(FailingComponent)
```

**Container Launch:**
```python
ComposableNodeContainer(
    composable_node_descriptions=[
        ComposableNode(package='pkg1', plugin='GoodComponent'),
        ComposableNode(package='pkg2', plugin='FailingComponent'),  # Throws!
    ]
)
```

**Result:**
```
terminate called after throwing an instance of 'std::runtime_error'
  what():  Hardware initialization failed
Container crashed
```

**Problem:**
- Exception in constructor propagates to container
- Container dies, all components lost
- No graceful degradation

**Solution - Use Lifecycle:**

```cpp
class RobustComponent : public rclcpp_lifecycle::LifecycleNode {
public:
    RobustComponent(const rclcpp::NodeOptions &options)
        : LifecycleNode("robust", options)
    {
        // Constructor does minimal work (no throwing)
        RCLCPP_INFO(get_logger(), "Component created");
    }

    CallbackReturn on_configure(const rclcpp_lifecycle::State &) override {
        // Heavy initialization in configure (can fail gracefully)
        try {
            if (!initialize_hardware()) {
                RCLCPP_ERROR(get_logger(), "Hardware init failed");
                return CallbackReturn::FAILURE;  // Graceful failure
            }
            return CallbackReturn::SUCCESS;

        } catch (const std::exception &e) {
            RCLCPP_ERROR(get_logger(), "Exception: %s", e.what());
            return CallbackReturn::ERROR;
        }
    }
};
```

**Benefit:**
- Component loads successfully (minimal constructor)
- Failure happens in configure transition (doesn't kill container)
- Can retry or leave in unconfigured state

**Interview Insight:**
Keep component constructors lightweight. Use lifecycle nodes for components with heavy initialization that might fail.

---

## CODE_EXAMPLES

### Example 1: Image Processing Pipeline

**File: `camera_component.cpp`**

```cpp
#include "rclcpp/rclcpp.hpp"
#include "rclcpp_components/register_node_macro.hpp"
#include "sensor_msgs/msg/image.hpp"

class CameraComponent : public rclcpp::Node {
public:
    CameraComponent(const rclcpp::NodeOptions &options)
        : Node("camera", options)
    {
        declare_parameter("fps", 30);
        declare_parameter("width", 640);
        declare_parameter("height", 480);

        fps_ = get_parameter("fps").as_int();
        width_ = get_parameter("width").as_int();
        height_ = get_parameter("height").as_int();

        pub_ = create_publisher<sensor_msgs::msg::Image>("image_raw", 10);

        timer_ = create_wall_timer(
            std::chrono::milliseconds(1000 / fps_),
            std::bind(&CameraComponent::capture_image, this)
        );

        RCLCPP_INFO(get_logger(), "Camera component initialized: %dx%d @ %d fps",
                   width_, height_, fps_);
    }

private:
    void capture_image() {
        // Create image message with unique_ptr (zero-copy!)
        auto msg = std::make_unique<sensor_msgs::msg::Image>();

        msg->header.stamp = now();
        msg->header.frame_id = "camera_link";
        msg->height = height_;
        msg->width = width_;
        msg->encoding = "rgb8";
        msg->step = width_ * 3;
        msg->data.resize(height_ * width_ * 3);

        // Simulate camera capture
        generate_test_pattern(msg->data);

        // Publish with move (zero-copy to subscribers in same process)
        pub_->publish(std::move(msg));
    }

    void generate_test_pattern(std::vector<uint8_t> &data) {
        // Generate simple test pattern
        for (size_t i = 0; i < data.size(); i += 3) {
            data[i] = (i / 3) % 256;      // R
            data[i + 1] = (i / 3) % 128;  // G
            data[i + 2] = 255;            // B
        }
    }

    int fps_, width_, height_;
    rclcpp::Publisher<sensor_msgs::msg::Image>::SharedPtr pub_;
    rclcpp::TimerBase::SharedPtr timer_;
};

RCLCPP_COMPONENTS_REGISTER_NODE(CameraComponent)
```

**File: `image_processor_component.cpp`**

```cpp
#include "rclcpp/rclcpp.hpp"
#include "rclcpp_components/register_node_macro.hpp"
#include "sensor_msgs/msg/image.hpp"

class ImageProcessorComponent : public rclcpp::Node {
public:
    ImageProcessorComponent(const rclcpp::NodeOptions &options)
        : Node("image_processor", options)
    {
        declare_parameter("algorithm", "blur");
        algorithm_ = get_parameter("algorithm").as_string();

        sub_ = create_subscription<sensor_msgs::msg::Image>(
            "image_raw", 10,
            [this](sensor_msgs::msg::Image::UniquePtr msg) {
                process_image(std::move(msg));
            }
        );

        pub_ = create_publisher<sensor_msgs::msg::Image>("image_processed", 10);

        RCLCPP_INFO(get_logger(), "Image processor initialized: algorithm=%s",
                   algorithm_.c_str());
    }

private:
    void process_image(sensor_msgs::msg::Image::UniquePtr img) {
        auto start = std::chrono::steady_clock::now();

        // Process image (zero-copy received!)
        if (algorithm_ == "blur") {
            apply_blur(img->data);
        } else if (algorithm_ == "edge") {
            apply_edge_detection(img->data);
        }

        auto end = std::chrono::steady_clock::now();
        auto duration = std::chrono::duration_cast<std::chrono::microseconds>(
            end - start
        ).count();

        RCLCPP_DEBUG(get_logger(), "Processing took %ld μs", duration);

        // Publish processed image (move again for zero-copy)
        pub_->publish(std::move(img));
    }

    void apply_blur(std::vector<uint8_t> &data) {
        // Simple box blur
        // ... implementation ...
    }

    void apply_edge_detection(std::vector<uint8_t> &data) {
        // Sobel edge detection
        // ... implementation ...
    }

    std::string algorithm_;
    rclcpp::Subscription<sensor_msgs::msg::Image>::SharedPtr sub_;
    rclcpp::Publisher<sensor_msgs::msg::Image>::SharedPtr pub_;
};

RCLCPP_COMPONENTS_REGISTER_NODE(ImageProcessorComponent)
```

**Launch File: `pipeline.launch.py`**

```python
from launch import LaunchDescription
from launch_ros.actions import ComposableNodeContainer
from launch_ros.descriptions import ComposableNode

def generate_launch_description():
    # Create container with all components
    container = ComposableNodeContainer(
        name='image_pipeline_container',
        namespace='',
        package='rclcpp_components',
        executable='component_container_mt',  # Multi-threaded
        composable_node_descriptions=[
            # Camera component
            ComposableNode(
                package='vision_components',
                plugin='CameraComponent',
                name='camera',
                parameters=[{
                    'fps': 30,
                    'width': 1920,
                    'height': 1080
                }],
                extra_arguments=[{
                    'use_intra_process_comms': True
                }]
            ),
            # Image processor component
            ComposableNode(
                package='vision_components',
                plugin='ImageProcessorComponent',
                name='image_processor',
                parameters=[{
                    'algorithm': 'blur'
                }],
                extra_arguments=[{
                    'use_intra_process_comms': True
                }]
            ),
            # Object detector component
            ComposableNode(
                package='vision_components',
                plugin='ObjectDetectorComponent',
                name='object_detector',
                extra_arguments=[{
                    'use_intra_process_comms': True
                }]
            ),
        ],
        output='screen',
    )

    return LaunchDescription([container])
```

**Performance Measurement:**

```bash
# Separate processes
ros2 run camera_pkg camera_node &
ros2 run processor_pkg processor_node &
ros2 run detector_pkg detector_node &
ros2 topic hz /image_processed  # ~25 Hz (limited by overhead)

# Composed
ros2 launch vision_components pipeline.launch.py
ros2 topic hz /image_processed  # ~30 Hz (full rate, zero-copy!)
```

---

## INTERVIEW_QA

### Q1: What is component composition and why use it?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

**Component composition** = Running multiple nodes in **single process**.

**Benefits:**

1. **Zero-copy intra-process communication:**
   - No serialization/deserialization
   - Direct pointer passing (`std::unique_ptr`)

2. **Lower latency:**
   - Function calls instead of network
   - ~100x faster for large messages

3. **Reduced overhead:**
   - Fewer processes (less context switching)
   - Shared memory

4. **Better resource utilization:**
   - Single process easier to manage
   - Better CPU cache utilization

**When to Use:**

- High-frequency data (camera, lidar)
- Latency-critical pipelines
- Tightly coupled components (sensor → processing → output)

**When NOT to Use:**

- Need fault isolation (critical safety components)
- Distributed system (nodes on different machines)
- Independent development/testing

**Example:**

```
Separate: Camera → DDS (500μs) → Processor → DDS (500μs) → Detector
Total latency: ~1000μs

Composed: Camera → ptr → Processor → ptr → Detector
Total latency: ~10μs (100x faster!)
```

**Interview Insight:**
Composition trades isolation for performance. Use for tightly coupled, performance-critical pipelines.

---

### Q2: What's required for zero-copy intra-process communication?

**Difficulty:** ⭐⭐⭐⭐ (Hard)

**Answer:**

**Requirements:**

**1. Use unique_ptr (not shared_ptr):**
```cpp
// Zero-copy
auto msg = std::make_unique<Image>();
pub->publish(std::move(msg));  ✓

// DDS fallback
auto msg = std::make_shared<Image>();
pub->publish(msg);  ✗ (shared ownership, can't move)
```

**2. Enable intra-process comms:**
```cpp
NodeOptions().use_intra_process_comms(true)
```

**3. Same process:**
- Nodes must be in same container
- Or manually composed in same executable

**4. Matching QoS:**
```cpp
// Both must have compatible QoS
auto qos = rclcpp::QoS(10).reliable();
pub_ = create_publisher<Image>("topic", qos);
sub_ = create_subscription<Image>("topic", qos, ...);
```

**Fallback to DDS:**

Zero-copy **automatically falls back to DDS** if:
- Using shared_ptr
- QoS mismatch
- Multiple subscribers (can't move to all)
- Different processes

**Detection:**

```cpp
if (pub_->get_intra_process_publisher_count() == 0) {
    RCLCPP_WARN(logger, "No intra-process subscribers, using DDS");
}
```

**Interview Insight:**
Zero-copy requires unique_ptr, same process, and matching QoS. Silently falls back to DDS if requirements not met.

---

### Q3: How do you create a composable component?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

**Steps:**

**1. Constructor with NodeOptions:**
```cpp
class MyComponent : public rclcpp::Node {
public:
    // REQUIRED signature
    MyComponent(const rclcpp::NodeOptions &options)
        : Node("my_component", options)
    {
        // ...
    }
};
```

**2. Register component:**
```cpp
#include "rclcpp_components/register_node_macro.hpp"

RCLCPP_COMPONENTS_REGISTER_NODE(MyComponent)
```

**3. Build as shared library:**
```cmake
add_library(my_component SHARED src/my_component.cpp)
rclcpp_components_register_nodes(my_component "MyComponent")

install(TARGETS my_component
  LIBRARY DESTINATION lib
)
```

**4. Load component:**
```bash
# Manual
ros2 component load /ComponentManager my_pkg MyComponent

# Or launch file
ComposableNode(
    package='my_pkg',
    plugin='MyComponent',
    name='my_component'
)
```

**Key Differences from Regular Node:**

| Aspect | Regular Node | Component |
|--------|--------------|-----------|
| Constructor | `MyNode()` | `MyNode(NodeOptions&)` |
| main() | Required | Not needed (loaded dynamically) |
| Registration | None | `RCLCPP_COMPONENTS_REGISTER_NODE` |
| Build | Executable | Shared library |

**Interview Insight:**
Components require NodeOptions constructor, registration macro, and building as shared library.

---

### Q4: What happens if one component crashes in a container?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

**All components die** (same process).

**Example:**

```python
container = ComposableNodeContainer(
    composable_node_descriptions=[
        ComposableNode(package='pkg1', plugin='GoodComponent1'),
        ComposableNode(package='pkg2', plugin='CrashingComponent'),  # Segfaults
        ComposableNode(package='pkg3', plugin='GoodComponent3'),
    ]
)
```

**Result:**
- CrashingComponent segfaults
- Entire container process dies
- GoodComponent1 and GoodComponent3 also killed

**Trade-off:**

| Approach | Isolation | Performance |
|----------|-----------|-------------|
| Separate processes | High | Lower |
| Composed | None | Higher |

**Mitigation Strategies:**

**1. Isolate critical components:**
```python
# Critical in separate container
critical_container = ComposableNodeContainer(
    composable_node_descriptions=[
        ComposableNode(package='safety', plugin='SafetyMonitor'),
    ]
)

# Non-critical together
pipeline_container = ComposableNodeContainer(
    composable_node_descriptions=[
        ComposableNode(package='vision', plugin='Camera'),
        ComposableNode(package='vision', plugin='Processor'),
    ]
)
```

**2. Respawn on crash:**
```python
container = ComposableNodeContainer(
    ...,
    respawn=True,
    respawn_delay=2.0
)
```

**3. Thorough testing:**
```bash
# Test standalone first
ros2 run my_pkg component_node

# Then compose
```

**Interview Insight:**
Composition sacrifices fault isolation. Test thoroughly and isolate critical components in separate containers.

---

### Q5: Can you mix regular nodes and composable components?

**Difficulty:** ⭐⭐ (Easy)

**Answer:**

**Yes!** Components can communicate with regular nodes via DDS.

**Architecture:**

```
Process 1: component_container
  ├─ Component A (intra-process with B)
  └─ Component B

Process 2: regular_node_1

Process 3: regular_node_2

Communication:
- A ↔ B: Intra-process (zero-copy)
- A/B ↔ regular_node_1: DDS
- A/B ↔ regular_node_2: DDS
```

**Example:**

```python
# Composed components
container = ComposableNodeContainer(
    composable_node_descriptions=[
        ComposableNode(package='vision', plugin='CameraComponent'),
        ComposableNode(package='vision', plugin='ProcessorComponent'),
    ]
)

# Regular node
regular_node = Node(
    package='planning',
    executable='planner_node'  # Regular executable
)

return LaunchDescription([
    container,
    regular_node  # Both in same launch file
])
```

**Communication:**
- CameraComponent → ProcessorComponent: **Zero-copy** (same container)
- ProcessorComponent → planner_node: **DDS** (different processes)

**Interview Insight:**
Components interoperate with regular nodes via DDS. Intra-process only works within same container.

---

## PRACTICE_TASKS

### Task 1: Create Component Pipeline

Convert existing nodes to components:
- Image source node → ImageSourceComponent
- Filter node → FilterComponent
- Display node → DisplayComponent

Compose in single container with intra-process comms.

---

### Task 2: Performance Benchmark

Compare performance:
- 3 separate processes (DDS)
- 3 composed components (intra-process)

Measure: latency, CPU usage, memory.

---

### Task 3: Fault Isolation Strategy

Design system with:
- Safety-critical components (isolated)
- Vision pipeline (composed for performance)
- Planning components (separate processes)

Document isolation vs performance trade-offs.

---

## QUICK_REFERENCE

### Creating Component

```cpp
#include "rclcpp_components/register_node_macro.hpp"

class MyComponent : public rclcpp::Node {
public:
    MyComponent(const rclcpp::NodeOptions &options)
        : Node("my_component", options) { }
};

RCLCPP_COMPONENTS_REGISTER_NODE(MyComponent)
```

### CMakeLists.txt

```cmake
add_library(my_component SHARED src/my_component.cpp)
rclcpp_components_register_nodes(my_component "MyComponent")
install(TARGETS my_component LIBRARY DESTINATION lib)
```

### Loading Components

```bash
# Manual
ros2 run rclcpp_components component_container
ros2 component load /ComponentManager my_pkg MyComponent

# List
ros2 component types
ros2 component list
```

### Launch File

```python
ComposableNodeContainer(
    package='rclcpp_components',
    executable='component_container_mt',
    composable_node_descriptions=[
        ComposableNode(
            package='my_pkg',
            plugin='MyComponent',
            name='my_component',
            extra_arguments=[{'use_intra_process_comms': True}]
        ),
    ]
)
```

### Zero-Copy Publishing

```cpp
auto msg = std::make_unique<Image>();  // unique_ptr!
pub->publish(std::move(msg));         // move!
```

---

**END OF TOPIC 3.3**
