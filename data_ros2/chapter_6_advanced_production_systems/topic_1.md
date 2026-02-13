## TOPIC: Lifecycle Nodes & Managed Components


---

## THEORY_SECTION
### 1. What are Lifecycle Nodes?

**Definition:**

Lifecycle nodes (also called "managed nodes") are ROS2 nodes with a **deterministic state machine** that allows controlled initialization, configuration, activation, deactivation, and shutdown.

**Why Lifecycle Nodes Exist:**

Traditional ROS nodes start immediately upon launch:
```cpp
// Regular node - starts immediately
class MyNode : public rclcpp::Node {
public:
    MyNode() : Node("my_node") {
        publisher_ = create_publisher<String>("topic", 10);
        // Publishing immediately!
    }
};
```

**Problems with Regular Nodes:**
- **Unpredictable startup order**: Node A may publish before Node B subscribes
- **No initialization control**: Can't configure before activation
- **Difficult error recovery**: Can't cleanly restart without killing process
- **No graceful shutdown**: Hard to deactivate without destroying

**Lifecycle nodes solve this:**
- **Controlled startup**: Configure → Activate (two-phase initialization)
- **State management**: Can deactivate, reconfigure, reactivate without restart
- **Error recovery**: Transition to error state, recover, continue
- **Graceful shutdown**: Deactivate cleanly before destruction

**Where Used:**
- **Nav2**: All navigation nodes (costmaps, planners, controllers)
- **ros2_control**: Hardware interfaces, controllers
- **Production systems**: Any system requiring controlled startup/shutdown
- **Multi-robot coordination**: Synchronized state management

---

### 2. Lifecycle State Machine

**State Diagram:**

```
        ┌─────────────┐
  START │ Unconfigured│
        └──────┬──────┘
               │ configure() [on_configure()]
               ↓
        ┌─────────────┐
        │  Inactive   │←──────────────┐
        └──────┬──────┘                │
               │ activate()             │ deactivate()
               │ [on_activate()]        │ [on_deactivate()]
               ↓                        │
        ┌─────────────┐                │
        │   Active    │────────────────┘
        └──────┬──────┘
               │ cleanup() [on_cleanup()]
               ↓
        ┌─────────────┐
        │ Unconfigured│
        └──────┬──────┘
               │ shutdown() [on_shutdown()]
               ↓
        ┌─────────────┐
        │  Finalized  │
        └─────────────┘

  Error transitions from any state → ErrorProcessing → Unconfigured
```

**Primary States:**

| State | ID | Description | Publishers Active? | Timers Active? |
|-------|----|-----------|--------------------|----------------|
| **Unconfigured** | 1 | Initial state, not configured | ❌ No | ❌ No |
| **Inactive** | 2 | Configured but not running | ❌ No | ❌ No |
| **Active** | 3 | Fully operational | ✅ Yes | ✅ Yes |
| **Finalized** | 4 | Shutdown, terminal state | ❌ No | ❌ No |

**Transition States (Intermediate):**

| State | From → To | Callback |
|-------|-----------|----------|
| **Configuring** | Unconfigured → Inactive | `on_configure()` |
| **CleaningUp** | Inactive → Unconfigured | `on_cleanup()` |
| **Activating** | Inactive → Active | `on_activate()` |
| **Deactivating** | Active → Inactive | `on_deactivate()` |
| **ShuttingDown** | Any → Finalized | `on_shutdown()` |
| **ErrorProcessing** | Any → Unconfigured | `on_error()` |

---

### 3. Lifecycle Transitions & Callbacks

**Transition Flow:**

```
Unconfigured
    │
    │ configure()
    │   └─ Calls: on_configure()
    │      - Load parameters
    │      - Validate configuration
    │      - Allocate resources (don't start yet!)
    │      - Return SUCCESS or FAILURE
    ↓
Inactive
    │
    │ activate()
    │   └─ Calls: on_activate()
    │      - Start publishers/subscribers
    │      - Start timers
    │      - Begin processing
    │      - Return SUCCESS or FAILURE
    ↓
Active  ← Node is now fully operational
    │
    │ deactivate()
    │   └─ Calls: on_deactivate()
    │      - Stop timers
    │      - Stop publishing (keep connections)
    │      - Pause processing
    │      - Return SUCCESS or FAILURE
    ↓
Inactive  ← Node configured but paused
    │
    │ cleanup()
    │   └─ Calls: on_cleanup()
    │      - Release resources
    │      - Clear configuration
    │      - Return to unconfigured state
    ↓
Unconfigured
```

**Key Principle:**
- **Configure**: Set up but don't start
- **Activate**: Start execution
- **Deactivate**: Pause (can reactivate without reconfiguring)
- **Cleanup**: Tear down configuration

---

### 4. Callback Return Values

Each lifecycle callback returns `CallbackReturn`:

```cpp
enum class CallbackReturn : uint8_t {
    SUCCESS = 0,  // Transition successful
    FAILURE = 1,  // Transition failed
    ERROR = 2     // Unrecoverable error
};
```

**Return Value Effects:**

| Return | Effect | Next State |
|--------|--------|------------|
| **SUCCESS** | Transition completes | Target state (Inactive/Active/etc.) |
| **FAILURE** | Transition aborted | Remains in current state |
| **ERROR** | Unrecoverable error | ErrorProcessing → Unconfigured |

**Example:**
```cpp
CallbackReturn on_configure(const rclcpp_lifecycle::State &) override {
    try {
        // Load parameter
        max_speed_ = get_parameter("max_speed").as_double();

        if (max_speed_ <= 0) {
            RCLCPP_ERROR(get_logger(), "Invalid max_speed");
            return CallbackReturn::FAILURE;  // Stay in Unconfigured
        }

        return CallbackReturn::SUCCESS;  // → Inactive
    } catch (std::exception &e) {
        RCLCPP_ERROR(get_logger(), "Fatal error: %s", e.what());
        return CallbackReturn::ERROR;  // → ErrorProcessing
    }
}
```

---

### 5. Lifecycle Publishers & Subscribers

**Lifecycle Publishers:**

Regular publishers publish immediately:
```cpp
// Regular node
auto pub = create_publisher<String>("topic", 10);
pub->publish(msg);  // Publishes immediately
```

Lifecycle publishers only publish when **Active**:
```cpp
// Lifecycle node
lifecycle_pub_ = create_publisher<String>("topic", 10);

// In Inactive state:
lifecycle_pub_->publish(msg);  // ❌ Does NOT publish!

// In Active state:
lifecycle_pub_->publish(msg);  // ✅ Publishes normally
```

**Why?**
Prevents publishing before node is ready.

**Subscribers:**

Subscribers can be:
1. **Regular subscriptions**: Always receive (common for input data)
2. **Lifecycle-aware**: Only process in Active state (manual check)

```cpp
void on_activate(const rclcpp_lifecycle::State &) override {
    is_active_ = true;
    return CallbackReturn::SUCCESS;
}

void on_deactivate(const rclcpp_lifecycle::State &) override {
    is_active_ = false;
    return CallbackReturn::SUCCESS;
}

void callback(const String::SharedPtr msg) {
    if (!is_active_) {
        return;  // Ignore messages when not active
    }
    // Process message
}
```

---

### 6. Lifecycle Timers

Timers follow same pattern - only fire when Active.

**Example:**
```cpp
class LifecycleTimerNode : public LifecycleNode {
    rclcpp::TimerBase::SharedPtr timer_;

    CallbackReturn on_configure(const State &) override {
        // Create timer (doesn't start yet)
        timer_ = create_wall_timer(
            std::chrono::seconds(1),
            std::bind(&LifecycleTimerNode::timer_callback, this)
        );
        timer_->cancel();  // Keep canceled until activated
        return CallbackReturn::SUCCESS;
    }

    CallbackReturn on_activate(const State &) override {
        timer_->reset();  // Start timer
        return CallbackReturn::SUCCESS;
    }

    CallbackReturn on_deactivate(const State &) override {
        timer_->cancel();  // Stop timer
        return CallbackReturn::SUCCESS;
    }

    void timer_callback() {
        // Only called when Active
    }
};
```

---

### 7. Lifecycle Manager

**Problem:**
Managing multiple lifecycle nodes manually is tedious:
```bash
ros2 lifecycle set /node1 configure
ros2 lifecycle set /node1 activate
ros2 lifecycle set /node2 configure
ros2 lifecycle set /node2 activate
# ... repeat for 10+ nodes
```

**Solution: Lifecycle Manager**

Nav2's `lifecycle_manager` node orchestrates multiple lifecycle nodes.

**Features:**
- **Batch transitions**: Configure/activate all nodes together
- **Dependency ordering**: Configure A before B
- **Automatic recovery**: Restart failed nodes
- **Bond connections**: Detect node crashes

**Configuration Example:**

```yaml
# lifecycle_manager.yaml
lifecycle_manager:
  ros__parameters:
    node_names:
      - map_server
      - amcl
      - controller_server
      - planner_server
      - behavior_server
      - bt_navigator

    autostart: true  # Auto-configure and activate on launch
    bond_timeout: 4.0  # Timeout for node heartbeat (seconds)
```

**Launch File:**
```python
lifecycle_manager = Node(
    package='nav2_lifecycle_manager',
    executable='lifecycle_manager',
    name='lifecycle_manager',
    output='screen',
    parameters=[{'node_names': ['node1', 'node2', 'node3']},
                {'autostart': True}]
)
```

**Lifecycle Manager Services:**

```bash
# Configure and activate all nodes
ros2 service call /lifecycle_manager/manage_nodes \
    nav2_msgs/srv/ManageLifecycleNodes \
    "{command: 1}"  # 1 = STARTUP

# Pause all nodes
ros2 service call /lifecycle_manager/manage_nodes \
    nav2_msgs/srv/ManageLifecycleNodes \
    "{command: 2}"  # 2 = PAUSE

# Shutdown all nodes
ros2 service call /lifecycle_manager/manage_nodes \
    nav2_msgs/srv/ManageLifecycleNodes \
    "{command: 3}"  # 3 = SHUTDOWN
```

---

### 8. When to Use Lifecycle Nodes

**Use Lifecycle Nodes When:**

✅ **Controlled startup required**
- Multi-node system with dependencies
- Hardware initialization order matters
- Need to validate config before starting

✅ **Runtime state changes**
- Enable/disable functionality without restart
- Pause processing, reconfigure, resume
- Example: Disable navigation while robot charging

✅ **Error recovery**
- Recover from failures without killing process
- Reconfigure after parameter change
- Example: Camera disconnected → deactivate → reconnect → activate

✅ **Production systems**
- Deterministic behavior required
- Graceful shutdown needed
- System monitoring and health checks

**Don't Use Lifecycle Nodes When:**

❌ **Simple, stateless nodes**
- Single-purpose utilities
- No initialization order requirements
- Example: Static TF broadcaster

❌ **Performance-critical paths**
- Extra overhead from state management
- Usually negligible, but worth considering

❌ **Rapid prototyping**
- Added complexity during development
- Use regular nodes, migrate to lifecycle later

---

### 9. Lifecycle vs Regular Nodes

| Aspect | Regular Node | Lifecycle Node |
|--------|--------------|----------------|
| **Base Class** | `rclcpp::Node` | `rclcpp_lifecycle::LifecycleNode` |
| **Startup** | Immediate | Two-phase (configure → activate) |
| **Publishers** | Always active | Active only when node Active |
| **State Control** | None | Full state machine |
| **Shutdown** | Destroy immediately | Graceful deactivate → cleanup |
| **Error Recovery** | Restart process | Transition to error state |
| **Complexity** | Simple | More complex (state management) |
| **Use Case** | Simple utilities | Production systems |

---

### 10. Bond Mechanism

**Problem:**
Lifecycle manager doesn't know if managed nodes crash.

**Solution: Bond**

Bond creates heartbeat connection between lifecycle manager and managed nodes.

**How it Works:**
```
Lifecycle Manager                  Managed Node
        │                                │
        │ ─── Bond Create ──────────────→│
        │                                │
        │ ←── Heartbeat (1 Hz) ─────────│
        │                                │
        │ ←── Heartbeat (1 Hz) ─────────│
        │                                │
        │  (Node crashes)                ✗
        │
        │  (No heartbeat for 4s)
        │
        └─→ Detect failure!
            Trigger recovery
```

**Configuration:**
```yaml
lifecycle_manager:
  ros__parameters:
    bond_timeout: 4.0  # Declare node dead after 4s without heartbeat
```

**In Code:**
```cpp
// Lifecycle node automatically creates bond when managed
// No explicit code needed!
```

---

## EDGE_CASES

### Edge Case 1: Transition Callback Takes Too Long

**Scenario:**
`on_configure()` loads large map file (5GB), takes 30 seconds. During this time, lifecycle manager times out.

**Code:**
```cpp
CallbackReturn on_configure(const State &) override {
    RCLCPP_INFO(get_logger(), "Loading map...");

    // Load 5GB map - takes 30 seconds
    map_ = loadHugeMap("/path/to/5GB_map.pgm");

    // Lifecycle manager already timed out!
    return CallbackReturn::SUCCESS;
}
```

**Why:**
Default service call timeout is 10 seconds. Long-running callbacks exceed timeout.

**Solution 1 - Increase Service Timeout:**

```python
# In lifecycle manager launch
lifecycle_manager = Node(
    package='nav2_lifecycle_manager',
    executable='lifecycle_manager',
    parameters=[{
        'node_names': ['map_server'],
        'autostart': True,
        'bond_timeout': 4.0,
        'attempt_respawn_reconnection': True,
        'connection_timeout': 60.0,  # Increase timeout to 60s
        'initial_call_timeout': 60.0
    }]
)
```

**Solution 2 - Async Loading:**

```cpp
CallbackReturn on_configure(const State &) override {
    RCLCPP_INFO(get_logger(), "Starting async map load...");

    // Start loading in background thread
    map_load_future_ = std::async(std::launch::async, [this]() {
        return loadHugeMap("/path/to/map.pgm");
    });

    // Return immediately
    return CallbackReturn::SUCCESS;
}

CallbackReturn on_activate(const State &) override {
    // Wait for map to finish loading
    if (map_load_future_.wait_for(std::chrono::seconds(0))
        != std::future_status::ready) {
        RCLCPP_ERROR(get_logger(), "Map not loaded yet!");
        return CallbackReturn::FAILURE;
    }

    map_ = map_load_future_.get();
    return CallbackReturn::SUCCESS;
}
```

**Interview Insight:**
Long-running configuration should use async loading or increased timeouts. Split heavy work between `on_configure()` (start loading) and `on_activate()` (verify ready).

---

### Edge Case 2: Node Crashes During Active State

**Scenario:**
Lifecycle node crashes (segfault, exception). Lifecycle manager detects via bond timeout. How to recover?

**Situation:**
```
t=0s:  Node active, bond alive
t=5s:  Node crashes (segfault)
t=9s:  Lifecycle manager detects bond broken (timeout=4s)
       What happens next?
```

**Why:**
Bond only detects crash, doesn't auto-restart by default.

**Solution 1 - Enable Respawn:**

```yaml
lifecycle_manager:
  ros__parameters:
    node_names: ['camera_node']
    autostart: true
    bond_timeout: 4.0
    attempt_respawn_reconnection: true  # Try to reconnect to crashed node
```

**But this only works if node is restarted externally!**

**Solution 2 - Use Launch File Respawn:**

```python
from launch import LaunchDescription
from launch_ros.actions import LifecycleNode
from launch.actions import RegisterEventHandler
from launch.event_handlers import OnProcessExit

def generate_launch_description():
    camera_node = LifecycleNode(
        package='my_camera',
        executable='camera_node',
        name='camera',
        namespace='',
        output='screen',
        respawn=True,  # Auto-restart on crash
        respawn_delay=2.0  # Wait 2s before restart
    )

    return LaunchDescription([camera_node])
```

**Solution 3 - External Watchdog:**

```python
# Custom watchdog node
class LifecycleWatchdog(Node):
    def __init__(self):
        super().__init__('watchdog')

        self.timer = self.create_timer(5.0, self.check_nodes)
        self.cli_get_state = self.create_client(
            GetState, '/camera/get_state')

    def check_nodes(self):
        # Check if node is alive
        req = GetState.Request()
        future = self.cli_get_state.call_async(req)

        rclpy.spin_until_future_complete(self, future, timeout_sec=1.0)

        if future.result() is None:
            self.get_logger().error('Node crashed! Restarting...')
            # Trigger restart via launch API or systemd
```

**Interview Insight:**
Lifecycle manager detects crashes via bond but doesn't restart nodes. Use launch file `respawn=True`, external process manager (systemd), or custom watchdog.

---

### Edge Case 3: Transition Fails Midway

**Scenario:**
`on_configure()` partially succeeds (loaded params, allocated some resources), then returns FAILURE. Resources leaked?

**Code:**
```cpp
CallbackReturn on_configure(const State &) override {
    // Allocate resource 1
    camera_ = std::make_shared<Camera>();
    camera_->open();  // ✅ Success

    // Allocate resource 2
    publisher_ = create_lifecycle_publisher<Image>("image", 10);  // ✅ Success

    // Validate config
    int fps = get_parameter("fps").as_int();
    if (fps > 60) {
        RCLCPP_ERROR(get_logger(), "FPS too high!");
        // ❌ Returning FAILURE - but camera_ still open! Leak!
        return CallbackReturn::FAILURE;
    }

    return CallbackReturn::SUCCESS;
}
```

**Why:**
Failed transition doesn't automatically clean up partial allocations.

**Solution 1 - Manual Cleanup on Failure:**

```cpp
CallbackReturn on_configure(const State &) override {
    try {
        camera_ = std::make_shared<Camera>();
        camera_->open();

        publisher_ = create_lifecycle_publisher<Image>("image", 10);

        int fps = get_parameter("fps").as_int();
        if (fps > 60) {
            // Clean up before returning failure
            camera_->close();
            camera_.reset();
            publisher_.reset();

            RCLCPP_ERROR(get_logger(), "FPS too high!");
            return CallbackReturn::FAILURE;
        }

        return CallbackReturn::SUCCESS;

    } catch (std::exception &e) {
        // Clean up on exception
        if (camera_) camera_->close();
        camera_.reset();
        publisher_.reset();

        RCLCPP_ERROR(get_logger(), "Config failed: %s", e.what());
        return CallbackReturn::ERROR;
    }
}
```

**Solution 2 - RAII Pattern:**

```cpp
class CameraWrapper {
    std::shared_ptr<Camera> cam_;
public:
    CameraWrapper() {
        cam_ = std::make_shared<Camera>();
        cam_->open();
    }

    ~CameraWrapper() {
        if (cam_) cam_->close();  // Auto-cleanup
    }

    Camera* get() { return cam_.get(); }
};

// In lifecycle node:
std::unique_ptr<CameraWrapper> camera_;

CallbackReturn on_configure(const State &) override {
    camera_ = std::make_unique<CameraWrapper>();  // Opens camera

    // If we return FAILURE, destructor auto-closes camera
    if (some_condition) {
        return CallbackReturn::FAILURE;  // ✅ Camera auto-closed
    }

    return CallbackReturn::SUCCESS;
}
```

**Interview Insight:**
Failed transitions don't auto-cleanup. Use RAII pattern (smart pointers, destructors) or explicit cleanup before returning FAILURE.

---

### Edge Case 4: Simultaneous State Requests

**Scenario:**
Two clients try to transition node simultaneously:
- Client A: `configure()`
- Client B: `activate()`

Race condition?

**Timeline:**
```
t=0:   State = Unconfigured
t=1:   Client A calls configure() → Transition to Configuring
t=2:   Client B calls activate() (while still Configuring)
       What happens?
```

**Why:**
Lifecycle state machine is **non-reentrant** - can't transition while already transitioning.

**Solution (Built-in):**

ROS2 lifecycle automatically rejects concurrent transitions:

```cpp
// Client B's activate() call
auto result = activate_client.call(request);

if (result->success == false) {
    // "Transition rejected: node not in Inactive state"
    // OR "Transition in progress"
}
```

**Proper Client Implementation:**

```cpp
// Always check current state before transitioning
auto get_state_client = node->create_client<GetState>("/node/get_state");
auto get_state_req = std::make_shared<GetState::Request>();
auto state_result = get_state_client->call(get_state_req);

if (state_result->current_state.id == State::PRIMARY_STATE_UNCONFIGURED) {
    // Safe to configure
    configure_client->call(configure_req);
} else {
    RCLCPP_WARN(node->get_logger(),
        "Node not in Unconfigured state, can't configure");
}
```

**Interview Insight:**
Lifecycle state machine serializes transitions automatically. Concurrent requests are rejected. Always check current state before requesting transition.

---

## CODE_EXAMPLES

### Example 1: Basic Lifecycle Node (C++)

**File: `lifecycle_camera_node.cpp`**

```cpp
#include "rclcpp/rclcpp.hpp"
#include "rclcpp_lifecycle/lifecycle_node.hpp"
#include "sensor_msgs/msg/image.hpp"
#include "std_srvs/srv/trigger.hpp"

using LifecycleCallbackReturn =
    rclcpp_lifecycle::node_interfaces::LifecycleNodeInterface::CallbackReturn;

class LifecycleCameraNode : public rclcpp_lifecycle::LifecycleNode
{
public:
    LifecycleCameraNode(const rclcpp::NodeOptions & options)
        : LifecycleNode("camera_node", options)
    {
        RCLCPP_INFO(get_logger(), "LifecycleCameraNode created (Unconfigured)");
    }

    // CONFIGURE: Load config, allocate resources (don't start yet)
    LifecycleCallbackReturn on_configure(const rclcpp_lifecycle::State &) override
    {
        RCLCPP_INFO(get_logger(), "Configuring...");

        // Declare and get parameters
        declare_parameter("fps", 30);
        declare_parameter("resolution", "1920x1080");

        fps_ = get_parameter("fps").as_int();
        resolution_ = get_parameter("resolution").as_string();

        // Validate
        if (fps_ <= 0 || fps_ > 60) {
            RCLCPP_ERROR(get_logger(), "Invalid FPS: %d", fps_);
            return LifecycleCallbackReturn::FAILURE;
        }

        // Create lifecycle publisher (won't publish until Active)
        image_pub_ = create_publisher<sensor_msgs::msg::Image>("image", 10);

        // Create timer (start in on_activate)
        timer_ = create_wall_timer(
            std::chrono::milliseconds(1000 / fps_),
            std::bind(&LifecycleCameraNode::timer_callback, this)
        );
        timer_->cancel();  // Don't start yet

        RCLCPP_INFO(get_logger(),
            "Configured: fps=%d, resolution=%s", fps_, resolution_.c_str());

        return LifecycleCallbackReturn::SUCCESS;
    }

    // CLEANUP: Reverse of configure
    LifecycleCallbackReturn on_cleanup(const rclcpp_lifecycle::State &) override
    {
        RCLCPP_INFO(get_logger(), "Cleaning up...");

        // Release resources
        timer_.reset();
        image_pub_.reset();

        return LifecycleCallbackReturn::SUCCESS;
    }

    // ACTIVATE: Start execution
    LifecycleCallbackReturn on_activate(const rclcpp_lifecycle::State &) override
    {
        RCLCPP_INFO(get_logger(), "Activating...");

        // Activate publisher (now can publish)
        image_pub_->on_activate();

        // Start timer
        timer_->reset();

        RCLCPP_INFO(get_logger(), "Camera streaming started");

        return LifecycleCallbackReturn::SUCCESS;
    }

    // DEACTIVATE: Pause execution
    LifecycleCallbackReturn on_deactivate(const rclcpp_lifecycle::State &) override
    {
        RCLCPP_INFO(get_logger(), "Deactivating...");

        // Stop timer
        timer_->cancel();

        // Deactivate publisher (stop publishing)
        image_pub_->on_deactivate();

        RCLCPP_INFO(get_logger(), "Camera streaming paused");

        return LifecycleCallbackReturn::SUCCESS;
    }

    // SHUTDOWN: Final cleanup
    LifecycleCallbackReturn on_shutdown(const rclcpp_lifecycle::State &) override
    {
        RCLCPP_INFO(get_logger(), "Shutting down...");

        // Release all resources
        timer_.reset();
        image_pub_.reset();

        return LifecycleCallbackReturn::SUCCESS;
    }

    // ERROR: Handle errors
    LifecycleCallbackReturn on_error(const rclcpp_lifecycle::State &) override
    {
        RCLCPP_ERROR(get_logger(), "Error occurred! Cleaning up...");

        // Emergency cleanup
        if (timer_) timer_->cancel();

        return LifecycleCallbackReturn::SUCCESS;
    }

private:
    void timer_callback()
    {
        // Only called when Active
        auto msg = sensor_msgs::msg::Image();
        msg.header.stamp = now();
        msg.header.frame_id = "camera_frame";

        // Capture image (mock)
        msg.width = 1920;
        msg.height = 1080;

        image_pub_->publish(msg);

        RCLCPP_DEBUG(get_logger(), "Published frame");
    }

    // Configuration
    int fps_;
    std::string resolution_;

    // ROS interfaces
    rclcpp_lifecycle::LifecyclePublisher<sensor_msgs::msg::Image>::SharedPtr image_pub_;
    rclcpp::TimerBase::SharedPtr timer_;
};

int main(int argc, char ** argv)
{
    rclcpp::init(argc, argv);

    auto node = std::make_shared<LifecycleCameraNode>(rclcpp::NodeOptions());

    rclcpp::spin(node->get_node_base_interface());

    rclcpp::shutdown();
    return 0;
}
```

**Compile (CMakeLists.txt):**
```cmake
find_package(rclcpp REQUIRED)
find_package(rclcpp_lifecycle REQUIRED)
find_package(sensor_msgs REQUIRED)

add_executable(lifecycle_camera_node src/lifecycle_camera_node.cpp)
ament_target_dependencies(lifecycle_camera_node
  rclcpp
  rclcpp_lifecycle
  sensor_msgs
)
```

---

### Example 2: Lifecycle Node in Python

**File: `lifecycle_sensor_node.py`**

```python
#!/usr/bin/env python3
import rclpy
from rclpy.lifecycle import Node as LifecycleNode
from rclpy.lifecycle import State, TransitionCallbackReturn
from sensor_msgs.msg import Temperature
import random

class LifecycleSensorNode(LifecycleNode):
    def __init__(self):
        super().__init__('sensor_node')
        self.get_logger().info('LifecycleSensorNode created (Unconfigured)')

    def on_configure(self, state: State) -> TransitionCallbackReturn:
        self.get_logger().info('Configuring...')

        # Declare parameters
        self.declare_parameter('publish_rate', 10.0)
        self.declare_parameter('sensor_name', 'temp_sensor_1')

        self.publish_rate = self.get_parameter('publish_rate').value
        self.sensor_name = self.get_parameter('sensor_name').value

        # Validate
        if self.publish_rate <= 0:
            self.get_logger().error('Invalid publish rate')
            return TransitionCallbackReturn.FAILURE

        # Create lifecycle publisher
        self.temp_pub = self.create_lifecycle_publisher(
            Temperature, 'temperature', 10)

        # Create timer (don't start yet)
        timer_period = 1.0 / self.publish_rate
        self.timer = self.create_timer(timer_period, self.timer_callback)
        self.timer.cancel()  # Stop until activated

        self.get_logger().info(
            f'Configured: rate={self.publish_rate} Hz, name={self.sensor_name}')

        return TransitionCallbackReturn.SUCCESS

    def on_cleanup(self, state: State) -> TransitionCallbackReturn:
        self.get_logger().info('Cleaning up...')

        self.destroy_timer(self.timer)
        self.destroy_publisher(self.temp_pub)

        return TransitionCallbackReturn.SUCCESS

    def on_activate(self, state: State) -> TransitionCallbackReturn:
        self.get_logger().info('Activating...')

        # Activate publisher
        self.temp_pub.on_activate(state)

        # Start timer
        self.timer.reset()

        self.get_logger().info('Sensor publishing started')

        return TransitionCallbackReturn.SUCCESS

    def on_deactivate(self, state: State) -> TransitionCallbackReturn:
        self.get_logger().info('Deactivating...')

        # Stop timer
        self.timer.cancel()

        # Deactivate publisher
        self.temp_pub.on_deactivate(state)

        self.get_logger().info('Sensor publishing paused')

        return TransitionCallbackReturn.SUCCESS

    def on_shutdown(self, state: State) -> TransitionCallbackReturn:
        self.get_logger().info('Shutting down...')

        self.destroy_timer(self.timer)
        self.destroy_publisher(self.temp_pub)

        return TransitionCallbackReturn.SUCCESS

    def on_error(self, state: State) -> TransitionCallbackReturn:
        self.get_logger().error('Error state! Cleaning up...')
        return TransitionCallbackReturn.SUCCESS

    def timer_callback(self):
        # Only called when Active
        msg = Temperature()
        msg.header.stamp = self.get_clock().now().to_msg()
        msg.header.frame_id = self.sensor_name

        # Mock temperature reading
        msg.temperature = 20.0 + random.uniform(-5, 5)
        msg.variance = 0.1

        self.temp_pub.publish(msg)
        self.get_logger().debug(f'Published temp: {msg.temperature:.2f}°C')

def main(args=None):
    rclpy.init(args=args)

    node = LifecycleSensorNode()

    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass

    node.destroy_node()
    rclpy.shutdown()

if __name__ == '__main__':
    main()
```

---

### Example 3: Lifecycle Client (Transition Controller)

**File: `lifecycle_client.cpp`**

```cpp
#include "rclcpp/rclcpp.hpp"
#include "lifecycle_msgs/msg/state.hpp"
#include "lifecycle_msgs/msg/transition.hpp"
#include "lifecycle_msgs/srv/change_state.hpp"
#include "lifecycle_msgs/srv/get_state.hpp"

using ChangeState = lifecycle_msgs::srv::ChangeState;
using GetState = lifecycle_msgs::srv::GetState;
using Transition = lifecycle_msgs::msg::Transition;
using State = lifecycle_msgs::msg::State;

class LifecycleClient : public rclcpp::Node
{
public:
    LifecycleClient(const std::string & node_name, const std::string & lifecycle_node_name)
        : Node(node_name), lifecycle_node_name_(lifecycle_node_name)
    {
        // Create service clients
        std::string change_state_service =
            lifecycle_node_name_ + "/change_state";
        std::string get_state_service =
            lifecycle_node_name_ + "/get_state";

        change_state_client_ = create_client<ChangeState>(change_state_service);
        get_state_client_ = create_client<GetState>(get_state_service);

        // Wait for services
        while (!change_state_client_->wait_for_service(std::chrono::seconds(1))) {
            RCLCPP_INFO(get_logger(), "Waiting for %s...", change_state_service.c_str());
        }
    }

    unsigned int get_state()
    {
        auto request = std::make_shared<GetState::Request>();

        auto future = get_state_client_->async_send_request(request);

        if (rclcpp::spin_until_future_complete(shared_from_this(), future) ==
            rclcpp::FutureReturnCode::SUCCESS)
        {
            return future.get()->current_state.id;
        }

        return State::PRIMARY_STATE_UNKNOWN;
    }

    bool change_state(uint8_t transition_id)
    {
        auto request = std::make_shared<ChangeState::Request>();
        request->transition.id = transition_id;

        auto future = change_state_client_->async_send_request(request);

        if (rclcpp::spin_until_future_complete(shared_from_this(), future) ==
            rclcpp::FutureReturnCode::SUCCESS)
        {
            return future.get()->success;
        }

        return false;
    }

    bool configure()
    {
        RCLCPP_INFO(get_logger(), "Transitioning to configured...");
        return change_state(Transition::TRANSITION_CONFIGURE);
    }

    bool activate()
    {
        RCLCPP_INFO(get_logger(), "Transitioning to active...");
        return change_state(Transition::TRANSITION_ACTIVATE);
    }

    bool deactivate()
    {
        RCLCPP_INFO(get_logger(), "Transitioning to inactive...");
        return change_state(Transition::TRANSITION_DEACTIVATE);
    }

    bool cleanup()
    {
        RCLCPP_INFO(get_logger(), "Transitioning to unconfigured...");
        return change_state(Transition::TRANSITION_CLEANUP);
    }

    bool shutdown()
    {
        RCLCPP_INFO(get_logger(), "Shutting down...");
        return change_state(Transition::TRANSITION_UNCONFIGURED_SHUTDOWN);
    }

private:
    std::string lifecycle_node_name_;
    rclcpp::Client<ChangeState>::SharedPtr change_state_client_;
    rclcpp::Client<GetState>::SharedPtr get_state_client_;
};

int main(int argc, char ** argv)
{
    rclcpp::init(argc, argv);

    auto client = std::make_shared<LifecycleClient>("lifecycle_client", "camera_node");

    // Get current state
    auto state = client->get_state();
    RCLCPP_INFO(client->get_logger(), "Current state: %d", state);

    // Configure
    if (client->configure()) {
        RCLCPP_INFO(client->get_logger(), "Configure successful!");
    }

    // Activate
    if (client->activate()) {
        RCLCPP_INFO(client->get_logger(), "Activate successful!");
    }

    // Run for 10 seconds
    RCLCPP_INFO(client->get_logger(), "Running for 10s...");
    rclcpp::sleep_for(std::chrono::seconds(10));

    // Deactivate
    if (client->deactivate()) {
        RCLCPP_INFO(client->get_logger(), "Deactivate successful!");
    }

    // Cleanup
    if (client->cleanup()) {
        RCLCPP_INFO(client->get_logger(), "Cleanup successful!");
    }

    rclcpp::shutdown();
    return 0;
}
```

---

## INTERVIEW_QA

### Q1: What is the purpose of lifecycle nodes in ROS2?

**Difficulty:** ⭐⭐ (Easy)

**Answer:**

Lifecycle nodes provide **deterministic state management** for ROS2 nodes through a well-defined state machine.

**Key Purposes:**

**1. Controlled Initialization:**
- Regular nodes start immediately when launched
- Lifecycle nodes have two-phase init: configure → activate
- Allows loading config and validating before starting execution

**2. Runtime State Changes:**
- Can pause (deactivate) and resume (activate) without restart
- Useful for enable/disable functionality dynamically
- Example: Disable camera when robot is idle, reactivate on demand

**3. Error Recovery:**
- Can transition to error state and recover
- No need to kill and restart entire process
- Cleaner recovery: deactivate → fix issue → reactivate

**4. Deterministic Shutdown:**
- Graceful deactivation before destroying resources
- Prevents publishing mid-shutdown
- Clean resource cleanup (files, hardware, memory)

**5. Multi-Node Orchestration:**
- Lifecycle manager can coordinate startup of many nodes
- Ensures correct initialization order
- Example: Nav2 starts map_server before planner_server

**Primary State Machine:**
```
Unconfigured → (configure) → Inactive → (activate) → Active
     ↑                           ↑            ↓
     └────── (cleanup) ──────────┘            │
                                              │
                                      (deactivate)
```

**Interview Insight:**
Lifecycle nodes solve startup ordering, runtime state control, and graceful shutdown problems. Essential for production systems and multi-node coordination (like Nav2, ros2_control).

---

### Q2: Explain the difference between on_configure() and on_activate() callbacks.

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

**on_configure()** and **on_activate()** represent **two-phase initialization**:

**on_configure() - "Set up but don't start"**

**Purpose:**
- Load configuration (parameters)
- Validate configuration
- Allocate resources
- Create publishers/subscribers/timers
- **Do NOT start execution**

**Example:**
```cpp
CallbackReturn on_configure(const State &) override {
    // 1. Load parameters
    max_speed_ = get_parameter("max_speed").as_double();

    // 2. Validate
    if (max_speed_ <= 0) {
        return CallbackReturn::FAILURE;  // Stay unconfigured
    }

    // 3. Create interfaces (but don't start)
    pub_ = create_lifecycle_publisher<>("topic", 10);
    timer_ = create_timer(100ms, callback);
    timer_->cancel();  // Don't fire yet!

    // 4. Allocate resources
    buffer_ = std::make_shared<Buffer>(1000);

    return CallbackReturn::SUCCESS;  // → Inactive state
}
```

**Result:** Node is ready to run, but **not running yet**.

---

**on_activate() - "Start execution"**

**Purpose:**
- Activate publishers (enable publishing)
- Start timers
- Begin processing data
- Start threads/background tasks
- **Begin actual work**

**Example:**
```cpp
CallbackReturn on_activate(const State &) override {
    // 1. Activate publishers
    pub_->on_activate();  // Now can publish

    // 2. Start timers
    timer_->reset();  // Start firing

    // 3. Start background tasks
    processing_thread_ = std::thread(&Node::process_loop, this);

    return CallbackReturn::SUCCESS;  // → Active state
}
```

**Result:** Node is now **fully operational**.

---

**Why Two Phases?**

**Problem without two-phase init:**
```cpp
// Single-phase initialization
Constructor() {
    // Load config AND start immediately
    // No chance to validate or reconfigure before starting!
}
```

**Benefit of two-phase:**
```
1. Configure → Validate config → If invalid, fix and reconfigure
2. Activate → Start execution only after validation passes
3. Can reconfigure without restart: Deactivate → Cleanup → Configure → Activate
```

**Comparison Table:**

| Aspect | on_configure() | on_activate() |
|--------|----------------|---------------|
| **When** | Unconfigured → Inactive | Inactive → Active |
| **Purpose** | Set up resources | Start execution |
| **Publishers** | Create (don't publish) | Enable publishing |
| **Timers** | Create (keep canceled) | Start firing |
| **Threads** | Allocate (don't start) | Start running |
| **Result State** | Inactive (ready but paused) | Active (fully running) |
| **Can Retry** | Yes (cleanup → configure) | Yes (deactivate → activate) |

**Practical Example - Camera Node:**

```cpp
on_configure():
    - Load camera parameters (resolution, FPS)
    - Validate parameters
    - Create image publisher
    - Allocate image buffer
    → Camera configured but NOT capturing

on_activate():
    - Open camera device
    - Start capture thread
    - Enable image publisher
    → Camera now streaming
```

**Interview Insight:**
on_configure() = "prepare to run" (load config, allocate resources, validate).
on_activate() = "start running" (begin timers, enable publishers, start work).
Two-phase allows validation and reconfiguration without restart.

---

### Q3: How does a lifecycle manager coordinate multiple lifecycle nodes?

**Difficulty:** ⭐⭐⭐⭐ (Hard)

**Answer:**

Lifecycle manager orchestrates **batch state transitions** and **health monitoring** for multiple lifecycle nodes.

**Architecture:**

```
Lifecycle Manager
    │
    ├─── Manages: [node1, node2, node3, ...]
    │
    ├─── Services:
    │    ├─ /manager/manage_nodes (startup/pause/shutdown all)
    │    └─ /manager/is_active (health check)
    │
    └─── For each managed node:
         ├─ Service Clients: /node1/change_state, /node1/get_state
         └─ Bond: Heartbeat connection for crash detection
```

**1. Configuration:**

```yaml
lifecycle_manager:
  ros__parameters:
    node_names: ['map_server', 'amcl', 'planner_server']
    autostart: true        # Auto-configure and activate on launch
    bond_timeout: 4.0      # Declare node dead after 4s no heartbeat
    attempt_respawn_reconnection: true
```

**2. Startup Sequence:**

When lifecycle manager starts with `autostart: true`:

```
Step 1: Configure all nodes (in order)
    - Call /map_server/change_state (configure)
    - Wait for success
    - Call /amcl/change_state (configure)
    - Wait for success
    - Call /planner_server/change_state (configure)
    - Wait for success

Step 2: Activate all nodes (in order)
    - Call /map_server/change_state (activate)
    - Call /amcl/change_state (activate)
    - Call /planner_server/change_state (activate)

Step 3: Create bond connections
    - Start heartbeat monitoring for each node
```

**3. Bond Mechanism (Health Monitoring):**

Lifecycle manager uses **bond** library for crash detection:

```
Lifecycle Manager          Managed Node
       │                         │
       │ ─── CreateBond ────────→│
       │                         │
       │ ←── Heartbeat ──────────│ (every 1s)
       │                         │
       │ ←── Heartbeat ──────────│
       │                         │
       │   (Node crashes)        ✗
       │
       │  No heartbeat for 4s
       └─→ Bond broken!
           Trigger respawn or report failure
```

**4. Service API:**

```bash
# Startup all nodes (configure + activate)
ros2 service call /lifecycle_manager/manage_nodes \
    nav2_msgs/srv/ManageLifecycleNodes \
    "{command: 1}"

# Pause all nodes (deactivate)
ros2 service call /lifecycle_manager/manage_nodes \
    nav2_msgs/srv/ManageLifecycleNodes \
    "{command: 2}"

# Resume all nodes (activate)
ros2 service call /lifecycle_manager/manage_nodes \
    nav2_msgs/srv/ManageLifecycleNodes \
    "{command: 3}"

# Shutdown all nodes
ros2 service call /lifecycle_manager/manage_nodes \
    nav2_msgs/srv/ManageLifecycleNodes \
    "{command: 4}"
```

**5. Failure Handling:**

If a node's configure/activate fails:

```yaml
# Option 1: Retry
attempt_respawn_reconnection: true

# Option 2: Report failure and stop
attempt_respawn_reconnection: false
```

**Example failure scenario:**
```
Manager tries to configure planner_server
→ planner_server returns FAILURE (invalid param)
→ Manager aborts startup
→ Other nodes remain in Inactive state
→ Manager reports error to user
```

**6. Code Implementation (Simplified):**

```cpp
class LifecycleManager {
    std::vector<std::string> node_names_;
    std::map<std::string, ServiceClient> change_state_clients_;
    std::map<std::string, Bond> bonds_;

    bool startup() {
        // Phase 1: Configure all
        for (const auto& name : node_names_) {
            if (!transition_node(name, TRANSITION_CONFIGURE)) {
                RCLCPP_ERROR("Failed to configure %s", name.c_str());
                return false;
            }
        }

        // Phase 2: Activate all
        for (const auto& name : node_names_) {
            if (!transition_node(name, TRANSITION_ACTIVATE)) {
                RCLCPP_ERROR("Failed to activate %s", name.c_str());
                return false;
            }
        }

        // Phase 3: Create bonds
        for (const auto& name : node_names_) {
            create_bond(name);
        }

        return true;
    }

    bool transition_node(const std::string& name, uint8_t transition) {
        auto client = change_state_clients_[name];
        auto request = ChangeState::Request();
        request.transition.id = transition;

        auto result = client.call(request);
        return result->success;
    }

    void create_bond(const std::string& name) {
        bonds_[name] = Bond("/bond_" + name, name);
        bonds_[name].start();

        // Register callback for bond broken
        bonds_[name].setBrokenCallback([this, name]() {
            RCLCPP_ERROR("Bond broken with %s!", name.c_str());
            // Attempt respawn or report failure
        });
    }
};
```

**Interview Insight:**
Lifecycle manager coordinates multiple nodes by:
1. Batch transitions (configure all, then activate all)
2. Ordered startup (configure node1 → node2 → node3)
3. Bond-based health monitoring (heartbeat every 1s)
4. Failure handling (retry or abort)
5. Service API for runtime control (pause/resume system)

---

### Q4: What happens if on_configure() returns FAILURE vs ERROR?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

**CallbackReturn Types:**

```cpp
enum class CallbackReturn {
    SUCCESS = 0,  // Transition successful
    FAILURE = 1,  // Transition failed (recoverable)
    ERROR = 2     // Unrecoverable error
};
```

**Key Difference:**

| Return Value | Meaning | Next State | Can Retry? | Use Case |
|--------------|---------|------------|------------|----------|
| **FAILURE** | Transition failed but node is OK | Stays in current state | ✅ Yes | Invalid config, missing file |
| **ERROR** | Fatal error, node unstable | ErrorProcessing → Unconfigured | ⚠️ After cleanup | Segfault risk, corrupted data |

---

**Scenario 1: FAILURE (Recoverable)**

```cpp
CallbackReturn on_configure(const State &) override {
    // Try to load parameter
    declare_parameter("max_speed", 1.0);
    double max_speed = get_parameter("max_speed").as_double();

    if (max_speed <= 0 || max_speed > 10.0) {
        RCLCPP_ERROR(get_logger(),
            "Invalid max_speed: %.2f (must be 0-10)", max_speed);

        // Node is fine, just bad config
        return CallbackReturn::FAILURE;
    }

    max_speed_ = max_speed;
    return CallbackReturn::SUCCESS;
}
```

**Result:**
```
State: Unconfigured
  ↓ configure() called
  ↓ on_configure() returns FAILURE
State: Unconfigured (stays here)

User can:
- Fix parameter: ros2 param set /node max_speed 5.0
- Retry configure: ros2 lifecycle set /node configure
```

**State remains Unconfigured**, ready to retry.

---

**Scenario 2: ERROR (Unrecoverable)**

```cpp
CallbackReturn on_configure(const State &) override {
    try {
        // Critical operation
        hardware_driver_ = std::make_shared<HardwareDriver>();
        hardware_driver_->initialize();

        // Validate driver
        if (!hardware_driver_->is_valid()) {
            throw std::runtime_error("Hardware driver corrupted!");
        }

        return CallbackReturn::SUCCESS;

    } catch (std::exception& e) {
        RCLCPP_FATAL(get_logger(),
            "Fatal error in configure: %s", e.what());

        // Unrecoverable error - node may be in bad state
        return CallbackReturn::ERROR;
    }
}
```

**Result:**
```
State: Unconfigured
  ↓ configure() called
  ↓ on_configure() throws exception → returns ERROR
  ↓ Automatic transition to ErrorProcessing
  ↓ on_error() called
  ↓ Automatic cleanup
State: Unconfigured (but after error cleanup)
```

**ErrorProcessing state:**
- Triggers `on_error()` callback
- Automatically transitions to Unconfigured
- Allows emergency cleanup

**on_error() implementation:**
```cpp
CallbackReturn on_error(const State &) override {
    RCLCPP_ERROR(get_logger(), "In error state, cleaning up...");

    // Emergency cleanup
    if (hardware_driver_) {
        hardware_driver_->shutdown();
        hardware_driver_.reset();
    }

    // Release any partially-allocated resources
    timer_.reset();
    publisher_.reset();

    return CallbackReturn::SUCCESS;
}
```

---

**Decision Tree:**

```
In on_configure(), something goes wrong:
    │
    ├─ Is the error due to bad configuration/parameters?
    │  (Invalid value, missing file, etc.)
    │  → Return FAILURE
    │  → User can fix config and retry
    │
    ├─ Is the error recoverable with cleanup?
    │  (Resource allocation failed, driver init failed)
    │  → Return FAILURE
    │  → User can fix issue and retry
    │
    └─ Is the error catastrophic?
       (Exception thrown, data corruption, undefined state)
       → Return ERROR
       → Triggers on_error() cleanup
       → Node resets to safe state
```

**Best Practice:**

```cpp
CallbackReturn on_configure(const State &) override {
    try {
        // Validate parameters
        int fps = get_parameter("fps").as_int();
        if (fps <= 0) {
            // Recoverable - just bad config
            return CallbackReturn::FAILURE;
        }

        // Allocate resources
        camera_ = std::make_shared<Camera>();
        camera_->open();

        // Check if camera valid
        if (!camera_->is_open()) {
            // Recoverable - camera not connected
            camera_.reset();
            return CallbackReturn::FAILURE;
        }

        return CallbackReturn::SUCCESS;

    } catch (std::exception& e) {
        // Unrecoverable exception
        RCLCPP_FATAL(get_logger(), "Exception: %s", e.what());

        // Clean up partial allocations
        camera_.reset();

        return CallbackReturn::ERROR;
    }
}
```

**Interview Insight:**
- **FAILURE**: Recoverable issue (bad config, missing resource). Node stays in current state, user can fix and retry.
- **ERROR**: Unrecoverable issue (exception, corruption). Triggers on_error() → ErrorProcessing → Unconfigured with cleanup.
- Use FAILURE for config validation, ERROR for exceptions.

---

### Q5: How do lifecycle publishers differ from regular publishers?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

**Regular Publisher:**

```cpp
// In regular node
auto pub = create_publisher<String>("topic", 10);

// Publishes immediately
pub->publish(msg);  // ✅ Published!
```

**Lifecycle Publisher:**

```cpp
// In lifecycle node
auto pub = create_lifecycle_publisher<String>("topic", 10);

// In Inactive state:
pub->publish(msg);  // ❌ NOT published! (silently dropped)

// Must activate first:
pub->on_activate();

// Now in Active state:
pub->publish(msg);  // ✅ Published!
```

---

**Key Differences:**

| Aspect | Regular Publisher | Lifecycle Publisher |
|--------|------------------|---------------------|
| **Type** | `rclcpp::Publisher<T>` | `rclcpp_lifecycle::LifecyclePublisher<T>` |
| **Created In** | `rclcpp::Node` | `rclcpp_lifecycle::LifecycleNode` |
| **Publish Anytime?** | ✅ Yes | ❌ Only when activated |
| **State Aware?** | ❌ No | ✅ Yes |
| **Activation** | N/A (always active) | Must call `on_activate()` |
| **Deactivation** | N/A | Call `on_deactivate()` |

---

**Lifecycle Publisher State Machine:**

```
Created (via create_lifecycle_publisher)
    │
    │ Default state: Inactive
    │ publish() → silently dropped
    │
    ↓ on_activate() called
    │
Active
    │ publish() → actually publishes
    │
    ↓ on_deactivate() called
    │
Inactive
    │ publish() → silently dropped again
```

---

**Implementation in Lifecycle Node:**

```cpp
class LifecyclePublisherNode : public LifecycleNode {
    rclcpp_lifecycle::LifecyclePublisher<String>::SharedPtr pub_;
    rclcpp::TimerBase::SharedPtr timer_;

    CallbackReturn on_configure(const State &) override {
        // Create publisher (inactive by default)
        pub_ = create_lifecycle_publisher<String>("topic", 10);

        // Create timer
        timer_ = create_timer(1s, [this]() { timer_callback(); });
        timer_->cancel();  // Don't start yet

        return CallbackReturn::SUCCESS;
    }

    CallbackReturn on_activate(const State &) override {
        // Activate publisher
        pub_->on_activate();

        // Start timer
        timer_->reset();

        RCLCPP_INFO(get_logger(), "Now publishing!");
        return CallbackReturn::SUCCESS;
    }

    CallbackReturn on_deactivate(const State &) override {
        // Deactivate publisher
        pub_->on_deactivate();

        // Stop timer
        timer_->cancel();

        RCLCPP_INFO(get_logger(), "Stopped publishing");
        return CallbackReturn::SUCCESS;
    }

    void timer_callback() {
        auto msg = String();
        msg.data = "Hello";

        // Only publishes if node is Active
        pub_->publish(msg);
    }
};
```

---

**Why Lifecycle Publishers?**

**Problem without lifecycle publishers:**

```
Scenario:
- Node is deactivated (paused)
- Timer still fires → publishes stale/incorrect data
- Subscribers receive bad data
```

**Solution with lifecycle publishers:**

```
- Node deactivated → publisher deactivated
- Timer fires → publish() called
- Lifecycle publisher drops message (not active)
- Subscribers don't receive bad data ✓
```

**Benefits:**
1. **Safety**: Can't accidentally publish when node paused
2. **Clean state management**: Publishing tied to node state
3. **Determinism**: Subscribers know publisher only sends when active

---

**Subscribers in Lifecycle Nodes:**

**Note:** Subscribers are **NOT lifecycle-aware** by default.

```cpp
// Regular subscription in lifecycle node
auto sub = create_subscription<String>(
    "topic", 10,
    std::bind(&Node::callback, this, _1)
);

// Receives messages even when node is Inactive!
```

**To make subscriber state-aware (manual):**

```cpp
class LifecycleSubNode : public LifecycleNode {
    bool is_active_ = false;

    CallbackReturn on_activate(const State &) override {
        is_active_ = true;
        return CallbackReturn::SUCCESS;
    }

    CallbackReturn on_deactivate(const State &) override {
        is_active_ = false;
        return CallbackReturn::SUCCESS;
    }

    void callback(const String::SharedPtr msg) {
        if (!is_active_) {
            // Ignore messages when not active
            return;
        }

        // Process message
        RCLCPP_INFO(get_logger(), "Received: %s", msg->data.c_str());
    }
};
```

---

**Python Lifecycle Publisher:**

```python
class LifecyclePublisherNode(LifecycleNode):
    def on_configure(self, state):
        # Create lifecycle publisher
        self.pub = self.create_lifecycle_publisher(String, 'topic', 10)
        return TransitionCallbackReturn.SUCCESS

    def on_activate(self, state):
        # Activate publisher
        self.pub.on_activate(state)
        return TransitionCallbackReturn.SUCCESS

    def on_deactivate(self, state):
        # Deactivate publisher
        self.pub.on_deactivate(state)
        return TransitionCallbackReturn.SUCCESS

    def publish_message(self):
        msg = String()
        msg.data = "Hello"
        self.pub.publish(msg)  # Only publishes if active
```

---

**Interview Insight:**
Lifecycle publishers only publish when node is Active. Must call `on_activate()` to enable publishing, `on_deactivate()` to disable. This prevents accidental publishing when node is paused/inactive. Subscribers are not lifecycle-aware by default - must manually check state.

---

## PRACTICE_TASKS

### Task 1: Create Basic Lifecycle Node

**Goal:** Implement a lifecycle node that publishes counter values.

**Requirements:**
- Create lifecycle node in C++ or Python
- Publish counter (increments every second) on `/counter` topic
- Only publish when Active
- Parameter: `increment` (default 1)
- Validate `increment > 0` in on_configure()

**Test:**
```bash
# Terminal 1: Run node
ros2 run my_pkg lifecycle_counter

# Terminal 2: Configure
ros2 lifecycle set /lifecycle_counter configure

# Terminal 3: Monitor (nothing published yet)
ros2 topic echo /counter

# Terminal 2: Activate
ros2 lifecycle set /lifecycle_counter activate

# Terminal 3: Now see counter incrementing!

# Deactivate
ros2 lifecycle set /lifecycle_counter deactivate
# (counter stops)
```

---

### Task 2: Implement Lifecycle Client

**Goal:** Create a client node that controls lifecycle node from Task 1.

**Requirements:**
- Create regular node (not lifecycle)
- Service clients for `/lifecycle_counter/change_state` and `/get_state`
- Functions: `configure()`, `activate()`, `deactivate()`, `cleanup()`
- CLI: Accept commands via command-line args

**Usage:**
```bash
ros2 run my_pkg lifecycle_client --configure
ros2 run my_pkg lifecycle_client --activate
ros2 run my_pkg lifecycle_client --deactivate
```

---

### Task 3: Multi-Node Lifecycle Manager

**Goal:** Use Nav2's lifecycle manager to coordinate 3 nodes.

**Requirements:**
- Create 3 simple lifecycle nodes (sensor1, sensor2, sensor3)
- Each publishes random data when active
- Create lifecycle manager config to manage all 3
- Launch all nodes + manager with autostart

**Test:**
```bash
# Launch system (all nodes auto-configured and activated)
ros2 launch my_pkg lifecycle_system.launch.py

# Verify all active
ros2 lifecycle list

# Pause all nodes via manager
ros2 service call /lifecycle_manager/manage_nodes ...

# Resume all
ros2 service call /lifecycle_manager/manage_nodes ...
```

---

### Task 4: Error Handling

**Goal:** Implement proper error handling in lifecycle callbacks.

**Requirements:**
- Create lifecycle node with hardware simulation
- `on_configure()`: Initialize "hardware" (can fail randomly 30%)
- If init fails → return FAILURE
- If exception thrown → return ERROR
- Implement `on_error()` cleanup
- Add retry logic (max 3 attempts)

**Test:**
```bash
# Try configuring multiple times (may fail)
ros2 lifecycle set /hardware_node configure

# Eventually succeeds or exhausts retries
```

---

## QUICK_REFERENCE

### Lifecycle States

```
Primary States:
- Unconfigured (1): Initial state
- Inactive (2): Configured but not running
- Active (3): Fully operational
- Finalized (4): Shutdown complete

Transition States:
- Configuring (10)
- CleaningUp (11)
- Activating (12)
- Deactivating (13)
- ShuttingDown (14)
- ErrorProcessing (15)
```

### Lifecycle Commands

```bash
# List all lifecycle nodes
ros2 lifecycle list

# Get node state
ros2 lifecycle get /node_name

# Transitions
ros2 lifecycle set /node_name configure
ros2 lifecycle set /node_name activate
ros2 lifecycle set /node_name deactivate
ros2 lifecycle set /node_name cleanup
ros2 lifecycle set /node_name shutdown

# View available transitions
ros2 lifecycle nodes /node_name
```

### Callback Return Values

```cpp
return CallbackReturn::SUCCESS;  // Transition successful
return CallbackReturn::FAILURE;  // Transition failed, stay in current state
return CallbackReturn::ERROR;    // Fatal error, go to ErrorProcessing
```

### Creating Lifecycle Node (C++)

```cpp
#include "rclcpp_lifecycle/lifecycle_node.hpp"

class MyNode : public rclcpp_lifecycle::LifecycleNode {
public:
    MyNode() : LifecycleNode("my_node") {}

    CallbackReturn on_configure(const State &) override;
    CallbackReturn on_activate(const State &) override;
    CallbackReturn on_deactivate(const State &) override;
    CallbackReturn on_cleanup(const State &) override;
    CallbackReturn on_shutdown(const State &) override;
    CallbackReturn on_error(const State &) override;
};
```

### Creating Lifecycle Node (Python)

```python
from rclcpp.lifecycle import LifecycleNode, TransitionCallbackReturn, State

class MyNode(LifecycleNode):
    def __init__(self):
        super().__init__('my_node')

    def on_configure(self, state: State) -> TransitionCallbackReturn:
        return TransitionCallbackReturn.SUCCESS

    def on_activate(self, state: State) -> TransitionCallbackReturn:
        return TransitionCallbackReturn.SUCCESS
```

### Lifecycle Manager Config

```yaml
lifecycle_manager:
  ros__parameters:
    node_names: ['node1', 'node2', 'node3']
    autostart: true
    bond_timeout: 4.0
    attempt_respawn_reconnection: true
```

---

**END OF TOPIC 6.1: Lifecycle Nodes & Managed Components**
