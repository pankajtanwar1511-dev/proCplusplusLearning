# Chapter 5: Robotics Applications
## Topic 5.1: Navigation & Nav2 Stack

---

## THEORY

### 1. Nav2 Architecture Overview

**What is Nav2?**

Nav2 (Navigation2) is the ROS2 navigation stack - a complete system for autonomous mobile robot navigation. It handles:
- Path planning (global & local)
- Obstacle avoidance
- Map representation (costmaps)
- Localization integration
- Recovery behaviors
- Goal handling

**Nav2 vs Nav1 (ROS1):**

| Aspect | Nav1 (ROS1) | Nav2 (ROS2) |
|--------|-------------|-------------|
| **Architecture** | Monolithic | Modular plugins |
| **Behavior** | Hard-coded recoveries | Behavior Trees |
| **Lifecycle** | No lifecycle management | Lifecycle nodes |
| **Planners** | Fixed (DWA, etc.) | Pluggable planners |
| **Performance** | Single-threaded | Multi-threaded |

---

### 2. Nav2 Core Components

**Navigation Pipeline:**

```
Goal → Behavior Tree → Global Planner → Local Planner → Controller → Robot
         ↓                    ↓                ↓              ↓
    Recoveries          Global Costmap   Local Costmap   Velocity Cmd
```

**Key Components:**

**A. Behavior Tree Navigator (`bt_navigator`)**
- Orchestrates navigation behaviors
- Handles goal execution
- Manages recovery behaviors
- Configurable via XML

**B. Planner Server (`planner_server`)**
- Computes global path from start to goal
- Uses global costmap
- Plugins: NavFn, Smac, ThetaStar
- Runs when new goal received or replanning triggered

**C. Controller Server (`controller_server`)**
- Follows global path
- Generates velocity commands
- Uses local costmap for obstacle avoidance
- Plugins: DWB, TEB, Regulated Pure Pursuit, MPPI

**D. Costmap 2D**
- Represents environment for planning
- Two instances: global and local
- Layers: static map, obstacles, inflation
- Updates from sensor data

**E. Recoveries Server (`recoveries_server`)**
- Recovery behaviors when stuck
- Actions: spin, backup, wait, clear costmap
- Triggered by behavior tree

**F. Waypoint Follower (`waypoint_follower`)**
- Follows sequence of waypoints
- Executes tasks at waypoints
- Useful for patrol routes

**G. Smoother Server (`smoother_server`)**
- Post-processes global path
- Smooths sharp turns
- Makes path more followable

---

### 3. Global Path Planning

**Purpose:**
Compute collision-free path from start to goal using global map.

**Common Algorithms:**

**A. NavFn (Navigation Function)**
- Dijkstra-based planner
- Guaranteed to find path if exists
- Fast, reliable
- No path smoothing (creates grid-aligned paths)

**B. Smac Planner (State Lattice)**
- Hybrid A* algorithm
- Considers robot kinematics
- Smooth, drivable paths
- Types:
  - **Smac2D**: Holonomic robots
  - **SmacHybrid**: Non-holonomic (car-like)
  - **SmacLattice**: Complex kinematics

**C. Theta* Planner**
- Any-angle planner
- Smoother than grid-based
- Line-of-sight optimization

**Algorithm Comparison:**

| Planner | Speed | Path Quality | Kinematics | Use Case |
|---------|-------|--------------|------------|----------|
| **NavFn** | ⚡⚡⚡ Fast | ⭐⭐ Grid-like | ❌ None | Simple robots, fast planning |
| **Smac2D** | ⚡⚡ Medium | ⭐⭐⭐ Smooth | ❌ Holonomic | Omnidirectional robots |
| **SmacHybrid** | ⚡ Slow | ⭐⭐⭐⭐ Excellent | ✅ Car-like | Ackermann steering |
| **Theta*** | ⚡⚡ Medium | ⭐⭐⭐ Smooth | ❌ None | Open spaces |

---

### 4. Local Planning / Control

**Purpose:**
Follow global path while avoiding dynamic obstacles and generating velocity commands.

**Common Controllers:**

**A. DWB (Dynamic Window Approach)**
- Samples velocity space (v, ω)
- Evaluates trajectories with cost functions
- Chooses best trajectory
- Good for differential drive robots

**Cost Functions:**
```
Total Cost = w1×Path_Alignment + w2×Goal_Distance + w3×Obstacle_Distance + w4×Speed
```

**B. TEB (Timed Elastic Band)**
- Optimizes path and velocity profile together
- Considers robot dynamics
- Better for complex kinematic robots
- Higher computational cost

**C. Regulated Pure Pursuit (RPP)**
- Lookahead-based controller
- Simple, fast, smooth
- Regulates speed based on curvature and obstacles
- Good for car-like robots

**D. MPPI (Model Predictive Path Integral)**
- Advanced predictive controller
- Considers robot dynamics model
- Best obstacle avoidance
- High computational cost (GPU recommended)

**Controller Selection Guide:**

```
Differential Drive Robot (simple) → DWB
Differential Drive (smooth motion) → Regulated Pure Pursuit
Ackermann Steering → Regulated Pure Pursuit or MPPI
Omnidirectional → DWB
High-speed outdoor → MPPI
Narrow spaces → DWB or TEB
```

---

### 5. Costmaps

**What is a Costmap?**

2D grid representing environment cost (0-255):
- **0**: Free space (no obstacles)
- **1-127**: Low cost (prefer to avoid)
- **128-252**: High cost (avoid)
- **253**: Inscribed (robot's footprint touches obstacle)
- **254**: Lethal (collision)
- **255**: Unknown

**Global vs Local Costmap:**

| Aspect | Global Costmap | Local Costmap |
|--------|----------------|---------------|
| **Size** | Large (entire map) | Small (around robot) |
| **Updates** | Infrequent | Frequent (real-time) |
| **Purpose** | Global path planning | Local obstacle avoidance |
| **Rolling** | No (fixed to map) | Yes (follows robot) |
| **Example Size** | 50m × 50m | 5m × 5m |

**Costmap Layers:**

```
Final Costmap = max(Static Layer, Obstacle Layer, Inflation Layer, Voxel Layer, ...)
```

**1. Static Layer:**
- From static map (map_server)
- Walls, fixed obstacles
- Loaded at startup

**2. Obstacle Layer:**
- From sensors (lidar, depth cameras)
- Dynamic obstacles
- Marking & clearing

**3. Inflation Layer:**
- Inflates obstacles by robot radius
- Creates cost gradient around obstacles
- Prevents robot from getting too close

**4. Voxel Layer:**
- 3D obstacle representation
- Handles overhangs, 3D sensors
- More accurate than 2D

**Inflation Example:**

```
Obstacle: ■

After Inflation (robot radius = 2 cells):
    1 2 3 2 1
    2 3 ■ 3 2
    1 2 3 2 1

Legend:
■ = 254 (lethal)
3 = 253 (inscribed)
2 = 128 (high cost)
1 = 50 (low cost)
```

---

### 6. Behavior Trees in Nav2

**Why Behavior Trees?**

Navigation requires complex decision-making:
- Try to reach goal
- If blocked → replan
- If still blocked → recovery behaviors
- If recovery fails → different recovery
- If all fail → report failure

**Traditional Approach (Hard-coded):**
```cpp
if (goal_blocked) {
    replan();
    if (still_blocked) {
        spin();
        if (still_blocked) {
            backup();
            ...
        }
    }
}
// Rigid, hard to modify
```

**Behavior Tree Approach:**
- Modular, composable behaviors
- Easy to modify via XML
- Reusable components
- Visual representation

**Basic Behavior Tree Nodes:**

| Node Type | Symbol | Description | Example |
|-----------|--------|-------------|---------|
| **Sequence** | `→` | Execute children left-to-right, stop on failure | Plan → Execute → Check |
| **Fallback** | `?` | Try children until one succeeds | Try_Plan ? Recovery |
| **Parallel** | `⇉` | Execute children concurrently | Drive ⇉ Monitor_Obstacles |
| **Decorator** | `⟳` | Modify child behavior | Retry(Plan, 3 times) |

**Simple Nav2 Behavior Tree:**

```
Fallback
├─ Sequence
│   ├─ ComputePathToPose
│   ├─ FollowPath
│   └─ GoalReached
└─ RecoveryFallback
    ├─ ClearCostmap
    ├─ Spin
    ├─ Backup
    └─ Wait
```

**Explanation:**
1. Try sequence: compute path → follow → check goal
2. If any fails, try recovery behaviors in order
3. If all recoveries fail, report failure

---

### 7. Navigation Workflow

**Complete Navigation Flow:**

```
1. Goal Received
   ↓
2. Behavior Tree Starts
   ↓
3. Global Planner: Compute Path
   - Uses global costmap
   - A*/Dijkstra/Hybrid A*
   - Returns waypoints
   ↓
4. Controller: Follow Path
   - Uses local costmap
   - Generates velocity commands (cmd_vel)
   - Avoids dynamic obstacles
   ↓
5. Success?
   ├─ Yes → Goal Reached ✓
   └─ No → Recovery Behaviors
       ├─ Replan path
       ├─ Clear costmap
       ├─ Spin in place
       ├─ Backup
       └─ Wait
```

**Key Topics:**

- **/cmd_vel**: Velocity commands to robot
- **/odom**: Robot odometry (for controller)
- **/scan** or **/camera/depth**: Sensor data (for costmaps)
- **/map**: Static map (for global costmap)
- **/tf**: Transforms (map→odom→base_link)

**Parameters to Tune:**

| Parameter | Component | Effect |
|-----------|-----------|--------|
| `max_vel_x` | Controller | Maximum forward speed |
| `max_vel_theta` | Controller | Maximum rotation speed |
| `xy_goal_tolerance` | Controller | How close to goal (meters) |
| `yaw_goal_tolerance` | Controller | Goal orientation tolerance (radians) |
| `footprint` | Costmap | Robot size/shape |
| `inflation_radius` | Inflation Layer | Safety margin around obstacles |
| `cost_scaling_factor` | Inflation Layer | How quickly cost increases |
| `update_frequency` | Costmap | How often to update (Hz) |

---

## EDGE_CASES

### Edge Case 1: Robot Stuck in Local Minimum

**Scenario:**
Robot gets stuck in U-shaped obstacle. Local planner can't see way out (local minima problem).

**Code/Situation:**
```
Global path goes through narrow U-shape:

    ╔═══════╗
    ║ Robot║
    ║   ↑  ║
    ║      ║
    ╚══════╝

Robot tries to go forward (following global path) but blocked on 3 sides.
Local planner only sees local costmap → all forward velocities have high cost.
```

**Why:**
- Local planner has limited horizon (e.g., 3m × 3m)
- Can't see that backing up would help
- Gradient-based controller follows local gradient (stuck)

**Solution 1 - Enable Oscillation Detection:**

```yaml
# controller_server.yaml
controller_server:
  ros__parameters:
    FollowPath:
      plugin: "dwb_core::DWBLocalPlanner"
      prune_plan: true
      prune_distance: 1.5  # Prune global path behind robot

      # Oscillation detection
      oscillation_reset_dist: 0.05  # Reset if moved > 5cm
      oscillation_timeout: 10.0     # Stuck if oscillating > 10s
```

**Solution 2 - Recovery Behaviors:**

Behavior tree with backup recovery:

```xml
<RecoveryNode number_of_retries="3">
  <Sequence>
    <ComputePathToPose/>
    <FollowPath/>
  </Sequence>
  <RecoveryFallback>
    <ClearCostmap name="clear_global"/>
    <Spin/>
    <Backup backup_dist="0.5" backup_speed="0.1"/>
  </RecoveryFallback>
</RecoveryNode>
```

**Solution 3 - Increase Local Costmap Size:**

```yaml
local_costmap:
  ros__parameters:
    width: 5  # Increase from 3m to 5m
    height: 5
```

**Interview Insight:**
Local minima occur when local planner horizon is too small. Use recovery behaviors (backup, clear costmap) and oscillation detection.

---

### Edge Case 2: Path Through Narrow Doorway

**Scenario:**
Robot navigates through doorway narrower than inflation radius → inflated obstacle blocks entire doorway.

**Visualization:**
```
Real doorway:
║   ║
║   ║  (1.0m wide, robot is 0.8m)

After inflation (radius=0.3m):
║███║  (Completely blocked!)
```

**Why:**
- Inflation layer adds safety margin
- `inflation_radius = robot_radius + safety_margin`
- Narrow spaces become impassable

**Solution 1 - Reduce Inflation Radius:**

```yaml
global_costmap:
  ros__parameters:
    inflation_layer:
      plugin: "nav2_costmap_2d::InflationLayer"
      inflation_radius: 0.45  # Reduce from 0.55
      cost_scaling_factor: 3.0
```

**Solution 2 - Use Costmap Filters:**

Allow lower cost in known narrow areas:

```yaml
global_costmap:
  ros__parameters:
    filters:
      - name: "keepout_filter"
        type: "nav2_costmap_2d::KeepoutFilter"
        # Define zones where inflation is reduced
```

**Solution 3 - Smac Planner with Lattice:**

Use planner that considers robot size:

```yaml
planner_server:
  ros__parameters:
    planner_plugins: ["SmacLattice"]
    SmacLattice:
      plugin: "nav2_smac_planner::SmacPlannerLattice"
      minimum_turning_radius: 0.4  # Robot kinematics
      # Plans considering robot footprint
```

**Interview Insight:**
Inflation can block narrow passages. Reduce inflation radius, use costmap filters, or use kinematically-aware planners (Smac).

---

### Edge Case 3: Dynamic Obstacle Suddenly Appears

**Scenario:**
Person walks into robot's path while robot is following global plan.

**Timeline:**
```
t=0s:  Global path computed (no obstacles)
       Robot starts moving

t=2s:  Person enters path
       Local costmap detects obstacle
       Local planner tries to avoid

t=3s:  If avoidance impossible → controller fails
```

**Why:**
- Global path doesn't account for dynamic obstacles
- Local planner may not have time to react
- Safety requires immediate stop

**Solution 1 - Emergency Stop in Controller:**

```yaml
controller_server:
  ros__parameters:
    FollowPath:
      # DWB local planner
      max_vel_x: 0.5
      min_vel_x: -0.2  # Allow backing up

      # Emergency stop if obstacle too close
      critics: ["ObstacleFootprint", "GoalAlign", "PathAlign", "PathDist"]
      ObstacleFootprint:
        scale: 100.0  # High weight → prioritize obstacle avoidance
```

**Solution 2 - Costmap Update Frequency:**

```yaml
local_costmap:
  ros__parameters:
    update_frequency: 10.0  # Update at 10 Hz (fast response)
    publish_frequency: 5.0

    obstacle_layer:
      observation_sources: scan
      scan:
        sensor_frame: laser_link
        data_type: LaserScan
        topic: /scan
        marking: true
        clearing: true
        # Fast obstacle detection
        min_obstacle_height: 0.0
        max_obstacle_height: 2.0
```

**Solution 3 - Dynamic Replanning:**

Enable frequent path replanning:

```yaml
planner_server:
  ros__parameters:
    expected_planner_frequency: 1.0  # Replan every 1s

controller_server:
  ros__parameters:
    controller_frequency: 20.0  # Control loop at 20 Hz
```

**Interview Insight:**
Dynamic obstacles require fast local costmap updates (10+ Hz), high obstacle avoidance weight in controller, and frequent replanning (1-2 Hz).

---

### Edge Case 4: Robot Drifts from Global Path

**Scenario:**
Robot has wheel slip, odometry drifts, or disturbances push robot off path. Global path no longer aligns with robot's actual position.

**Situation:**
```
Global path: ─────────────>

Robot actual:    ╔═╗
                 ║R║  (drifted 0.5m off path)
                 ╚═╝

Odometry thinks robot is on path, but it's not!
```

**Why:**
- Odometry drift (wheel slip, bumps)
- Localization jumps (AMCL correction)
- External forces (pushing robot)

**Solution 1 - Path Pruning:**

Controller only follows path ahead, ignores passed waypoints:

```yaml
controller_server:
  ros__parameters:
    FollowPath:
      prune_plan: true
      prune_distance: 1.5  # Remove waypoints behind robot within 1.5m
      transform_tolerance: 0.5  # Allow 0.5s TF lag
```

**Solution 2 - Replanning Trigger:**

Replan when robot strays too far from path:

```yaml
planner_server:
  ros__parameters:
    planner_plugins: ["GridBased"]
    GridBased:
      plugin: "nav2_navfn_planner/NavfnPlanner"

controller_server:
  ros__parameters:
    progress_checker_plugin: "progress_checker"
    progress_checker:
      plugin: "nav2_controller::SimpleProgressChecker"
      required_movement_radius: 0.5  # Must move 0.5m in time window
      movement_time_allowance: 10.0   # 10 seconds
```

If robot doesn't make progress → trigger replan.

**Solution 3 - Localization Integration:**

Use AMCL for drift correction:

```yaml
# amcl.yaml
amcl:
  ros__parameters:
    set_initial_pose: true
    initial_pose:
      x: 0.0
      y: 0.0
      z: 0.0
      yaw: 0.0

    # Drift correction
    update_min_d: 0.1  # Update if moved > 10cm
    update_min_a: 0.1  # Update if rotated > 0.1 rad
```

AMCL corrects `map→odom` transform, realigning robot to map.

**Interview Insight:**
Path drift is common due to odometry errors. Use path pruning, progress checkers triggering replanning, and localization (AMCL) to correct drift.

---

## CODE_EXAMPLES

### Example 1: Basic Navigation Python Client

**File: `nav_to_pose_client.py`**

```python
#!/usr/bin/env python3
import rclpy
from rclpy.node import Node
from rclpy.action import ActionClient
from nav2_msgs.action import NavigateToPose
from geometry_msgs.msg import PoseStamped
import math

class NavToPoseClient(Node):
    def __init__(self):
        super().__init__('nav_to_pose_client')

        # Action client for NavigateToPose
        self._action_client = ActionClient(self, NavigateToPose, 'navigate_to_pose')

        self.get_logger().info('Waiting for NavigateToPose action server...')
        self._action_client.wait_for_server()
        self.get_logger().info('Action server available!')

    def send_goal(self, x, y, yaw):
        """Send navigation goal to Nav2."""
        goal_msg = NavigateToPose.Goal()

        # Create pose
        goal_msg.pose.header.frame_id = 'map'
        goal_msg.pose.header.stamp = self.get_clock().now().to_msg()

        goal_msg.pose.pose.position.x = x
        goal_msg.pose.pose.position.y = y
        goal_msg.pose.pose.position.z = 0.0

        # Convert yaw to quaternion
        goal_msg.pose.pose.orientation.z = math.sin(yaw / 2.0)
        goal_msg.pose.pose.orientation.w = math.cos(yaw / 2.0)

        self.get_logger().info(f'Sending goal: x={x}, y={y}, yaw={yaw}')

        # Send goal with callbacks
        self._send_goal_future = self._action_client.send_goal_async(
            goal_msg,
            feedback_callback=self.feedback_callback
        )
        self._send_goal_future.add_done_callback(self.goal_response_callback)

    def goal_response_callback(self, future):
        """Called when action server accepts/rejects goal."""
        goal_handle = future.result()

        if not goal_handle.accepted:
            self.get_logger().error('Goal rejected!')
            return

        self.get_logger().info('Goal accepted! Navigating...')

        # Wait for result
        self._get_result_future = goal_handle.get_result_async()
        self._get_result_future.add_done_callback(self.get_result_callback)

    def feedback_callback(self, feedback_msg):
        """Called periodically during navigation."""
        feedback = feedback_msg.feedback

        # Log progress
        distance_remaining = feedback.distance_remaining
        self.get_logger().info(f'Distance remaining: {distance_remaining:.2f}m')

    def get_result_callback(self, future):
        """Called when navigation completes."""
        result = future.result().result

        # Result is empty for NavigateToPose
        self.get_logger().info('Navigation completed successfully!')

        # Optionally send another goal
        # self.send_goal(5.0, 5.0, 0.0)

def main(args=None):
    rclpy.init(args=args)

    client = NavToPoseClient()

    # Send goal: navigate to (3.0, 2.0) with yaw=1.57 (90 degrees)
    client.send_goal(3.0, 2.0, 1.57)

    # Spin until navigation completes
    rclpy.spin(client)

    client.destroy_node()
    rclpy.shutdown()

if __name__ == '__main__':
    main()
```

---

### Example 2: Waypoint Following

**File: `waypoint_follower_client.py`**

```python
#!/usr/bin/env python3
import rclpy
from rclpy.node import Node
from rclpy.action import ActionClient
from nav2_msgs.action import FollowWaypoints
from geometry_msgs.msg import PoseStamped
import math

class WaypointFollower(Node):
    def __init__(self):
        super().__init__('waypoint_follower')

        self._action_client = ActionClient(self, FollowWaypoints, 'follow_waypoints')
        self._action_client.wait_for_server()
        self.get_logger().info('Waypoint follower ready!')

    def follow_waypoints(self, waypoints):
        """
        waypoints: list of (x, y, yaw) tuples
        """
        goal_msg = FollowWaypoints.Goal()

        for x, y, yaw in waypoints:
            pose = PoseStamped()
            pose.header.frame_id = 'map'
            pose.header.stamp = self.get_clock().now().to_msg()

            pose.pose.position.x = x
            pose.pose.position.y = y
            pose.pose.position.z = 0.0

            pose.pose.orientation.z = math.sin(yaw / 2.0)
            pose.pose.orientation.w = math.cos(yaw / 2.0)

            goal_msg.poses.append(pose)

        self.get_logger().info(f'Following {len(waypoints)} waypoints...')

        self._send_goal_future = self._action_client.send_goal_async(
            goal_msg,
            feedback_callback=self.feedback_callback
        )
        self._send_goal_future.add_done_callback(self.goal_response_callback)

    def feedback_callback(self, feedback_msg):
        feedback = feedback_msg.feedback
        current = feedback.current_waypoint
        self.get_logger().info(f'Currently at waypoint {current}')

    def goal_response_callback(self, future):
        goal_handle = future.result()
        if not goal_handle.accepted:
            self.get_logger().error('Waypoints rejected!')
            return

        self._get_result_future = goal_handle.get_result_async()
        self._get_result_future.add_done_callback(self.result_callback)

    def result_callback(self, future):
        result = future.result().result
        missed = result.missed_waypoints

        if missed:
            self.get_logger().warn(f'Missed waypoints: {missed}')
        else:
            self.get_logger().info('All waypoints reached!')

def main(args=None):
    rclpy.init(args=args)

    follower = WaypointFollower()

    # Define patrol route (square)
    waypoints = [
        (2.0, 2.0, 0.0),      # Point 1
        (2.0, -2.0, -1.57),   # Point 2 (turn right)
        (-2.0, -2.0, 3.14),   # Point 3 (turn right)
        (-2.0, 2.0, 1.57),    # Point 4 (turn right)
        (0.0, 0.0, 0.0)       # Return to start
    ]

    follower.follow_waypoints(waypoints)

    rclpy.spin(follower)

    follower.destroy_node()
    rclpy.shutdown()

if __name__ == '__main__':
    main()
```

---

### Example 3: Custom Costmap Layer (Keep-Out Zones)

**File: `custom_keepout_layer.cpp`**

```cpp
#include "nav2_costmap_2d/layer.hpp"
#include "nav2_costmap_2d/layered_costmap.hpp"
#include "rclcpp/rclcpp.hpp"

namespace custom_costmap_layers
{

class KeepoutLayer : public nav2_costmap_2d::Layer
{
public:
    KeepoutLayer() = default;

    virtual void onInitialize() override
    {
        current_ = true;
        enabled_ = true;

        auto node = node_.lock();
        if (!node) {
            throw std::runtime_error("Failed to lock node");
        }

        // Declare parameters
        node->declare_parameter(name_ + ".keepout_zones", rclcpp::PARAMETER_STRING_ARRAY);

        // Get keepout zones
        // Format: "x,y,radius" for circular zones
        std::vector<std::string> zones =
            node->get_parameter(name_ + ".keepout_zones").as_string_array();

        for (const auto& zone_str : zones) {
            // Parse zone: "2.5,3.0,1.0" → x=2.5, y=3.0, radius=1.0
            std::stringstream ss(zone_str);
            std::string item;
            std::vector<double> values;

            while (std::getline(ss, item, ',')) {
                values.push_back(std::stod(item));
            }

            if (values.size() == 3) {
                KeepoutZone zone{values[0], values[1], values[2]};
                keepout_zones_.push_back(zone);

                RCLCPP_INFO(node->get_logger(),
                    "Added keepout zone: (%.2f, %.2f) radius %.2f",
                    zone.x, zone.y, zone.radius);
            }
        }
    }

    virtual void updateBounds(
        double /*robot_x*/, double /*robot_y*/, double /*robot_yaw*/,
        double* min_x, double* min_y, double* max_x, double* max_y) override
    {
        // Update bounds to cover all keepout zones
        for (const auto& zone : keepout_zones_) {
            *min_x = std::min(*min_x, zone.x - zone.radius);
            *min_y = std::min(*min_y, zone.y - zone.radius);
            *max_x = std::max(*max_x, zone.x + zone.radius);
            *max_y = std::max(*max_y, zone.y + zone.radius);
        }
    }

    virtual void updateCosts(
        nav2_costmap_2d::Costmap2D& master_grid,
        int min_i, int min_j, int max_i, int max_j) override
    {
        if (!enabled_) return;

        // Mark keepout zones as lethal
        for (int j = min_j; j < max_j; j++) {
            for (int i = min_i; i < max_i; i++) {
                // Get world coordinates
                double wx, wy;
                master_grid.mapToWorld(i, j, wx, wy);

                // Check if cell is inside any keepout zone
                for (const auto& zone : keepout_zones_) {
                    double dx = wx - zone.x;
                    double dy = wy - zone.y;
                    double dist = std::sqrt(dx*dx + dy*dy);

                    if (dist <= zone.radius) {
                        master_grid.setCost(i, j, nav2_costmap_2d::LETHAL_OBSTACLE);
                        break;
                    }
                }
            }
        }
    }

    virtual void reset() override {}

    virtual void onFootprintChanged() override {}

private:
    struct KeepoutZone {
        double x, y;      // Center position
        double radius;    // Zone radius
    };

    std::vector<KeepoutZone> keepout_zones_;
};

}  // namespace custom_costmap_layers

#include "pluginlib/class_list_macros.hpp"
PLUGINLIB_EXPORT_CLASS(custom_costmap_layers::KeepoutLayer, nav2_costmap_2d::Layer)
```

**Configuration (`keepout_layer.yaml`):**

```yaml
global_costmap:
  ros__parameters:
    plugins: ["static_layer", "obstacle_layer", "keepout_layer", "inflation_layer"]

    keepout_layer:
      plugin: "custom_costmap_layers::KeepoutLayer"
      enabled: true
      keepout_zones:
        - "5.0,5.0,1.5"    # Circle at (5,5) with radius 1.5m
        - "-3.0,2.0,1.0"   # Circle at (-3,2) with radius 1.0m
```

---

## INTERVIEW_QA

### Q1: What is the difference between global and local costmaps in Nav2?

**Difficulty:** ⭐⭐ (Easy)

**Answer:**

Global and local costmaps serve different purposes in the navigation pipeline:

**Global Costmap:**
- **Size**: Large, covers entire map or large area (e.g., 50m × 50m)
- **Purpose**: Used by global planner to compute long-range path
- **Updates**: Infrequent, slower (1-5 Hz typical)
- **Rolling**: Usually static (fixed to map frame)
- **Content**: Static map + known obstacles + inflation
- **Example**: Planning path from room A to room B

**Local Costmap:**
- **Size**: Small, centered on robot (e.g., 5m × 5m)
- **Purpose**: Used by local planner/controller for obstacle avoidance
- **Updates**: Frequent, fast (10-20 Hz typical)
- **Rolling**: Yes, follows robot
- **Content**: Recent sensor data + dynamic obstacles + inflation
- **Example**: Avoiding person who just walked into path

**Why Two Costmaps?**

Computational efficiency:
- Global planner doesn't need real-time sensor updates
- Local planner doesn't need entire map

Different update frequencies:
- Global planning is expensive (can be slower)
- Local control must be fast for safety

**Interview Insight:**
Two costmaps separate long-range planning (global) from real-time obstacle avoidance (local), optimizing both performance and safety.

---

### Q2: How does Nav2 handle recovery behaviors when navigation fails?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

Nav2 uses **Behavior Trees** to orchestrate navigation and recovery behaviors.

**Recovery Behavior Flow:**

```
Try Navigation
├─ Success → Goal Reached ✓
└─ Failure → Recovery Fallback
    ├─ 1. Clear Costmap (maybe stale obstacles)
    │   └─ Retry Navigation
    ├─ 2. Spin in Place (maybe better view of environment)
    │   └─ Retry Navigation
    ├─ 3. Backup (maybe stuck in corner)
    │   └─ Retry Navigation
    └─ 4. Wait (maybe obstacle will move)
        └─ Retry Navigation
```

**Common Recovery Behaviors:**

| Recovery | When Used | Action |
|----------|-----------|--------|
| **Clear Costmap** | Stale obstacle data | Clear obstacle layer, keep static map |
| **Spin** | Stuck, need better sensor view | Rotate 360° to update costmap |
| **Backup** | In corner/local minima | Reverse 0.3-0.5m |
| **Wait** | Dynamic obstacle blocking | Wait 5-10s for obstacle to clear |

**Behavior Tree XML Example:**

```xml
<BehaviorTree>
  <RecoveryNode number_of_retries="3">
    <Sequence>
      <ComputePathToPose goal="{goal}"/>
      <FollowPath path="{path}"/>
    </Sequence>
    <SequenceStar name="RecoveryFallback">
      <ClearEntireCostmap name="clear_global" service_name="global_costmap/clear_entirely_global_costmap"/>
      <ClearEntireCostmap name="clear_local" service_name="local_costmap/clear_entirely_local_costmap"/>
      <Spin spin_dist="1.57"/>
      <Wait wait_duration="5"/>
      <BackUp backup_dist="0.30" backup_speed="0.05"/>
    </SequenceStar>
  </RecoveryNode>
</BehaviorTree>
```

**Interview Insight:**
Nav2 recovery behaviors are modular and configurable via Behavior Trees. Typical sequence: clear costmap → spin → backup → wait. After each recovery, navigation is retried.

---

### Q3: What is the "local minima problem" and how does Nav2 address it?

**Difficulty:** ⭐⭐⭐⭐ (Hard)

**Answer:**

**Local Minima Problem:**

Gradient-based local planners follow cost gradient toward goal. But in certain obstacle configurations, robot can get stuck in a "local minimum" where all nearby moves increase cost, even though a global solution exists.

**Classic Example - U-Shaped Obstacle:**

```
Goal is above:
     ↑ G

╔═══════╗
║ Robot ║  ← Robot wants to go up (toward goal)
║   ↑   ║     but blocked on 3 sides
║       ║
╚═══════╝

All forward moves → collision
Left/right moves → collision
Backward move → increases distance to goal

Local planner stuck! (local minimum)
```

**Why It Happens:**

- Local planner has limited horizon (e.g., 3m × 3m local costmap)
- Only sees local obstacles, not global structure
- Gradient points toward goal, but path requires temporary "wrong" move (backup)
- Controller can't see that backing up would help

**Nav2 Solutions:**

**1. Oscillation Detection:**
```yaml
controller_server:
  ros__parameters:
    FollowPath:
      oscillation_reset_dist: 0.05
      oscillation_timeout: 10.0
```
Detects when robot oscillates without making progress → triggers recovery.

**2. Recovery Behaviors:**
- **Backup**: Explicitly move away from obstacle
- **Spin**: Get different sensor view, update costmap
- **Replan**: Compute new global path (may avoid U-shape)

**3. Increase Local Costmap Size:**
```yaml
local_costmap:
  width: 5  # Larger horizon → see more obstacles
  height: 5
```
Larger local costmap may reveal escape path.

**4. Use Global Path Context:**
Controllers like Regulated Pure Pursuit use global path for guidance, not just local cost gradient.

**5. Advanced Planners:**
Use model-predictive controllers (MPPI) or optimization-based planners (TEB) that consider future states and can plan "backward" moves.

**Interview Insight:**
Local minima occur when local planner horizon is too small. Nav2 addresses with oscillation detection, recovery behaviors (especially backup), larger local costmaps, and advanced controllers that use global path context.

---

### Q4: How does Nav2 integrate localization (AMCL) with navigation?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

Nav2 uses **TF2 transforms** to integrate localization seamlessly.

**Transform Chain:**

```
map → odom → base_link → sensors (laser_link, camera_link, etc.)
  ↑      ↑         ↑
  |      |         └─ Odometry publishes (odom → base_link)
  |      └─ AMCL publishes (map → odom)
  └─ Map frame (static)
```

**Who Publishes What:**

| Transform | Published By | Update Rate | Purpose |
|-----------|--------------|-------------|---------|
| **odom → base_link** | Odometry (wheel encoders, IMU) | 50-100 Hz | Short-term robot motion (smooth, continuous) |
| **map → odom** | AMCL (localization) | 1-10 Hz | Correction for odometry drift (jumps occasionally) |
| **base_link → sensors** | robot_state_publisher | 1 Hz (static) | Robot geometry |

**How AMCL Corrects Drift:**

```
Time t=0:
map → odom: (0, 0, 0)          [No drift yet]
odom → base_link: (1.0, 0, 0)  [Robot moved 1m forward]
Result: Robot at (1.0, 0, 0) in map ✓

Time t=10s: (odometry drifted 0.2m)
odom → base_link: (10.2, 0, 0)  [Odometry thinks 10.2m]
AMCL scan-matches, determines robot actually at (10.0, 0, 0) in map
AMCL updates: map → odom: (-0.2, 0, 0)  [Correction]

Result:
map → odom → base_link = (-0.2) + (10.2) = 10.0 ✓
```

**AMCL corrects odometry drift by adjusting `map → odom` transform.**

**Nav2 Usage:**

- **Global Planner**: Plans in `map` frame (uses `map → odom → base_link`)
- **Controller**: Follows path in `map` frame, generates cmd_vel in `base_link` frame
- **Costmaps**: Can use `map` or `odom` frame (configurable)

**Configuration:**

```yaml
global_costmap:
  ros__parameters:
    global_frame: map        # Uses AMCL-corrected position
    robot_base_frame: base_link

local_costmap:
  ros__parameters:
    global_frame: odom       # Uses smooth odometry (no AMCL jumps)
    robot_base_frame: base_link
```

**Why Local Costmap Uses `odom`:**

AMCL can cause sudden transform jumps when particles converge. Using `odom` for local costmap keeps sensor data consistent (no sudden shifts).

**Interview Insight:**
AMCL publishes `map → odom` transform to correct odometry drift. Nav2 plans in `map` frame (global) and often controls in `odom` frame (local) to avoid localization jumps affecting real-time control.

---

### Q5: What factors affect the choice between DWB and Regulated Pure Pursuit controllers?

**Difficulty:** ⭐⭐⭐⭐ (Hard)

**Answer:**

**DWB (Dynamic Window Approach):**

**How It Works:**
- Samples velocity space (linear v, angular ω)
- Simulates robot forward for each (v, ω) pair
- Evaluates trajectories with cost function
- Chooses lowest-cost trajectory

**Strengths:**
- Excellent obstacle avoidance (samples many trajectories)
- Handles narrow spaces well
- Works for differential drive and omnidirectional
- Considers robot dynamics (acceleration limits)

**Weaknesses:**
- Can produce jerky motion (switching between trajectories)
- High computational cost (many samples)
- Parameters difficult to tune (many cost function weights)

**Use Cases:**
- Indoor navigation with many obstacles
- Narrow doorways, corridors
- Dynamic environments (people, moving obstacles)
- Robots that can rotate in place

---

**Regulated Pure Pursuit (RPP):**

**How It Works:**
- Follows global path with lookahead point
- Computes curvature to reach lookahead
- Regulates speed based on curvature and obstacles
- Simple, geometric approach

**Strengths:**
- Smooth, natural motion (follows path closely)
- Low computational cost
- Easy to tune (few parameters)
- Good for outdoor, open spaces

**Weaknesses:**
- Less aggressive obstacle avoidance than DWB
- May struggle in very narrow spaces
- Better for car-like robots (Ackermann) than differential drive
- Requires good global path

**Use Cases:**
- Outdoor navigation (parking lots, sidewalks)
- Car-like robots (Ackermann steering)
- High-speed navigation (warehouses)
- Simple environments with few dynamic obstacles

---

**Decision Matrix:**

| Factor | Choose DWB | Choose RPP |
|--------|------------|------------|
| **Environment** | Cluttered, indoor | Open, outdoor |
| **Obstacles** | Many dynamic | Few, mostly static |
| **Space** | Narrow passages | Wide open areas |
| **Robot Type** | Differential drive | Ackermann steering |
| **Speed** | Low-medium (< 1 m/s) | Medium-high (1-3 m/s) |
| **Motion Preference** | Precise, can be jerky | Smooth, natural |
| **Computation** | More powerful CPU | Embedded systems OK |

**Hybrid Approach:**

Some systems use both:
```yaml
controller_server:
  ros__parameters:
    controller_plugins: ["RPP", "DWB"]

    # Use RPP by default (smooth, fast)
    RPP:
      plugin: "nav2_regulated_pure_pursuit_controller::RegulatedPurePursuitController"

    # Switch to DWB in dense obstacles (behavior tree decision)
    DWB:
      plugin: "dwb_core::DWBLocalPlanner"
```

**Interview Insight:**
DWB excels in cluttered environments with dynamic obstacles (indoor, differential drive). RPP is better for smooth, high-speed navigation in open spaces (outdoor, Ackermann). Choice depends on environment, robot type, and motion preferences.

---

## PRACTICE_TASKS

### Task 1: Setup Basic Nav2 Navigation

**Goal:** Get Nav2 running with simulated robot.

**Steps:**
1. Install Nav2: `sudo apt install ros-humble-navigation2 ros-humble-nav2-bringup`
2. Install TurtleBot3 simulation: `sudo apt install ros-humble-turtlebot3*`
3. Export robot model: `export TURTLEBOT3_MODEL=waffle`
4. Launch simulation: `ros2 launch turtlebot3_gazebo turtlebot3_world.launch.py`
5. Launch Nav2: `ros2 launch nav2_bringup bringup_launch.py use_sim_time:=True`
6. Set initial pose in RViz (2D Pose Estimate)
7. Send navigation goal (2D Nav Goal)

**Verify:**
- Robot navigates to goal autonomously
- Avoids obstacles in environment
- Visualize costmaps, global path, local plan in RViz

---

### Task 2: Create Waypoint Patrol Route

**Goal:** Make robot patrol a square route continuously.

**Requirements:**
- Define 4 waypoints forming a square
- Use `FollowWaypoints` action
- Robot should continuously loop through waypoints
- Log when each waypoint is reached

**Bonus:**
- Add action at each waypoint (e.g., take photo, wait 5s)
- Handle missed waypoints gracefully

---

### Task 3: Tune Controller for Narrow Doorway

**Goal:** Optimize parameters for navigating through 1.2m wide doorway (robot width: 0.8m).

**Tasks:**
1. Reduce inflation radius to allow passage
2. Tune controller to slow down near doorway
3. Add behavior tree recovery if robot gets stuck
4. Test with dynamic obstacles (person walking through)

**Parameters to Tune:**
- `inflation_radius`, `cost_scaling_factor`
- `max_vel_x` (reduce near obstacles)
- Recovery behaviors (backup distance, spin)

---

### Task 4: Implement Custom "Stop for People" Behavior

**Goal:** Create custom Nav2 plugin that detects people and stops robot.

**Requirements:**
- Create custom controller plugin
- Subscribe to person detection topic (e.g., from YOLOv8)
- If person detected within 2m ahead → stop robot
- Resume when person moves away
- Integrate with Nav2 controller server

**Bonus:**
- Add social navigation behaviors (pass on right, slow near people)

---

## QUICK_REFERENCE

### Nav2 Key Topics

```bash
# Navigation goals/actions
/navigate_to_pose        # Action: single goal
/follow_waypoints        # Action: multiple waypoints

# Planning/Control
/plan                    # Service: compute path
/cmd_vel                 # Topic: velocity commands (output)

# Costmaps
/global_costmap/costmap  # Global costmap
/local_costmap/costmap   # Local costmap

# Visualization
/plan                    # Global path
/local_plan              # Local trajectory
```

### Nav2 Launch Commands

```bash
# Full Nav2 stack
ros2 launch nav2_bringup bringup_launch.py

# With SLAM
ros2 launch nav2_bringup navigation_launch.py

# Localization only (AMCL)
ros2 launch nav2_bringup localization_launch.py

# RViz with Nav2 plugins
ros2 launch nav2_bringup rviz_launch.py
```

### Common Parameters

```yaml
# Controller
max_vel_x: 0.5              # Max forward speed (m/s)
max_vel_theta: 1.0          # Max rotation speed (rad/s)
xy_goal_tolerance: 0.1      # Goal position tolerance (m)
yaw_goal_tolerance: 0.1     # Goal orientation tolerance (rad)

# Costmap
width: 5                    # Costmap width (m)
height: 5                   # Costmap height (m)
resolution: 0.05            # Cell size (m)
update_frequency: 5.0       # Update rate (Hz)

# Inflation
inflation_radius: 0.55      # Inflate obstacles by this much (m)
cost_scaling_factor: 3.0    # How quickly cost decays
```

### Debugging Commands

```bash
# View costmaps
ros2 run nav2_costmap_2d nav2_costmap_2d_markers voxel_grid:=/local_costmap/voxel_grid visualization_marker:=/my_marker

# Check TF tree
ros2 run tf2_tools view_frames

# Echo navigation status
ros2 topic echo /navigate_to_pose/_action/feedback

# View planner output
ros2 topic echo /plan
```

---

**END OF TOPIC 5.1: Navigation & Nav2 Stack**
