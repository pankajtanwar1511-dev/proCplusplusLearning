## TOPIC: Behavior Trees (BehaviorTree.CPP)


---

## THEORY_SECTION
### 1. What are Behavior Trees?

**Behavior Trees (BTs)** are a **hierarchical task planning framework** for modeling complex decision-making and control logic in robotics and AI.

**Origin:**
- Game AI (Halo 2, Spore)
- Robotics (more modular than FSMs)
- Now standard in ROS2 (Nav2, MoveIt2)

**Why Behavior Trees?**

**Traditional Approach: Finite State Machines (FSM)**

```
States: IDLE → NAVIGATE → PICK → PLACE → IDLE

Problems:
❌ Rigid: Hard to add new behaviors
❌ State explosion: N states × M transitions
❌ Not reusable: Copy-paste code for variants
❌ Hard to visualize: Complex state diagrams
```

**Behavior Tree Approach:**

```
Tree Structure:
Root
├─ Sequence
│  ├─ Navigate
│  ├─ Pick
│  └─ Place

Advantages:
✅ Modular: Add/remove nodes easily
✅ Reusable: Subtrees can be composed
✅ Hierarchical: Natural decomposition
✅ Visual: Easy to understand tree structure
```

---

### 2. Core Concepts

**A. Node States**

Every BT node returns one of three states:

| State | Symbol | Meaning |
|-------|--------|---------|
| **SUCCESS** | ✓ | Task completed successfully |
| **FAILURE** | ✗ | Task failed |
| **RUNNING** | ⟳ | Task in progress (not done yet) |

**B. Ticking**

The tree is **ticked** (executed) periodically (e.g., 10 Hz).

```cpp
while (running) {
    NodeStatus status = tree.tickRoot();

    if (status == NodeStatus::SUCCESS) {
        std::cout << "Mission accomplished!" << std::endl;
        break;
    } else if (status == NodeStatus::FAILURE) {
        std::cout << "Mission failed!" << std::endl;
        break;
    }
    // status == RUNNING → continue ticking

    sleep(100ms);  // 10 Hz
}
```

**C. Node Types**

| Type | Description | Examples |
|------|-------------|----------|
| **Action** | Leaf node that does something | NavigateTo, PickObject, SayHello |
| **Condition** | Leaf node that checks something | IsBatteryLow, IsObjectDetected |
| **Decorator** | Has one child, modifies behavior | Retry, Timeout, Inverter |
| **Control** | Has multiple children, controls flow | Sequence, Fallback, Parallel |

---

### 3. Control Flow Nodes

**A. Sequence (→)**

**Behavior:** Execute children **left-to-right** until one **fails** or all **succeed**.

**Logic:**
```
Tick child 1:
  ✓ SUCCESS → Tick child 2
  ✗ FAILURE → Return FAILURE (stop)
  ⟳ RUNNING → Return RUNNING (continue next tick)

Tick child 2:
  ✓ SUCCESS → Tick child 3
  ...

All children SUCCESS → Return SUCCESS
```

**Example: Make Coffee**

```
Sequence
├─ GrindBeans        ✓
├─ BoilWater         ✓
├─ BrewCoffee        ✓
└─ PourCup           ✓
→ SUCCESS (coffee ready!)

If BoilWater fails → entire sequence fails
```

**Use Case:** Ordered steps that must all succeed.

---

**B. Fallback (?) (Also called "Selector")**

**Behavior:** Execute children **left-to-right** until one **succeeds** or all **fail**.

**Logic:**
```
Tick child 1:
  ✓ SUCCESS → Return SUCCESS (stop, we're done!)
  ✗ FAILURE → Tick child 2 (try next option)
  ⟳ RUNNING → Return RUNNING (continue)

Tick child 2:
  ✓ SUCCESS → Return SUCCESS
  ✗ FAILURE → Tick child 3
  ...

All children FAILURE → Return FAILURE
```

**Example: Go Home**

```
Fallback
├─ UseDoor           ✗ (locked)
├─ UseWindow         ✗ (closed)
└─ CallLocksmith     ✓ (success!)
→ SUCCESS (got in!)
```

**Use Case:** Try alternatives until one works.

---

**C. Parallel**

**Behavior:** Execute **all children simultaneously** (conceptually).

**Success Policy:**
- `SuccessOnAll`: Return SUCCESS when **all** children succeed
- `SuccessOnOne`: Return SUCCESS when **one** child succeeds

**Failure Policy:**
- `FailureOnAll`: Return FAILURE when **all** children fail
- `FailureOnOne`: Return FAILURE when **one** child fails

**Example: Patrol and Monitor**

```
Parallel (SuccessOnAll)
├─ PatrolRoute       ⟳
└─ MonitorBattery    ⟳

Both must succeed for parallel to succeed
```

**Use Case:** Concurrent tasks (moving while monitoring).

---

### 4. Decorator Nodes

Decorators **modify** the behavior of their **single child**.

**A. Inverter (!)**

Inverts child result:
- SUCCESS → FAILURE
- FAILURE → SUCCESS
- RUNNING → RUNNING

```
Inverter
└─ IsBatteryLow
   ✗ (battery is high) → SUCCESS
   ✓ (battery is low) → FAILURE
```

**Use Case:** Negate conditions.

---

**B. Retry (N times)**

Retry child up to N times on FAILURE.

```
Retry(3)
└─ ConnectToWiFi
   Attempt 1: ✗ FAILURE → retry
   Attempt 2: ✗ FAILURE → retry
   Attempt 3: ✓ SUCCESS → return SUCCESS
```

**Use Case:** Unreliable operations (network, hardware).

---

**C. Timeout (T seconds)**

Fail child if not done within T seconds.

```
Timeout(5s)
└─ DownloadMap
   t=0s:   RUNNING
   t=3s:   RUNNING
   t=5s:   TIMEOUT! → return FAILURE
```

**Use Case:** Prevent hanging on slow operations.

---

**D. ForceSuccess / ForceFailure**

Always return SUCCESS/FAILURE regardless of child result.

```
ForceSuccess
└─ CleanUp
   (Even if cleanup fails, continue)
```

**Use Case:** Best-effort operations.

---

**E. KeepRunningUntilFailure**

Keep ticking child and returning RUNNING until child returns FAILURE.

```
KeepRunningUntilFailure
└─ IsBatteryOK
   Battery OK:  RUNNING (keep going)
   Battery Low: FAILURE (stop)
```

**Use Case:** Monitoring conditions.

---

### 5. Action and Condition Nodes

**Action Nodes:**

Leaf nodes that **perform actions**.

**Characteristics:**
- Can return RUNNING (for long operations)
- Can be asynchronous
- May have side effects (move robot, send command)

**Example:**
```cpp
class NavigateTo : public SyncActionNode {
    NodeStatus tick() override {
        auto goal = getInput<Pose>("goal");
        bool success = robot.navigateTo(goal);
        return success ? NodeStatus::SUCCESS : NodeStatus::FAILURE;
    }
};
```

---

**Condition Nodes:**

Leaf nodes that **check conditions**.

**Characteristics:**
- Usually synchronous (instant check)
- Return SUCCESS or FAILURE (rarely RUNNING)
- No side effects (pure functions)

**Example:**
```cpp
class IsBatteryLow : public ConditionNode {
    NodeStatus tick() override {
        float battery = robot.getBatteryLevel();
        return (battery < 20.0) ? NodeStatus::SUCCESS : NodeStatus::FAILURE;
    }
};
```

---

### 6. The Blackboard

**Problem:**

How do nodes share data?

```
Sequence
├─ DetectObject     (finds object at position X)
└─ NavigateTo       (needs to know position X)

How does NavigateTo get X from DetectObject?
```

**Solution: Blackboard**

Global key-value storage accessible to all nodes.

**Writing to Blackboard:**
```cpp
class DetectObject : public SyncActionNode {
    NodeStatus tick() override {
        Pose object_pose = camera.detectObject();

        // Write to blackboard
        setOutput("object_position", object_pose);

        return NodeStatus::SUCCESS;
    }
};
```

**Reading from Blackboard:**
```cpp
class NavigateTo : public SyncActionNode {
    NodeStatus tick() override {
        // Read from blackboard
        auto goal = getInput<Pose>("target");

        robot.navigateTo(goal);
        return NodeStatus::SUCCESS;
    }
};
```

**Connecting in XML:**
```xml
<Sequence>
  <DetectObject object_position="{object_pos}"/>
  <NavigateTo target="{object_pos}"/>
</Sequence>
```

`{object_pos}` is a blackboard key.

---

### 7. BehaviorTree.CPP Library

**BehaviorTree.CPP** is the most popular C++ BT library for ROS2.

**Features:**
- Header-only or compiled
- XML tree definition
- C++ node registration
- Built-in decorators and controls
- Groot visualization tool
- ROS2 integration

**Basic Usage:**

```cpp
#include "behaviortree_cpp_v3/bt_factory.h"

using namespace BT;

int main() {
    BehaviorTreeFactory factory;

    // Register custom nodes
    factory.registerNodeType<MyActionNode>("MyAction");
    factory.registerNodeType<MyConditionNode>("MyCondition");

    // Load tree from XML
    auto tree = factory.createTreeFromFile("tree.xml");

    // Execute tree
    NodeStatus status = tree.tickRoot();

    return 0;
}
```

---

### 8. XML Tree Definition

**Example: Simple Navigation**

```xml
<root main_tree_to_execute="MainTree">
  <BehaviorTree ID="MainTree">

    <!-- Retry navigation up to 3 times -->
    <Retry num_attempts="3">
      <Sequence>

        <!-- Check battery before navigating -->
        <Inverter>
          <IsBatteryLow/>
        </Inverter>

        <!-- Navigate to goal -->
        <NavigateTo goal="{target_pose}"/>

      </Sequence>
    </Retry>

  </BehaviorTree>
</root>
```

**Node Registration (C++):**

```cpp
factory.registerNodeType<IsBatteryLow>("IsBatteryLow");
factory.registerNodeType<NavigateTo>("NavigateTo");
```

---

### 9. Synchronous vs Asynchronous Actions

**Synchronous Action:**

Completes instantly (within one tick).

```cpp
class SyncAction : public SyncActionNode {
    NodeStatus tick() override {
        // Do work (completes immediately)
        std::cout << "Action completed!" << std::endl;
        return NodeStatus::SUCCESS;
    }
};
```

**Use Case:** Quick operations (< 100 ms).

---

**Asynchronous Action:**

Takes multiple ticks to complete.

```cpp
class AsyncAction : public StatefulActionNode {
    NodeStatus onStart() override {
        // Start async operation
        robot.startNavigating(goal_);
        return NodeStatus::RUNNING;
    }

    NodeStatus onRunning() override {
        // Check if done
        if (robot.isNavigationComplete()) {
            return NodeStatus::SUCCESS;
        }
        return NodeStatus::RUNNING;  // Still working
    }

    void onHalted() override {
        // Cleanup if interrupted
        robot.stopNavigation();
    }
};
```

**Use Case:** Long operations (navigation, manipulation).

---

### 10. Common Patterns

**Pattern 1: Fallback Recovery**

Try main action, if fails, try recovery.

```xml
<Fallback>
  <!-- Try normal navigation -->
  <Sequence>
    <ComputePath goal="{target}"/>
    <FollowPath path="{computed_path}"/>
  </Sequence>

  <!-- Recovery: clear costmap and retry -->
  <Sequence>
    <ClearCostmap/>
    <ComputePath goal="{target}"/>
    <FollowPath path="{computed_path}"/>
  </Sequence>

  <!-- Last resort: report failure -->
  <ReportFailure message="Navigation impossible"/>
</Fallback>
```

---

**Pattern 2: Precondition Check**

Check conditions before action.

```xml
<Sequence>
  <!-- Preconditions -->
  <IsBatteryOK/>
  <IsRobotLocalized/>

  <!-- Action -->
  <NavigateToGoal goal="{target}"/>
</Sequence>
```

If battery low → entire sequence fails (action not attempted).

---

**Pattern 3: Loop Until Success**

Keep trying until success or timeout.

```xml
<Timeout seconds="30">
  <RetryUntilSuccessful>
    <ConnectToServer/>
  </RetryUntilSuccessful>
</Timeout>
```

---

**Pattern 4: Reactive Behavior**

React to events while executing main task.

```xml
<Parallel success_threshold="2" failure_threshold="1">
  <!-- Main task -->
  <PatrolRoute/>

  <!-- Reactive: stop if obstacle detected -->
  <Sequence>
    <IsObstacleDetected/>
    <StopRobot/>
  </Sequence>
</Parallel>
```

---

### 11. Groot - BT Visualization

**Groot** is a graphical editor and monitor for Behavior Trees.

**Features:**
- Visual tree editor
- Real-time monitoring (see which nodes are active)
- Blackboard inspection
- Log replay

**Usage:**

```bash
# Install Groot
sudo apt install ros-humble-groot

# Run Groot
groot

# In your code, enable Groot monitoring:
PublisherZMQ publisher_zmq(tree);
```

**Visualization:**

```
Green nodes:  SUCCESS
Red nodes:    FAILURE
Yellow nodes: RUNNING
Gray nodes:   Not ticked yet
```

---

### 12. ROS2 Integration

**BehaviorTree.ROS2** plugin provides ROS2 action nodes.

**Example: Call ROS2 Action**

```cpp
#include "behaviortree_ros2/bt_action_node.hpp"
#include "nav2_msgs/action/navigate_to_pose.hpp"

class NavigateToPoseAction : public BT::RosActionNode<nav2_msgs::action::NavigateToPose>
{
public:
    NavigateToPoseAction(const std::string& name, const BT::NodeConfiguration& conf)
        : RosActionNode<nav2_msgs::action::NavigateToPose>(name, conf)
    {}

    static BT::PortsList providedPorts() {
        return {BT::InputPort<geometry_msgs::msg::PoseStamped>("goal")};
    }

    bool setGoal(RosActionNode::Goal& goal) override {
        auto pose = getInput<geometry_msgs::msg::PoseStamped>("goal");
        goal.pose = pose.value();
        return true;
    }

    BT::NodeStatus onResultReceived(const RosActionNode::WrappedResult& result) override {
        return BT::NodeStatus::SUCCESS;
    }

    BT::NodeStatus onFailure(BT::ActionNodeErrorCode error) override {
        return BT::NodeStatus::FAILURE;
    }
};
```

**XML:**
```xml
<NavigateToPoseAction goal="{target_pose}" server_name="/navigate_to_pose"/>
```

---

## EDGE_CASES

### Edge Case 1: Infinite Loop in Behavior Tree

**Scenario:**

BT gets stuck in infinite loop, never returns SUCCESS or FAILURE.

```xml
<Sequence>
  <!-- This condition always returns RUNNING -->
  <KeepRunningUntilFailure>
    <IsAlwaysTrue/>
  </KeepRunningUntilFailure>

  <!-- This node never reached -->
  <DoSomething/>
</Sequence>
```

**Why:**

`KeepRunningUntilFailure` keeps ticking child. If child never returns FAILURE, decorator never returns SUCCESS/FAILURE → sequence stuck.

**Solution 1: Add Timeout**

```xml
<Timeout seconds="10">
  <Sequence>
    <KeepRunningUntilFailure>
      <IsAlwaysTrue/>
    </KeepRunningUntilFailure>
    <DoSomething/>
  </Sequence>
</Timeout>
```

**Solution 2: Add Tick Limit**

```cpp
int max_ticks = 100;
int tick_count = 0;

while (running) {
    auto status = tree.tickRoot();

    if (status != NodeStatus::RUNNING) {
        break;
    }

    tick_count++;
    if (tick_count > max_ticks) {
        RCLCPP_ERROR(logger, "BT stuck! Exceeded tick limit.");
        break;
    }
}
```

**Solution 3: Monitor Progress**

```cpp
class ProgressMonitor : public DecoratorNode {
    NodeStatus tick() override {
        auto status = child_node_->executeTick();

        if (status == NodeStatus::RUNNING) {
            running_ticks_++;

            if (running_ticks_ > max_running_ticks_) {
                RCLCPP_ERROR(logger, "Child stuck in RUNNING!");
                return NodeStatus::FAILURE;
            }
        } else {
            running_ticks_ = 0;
        }

        return status;
    }

    int running_ticks_ = 0;
    int max_running_ticks_ = 100;
};
```

**Interview Insight:**
Infinite loops occur when nodes never return SUCCESS/FAILURE. Use timeouts, tick limits, or progress monitors to detect and break loops.

---

### Edge Case 2: Blackboard Data Race

**Scenario:**

Multiple nodes write to same blackboard key simultaneously (in Parallel node).

```xml
<Parallel>
  <DetectObjectA object="{detected_object}"/>
  <DetectObjectB object="{detected_object}"/>
</Parallel>

<!-- Both write to {detected_object} → race condition! -->
```

**Why:**

Parallel node ticks children "simultaneously" (in practice, sequentially but conceptually parallel). Last write wins.

**Problem:**

```
Tick 1:
  DetectObjectA writes: object = "apple"
  DetectObjectB writes: object = "banana"
  Result: object = "banana" (last write)

Tick 2:
  DetectObjectA writes: object = "car"
  DetectObjectB writes: object = "dog"
  Result: object = "dog"

Data inconsistent!
```

**Solution 1: Use Different Keys**

```xml
<Parallel>
  <DetectObjectA object="{detected_object_A}"/>
  <DetectObjectB object="{detected_object_B}"/>
</Parallel>

<!-- Merge results later -->
<MergeDetections input_A="{detected_object_A}"
                 input_B="{detected_object_B}"
                 output="{final_object}"/>
```

**Solution 2: Use Array/List**

```cpp
class DetectObject : public SyncActionNode {
    NodeStatus tick() override {
        auto object = detectObject();

        // Append to list instead of overwriting
        auto detected_list = getInput<std::vector<Object>>("detected_objects");
        detected_list->push_back(object);
        setOutput("detected_objects", detected_list);

        return NodeStatus::SUCCESS;
    }
};
```

**Solution 3: Avoid Parallel for Conflicting Writes**

Use Sequence instead:

```xml
<Sequence>
  <DetectObjectA object="{detected_object_A}"/>
  <DetectObjectB object="{detected_object_B}"/>
  <!-- No race, sequential execution -->
</Sequence>
```

**Interview Insight:**
Blackboard data races occur in Parallel nodes writing to same key. Use separate keys, append to lists, or avoid Parallel for conflicting writes.

---

### Edge Case 3: Halted Node Not Cleaned Up

**Scenario:**

Async action node is halted (interrupted) mid-execution, doesn't clean up resources.

```cpp
class AsyncNavigate : public StatefulActionNode {
    NodeStatus onStart() override {
        nav_client_->send_goal(goal_);  // Start navigation
        return NodeStatus::RUNNING;
    }

    NodeStatus onRunning() override {
        if (nav_client_->is_goal_done()) {
            return NodeStatus::SUCCESS;
        }
        return NodeStatus::RUNNING;
    }

    // ❌ Missing: onHalted() cleanup!
};
```

**What Happens:**

```xml
<Fallback>
  <Timeout seconds="5">
    <AsyncNavigate/>
  </Timeout>
  <!-- If navigation times out, AsyncNavigate is halted -->
  <RecoveryBehavior/>
</Fallback>

# After timeout:
# - AsyncNavigate is halted
# - BUT navigation action still running in background!
# - Robot keeps moving even though BT moved on to recovery
```

**Solution: Implement onHalted()**

```cpp
class AsyncNavigate : public StatefulActionNode {
    NodeStatus onStart() override {
        goal_handle_ = nav_client_->send_goal(goal_);
        return NodeStatus::RUNNING;
    }

    NodeStatus onRunning() override {
        if (nav_client_->is_goal_done()) {
            return NodeStatus::SUCCESS;
        }
        return NodeStatus::RUNNING;
    }

    void onHalted() override {
        // ✅ Cancel navigation when halted
        if (goal_handle_) {
            nav_client_->cancel_goal(goal_handle_);
            goal_handle_.reset();
        }

        RCLCPP_WARN(logger_, "Navigation halted, goal canceled");
    }

private:
    GoalHandle goal_handle_;
};
```

**Interview Insight:**
Always implement `onHalted()` for async actions to clean up resources (cancel goals, stop motors, release locks). Failure to halt properly causes actions to run in background after BT moves on.

---

### Edge Case 4: Tree Reloading Mid-Execution

**Scenario:**

BT is reloaded from XML while tree is executing.

```cpp
// Tree executing
auto status = tree.tickRoot();  // Returns RUNNING

// Reload tree from XML (e.g., config changed)
tree = factory.createTreeFromFile("new_tree.xml");

// What happens to running nodes?
```

**Why:**

Old tree nodes may have been mid-execution (navigation in progress, file download, etc.).

**Problem:**

```
Old tree:
  AsyncNavigate (RUNNING, robot moving)

Reload:
  Old tree destroyed
  → AsyncNavigate destructor called
  → IF onHalted() not called → robot keeps moving!

New tree starts:
  Different behavior tree
  → Doesn't know about ongoing navigation
```

**Solution 1: Halt Before Reload**

```cpp
// Halt current tree
tree.haltTree();  // Calls onHalted() for all running nodes

// Now safe to reload
tree = factory.createTreeFromFile("new_tree.xml");
```

**Solution 2: Transition State**

```cpp
enum class BTState {
    RUNNING,
    HALTING,
    HALTED,
    RELOADING
};

BTState state = BTState::RUNNING;

if (reload_requested) {
    state = BTState::HALTING;
    tree.haltTree();
    state = BTState::HALTED;

    // Wait for all async operations to finish
    wait_for_cleanup();

    // Now reload
    state = BTState::RELOADING;
    tree = factory.createTreeFromFile("new_tree.xml");
    state = BTState::RUNNING;
}
```

**Solution 3: Prevent Reload During Execution**

```cpp
if (tree.rootNode()->status() == NodeStatus::RUNNING) {
    RCLCPP_WARN(logger, "Cannot reload while tree is executing!");
    return false;
}

// Safe to reload (tree not running)
tree = factory.createTreeFromFile("new_tree.xml");
```

**Interview Insight:**
Reloading BT mid-execution can leave running nodes without cleanup. Always halt tree before reloading. Implement proper onHalted() for all async actions.

---

## CODE_EXAMPLES

### Example 1: Complete BT with Custom Nodes

**File: `simple_bt_example.cpp`**

```cpp
#include "behaviortree_cpp_v3/bt_factory.h"
#include "behaviortree_cpp_v3/loggers/bt_cout_logger.h"
#include <iostream>

using namespace BT;

// Condition: Check if battery is low
class IsBatteryLow : public ConditionNode {
public:
    IsBatteryLow(const std::string& name) : ConditionNode(name, {}) {}

    NodeStatus tick() override {
        float battery_level = 85.0;  // Mock battery level
        std::cout << "Checking battery: " << battery_level << "%" << std::endl;

        return (battery_level < 20.0) ? NodeStatus::SUCCESS : NodeStatus::FAILURE;
    }
};

// Action: Charge battery
class ChargeBattery : public SyncActionNode {
public:
    ChargeBattery(const std::string& name) : SyncActionNode(name, {}) {}

    NodeStatus tick() override {
        std::cout << "Charging battery..." << std::endl;
        // Mock charging (instant)
        return NodeStatus::SUCCESS;
    }
};

// Action: Navigate to goal
class NavigateToGoal : public StatefulActionNode {
public:
    NavigateToGoal(const std::string& name, const NodeConfiguration& config)
        : StatefulActionNode(name, config) {}

    static PortsList providedPorts() {
        return {InputPort<std::string>("goal")};
    }

    NodeStatus onStart() override {
        auto goal = getInput<std::string>("goal");
        if (!goal) {
            throw RuntimeError("Missing goal");
        }

        std::cout << "Starting navigation to: " << goal.value() << std::endl;
        progress_ = 0.0;
        return NodeStatus::RUNNING;
    }

    NodeStatus onRunning() override {
        progress_ += 0.1;
        std::cout << "Navigation progress: " << (int)(progress_ * 100) << "%" << std::endl;

        if (progress_ >= 1.0) {
            std::cout << "Navigation complete!" << std::endl;
            return NodeStatus::SUCCESS;
        }

        return NodeStatus::RUNNING;
    }

    void onHalted() override {
        std::cout << "Navigation halted!" << std::endl;
    }

private:
    float progress_ = 0.0;
};

// Action: Pick object
class PickObject : public SyncActionNode {
public:
    PickObject(const std::string& name) : SyncActionNode(name, {}) {}

    NodeStatus tick() override {
        std::cout << "Picking object..." << std::endl;
        // Mock picking
        bool success = true;
        return success ? NodeStatus::SUCCESS : NodeStatus::FAILURE;
    }
};

int main() {
    BehaviorTreeFactory factory;

    // Register custom nodes
    factory.registerNodeType<IsBatteryLow>("IsBatteryLow");
    factory.registerNodeType<ChargeBattery>("ChargeBattery");
    factory.registerNodeType<NavigateToGoal>("NavigateToGoal");
    factory.registerNodeType<PickObject>("PickObject");

    // Define tree in XML
    static const char* xml_text = R"(
    <root main_tree_to_execute="MainTree">
      <BehaviorTree ID="MainTree">
        <Sequence>

          <!-- Check battery, charge if low -->
          <Fallback>
            <Inverter>
              <IsBatteryLow/>
            </Inverter>
            <ChargeBattery/>
          </Fallback>

          <!-- Navigate to goal -->
          <NavigateToGoal goal="kitchen"/>

          <!-- Pick object -->
          <PickObject/>

        </Sequence>
      </BehaviorTree>
    </root>
    )";

    auto tree = factory.createTreeFromText(xml_text);

    // Enable console logging
    StdCoutLogger logger_cout(tree);

    // Execute tree
    NodeStatus status = NodeStatus::RUNNING;

    while (status == NodeStatus::RUNNING) {
        status = tree.tickRoot();

        std::cout << "Tree status: " << toStr(status) << std::endl;
        std::cout << "---" << std::endl;

        std::this_thread::sleep_for(std::chrono::milliseconds(500));
    }

    if (status == NodeStatus::SUCCESS) {
        std::cout << "Mission accomplished!" << std::endl;
    } else {
        std::cout << "Mission failed!" << std::endl;
    }

    return 0;
}
```

**Compile:**

```cmake
find_package(behaviortree_cpp_v3 REQUIRED)

add_executable(simple_bt_example src/simple_bt_example.cpp)
target_link_libraries(simple_bt_example BT::behaviortree_cpp_v3)
```

**Run:**

```bash
ros2 run my_pkg simple_bt_example
```

**Output:**

```
Checking battery: 85%
Starting navigation to: kitchen
Navigation progress: 10%
---
Navigation progress: 20%
---
...
Navigation progress: 100%
Navigation complete!
Picking object...
Tree status: SUCCESS
Mission accomplished!
```

---

### Example 2: Using Blackboard for Data Flow

**File: `blackboard_example.cpp`**

```cpp
#include "behaviortree_cpp_v3/bt_factory.h"
#include <iostream>

using namespace BT;

// Action: Detect object, write position to blackboard
class DetectObject : public SyncActionNode {
public:
    DetectObject(const std::string& name, const NodeConfiguration& config)
        : SyncActionNode(name, config) {}

    static PortsList providedPorts() {
        return {OutputPort<std::string>("object_position")};
    }

    NodeStatus tick() override {
        // Mock detection
        std::string detected_position = "x:1.5, y:2.3, z:0.0";
        std::cout << "Object detected at: " << detected_position << std::endl;

        // Write to blackboard
        setOutput("object_position", detected_position);

        return NodeStatus::SUCCESS;
    }
};

// Action: Navigate to position from blackboard
class NavigateToPosition : public SyncActionNode {
public:
    NavigateToPosition(const std::string& name, const NodeConfiguration& config)
        : SyncActionNode(name, config) {}

    static PortsList providedPorts() {
        return {InputPort<std::string>("target")};
    }

    NodeStatus tick() override {
        // Read from blackboard
        auto target = getInput<std::string>("target");

        if (!target) {
            std::cerr << "Error: No target position!" << std::endl;
            return NodeStatus::FAILURE;
        }

        std::cout << "Navigating to: " << target.value() << std::endl;

        return NodeStatus::SUCCESS;
    }
};

int main() {
    BehaviorTreeFactory factory;

    factory.registerNodeType<DetectObject>("DetectObject");
    factory.registerNodeType<NavigateToPosition>("NavigateToPosition");

    static const char* xml_text = R"(
    <root main_tree_to_execute="MainTree">
      <BehaviorTree ID="MainTree">
        <Sequence>

          <!-- Detect object, write to {obj_pos} -->
          <DetectObject object_position="{obj_pos}"/>

          <!-- Navigate to position from {obj_pos} -->
          <NavigateToPosition target="{obj_pos}"/>

        </Sequence>
      </BehaviorTree>
    </root>
    )";

    auto tree = factory.createTreeFromText(xml_text);

    auto status = tree.tickRoot();

    std::cout << "Final status: " << toStr(status) << std::endl;

    return 0;
}
```

**Output:**

```
Object detected at: x:1.5, y:2.3, z:0.0
Navigating to: x:1.5, y:2.3, z:0.0
Final status: SUCCESS
```

---

### Example 3: Subtree Reuse

**File: `subtree_example.xml`**

```xml
<root main_tree_to_execute="MainTree">

  <!-- Subtree: Safe Navigation (checks battery) -->
  <BehaviorTree ID="SafeNavigate">
    <Sequence>
      <!-- Precondition: Battery OK -->
      <Inverter>
        <IsBatteryLow/>
      </Inverter>

      <!-- Navigate -->
      <NavigateToGoal goal="{nav_goal}"/>
    </Sequence>
  </BehaviorTree>

  <!-- Main tree: Visit multiple waypoints -->
  <BehaviorTree ID="MainTree">
    <Sequence>

      <!-- Waypoint 1 -->
      <SetBlackboard output_key="nav_goal" value="kitchen"/>
      <SubTree ID="SafeNavigate"/>

      <!-- Waypoint 2 -->
      <SetBlackboard output_key="nav_goal" value="living_room"/>
      <SubTree ID="SafeNavigate"/>

      <!-- Waypoint 3 -->
      <SetBlackboard output_key="nav_goal" value="bedroom"/>
      <SubTree ID="SafeNavigate"/>

    </Sequence>
  </BehaviorTree>

</root>
```

**Benefits:**
- `SafeNavigate` subtree is defined once, reused 3 times
- Easy to modify (change in one place)
- Modular, readable

---

## INTERVIEW_QA

### Q1: What are the advantages of Behavior Trees over Finite State Machines?

**Difficulty:** ⭐⭐ (Easy)

**Answer:**

**Finite State Machines (FSM):**

```
States: IDLE → NAVIGATE → PICK → PLACE → IDLE

Transitions: Explicit edges between states
```

**Problems with FSMs:**

**1. State Explosion:**

```
2 states: IDLE, NAVIGATE
Add feature: check battery
→ Now 4 states: IDLE_BATTERY_OK, IDLE_BATTERY_LOW,
               NAVIGATE_BATTERY_OK, NAVIGATE_BATTERY_LOW

Add another feature: obstacle detection
→ 8 states: IDLE_BATTERY_OK_NO_OBSTACLE, IDLE_BATTERY_OK_OBSTACLE, ...

N features → 2^N states!
```

**2. Not Reusable:**

```
FSM for Robot A: Custom state machine
FSM for Robot B: Copy-paste, modify (duplicated code)

Change behavior → modify both FSMs
```

**3. Hard to Modify:**

```
Adding new state:
- Add state node
- Add transitions from/to existing states
- Update transition logic
- Test all combinations
```

**4. Not Hierarchical:**

```
Cannot group related states
No "abstract" states
Flat structure
```

---

**Behavior Trees:**

**1. Modular:**

```
Add feature:
<Sequence>
  <CheckBattery/>    ← Add new node
  <Navigate/>
</Sequence>

No state explosion!
```

**2. Reusable:**

```
<BehaviorTree ID="SafeNavigate">
  <Sequence>
    <CheckBattery/>
    <Navigate/>
  </Sequence>
</BehaviorTree>

Use in Robot A: <SubTree ID="SafeNavigate"/>
Use in Robot B: <SubTree ID="SafeNavigate"/>

Defined once, reused everywhere!
```

**3. Easy to Modify:**

```
Add recovery behavior:
<Fallback>
  <Navigate/>
  <RecoveryBehavior/>  ← Just add node
</Fallback>

No transition rewiring!
```

**4. Hierarchical:**

```
Root
├─ MissionSequence
│  ├─ SafeNavigate (subtree)
│  │  ├─ CheckBattery
│  │  └─ Navigate
│  └─ PickObject
└─ RecoveryBehaviors

Natural decomposition!
```

---

**Comparison Table:**

| Aspect | FSM | Behavior Tree |
|--------|-----|---------------|
| **Scalability** | State explosion (2^N states) | Linear growth |
| **Reusability** | Copy-paste | Subtrees |
| **Modification** | Rewire transitions | Add/remove nodes |
| **Visualization** | Complex graph | Hierarchical tree |
| **Modularity** | Low (monolithic) | High (composable) |
| **Learning Curve** | Easy (simple concept) | Medium (need to learn node types) |

---

**When to use FSM:**

✅ Simple, fixed behavior (< 5 states)
✅ Performance-critical (FSM is faster)
✅ Real-time embedded systems

**When to use BT:**

✅ Complex decision-making (> 5 states)
✅ Need modularity and reusability
✅ Behavior changes frequently (R&D)
✅ Visual debugging needed

---

**Interview Insight:**
BTs avoid FSM state explosion through hierarchy and modularity. Subtrees enable reuse. Easy to modify (add/remove nodes vs rewiring transitions). Better for complex, evolving robot behaviors. FSMs better for simple, fixed, performance-critical tasks.

---

### Q2: Explain the difference between Sequence and Fallback nodes.

**Difficulty:** ⭐⭐ (Easy)

**Answer:**

**Sequence (→) - "AND logic"**

**Behavior:** Execute children **left-to-right** until one **fails** or all **succeed**.

**Pseudocode:**
```
for each child:
    status = tick(child)
    if status == FAILURE:
        return FAILURE  (stop immediately)
    if status == RUNNING:
        return RUNNING  (wait for completion)
return SUCCESS  (all succeeded)
```

**Example: Make Breakfast**

```
Sequence
├─ CrackEgg       ✓ SUCCESS
├─ WhiskEgg       ✓ SUCCESS
├─ FryEgg         ✓ SUCCESS
└─ ServePlate     ✓ SUCCESS
→ Sequence returns SUCCESS
```

**If one step fails:**

```
Sequence
├─ CrackEgg       ✓ SUCCESS
├─ WhiskEgg       ✗ FAILURE (egg dropped!)
├─ FryEgg         (not executed)
└─ ServePlate     (not executed)
→ Sequence returns FAILURE
```

**Use Case:** Ordered steps that **must all succeed**.

---

**Fallback (?) - "OR logic"** (Also called "Selector")

**Behavior:** Execute children **left-to-right** until one **succeeds** or all **fail**.

**Pseudocode:**
```
for each child:
    status = tick(child)
    if status == SUCCESS:
        return SUCCESS  (stop immediately, we're done!)
    if status == RUNNING:
        return RUNNING  (wait for completion)
return FAILURE  (all failed)
```

**Example: Open Door**

```
Fallback
├─ TryDoorknob    ✗ FAILURE (locked)
├─ UseKey         ✓ SUCCESS (opened!)
├─ BreakWindow    (not executed)
└─ CallLocksmith  (not executed)
→ Fallback returns SUCCESS
```

**If all fail:**

```
Fallback
├─ TryDoorknob    ✗ FAILURE (locked)
├─ UseKey         ✗ FAILURE (key broke)
├─ BreakWindow    ✗ FAILURE (bulletproof)
└─ CallLocksmith  ✗ FAILURE (no answer)
→ Fallback returns FAILURE
```

**Use Case:** Try **alternatives** until one works (recovery, fallback plans).

---

**Key Differences:**

| Aspect | Sequence | Fallback |
|--------|----------|----------|
| **Logic** | AND (all must succeed) | OR (one must succeed) |
| **Stops on** | First FAILURE | First SUCCESS |
| **Returns SUCCESS** | All children succeed | One child succeeds |
| **Returns FAILURE** | One child fails | All children fail |
| **Use Case** | Ordered steps | Alternatives / recovery |

---

**Mental Model:**

**Sequence = Recipe:**
1. Crack egg ✓
2. Whisk egg ✓
3. Fry egg ✓
(All steps must succeed)

**Fallback = Problem Solving:**
Try option 1 → Failed?
Try option 2 → Failed?
Try option 3 → Success! (stop)

---

**Real-World Example: Robot Navigation**

**Sequence (successful path):**
```
Sequence
├─ ComputePath      ✓ (path found)
├─ FollowPath       ✓ (reached goal)
└─ ReportSuccess    ✓ (notified user)
→ SUCCESS
```

**Fallback (with recovery):**
```
Fallback
├─ Sequence
│  ├─ ComputePath   ✓
│  └─ FollowPath    ✗ (obstacle!)
├─ Sequence (recovery)
│  ├─ ClearCostmap  ✓
│  ├─ ComputePath   ✓
│  └─ FollowPath    ✓ (success!)
└─ ReportFailure    (not executed)
→ SUCCESS (recovered!)
```

---

**Interview Insight:**
Sequence = AND (all must succeed, stops on first failure). Fallback = OR (one must succeed, stops on first success). Sequence for ordered steps, Fallback for alternatives/recovery.

---

### Q3: What is the Blackboard and how is it used in Behavior Trees?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

The **Blackboard** is a **shared key-value store** that allows nodes in a Behavior Tree to exchange data.

---

**Problem: Data Flow Between Nodes**

**Without Blackboard:**

```cpp
class DetectObject : public ActionNode {
    Pose detected_pose_;  // Where to store result?

    NodeStatus tick() override {
        detected_pose_ = camera.detect();
        // How does NavigateTo node get this data?
    }
};

class NavigateTo : public ActionNode {
    NodeStatus tick() override {
        // How to get detected_pose from DetectObject?
    }
};
```

❌ **No mechanism to share data between nodes!**

---

**With Blackboard:**

**Write to Blackboard:**

```cpp
class DetectObject : public SyncActionNode {
public:
    static PortsList providedPorts() {
        return {OutputPort<Pose>("detected_pose")};
    }

    NodeStatus tick() override {
        Pose pose = camera.detect();

        // Write to blackboard
        setOutput("detected_pose", pose);

        return NodeStatus::SUCCESS;
    }
};
```

**Read from Blackboard:**

```cpp
class NavigateTo : public SyncActionNode {
public:
    static PortsList providedPorts() {
        return {InputPort<Pose>("target")};
    }

    NodeStatus tick() override {
        // Read from blackboard
        auto pose = getInput<Pose>("target");

        if (!pose) {
            return NodeStatus::FAILURE;  // No target!
        }

        robot.navigateTo(pose.value());
        return NodeStatus::SUCCESS;
    }
};
```

**Connect in XML:**

```xml
<Sequence>
  <!-- Write to {obj_pose} -->
  <DetectObject detected_pose="{obj_pose}"/>

  <!-- Read from {obj_pose} -->
  <NavigateTo target="{obj_pose}"/>
</Sequence>
```

`{obj_pose}` is a **blackboard key**.

---

**How It Works:**

```
Blackboard (key-value store):
  {
    "obj_pose": Pose(1.5, 2.3, 0.0),
    "battery_level": 85.0,
    "is_object_detected": true
  }

DetectObject:
  setOutput("detected_pose", pose)
  → Blackboard["obj_pose"] = pose

NavigateTo:
  getInput<Pose>("target")
  → return Blackboard["obj_pose"]
```

---

**Port Types:**

| Port Type | Direction | Description |
|-----------|-----------|-------------|
| **InputPort** | Read | Node reads value from blackboard |
| **OutputPort** | Write | Node writes value to blackboard |
| **BidirectionalPort** | Read/Write | Node can both read and write |

---

**Example: Bidirectional Port (Counter)**

```cpp
class IncrementCounter : public SyncActionNode {
public:
    static PortsList providedPorts() {
        return {BidirectionalPort<int>("counter")};
    }

    NodeStatus tick() override {
        // Read current value
        auto counter = getInput<int>("counter").value();

        // Increment
        counter++;

        // Write back
        setOutput("counter", counter);

        std::cout << "Counter: " << counter << std::endl;

        return NodeStatus::SUCCESS;
    }
};
```

**XML:**

```xml
<Sequence>
  <SetBlackboard output_key="counter" value="0"/>
  <IncrementCounter counter="{counter}"/>  <!-- 1 -->
  <IncrementCounter counter="{counter}"/>  <!-- 2 -->
  <IncrementCounter counter="{counter}"/>  <!-- 3 -->
</Sequence>
```

---

**Blackboard Scoping:**

**Global Blackboard:**

Shared across entire tree.

```xml
<Sequence>
  <DetectObject object="{global_object}"/>
  <SubTree ID="ProcessObject"/>  <!-- Can access {global_object} -->
</Sequence>
```

**Local Blackboard (Subtree):**

Private to subtree.

```xml
<SubTree ID="ProcessObject" _autoremap="true">
  <DetectObject object="{local_object}"/>
  <!-- {local_object} not visible outside subtree -->
</SubTree>
```

---

**Type Safety:**

Blackboard is **type-safe**:

```cpp
// Write float
setOutput("value", 3.14f);

// Try to read as int
auto value = getInput<int>("value");  // ❌ Type mismatch! Returns nullopt
```

---

**Default Values:**

```cpp
// Read with default if key doesn't exist
auto timeout = getInput<int>("timeout").value_or(10);  // Default: 10
```

---

**Benefits:**

✅ **Decoupling:** Nodes don't depend on each other directly
✅ **Flexibility:** Change data flow by rewiring XML (no code change)
✅ **Reusability:** Same node can use different blackboard keys
✅ **Type Safety:** Compile-time type checking

---

**Limitations:**

⚠️ **Global State:** Can lead to hard-to-debug issues
⚠️ **No Versioning:** Overwriting values (last write wins)
⚠️ **Not Thread-Safe:** Parallel nodes can cause races

---

**Interview Insight:**
Blackboard is a shared key-value store for data flow between BT nodes. Nodes declare InputPort/OutputPort, read with getInput(), write with setOutput(). Connected via {key} in XML. Type-safe, decoupled, but watch for races in Parallel nodes.

---

### Q4: How do you handle long-running asynchronous actions in Behavior Trees?

**Difficulty:** ⭐⭐⭐⭐ (Hard)

**Answer:**

**Problem:**

Some actions take multiple ticks to complete (navigation, file download, manipulation):

```
Navigate from A → B: Takes 10 seconds
BT ticks at 10 Hz: 100 ticks during navigation

How to handle this in BT?
```

---

**Solution: Async Action Nodes**

BehaviorTree.CPP provides **StatefulActionNode** for long-running actions.

---

**Stateful Action Lifecycle:**

```cpp
class AsyncAction : public StatefulActionNode {
    // Called once when node first ticked
    NodeStatus onStart() override;

    // Called every subsequent tick while RUNNING
    NodeStatus onRunning() override;

    // Called if node is halted/interrupted
    void onHalted() override;
};
```

---

**Example: Async Navigation**

```cpp
class AsyncNavigate : public StatefulActionNode {
public:
    AsyncNavigate(const std::string& name, const NodeConfiguration& config)
        : StatefulActionNode(name, config) {}

    static PortsList providedPorts() {
        return {InputPort<Pose>("goal")};
    }

    // Called once when node starts
    NodeStatus onStart() override {
        auto goal = getInput<Pose>("goal").value();

        // Send goal to navigation action server
        auto goal_msg = nav2_msgs::action::NavigateToPose::Goal();
        goal_msg.pose = goal;

        goal_handle_ = nav_client_->async_send_goal(goal_msg);

        std::cout << "Navigation started to: " << goal << std::endl;

        // Return RUNNING (not done yet)
        return NodeStatus::RUNNING;
    }

    // Called every tick while RUNNING
    NodeStatus onRunning() override {
        // Check if navigation complete
        auto status = nav_client_->get_status(goal_handle_);

        if (status == rclcpp_action::ResultCode::SUCCEEDED) {
            std::cout << "Navigation succeeded!" << std::endl;
            return NodeStatus::SUCCESS;
        } else if (status == rclcpp_action::ResultCode::ABORTED ||
                   status == rclcpp_action::ResultCode::CANCELED) {
            std::cout << "Navigation failed!" << std::endl;
            return NodeStatus::FAILURE;
        }

        // Still navigating
        std::cout << "Navigation in progress..." << std::endl;
        return NodeStatus::RUNNING;
    }

    // Called if node is halted (e.g., timeout, parent failure)
    void onHalted() override {
        std::cout << "Navigation halted, canceling goal..." << std::endl;

        // Cancel navigation
        nav_client_->async_cancel_goal(goal_handle_);

        // Wait for cancellation
        nav_client_->wait_for_result(goal_handle_, std::chrono::seconds(1));
    }

private:
    rclcpp_action::Client<nav2_msgs::action::NavigateToPose>::SharedPtr nav_client_;
    GoalHandle goal_handle_;
};
```

---

**Execution Flow:**

```
Tick 1:
  onStart() called
  → Send navigation goal
  → Return RUNNING

Tick 2-99:
  onRunning() called
  → Check if done
  → Still navigating
  → Return RUNNING

Tick 100:
  onRunning() called
  → Navigation complete!
  → Return SUCCESS
```

---

**Halting:**

**Scenario: Timeout**

```xml
<Timeout seconds="5">
  <AsyncNavigate goal="{target}"/>
</Timeout>
```

**Execution:**

```
t=0s:  onStart() → send goal → RUNNING
t=1s:  onRunning() → still going → RUNNING
t=2s:  onRunning() → still going → RUNNING
...
t=5s:  Timeout! → onHalted() called
       → Cancel navigation
       → Timeout returns FAILURE
```

---

**Why onHalted() is Critical:**

**Without onHalted():**

```cpp
class BadAsyncNavigate : public StatefulActionNode {
    NodeStatus onStart() override {
        nav_client_->send_goal(goal_);
        return NodeStatus::RUNNING;
    }

    NodeStatus onRunning() override {
        if (is_done()) return NodeStatus::SUCCESS;
        return NodeStatus::RUNNING;
    }

    // ❌ Missing onHalted()!
};
```

**Problem:**

```
Timeout halts node
→ onHalted() not implemented
→ Navigation goal NOT canceled
→ Robot keeps moving even though BT moved on!
```

**With onHalted():**

```cpp
void onHalted() override {
    nav_client_->cancel_goal();  // ✅ Stop robot!
}
```

---

**Best Practices:**

**1. Always Implement onHalted():**

```cpp
void onHalted() override {
    // Cancel ongoing operations
    // Release resources
    // Clean up state
}
```

**2. Check for Interruption in onRunning():**

```cpp
NodeStatus onRunning() override {
    // Check if halted externally (optional but safer)
    if (isHaltRequested()) {
        return NodeStatus::FAILURE;
    }

    // Normal logic
    if (is_done()) return NodeStatus::SUCCESS;
    return NodeStatus::RUNNING;
}
```

**3. Timeout Long Operations:**

```xml
<Timeout seconds="30">
  <AsyncNavigate goal="{target}"/>
</Timeout>
```

**4. Use Retry for Unreliable Operations:**

```xml
<Retry num_attempts="3">
  <AsyncNavigate goal="{target}"/>
</Retry>
```

---

**Synchronous vs Asynchronous:**

| Aspect | Synchronous | Asynchronous |
|--------|-------------|--------------|
| **Completion** | Within one tick | Multiple ticks |
| **Base Class** | `SyncActionNode` | `StatefulActionNode` |
| **tick()** | Single `tick()` | `onStart()` + `onRunning()` |
| **Halting** | N/A | Implement `onHalted()` |
| **Use Case** | Quick operations (< 100ms) | Long operations (> 100ms) |
| **Examples** | Check condition, simple math | Navigation, manipulation, download |

---

**Interview Insight:**
Long-running actions use StatefulActionNode with onStart() (initialize), onRunning() (check progress), onHalted() (cleanup). Return RUNNING until complete. CRITICAL: Implement onHalted() to cancel/cleanup when interrupted. Use Timeout decorator to prevent hanging.

---

### Q5: How would you debug a Behavior Tree that's not working as expected?

**Difficulty:** ⭐⭐⭐⭐ (Hard)

**Answer:**

Debugging BTs requires systematic inspection of tree execution and node states.

---

**Step 1: Enable Console Logging**

**BehaviorTree.CPP built-in logger:**

```cpp
#include "behaviortree_cpp_v3/loggers/bt_cout_logger.h"

// Create tree
auto tree = factory.createTreeFromFile("tree.xml");

// Enable logging
StdCoutLogger logger_cout(tree);

// Execute
tree.tickRoot();
```

**Output:**

```
[Sequence] -> RUNNING
  [CheckBattery] -> SUCCESS
  [Navigate] -> RUNNING
    [ComputePath] -> SUCCESS
    [FollowPath] -> RUNNING
```

Shows which nodes are executing and their return values.

---

**Step 2: Use Groot for Visual Debugging**

**Groot** provides real-time BT visualization.

**Setup:**

```cpp
#include "behaviortree_cpp_v3/loggers/bt_zmq_publisher.h"

// Create tree
auto tree = factory.createTreeFromFile("tree.xml");

// Enable Groot monitoring
PublisherZMQ publisher_zmq(tree);

// Execute
while (running) {
    tree.tickRoot();
    sleep(100ms);
}
```

**Launch Groot:**

```bash
groot
# Connect to: localhost:1666
```

**Visualization:**

```
Green:  SUCCESS
Red:    FAILURE
Yellow: RUNNING
Gray:   Not ticked yet
```

Real-time tree execution with color-coded node states!

---

**Step 3: Inspect Blackboard**

**Print blackboard contents:**

```cpp
auto blackboard = tree.rootBlackboard();

// Print all entries
blackboard->debugMessage();

// Or get specific value
auto goal = blackboard->get<Pose>("target_pose");
std::cout << "Target: " << goal << std::endl;
```

**In Groot:**

Click node → View input/output ports → See blackboard values.

---

**Step 4: Add Debug Nodes**

**Custom debug action:**

```cpp
class DebugPrint : public SyncActionNode {
public:
    static PortsList providedPorts() {
        return {InputPort<std::string>("message")};
    }

    NodeStatus tick() override {
        auto msg = getInput<std::string>("message").value();
        std::cout << "[DEBUG] " << msg << std::endl;
        return NodeStatus::SUCCESS;
    }
};
```

**Use in tree:**

```xml
<Sequence>
  <DebugPrint message="Starting navigation"/>
  <Navigate goal="{target}"/>
  <DebugPrint message="Navigation complete"/>
</Sequence>
```

---

**Step 5: Log Node Execution**

**Override tick() in custom nodes:**

```cpp
class MyAction : public SyncActionNode {
    NodeStatus tick() override {
        RCLCPP_INFO(logger_, "MyAction: Starting");

        // Do work
        bool success = doWork();

        if (success) {
            RCLCPP_INFO(logger_, "MyAction: SUCCESS");
            return NodeStatus::SUCCESS;
        } else {
            RCLCPP_ERROR(logger_, "MyAction: FAILURE");
            return NodeStatus::FAILURE;
        }
    }
};
```

---

**Step 6: Check Tick Frequency**

**Monitor tick rate:**

```cpp
auto start_time = std::chrono::steady_clock::now();
int tick_count = 0;

while (running) {
    tree.tickRoot();
    tick_count++;

    auto now = std::chrono::steady_clock::now();
    auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(now - start_time);

    if (elapsed.count() >= 1) {
        std::cout << "Tick rate: " << tick_count << " Hz" << std::endl;
        tick_count = 0;
        start_time = now;
    }

    sleep(100ms);
}
```

**Problem:** If tick rate too slow → tree appears unresponsive.

---

**Step 7: Validate XML Syntax**

**Common XML errors:**

```xml
<!-- ❌ Bad: Missing closing tag -->
<Sequence>
  <Navigate/>

<!-- ❌ Bad: Typo in node name -->
<Navigat goal="{target}"/>

<!-- ❌ Bad: Missing required port -->
<Navigate/>  <!-- Needs goal port! -->

<!-- ✅ Good -->
<Sequence>
  <Navigate goal="{target}"/>
</Sequence>
```

**Validation:**

```cpp
try {
    auto tree = factory.createTreeFromFile("tree.xml");
} catch (BT::RuntimeError& e) {
    std::cerr << "XML Error: " << e.what() << std::endl;
}
```

---

**Step 8: Test Nodes in Isolation**

**Unit test individual nodes:**

```cpp
TEST(NavigateTest, Success) {
    BehaviorTreeFactory factory;
    factory.registerNodeType<Navigate>("Navigate");

    // Create simple tree with just this node
    auto tree = factory.createTreeFromText(R"(
        <root>
          <BehaviorTree>
            <Navigate goal="1.0,2.0,0.0"/>
          </BehaviorTree>
        </root>
    )");

    auto status = tree.tickRoot();

    EXPECT_EQ(status, NodeStatus::SUCCESS);
}
```

**If fails in isolation → bug in node implementation**
**If works in isolation → bug in tree composition**

---

**Step 9: Common Issues Checklist**

| Symptom | Likely Cause | Solution |
|---------|--------------|----------|
| Node never ticked | Parent returns early (FAILURE/SUCCESS) | Check parent logic |
| Always returns RUNNING | Async action never completes | Check onRunning() logic |
| Blackboard value wrong | Multiple nodes writing to same key | Use different keys |
| Tree hangs | Infinite loop (no SUCCESS/FAILURE) | Add Timeout decorator |
| Unexpected FAILURE | Missing port, getInput() fails | Check required ports |
| Node not found | Not registered in factory | Call registerNodeType() |
| Halted but action continues | onHalted() not implemented | Implement onHalted() |

---

**Debugging Workflow:**

```
1. Reproduce issue
2. Enable StdCoutLogger
3. Identify which node failing
4. Use Groot to visualize execution
5. Check blackboard values
6. Add debug prints in node
7. Test node in isolation
8. Fix bug
9. Re-test
```

---

**Interview Insight:**
Debug BTs with: StdCoutLogger (console output), Groot (visual debugging), blackboard inspection, debug nodes, logging in custom nodes, tick frequency monitoring, XML validation, and unit testing nodes in isolation. Check common issues: missing ports, unimplemented onHalted(), blackboard races.

---

## PRACTICE_TASKS

### Task 1: Build Basic Behavior Tree

**Goal:** Create simple BT with Sequence and Fallback.

**Requirements:**
- Create 3 action nodes: CheckBattery, ChargeBattery, Navigate
- Tree: If battery low → charge, then navigate
- Use XML definition
- Execute and log results

**Test:**
```bash
ros2 run my_pkg simple_bt
# Output: Battery checked, navigation started
```

---

### Task 2: Implement Async Action

**Goal:** Create long-running async action.

**Requirements:**
- Create AsyncNavigate node (takes 5 seconds)
- Use StatefulActionNode
- Implement onStart(), onRunning(), onHalted()
- Test with Timeout decorator (3 seconds)
- Verify halting cancels navigation

---

### Task 3: Use Blackboard for Data Flow

**Goal:** Pass data between nodes via blackboard.

**Requirements:**
- DetectObject writes position to blackboard
- NavigateToObject reads position from blackboard
- PickObject reads object ID from blackboard
- Print blackboard contents at each step

---

### Task 4: Visualize with Groot

**Goal:** Debug BT using Groot.

**Requirements:**
- Create complex tree (Sequence + Fallback + Retry)
- Enable Groot publishing
- Launch Groot, connect to tree
- Execute tree, observe real-time visualization
- Identify and fix a deliberately introduced bug

---

## QUICK_REFERENCE

### Node Types

```cpp
// Sync Action (instant)
class MyAction : public SyncActionNode {
    NodeStatus tick() override;
};

// Async Action (multi-tick)
class MyAsyncAction : public StatefulActionNode {
    NodeStatus onStart() override;
    NodeStatus onRunning() override;
    void onHalted() override;
};

// Condition (check)
class MyCondition : public ConditionNode {
    NodeStatus tick() override;
};
```

### Control Flow Nodes

```xml
<!-- Sequence: All must succeed -->
<Sequence>
  <Action1/>
  <Action2/>
</Sequence>

<!-- Fallback: One must succeed -->
<Fallback>
  <Option1/>
  <Option2/>
</Fallback>

<!-- Parallel: Concurrent execution -->
<Parallel success_threshold="2">
  <Task1/>
  <Task2/>
</Parallel>
```

### Decorators

```xml
<!-- Retry up to 3 times -->
<Retry num_attempts="3">
  <Action/>
</Retry>

<!-- Timeout after 5 seconds -->
<Timeout seconds="5">
  <Action/>
</Timeout>

<!-- Invert result -->
<Inverter>
  <Condition/>
</Inverter>

<!-- Force success -->
<ForceSuccess>
  <Action/>
</ForceSuccess>
```

### Blackboard

```cpp
// Declare ports
static PortsList providedPorts() {
    return {
        InputPort<int>("input"),
        OutputPort<int>("output")
    };
}

// Read from blackboard
auto value = getInput<int>("input");

// Write to blackboard
setOutput("output", 42);
```

### Factory & Execution

```cpp
BehaviorTreeFactory factory;
factory.registerNodeType<MyNode>("MyNode");

auto tree = factory.createTreeFromFile("tree.xml");

while (running) {
    auto status = tree.tickRoot();
    if (status != NodeStatus::RUNNING) break;
    sleep(100ms);
}
```

### Groot Monitoring

```cpp
#include "behaviortree_cpp_v3/loggers/bt_zmq_publisher.h"

PublisherZMQ publisher_zmq(tree);

# Launch Groot
groot
```

---

**END OF TOPIC 6.4: Behavior Trees (BehaviorTree.CPP)**
