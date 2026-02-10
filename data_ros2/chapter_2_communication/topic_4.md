# Topic 2.4: Parameters

## THEORY_SECTION

### 1. Parameter Fundamentals

**What are Parameters?**

Parameters are **node configuration values** that can be:
- **Declared** at node startup
- **Set** via launch files, command line, or services
- **Changed** at runtime (dynamic reconfiguration)
- **Read** by other nodes via services

**Purpose:**
- Configure node behavior without recompiling
- Runtime tuning (PID gains, thresholds, etc.)
- Adapt to different environments (sim vs hardware)
- Multi-robot configuration (robot-specific settings)

**Parameter Types:**

| Type | C++ | Python | Example |
|------|-----|--------|---------|
| **bool** | `bool` | `bool` | `True`, `False` |
| **int** | `int64_t` | `int` | `42`, `-10` |
| **double** | `double` | `float` | `3.14`, `-2.5` |
| **string** | `std::string` | `str` | `"hello"`, `"robot1"` |
| **byte_array** | `std::vector<uint8_t>` | `bytes` | `[0x01, 0x02]` |
| **bool_array** | `std::vector<bool>` | `List[bool]` | `[True, False]` |
| **integer_array** | `std::vector<int64_t>` | `List[int]` | `[1, 2, 3]` |
| **double_array** | `std::vector<double>` | `List[float]` | `[1.0, 2.5]` |
| **string_array** | `std::vector<std::string>` | `List[str]` | `["a", "b"]` |

---

### 2. Declaring Parameters

**Why Declare Parameters?**

In ROS2, parameters must be **explicitly declared** before use (unlike ROS1).

**Benefits:**
- **Type safety**: Enforces parameter type
- **Validation**: Can set constraints (min/max, allowed values)
- **Documentation**: Description of parameter purpose
- **Discovery**: Other nodes can list available parameters

**C++ Parameter Declaration:**

```cpp
#include "rclcpp/rclcpp.hpp"

class MyNode : public rclcpp::Node {
public:
    MyNode() : Node("my_node") {
        // Simple declaration (default value, inferred type)
        declare_parameter("robot_name", "robot1");
        declare_parameter("max_speed", 1.0);
        declare_parameter("enable_debug", false);

        // Get parameter values
        robot_name_ = get_parameter("robot_name").as_string();
        max_speed_ = get_parameter("max_speed").as_double();
        enable_debug_ = get_parameter("enable_debug").as_bool();

        RCLCPP_INFO(get_logger(), "Robot: %s, Max speed: %.2f",
                    robot_name_.c_str(), max_speed_);
    }

private:
    std::string robot_name_;
    double max_speed_;
    bool enable_debug_;
};
```

**Python Parameter Declaration:**

```python
import rclpy
from rclpy.node import Node

class MyNode(Node):
    def __init__(self):
        super().__init__('my_node')

        # Declare parameters
        self.declare_parameter('robot_name', 'robot1')
        self.declare_parameter('max_speed', 1.0)
        self.declare_parameter('enable_debug', False)

        # Get parameter values
        self.robot_name = self.get_parameter('robot_name').value
        self.max_speed = self.get_parameter('max_speed').value
        self.enable_debug = self.get_parameter('enable_debug').value

        self.get_logger().info(f'Robot: {self.robot_name}, Max speed: {self.max_speed}')
```

---

### 3. Parameter Descriptors (Validation and Constraints)

**ParameterDescriptor:**

Provides metadata and constraints for parameters.

**C++ with Descriptor:**

```cpp
// Declare with constraints
auto descriptor = rcl_interfaces::msg::ParameterDescriptor();
descriptor.description = "Maximum robot speed in m/s";
descriptor.read_only = false;

// Set range constraints
descriptor.floating_point_range.resize(1);
descriptor.floating_point_range[0].from_value = 0.0;
descriptor.floating_point_range[0].to_value = 5.0;
descriptor.floating_point_range[0].step = 0.1;

declare_parameter("max_speed", 1.0, descriptor);
```

**Descriptor Fields:**

| Field | Purpose | Example |
|-------|---------|---------|
| `description` | Human-readable description | `"PID proportional gain"` |
| `read_only` | Prevent runtime changes | `true` |
| `integer_range` | Min/max/step for int | `[0, 100, 1]` |
| `floating_point_range` | Min/max/step for double | `[0.0, 10.0, 0.1]` |

**Example with Validation:**

```cpp
MyNode() : Node("my_node") {
    // Declare PID gains with constraints
    auto kp_descriptor = rcl_interfaces::msg::ParameterDescriptor();
    kp_descriptor.description = "Proportional gain";
    kp_descriptor.floating_point_range.resize(1);
    kp_descriptor.floating_point_range[0].from_value = 0.0;
    kp_descriptor.floating_point_range[0].to_value = 100.0;

    declare_parameter("kp", 1.0, kp_descriptor);
    declare_parameter("ki", 0.1, kp_descriptor);  // Same constraints
    declare_parameter("kd", 0.05, kp_descriptor);

    // Read-only parameter (can't be changed at runtime)
    auto robot_id_descriptor = rcl_interfaces::msg::ParameterDescriptor();
    robot_id_descriptor.description = "Robot unique ID";
    robot_id_descriptor.read_only = true;

    declare_parameter("robot_id", "robot_001", robot_id_descriptor);
}
```

---

### 4. Setting Parameters

**At Node Startup (Command Line):**

```bash
ros2 run my_package my_node --ros-args -p robot_name:=robot2 -p max_speed:=2.5
```

**From Launch File:**

```python
Node(
    package='my_package',
    executable='my_node',
    parameters=[{
        'robot_name': 'robot2',
        'max_speed': 2.5,
        'enable_debug': True
    }]
)
```

**From YAML File:**

**config/params.yaml:**
```yaml
my_node:
  ros__parameters:
    robot_name: 'robot2'
    max_speed: 2.5
    enable_debug: true
    joint_names: ['joint1', 'joint2', 'joint3']  # Array
```

**Launch file:**
```python
config_file = PathJoinSubstitution([
    FindPackageShare('my_package'),
    'config',
    'params.yaml'
])

Node(
    package='my_package',
    executable='my_node',
    name='my_node',  # Must match YAML key
    parameters=[config_file]
)
```

**At Runtime (Command Line):**

```bash
# Get parameter value
ros2 param get /my_node robot_name
# String value is: robot2

# Set parameter value
ros2 param set /my_node max_speed 3.0
# Set parameter successful

# List all parameters
ros2 param list /my_node

# Dump all parameters to YAML
ros2 param dump /my_node
```

**At Runtime (Programmatically):**

```cpp
// Create parameter client
auto param_client = std::make_shared<rclcpp::SyncParametersClient>(node, "/other_node");

// Wait for service
while (!param_client->wait_for_service(1s)) {
    RCLCPP_INFO(node->get_logger(), "Waiting for parameter service...");
}

// Get parameter
auto max_speed = param_client->get_parameter<double>("max_speed");
RCLCPP_INFO(node->get_logger(), "Max speed: %.2f", max_speed);

// Set parameter
param_client->set_parameters({
    rclcpp::Parameter("max_speed", 2.5),
    rclcpp::Parameter("robot_name", "robot3")
});
```

---

### 5. Parameter Callbacks (Dynamic Reconfiguration)

**On Set Parameters Callback:**

Called when parameter value changes. Can **accept or reject** change.

**C++ Callback:**

```cpp
class MyNode : public rclcpp::Node {
public:
    MyNode() : Node("my_node") {
        declare_parameter("max_speed", 1.0);

        // Register callback
        param_callback_handle_ = add_on_set_parameters_callback(
            std::bind(&MyNode::on_parameter_change, this, std::placeholders::_1)
        );
    }

private:
    rcl_interfaces::msg::SetParametersResult on_parameter_change(
        const std::vector<rclcpp::Parameter> & parameters)
    {
        auto result = rcl_interfaces::msg::SetParametersResult();
        result.successful = true;

        for (const auto & param : parameters) {
            if (param.get_name() == "max_speed") {
                double new_speed = param.as_double();

                // Validate
                if (new_speed < 0.0 || new_speed > 5.0) {
                    result.successful = false;
                    result.reason = "max_speed must be between 0.0 and 5.0";
                    RCLCPP_WARN(get_logger(), "%s", result.reason.c_str());
                    return result;  // Reject change
                }

                // Accept change
                max_speed_ = new_speed;
                RCLCPP_INFO(get_logger(), "Max speed changed to %.2f", max_speed_);
            }
        }

        return result;  // Accept changes
    }

    double max_speed_;
    rclcpp::node_interfaces::OnSetParametersCallbackHandle::SharedPtr param_callback_handle_;
};
```

**Python Callback:**

```python
class MyNode(Node):
    def __init__(self):
        super().__init__('my_node')

        self.declare_parameter('max_speed', 1.0)

        # Register callback
        self.add_on_set_parameters_callback(self.on_parameter_change)

    def on_parameter_change(self, params):
        result = SetParametersResult()
        result.successful = True

        for param in params:
            if param.name == 'max_speed':
                new_speed = param.value

                # Validate
                if new_speed < 0.0 or new_speed > 5.0:
                    result.successful = False
                    result.reason = 'max_speed must be between 0.0 and 5.0'
                    self.get_logger().warn(result.reason)
                    return result  # Reject

                # Accept
                self.max_speed = new_speed
                self.get_logger().info(f'Max speed changed to {self.max_speed}')

        return result
```

**Usage:**

```bash
# Try to set invalid value
ros2 param set /my_node max_speed 10.0
# Setting parameter failed: max_speed must be between 0.0 and 5.0

# Set valid value
ros2 param set /my_node max_speed 2.5
# Set parameter successful
```

---

### 6. Parameter Events

**Parameter Event Topic:**

ROS2 publishes parameter changes to `/parameter_events` topic.

**Subscribing to Parameter Events:**

```cpp
#include "rcl_interfaces/msg/parameter_event.hpp"

class ParameterWatcher : public rclcpp::Node {
public:
    ParameterWatcher() : Node("param_watcher") {
        param_event_sub_ = create_subscription<rcl_interfaces::msg::ParameterEvent>(
            "/parameter_events",
            10,
            std::bind(&ParameterWatcher::param_event_callback, this, std::placeholders::_1)
        );
    }

private:
    void param_event_callback(const rcl_interfaces::msg::ParameterEvent::SharedPtr event) {
        RCLCPP_INFO(get_logger(), "Parameter event from node: %s", event->node.c_str());

        for (const auto & new_param : event->new_parameters) {
            RCLCPP_INFO(get_logger(), "  New: %s", new_param.name.c_str());
        }

        for (const auto & changed_param : event->changed_parameters) {
            RCLCPP_INFO(get_logger(), "  Changed: %s", changed_param.name.c_str());
        }

        for (const auto & deleted_param : event->deleted_parameters) {
            RCLCPP_INFO(get_logger(), "  Deleted: %s", deleted_param.name.c_str());
        }
    }

    rclcpp::Subscription<rcl_interfaces::msg::ParameterEvent>::SharedPtr param_event_sub_;
};
```

---

### 7. Built-in Parameter Services

**Every ROS2 node automatically provides these services:**

```bash
ros2 service list | grep my_node
# /my_node/describe_parameters
# /my_node/get_parameter_types
# /my_node/get_parameters
# /my_node/list_parameters
# /my_node/set_parameters
# /my_node/set_parameters_atomically
```

| Service | Purpose |
|---------|---------|
| `list_parameters` | Get list of all declared parameters |
| `get_parameters` | Get values of specific parameters |
| `set_parameters` | Set multiple parameters (individually) |
| `set_parameters_atomically` | Set multiple parameters (all or nothing) |
| `describe_parameters` | Get parameter descriptors |
| `get_parameter_types` | Get parameter types |

**Command Line Usage:**

```bash
# List all parameters
ros2 param list /my_node

# Get parameter value
ros2 param get /my_node max_speed

# Set parameter
ros2 param set /my_node max_speed 2.5

# Get parameter description
ros2 param describe /my_node max_speed

# Dump all parameters to file
ros2 param dump /my_node > my_params.yaml

# Load parameters from file
ros2 param load /my_node my_params.yaml
```

---

## EDGE_CASES

### Edge Case 1: Undeclared Parameter Access

**Scenario:**
Try to get/set parameter that wasn't declared.

**Code:**
```cpp
MyNode() : Node("my_node") {
    // Forgot to declare parameter!
    // declare_parameter("max_speed", 1.0);

    // Try to get undeclared parameter
    auto max_speed = get_parameter("max_speed");  // EXCEPTION!
}
```

**Error:**
```
terminate called after throwing an instance of 'rclcpp::exceptions::ParameterNotDeclaredException'
  what():  parameter 'max_speed' has not been declared
```

**Why:**
- ROS2 requires explicit parameter declaration (unlike ROS1)
- Prevents typos and missing parameters

**Solution 1 - Declare with Default:**

```cpp
declare_parameter("max_speed", 1.0);  // Must declare first
auto max_speed = get_parameter("max_speed").as_double();
```

**Solution 2 - Allow Undeclared (Not Recommended):**

```cpp
MyNode() : Node("my_node") {
    // Allow undeclared parameters (not recommended!)
    declare_parameter("", rclcpp::ParameterValue(), rcl_interfaces::msg::ParameterDescriptor(), true);

    // Now can get undeclared param (returns default if not set)
    auto max_speed = get_parameter_or("max_speed", 1.0);
}
```

**Solution 3 - Check if Declared:**

```cpp
if (has_parameter("max_speed")) {
    auto max_speed = get_parameter("max_speed").as_double();
} else {
    RCLCPP_WARN(get_logger(), "Parameter 'max_speed' not declared, using default");
    max_speed_ = 1.0;
}
```

**Interview Insight:**
Always declare parameters explicitly. Use `get_parameter_or()` for optional parameters with defaults.

---

### Edge Case 2: Parameter Type Mismatch

**Scenario:**
Declare parameter as `double`, set as `int` from command line.

**Declaration:**
```cpp
declare_parameter("max_speed", 1.0);  // double
```

**Command line:**
```bash
ros2 run my_package my_node --ros-args -p max_speed:=2
# Integer 2, not double 2.0
```

**Result:**
```cpp
auto max_speed = get_parameter("max_speed").as_double();  // Gets 2.0 (auto-converted)
```

**Behavior:**
- ROS2 **auto-converts** compatible types (int → double)
- Incompatible conversions throw exception

**Type Conversion Rules:**

| Declared As | Set As | Result |
|-------------|--------|--------|
| `double` | `int` | ✓ Auto-converted to double |
| `int` | `double` | ✗ Exception (loss of precision) |
| `string` | `int` | ✗ Exception |
| `bool` | `string` "true" | ✗ Exception (must be bool) |

**Strict Type Checking:**

```cpp
declare_parameter("max_speed", 1.0);  // double

try {
    // This works (int → double)
    set_parameter(rclcpp::Parameter("max_speed", 2));  // int 2 → double 2.0

} catch (const rclcpp::exceptions::InvalidParameterTypeException &e) {
    RCLCPP_ERROR(get_logger(), "Type error: %s", e.what());
}
```

**Interview Insight:**
ROS2 auto-converts compatible types (int → double). Incompatible types throw exceptions.

---

### Edge Case 3: Read-Only Parameter Modification

**Scenario:**
Try to change read-only parameter at runtime.

**Declaration:**
```cpp
auto descriptor = rcl_interfaces::msg::ParameterDescriptor();
descriptor.read_only = true;

declare_parameter("robot_id", "robot_001", descriptor);
```

**Runtime change attempt:**
```bash
ros2 param set /my_node robot_id robot_002
```

**Result:**
```
Setting parameter failed: parameter 'robot_id' cannot be set because it is read-only
```

**When to Use Read-Only:**
- Configuration that shouldn't change (robot ID, hardware IDs)
- Safety-critical values
- Values determined at startup (calibration)

**Workaround (If Needed):**

```cpp
// Make parameter read-only AFTER initial configuration
MyNode() : Node("my_node") {
    declare_parameter("robot_id", "default");

    // Load from config or command line...
    auto robot_id = get_parameter("robot_id").as_string();

    // Now make read-only
    auto descriptor = rcl_interfaces::msg::ParameterDescriptor();
    descriptor.read_only = true;
    set_parameter_descriptor("robot_id", descriptor);
}
```

**Interview Insight:**
Use read-only parameters for values that must not change at runtime. Set descriptor to `read_only = true`.

---

### Edge Case 4: Callback Rejects Parameter Change

**Scenario:**
Parameter callback rejects change, but code assumes parameter updated.

**Code:**
```cpp
double max_speed_ = 1.0;

rcl_interfaces::msg::SetParametersResult on_parameter_change(
    const std::vector<rclcpp::Parameter> & parameters)
{
    auto result = rcl_interfaces::msg::SetParametersResult();

    for (const auto & param : parameters) {
        if (param.get_name() == "max_speed") {
            double new_speed = param.as_double();

            if (new_speed > 5.0) {
                result.successful = false;
                result.reason = "max_speed too high";
                return result;  // REJECT change
            }

            // BUG: Update member variable even if rejected later
            max_speed_ = new_speed;  // ← WRONG! Change might be rejected
        }
    }

    result.successful = true;
    return result;
}
```

**Problem:**
- If callback rejects, `max_speed_` was already updated
- Inconsistent state

**Correct Approach:**

```cpp
rcl_interfaces::msg::SetParametersResult on_parameter_change(
    const std::vector<rclcpp::Parameter> & parameters)
{
    auto result = rcl_interfaces::msg::SetParametersResult();
    result.successful = true;

    for (const auto & param : parameters) {
        if (param.get_name() == "max_speed") {
            double new_speed = param.as_double();

            // VALIDATE FIRST
            if (new_speed < 0.0 || new_speed > 5.0) {
                result.successful = false;
                result.reason = "max_speed out of range [0, 5]";
                return result;  // Reject, don't modify anything
            }
        }
    }

    // All validations passed → THEN update member variables
    for (const auto & param : parameters) {
        if (param.get_name() == "max_speed") {
            max_speed_ = param.as_double();
            RCLCPP_INFO(get_logger(), "Updated max_speed: %.2f", max_speed_);
        }
    }

    return result;
}
```

**Interview Insight:**
Validate ALL parameters before modifying state. Return rejection early if any validation fails.

---

## CODE_EXAMPLES

### Example 1: PID Controller with Dynamic Reconfiguration

```cpp
#include "rclcpp/rclcpp.hpp"
#include "geometry_msgs/msg/twist.hpp"
#include "nav_msgs/msg/odometry.hpp"

class PIDController : public rclcpp::Node {
public:
    PIDController() : Node("pid_controller") {
        // Declare PID gains with constraints
        declare_pid_parameters();

        // Load initial values
        update_gains();

        // Register parameter callback for dynamic reconfiguration
        param_callback_handle_ = add_on_set_parameters_callback(
            std::bind(&PIDController::on_parameter_change, this, std::placeholders::_1)
        );

        // Subscribers and publishers
        odom_sub_ = create_subscription<nav_msgs::msg::Odometry>(
            "odom", 10,
            std::bind(&PIDController::odom_callback, this, std::placeholders::_1)
        );

        cmd_pub_ = create_publisher<geometry_msgs::msg::Twist>("cmd_vel", 10);

        // Control loop timer
        timer_ = create_wall_timer(
            std::chrono::milliseconds(50),
            std::bind(&PIDController::control_loop, this)
        );

        RCLCPP_INFO(get_logger(), "PID Controller initialized");
    }

private:
    void declare_pid_parameters() {
        // Create descriptor with range constraints
        auto gain_descriptor = rcl_interfaces::msg::ParameterDescriptor();
        gain_descriptor.floating_point_range.resize(1);
        gain_descriptor.floating_point_range[0].from_value = 0.0;
        gain_descriptor.floating_point_range[0].to_value = 100.0;
        gain_descriptor.floating_point_range[0].step = 0.01;

        gain_descriptor.description = "Proportional gain";
        declare_parameter("kp", 1.0, gain_descriptor);

        gain_descriptor.description = "Integral gain";
        declare_parameter("ki", 0.1, gain_descriptor);

        gain_descriptor.description = "Derivative gain";
        declare_parameter("kd", 0.05, gain_descriptor);

        // Target position
        declare_parameter("target_position", 5.0);

        // Enable/disable control
        auto enable_descriptor = rcl_interfaces::msg::ParameterDescriptor();
        enable_descriptor.description = "Enable controller";
        declare_parameter("enable_control", true, enable_descriptor);
    }

    void update_gains() {
        kp_ = get_parameter("kp").as_double();
        ki_ = get_parameter("ki").as_double();
        kd_ = get_parameter("kd").as_double();
        target_position_ = get_parameter("target_position").as_double();
        enable_control_ = get_parameter("enable_control").as_bool();
    }

    rcl_interfaces::msg::SetParametersResult on_parameter_change(
        const std::vector<rclcpp::Parameter> & parameters)
    {
        auto result = rcl_interfaces::msg::SetParametersResult();
        result.successful = true;

        // Validate all parameters first
        for (const auto & param : parameters) {
            if (param.get_name() == "kp" || param.get_name() == "ki" || param.get_name() == "kd") {
                double value = param.as_double();
                if (value < 0.0 || value > 100.0) {
                    result.successful = false;
                    result.reason = param.get_name() + " must be in range [0, 100]";
                    return result;
                }
            }
        }

        // All valid → update gains
        for (const auto & param : parameters) {
            if (param.get_name() == "kp") {
                kp_ = param.as_double();
                integral_ = 0.0;  // Reset integral on gain change
                RCLCPP_INFO(get_logger(), "kp updated: %.3f", kp_);

            } else if (param.get_name() == "ki") {
                ki_ = param.as_double();
                integral_ = 0.0;
                RCLCPP_INFO(get_logger(), "ki updated: %.3f", ki_);

            } else if (param.get_name() == "kd") {
                kd_ = param.as_double();
                RCLCPP_INFO(get_logger(), "kd updated: %.3f", kd_);

            } else if (param.get_name() == "target_position") {
                target_position_ = param.as_double();
                integral_ = 0.0;  // Reset integral on target change
                RCLCPP_INFO(get_logger(), "Target position: %.2f", target_position_);

            } else if (param.get_name() == "enable_control") {
                enable_control_ = param.as_bool();
                if (!enable_control_) {
                    integral_ = 0.0;  // Reset integral when disabled
                }
                RCLCPP_INFO(get_logger(), "Control %s", enable_control_ ? "enabled" : "disabled");
            }
        }

        return result;
    }

    void odom_callback(const nav_msgs::msg::Odometry::SharedPtr msg) {
        current_position_ = msg->pose.pose.position.x;
    }

    void control_loop() {
        if (!enable_control_) {
            // Publish zero command
            auto cmd = geometry_msgs::msg::Twist();
            cmd_pub_->publish(cmd);
            return;
        }

        // PID control
        double error = target_position_ - current_position_;

        integral_ += error * 0.05;  // dt = 50ms
        double derivative = (error - prev_error_) / 0.05;
        prev_error_ = error;

        double control = kp_ * error + ki_ * integral_ + kd_ * derivative;

        // Clamp output
        control = std::clamp(control, -2.0, 2.0);

        // Publish command
        auto cmd = geometry_msgs::msg::Twist();
        cmd.linear.x = control;
        cmd_pub_->publish(cmd);
    }

    // PID gains (can be changed at runtime)
    double kp_, ki_, kd_;
    double target_position_;
    bool enable_control_;

    // PID state
    double current_position_ = 0.0;
    double prev_error_ = 0.0;
    double integral_ = 0.0;

    rclcpp::Subscription<nav_msgs::msg::Odometry>::SharedPtr odom_sub_;
    rclcpp::Publisher<geometry_msgs::msg::Twist>::SharedPtr cmd_pub_;
    rclcpp::TimerBase::SharedPtr timer_;
    rclcpp::node_interfaces::OnSetParametersCallbackHandle::SharedPtr param_callback_handle_;
};

int main(int argc, char **argv) {
    rclcpp::init(argc, argv);
    rclcpp::spin(std::make_shared<PIDController>());
    rclcpp::shutdown();
    return 0;
}
```

**Usage:**

```bash
# Run with defaults
ros2 run my_package pid_controller

# Run with custom gains
ros2 run my_package pid_controller --ros-args -p kp:=2.0 -p ki:=0.5

# Tune gains at runtime
ros2 param set /pid_controller kp 1.5
ros2 param set /pid_controller target_position 10.0

# Disable control
ros2 param set /pid_controller enable_control false
```

---

## INTERVIEW_QA

### Q1: Why must parameters be declared in ROS2 (unlike ROS1)?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

**ROS1:**
- Parameters accessed without declaration
- Typos silently return defaults
- No type safety
- No validation

**ROS2:**
- **Must declare** parameters before use
- **Type safety**: Enforced parameter types
- **Validation**: Min/max, allowed values
- **Discovery**: Other nodes can list available parameters
- **Documentation**: Parameter descriptions

**Example:**

```cpp
// ROS1 (no declaration)
double max_speed = nh.param<double>("max_sped", 1.0);  // Typo! Gets default 1.0, no error

// ROS2 (must declare)
declare_parameter("max_speed", 1.0);
double max_speed = get_parameter("max_speed").as_double();  // Throws exception if typo
```

**Benefits:**

1. **Catches typos early** (exception instead of silent default)
2. **Self-documenting** (list parameters with `ros2 param list`)
3. **Validation** (range constraints, read-only)
4. **Type safety** (prevents type errors)

**Interview Insight:**
Explicit declaration prevents bugs from typos and improves parameter discoverability.

---

### Q2: What's the difference between `get_parameter()` and `get_parameter_or()`?

**Difficulty:** ⭐⭐ (Easy)

**Answer:**

| Method | Declared Required? | Not Found Behavior |
|--------|-------------------|--------------------|
| `get_parameter()` | **YES** | **Exception** |
| `get_parameter_or()` | NO | Returns default value |

**Example:**

```cpp
// Must be declared
declare_parameter("max_speed", 1.0);
auto max_speed = get_parameter("max_speed").as_double();  // ✓ Works

// Undeclared parameter
// auto value = get_parameter("typo").as_double();  // ✗ Exception!

// get_parameter_or: No declaration required
auto timeout = get_parameter_or("timeout", 5.0);  // ✓ Returns 5.0 if not set
```

**When to Use:**

- **`get_parameter()`**: Required parameters (node fails if missing)
- **`get_parameter_or()`**: Optional parameters with sensible defaults

**Interview Insight:**
Use `get_parameter_or()` for optional parameters. Use `get_parameter()` for required parameters.

---

### Q3: How do you handle parameter validation (e.g., enforce min/max values)?

**Difficulty:** ⭐⭐⭐⭐ (Hard)

**Answer:**

**Two Methods:**

**1. Descriptor Constraints (Declarative):**

```cpp
auto descriptor = rcl_interfaces::msg::ParameterDescriptor();
descriptor.floating_point_range.resize(1);
descriptor.floating_point_range[0].from_value = 0.0;  // Min
descriptor.floating_point_range[0].to_value = 5.0;    // Max

declare_parameter("max_speed", 1.0, descriptor);
```

**Limitation:** Only supports simple range constraints (min/max).

**2. Parameter Callback (Imperative):**

```cpp
rcl_interfaces::msg::SetParametersResult on_parameter_change(
    const std::vector<rclcpp::Parameter> & parameters)
{
    auto result = rcl_interfaces::msg::SetParametersResult();
    result.successful = true;

    for (const auto & param : parameters) {
        if (param.get_name() == "max_speed") {
            double value = param.as_double();

            // Custom validation
            if (value < 0.0 || value > 5.0) {
                result.successful = false;
                result.reason = "max_speed must be in [0, 5]";
                return result;  // Reject change
            }

            // Additional logic (e.g., check compatibility with other params)
            auto min_speed = get_parameter("min_speed").as_double();
            if (value < min_speed) {
                result.successful = false;
                result.reason = "max_speed cannot be less than min_speed";
                return result;
            }
        }
    }

    return result;  // Accept
}
```

**When to Use:**

- **Descriptor**: Simple range validation
- **Callback**: Complex validation (multi-parameter dependencies, custom logic)

**Interview Insight:**
Use descriptor for simple ranges. Use callback for complex validation and cross-parameter constraints.

---

### Q4: What happens when you set a read-only parameter?

**Difficulty:** ⭐⭐ (Easy)

**Answer:**

**Attempting to set read-only parameter → Rejection.**

```cpp
// Declare read-only parameter
auto descriptor = rcl_interfaces::msg::ParameterDescriptor();
descriptor.read_only = true;
declare_parameter("robot_id", "robot_001", descriptor);
```

```bash
ros2 param set /my_node robot_id robot_002
# Setting parameter failed: parameter 'robot_id' cannot be set because it is read-only
```

**Use Cases:**

- Hardware IDs (fixed at startup)
- Calibration values (loaded once)
- Safety-critical constants

**Interview Insight:**
Read-only parameters can't be changed at runtime. Set `descriptor.read_only = true`.

---

### Q5: How do parameter events work?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

**Parameter Event Topic:**

Every parameter change publishes to `/parameter_events` topic.

**Message Type:** `rcl_interfaces/msg/ParameterEvent`

**Fields:**
- `node`: Node name
- `new_parameters`: Newly declared parameters
- `changed_parameters`: Modified parameters
- `deleted_parameters`: Removed parameters

**Subscribing:**

```cpp
auto sub = create_subscription<rcl_interfaces::msg::ParameterEvent>(
    "/parameter_events",
    10,
    [this](rcl_interfaces::msg::ParameterEvent::SharedPtr event) {
        for (const auto & changed : event->changed_parameters) {
            RCLCPP_INFO(get_logger(), "Parameter %s changed on node %s",
                        changed.name.c_str(), event->node.c_str());
        }
    }
);
```

**Use Cases:**

- **Monitoring**: Centralized parameter change logging
- **Synchronization**: Coordinate parameter changes across nodes
- **Debugging**: Track when/how parameters change

**Interview Insight:**
All parameter changes published to `/parameter_events`. Subscribe to monitor changes globally.

---

## PRACTICE_TASKS

### Task 1: Dynamic Robot Configuration

Create node with parameters:
- `max_speed`, `min_speed`, `acceleration`
- Validate: `max_speed > min_speed`, both > 0
- Dynamic reconfiguration with callback
- Save parameters to YAML on shutdown

---

### Task 2: Parameter Monitoring Dashboard

Create node that:
- Subscribes to `/parameter_events`
- Tracks all parameter changes
- Publishes dashboard topic with recent changes
- Alerts on critical parameter changes

---

### Task 3: Multi-Robot Parameter Management

Create system with:
- 3 robot nodes, each with parameters
- Central node that syncs common parameters
- Per-robot overrides
- YAML configuration file

---

## QUICK_REFERENCE

### Parameter Declaration

```cpp
// Simple
declare_parameter("name", default_value);

// With descriptor
auto descriptor = rcl_interfaces::msg::ParameterDescriptor();
descriptor.description = "Description";
descriptor.read_only = false;
declare_parameter("name", default_value, descriptor);
```

### Getting Parameters

```cpp
auto value = get_parameter("name").as_double();
auto value = get_parameter_or("name", default);
```

### Parameter Callback

```cpp
add_on_set_parameters_callback(
    std::bind(&MyNode::on_parameter_change, this, std::placeholders::_1)
);
```

### Command Line

```bash
ros2 param list /node          # List parameters
ros2 param get /node name      # Get value
ros2 param set /node name val  # Set value
ros2 param dump /node          # Export to YAML
ros2 param load /node file.yaml # Load from YAML
```

---

**END OF TOPIC 2.4**
