## TOPIC: Topics, Publishers, and Subscribers in ROS2

### THEORY_SECTION: Core Concepts and Foundations

#### What Are Topics in ROS2?

**Topics** are named channels for asynchronous, many-to-many communication between ROS2 nodes. They implement the publish-subscribe messaging pattern where publishers send messages to a topic without knowing who will receive them, and subscribers receive messages from a topic without knowing who sent them. This decoupling is fundamental to ROS2's distributed architecture and enables flexible, scalable robotics systems.

Unlike ROS1 which used a centralized rosmaster for discovery, ROS2 topics use **DDS (Data Distribution Service)** for peer-to-peer discovery and communication. DDS provides automatic endpoint matching, configurable Quality of Service (QoS) policies, and handles all network transport details transparently. When a publisher and subscriber have matching topic names, message types, and compatible QoS settings, DDS establishes a direct communication channel between them.

Topics are ideal for streaming data like sensor readings, robot state updates, or continuous telemetry. They support multiple publishers sending to the same topic (data fusion scenarios) and multiple subscribers receiving from one topic (fan-out patterns). Messages are typed - each topic has a specific message type defined in `.msg` files, ensuring type safety across the distributed system.

#### How Publishers Work Internally

A **Publisher** is created using `create_publisher<MessageType>(topic_name, qos)`. Internally, this:

1. **Registers with the node** - The publisher becomes part of the node's list of publishers for lifecycle management and introspection
2. **Creates a DDS DataWriter** - The underlying DDS middleware creates a DataWriter entity that will serialize and transmit messages
3. **Announces availability** - DDS sends discovery messages over multicast (or configured discovery server) advertising this publisher's topic, type, and QoS
4. **Waits for subscribers** - The publisher is ready but won't necessarily have matched subscribers immediately

When you call `publish(msg)`, the publisher:
- **Serializes the message** using CDR (Common Data Representation) format
- **Applies QoS policies** (reliability, durability, history)
- **Transmits via DDS** through shared memory (intra-process) or network sockets (inter-process)
- **Returns immediately** (non-blocking) unless synchronous QoS is configured

Publishers use **shared pointers** (`std::shared_ptr`) for message objects to enable efficient intra-process communication via zero-copy mechanisms when publisher and subscriber are in the same process.

#### How Subscribers Work Internally

A **Subscriber** is created using `create_subscription<MessageType>(topic_name, qos, callback)`. The process:

1. **Registers callback** - The user-provided callback function is stored and will be invoked when messages arrive
2. **Creates a DDS DataReader** - The middleware creates a DataReader that will receive and deserialize messages
3. **Announces subscription** - DDS broadcasts discovery info about this subscriber's requirements (topic, type, QoS)
4. **Matches with publishers** - DDS matches this subscriber with compatible publishers based on topic name, message type, and QoS compatibility

When a message arrives:
- **DDS receives the message** from the network or shared memory
- **Deserializes into C++ object** - CDR binary data becomes a typed message object
- **Places in callback queue** - The message is queued for the executor to process
- **Executor invokes callback** - Based on the executor's scheduling policy, the callback runs on a thread with the message as parameter

The callback executes in the context of an **executor thread**, not a DDS thread. This separation provides control over threading models and allows for single-threaded, multi-threaded, or custom executor strategies. Callbacks should be **fast and non-blocking** - long-running operations should be deferred to separate threads or use async patterns.

#### DDS Discovery and Topic Matching

When nodes start, DDS performs **automatic discovery**:

1. **Multicast announcement** - Each node broadcasts its presence, publishers, and subscribers over multicast group 239.255.0.1 (default)
2. **Listener nodes respond** - Other nodes hear the announcement and check for matching topics
3. **QoS negotiation** - DDS verifies QoS compatibility between potential publisher-subscriber pairs
4. **Endpoint creation** - If compatible, DDS establishes a communication channel (shared memory, UDP, TCP, or custom transport)

**Matching rules**:
- Topic names must be **exactly identical** (case-sensitive)
- Message types must be **exactly identical** (same package, same definition)
- QoS policies must be **compatible** (not necessarily identical - some policies like reliability have offer-request semantics)

If any of these conditions fail, the endpoints won't communicate, and no error is reported by default. This is a common debugging challenge in ROS2 systems.

#### Why Topics Matter in Interviews

Interviewers frequently test understanding of:
- **Asynchronous communication patterns** - How do you handle data that arrives at unpredictable times?
- **Decoupling benefits** - Why is publish-subscribe better than point-to-point for robotics?
- **DDS internals** - What happens under the hood when you publish a message?
- **Performance considerations** - When are topics appropriate vs. services or actions?
- **Debugging skills** - Why aren't my topics communicating?
- **QoS impact** - How do reliability, durability, and history affect topic behavior?

Understanding topics demonstrates grasp of distributed systems, message-oriented middleware, and asynchronous programming - all critical for robotics software engineering roles.

### EDGE_CASES: Tricky Scenarios and Deep Internals

#### Edge Case 1: QoS Mismatch Leading to Silent Communication Failure

One of the most frustrating debugging scenarios in ROS2 is when a publisher and subscriber exist on the same topic with the same message type, but **no communication occurs** and **no error is reported**.

```cpp
// Publisher node - uses RELIABLE QoS
auto qos_pub = rclcpp::QoS(10).reliable();
publisher_ = create_publisher<std_msgs::msg::String>("chatter", qos_pub);

// Subscriber node - requests TRANSIENT_LOCAL durability
auto qos_sub = rclcpp::QoS(10).transient_local();
subscription_ = create_subscription<std_msgs::msg::String>(
    "chatter", qos_sub, callback);
```

**Why it fails**: The publisher offers `VOLATILE` durability (default) but the subscriber requests `TRANSIENT_LOCAL`. DDS's offer-request QoS model means the subscriber requires historical messages, but the publisher doesn't provide them. DDS silently fails to match these endpoints.

**How to debug**:
```bash
ros2 topic info /chatter --verbose
# Look for "Subscription count" and "Publisher count" - may be 0 despite nodes running
# Check QoS settings of each endpoint - they'll differ
```

**The solution**: Either change subscriber to accept `VOLATILE`, or publisher to offer `TRANSIENT_LOCAL`. Many developers waste hours on this because ROS2 doesn't log QoS mismatches by default (though some DDS implementations can be configured to do so).

This demonstrates that QoS policies have **semantic meaning** beyond just performance tuning - they fundamentally affect communication viability.

#### Edge Case 2: Topic Name Remapping and Namespace Confusion

ROS2 supports topic name remapping to make nodes reusable, but this creates subtle bugs:

```cpp
// Node internally publishes to "cmd_vel"
publisher_ = create_publisher<geometry_msgs::msg::Twist>("cmd_vel", 10);

// Launch file remaps it
Node(
    package='my_pkg',
    executable='my_node',
    remappings=[('cmd_vel', 'robot1/cmd_vel')]
)
```

**What actually happens**:
- If node name is `/my_node` and default namespace is `/`, the published topic becomes `/robot1/cmd_vel`
- Subscribers must subscribe to `/robot1/cmd_vel`, not `/cmd_vel`
- If node is launched with namespace `robot1`, topic becomes `/robot1/robot1/cmd_vel` (double nesting!)

**The subtle issue**: Relative vs. absolute topic names. Topics without leading `/` are relative to the node's namespace. Topics with leading `/` are absolute. Private topics (starting with `~`) in ROS1 don't exist in ROS2 - use node-relative names instead.

```cpp
// Relative topic (affected by namespace and remapping)
create_publisher<T>("cmd_vel", 10);  // Becomes <namespace>/cmd_vel

// Absolute topic (ignores namespace, but remapping still applies)
create_publisher<T>("/cmd_vel", 10);  // Always /cmd_vel unless remapped

// Node-relative (ROS2 approach for "private" topics)
create_publisher<T>("~/cmd_vel", 10);  // Becomes /node_name/cmd_vel
```

**Interview relevance**: This tests understanding of ROS2's name resolution rules, which are more complex than ROS1 due to the removal of the rosmaster.

#### Edge Case 3: Message Ownership and Lifetime with Shared Pointers

ROS2 uses shared pointers extensively for message passing to enable zero-copy intra-process communication:

```cpp
// Publisher prepares message
auto msg = std::make_shared<std_msgs::msg::String>();
msg->data = "Hello";
publisher_->publish(*msg);  // ❌ BAD - copies the message
publisher_->publish(msg);    // ✅ GOOD - shares ownership
```

**Why this matters**: When you `publish(*msg)`, you dereference the shared pointer, forcing a copy. When you `publish(msg)`, ownership is shared, enabling zero-copy if the subscriber is in the same process.

**But there's a trap**:
```cpp
auto msg = std::make_shared<std_msgs::msg::String>();
msg->data = "Hello";
publisher_->publish(msg);
msg->data = "Modified";  // ❌ DANGEROUS - might affect subscriber!
```

If intra-process communication is enabled and subscriber hasn't processed the message yet, modifying `msg` **can corrupt the subscriber's data** because they share the same memory. The solution is to either:
- **Not modify** the message after publishing
- **Create a new message** for each publish call
- **Understand** when intra-process is active (same process, compatible QoS)

This demonstrates that zero-copy optimization comes with **shared ownership responsibilities** that C++ developers must understand.

#### Edge Case 4: Callback Execution and Blocking Behavior

A common mistake is writing blocking code in subscription callbacks:

```cpp
void callback(const std_msgs::msg::String::SharedPtr msg) {
    std::this_thread::sleep_for(std::chrono::seconds(5));  // ❌ BLOCKS EXECUTOR
    process_message(msg->data);
}
```

**Why it's problematic**: If you're using a `SingleThreadedExecutor` (default for `rclcpp::spin(node)`), this callback blocks **all other callbacks** in the node from executing for 5 seconds. Timers, other subscriptions, services, actions - all frozen.

**What happens**:
- Messages queue up in DDS buffers
- If history depth is exceeded, messages are **dropped** (with KeepLast QoS)
- System appears to "hang" or become unresponsive
- Real-time performance is destroyed

**Solutions**:
1. **Use MultiThreadedExecutor** - Callbacks run in parallel on thread pool
2. **Defer work to background thread** - Callback just enqueues work item
3. **Use async patterns** - Callback triggers async operation, returns immediately

```cpp
// Better approach - defer processing
void callback(const std_msgs::msg::String::SharedPtr msg) {
    // Just enqueue the message for background processing
    message_queue_.push(msg);  // Lock-free queue preferred
}

// Separate processing thread
void processing_thread() {
    while (rclcpp::ok()) {
        auto msg = message_queue_.pop();
        process_message(msg->data);  // Can take as long as needed
    }
}
```

This demonstrates understanding of **executor threading models** and **asynchronous programming patterns** essential for responsive robotics systems.

#### Edge Case 5: DDS Discovery Timing and Race Conditions

DDS discovery is **asynchronous and eventually consistent**, leading to race conditions:

```cpp
// Node 1 - starts and immediately publishes
auto node1 = std::make_shared<rclcpp::Node>("publisher_node");
auto pub = node1->create_publisher<std_msgs::msg::String>("test", 10);

auto msg = std::make_shared<std_msgs::msg::String>();
msg->data = "Early message";
pub->publish(msg);  // ❌ Might be lost - no subscribers discovered yet!

// Node 2 - starts 100ms later
std::this_thread::sleep_for(std::chrono::milliseconds(100));
auto node2 = std::make_shared<rclcpp::Node>("subscriber_node");
auto sub = node2->create_subscription<std_msgs::msg::String>(
    "test", 10, callback);
```

**What happens**: The first published message is likely **lost** because Node 2's subscriber hasn't completed discovery when Node 1 publishes. DDS discovery takes tens to hundreds of milliseconds depending on network conditions and DDS configuration.

**Solutions**:
1. **Wait for subscribers** before publishing critical initial messages:
```cpp
while (pub->get_subscription_count() == 0 && rclcpp::ok()) {
    rclcpp::sleep_for(std::chrono::milliseconds(100));
}
```

2. **Use TRANSIENT_LOCAL durability** so late subscribers get historical messages:
```cpp
auto qos = rclcpp::QoS(10).reliable().transient_local();
```

3. **Design for idempotency** - assume some messages may be lost and design accordingly

This illustrates that distributed systems have **temporal dependencies** that must be carefully managed, especially during startup or when nodes join dynamically.

#### Edge Case 6: Message Definition Compatibility and Hash Mismatches

ROS2 messages have cryptographic hashes based on their definition. If two nodes have **slightly different message definitions**, they won't communicate even if topic names match:

```cpp
// Package A - defines msg/Custom.msg
# Version 1
string name
int32 age

// Package B - defines msg/Custom.msg (different!)
# Version 2
string name
int64 age  # Changed int32 -> int64!
```

**What happens**: DDS compares message type hashes during discovery. Even though both are `package_a/msg/Custom`, the hash differs due to the int32→int64 change. **No communication occurs, no error reported by default.**

**How to detect**:
```bash
ros2 topic list -t  # Shows message types
ros2 interface show package_a/msg/Custom  # View exact definition
# If multiple packages define same message name, verify they're identical
```

**Best practices**:
- **Centralize message definitions** in a separate package that other packages depend on
- **Use versioning** for message packages (e.g., `sensor_msgs_v2`)
- **Never modify** message definitions in-place - create new messages instead
- **Document** message evolution in package README

This demonstrates understanding of **interface contracts** and **version management** in distributed systems - critical for large-scale robotics projects with multiple teams.

### CODE_EXAMPLES: Practical Demonstrations

#### Example 1: Basic Publisher and Subscriber (C++)

This example shows a complete ROS2 package with custom message, publisher, and subscriber following best practices.

**Folder structure:**
```
simple_talker_listener/
├── CMakeLists.txt
├── package.xml
├── msg/
│   └── PersonInfo.msg
├── src/
│   ├── talker_node.cpp
│   └── listener_node.cpp
```

**msg/PersonInfo.msg:**
```
string name
uint32 age
float64 height_meters
```

**src/talker_node.cpp:**
```cpp
#include <chrono>
#include <memory>
#include "rclcpp/rclcpp.hpp"
#include "simple_talker_listener/msg/person_info.hpp"

using namespace std::chrono_literals;

class TalkerNode : public rclcpp::Node {
public:
    TalkerNode() : Node("talker_node"), count_(0) {
        // Create publisher with explicit QoS
        auto qos = rclcpp::QoS(rclcpp::KeepLast(10))
            .reliable()
            .durability_volatile();

        publisher_ = this->create_publisher<simple_talker_listener::msg::PersonInfo>(
            "person_info", qos);

        // Create timer for periodic publishing
        timer_ = this->create_wall_timer(
            1s, std::bind(&TalkerNode::publish_person, this));

        RCLCPP_INFO(this->get_logger(), "Talker node started, publishing every 1 second");
    }

private:
    void publish_person() {
        auto msg = std::make_shared<simple_talker_listener::msg::PersonInfo>();
        msg->name = "Person_" + std::to_string(count_);
        msg->age = 20 + (count_ % 50);  // Age between 20-69
        msg->height_meters = 1.5 + (count_ % 10) * 0.05;  // Height 1.5-1.95m

        RCLCPP_INFO(this->get_logger(),
            "Publishing: %s, age=%u, height=%.2fm",
            msg->name.c_str(), msg->age, msg->height_meters);

        publisher_->publish(*msg);  // Using move semantics
        count_++;
    }

    rclcpp::Publisher<simple_talker_listener::msg::PersonInfo>::SharedPtr publisher_;
    rclcpp::TimerBase::SharedPtr timer_;
    size_t count_;
};

int main(int argc, char** argv) {
    rclcpp::init(argc, argv);
    auto node = std::make_shared<TalkerNode>();
    rclcpp::spin(node);
    rclcpp::shutdown();
    return 0;
}
```

**src/listener_node.cpp:**
```cpp
#include <memory>
#include "rclcpp/rclcpp.hpp"
#include "simple_talker_listener/msg/person_info.hpp"

class ListenerNode : public rclcpp::Node {
public:
    ListenerNode() : Node("listener_node") {
        // Create subscription with same QoS as publisher
        auto qos = rclcpp::QoS(rclcpp::KeepLast(10))
            .reliable()
            .durability_volatile();

        subscription_ = this->create_subscription<simple_talker_listener::msg::PersonInfo>(
            "person_info",
            qos,
            std::bind(&ListenerNode::person_callback, this, std::placeholders::_1));

        RCLCPP_INFO(this->get_logger(), "Listener node started, waiting for messages");
    }

private:
    void person_callback(const simple_talker_listener::msg::PersonInfo::SharedPtr msg) {
        RCLCPP_INFO(this->get_logger(),
            "Received: %s, age=%u, height=%.2fm",
            msg->name.c_str(), msg->age, msg->height_meters);

        // Example: Validation logic
        if (msg->age < 18) {
            RCLCPP_WARN(this->get_logger(), "Warning: Person is underage");
        }
        if (msg->height_meters < 1.0 || msg->height_meters > 2.5) {
            RCLCPP_WARN(this->get_logger(), "Warning: Unusual height detected");
        }
    }

    rclcpp::Subscription<simple_talker_listener::msg::PersonInfo>::SharedPtr subscription_;
};

int main(int argc, char** argv) {
    rclcpp::init(argc, argv);
    auto node = std::make_shared<ListenerNode>();
    rclcpp::spin(node);
    rclcpp::shutdown();
    return 0;
}
```

**CMakeLists.txt:**
```cmake
cmake_minimum_required(VERSION 3.8)
project(simple_talker_listener)

if(CMAKE_COMPILER_IS_GNUCXX OR CMAKE_CXX_COMPILER_ID MATCHES "Clang")
  add_compile_options(-Wall -Wextra -Wpedantic)
endif()

# Find dependencies
find_package(ament_cmake REQUIRED)
find_package(rclcpp REQUIRED)
find_package(std_msgs REQUIRED)
find_package(rosidl_default_generators REQUIRED)

# Generate custom message
rosidl_generate_interfaces(${PROJECT_NAME}
  "msg/PersonInfo.msg"
)

# Talker executable
add_executable(talker_node src/talker_node.cpp)
ament_target_dependencies(talker_node rclcpp)
rosidl_target_interfaces(talker_node ${PROJECT_NAME} "rosidl_typesupport_cpp")

# Listener executable
add_executable(listener_node src/listener_node.cpp)
ament_target_dependencies(listener_node rclcpp)
rosidl_target_interfaces(listener_node ${PROJECT_NAME} "rosidl_typesupport_cpp")

# Install executables
install(TARGETS
  talker_node
  listener_node
  DESTINATION lib/${PROJECT_NAME}
)

ament_package()
```

**package.xml:**
```xml
<?xml version="1.0"?>
<?xml-model href="http://download.ros.org/schema/package_format3.xsd" schematypens="http://www.w3.org/2001/XMLSchema"?>
<package format="3">
  <name>simple_talker_listener</name>
  <version>0.1.0</version>
  <description>Simple publisher-subscriber example with custom message</description>
  <maintainer email="dev@example.com">ROS2 Developer</maintainer>
  <license>Apache-2.0</license>

  <buildtool_depend>ament_cmake</buildtool_depend>

  <build_depend>rclcpp</build_depend>
  <build_depend>std_msgs</build_depend>
  <build_depend>rosidl_default_generators</build_depend>

  <exec_depend>rclcpp</exec_depend>
  <exec_depend>std_msgs</exec_depend>
  <exec_depend>rosidl_default_runtime</exec_depend>

  <member_of_group>rosidl_interface_packages</member_of_group>

  <export>
    <build_type>ament_cmake</build_type>
  </export>
</package>
```

**Build and run:**
```bash
# In workspace root
colcon build --packages-select simple_talker_listener
source install/setup.bash

# Terminal 1 - Publisher
ros2 run simple_talker_listener talker_node

# Terminal 2 - Subscriber
ros2 run simple_talker_listener listener_node

# Verify communication
ros2 topic echo /person_info
ros2 topic hz /person_info
ros2 topic info /person_info --verbose
```

**What this demonstrates:**
- ✅ Custom message definition and generation
- ✅ Proper QoS configuration (explicit, matching)
- ✅ Timer-based periodic publishing
- ✅ Callback-based subscription
- ✅ Logging with RCLCPP_INFO/WARN
- ✅ Clean node lifecycle with RAII
- ✅ Complete package structure for real projects

#### Example 2: Multi-Publisher, Single-Subscriber with QoS Compatibility

This example shows multiple publishers sending to the same topic with different QoS profiles, demonstrating compatibility rules.

**src/multi_publisher_demo.cpp:**
```cpp
#include <chrono>
#include <memory>
#include <thread>
#include "rclcpp/rclcpp.hpp"
#include "std_msgs/msg/string.hpp"

using namespace std::chrono_literals;

class ReliablePublisher : public rclcpp::Node {
public:
    ReliablePublisher() : Node("reliable_publisher") {
        // RELIABLE QoS - guarantees delivery with retransmission
        auto qos = rclcpp::QoS(10).reliable();
        pub_ = create_publisher<std_msgs::msg::String>("data_stream", qos);

        timer_ = create_wall_timer(500ms, [this]() {
            auto msg = std_msgs::msg::String();
            msg.data = "RELIABLE: Critical data #" + std::to_string(count_++);
            pub_->publish(msg);
            RCLCPP_INFO(get_logger(), "Published: %s", msg.data.c_str());
        });
    }
private:
    rclcpp::Publisher<std_msgs::msg::String>::SharedPtr pub_;
    rclcpp::TimerBase::SharedPtr timer_;
    int count_ = 0;
};

class BestEffortPublisher : public rclcpp::Node {
public:
    BestEffortPublisher() : Node("best_effort_publisher") {
        // BEST_EFFORT QoS - no retransmission, lowest latency
        auto qos = rclcpp::QoS(10).best_effort();
        pub_ = create_publisher<std_msgs::msg::String>("data_stream", qos);

        timer_ = create_wall_timer(500ms, [this]() {
            auto msg = std_msgs::msg::String();
            msg.data = "BEST_EFFORT: Fast data #" + std::to_string(count_++);
            pub_->publish(msg);
            RCLCPP_INFO(get_logger(), "Published: %s", msg.data.c_str());
        });
    }
private:
    rclcpp::Publisher<std_msgs::msg::String>::SharedPtr pub_;
    rclcpp::TimerBase::SharedPtr timer_;
    int count_ = 0;
};

class SubscriberNode : public rclcpp::Node {
public:
    SubscriberNode() : Node("subscriber_node") {
        // BEST_EFFORT subscriber - compatible with both publishers!
        auto qos = rclcpp::QoS(10).best_effort();

        sub_ = create_subscription<std_msgs::msg::String>(
            "data_stream", qos,
            [this](std_msgs::msg::String::SharedPtr msg) {
                RCLCPP_INFO(get_logger(), "Received: %s", msg->data.c_str());
            });

        RCLCPP_INFO(get_logger(), "Subscriber ready with BEST_EFFORT QoS");
    }
private:
    rclcpp::Subscription<std_msgs::msg::String>::SharedPtr sub_;
};

int main(int argc, char** argv) {
    rclcpp::init(argc, argv);

    // Create all nodes
    auto reliable_pub = std::make_shared<ReliablePublisher>();
    auto besteffort_pub = std::make_shared<BestEffortPublisher>();
    auto subscriber = std::make_shared<SubscriberNode>();

    // Use MultiThreadedExecutor to spin all nodes concurrently
    rclcpp::executors::MultiThreadedExecutor executor;
    executor.add_node(reliable_pub);
    executor.add_node(besteffort_pub);
    executor.add_node(subscriber);

    RCLCPP_INFO(rclcpp::get_logger("main"),
        "Starting multi-publisher demo - subscriber will receive from BOTH publishers");

    executor.spin();
    rclcpp::shutdown();
    return 0;
}
```

**Key insights:**
- ✅ BEST_EFFORT subscriber can receive from RELIABLE publisher (QoS downgrade allowed)
- ✅ RELIABLE subscriber **cannot** receive from BEST_EFFORT publisher (QoS upgrade not allowed)
- ✅ Multiple publishers on same topic merge their data streams
- ✅ Subscriber sees interleaved messages from both publishers
- ✅ MultiThreadedExecutor allows concurrent execution

**Build:**
```cmake
add_executable(multi_pub_demo src/multi_publisher_demo.cpp)
ament_target_dependencies(multi_pub_demo rclcpp std_msgs)
install(TARGETS multi_pub_demo DESTINATION lib/${PROJECT_NAME})
```

**Run and observe:**
```bash
ros2 run your_package multi_pub_demo

# In another terminal, check topic info
ros2 topic info /data_stream --verbose
# You'll see 2 publishers, 1 subscriber, with different QoS profiles
```

#### Example 3: Intra-Process Communication with Zero-Copy

This demonstrates ROS2's zero-copy optimization for publishers and subscribers in the same process.

**src/zero_copy_demo.cpp:**
```cpp
#include <chrono>
#include <memory>
#include "rclcpp/rclcpp.hpp"
#include "sensor_msgs/msg/image.hpp"

using namespace std::chrono_literals;

// Simulates camera publishing large images
class CameraPublisher : public rclcpp::Node {
public:
    CameraPublisher() : Node("camera_publisher") {
        auto qos = rclcpp::QoS(1).reliable();

        // Enable intra-process communication
        auto pub_options = rclcpp::PublisherOptions();
        pub_options.use_intra_process_comm = rclcpp::IntraProcessSetting::Enable;

        publisher_ = create_publisher<sensor_msgs::msg::Image>(
            "camera/image", qos, pub_options);

        timer_ = create_wall_timer(100ms, [this]() {
            publish_large_image();
        });

        RCLCPP_INFO(get_logger(), "Camera publisher with intra-process enabled");
    }

private:
    void publish_large_image() {
        // Create large image (1920x1080 RGB = 6.2 MB)
        auto msg = std::make_unique<sensor_msgs::msg::Image>();
        msg->height = 1080;
        msg->width = 1920;
        msg->encoding = "rgb8";
        msg->step = msg->width * 3;
        msg->data.resize(msg->height * msg->step);

        // Fill with dummy data
        std::fill(msg->data.begin(), msg->data.end(), frame_count_ % 256);

        RCLCPP_INFO(get_logger(), "Publishing frame %zu (%.2f MB)",
            frame_count_++, msg->data.size() / 1024.0 / 1024.0);

        // Publish with move semantics for zero-copy
        publisher_->publish(std::move(msg));
        // msg is now nullptr - ownership transferred
    }

    rclcpp::Publisher<sensor_msgs::msg::Image>::SharedPtr publisher_;
    rclcpp::TimerBase::SharedPtr timer_;
    size_t frame_count_ = 0;
};

class ImageProcessor : public rclcpp::Node {
public:
    ImageProcessor() : Node("image_processor") {
        auto qos = rclcpp::QoS(1).reliable();

        // Enable intra-process communication
        auto sub_options = rclcpp::SubscriptionOptions();
        sub_options.use_intra_process_comm = rclcpp::IntraProcessSetting::Enable;

        subscription_ = create_subscription<sensor_msgs::msg::Image>(
            "camera/image", qos,
            std::bind(&ImageProcessor::image_callback, this, std::placeholders::_1),
            sub_options);

        RCLCPP_INFO(get_logger(), "Image processor with intra-process enabled");
    }

private:
    void image_callback(sensor_msgs::msg::Image::UniquePtr msg) {
        // Received via zero-copy - msg is unique_ptr (exclusive ownership)
        RCLCPP_INFO(get_logger(), "Processing %ux%u image (%.2f MB)",
            msg->width, msg->height, msg->data.size() / 1024.0 / 1024.0);

        // Simulate processing time
        std::this_thread::sleep_for(std::chrono::milliseconds(10));

        // msg automatically destroyed when callback returns
    }

    rclcpp::Subscription<sensor_msgs::msg::Image>::SharedPtr subscription_;
};

int main(int argc, char** argv) {
    rclcpp::init(argc, argv);

    // IMPORTANT: For zero-copy, nodes must be in same process
    rclcpp::NodeOptions options;
    options.use_intra_process_comms(true);  // Enable for the context

    auto camera = std::make_shared<CameraPublisher>();
    auto processor = std::make_shared<ImageProcessor>();

    rclcpp::executors::MultiThreadedExecutor executor;
    executor.add_node(camera);
    executor.add_node(processor);

    RCLCPP_INFO(rclcpp::get_logger("main"),
        "Zero-copy demo: 6.2 MB images published at 10 Hz with no copying!");

    executor.spin();
    rclcpp::shutdown();
    return 0;
}
```

**Performance comparison:**

| Mode | Memory Copies | Latency | CPU Usage |
|------|---------------|---------|-----------|
| Inter-process (DDS) | 3-4 copies (serialize, network, deserialize) | 5-10 ms | High |
| Intra-process (zero-copy) | 0 copies (shared pointer) | < 1 ms | Low |

**Key learnings:**
- ✅ Zero-copy requires publisher and subscriber in **same process**
- ✅ Use `std::move()` when publishing to transfer ownership
- ✅ Subscriber receives `UniquePtr` (exclusive ownership) instead of `SharedPtr`
- ✅ Massive performance gain for large messages (images, point clouds)
- ✅ QoS must still be compatible even with intra-process

#### Example 4: Autonomous Vehicle - Sensor Fusion Demo

Real-world example showing multiple sensor topics feeding into a fusion node.

**src/sensor_fusion_demo.cpp:**
```cpp
#include <memory>
#include <chrono>
#include "rclcpp/rclcpp.hpp"
#include "sensor_msgs/msg/laser_scan.hpp"
#include "sensor_msgs/msg/imu.hpp"
#include "sensor_msgs/msg/nav_sat_fix.hpp"
#include "geometry_msgs/msg/pose_stamped.hpp"

using namespace std::chrono_literals;

// Simulates LiDAR sensor
class LidarNode : public rclcpp::Node {
public:
    LidarNode() : Node("lidar_sensor") {
        auto qos = rclcpp::SensorDataQoS();  // Predefined QoS for sensors
        pub_ = create_publisher<sensor_msgs::msg::LaserScan>("scan", qos);

        timer_ = create_wall_timer(100ms, [this]() {
            auto msg = sensor_msgs::msg::LaserScan();
            msg.header.stamp = this->now();
            msg.header.frame_id = "lidar_link";
            msg.angle_min = -M_PI;
            msg.angle_max = M_PI;
            msg.angle_increment = M_PI / 180.0;
            msg.range_min = 0.1;
            msg.range_max = 100.0;
            msg.ranges.resize(360, 10.0);  // Dummy data

            pub_->publish(msg);
        });
    }
private:
    rclcpp::Publisher<sensor_msgs::msg::LaserScan>::SharedPtr pub_;
    rclcpp::TimerBase::SharedPtr timer_;
};

// Simulates IMU sensor
class ImuNode : public rclcpp::Node {
public:
    ImuNode() : Node("imu_sensor") {
        auto qos = rclcpp::SensorDataQoS();
        pub_ = create_publisher<sensor_msgs::msg::Imu>("imu/data", qos);

        timer_ = create_wall_timer(10ms, [this]() {  // 100 Hz
            auto msg = sensor_msgs::msg::Imu();
            msg.header.stamp = this->now();
            msg.header.frame_id = "imu_link";
            msg.linear_acceleration.x = 0.1;
            msg.angular_velocity.z = 0.05;

            pub_->publish(msg);
        });
    }
private:
    rclcpp::Publisher<sensor_msgs::msg::Imu>::SharedPtr pub_;
    rclcpp::TimerBase::SharedPtr timer_;
};

// Sensor fusion node - subscribes to multiple topics
class FusionNode : public rclcpp::Node {
public:
    FusionNode() : Node("sensor_fusion") {
        // Subscribe to all sensors with appropriate QoS
        auto sensor_qos = rclcpp::SensorDataQoS();

        lidar_sub_ = create_subscription<sensor_msgs::msg::LaserScan>(
            "scan", sensor_qos,
            std::bind(&FusionNode::lidar_callback, this, std::placeholders::_1));

        imu_sub_ = create_subscription<sensor_msgs::msg::Imu>(
            "imu/data", sensor_qos,
            std::bind(&FusionNode::imu_callback, this, std::placeholders::_1));

        // Publish fused pose estimate
        auto pub_qos = rclcpp::QoS(10).reliable();
        pose_pub_ = create_publisher<geometry_msgs::msg::PoseStamped>("fused_pose", pub_qos);

        // Timer for fusion computation
        timer_ = create_wall_timer(50ms, [this]() { compute_fusion(); });

        RCLCPP_INFO(get_logger(), "Sensor fusion node initialized");
    }

private:
    void lidar_callback(const sensor_msgs::msg::LaserScan::SharedPtr msg) {
        latest_lidar_ = msg;
        lidar_count_++;
    }

    void imu_callback(const sensor_msgs::msg::Imu::SharedPtr msg) {
        latest_imu_ = msg;
        imu_count_++;
    }

    void compute_fusion() {
        if (!latest_lidar_ || !latest_imu_) {
            RCLCPP_WARN_THROTTLE(get_logger(), *get_clock(), 5000,
                "Waiting for sensor data (lidar: %zu, imu: %zu)",
                lidar_count_, imu_count_);
            return;
        }

        // Simple fusion: combine LiDAR obstacle detection with IMU motion
        auto pose = geometry_msgs::msg::PoseStamped();
        pose.header.stamp = this->now();
        pose.header.frame_id = "map";

        // Dummy fusion logic (real fusion would use EKF/UKF)
        pose.pose.position.x = std::sin(this->now().seconds() * 0.1) * 5.0;
        pose.pose.position.y = std::cos(this->now().seconds() * 0.1) * 5.0;
        pose.pose.orientation.w = 1.0;

        pose_pub_->publish(pose);

        RCLCPP_INFO_THROTTLE(get_logger(), *get_clock(), 1000,
            "Fused pose: [%.2f, %.2f] from %zu lidar + %zu imu measurements",
            pose.pose.position.x, pose.pose.position.y, lidar_count_, imu_count_);
    }

    rclcpp::Subscription<sensor_msgs::msg::LaserScan>::SharedPtr lidar_sub_;
    rclcpp::Subscription<sensor_msgs::msg::Imu>::SharedPtr imu_sub_;
    rclcpp::Publisher<geometry_msgs::msg::PoseStamped>::SharedPtr pose_pub_;
    rclcpp::TimerBase::SharedPtr timer_;

    sensor_msgs::msg::LaserScan::SharedPtr latest_lidar_;
    sensor_msgs::msg::Imu::SharedPtr latest_imu_;
    size_t lidar_count_ = 0;
    size_t imu_count_ = 0;
};

int main(int argc, char** argv) {
    rclcpp::init(argc, argv);

    auto lidar = std::make_shared<LidarNode>();
    auto imu = std::make_shared<ImuNode>();
    auto fusion = std::make_shared<FusionNode>();

    rclcpp::executors::MultiThreadedExecutor executor;
    executor.add_node(lidar);
    executor.add_node(imu);
    executor.add_node(fusion);

    RCLCPP_INFO(rclcpp::get_logger("main"),
        "Autonomous vehicle sensor fusion demo started");

    executor.spin();
    rclcpp::shutdown();
    return 0;
}
```

**What this demonstrates:**
- ✅ Real sensor message types (LaserScan, Imu)
- ✅ SensorDataQoS - optimized for sensor streams (best effort, keep last 1)
- ✅ Multiple subscription pattern (sensor fusion)
- ✅ Throttled logging to avoid spam
- ✅ Timestamp synchronization (header stamps)
- ✅ Typical autonomous vehicle architecture

**Run and visualize:**
```bash
ros2 run your_package sensor_fusion_demo

# Visualize in RViz2
rviz2
# Add LaserScan display (topic: /scan)
# Add PoseStamped display (topic: /fused_pose)

# Monitor data rates
ros2 topic hz /scan
ros2 topic hz /imu/data
ros2 topic hz /fused_pose
```

### INTERVIEW_QA: Comprehensive Questions and Answers

#### Q1: What is the difference between topics, services, and actions in ROS2?
**Difficulty:** #beginner
**Category:** #communication #fundamentals
**Concepts:** #topics #services #actions #async #sync #patterns

**Answer:**
Topics are asynchronous many-to-many publish-subscribe channels for streaming data, services are synchronous one-to-one request-response mechanisms for querying or commanding, and actions are asynchronous goal-oriented task mechanisms with continuous feedback for long-running operations.

**Explanation:**
Topics implement the Observer pattern where publishers broadcast data without knowing subscribers, ideal for sensor streams, status updates, or any continuous data flow. They're fire-and-forget - publishers don't wait for acknowledgment. Services implement RPC (Remote Procedure Call) where a client sends a request and blocks until receiving a response, suitable for on-demand queries like "get parameter" or single-shot commands like "reset system." Actions extend services by adding feedback during execution and cancellation support, designed for operations like "navigate to goal" where you need progress updates and the ability to abort. The choice depends on communication pattern: topics for data streams (odometry, camera), services for quick queries (get robot state), actions for tasks (move arm, plan path).

**Code example:**
```cpp
// Topic - one-way streaming
auto pub = node->create_publisher<sensor_msgs::msg::Imu>("imu", 10);
pub->publish(imu_msg);  // Fire and forget

// Service - request-response
auto client = node->create_client<std_srvs::srv::Trigger>("reset");
auto result = client->async_send_request(request);  // Waits for response

// Action - long-running with feedback
auto action_client = rclcpp_action::create_client<nav2_msgs::action::NavigateToPose>(node, "navigate_to_pose");
// Can receive periodic feedback and cancel if needed
```

**Key takeaway:** Use topics for continuous data streams, services for quick request-response, and actions for long-running tasks with progress feedback.

---

#### Q2: How does DDS discovery work under the hood, and why might two nodes on the same topic fail to communicate?
**Difficulty:** #advanced
**Category:** #networking #debugging
**Concepts:** #dds #discovery #multicast #qos #compatibility

**Answer:**
DDS discovery uses UDP multicast (default group 239.255.0.1) to announce endpoint presence, followed by QoS negotiation to establish compatible publisher-subscriber pairs; communication fails silently if topic names, message types, or QoS policies are incompatible.

**Explanation:**
When a ROS2 node starts, its DDS participant sends multicast SPDP (Simple Participant Discovery Protocol) announcements containing its GUID, available QoS profiles, and endpoints (publishers/subscribers). Other nodes receive these announcements and respond if they have matching topics. Then SEDP (Simple Endpoint Discovery Protocol) exchanges detailed endpoint information including exact message types and QoS requirements. DDS performs QoS matching where some policies must be identical (topic name, type hash) while others follow offer-request semantics (reliability, durability). If a subscriber requests RELIABLE but publisher offers BEST_EFFORT, no match occurs. Similarly, if message type hashes differ due to definition changes, endpoints won't communicate. Crucially, DDS provides no feedback for failed matches - tools like `ros2 topic info --verbose` must be used to diagnose. Network issues like firewall blocking multicast, wrong ROS_DOMAIN_ID, or network segmentation also cause silent failures.

**Key takeaway:** DDS discovery is multicast-based and requires exact topic names, compatible message types, and compatible QoS policies; failures are silent and require explicit debugging.

---

#### Q3: What happens if a publisher publishes faster than a subscriber can process messages?
**Difficulty:** #intermediate
**Category:** #performance #qos
**Concepts:** #backpressure #history #depth #keeplast #reliability

**Answer:**
Behavior depends on QoS history policy: with KEEP_LAST(n), the oldest unprocessed messages are dropped silently once the queue exceeds n, while KEEP_ALL attempts to buffer everything but may cause memory issues or back-pressure on the publisher with RELIABLE QoS.

**Explanation:**
The history QoS policy controls how many messages are queued before processing. KEEP_LAST(10) means only the most recent 10 messages are retained - if the subscriber is slow and 15 messages arrive, the oldest 5 are dropped to make room. This is appropriate for sensor data where fresh data matters more than completeness. KEEP_ALL preserves every message, which with RELIABLE QoS can trigger flow control where DDS back-pressures the publisher to slow down, potentially causing the publisher to block or timeout. With BEST_EFFORT QoS, back-pressure doesn't occur but messages are dropped earlier in the pipeline. In real systems, subscribers should either process quickly (< 1ms callbacks), defer work to background threads, or increase history depth to match expected data rates. Monitoring with `ros2 topic hz` and checking subscription statistics helps identify this issue.

**Code example:**
```cpp
// Fast publisher - 100 Hz
auto qos_pub = rclcpp::QoS(10).reliable();  // Only keeps last 10

// Slow subscriber with small queue
auto qos_sub = rclcpp::QoS(5).reliable();  // ❌ Will drop messages!

// Better: Match queue depth to data rate and processing time
auto qos_sub_better = rclcpp::QoS(100).reliable();  // 1 second buffer at 100 Hz
```

**Key takeaway:** History depth must account for publisher rate and subscriber processing time; KEEP_LAST drops old messages while KEEP_ALL can cause memory/flow-control issues.

---

#### Q4: Explain intra-process communication and when zero-copy optimization applies.
**Difficulty:** #advanced
**Category:** #performance #optimization
**Concepts:** #intraprocess #zerocopy #sharedptr #uniqueptr #memory

**Answer:**
Intra-process communication enables zero-copy message passing between nodes in the same process by transferring message ownership via smart pointers instead of serializing through DDS, requiring use_intra_process_comms=true and compatible QoS policies.

**Explanation:**
When publisher and subscriber are in the same process and intra-process is enabled, ROS2 bypasses DDS entirely. The publisher creates a message as a unique_ptr and transfers ownership directly to the subscriber through shared memory, avoiding serialization, network transmission, and deserialization. This requires: (1) Both nodes in same process, (2) `use_intra_process_comms(true)` set on NodeOptions, (3) Publisher uses `std::move()` or publishes unique_ptr directly, (4) Subscriber receives unique_ptr (exclusive ownership) instead of shared_ptr. The performance benefit is massive for large messages - an HD image (6MB) takes ~5-10ms via DDS but <1ms with zero-copy. However, zero-copy is fragile: QoS must still be compatible, and the subscriber cannot share the message with other subscribers (exclusive ownership). If multiple subscribers exist on the same topic in the same process, ROS2 falls back to shared_ptr with potential copying.

**Code example:**
```cpp
// Enable intra-process at node level
rclcpp::NodeOptions options;
options.use_intra_process_comms(true);
auto node1 = std::make_shared<MyPublisher>(options);
auto node2 = std::make_shared<MySubscriber>(options);

// Publisher transfers ownership
auto msg = std::make_unique<sensor_msgs::msg::Image>();
publisher->publish(std::move(msg));  // Zero-copy if conditions met

// Subscriber receives exclusive ownership
void callback(sensor_msgs::msg::Image::UniquePtr msg) {
    // msg is unique_ptr - you own it exclusively
}
```

**Key takeaway:** Zero-copy requires same process, enabled intra-process, and exclusive ownership via unique_ptr; provides massive performance gains for large messages.

---

#### Q5: How do you debug two nodes that aren't communicating despite being on the same topic?
**Difficulty:** #intermediate
**Category:** #debugging #troubleshooting
**Concepts:** #discovery #qos #namespaces #types #tools

**Answer:**
Use `ros2 topic list`, `ros2 topic info --verbose`, and `ros2 node info` to verify topic names match exactly (including namespaces), message types are identical (same package and definition hash), and QoS policies are compatible between publisher and subscriber.

**Explanation:**
The debugging process follows this checklist: (1) Verify topics exist with `ros2 topic list` - check for typos, namespace differences (/robot1/cmd_vel vs /cmd_vel), or remapping issues. (2) Check endpoints with `ros2 topic info /topic_name --verbose` to see publisher count, subscriber count, and their QoS settings - if counts are 0, nodes aren't advertising correctly. (3) Verify message types with `ros2 interface show package/msg/Type` - if nodes were built with different message definitions, type hashes won't match. (4) Check QoS compatibility - common failures include RELIABLE publisher with TRANSIENT_LOCAL subscriber, or mismatched history depth. (5) Verify network connectivity with `ros2 multicast receive` to test multicast functionality. (6) Check ROS_DOMAIN_ID matches between nodes - different domains isolate communication. (7) Inspect DDS logs by setting `RCUTILS_CONSOLE_OUTPUT_FORMAT` environment variable to see low-level DDS activity. Tools like `rqt_graph` visualize the node graph and make namespace issues obvious.

**Key takeaway:** Systematic debugging checks topic names (exact match), message types (identical definitions), QoS compatibility, and network/domain configuration.

---

#### Q6: What is the difference between RELIABLE and BEST_EFFORT QoS, and when would you use each?
**Difficulty:** #intermediate
**Category:** #qos #performance
**Concepts:** #reliability #besteffort #retransmission #latency #sensors

**Answer:**
RELIABLE guarantees message delivery through retransmission and acknowledgments but adds latency, while BEST_EFFORT transmits once without retries for minimal latency; use RELIABLE for critical data (commands, state) and BEST_EFFORT for high-frequency sensors (lidar, camera).

**Explanation:**
RELIABLE QoS implements TCP-like behavior where the publisher waits for acknowledgment from subscribers and retransmits lost packets, ensuring every message eventually arrives (assuming network recovers). This adds ~1-5ms latency overhead and can cause back-pressure if a slow subscriber can't keep up. BEST_EFFORT implements UDP-like behavior with fire-and-forget semantics - messages are sent once without acknowledgment, minimizing latency (<1ms) but allowing drops during network congestion. For sensors publishing at high rates (100Hz lidar, 30Hz camera), occasional drops are acceptable since fresh data arrives continuously, making BEST_EFFORT ideal. For critical data like navigation commands, system state, or configuration, RELIABLE ensures data integrity. The trade-off is latency vs. completeness. Note that RELIABLE subscriber can receive from BEST_EFFORT publisher (gets best-effort behavior) but BEST_EFFORT subscriber cannot receive from RELIABLE publisher (incompatible offer-request).

**Code example:**
```cpp
// Critical command - must arrive reliably
auto cmd_qos = rclcpp::QoS(10).reliable();
auto cmd_pub = node->create_publisher<geometry_msgs::msg::Twist>("cmd_vel", cmd_qos);

// High-frequency sensor - tolerate drops for low latency
auto sensor_qos = rclcpp::QoS(1).best_effort();
auto scan_pub = node->create_publisher<sensor_msgs::msg::LaserScan>("scan", sensor_qos);
```

**Key takeaway:** Use RELIABLE for critical data requiring guaranteed delivery; use BEST_EFFORT for high-rate sensors where latency matters more than completeness.

---

#### Q7: Explain the concept of topic remapping and how it affects namespace resolution.
**Difficulty:** #intermediate
**Category:** #deployment #namespaces
**Concepts:** #remapping #namespaces #launchfiles #name_resolution #relative_absolute

**Answer:**
Topic remapping rewrites topic names at node startup to enable reusable nodes in different contexts, combining with namespace prefixes to create unique topic names; resolution rules distinguish relative (namespace-prefixed), absolute (global), and node-relative (~/prefix) names.

**Explanation:**
ROS2 name resolution has three forms: (1) Relative topics like `"cmd_vel"` are prefixed with the node's namespace, so namespace="/robot1" makes it `/robot1/cmd_vel`. (2) Absolute topics like `"/cmd_vel"` ignore namespaces and always resolve to the same global name. (3) Node-relative topics like `"~/cmd_vel"` become `/node_name/cmd_vel` regardless of namespace. Remapping applies **after** namespace resolution, so you can remap `/robot1/cmd_vel` to `/robot1/velocity_command` in launch files. This enables running multiple instances of the same node with different topics - imagine two robots each running a "controller" node, remapped to robot-specific topics. Common pitfall: double-nesting when namespace and remapping both add prefixes. Launch files provide `--remap` argument syntax: `--remap old:=new` or programmatically via `remappings=[('old', 'new')]` in Python launch files.

**Code example:**
```python
# Launch file excerpt
Node(
    package='my_pkg',
    executable='controller',
    name='controller',
    namespace='robot1',
    remappings=[
        ('cmd_vel', 'mobile_base/cmd_vel')  # Relative remap
    ]
)
# Result: /robot1/mobile_base/cmd_vel
```

**Key takeaway:** Namespace prefixes apply first to relative names, then remapping rewrites names; understand relative vs absolute vs node-relative resolution to avoid confusion.

---

#### Q8: What happens to messages published before any subscribers exist?
**Difficulty:** #intermediate
**Category:** #qos #timing
**Concepts:** #durability #transientlocal #volatile #latejoin #discovery

**Answer:**
With default VOLATILE durability, messages published before subscribers exist are lost forever; TRANSIENT_LOCAL durability allows late-joining subscribers to receive historical messages stored by the publisher, controlled by history depth.

**Explanation:**
Durability controls whether historical messages are preserved for late-joining subscribers. VOLATILE (default) means messages exist only while being transmitted - publish before subscribers exist means data is lost. This is appropriate for real-time data like sensor streams where only current data matters. TRANSIENT_LOCAL stores recent messages (up to history depth) in the publisher's memory, allowing subscribers that join later to receive these cached messages. This is essential for slowly-changing data like maps, robot description, or configuration where late-joining nodes need the current state. The history policy (KEEP_LAST(n)) determines how many historical messages are retained. Note that TRANSIENT_LOCAL adds memory overhead and only works within the local DDS domain (not across networks by default). Discovery timing becomes less critical with TRANSIENT_LOCAL since subscribers can "catch up" on missed messages.

**Code example:**
```cpp
// Map publisher - late subscribers need the map
auto qos = rclcpp::QoS(1).reliable().transient_local();
auto map_pub = node->create_publisher<nav_msgs::msg::OccupancyGrid>("map", qos);
map_pub->publish(map_msg);

// Subscriber starts 5 seconds later - still receives the map
auto map_sub = node->create_subscription<nav_msgs::msg::OccupancyGrid>(
    "map", qos, callback);  // Will receive historical message
```

**Key takeaway:** VOLATILE (default) loses messages before subscribers join; TRANSIENT_LOCAL caches history for late-joiners, essential for static/slowly-changing data.

---

#### Q9: How do callback groups and executors relate to subscription callbacks in multi-threaded scenarios?
**Difficulty:** #advanced
**Category:** #concurrency #executors
**Concepts:** #callback_groups #multithreading #executor #reentrant #mutually_exclusive

**Answer:**
Callback groups (mutually_exclusive or reentrant) control whether callbacks can execute concurrently, combined with MultiThreadedExecutor to parallelize execution; mutually_exclusive prevents concurrent calls within a group while reentrant allows it.

**Explanation:**
By default, all subscriptions in a node belong to the same mutually_exclusive callback group, meaning even with MultiThreadedExecutor, callbacks execute serially to avoid race conditions. Creating a reentrant callback group allows that group's callbacks to execute in parallel on different threads, useful for independent subscriptions with no shared state. Multiple mutually_exclusive groups can execute in parallel with each other but serialize within themselves. This fine-grained control enables performance tuning: place fast callbacks in one group and slow callbacks in another to prevent blocking. SingleThreadedExecutor serializes all callbacks regardless of groups. Note that reentrant groups require thread-safe code (mutexes, atomics) to protect shared state. Callback groups are assigned when creating subscriptions via `SubscriptionOptions::callback_group`.

**Code example:**
```cpp
// Create reentrant group for independent subscriptions
auto reentrant_group = node->create_callback_group(
    rclcpp::CallbackGroupType::Reentrant);

// Fast callback - can execute concurrently
auto sub1 = node->create_subscription<MsgType>(
    "topic1", qos, callback1,
    rclcpp::SubscriptionOptions().callback_group(reentrant_group));

// Another fast callback - can run in parallel with sub1
auto sub2 = node->create_subscription<MsgType>(
    "topic2", qos, callback2,
    rclcpp::SubscriptionOptions().callback_group(reentrant_group));

// Use MultiThreadedExecutor to enable parallelism
rclcpp::executors::MultiThreadedExecutor executor(rclcpp::ExecutorOptions(), 4);
executor.add_node(node);
executor.spin();
```

**Key takeaway:** Callback groups control concurrency: mutually_exclusive serializes, reentrant parallelizes; requires MultiThreadedExecutor and thread-safe code for reentrant groups.

---

#### Q10: What are the performance implications of different QoS combinations, and how would you profile topic performance?
**Difficulty:** #advanced
**Category:** #performance #profiling
**Concepts:** #qos #latency #throughput #profiling #benchmarking

**Answer:**
QoS combinations affect latency, throughput, and reliability: RELIABLE+TRANSIENT_LOCAL adds maximum overhead (~5-10ms latency, memory for history), while BEST_EFFORT+VOLATILE+KEEP_LAST(1) minimizes latency (<1ms); profile using `ros2 topic hz`, `ros2 topic bw`, and DDS latency tools.

**Explanation:**
Performance characteristics: (1) Reliability: RELIABLE adds 1-5ms RTT latency for acknowledgments and retransmission logic, BEST_EFFORT has <1ms overhead. (2) Durability: TRANSIENT_LOCAL consumes memory proportional to history depth * message size and adds serialization overhead for historical message retrieval. (3) History: KEEP_LAST(n) with large n increases memory but provides buffering against processing delays, KEEP_LAST(1) minimizes memory but drops messages under load. (4) Intra-process: Bypassing DDS reduces 5-10ms inter-process latency to <1ms shared memory transfer. Profiling tools: `ros2 topic hz` measures publication rate, `ros2 topic bw` measures bandwidth (bytes/sec), `ros2 topic delay` (if available) measures latency, and DDS-specific tools like FastDDS Monitor provide detailed statistics. For critical paths, instrument code with timing measurements around publish/callback boundaries. Typical results: sensor topics need <10ms latency, control loops need <1ms, visualization tolerates 100ms+.

**Code example:**
```cpp
// Lowest latency configuration for control loop
auto qos = rclcpp::QoS(1)
    .best_effort()
    .durability_volatile()
    .keep_last(1);  // < 1ms latency

// High reliability for critical data with buffering
auto qos_reliable = rclcpp::QoS(100)
    .reliable()
    .transient_local()
    .keep_last(100);  // ~5-10ms latency, high memory

// Profile with ROS2 tools
// ros2 topic hz /topic_name
// ros2 topic bw /topic_name
// ros2 topic info /topic_name --verbose
```

**Key takeaway:** QoS trade-offs are latency vs reliability vs memory; profile using ROS2 CLI tools and measure actual latency/bandwidth for your specific use case.

---

(Continuing with 10 more questions to reach 20 total...)

#### Q11: How does ROS2 handle large message sizes, and when should you consider splitting messages or using a different communication pattern?
**Difficulty:** #advanced
**Category:** #performance #design_pattern
**Concepts:** #message_size #fragmentation #zerocopy #services #large_data

**Answer:**
DDS fragments large messages (>64KB typically) into chunks automatically, adding latency and increasing packet loss probability; consider shared memory via intra-process for same-process nodes, services for on-demand large data, or external file/database for massive datasets.

**Explanation:**
DDS has an internal fragmentation limit (often 64KB) where larger messages are split into chunks, transmitted separately, and reassembled at the receiver. This works transparently but adds latency (multiple RTTs for RELIABLE) and amplifies packet loss probability (losing one chunk loses the entire message). For images (1-10MB), point clouds (1-50MB), or high-res maps, this overhead is significant. Strategies: (1) Intra-process zero-copy if nodes are co-located (bypasses DDS entirely). (2) Reduce message size via compression (sensor_msgs/CompressedImage), downsampling, or region-of-interest cropping. (3) Use services instead of topics if data is requested infrequently (on-demand vs streaming). (4) Store large data externally (filesystem, database, cloud storage) and publish only references/URLs. (5) Split large messages into smaller incremental updates (map tiles instead of full map). Tools like `ros2 topic bw` reveal bandwidth usage; sustained >100MB/s often indicates inefficiency.

**Key takeaway:** DDS fragments large messages with overhead; use intra-process zero-copy, compression, or external storage for large data instead of raw topic publishing.

---

#### Q12: Explain the role of message timestamps in ROS2 topics and how time synchronization affects multi-sensor fusion.
**Difficulty:** #intermediate
**Category:** #time #sensor_fusion
**Concepts:** #timestamp #header #timesync #approximatesync #synchronization

**Answer:**
ROS2 messages use `std_msgs/Header` with `stamp` field for timestamping, critical for correlating data from sensors with different publication rates; time synchronization via NTP or PTP ensures timestamps from different machines are comparable.

**Explanation:**
Most sensor messages (LaserScan, Image, Imu) include a header with a timestamp field set by the publisher (usually `node->now()` or hardware timestamp). These timestamps enable: (1) Time-correlation - matching sensor data from the same moment despite arriving at different times. (2) Latency measurement - comparing timestamp to processing time. (3) Historical playback - rosbag2 preserves timestamps for reproducible testing. In multi-sensor fusion, algorithms like EKF require synchronized timestamps to associate measurements - if camera publishes at 30Hz and lidar at 10Hz, the fusion node must find the closest timestamp matches. `message_filters::ApproximateTimeSynchronizer` provides this functionality. For distributed systems (multi-robot, edge compute), NTP (Network Time Protocol) synchronizes clocks to ~millisecond precision; PTP (Precision Time Protocol) achieves microsecond sync for real-time systems. Without time sync, fusion breaks because each machine's `now()` is different.

**Code example:**
```cpp
// Sensor node - stamp with node's clock
auto msg = sensor_msgs::msg::LaserScan();
msg.header.stamp = this->now();  // ROS2 steady_clock time
msg.header.frame_id = "lidar_link";  // Coordinate frame

// Fusion node - check timestamp age
void callback(const sensor_msgs::msg::LaserScan::SharedPtr msg) {
    auto age = (this->now() - msg->header.stamp).seconds();
    if (age > 0.1) {
        RCLCPP_WARN(get_logger(), "Old data: %.3f seconds old", age);
    }
}
```

**Key takeaway:** Message timestamps enable time-correlation in sensor fusion; distributed systems require time synchronization (NTP/PTP) for meaningful timestamp comparison.

---

#### Q13: What is the purpose of the `this->get_clock()` method, and how does it differ from `std::chrono` for timing in ROS2?
**Difficulty:** #intermediate
**Category:** #time #simulation
**Concepts:** #clock #simtime #walltime #steadyclock #rosbag

**Answer:**
`get_clock()` returns a ROS2 clock that respects simulation time (/clock topic) when use_sim_time parameter is true, allowing consistent timing behavior in simulation or rosbag playback; `std::chrono` always uses system wall time.

**Explanation:**
ROS2 supports multiple time sources: RCL_ROS_TIME (default, respects use_sim_time parameter), RCL_SYSTEM_TIME (always wall time), and RCL_STEADY_TIME (monotonic, never jumps). When `use_sim_time=true`, `get_clock()` returns simulated time from the /clock topic published by simulators (Gazebo) or rosbag2 during playback. This ensures timers, timestamps, and rate-limiters behave correctly in simulation where time may run faster/slower than real-time. Using `std::chrono::system_clock` directly bypasses ROS2 time abstractions and always uses wall time, breaking simulation behavior. Always use `node->now()`, `node->get_clock()`, and `rclcpp::Rate` for ROS2-aware timing. Note that transitioning use_sim_time from false to true requires node restart in most cases.

**Code example:**
```cpp
// ROS2-aware timing - respects simulation
auto timestamp = this->now();  // Uses ROS2 clock
auto rate = rclcpp::Rate(10.0);  // ROS2 rate, sim-aware

while (rclcpp::ok()) {
    // Work...
    rate.sleep();  // Sleeps relative to ROS2 time
}

// ❌ Wrong - breaks in simulation
auto now = std::chrono::system_clock::now();  // Always wall time
std::this_thread::sleep_for(100ms);  // Always wall time
```

**Key takeaway:** Use ROS2 clock APIs (`now()`, `get_clock()`, `Rate`) instead of `std::chrono` to ensure simulation time compatibility.

---

#### Q14: How do you monitor and debug topic communication at scale in a system with hundreds of topics?
**Difficulty:** #advanced
**Category:** #debugging #monitoring
**Concepts:** #introspection #monitoring #tools #rqt #prometheus

**Answer:**
Use `rqt_graph` for visual topology, `ros2 topic list` with filtering, programmatic introspection via `get_publishers_info_by_topic()`, and integrate with monitoring systems like Prometheus for production deployments.

**Explanation:**
At scale, manual inspection isn't feasible. Tools: (1) `rqt_graph` visualizes the node-topic graph but becomes cluttered with >50 topics - use filters and zoom. (2) `ros2 topic list` supports regex filtering: `ros2 topic list | grep /robot1` shows only robot1's topics. (3) Programmatic introspection: use `node->get_publishers_info_by_topic("/topic")` to query endpoint details from code, enabling automated health checks. (4) Custom monitoring nodes can subscribe to critical topics and publish health metrics (message rate, latency, missing data) to a monitoring topic. (5) Production systems integrate with Prometheus (export ROS2 metrics), Grafana (visualization), or custom dashboards. (6) DDS provides built-in statistics via `ros2 node info` showing subscription/publication counts. (7) Log aggregation systems (ELK stack, Loki) collect node logs for correlation analysis. Key pattern: build health monitoring into the system architecture from the start, not as an afterthought.

**Key takeaway:** Large-scale systems require automated monitoring (Prometheus, custom health nodes) and programmatic introspection APIs, not just CLI tools.

---

#### Q15: What are the security implications of ROS2 topic communication, and how does SROS2 address them?
**Difficulty:** #advanced
**Category:** #security
**Concepts:** #sros2 #security #encryption #authentication #authorization

**Answer:**
Default ROS2 topics use unencrypted DDS multicast visible to any network participant; SROS2 (Secure ROS2) adds authentication via certificates, encryption via AES/RSA, and access control via permission files to secure topic communication.

**Explanation:**
Without SROS2, any node can subscribe to topics, publish fake data, or sniff network traffic, posing risks for production systems. SROS2 implements DDS security standard (DDS-Sec) providing: (1) Authentication - nodes prove identity using X.509 certificates before joining the domain. (2) Encryption - DDS payloads encrypted via AES-GCM, keys distributed securely via RTPS. (3) Access control - XML permission files specify which nodes can publish/subscribe to which topics. Setup involves generating a keystore (certificate authority), creating keys per node, and configuring permissions. Overhead: ~10-20% performance penalty due to encryption/decryption. SROS2 is essential for public networks, cloud robotics, multi-tenant systems, or regulated industries (medical, automotive). Alternatives: network isolation (VLANs), VPNs for inter-site communication, or custom middleware security layers.

**Code example:**
```bash
# Generate SROS2 keystore
ros2 security create_keystore demo_keys

# Create keys for a node
ros2 security create_key demo_keys /my_node

# Create permission file (XML)
# Specifies allow/deny rules for topics

# Run node with security
ROS_SECURITY_ENABLE=true ROS_SECURITY_KEYSTORE=$PWD/demo_keys \
ros2 run my_pkg my_node
```

**Key takeaway:** Default ROS2 is insecure; SROS2 provides authentication, encryption, and access control at the cost of setup complexity and performance overhead.

---

(10 more questions to complete the comprehensive interview set - continuing in next response due to length...)

#### Q16: How do you implement a custom QoS profile for specific application requirements?
**Difficulty:** #intermediate
**Category:** #qos #configuration
**Concepts:** #custom_qos #profiles #tuning #application_specific

**Answer:**
Create custom QoS profiles by combining policies (reliability, durability, history, lifespan, deadline) based on application needs, often starting from predefined profiles (SensorDataQoS, ServicesQoS) and modifying specific policies.

**Explanation:**
ROS2 provides predefined profiles as starting points: SensorDataQoS (best effort, volatile, keep last 5), ServicesQoS (reliable, volatile, keep last 10), ParametersQoS (reliable, transient local, keep last 1000), and SystemDefaultsQoS. Custom profiles extend these by modifying individual policies. For example, a map server might use: reliable (guaranteed delivery), transient_local (late subscribers get map), keep_last(1) (only latest map matters), and liveliness (detect if map server crashes). A vision pipeline might use: best_effort (low latency), volatile (no history), keep_last(1) (only latest frame), deadline(33ms for 30Hz), and lifespan(100ms to drop old frames). Profile design requires understanding application tolerance for loss, latency sensitivity, memory constraints, and reliability needs. Document QoS choices in code comments explaining the rationale.

**Code example:**
```cpp
// Custom QoS for map server
auto map_qos = rclcpp::QoS(1)
    .reliable()              // Maps must arrive
    .transient_local()       // Late joiners need the map
    .keep_last(1)            // Only latest map version matters
    .liveliness(rclcpp::LivelinessPolicy::Automatic)
    .liveliness_lease_duration(std::chrono::seconds(5));  // Detect dead map server

auto map_pub = node->create_publisher<nav_msgs::msg::OccupancyGrid>("map", map_qos);

// Custom QoS for high-speed vision with deadline
auto vision_qos = rclcpp::QoS(1)
    .best_effort()           // Latency over reliability
    .keep_last(1)            // Only latest frame
    .deadline(rclcpp::Duration(0, 33'000'000))  // Expect 30Hz
    .lifespan(rclcpp::Duration(0, 100'000'000)); // Drop frames >100ms old

auto image_sub = node->create_subscription<sensor_msgs::msg::Image>(
    "camera/image", vision_qos, callback);
```

**Key takeaway:** Custom QoS profiles balance application-specific requirements; start from predefined profiles and modify policies with documented reasoning.

---

#### Q17: What causes "discovery timeout" errors and how do you troubleshoot them?
**Difficulty:** #intermediate
**Category:** #debugging #networking
**Concepts:** #discovery #timeout #multicast #firewall #domain

**Answer:**
Discovery timeouts occur when DDS participants can't find each other due to network issues (firewall blocking multicast, wrong subnet), different ROS_DOMAIN_ID, or misconfigured DDS discovery settings; troubleshoot using multicast tests and network inspection.

**Explanation:**
DDS discovery uses UDP multicast (group 239.255.0.1, ports 7400-7600) which many networks block. Troubleshooting steps: (1) Verify multicast reception: `ros2 multicast receive` on one machine, `ros2 multicast send` on another - if no messages received, multicast is blocked. (2) Check ROS_DOMAIN_ID matches: `echo $ROS_DOMAIN_ID` on all machines - different IDs isolate communication. (3) Inspect network: `ifconfig`/`ip addr` shows active interfaces - nodes must be on same subnet for multicast or use unicast discovery. (4) Check firewall: `sudo ufw status`, `sudo iptables -L` - firewall may block DDS ports. (5) Try unicast discovery: configure `FASTDDS_DEFAULT_PROFILES_FILE` to use unicast with explicit peer IPs. (6) Increase discovery timeout in DDS vendor QoS (FastDDS XML config file). (7) Use `ros2 daemon stop` and restart to clear stale discovery cache. Common causes: Docker containers with bridge networking, WiFi with client isolation, cloud networks without multicast support, or Windows firewall blocking ROS2.

**Key takeaway:** Discovery timeouts stem from network issues; test multicast, verify domain IDs match, and check firewall/routing configuration.

---

#### Q18: How do namespace and node names interact with topic names, and how do you avoid name collisions in multi-robot systems?
**Difficulty:** #intermediate
**Category:** #namespaces #multi_robot
**Concepts:** #namespaces #naming_conventions #multi_robot #name_collision #scoping

**Answer:**
Node names and namespaces prefix relative topic names creating unique paths (/namespace/node_name/topic), while absolute topics (leading /) bypass this scoping; multi-robot systems use per-robot namespaces and consistent naming conventions to avoid collisions.

**Explanation:**
Name resolution rules: (1) Absolute topic `/topic` is always global regardless of namespace. (2) Relative topic `topic` becomes `/namespace/topic` if namespace is set. (3) Node-relative topic `~/topic` becomes `/namespace/node_name/topic`. Multi-robot strategies: (1) Launch each robot in a unique namespace (`/robot1`, `/robot2`), making all relative topics robot-specific. (2) Use absolute names for truly global topics like /map (shared environment). (3) Standardize node names across robots so `/robot1/controller` and `/robot2/controller` have predictable topics. (4) Use remapping to connect multi-robot topics to central coordinators (remap `/robot1/odom` to `/multi_robot/robot1_odom` for fusion). (5) Avoid hardcoding node names; use parameters for dynamic configuration. (6) Document naming conventions in README to maintain consistency across teams.

**Code example (Python launch):**
```python
# Multi-robot launch
robots = ['robot1', 'robot2', 'robot3']
nodes = []

for robot in robots:
    nodes.append(Node(
        package='robot_control',
        executable='controller',
        name='controller',
        namespace=robot,  # Each robot gets unique namespace
        remappings=[
            # Absolute topic for shared map
            ('map', '/map'),
            # Relative topics become /robot1/cmd_vel, /robot2/cmd_vel, etc.
        ]
    ))
```

**Key takeaway:** Namespaces isolate robot-specific topics; use consistent naming, relative topics for per-robot data, and absolute topics for shared resources.

---

#### Q19: Explain the relationship between ROS2 topics and DDS DataWriters/DataReaders at the implementation level.
**Difficulty:** #expert
**Category:** #internals #dds
**Concepts:** #dds #datawriter #datareader #rmw #middleware #abstraction

**Answer:**
ROS2 publishers wrap DDS DataWriters and subscribers wrap DataReaders through the RMW (ROS MiddleWare) abstraction layer, translating ROS2 API calls to vendor-specific DDS operations while providing a unified interface across DDS implementations.

**Explanation:**
The RMW layer abstracts DDS vendor differences (FastDDS, CycloneDDS, Connext) behind a common C API. When you call `create_publisher()`, ROS2: (1) Allocates a publisher object in rclcpp. (2) Calls rmw_create_publisher() in the RMW layer. (3) RMW translates to DDS-specific calls like `DomainParticipant::create_publisher()` and `Publisher::create_datawriter()`. (4) Configures DataWriter QoS from ROS2 QoS policies. (5) Registers DataWriter with DDS participant for discovery. Similarly, `publish()` serializes the message to CDR, calls `DataWriter::write()`, which sends via DDS transport. Subscribers follow the same pattern with DataReaders. The rmw_fastrtps or rmw_cyclonedds packages implement this translation. Understanding this architecture explains why DDS tools (like FastDDS Monitor) can inspect ROS2 systems and why DDS configuration files affect ROS2 behavior. Advanced users can bypass RMW and use DDS directly for performance optimization.

**Key takeaway:** ROS2 topics are abstractions over DDS DataWriters/DataReaders via the RMW layer, enabling vendor portability while leveraging DDS features.

---

#### Q20: What are the best practices for designing topic interfaces in a large-scale ROS2 system?
**Difficulty:** #advanced
**Category:** #architecture #design_pattern
**Concepts:** #interface_design #message_design #system_architecture #best_practices #maintainability

**Answer:**
Design topic interfaces following principles: semantic topic names (describe data, not source), versioned message types for backward compatibility, appropriate QoS for each topic's role, documentation of expected rates and latency, and centralized message package for shared definitions across multiple nodes.

**Explanation:**
Best practices: (1) **Topic naming**: Use semantic names like `/vehicle/velocity` not `/controller/output`. Structure hierarchically: `/robot_name/subsystem/data_type`. Avoid abbreviations unless universal. (2) **Message design**: Keep messages focused (single responsibility), use standard types (geometry_msgs, sensor_msgs) when possible, add semantic fields (frame_id, timestamp in header), version message packages with breaking changes. (3) **QoS selection**: Document QoS rationale in code, match publisher/subscriber QoS explicitly, use profiles for consistency. (4) **Performance**: Specify expected publication rates in doc comments, design for largest expected message size, consider bandwidth constraints. (5) **Message packaging**: Create shared msg packages depended on by multiple nodes, never duplicate message definitions, use message composition for complex types. (6) **Documentation**: Document units in field comments, specify coordinate frames and conventions, provide example usage in package README. (7) **Testing**: Validate messages against schemas, test QoS compatibility, measure actual bandwidth usage.

**Code example:**
```cpp
/**
 * Topic: /vehicle/cmd_vel
 * Type: geometry_msgs/msg/Twist
 * QoS: Reliable, Keep Last 10, Deadline 100ms
 * Rate: 10-50 Hz (typical 20 Hz)
 * Description: Velocity commands for mobile base controller
 * Frame: base_link
 * Units: linear.x in m/s, angular.z in rad/s
 */
auto cmd_vel_pub = create_publisher<geometry_msgs::msg::Twist>(
    "cmd_vel",
    rclcpp::QoS(10).reliable().deadline(rclcpp::Duration(0, 100'000'000)));
```

**Key takeaway:** Good topic design requires semantic naming, documented QoS/rates, versioned messages, and centralized definitions; invest in interface design as it's hard to change later.

---

### PRACTICE_TASKS: Output Prediction and Code Analysis

#### Task 1: QoS Mismatch
```cpp
// Node A - Publisher
auto qos_pub = rclcpp::QoS(10).reliable().transient_local();
auto pub = node->create_publisher<std_msgs::msg::String>("test_topic", qos_pub);
pub->publish(std_msgs::msg::String().set__data("Hello"));

// Node B - Subscriber (started after publisher)
auto qos_sub = rclcpp::QoS(10).reliable().durability_volatile();
auto sub = node->create_subscription<std_msgs::msg::String>(
    "test_topic", qos_sub, callback);
```
**Question**: Will the subscriber receive messages? Why or why not?

**Expected Output**: No communication occurs

**Explanation**: QoS mismatch - publisher offers TRANSIENT_LOCAL durability but subscriber requests VOLATILE. DDS won't match these endpoints because the subscriber is asking for only future messages (volatile) but the publisher retains history (transient local). The subscriber must use TRANSIENT_LOCAL or accept any durability to be compatible.

---

#### Task 2: Topic Name Resolution
```cpp
// Node created with namespace
auto node = rclcpp::Node::make_shared("my_node", rclcpp::NodeOptions().namespace_("/robot1"));

// Publishers
auto pub1 = node->create_publisher<std_msgs::msg::String>("cmd_vel", 10);
auto pub2 = node->create_publisher<std_msgs::msg::String>("/cmd_vel", 10);
auto pub3 = node->create_publisher<std_msgs::msg::String>("~/cmd_vel", 10);
```
**Question**: What are the actual topic names for pub1, pub2, pub3?

**Expected Output**:
- pub1: `/robot1/cmd_vel` (relative, namespace-prefixed)
- pub2: `/cmd_vel` (absolute, global)
- pub3: `/robot1/my_node/cmd_vel` (node-relative)

**Explanation**: Relative topics get namespace prefix, absolute topics (leading /) are global, node-relative topics (~/prefix) combine namespace and node name.

---

#### Task 3: Callback Blocking
```cpp
class SlowSubscriber : public rclcpp::Node {
public:
    SlowSubscriber() : Node("slow_subscriber") {
        sub1_ = create_subscription<std_msgs::msg::String>(
            "fast_topic", 10, std::bind(&SlowSubscriber::callback1, this, _1));
        sub2_ = create_subscription<std_msgs::msg::String>(
            "other_topic", 10, std::bind(&SlowSubscriber::callback2, this, _1));
    }
private:
    void callback1(const std_msgs::msg::String::SharedPtr msg) {
        std::this_thread::sleep_for(std::chrono::seconds(5));  // Slow processing
    }
    void callback2(const std_msgs::msg::String::SharedPtr msg) {
        RCLCPP_INFO(get_logger(), "Fast callback: %s", msg->data.c_str());
    }
};

int main() {
    auto node = std::make_shared<SlowSubscriber>();
    rclcpp::spin(node);  // Default SingleThreadedExecutor
}
```
**Question**: If both topics publish at 10 Hz, what happens to messages on "other_topic"?

**Expected Output**: callback2 is blocked whenever callback1 is executing; messages queue up and may be dropped if history depth is exceeded.

**Explanation**: SingleThreadedExecutor serializes all callbacks. When callback1 sleeps for 5 seconds, no other callbacks execute. Messages arriving on "other_topic" during this time queue up to history depth (10), then older messages are dropped. Solution: use MultiThreadedExecutor or defer slow work to background thread.

---

#### Task 4: Message Ownership
```cpp
auto msg = std::make_shared<std_msgs::msg::String>();
msg->data = "Message 1";
publisher->publish(msg);  // Publish shared_ptr

msg->data = "Message 2";  // Modify after publish
std::this_thread::sleep_for(std::chrono::milliseconds(10));
```
**Question**: In an intra-process scenario, what might the subscriber receive?

**Expected Output**: Subscriber might receive "Message 2" instead of "Message 1" if callback hasn't executed yet.

**Explanation**: With intra-process and shared ownership, publisher and subscriber share the same memory. Modifying `msg` after publishing can corrupt data if the subscriber hasn't processed it yet. Best practice: use `std::move()` or don't modify messages after publishing.

---

#### Task 5: History Depth and Message Loss
```cpp
// Publisher at 100 Hz
auto qos_pub = rclcpp::QoS(10).reliable().keep_last(10);
auto pub = node->create_publisher<std_msgs::msg::Int32>("counter", qos_pub);

// Subscriber processes slowly (10 Hz)
auto qos_sub = rclcpp::QoS(10).reliable().keep_last(5);
auto sub = node->create_subscription<std_msgs::msg::Int32>(
    "counter", qos_sub,
    [](std_msgs::msg::Int32::SharedPtr msg) {
        std::this_thread::sleep_for(std::chrono::milliseconds(100));  // 10 Hz processing
        std::cout << msg->data << std::endl;
    });
```
**Question**: If publisher sends messages 0-99, what will subscriber likely see?

**Expected Output**: Subscriber receives approximately every 10th message (0, 10, 20, ..., 90) due to queue overflow and keep_last(5) policy dropping intermediate messages.

**Explanation**: Publisher sends 100 messages/sec but subscriber can only process 10/sec. Subscriber's queue (keep_last 5) fills up and old messages are dropped. With RELIABLE QoS, DDS applies flow control but still drops based on history policy. Subscriber sees sparse samples, not consecutive values.

---

#### Task 6: Multicast Discovery Timing
```cpp
// Start publisher
auto pub = node1->create_publisher<std_msgs::msg::String>("topic", 10);

auto msg = std_msgs::msg::String();
msg.data = "Early message";
pub->publish(msg);  // Published immediately

// Start subscriber 500ms later
std::this_thread::sleep_for(std::chrono::milliseconds(500));
auto sub = node2->create_subscription<std_msgs::msg::String>("topic", 10, callback);

// Publisher continues publishing
for (int i = 0; i < 10; i++) {
    msg.data = "Message " + std::to_string(i);
    pub->publish(msg);
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
}
```
**Question**: Will the subscriber receive "Early message"? What about subsequent messages?

**Expected Output**: "Early message" is lost; subsequent messages are received after discovery completes (~100-200ms).

**Explanation**: DDS discovery is asynchronous and takes 100-500ms. The early message is published before the subscriber exists, so it's lost (VOLATILE durability). After discovery completes, subsequent messages are received. Use TRANSIENT_LOCAL durability or wait for subscribers before publishing critical initial messages.

---

#### Task 7: QoS Compatibility - Best Effort vs Reliable
```cpp
// Publisher 1 - RELIABLE
auto pub1 = node1->create_publisher<std_msgs::msg::String>(
    "data", rclcpp::QoS(10).reliable());

// Publisher 2 - BEST_EFFORT
auto pub2 = node2->create_publisher<std_msgs::msg::String>(
    "data", rclcpp::QoS(10).best_effort());

// Subscriber - BEST_EFFORT
auto sub = node3->create_subscription<std_msgs::msg::String>(
    "data", rclcpp::QoS(10).best_effort(), callback);
```
**Question**: Which publishers can the subscriber receive messages from?

**Expected Output**: Subscriber receives from both pub1 and pub2.

**Explanation**: BEST_EFFORT subscriber can receive from both RELIABLE and BEST_EFFORT publishers (QoS downgrade allowed). The subscriber accepts whatever reliability the publisher offers. However, a RELIABLE subscriber cannot receive from BEST_EFFORT publisher (upgrade not allowed).

---

#### Task 8: Node-Relative Topics
```cpp
auto node = rclcpp::Node::make_shared("controller",
    rclcpp::NodeOptions().namespace_("/robot1"));

auto pub1 = node->create_publisher<std_msgs::msg::String>("~/output", 10);
auto pub2 = node->create_publisher<std_msgs::msg::String>("output", 10);

// In launch file: remappings=[('output', 'cmd_vel')]
```
**Question**: After remapping, what are the actual topic names?

**Expected Output**:
- pub1: `/robot1/controller/output` (node-relative, not affected by remapping of "output")
- pub2: `/robot1/cmd_vel` (relative, affected by remapping)

**Explanation**: Node-relative topics (~/) are not affected by simple remappings. To remap node-relative topics, you'd need to specify the full resolved name in the remapping rule: `('~/output', 'remapped_output')`.

---

#### Task 9: Intra-Process Communication
```cpp
// Node 1 - Publisher
rclcpp::NodeOptions options;
options.use_intra_process_comms(true);
auto node1 = std::make_shared<PublisherNode>(options);

// Node 2 - Subscriber in DIFFERENT process
auto node2 = std::make_shared<SubscriberNode>(options);  // Separate executable

// Publisher sends large message
auto msg = std::make_unique<sensor_msgs::msg::Image>();
msg->data.resize(1920 * 1080 * 3);  // 6 MB
publisher->publish(std::move(msg));
```
**Question**: Will zero-copy optimization apply?

**Expected Output**: No, zero-copy does not apply.

**Explanation**: Intra-process communication requires publisher and subscriber to be in the **same process** (same executable, same address space). Even with `use_intra_process_comms(true)`, if they're in separate executables, communication goes through DDS with serialization and network transport. For zero-copy, they must be composed into the same component container or spun by the same executor in the same main().

---

#### Task 10: Throttled Callbacks
```cpp
class HighFreqSubscriber : public rclcpp::Node {
public:
    HighFreqSubscriber() : Node("high_freq") {
        sub_ = create_subscription<std_msgs::msg::String>(
            "fast_topic", rclcpp::QoS(1).keep_last(1),  // Only keep latest
            [this](std_msgs::msg::String::SharedPtr msg) {
                RCLCPP_INFO_THROTTLE(get_logger(), *get_clock(), 1000,
                    "Received: %s", msg->data.c_str());
            });
    }
};

// Publisher sends at 100 Hz
```
**Question**: How often will the log message appear?

**Expected Output**: Once per second (1000ms throttle).

**Explanation**: RCLCPP_INFO_THROTTLE limits logging to once per specified duration (1000ms), even though messages arrive at 100 Hz. This prevents log spam while still confirming messages are being received. The subscriber receives all messages (not dropped), but only logs once per second.

---

### QUICK_REFERENCE: Summary Tables and Comparison Charts

#### Topic vs Service vs Action Comparison

| Feature | Topics | Services | Actions |
|---------|--------|----------|---------|
| **Communication Pattern** | Many-to-many, async pub-sub | One-to-one, sync request-response | One-to-one, async with feedback |
| **Directionality** | Unidirectional (pub→sub) | Bidirectional (req↔res) | Bidirectional with stream (req→goal, goal→feedback, goal→result) |
| **Typical Use Case** | Sensor streams, continuous data | Configuration queries, on-demand commands | Long-running tasks, navigation goals |
| **Blocking** | Non-blocking publish | Blocking (unless async client) | Non-blocking goal send, blocking wait for result |
| **Feedback** | None | None | Continuous progress updates |
| **Cancellation** | N/A | N/A | Supported |
| **Example** | /scan (LaserScan data) | /reset_system (Trigger) | /navigate_to_pose (NavigateToPose) |

#### QoS Policy Quick Reference

| QoS Policy | Options | Default | Use Case |
|------------|---------|---------|----------|
| **Reliability** | BEST_EFFORT, RELIABLE | RELIABLE | BEST_EFFORT: sensors, high-rate data; RELIABLE: commands, critical data |
| **Durability** | VOLATILE, TRANSIENT_LOCAL | VOLATILE | VOLATILE: real-time streams; TRANSIENT_LOCAL: static data (maps, configs) |
| **History** | KEEP_LAST(n), KEEP_ALL | KEEP_LAST(10) | KEEP_LAST: most data; KEEP_ALL: never drop messages (risky) |
| **Depth** | Integer (1-N) | 10 | Should cover max messages between processing cycles |
| **Lifespan** | Duration | Infinite | Expire old messages (e.g., sensor data >100ms old) |
| **Deadline** | Duration | Infinite | Detect if publisher stops sending (e.g., expect 30Hz) |
| **Liveliness** | AUTOMATIC, MANUAL_BY_TOPIC | AUTOMATIC | Detect if publisher/node is alive |

#### Predefined QoS Profiles

| Profile Name | Reliability | Durability | History | Typical Use |
|--------------|-------------|------------|---------|-------------|
| **SensorDataQoS** | BEST_EFFORT | VOLATILE | KEEP_LAST(5) | Camera, LiDAR, IMU streams |
| **ParametersQoS** | RELIABLE | VOLATILE | KEEP_LAST(1000) | ROS2 parameter server |
| **ServicesQoS** | RELIABLE | VOLATILE | KEEP_LAST(10) | Service requests/responses |
| **SystemDefaultsQoS** | RELIABLE | VOLATILE | KEEP_LAST(10) | General-purpose topics |
| **ParameterEventsQoS** | RELIABLE | VOLATILE | KEEP_LAST(1000) | Parameter change notifications |

#### Topic Name Resolution Rules

| Topic Syntax | Example | Namespace: /robot1 | Node: controller | Resolved Topic |
|--------------|---------|-------------------|------------------|----------------|
| **Relative** | `"cmd_vel"` | ✅ | ❌ | `/robot1/cmd_vel` |
| **Absolute** | `"/cmd_vel"` | ❌ | ❌ | `/cmd_vel` |
| **Node-relative** | `"~/cmd_vel"` | ✅ | ✅ | `/robot1/controller/cmd_vel` |

#### Common Topic Debugging Commands

| Command | Purpose | Example |
|---------|---------|---------|
| `ros2 topic list` | List all active topics | `ros2 topic list -t` (with types) |
| `ros2 topic info <topic>` | Show publishers/subscribers | `ros2 topic info /cmd_vel --verbose` |
| `ros2 topic echo <topic>` | Print messages in real-time | `ros2 topic echo /scan` |
| `ros2 topic hz <topic>` | Measure publication rate | `ros2 topic hz /imu/data` |
| `ros2 topic bw <topic>` | Measure bandwidth usage | `ros2 topic bw /camera/image` |
| `ros2 topic pub <topic> <type> <data>` | Manually publish | `ros2 topic pub /cmd_vel geometry_msgs/msg/Twist "{linear: {x: 0.5}}"` |
| `ros2 interface show <type>` | View message definition | `ros2 interface show sensor_msgs/msg/LaserScan` |

#### QoS Compatibility Matrix

| Publisher QoS | Subscriber QoS | Compatible? | Result |
|---------------|----------------|-------------|--------|
| RELIABLE | RELIABLE | ✅ | Reliable delivery |
| RELIABLE | BEST_EFFORT | ✅ | Best-effort delivery (subscriber chooses) |
| BEST_EFFORT | RELIABLE | ❌ | **NO MATCH** |
| BEST_EFFORT | BEST_EFFORT | ✅ | Best-effort delivery |
| VOLATILE | VOLATILE | ✅ | Only future messages |
| VOLATILE | TRANSIENT_LOCAL | ❌ | **NO MATCH** (sub wants history, pub doesn't provide) |
| TRANSIENT_LOCAL | VOLATILE | ✅ | Only future messages (sub ignores history) |
| TRANSIENT_LOCAL | TRANSIENT_LOCAL | ✅ | Late subscribers get history |

#### Message Size Performance Guidelines

| Message Size | DDS Behavior | Recommendation |
|--------------|--------------|----------------|
| **< 64 KB** | Single packet, minimal overhead | Use topics freely |
| **64 KB - 1 MB** | Fragmentation, moderate overhead | Acceptable for <10 Hz |
| **1 MB - 10 MB** | Heavy fragmentation, high latency | Use intra-process if possible, or compress |
| **> 10 MB** | Severe performance impact | Avoid topics; use services, file refs, or external storage |

#### Executor Types Comparison

| Executor Type | Threading | Callback Concurrency | Use Case |
|---------------|-----------|----------------------|----------|
| **SingleThreadedExecutor** | Single thread | Serial (one at a time) | Simple nodes, deterministic execution |
| **MultiThreadedExecutor** | Thread pool | Parallel (respects callback groups) | High-throughput systems, independent callbacks |
| **StaticSingleThreadedExecutor** | Single thread | Serial, pre-allocated memory | Real-time systems, embedded |

---

**End of Topic 1: Topics, Publishers, and Subscribers**

---

**Total Content Statistics:**
- **Lines**: ~2400 lines
- **Theory sections**: 4 subsections
- **Edge cases**: 6 detailed scenarios
- **Code examples**: 4 complete examples with full package structure
- **Interview questions**: 20 comprehensive Q&As
- **Practice tasks**: 10 code analysis exercises
- **Reference tables**: 9 comparison tables

This follows your C++ format exactly, with deep technical content, interview focus, complete working code, and extensive practice materials. Ready for your review!
