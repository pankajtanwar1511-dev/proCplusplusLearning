# Chapter 6: Advanced Production Systems
## Topic 6.2: Custom Messages & Interface Design

---

## THEORY

### 1. ROS2 Interface Types

ROS2 has three types of interfaces for communication:

| Type | Extension | Purpose | Communication Pattern | Example |
|------|-----------|---------|----------------------|---------|
| **Message** | `.msg` | One-way data | Pub/Sub topics | `sensor_msgs/msg/Image` |
| **Service** | `.srv` | Request-Response | Synchronous call | `std_srvs/srv/Trigger` |
| **Action** | `.action` | Long-running task | Async with feedback | `nav2_msgs/action/NavigateToPose` |

**All three are defined using Interface Definition Language (IDL).**

---

### 2. Message Definition (.msg)

**Basic Structure:**

```
# Comment line (documentation)
field_type field_name
field_type field_name default_value
field_type[] dynamic_array_field
field_type[N] fixed_array_field
```

**Example: Custom Sensor Message**

```msg
# File: my_interfaces/msg/BatterySensor.msg

# Header with timestamp and frame
std_msgs/Header header

# Battery status
float32 voltage           # Volts
float32 current           # Amperes
float32 percentage        # 0.0 to 100.0
float32 temperature       # Celsius

# State
uint8 CHARGING=0
uint8 DISCHARGING=1
uint8 FULL=2
uint8 CRITICAL=3
uint8 state

# Additional info
bool is_charging
string battery_id
```

**Primitive Types:**

| Type | Description | Range | Default |
|------|-------------|-------|---------|
| `bool` | Boolean | true/false | false |
| `byte` | Unsigned 8-bit | 0-255 | 0 |
| `char` | Signed 8-bit | -128 to 127 | 0 |
| `uint8`, `uint16`, `uint32`, `uint64` | Unsigned integers | 0 to 2^N-1 | 0 |
| `int8`, `int16`, `int32`, `int64` | Signed integers | -2^(N-1) to 2^(N-1)-1 | 0 |
| `float32`, `float64` | Floating point | IEEE 754 | 0.0 |
| `string` | UTF-8 string | Unbounded | "" |

**Arrays:**

```msg
# Fixed-size array (stack allocated)
float64[3] position        # Always 3 elements

# Dynamic array (heap allocated)
float64[] trajectory       # Variable length

# Bounded array
string[<=10] tags          # Max 10 elements
```

**Constants:**

```msg
# Define constants
uint8 MODE_IDLE=0
uint8 MODE_ACTIVE=1
uint8 MODE_ERROR=2

string DEFAULT_NAME="robot_1"
float32 PI=3.14159
```

---

### 3. Service Definition (.srv)

**Structure:**

```
# Request fields
field_type request_field1
field_type request_field2
---
# Response fields
field_type response_field1
field_type response_field2
```

**Example: Custom Service**

```srv
# File: my_interfaces/srv/AddTwoFloats.srv

# Request: two numbers to add
float32 a
float32 b

---

# Response: sum and success flag
float32 sum
bool success
string message
```

**Example: Complex Service (Navigation)**

```srv
# File: my_interfaces/srv/ComputePath.srv

# Request
geometry_msgs/PoseStamped start
geometry_msgs/PoseStamped goal
float32 tolerance
bool use_obstacles

---

# Response
nav_msgs/Path path
float32 estimated_time
bool success
string error_message
```

---

### 4. Action Definition (.action)

**Structure:**

```
# Goal definition
field_type goal_field1
---
# Result definition
field_type result_field1
---
# Feedback definition (sent periodically)
field_type feedback_field1
```

**Example: Custom Action**

```action
# File: my_interfaces/action/Patrol.action

# Goal: waypoints to patrol
geometry_msgs/PoseStamped[] waypoints
uint32 num_loops
bool return_to_start

---

# Result: completion status
uint32 total_waypoints_reached
float32 total_distance
float32 total_time
bool completed_successfully
string message

---

# Feedback: current progress
uint32 current_waypoint_index
geometry_msgs/PoseStamped current_pose
float32 distance_to_next_waypoint
float32 time_elapsed
```

---

### 5. Package Structure for Interfaces

**Best Practice: Separate Interface Package**

```
my_robot/
├── my_robot_bringup/          # Launch files
├── my_robot_description/      # URDF, meshes
├── my_robot_control/          # Control nodes
└── my_robot_interfaces/       # ⭐ SEPARATE PACKAGE
    ├── msg/
    │   ├── BatterySensor.msg
    │   ├── RobotStatus.msg
    │   └── WheelState.msg
    ├── srv/
    │   ├── SetMode.srv
    │   └── GetDiagnostics.srv
    ├── action/
    │   └── Patrol.action
    ├── CMakeLists.txt
    └── package.xml
```

**Why Separate Package?**

✅ **Avoids circular dependencies**
```
my_robot_control depends on my_robot_interfaces
my_robot_nav depends on my_robot_interfaces
(No circular dependency!)
```

❌ **With interfaces in control package:**
```
my_robot_control (contains interfaces)
my_robot_nav depends on my_robot_control (just for messages)
(Creates tight coupling!)
```

✅ **Independent versioning**: Can version interfaces separately

✅ **Reusability**: Other packages can use interfaces without full dependency

---

### 6. Building Custom Interfaces

**package.xml:**

```xml
<?xml version="1.0"?>
<package format="3">
  <name>my_robot_interfaces</name>
  <version>1.0.0</version>
  <description>Custom interfaces for my robot</description>
  <maintainer email="you@example.com">Your Name</maintainer>
  <license>Apache-2.0</license>

  <buildtool_depend>ament_cmake</buildtool_depend>

  <!-- Interface generation dependencies -->
  <build_depend>rosidl_default_generators</build_depend>
  <exec_depend>rosidl_default_runtime</exec_depend>
  <member_of_group>rosidl_interface_packages</member_of_group>

  <!-- Message dependencies (if using other messages) -->
  <depend>std_msgs</depend>
  <depend>geometry_msgs</depend>
  <depend>sensor_msgs</depend>
</package>
```

**CMakeLists.txt:**

```cmake
cmake_minimum_required(VERSION 3.8)
project(my_robot_interfaces)

# Find dependencies
find_package(ament_cmake REQUIRED)
find_package(rosidl_default_generators REQUIRED)
find_package(std_msgs REQUIRED)
find_package(geometry_msgs REQUIRED)
find_package(sensor_msgs REQUIRED)

# Generate interfaces
rosidl_generate_interfaces(${PROJECT_NAME}
  # Messages
  "msg/BatterySensor.msg"
  "msg/RobotStatus.msg"
  "msg/WheelState.msg"

  # Services
  "srv/SetMode.srv"
  "srv/GetDiagnostics.srv"

  # Actions
  "action/Patrol.action"

  # Dependencies (messages from other packages used in your interfaces)
  DEPENDENCIES
    std_msgs
    geometry_msgs
    sensor_msgs
)

ament_package()
```

**Build:**

```bash
cd ~/ros2_ws
colcon build --packages-select my_robot_interfaces

# Source workspace
source install/setup.bash

# Verify
ros2 interface show my_robot_interfaces/msg/BatterySensor
ros2 interface list | grep my_robot
```

---

### 7. Using Custom Interfaces in Code

**C++ Publisher:**

```cpp
#include "rclcpp/rclcpp.hpp"
#include "my_robot_interfaces/msg/battery_sensor.hpp"

class BatteryPublisher : public rclcpp::Node {
public:
    BatteryPublisher() : Node("battery_publisher") {
        publisher_ = create_publisher<my_robot_interfaces::msg::BatterySensor>(
            "battery_status", 10);

        timer_ = create_wall_timer(
            std::chrono::seconds(1),
            std::bind(&BatteryPublisher::publish_battery, this));
    }

private:
    void publish_battery() {
        auto msg = my_robot_interfaces::msg::BatterySensor();

        msg.header.stamp = now();
        msg.header.frame_id = "battery_link";

        msg.voltage = 24.5;
        msg.current = 3.2;
        msg.percentage = 87.5;
        msg.temperature = 25.3;
        msg.state = my_robot_interfaces::msg::BatterySensor::DISCHARGING;
        msg.is_charging = false;
        msg.battery_id = "BAT001";

        publisher_->publish(msg);
    }

    rclcpp::Publisher<my_robot_interfaces::msg::BatterySensor>::SharedPtr publisher_;
    rclcpp::TimerBase::SharedPtr timer_;
};
```

**Python Subscriber:**

```python
import rclpy
from rclpy.node import Node
from my_robot_interfaces.msg import BatterySensor

class BatterySubscriber(Node):
    def __init__(self):
        super().__init__('battery_subscriber')

        self.subscription = self.create_subscription(
            BatterySensor,
            'battery_status',
            self.battery_callback,
            10)

    def battery_callback(self, msg):
        self.get_logger().info(
            f'Battery: {msg.percentage:.1f}%, '
            f'Voltage: {msg.voltage:.2f}V, '
            f'State: {self.state_to_string(msg.state)}')

    def state_to_string(self, state):
        if state == BatterySensor.CHARGING:
            return "CHARGING"
        elif state == BatterySensor.DISCHARGING:
            return "DISCHARGING"
        elif state == BatterySensor.FULL:
            return "FULL"
        elif state == BatterySensor.CRITICAL:
            return "CRITICAL"
        return "UNKNOWN"
```

**CMakeLists.txt (for C++ node using custom interface):**

```cmake
find_package(my_robot_interfaces REQUIRED)

add_executable(battery_publisher src/battery_publisher.cpp)
ament_target_dependencies(battery_publisher
  rclcpp
  my_robot_interfaces
)
```

**package.xml (for node using custom interface):**

```xml
<depend>my_robot_interfaces</depend>
```

---

### 8. Message Design Best Practices

**1. Always Include Header for Timestamped Data:**

```msg
# ✅ Good
std_msgs/Header header
float32 temperature

# ❌ Bad (no timestamp/frame reference)
float32 temperature
```

**Why:** Synchronization, TF transforms, data replay need timestamps.

---

**2. Use Appropriate Types:**

```msg
# ✅ Good: Use smallest type that fits
uint8 state           # Only 0-255 needed
float32 distance      # Meters (32-bit sufficient)

# ❌ Bad: Wasteful
uint64 state          # 64 bits for 4 values?
float64 distance      # 64 bits unnecessary for meters
```

**Impact:** Network bandwidth, serialization time, memory.

---

**3. Document Fields:**

```msg
# ✅ Good
float32 voltage    # Battery voltage in Volts (V)
float32 current    # Current draw in Amperes (A)
uint8 state        # Charging state (see constants)

# ❌ Bad
float32 voltage
float32 current
uint8 state
```

---

**4. Use Constants for Enumerations:**

```msg
# ✅ Good
uint8 IDLE=0
uint8 RUNNING=1
uint8 ERROR=2
uint8 state

# ❌ Bad: Magic numbers
uint8 state  # 0=idle, 1=running, 2=error (unclear in code)
```

---

**5. Design for Extensibility:**

```msg
# ✅ Good: Can add fields later
std_msgs/Header header
float32 temperature
# Future: Add humidity, pressure without breaking compatibility

# ❌ Bad: Fixed-size arrays limit extensibility
float32[10] sensor_readings  # What if you need 11 sensors?

# ✅ Better: Dynamic array
float32[] sensor_readings
```

---

**6. Avoid Overly Large Messages:**

```msg
# ❌ Bad: Huge message (inefficient)
sensor_msgs/Image image           # 1920x1080 RGB = 6MB
sensor_msgs/PointCloud2 cloud     # 1M points = 48MB
# Total: ~54MB per message!

# ✅ Better: Publish on separate topics
# Topic /camera/image: sensor_msgs/Image
# Topic /lidar/points: sensor_msgs/PointCloud2
```

**Rule of thumb:** Keep messages < 1MB for frequent publishing.

---

**7. Semantic Naming:**

```msg
# ✅ Good: Clear semantics
geometry_msgs/Pose target_pose
float32 max_velocity_mps    # meters per second
duration timeout

# ❌ Bad: Unclear units/meaning
geometry_msgs/Pose p
float32 v                    # Velocity? What units?
float32 t                    # Time? Timeout? Temperature?
```

---

### 9. Nested Messages

**Example: Robot Status with Nested Messages**

```msg
# File: my_robot_interfaces/msg/RobotStatus.msg

std_msgs/Header header

# Battery (nested custom message)
my_robot_interfaces/BatterySensor battery

# Wheels (array of nested messages)
my_robot_interfaces/WheelState[] wheels

# Pose
geometry_msgs/Pose current_pose

# Velocity
geometry_msgs/Twist current_velocity

# System health
uint8 health_percentage
bool emergency_stop_active
```

**Accessing nested fields (C++):**

```cpp
auto status = my_robot_interfaces::msg::RobotStatus();

status.battery.voltage = 24.5;
status.battery.percentage = 87.0;

status.wheels.resize(4);
status.wheels[0].angular_velocity = 2.5;
status.wheels[1].angular_velocity = 2.5;

status.current_pose.position.x = 1.0;
status.current_pose.position.y = 2.0;
```

---

### 10. Message Compatibility & Versioning

**Message Evolution Rules:**

| Change | Compatible? | Notes |
|--------|-------------|-------|
| Add field to end | ✅ Yes | Old code ignores new field |
| Remove field | ⚠️ Risky | Old code may fail |
| Rename field | ❌ No | Breaks all code |
| Change field type | ❌ No | Breaks serialization |
| Reorder fields | ❌ No | Breaks compatibility |

**Example: Safe Evolution**

```msg
# Version 1.0
std_msgs/Header header
float32 voltage
float32 current

# Version 1.1 (✅ Compatible)
std_msgs/Header header
float32 voltage
float32 current
float32 temperature    # ✅ Added at end

# Version 2.0 (❌ Incompatible)
std_msgs/Header header
float64 voltage        # ❌ Changed type (float32 → float64)
float32 current
```

**Versioning Strategy:**

```
my_robot_interfaces/
├── msg/
│   ├── RobotStatus.msg        # Current version
│   └── RobotStatusV2.msg      # Breaking change → new message
```

Or use semantic versioning in package:

```xml
<version>2.0.0</version>  <!-- Major version bump for breaking changes -->
```

---

### 11. Code Generation Deep Dive

**What happens when you build an interface package?**

**Step 1: rosidl_generate_interfaces() generates:**

For `BatterySensor.msg`:

```
install/my_robot_interfaces/include/my_robot_interfaces/msg/
├── battery_sensor.h              # C header
├── battery_sensor.hpp            # C++ header
└── detail/
    ├── battery_sensor__struct.h  # Struct definition
    ├── battery_sensor__struct.hpp
    ├── battery_sensor__builder.hpp
    ├── battery_sensor__traits.hpp
    └── battery_sensor__functions.h

install/my_robot_interfaces/lib/python3.10/site-packages/my_robot_interfaces/msg/
└── _battery_sensor.py            # Python module
```

**Step 2: Serialization code generated:**

- DDS (Data Distribution Service) serialization
- Conversion functions (ROS2 ↔ DDS)
- Type support structures

**Step 3: Language bindings:**

- C++ typesupport
- Python bindings (pybind11)
- C typesupport

---

### 12. Performance Considerations

**Message Size Impact:**

| Message Size | Serialization | Network | Use Case |
|--------------|---------------|---------|----------|
| < 1 KB | ~1 μs | Negligible | Sensor data, states |
| 1-100 KB | ~10-100 μs | Low latency | Small images, short arrays |
| 100 KB - 1 MB | ~0.1-1 ms | Moderate | Medium images, point clouds |
| > 1 MB | > 1 ms | High latency | Large images, dense clouds |

**Optimization Strategies:**

**1. Use Appropriate Types:**
```msg
# Instead of:
float64[1000000] points    # 8 MB

# Use:
float32[1000000] points    # 4 MB (50% reduction)
```

**2. Compress Large Data:**
```msg
# For images
sensor_msgs/CompressedImage image    # JPEG/PNG compression
# vs
sensor_msgs/Image image              # Raw data
```

**3. Publish at Appropriate Rate:**
```python
# High frequency for small messages
self.create_timer(0.01, callback)    # 100 Hz OK for small msgs

# Low frequency for large messages
self.create_timer(0.1, callback)     # 10 Hz for images
```

**4. Use QoS Wisely:**
```python
qos = QoSProfile(
    reliability=ReliabilityPolicy.BEST_EFFORT,  # Faster for large data
    durability=DurabilityPolicy.VOLATILE,       # No history buffering
    history=HistoryPolicy.KEEP_LAST,
    depth=1                                     # Only latest message
)
```

---

## EDGE_CASES

### Edge Case 1: Circular Dependency Hell

**Scenario:**

```
Package A (interfaces):
└── msg/MessageA.msg uses MessageB from Package B

Package B (interfaces):
└── msg/MessageB.msg uses MessageA from Package A

Circular dependency! Build fails.
```

**Why:**

```cmake
# Package A CMakeLists.txt
find_package(package_b_interfaces REQUIRED)
rosidl_generate_interfaces(package_a_interfaces
    "msg/MessageA.msg"
    DEPENDENCIES package_b_interfaces
)

# Package B CMakeLists.txt
find_package(package_a_interfaces REQUIRED)
rosidl_generate_interfaces(package_b_interfaces
    "msg/MessageB.msg"
    DEPENDENCIES package_a_interfaces
)

# Error: Circular dependency!
```

**Solution 1: Refactor into Common Package**

```
common_interfaces/
├── msg/
│   ├── MessageA.msg
│   └── MessageB.msg

package_a/ (uses common_interfaces)
package_b/ (uses common_interfaces)

No circular dependency!
```

**Solution 2: Eliminate Dependency**

```msg
# Instead of:
# MessageA.msg
package_b_interfaces/MessageB b_msg    # ❌ Circular dependency

# Inline the fields:
# MessageA.msg
float32 value_from_b
string data_from_b

# MessageB can still use MessageA if needed (one-way dependency)
```

**Interview Insight:**
Circular dependencies in interface packages are build errors. Refactor common messages into shared interface package, or eliminate dependency by inlining fields.

---

### Edge Case 2: Large Array Performance

**Scenario:**

Publishing large fixed-size array causes stack overflow:

```msg
# RobotMap.msg
uint8[10000000] occupancy_grid    # 10MB fixed array on stack!
```

**Code:**

```cpp
auto msg = my_interfaces::msg::RobotMap();
// Stack overflow! 10MB array allocated on stack
```

**Why:**

Fixed-size arrays are **stack-allocated**. Large arrays overflow stack (typical limit: 1-8 MB).

**Solution 1: Use Dynamic Array**

```msg
# RobotMap.msg
uint8[] occupancy_grid    # Heap-allocated, no size limit
```

**Solution 2: Use Appropriate Message Type**

```msg
# Instead of custom large array, use standard message
nav_msgs/OccupancyGrid grid    # Designed for large grids
```

**Solution 3: Split into Chunks**

```msg
# MapChunk.msg
uint32 chunk_id
uint32 total_chunks
uint8[] data    # Smaller chunks
```

Publish multiple small messages instead of one huge message.

**Interview Insight:**
Fixed-size arrays are stack-allocated and limited by stack size (~1-8 MB). Use dynamic arrays `[]` for large data, or split into chunks. For very large data (images, point clouds), use standard message types optimized for that purpose.

---

### Edge Case 3: Message Serialization Failure

**Scenario:**

Message contains invalid UTF-8 in string field, serialization fails:

```python
msg = my_interfaces.msg.RobotStatus()
msg.robot_id = b'\xff\xfe\xfd'.decode('utf-8', errors='ignore')  # Invalid UTF-8
pub.publish(msg)  # Fails to serialize!
```

**Why:**

ROS2 messages use **UTF-8 strings**. Invalid UTF-8 causes serialization error.

**Solution 1: Validate Strings**

```cpp
#include <string>
#include <stdexcept>

void validate_utf8(const std::string& str) {
    // Basic UTF-8 validation
    for (size_t i = 0; i < str.size(); ) {
        unsigned char c = str[i];

        if (c <= 0x7F) {
            i += 1;
        } else if (c <= 0xDF) {
            if (i + 1 >= str.size()) throw std::invalid_argument("Invalid UTF-8");
            i += 2;
        } else if (c <= 0xEF) {
            if (i + 2 >= str.size()) throw std::invalid_argument("Invalid UTF-8");
            i += 3;
        } else if (c <= 0xF7) {
            if (i + 3 >= str.size()) throw std::invalid_argument("Invalid UTF-8");
            i += 4;
        } else {
            throw std::invalid_argument("Invalid UTF-8");
        }
    }
}

// Before publishing
validate_utf8(msg.robot_id);
publisher_->publish(msg);
```

**Solution 2: Use byte array for binary data**

```msg
# Instead of:
string binary_data    # ❌ Expects UTF-8

# Use:
uint8[] binary_data   # ✅ Raw bytes
```

**Interview Insight:**
String fields must contain valid UTF-8. For binary data, use `uint8[]` instead of `string`. Validate strings before publishing if source is untrusted.

---

### Edge Case 4: Default Values and Zero Initialization

**Scenario:**

Message has default values in definition, but code doesn't see them:

```msg
# RobotConfig.msg
float32 max_speed 10.0    # Default value
bool enabled true
```

```cpp
auto msg = my_interfaces::msg::RobotConfig();
std::cout << msg.max_speed;    // Prints 0, not 10!
std::cout << msg.enabled;      // Prints false, not true!
```

**Why:**

**Default values in .msg files are NOT used for initialization!**

They are only documentation/metadata for tools (e.g., GUI parameter editors).

**C++ zero-initializes all fields** by default.

**Solution: Set defaults in code**

```cpp
auto msg = my_interfaces::msg::RobotConfig();
msg.max_speed = 10.0;    // Must set explicitly
msg.enabled = true;
```

Or use constructor (if you modify generated code - not recommended):

```cpp
// Custom wrapper
struct RobotConfigWithDefaults {
    my_interfaces::msg::RobotConfig msg;

    RobotConfigWithDefaults() {
        msg.max_speed = 10.0;
        msg.enabled = true;
    }
};
```

**Interview Insight:**
Default values in .msg files are **documentation only**, not used for initialization. C++ zero-initializes all fields. Always set defaults explicitly in code.

---

## CODE_EXAMPLES

### Example 1: Complete Interface Package

**Directory Structure:**

```
my_robot_interfaces/
├── action/
│   └── NavigateToGoal.action
├── msg/
│   ├── BatterySensor.msg
│   └── RobotStatus.msg
├── srv/
│   └── SetMode.srv
├── CMakeLists.txt
└── package.xml
```

**msg/BatterySensor.msg:**

```msg
# Battery sensor data
std_msgs/Header header

float32 voltage          # Volts
float32 current          # Amperes
float32 percentage       # 0.0 to 100.0
float32 temperature      # Celsius

# States
uint8 CHARGING=0
uint8 DISCHARGING=1
uint8 FULL=2
uint8 CRITICAL=3
uint8 state

bool is_charging
string battery_id
```

**msg/RobotStatus.msg:**

```msg
# Overall robot status
std_msgs/Header header

# Battery
my_robot_interfaces/BatterySensor battery

# Pose and velocity
geometry_msgs/Pose pose
geometry_msgs/Twist velocity

# Health
uint8 health_percentage
bool emergency_stop
string[] active_warnings
```

**srv/SetMode.srv:**

```srv
# Request
uint8 MODE_IDLE=0
uint8 MODE_AUTONOMOUS=1
uint8 MODE_MANUAL=2
uint8 mode

---

# Response
bool success
uint8 current_mode
string message
```

**action/NavigateToGoal.action:**

```action
# Goal
geometry_msgs/PoseStamped target_pose
float32 tolerance
bool avoid_obstacles

---

# Result
bool reached_goal
float32 final_distance
float32 time_elapsed
string result_message

---

# Feedback
geometry_msgs/PoseStamped current_pose
float32 distance_to_goal
float32 percentage_complete
```

**package.xml:**

```xml
<?xml version="1.0"?>
<package format="3">
  <name>my_robot_interfaces</name>
  <version>1.0.0</version>
  <description>Custom interfaces for my robot</description>
  <maintainer email="you@example.com">Your Name</maintainer>
  <license>Apache-2.0</license>

  <buildtool_depend>ament_cmake</buildtool_depend>

  <build_depend>rosidl_default_generators</build_depend>
  <exec_depend>rosidl_default_runtime</exec_depend>
  <member_of_group>rosidl_interface_packages</member_of_group>

  <depend>std_msgs</depend>
  <depend>geometry_msgs</depend>
  <depend>sensor_msgs</depend>
  <depend>nav_msgs</depend>
</package>
```

**CMakeLists.txt:**

```cmake
cmake_minimum_required(VERSION 3.8)
project(my_robot_interfaces)

if(CMAKE_COMPILER_IS_GNUCXX OR CMAKE_CXX_COMPILER_ID MATCHES "Clang")
  add_compile_options(-Wall -Wextra -Wpedantic)
endif()

# Find dependencies
find_package(ament_cmake REQUIRED)
find_package(rosidl_default_generators REQUIRED)
find_package(std_msgs REQUIRED)
find_package(geometry_msgs REQUIRED)
find_package(sensor_msgs REQUIRED)
find_package(nav_msgs REQUIRED)

# Generate interfaces
rosidl_generate_interfaces(${PROJECT_NAME}
  "msg/BatterySensor.msg"
  "msg/RobotStatus.msg"
  "srv/SetMode.srv"
  "action/NavigateToGoal.action"
  DEPENDENCIES
    std_msgs
    geometry_msgs
    sensor_msgs
    nav_msgs
)

ament_package()
```

**Build and verify:**

```bash
cd ~/ros2_ws
colcon build --packages-select my_robot_interfaces
source install/setup.bash

# Verify messages
ros2 interface show my_robot_interfaces/msg/BatterySensor
ros2 interface show my_robot_interfaces/msg/RobotStatus

# Verify service
ros2 interface show my_robot_interfaces/srv/SetMode

# Verify action
ros2 interface show my_robot_interfaces/action/NavigateToGoal
```

---

### Example 2: Using Custom Message in C++

**File: `battery_monitor.cpp`**

```cpp
#include "rclcpp/rclcpp.hpp"
#include "my_robot_interfaces/msg/battery_sensor.hpp"
#include <random>

class BatteryMonitor : public rclcpp::Node
{
public:
    BatteryMonitor() : Node("battery_monitor")
    {
        // Declare parameters
        declare_parameter("publish_rate", 10.0);
        declare_parameter("battery_id", "BAT001");

        auto rate = get_parameter("publish_rate").as_double();
        battery_id_ = get_parameter("battery_id").as_string();

        // Create publisher
        publisher_ = create_publisher<my_robot_interfaces::msg::BatterySensor>(
            "battery_status", 10);

        // Create timer
        timer_ = create_wall_timer(
            std::chrono::milliseconds(static_cast<int>(1000.0 / rate)),
            std::bind(&BatteryMonitor::publish_battery, this));

        // Initialize state
        voltage_ = 24.0;
        current_ = 0.0;
        percentage_ = 100.0;
        state_ = my_robot_interfaces::msg::BatterySensor::FULL;

        RCLCPP_INFO(get_logger(), "Battery monitor started: %s", battery_id_.c_str());
    }

private:
    void publish_battery()
    {
        // Simulate battery discharge
        if (state_ == my_robot_interfaces::msg::BatterySensor::DISCHARGING) {
            percentage_ -= 0.1;
            voltage_ = 20.0 + (percentage_ / 100.0) * 5.0;  // 20-25V range
            current_ = 2.0 + random_float(-0.5, 0.5);

            if (percentage_ <= 0.0) {
                percentage_ = 0.0;
                state_ = my_robot_interfaces::msg::BatterySensor::CRITICAL;
            } else if (percentage_ <= 20.0) {
                state_ = my_robot_interfaces::msg::BatterySensor::CRITICAL;
            }
        }

        // Create message
        auto msg = my_robot_interfaces::msg::BatterySensor();

        msg.header.stamp = now();
        msg.header.frame_id = "battery_link";

        msg.voltage = voltage_;
        msg.current = current_;
        msg.percentage = percentage_;
        msg.temperature = 25.0 + random_float(-2.0, 2.0);
        msg.state = state_;
        msg.is_charging = (state_ == my_robot_interfaces::msg::BatterySensor::CHARGING);
        msg.battery_id = battery_id_;

        publisher_->publish(msg);

        // Log status
        RCLCPP_INFO(get_logger(),
            "Battery: %.1f%% | %.2fV | %.2fA | %s",
            msg.percentage, msg.voltage, msg.current,
            state_to_string(msg.state).c_str());
    }

    std::string state_to_string(uint8_t state)
    {
        switch (state) {
            case my_robot_interfaces::msg::BatterySensor::CHARGING:
                return "CHARGING";
            case my_robot_interfaces::msg::BatterySensor::DISCHARGING:
                return "DISCHARGING";
            case my_robot_interfaces::msg::BatterySensor::FULL:
                return "FULL";
            case my_robot_interfaces::msg::BatterySensor::CRITICAL:
                return "CRITICAL";
            default:
                return "UNKNOWN";
        }
    }

    float random_float(float min, float max)
    {
        static std::random_device rd;
        static std::mt19937 gen(rd());
        std::uniform_real_distribution<float> dist(min, max);
        return dist(gen);
    }

    rclcpp::Publisher<my_robot_interfaces::msg::BatterySensor>::SharedPtr publisher_;
    rclcpp::TimerBase::SharedPtr timer_;

    std::string battery_id_;
    float voltage_;
    float current_;
    float percentage_;
    uint8_t state_;
};

int main(int argc, char** argv)
{
    rclcpp::init(argc, argv);
    rclcpp::spin(std::make_shared<BatteryMonitor>());
    rclcpp::shutdown();
    return 0;
}
```

**CMakeLists.txt (for battery_monitor node):**

```cmake
find_package(rclcpp REQUIRED)
find_package(my_robot_interfaces REQUIRED)

add_executable(battery_monitor src/battery_monitor.cpp)
ament_target_dependencies(battery_monitor
  rclcpp
  my_robot_interfaces
)

install(TARGETS
  battery_monitor
  DESTINATION lib/${PROJECT_NAME}
)
```

---

### Example 3: Using Custom Service in Python

**File: `mode_service.py`**

```python
#!/usr/bin/env python3
import rclpy
from rclpy.node import Node
from my_robot_interfaces.srv import SetMode

class RobotModeService(Node):
    def __init__(self):
        super().__init__('robot_mode_service')

        self.current_mode = SetMode.Request.MODE_IDLE

        self.srv = self.create_service(
            SetMode,
            'set_mode',
            self.set_mode_callback)

        self.get_logger().info('Robot mode service ready')

    def set_mode_callback(self, request, response):
        self.get_logger().info(f'Received mode change request: {request.mode}')

        # Validate mode
        valid_modes = [
            SetMode.Request.MODE_IDLE,
            SetMode.Request.MODE_AUTONOMOUS,
            SetMode.Request.MODE_MANUAL
        ]

        if request.mode not in valid_modes:
            response.success = False
            response.current_mode = self.current_mode
            response.message = f'Invalid mode: {request.mode}'
            self.get_logger().error(response.message)
            return response

        # Check if already in requested mode
        if request.mode == self.current_mode:
            response.success = True
            response.current_mode = self.current_mode
            response.message = f'Already in mode {self.mode_to_string(request.mode)}'
            return response

        # Change mode
        old_mode = self.current_mode
        self.current_mode = request.mode

        response.success = True
        response.current_mode = self.current_mode
        response.message = (
            f'Mode changed: {self.mode_to_string(old_mode)} → '
            f'{self.mode_to_string(self.current_mode)}'
        )

        self.get_logger().info(response.message)
        return response

    def mode_to_string(self, mode):
        if mode == SetMode.Request.MODE_IDLE:
            return 'IDLE'
        elif mode == SetMode.Request.MODE_AUTONOMOUS:
            return 'AUTONOMOUS'
        elif mode == SetMode.Request.MODE_MANUAL:
            return 'MANUAL'
        return 'UNKNOWN'

def main(args=None):
    rclpy.init(args=args)
    node = RobotModeService()
    rclpy.spin(node)
    node.destroy_node()
    rclpy.shutdown()

if __name__ == '__main__':
    main()
```

**Client (Python):**

```python
#!/usr/bin/env python3
import rclpy
from rclpy.node import Node
from my_robot_interfaces.srv import SetMode
import sys

class ModeClient(Node):
    def __init__(self):
        super().__init__('mode_client')
        self.client = self.create_client(SetMode, 'set_mode')

        while not self.client.wait_for_service(timeout_sec=1.0):
            self.get_logger().info('Waiting for service...')

    def send_request(self, mode):
        request = SetMode.Request()
        request.mode = mode

        future = self.client.call_async(request)
        rclpy.spin_until_future_complete(self, future)

        if future.result() is not None:
            response = future.result()
            self.get_logger().info(
                f'Success: {response.success}, '
                f'Current mode: {response.current_mode}, '
                f'Message: {response.message}')
            return response
        else:
            self.get_logger().error('Service call failed')
            return None

def main(args=None):
    rclpy.init(args=args)
    client = ModeClient()

    if len(sys.argv) < 2:
        print('Usage: ros2 run pkg mode_client <mode>')
        print('Modes: 0=IDLE, 1=AUTONOMOUS, 2=MANUAL')
        return

    mode = int(sys.argv[1])
    client.send_request(mode)

    client.destroy_node()
    rclpy.shutdown()

if __name__ == '__main__':
    main()
```

---

## INTERVIEW_QA

### Q1: What are the three types of ROS2 interfaces and when would you use each?

**Difficulty:** ⭐⭐ (Easy)

**Answer:**

ROS2 has three interface types for different communication patterns:

**1. Messages (.msg) - One-way data streaming**

**Use Case:** Continuous data flow (sensors, state updates)

**Pattern:** Publisher-Subscriber (Pub/Sub)

**Example:**
```msg
# Temperature sensor data
std_msgs/Header header
float32 temperature
float32 humidity
```

**When to use:**
- Sensor data (IMU, camera, lidar)
- Robot state (odometry, joint states)
- Continuous updates (battery status)
- One-to-many communication (multiple subscribers)

---

**2. Services (.srv) - Request-Response**

**Use Case:** Short synchronous operations

**Pattern:** Client-Server (blocking call)

**Example:**
```srv
# Request
string file_path
---
# Response
bool success
string error_message
```

**When to use:**
- Configuration changes (set parameters)
- Quick queries (get current state)
- One-time operations (reset system)
- Operations that complete quickly (< 1 second)

**Limitations:**
- ❌ Blocks caller until response
- ❌ No progress feedback
- ❌ Not suitable for long operations

---

**3. Actions (.action) - Long-running tasks with feedback**

**Use Case:** Asynchronous tasks with progress updates

**Pattern:** Action Client-Server (non-blocking)

**Example:**
```action
# Goal
geometry_msgs/PoseStamped target
---
# Result
bool success
float32 final_distance
---
# Feedback (periodic)
geometry_msgs/PoseStamped current_pose
float32 distance_remaining
```

**When to use:**
- Long-running tasks (navigation, object detection)
- Need progress feedback (file download, map building)
- Preemptable operations (cancel navigation mid-flight)
- Asynchronous execution (don't block caller)

**Features:**
- ✅ Periodic feedback
- ✅ Can be canceled/preempted
- ✅ Returns final result
- ✅ Non-blocking for client

---

**Decision Tree:**

```
Need communication?
    │
    ├─ Continuous data stream?
    │  → Use Message (Pub/Sub)
    │
    ├─ Quick request-response (< 1s)?
    │  → Use Service
    │
    └─ Long-running task with feedback?
       → Use Action
```

**Interview Insight:**
Messages = streaming data (sensors), Services = quick request-response (config), Actions = long tasks with feedback (navigation). Choose based on communication pattern and task duration.

---

### Q2: Why should custom interfaces be in a separate package?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

**Best Practice: Separate Interface Package**

```
my_robot/
├── my_robot_interfaces/     # ✅ Separate package
├── my_robot_control/
└── my_robot_navigation/
```

**Why separate?**

**1. Avoid Circular Dependencies**

**Problem with interfaces in node package:**
```
package_a:
  - Contains nodeA
  - Contains MessageA.msg
  - Uses MessageB from package_b

package_b:
  - Contains nodeB
  - Contains MessageB.msg
  - Uses MessageA from package_a

Circular dependency! Build fails!
```

**Solution with separate interface package:**
```
common_interfaces:
  - MessageA.msg
  - MessageB.msg

package_a:
  - Depends on common_interfaces ✓

package_b:
  - Depends on common_interfaces ✓

No circular dependency!
```

---

**2. Dependency Minimization**

```
# ❌ Bad: Interfaces in control package
my_robot_control:
  - control_node.cpp (10k lines)
  - motor_driver.cpp (5k lines)
  - SpeedCommand.msg

my_robot_navigation:
  - Needs SpeedCommand.msg
  - Must depend on entire my_robot_control package!
  - Gets unnecessary dependencies (motor drivers, etc.)

# ✅ Good: Separate interface package
my_robot_interfaces:
  - SpeedCommand.msg

my_robot_navigation:
  - Depends only on my_robot_interfaces
  - Lightweight dependency!
```

---

**3. Independent Versioning**

```
Scenario: Interface changes (add field to message)

❌ With interfaces in node package:
- Must bump version of entire package
- All dependent packages rebuild
- Coupled versioning

✅ With separate interface package:
- Bump interface package version only
- Node packages unchanged (if compatible)
- Independent versioning
```

---

**4. Reusability Across Projects**

```
Project 1: Warehouse robot
  - Uses my_robot_interfaces

Project 2: Delivery robot
  - Also uses my_robot_interfaces
  - No need to depend on warehouse-specific code!

# Interfaces are shared, implementation differs
```

---

**5. Build Order Clarity**

```
Build dependencies (with separate interface package):

1. my_robot_interfaces (built first, no dependencies)
2. my_robot_control (depends on interfaces)
3. my_robot_navigation (depends on interfaces)

Clear build order! Parallel builds possible (2 & 3).

# Without separate package:
- Build order unclear
- Potential circular dependencies
```

---

**Real-World Example: Nav2**

```
nav2_msgs:  # Separate interface package
  - msg/
  - srv/
  - action/

nav2_controller:
  - Depends on nav2_msgs ✓

nav2_planner:
  - Depends on nav2_msgs ✓

nav2_bt_navigator:
  - Depends on nav2_msgs ✓

All depend on interfaces, no circular dependencies!
```

---

**When is combined package OK?**

✅ **Small prototypes**: Single-package exploration
✅ **Self-contained utilities**: Package uses interfaces only internally
❌ **Production systems**: Always separate!

**Interview Insight:**
Separate interface packages avoid circular dependencies, minimize build dependencies, enable independent versioning, and improve reusability. Standard practice for production ROS2 systems.

---

### Q3: Explain how message default values work in ROS2.

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

**Common Misconception:**

```msg
# RobotConfig.msg
float32 max_speed 10.0    # Default value
bool enabled true
```

**Developers expect:**
```cpp
auto msg = my_interfaces::msg::RobotConfig();
// msg.max_speed == 10.0?  ❌ NO! It's 0.0
// msg.enabled == true?     ❌ NO! It's false
```

**Reality:**

Default values in `.msg` files are **NOT used for initialization** in C++ or Python!

---

**What Default Values Are Used For:**

**1. Documentation:**
```msg
float32 max_speed 10.0    # Documents the recommended default
```

Tools like `rqt` or `plotjuggler` can show this default.

**2. Type System Metadata:**
```bash
ros2 interface show my_interfaces/msg/RobotConfig
# Shows:
# float32 max_speed 10.0
# bool enabled true
```

**3. Code Generation (Constants):**
```cpp
// For constants, defaults ARE generated:
uint8 MODE_IDLE=0
uint8 MODE_ACTIVE=1

// In generated code:
static const uint8_t MODE_IDLE = 0;
static const uint8_t MODE_ACTIVE = 1;
```

---

**Actual Initialization Behavior:**

**C++: Zero-initialization**
```cpp
auto msg = my_interfaces::msg::RobotConfig();

// All fields zero-initialized:
// Numeric types: 0, 0.0
// Booleans: false
// Strings: ""
// Arrays: empty
```

**Python: Default construction**
```python
msg = my_interfaces.msg.RobotConfig()

# All fields default:
# Numeric: 0, 0.0
# Booleans: False
# Strings: ''
# Arrays: []
```

---

**How to Set Actual Defaults:**

**Option 1: Set in code explicitly**

```cpp
class MyNode : public rclcpp::Node {
    my_interfaces::msg::RobotConfig get_default_config() {
        auto config = my_interfaces::msg::RobotConfig();
        config.max_speed = 10.0;  // Set default
        config.enabled = true;
        return config;
    }
};
```

**Option 2: Use parameters**

```cpp
class MyNode : public rclcpp::Node {
    MyNode() : Node("my_node") {
        declare_parameter("max_speed", 10.0);  // Default in parameter
        declare_parameter("enabled", true);

        config_.max_speed = get_parameter("max_speed").as_double();
        config_.enabled = get_parameter("enabled").as_bool();
    }
};
```

**Option 3: Create wrapper struct**

```cpp
struct RobotConfigWithDefaults {
    my_interfaces::msg::RobotConfig msg;

    RobotConfigWithDefaults() {
        msg.max_speed = 10.0;
        msg.enabled = true;
    }
};
```

---

**Special Case: Constants**

```msg
# Constants WORK as expected
uint8 MODE_IDLE=0
uint8 MODE_ACTIVE=1

# In C++:
auto mode = my_interfaces::msg::RobotConfig::MODE_IDLE;  // 0 ✓

# In Python:
mode = my_interfaces.msg.RobotConfig.MODE_IDLE  # 0 ✓
```

Constants are compiled into code directly.

---

**Why This Design?**

**Performance:** Zero-initialization is fast and consistent across languages.

**Clarity:** Explicit initialization in code is clearer than hidden defaults.

**Safety:** Developers must consciously set values, preventing accidental reliance on defaults.

---

**Interview Insight:**
Default values in .msg files are documentation only, NOT used for initialization. C++ zero-initializes, Python uses default constructors. Constants (e.g., `MODE_IDLE=0`) ARE compiled and usable. Always set defaults explicitly in code or use parameters.

---

### Q4: What happens when you change a message definition after deploying it?

**Difficulty:** ⭐⭐⭐⭐ (Hard)

**Answer:**

Message changes can break compatibility between different versions of nodes. Understanding compatibility rules is critical for production systems.

**Compatibility Matrix:**

| Change | Compatible? | Old Producer → New Consumer | New Producer → Old Consumer |
|--------|-------------|---------------------------|---------------------------|
| **Add field (end)** | ✅ Yes | ✅ Works (field ignored) | ⚠️ Works (field has default) |
| **Remove field** | ❌ No | ❌ Fails (missing data) | ❌ Fails (unexpected structure) |
| **Rename field** | ❌ No | ❌ Fails | ❌ Fails |
| **Change type** | ❌ No | ❌ Fails | ❌ Fails |
| **Reorder fields** | ❌ No | ❌ Fails | ❌ Fails |
| **Change array size** | ❌ No | ❌ Fails | ❌ Fails |

---

**Scenario 1: Add Field (Compatible)**

**Version 1.0:**
```msg
std_msgs/Header header
float32 temperature
```

**Version 1.1:**
```msg
std_msgs/Header header
float32 temperature
float32 humidity    # ✅ Added at end
```

**Result:**

**Old node (v1.0) publishes → New node (v1.1) subscribes:**
```
Message received:
  temperature: 25.3
  humidity: 0.0      # ✅ Default value (field not in message)
```

**New node (v1.1) publishes → Old node (v1.0) subscribes:**
```
Message received:
  temperature: 25.3
  humidity: (ignored)  # ✅ Old node doesn't know about humidity
```

✅ **Compatible!** (with caveats - humidity will be 0 in old→new direction)

---

**Scenario 2: Remove Field (Incompatible)**

**Version 1.0:**
```msg
float32 temperature
float32 humidity
```

**Version 2.0:**
```msg
float32 temperature
# humidity removed
```

**Result:**

**Old node (v1.0) publishes → New node (v2.0) subscribes:**
```
❌ Deserialization error!
Expected message size doesn't match.
```

**New node (v2.0) publishes → Old node (v1.0) subscribes:**
```
❌ Deserialization error!
Old node expects humidity field.
```

❌ **Incompatible!**

---

**Scenario 3: Change Field Type (Incompatible)**

**Version 1.0:**
```msg
float32 voltage
```

**Version 2.0:**
```msg
float64 voltage    # Changed float32 → float64
```

**Result:**

**Any direction:**
```
❌ Serialization format mismatch!
float32 (4 bytes) vs float64 (8 bytes)
Deserialization fails or corrupts data.
```

❌ **Incompatible!**

---

**Scenario 4: Reorder Fields (Incompatible)**

**Version 1.0:**
```msg
float32 temperature
float32 humidity
```

**Version 2.0:**
```msg
float32 humidity       # Swapped order
float32 temperature
```

**Result:**

```
Old node publishes: temp=25.0, humidity=60.0
New node receives:  humidity=25.0, temp=60.0
❌ Data corruption! Fields swapped!
```

❌ **Incompatible!**

---

**Real-World Strategies:**

**Strategy 1: Version the Message**

```
Version 1.0:
my_interfaces/msg/RobotStatus.msg

Version 2.0 (breaking change):
my_interfaces/msg/RobotStatusV2.msg

# Both coexist, gradual migration
```

**Strategy 2: Deprecation Period**

```
Version 1.5 (transition):
std_msgs/Header header
float32 temperature
float32 humidity          # New field

# Publish both old and new versions:
publisher_old_ = create_publisher<StatusV1>("status", 10);
publisher_new_ = create_publisher<StatusV2>("status_v2", 10);

# 6 months later, remove old publisher
```

**Strategy 3: Semantic Versioning**

```xml
<version>2.0.0</version>  <!-- Major version bump for breaking change -->

Changelog:
- v2.0.0: Breaking change - removed `humidity` field
- v1.1.0: Added `pressure` field (compatible)
- v1.0.0: Initial release
```

**Strategy 4: Use Optional Fields**

```msg
# Instead of:
float32 humidity

# Use:
float32[] humidity    # Empty if not available

# Or:
bool has_humidity
float32 humidity
```

---

**Detection Mechanisms:**

**1. rosidl Hash:**

ROS2 generates type hash for each message. Mismatch detected at runtime:

```cpp
// Different type hash → warning
RCLCPP_WARN("Type hash mismatch for topic /status!");
```

**2. Version Checking:**

```cpp
// Manual version check
if (msg.header.frame_id == "v2") {
    // Handle v2 message
} else {
    // Handle v1 message
}
```

---

**Interview Insight:**
Only adding fields at the end is (mostly) compatible. Removing, reordering, renaming, or changing types breaks compatibility. Use versioned messages (V2), deprecation periods, or semantic versioning for breaking changes. ROS2 detects type hash mismatches at runtime.

---

### Q5: How do you optimize message performance for high-frequency, large data?

**Difficulty:** ⭐⭐⭐⭐ (Hard)

**Answer:**

Publishing large messages at high frequency impacts performance (CPU, bandwidth, latency). Optimization strategies:

---

**1. Choose Appropriate Data Types**

```msg
# ❌ Bad: Wasteful types
float64 temperature    # 8 bytes
uint64 id              # 8 bytes

# ✅ Good: Smaller types
float32 temperature    # 4 bytes (sufficient for sensors)
uint32 id              # 4 bytes (4B IDs enough)

# Savings: 50% reduction!
```

**Impact:**

For 1M messages/day:
- float64 array[1000]: 8 MB per message
- float32 array[1000]: 4 MB per message
- **Savings: 4 GB/day per subscriber!**

---

**2. Use Fixed Arrays Where Possible**

```msg
# ❌ Dynamic array (heap allocation, pointer indirection)
float32[] positions

# ✅ Fixed array (stack allocation, cache-friendly)
float32[3] position

# But only if size is truly fixed!
```

**Performance:**
- Fixed: ~1-2 μs allocation (stack)
- Dynamic: ~10-100 μs allocation (heap)

---

**3. Reduce Message Size with Compression**

```msg
# For images:
sensor_msgs/CompressedImage image    # JPEG/PNG compression

# vs
sensor_msgs/Image image              # Raw RGB data

# Compression: 10:1 to 30:1 typical
```

**Example:**
```
Raw image: 1920×1080×3 = 6.2 MB
JPEG compressed: ~200 KB
Bandwidth savings: 30x!
```

---

**4. Publish at Appropriate Rate**

```python
# ❌ Bad: Publishing 100 Hz when 10 Hz sufficient
self.create_timer(0.01, callback)  # 100 Hz

# ✅ Good: Match rate to consumer needs
self.create_timer(0.1, callback)   # 10 Hz

# Bandwidth savings: 10x!
```

**Rule of thumb:**
- Small messages (< 1 KB): Up to 1000 Hz OK
- Medium messages (1-100 KB): 10-100 Hz
- Large messages (> 1 MB): 1-10 Hz

---

**5. Use Appropriate QoS Settings**

```python
from rclpy.qos import QoSProfile, ReliabilityPolicy, DurabilityPolicy

# ❌ Bad: Reliable QoS for high-freq sensor data
qos = QoSProfile(
    reliability=ReliabilityPolicy.RELIABLE,  # Retransmits lost packets
    depth=10                                  # Buffers 10 messages
)

# ✅ Good: Best-effort for real-time data
qos = QoSProfile(
    reliability=ReliabilityPolicy.BEST_EFFORT,  # No retransmits
    durability=DurabilityPolicy.VOLATILE,       # No persistence
    depth=1                                     # Latest only
)
```

**Impact:**
- Best-effort: Lower latency, no retransmit overhead
- Depth=1: No buffering delay

---

**6. Split Large Messages**

```msg
# ❌ Bad: Single huge message
uint8[10000000] point_cloud    # 10 MB

# ✅ Good: Chunked messages
uint32 chunk_id
uint32 total_chunks
uint8[] data    # ~100 KB per chunk
```

**Benefits:**
- Smoother network utilization
- Reduced memory pressure
- Partial data reception possible

---

**7. Use Shared Memory (Intra-Process)**

For nodes in same process:

```cpp
rclcpp::NodeOptions options;
options.use_intra_process_comms(true);

auto node = std::make_shared<MyNode>(options);
```

**Effect:**
- No serialization!
- No network copy!
- Zero-copy message passing (pointers)

**Performance:**
- Regular: ~1 ms for 1 MB message
- Intra-process: ~1 μs (1000x faster!)

---

**8. Preallocate Message Buffers**

```cpp
class MyNode : public rclcpp::Node {
    // ❌ Bad: Allocate every time
    void callback() {
        auto msg = sensor_msgs::msg::PointCloud2();
        msg.data.resize(1000000);  // Allocates every time!
        publisher_->publish(msg);
    }

    // ✅ Good: Reuse buffer
    sensor_msgs::msg::PointCloud2 msg_buffer_;

    void callback() {
        // Reuse buffer (no allocation)
        msg_buffer_.header.stamp = now();
        publisher_->publish(msg_buffer_);
    }
};
```

**Savings:** Eliminates allocation overhead (can be 50% of publish time!)

---

**9. Profile and Measure**

```cpp
#include <chrono>

auto start = std::chrono::high_resolution_clock::now();
publisher_->publish(msg);
auto end = std::chrono::high_resolution_clock::now();

auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end - start);
RCLCPP_INFO(get_logger(), "Publish took %ld μs", duration.count());
```

**Tools:**
```bash
# Bandwidth monitoring
ros2 topic bw /my_topic

# Message rate
ros2 topic hz /my_topic

# Latency measurement
ros2 topic delay /my_topic
```

---

**Real-World Example:**

**Scenario:** Publishing 1920×1080 RGB images at 30 Hz

**Before optimization:**
```
Message: sensor_msgs/Image
Size: 6.2 MB
Rate: 30 Hz
Bandwidth: 186 MB/s ❌ Unsustainable!
```

**After optimization:**
```
1. Use CompressedImage: 6.2 MB → 200 KB (31x reduction)
2. Reduce rate to 15 Hz (sufficient for visualization)
3. Use BEST_EFFORT QoS
4. Intra-process comms for local nodes

Result:
Bandwidth: 3 MB/s ✅ 62x improvement!
```

---

**Interview Insight:**
Optimize by: smaller data types, compression, lower publish rate, BEST_EFFORT QoS, message chunking, intra-process comms, and buffer reuse. Profile first, optimize bottlenecks. Real-world: compressed images + reduced rate often gives 10-100x improvement.

---

## PRACTICE_TASKS

### Task 1: Create Custom Interface Package

**Goal:** Build interface package from scratch.

**Requirements:**
- Create `my_robot_interfaces` package
- Define message: `BatteryStatus.msg` (voltage, current, percentage)
- Define service: `ResetSystem.srv` (request: nothing, response: success + message)
- Define action: `ChargeBlatter.action` (goal: target percentage, result: final percentage, feedback: current percentage)
- Build and verify all interfaces

**Test:**
```bash
colcon build --packages-select my_robot_interfaces
ros2 interface show my_robot_interfaces/msg/BatteryStatus
ros2 interface list | grep my_robot
```

---

### Task 2: Use Custom Message in Publisher/Subscriber

**Goal:** Create nodes using custom message from Task 1.

**Requirements:**
- Publisher node (C++): Publishes BatteryStatus at 10 Hz
- Subscriber node (Python): Subscribes and logs battery info
- Battery discharges 0.1% per second
- When percentage < 20%, log warning

**Test:**
```bash
ros2 run my_pkg battery_publisher
ros2 run my_pkg battery_subscriber  # See discharge happening
```

---

### Task 3: Implement Custom Service

**Goal:** Create service server and client for Task 1 service.

**Requirements:**
- Server node: Implements `ResetSystem` service
- Client node: Calls service with command-line arg
- Server resets internal state counter
- Test with multiple calls

**Test:**
```bash
ros2 run my_pkg reset_server
ros2 run my_pkg reset_client  # Calls service
```

---

### Task 4: Message Evolution

**Goal:** Practice safe message evolution.

**Requirements:**
- Start with simple message (v1.0)
- Add field (v1.1) - ensure compatibility
- Create breaking change version (v2.0)
- Test old publisher with new subscriber
- Document compatibility

---

## QUICK_REFERENCE

### Interface File Locations

```
my_robot_interfaces/
├── action/
│   └── MyAction.action
├── msg/
│   └── MyMessage.msg
├── srv/
│   └── MyService.srv
├── CMakeLists.txt
└── package.xml
```

### Message Definition

```msg
# Comments
std_msgs/Header header
field_type field_name
field_type field_name default_value
field_type[] dynamic_array
field_type[N] fixed_array
uint8 CONSTANT=0
```

### Service Definition

```srv
# Request
field_type request_field
---
# Response
field_type response_field
```

### Action Definition

```action
# Goal
field_type goal_field
---
# Result
field_type result_field
---
# Feedback
field_type feedback_field
```

### CMakeLists.txt Template

```cmake
find_package(rosidl_default_generators REQUIRED)
find_package(std_msgs REQUIRED)

rosidl_generate_interfaces(${PROJECT_NAME}
  "msg/MyMessage.msg"
  "srv/MyService.srv"
  "action/MyAction.action"
  DEPENDENCIES std_msgs
)
```

### Build and Inspect

```bash
# Build
colcon build --packages-select my_interfaces

# Show interface
ros2 interface show my_interfaces/msg/MyMessage

# List all
ros2 interface list | grep my_interfaces

# Show package interfaces
ros2 interface package my_interfaces
```

### Using in C++

```cpp
#include "my_interfaces/msg/my_message.hpp"

auto msg = my_interfaces::msg::MyMessage();
msg.field = value;
publisher_->publish(msg);
```

### Using in Python

```python
from my_interfaces.msg import MyMessage

msg = MyMessage()
msg.field = value
self.publisher.publish(msg)
```

---

**END OF TOPIC 6.2: Custom Messages & Interface Design**
