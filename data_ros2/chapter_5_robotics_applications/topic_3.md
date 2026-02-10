# Chapter 5: Robotics Applications
## Topic 5.3: Robot Manipulation & MoveIt2

---

## THEORY

### 1. MoveIt2 Overview

**What is MoveIt2?**

MoveIt2 is ROS2's manipulation framework for:
- Motion planning
- Kinematics (forward/inverse)
- Collision detection
- Trajectory execution
- Grasp planning
- Perception integration

**MoveIt2 vs MoveIt (ROS1):**

| Feature | MoveIt (ROS1) | MoveIt2 |
|---------|---------------|---------|
| **Architecture** | Monolithic | Modular actions |
| **Lifecycle** | No lifecycle | Lifecycle nodes |
| **Real-time** | Limited | Real-time capable |
| **Parameters** | Parameter server | New parameter API |
| **Multi-robot** | Difficult | Native support |

---

### 2. Key Components

**A. Move Group**

Central node that coordinates:
- Planning
- Execution
- Collision checking
- Kinematics

Provides action interface: `/move_action`

**B. Planning Scene**

Represents world state:
- Robot configuration
- Obstacles (collision objects)
- Attached objects (grasped items)
- Octomap (3D occupancy)

**C. Motion Planners**

Algorithms to find collision-free path:
- **OMPL** (Open Motion Planning Library): RRT, RRT*, PRM
- **Pilz Industrial**: LIN, PTP, CIRC (deterministic, industrial)
- **CHOMP**: Optimization-based
- **STOMP**: Stochastic optimization

**D. Kinematics Solvers**

Inverse kinematics (IK):
- **KDL**: Kinematic chain solver
- **TracIK**: Faster, more reliable than KDL
- **BioIK**: Optimization-based, handles complex constraints
- **UR Kinematics**: Analytical (for Universal Robots)

**E. Controller Interface**

Executes planned trajectories:
- Sends joint positions/velocities to robot
- Monitors execution
- Handles preemption/errors

---

### 3. Robot Kinematics

**Forward Kinematics (FK):**

Given joint angles → compute end-effector pose.

```
Input: θ = [θ₁, θ₂, ..., θₙ] (joint angles)
Output: T = [x, y, z, roll, pitch, yaw] (end-effector pose)
```

**Example: 2-Link Planar Arm**

```
        Link 2 (L2)
           /
          / θ₂
         /_____ End-effector (x, y)
        /
Link 1 /
(L1)  / θ₁
     /
    O (origin)
```

**Forward Kinematics:**
```cpp
void forward_kinematics(double theta1, double theta2, double L1, double L2,
                        double& x, double& y) {
    x = L1 * cos(theta1) + L2 * cos(theta1 + theta2);
    y = L1 * sin(theta1) + L2 * sin(theta1 + theta2);
}

// Example:
// L1 = L2 = 1.0 m
// θ1 = 45°, θ2 = 30°
// x = 1.0 * cos(45°) + 1.0 * cos(75°) ≈ 0.97 m
// y = 1.0 * sin(45°) + 1.0 * sin(75°) ≈ 1.67 m
```

**Inverse Kinematics (IK):**

Given desired end-effector pose → compute joint angles.

```
Input: T = [x, y, z, roll, pitch, yaw]
Output: θ = [θ₁, θ₂, ..., θₙ] (joint angles)
```

**IK is harder than FK:**
- May have **multiple solutions**
- May have **no solution** (pose unreachable)
- Nonlinear equations (iterative solvers needed)

**Example: 2-Link Planar Arm IK**

```cpp
bool inverse_kinematics(double x, double y, double L1, double L2,
                        double& theta1, double& theta2) {
    // Check if reachable
    double distance = sqrt(x*x + y*y);
    if (distance > L1 + L2 || distance < abs(L1 - L2)) {
        return false;  // Unreachable
    }

    // Law of cosines for θ2
    double cos_theta2 = (x*x + y*y - L1*L1 - L2*L2) / (2 * L1 * L2);

    if (cos_theta2 < -1.0 || cos_theta2 > 1.0) {
        return false;
    }

    theta2 = acos(cos_theta2);  // Elbow-up solution

    // Solve for θ1
    double k1 = L1 + L2 * cos(theta2);
    double k2 = L2 * sin(theta2);
    theta1 = atan2(y, x) - atan2(k2, k1);

    return true;
}

// Note: Two solutions exist (elbow-up vs elbow-down)
// θ2_elbow_down = -θ2
```

---

### 4. Motion Planning Algorithms

**A. RRT (Rapidly-Exploring Random Tree)**

**How it works:**
1. Start from current configuration
2. Sample random configuration
3. Find nearest node in tree
4. Extend tree toward sample
5. Repeat until goal reached

**Characteristics:**
- Probabilistically complete (finds solution if exists)
- Fast (good for high-dimensional spaces)
- Paths are jagged (not smooth)

**Pseudo-code:**
```python
def RRT(start, goal, obstacles):
    tree = [start]

    while not reached(goal):
        # Sample random configuration
        rand_config = sample_random()

        # Find nearest node in tree
        nearest = find_nearest(tree, rand_config)

        # Extend toward sample
        new_config = extend(nearest, rand_config, step_size)

        # Check collision
        if not collides(new_config, obstacles):
            tree.append(new_config)

            if distance(new_config, goal) < threshold:
                return extract_path(tree, new_config)

    return None
```

**B. RRT* (Optimal RRT)**

Improves RRT by:
- Rewiring tree for shorter paths
- Asymptotically optimal
- Slower than RRT but better quality

**C. PRM (Probabilistic Roadmap)**

**How it works:**
1. Sample many random configurations
2. Connect nearby configurations (collision-free)
3. Build graph (roadmap)
4. Query: Find path in roadmap (Dijkstra/A*)

**Best for:**
- Multiple queries in same environment
- Pre-compute roadmap offline

**D. Pilz Industrial**

Deterministic planners for industrial robots:
- **PTP** (Point-to-Point): Joint space interpolation
- **LIN** (Linear): Straight line in Cartesian space
- **CIRC** (Circular): Arc motion

**Advantages:**
- Fast (deterministic)
- Predictable execution time
- Industry-standard motions

---

### 5. Collision Detection

**Planning Scene:**

MoveIt maintains collision world:
- Robot self-collision
- Robot ↔ environment
- Attached objects

**Collision Objects:**

```cpp
// Add box obstacle
moveit_msgs::msg::CollisionObject collision_object;
collision_object.header.frame_id = "world";
collision_object.id = "table";

shape_msgs::msg::SolidPrimitive primitive;
primitive.type = primitive.BOX;
primitive.dimensions = {1.0, 0.5, 0.02};  // 1m × 0.5m × 2cm

geometry_msgs::msg::Pose pose;
pose.position.x = 0.5;
pose.position.y = 0.0;
pose.position.z = 0.5;
pose.orientation.w = 1.0;

collision_object.primitives.push_back(primitive);
collision_object.primitive_poses.push_back(pose);
collision_object.operation = collision_object.ADD;

// Add to planning scene
planning_scene_interface.applyCollisionObject(collision_object);
```

**Allowed Collision Matrix (ACM):**

Disable collision checking between specified pairs:
```cpp
// Allow collision between gripper and object (when grasping)
moveit::planning_interface::PlanningSceneInterface psi;
moveit_msgs::msg::PlanningScene planning_scene;

collision_detection::AllowedCollisionMatrix acm;
acm.setEntry("gripper_link", "object", true);  // Allow collision
```

---

### 6. MoveIt2 Programming Interface

**A. Move Group Python Interface**

```python
import rclpy
from moveit_py import MoveGroupInterface

def move_to_pose():
    rclpy.init()
    node = rclpy.create_node('moveit_example')

    # Create move group interface
    move_group = MoveGroupInterface(node, "panda_arm")

    # Set target pose
    pose_goal = geometry_msgs.msg.Pose()
    pose_goal.position.x = 0.4
    pose_goal.position.y = 0.1
    pose_goal.position.z = 0.4
    pose_goal.orientation.w = 1.0

    move_group.set_pose_target(pose_goal)

    # Plan and execute
    success = move_group.go(wait=True)

    if success:
        print("Motion successful!")
    else:
        print("Motion failed!")

    move_group.stop()
    move_group.clear_pose_targets()
```

**B. Move Group C++ Interface**

```cpp
#include <moveit/move_group_interface/move_group_interface.h>

class MoveItDemo : public rclcpp::Node {
public:
    MoveItDemo() : Node("moveit_demo") {
        // Create move group
        move_group_ = std::make_shared<moveit::planning_interface::MoveGroupInterface>(
            shared_from_this(), "panda_arm");

        // Set planner
        move_group_->setPlannerId("RRTConnect");
        move_group_->setPlanningTime(5.0);

        // Set target pose
        geometry_msgs::msg::Pose target;
        target.position.x = 0.4;
        target.position.y = 0.1;
        target.position.z = 0.4;
        target.orientation.w = 1.0;

        move_group_->setPoseTarget(target);

        // Plan
        moveit::planning_interface::MoveGroupInterface::Plan plan;
        bool success = (move_group_->plan(plan) ==
                        moveit::core::MoveItErrorCode::SUCCESS);

        if (success) {
            RCLCPP_INFO(get_logger(), "Planning successful!");

            // Execute
            move_group_->execute(plan);
        } else {
            RCLCPP_ERROR(get_logger(), "Planning failed!");
        }
    }

private:
    std::shared_ptr<moveit::planning_interface::MoveGroupInterface> move_group_;
};
```

**C. Cartesian Path Planning**

Move in straight line (useful for pick-place):

```python
waypoints = []

# Current pose
wpose = move_group.get_current_pose().pose

# Move up 0.2m
wpose.position.z += 0.2
waypoints.append(copy.deepcopy(wpose))

# Move forward 0.3m
wpose.position.x += 0.3
waypoints.append(copy.deepcopy(wpose))

# Plan Cartesian path
(plan, fraction) = move_group.compute_cartesian_path(
    waypoints,
    0.01,  # 1cm interpolation step
    0.0)   # Jump threshold (0 = disabled)

if fraction == 1.0:
    print("100% of path planned!")
    move_group.execute(plan, wait=True)
else:
    print(f"Only {fraction*100:.1f}% planned (collision?)")
```

---

## EDGE_CASES

### Edge Case 1: IK Has No Solution (Unreachable Pose)

**Scenario:**
Command robot to move end-effector to pose outside workspace → IK solver fails.

**Example:**
```
Robot arm: reach = 1.0m
Target pose: x = 2.0m (too far!)

IK solver tries, fails to converge.
```

**Error:**
```cpp
move_group->setPoseTarget(unreachable_pose);
auto result = move_group->plan(plan);

// result == moveit::core::MoveItErrorCode::NO_IK_SOLUTION
```

**Why:**
- Pose outside workspace (too far/close)
- Orientation impossible (singularity)
- Joint limits prevent reaching
- IK solver timeout

**Solution 1: Check Workspace First**

```cpp
bool is_reachable(const geometry_msgs::msg::Pose& pose,
                  moveit::planning_interface::MoveGroupInterface& move_group) {

    // Try IK
    move_group.setPoseTarget(pose);

    robot_state::RobotState start_state(*move_group.getCurrentState());
    const robot_state::JointModelGroup* joint_model_group =
        start_state.getJointModelGroup(move_group.getName());

    std::vector<double> joint_values;
    bool found_ik = start_state.setFromIK(joint_model_group, pose, 0.1);  // 0.1s timeout

    return found_ik;
}

// Use before planning
if (is_reachable(target_pose, move_group)) {
    move_group.setPoseTarget(target_pose);
    move_group.plan(plan);
} else {
    RCLCPP_WARN(logger, "Pose unreachable, skipping");
}
```

**Solution 2: Relax Constraints**

```cpp
// Allow orientation tolerance
move_group.setGoalOrientationTolerance(0.1);  // 0.1 radians

// Allow position tolerance
move_group.setGoalPositionTolerance(0.01);  // 1cm

// Now IK may find approximate solution
```

**Solution 3: Fallback to Joint Space**

```cpp
// If Cartesian target fails, use joint target
std::vector<double> joint_values = {0.0, -0.785, 0.0, -2.356, 0.0, 1.571, 0.785};
move_group.setJointValueTarget(joint_values);
move_group.plan(plan);
```

**Interview Insight:**
IK can fail if pose is unreachable. Check workspace first, relax tolerances, or fallback to joint-space targets.

---

### Edge Case 2: Planning Succeeds But Execution Fails (Collisions in Real World)

**Scenario:**
Planner finds path in simulated world, but real robot collides with unmodeled obstacle.

**Why:**
- Obstacle not in planning scene
- Sensor noise/inaccuracy
- Object moved after planning
- Robot model mismatch (real vs URDF)

**Detection:**
```cpp
// Execute with monitoring
move_group.execute(plan);

// Check execution result
if (move_group.getLastExecutionStatus() != moveit::core::MoveItErrorCode::SUCCESS) {
    RCLCPP_ERROR(logger, "Execution failed (collision?)");
}
```

**Solution 1: Add Obstacles from Perception**

```cpp
// Subscribe to point cloud
#include <sensor_msgs/msg/point_cloud2.hpp>

void pointcloud_callback(const sensor_msgs::msg::PointCloud2::ConstSharedPtr& msg) {
    // Convert to octomap
    octomap::OcTree octree(0.01);  // 1cm resolution

    // ... convert point cloud to octomap ...

    // Add to planning scene
    moveit_msgs::msg::PlanningScene planning_scene;
    planning_scene.world.octomap.header = msg->header;
    planning_scene.world.octomap.octomap = ...;  // Serialized octree

    planning_scene_diff_publisher_->publish(planning_scene);
}
```

**Solution 2: Execution Monitoring**

```cpp
// Enable execution monitoring
move_group.setExecutionAllowedDurationScaling(2.0);  // Allow 2× expected time
move_group.setExecutionEarlyStoppingEnabled(true);   // Stop on unexpected forces

// Execute with error checking
auto result = move_group.execute(plan);

if (result == moveit::core::MoveItErrorCode::CONTROL_FAILED) {
    RCLCPP_ERROR(logger, "Controller reported failure (collision?)");
    // Recovery: stop, replan
    move_group.stop();
}
```

**Solution 3: Add Safety Padding**

```cpp
// Inflate collision geometry
robot_state->setPadding(0.05);  // 5cm safety margin around robot links

// Set in planning scene
moveit_msgs::msg::PlanningScene planning_scene;
planning_scene.robot_state.is_diff = true;
// ... apply padding ...
```

**Interview Insight:**
Planning scene may not match reality. Add obstacles from perception (octomap), enable execution monitoring, and use safety padding.

---

### Edge Case 3: Singularity Causes Jerky Motion

**Scenario:**
Robot passes through singularity (configuration where multiple joint movements produce same end-effector motion) → joints move erratically.

**Example - Singularity:**
```
Wrist singularity (spherical wrist, all 3 axes aligned):

       J4
        │
        ├─ J5 aligned!
        │
        ├─ J6 aligned!

When aligned: infinite joint configurations for same end-effector orientation
→ Joints jump between solutions → jerky motion
```

**Detection:**
```cpp
// Manipulability measure (Yoshikawa)
Eigen::MatrixXd jacobian = robot_state.getJacobian(joint_model_group);
double manipulability = sqrt((jacobian * jacobian.transpose()).determinant());

if (manipulability < 0.01) {
    RCLCPP_WARN(logger, "Near singularity! Manipulability = %.3f", manipulability);
}
```

**Solution 1: Avoid Singularities in Planning**

```cpp
// Add joint constraints to avoid singular configurations
moveit_msgs::msg::Constraints constraints;

// E.g., keep elbow bent (avoid straight-arm singularity)
moveit_msgs::msg::JointConstraint elbow_constraint;
elbow_constraint.joint_name = "elbow_joint";
elbow_constraint.position = 1.57;  // 90 degrees
elbow_constraint.tolerance_above = 1.0;
elbow_constraint.tolerance_below = 1.0;
elbow_constraint.weight = 0.5;  // Soft constraint

constraints.joint_constraints.push_back(elbow_constraint);
move_group.setPathConstraints(constraints);
```

**Solution 2: Use Different IK Solution**

```cpp
// IK may return multiple solutions - choose one away from singularity
std::vector<std::vector<double>> ik_solutions;

for (int i = 0; i < 100; i++) {  // Try 100 random seeds
    robot_state.setToRandomPositions(joint_model_group);
    if (robot_state.setFromIK(joint_model_group, target_pose)) {
        std::vector<double> joint_values;
        robot_state.copyJointGroupPositions(joint_model_group, joint_values);

        // Check manipulability
        Eigen::MatrixXd J = robot_state.getJacobian(joint_model_group);
        double manip = sqrt((J * J.transpose()).determinant());

        if (manip > 0.05) {  // Good manipulability
            ik_solutions.push_back(joint_values);
        }
    }
}

// Use best solution (highest manipulability)
```

**Solution 3: Slow Down Near Singularities**

```cpp
// Reduce velocity scaling near singularities
double manipulability = compute_manipulability(robot_state);

if (manipulability < 0.05) {
    move_group.setMaxVelocityScalingFactor(0.1);  // Slow to 10%
} else {
    move_group.setMaxVelocityScalingFactor(0.5);  // Normal 50%
}
```

**Interview Insight:**
Singularities cause erratic joint motion. Detect with manipulability measure, avoid with joint constraints, choose IK solutions away from singularities, or slow down near them.

---

### Edge Case 4: Grasp Planning Fails (No Valid Grasps Found)

**Scenario:**
Attempt to grasp object, but MoveIt grasp planner finds no valid grasps.

**Why:**
- Object shape/size unexpected
- Gripper constraints too strict
- Approach angle restricted
- Collision with environment

**Solution 1: Generate More Grasp Candidates**

```python
# Increase grasp attempts
grasp_candidates = []

for angle in np.linspace(0, 2*np.pi, 16):  # 16 angles
    for offset in np.linspace(-0.05, 0.05, 5):  # 5 offsets
        grasp = generate_grasp(object_pose, angle, offset)
        grasp_candidates.append(grasp)

# Try all candidates
for grasp in grasp_candidates:
    if move_group.plan_grasp(grasp):
        move_group.execute()
        break
```

**Solution 2: Relax Gripper Constraints**

```python
# Allow partial grasps
grasp.pre_grasp_posture.joint_names = ['gripper_finger1', 'gripper_finger2']
grasp.pre_grasp_posture.points[0].positions = [0.04, 0.04]  # Open

# Allow contact with object (not full enclosure)
grasp.allowed_touch_objects = [object_id]
```

**Solution 3: Use Multiple Approach Directions**

```python
# Top-down grasp
grasp_top = create_grasp(object_pose, approach_direction=[0, 0, -1])

# Side grasp
grasp_side = create_grasp(object_pose, approach_direction=[1, 0, 0])

# Try both
if not move_group.pick(object_id, [grasp_top]):
    move_group.pick(object_id, [grasp_side])
```

**Interview Insight:**
Grasp planning can fail due to constraints. Generate diverse grasp candidates (angles, offsets), relax gripper constraints, and try multiple approach directions.

---

## CODE_EXAMPLES

### Example 1: Complete Pick and Place with MoveIt2

**File: `pick_place_demo.cpp`**

```cpp
#include <rclcpp/rclcpp.hpp>
#include <moveit/move_group_interface/move_group_interface.h>
#include <moveit/planning_scene_interface/planning_scene_interface.h>
#include <geometry_msgs/msg/pose.hpp>

class PickPlaceDemo : public rclcpp::Node {
public:
    PickPlaceDemo() : Node("pick_place_demo") {
        // Create move groups
        arm_group_ = std::make_shared<moveit::planning_interface::MoveGroupInterface>(
            shared_from_this(), "panda_arm");

        gripper_group_ = std::make_shared<moveit::planning_interface::MoveGroupInterface>(
            shared_from_this(), "panda_hand");

        // Setup
        arm_group_->setPlanningTime(10.0);
        arm_group_->setNumPlanningAttempts(10);
        arm_group_->setMaxVelocityScalingFactor(0.5);
        arm_group_->setMaxAccelerationScalingFactor(0.5);

        RCLCPP_INFO(get_logger(), "Pick and place demo ready");

        // Add object to scene
        add_object_to_scene("target_object", 0.5, 0.0, 0.5);

        // Execute pick and place
        pick_and_place("target_object", 0.5, 0.0, 0.5,  // Pick position
                                        -0.5, 0.3, 0.5); // Place position
    }

private:
    void add_object_to_scene(const std::string& id, double x, double y, double z) {
        moveit_msgs::msg::CollisionObject object;
        object.header.frame_id = arm_group_->getPlanningFrame();
        object.id = id;

        // Define cylinder (e.g., can)
        shape_msgs::msg::SolidPrimitive primitive;
        primitive.type = primitive.CYLINDER;
        primitive.dimensions = {0.15, 0.05};  // height, radius

        geometry_msgs::msg::Pose pose;
        pose.position.x = x;
        pose.position.y = y;
        pose.position.z = z;
        pose.orientation.w = 1.0;

        object.primitives.push_back(primitive);
        object.primitive_poses.push_back(pose);
        object.operation = object.ADD;

        planning_scene_interface_.applyCollisionObject(object);

        RCLCPP_INFO(get_logger(), "Added object '%s' to scene", id.c_str());
    }

    bool move_to_pose(double x, double y, double z, double roll, double pitch, double yaw) {
        geometry_msgs::msg::Pose target;
        target.position.x = x;
        target.position.y = y;
        target.position.z = z;

        // Convert RPY to quaternion
        tf2::Quaternion q;
        q.setRPY(roll, pitch, yaw);
        target.orientation.x = q.x();
        target.orientation.y = q.y();
        target.orientation.z = q.z();
        target.orientation.w = q.w();

        arm_group_->setPoseTarget(target);

        moveit::planning_interface::MoveGroupInterface::Plan plan;
        bool success = (arm_group_->plan(plan) == moveit::core::MoveItErrorCode::SUCCESS);

        if (success) {
            arm_group_->execute(plan);
            return true;
        } else {
            RCLCPP_ERROR(get_logger(), "Planning failed!");
            return false;
        }
    }

    void open_gripper() {
        gripper_group_->setNamedTarget("open");
        gripper_group_->move();
    }

    void close_gripper() {
        gripper_group_->setNamedTarget("close");
        gripper_group_->move();
    }

    void attach_object(const std::string& object_id) {
        arm_group_->attachObject(object_id, "panda_hand", {"panda_finger_joint1", "panda_finger_joint2"});
        RCLCPP_INFO(get_logger(), "Attached '%s' to gripper", object_id.c_str());
    }

    void detach_object(const std::string& object_id) {
        arm_group_->detachObject(object_id);
        RCLCPP_INFO(get_logger(), "Detached '%s' from gripper", object_id.c_str());
    }

    void pick_and_place(const std::string& object_id,
                        double pick_x, double pick_y, double pick_z,
                        double place_x, double place_y, double place_z) {

        RCLCPP_INFO(get_logger(), "Starting pick and place...");

        // 1. Move to home position
        arm_group_->setNamedTarget("ready");
        arm_group_->move();

        // 2. Open gripper
        open_gripper();

        // 3. Move above object
        RCLCPP_INFO(get_logger(), "Moving above object...");
        if (!move_to_pose(pick_x, pick_y, pick_z + 0.2, M_PI, 0, 0)) {
            RCLCPP_ERROR(get_logger(), "Failed to move above object");
            return;
        }

        // 4. Move down to object
        RCLCPP_INFO(get_logger(), "Lowering to object...");
        if (!move_to_pose(pick_x, pick_y, pick_z, M_PI, 0, 0)) {
            RCLCPP_ERROR(get_logger(), "Failed to reach object");
            return;
        }

        // 5. Close gripper
        RCLCPP_INFO(get_logger(), "Grasping...");
        close_gripper();
        rclcpp::sleep_for(std::chrono::seconds(1));

        // 6. Attach object to gripper (for collision checking)
        attach_object(object_id);

        // 7. Lift object
        RCLCPP_INFO(get_logger(), "Lifting object...");
        if (!move_to_pose(pick_x, pick_y, pick_z + 0.3, M_PI, 0, 0)) {
            RCLCPP_ERROR(get_logger(), "Failed to lift object");
            return;
        }

        // 8. Move to place position (above)
        RCLCPP_INFO(get_logger(), "Moving to place position...");
        if (!move_to_pose(place_x, place_y, place_z + 0.2, M_PI, 0, 0)) {
            RCLCPP_ERROR(get_logger(), "Failed to reach place position");
            return;
        }

        // 9. Lower to place
        RCLCPP_INFO(get_logger(), "Lowering to place...");
        if (!move_to_pose(place_x, place_y, place_z, M_PI, 0, 0)) {
            RCLCPP_ERROR(get_logger(), "Failed to place object");
            return;
        }

        // 10. Open gripper
        RCLCPP_INFO(get_logger(), "Releasing object...");
        detach_object(object_id);
        open_gripper();
        rclcpp::sleep_for(std::chrono::seconds(1));

        // 11. Retract
        RCLCPP_INFO(get_logger(), "Retracting...");
        move_to_pose(place_x, place_y, place_z + 0.2, M_PI, 0, 0);

        // 12. Return home
        RCLCPP_INFO(get_logger(), "Returning home...");
        arm_group_->setNamedTarget("ready");
        arm_group_->move();

        RCLCPP_INFO(get_logger(), "Pick and place complete!");
    }

    std::shared_ptr<moveit::planning_interface::MoveGroupInterface> arm_group_;
    std::shared_ptr<moveit::planning_interface::MoveGroupInterface> gripper_group_;
    moveit::planning_interface::PlanningSceneInterface planning_scene_interface_;
};

int main(int argc, char** argv) {
    rclcpp::init(argc, argv);
    rclcpp::spin(std::make_shared<PickPlaceDemo>());
    rclcpp::shutdown();
    return 0;
}
```

---

### Example 2: Inverse Kinematics Solver

**File: `ik_solver.py`**

```python
#!/usr/bin/env python3
import rclpy
from rclpy.node import Node
from moveit_py import MoveGroupInterface
from geometry_msgs.msg import Pose, PoseStamped
import numpy as np

class IKSolver(Node):
    def __init__(self):
        super().__init__('ik_solver')

        self.move_group = MoveGroupInterface(self, "panda_arm")

        self.get_logger().info('IK Solver ready')

        # Example: Find IK for target pose
        target = Pose()
        target.position.x = 0.5
        target.position.y = 0.2
        target.position.z = 0.6
        target.orientation.w = 1.0

        solutions = self.solve_ik(target, num_attempts=100)

        self.get_logger().info(f'Found {len(solutions)} IK solutions')

        for i, sol in enumerate(solutions):
            self.get_logger().info(f'Solution {i+1}: {np.round(sol, 3)}')

    def solve_ik(self, target_pose, num_attempts=10, timeout=0.1):
        """
        Find all IK solutions for target pose.

        Returns:
            List of joint configurations (each is list of floats)
        """
        robot_state = self.move_group.get_current_state()
        joint_model_group = robot_state.get_joint_model_group(self.move_group.get_name())

        solutions = []

        for attempt in range(num_attempts):
            # Random seed for IK solver
            robot_state.set_to_random_positions(joint_model_group)

            # Try IK
            found_ik = robot_state.set_from_ik(
                joint_model_group,
                target_pose,
                timeout=timeout
            )

            if found_ik:
                # Get joint values
                joint_values = robot_state.get_joint_group_positions(joint_model_group)

                # Check if this solution is new (not duplicate)
                is_new = True
                for existing in solutions:
                    if np.allclose(joint_values, existing, atol=0.01):
                        is_new = False
                        break

                if is_new:
                    solutions.append(list(joint_values))

        return solutions

    def check_reachability(self, target_pose):
        """Check if pose is reachable."""
        solutions = self.solve_ik(target_pose, num_attempts=20)
        return len(solutions) > 0

    def get_manipulability(self, joint_values):
        """
        Compute manipulability measure (Yoshikawa).

        Higher = better dexterity, farther from singularity.
        """
        robot_state = self.move_group.get_current_state()
        robot_state.set_joint_group_positions(
            self.move_group.get_name(),
            joint_values
        )

        jacobian = robot_state.get_jacobian_matrix(self.move_group.get_name())

        # Manipulability = sqrt(det(J * J^T))
        manip = np.sqrt(np.linalg.det(jacobian @ jacobian.T))

        return manip

def main(args=None):
    rclpy.init(args=args)
    node = IKSolver()
    rclpy.spin(node)
    node.destroy_node()
    rclpy.shutdown()

if __name__ == '__main__':
    main()
```

---

## INTERVIEW_QA

### Q1: What is the difference between forward and inverse kinematics?

**Difficulty:** ⭐⭐ (Easy)

**Answer:**

**Forward Kinematics (FK):**
- **Input**: Joint angles θ = [θ₁, θ₂, ..., θₙ]
- **Output**: End-effector pose T = [x, y, z, roll, pitch, yaw]
- **Unique**: One joint configuration → one end-effector pose
- **Computation**: Direct (matrix multiplication)
- **Use case**: Simulation, visualization, odometry

**Inverse Kinematics (IK):**
- **Input**: End-effector pose T
- **Output**: Joint angles θ
- **Multiple solutions**: May have 0, 1, or many solutions
- **Computation**: Iterative (nonlinear solver)
- **Use case**: Motion planning, teleoperation, task-space control

**Example (2-link arm):**

FK:
```
θ₁ = 45°, θ₂ = 30° → (x, y) = (1.67m, 0.97m)  ✓ Unique
```

IK:
```
(x, y) = (1.0m, 1.0m) → θ₁ = 45°, θ₂ = 90°  (elbow-up)
                       → θ₁ = 135°, θ₂ = -90° (elbow-down)
                       Multiple solutions!
```

**Interview Insight:**
FK is direct (joints → pose). IK is inverse (pose → joints), harder to solve, and may have multiple or no solutions.

---

### Q2: Why do motion planners like RRT use randomization?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

**Why Randomization:**

Motion planning in high-dimensional spaces (e.g., 7-DOF arm = 7D configuration space) is computationally expensive. Randomized algorithms like RRT explore space efficiently without exhaustive search.

**Advantages:**

1. **Probabilistic Completeness:**
   - Guaranteed to find solution if exists (given infinite time)
   - Avoids getting stuck in local minima (unlike gradient-based methods)

2. **Fast Exploration:**
   - Samples bias toward unexplored regions
   - Grows tree rapidly toward goal

3. **High-Dimensional Efficiency:**
   - Grid-based methods fail in >3D (curse of dimensionality)
   - RRT samples configuration space directly

**Example - 7-DOF Arm:**

```
Grid-based:
10 samples per joint × 7 joints = 10^7 = 10 million cells
Memory and computation infeasible!

RRT:
Sample ~1000 random configurations
Build tree connecting them
Much faster! ✓
```

**Trade-off:**

- **Pro**: Fast, handles complex spaces
- **Con**: Paths are suboptimal (jagged, not shortest)

**Variants:**

- **RRT**: Fast, suboptimal
- **RRT***: Slower, but asymptotically optimal (refines path)
- **RRT-Connect**: Bidirectional (start and goal trees grow toward each other)

**When NOT to Use RRT:**

- Known environment (pre-compute PRM roadmap)
- Need deterministic motion (use Pilz industrial planners)
- Path quality critical (use optimization-based planners like CHOMP)

**Interview Insight:**
RRT uses randomization for efficient exploration of high-dimensional configuration spaces. Probabilistically complete but produces suboptimal paths. Trade-off: speed vs path quality.

---

### Q3: What is a robot singularity and why is it problematic?

**Difficulty:** ⭐⭐⭐⭐ (Hard)

**Answer:**

**Singularity:**

Configuration where robot loses one or more degrees of freedom. Jacobian matrix becomes rank-deficient (determinant = 0).

**Mathematical Definition:**

Jacobian J maps joint velocities to end-effector velocities:
```
ẋ = J(θ) * θ̇

Where:
ẋ = [vₓ, vᵧ, vz, ωₓ, ωᵧ, ωz]  (Cartesian velocity)
θ̇ = [θ̇₁, θ̇₂, ..., θ̇ₙ]        (joint velocities)
```

At singularity:
```
det(J) = 0  → J is not invertible
```

**Types:**

**1. Boundary Singularities:**
```
Arm fully extended or retracted:

Fully extended:     ──────o  (reach limit)
Fully retracted:    ⌒      (folded)

Cannot move end-effector in certain directions.
```

**2. Interior Singularities (Wrist):**
```
Spherical wrist with aligned axes:

   J4 ─── J5 ─── J6  (all aligned)

Multiple joint configurations produce same orientation.
→ Infinite solutions for IK
→ Joints may "flip" suddenly
```

**3. Elbow Singularities:**
```
Elbow straight:

  ─────────  (J1 and J2 aligned)

Lost ability to move in plane perpendicular to arm.
```

**Why Problematic:**

**1. Erratic Joint Motion:**

Near singularity, small Cartesian motion requires large joint motion:

```
ẋ = J(θ) * θ̇
θ̇ = J⁻¹(θ) * ẋ

Near singularity: J⁻¹ → ∞
→ Huge θ̇ needed for small ẋ
→ Joints move rapidly, robot shakes
```

**2. Loss of Control:**

Cannot generate forces/velocities in certain directions.

**3. Planning Failures:**

Path may pass through singularity → trajectory invalid.

**Detection:**

**Manipulability Measure:**
```
μ = sqrt(det(J * J^T))

μ ≈ 0: Near singularity
μ > 0.1: Safe
```

**Condition Number:**
```
κ = σ_max / σ_min  (ratio of largest to smallest singular values)

κ > 100: Ill-conditioned (near singularity)
```

**Avoidance Strategies:**

1. **Constrain Workspace:**
   - Keep away from boundaries
   - Limit joint ranges (e.g., min elbow bend = 10°)

2. **Choose Different IK Solution:**
   - Multiple solutions exist → pick one with high manipulability

3. **Null-Space Optimization:**
   - Redundant robots (>6 DOF) have null-space
   - Use extra DOFs to avoid singularities while reaching target

4. **Slow Down:**
   - Reduce velocity scaling near singularities
   - Prevents erratic motion

**Interview Insight:**
Singularities occur when Jacobian is rank-deficient (det(J)=0), causing loss of DOF and erratic joint motion. Detect with manipulability measure, avoid by constraining workspace, choosing good IK solutions, or slowing down near singularities.

---

### Q4: How does MoveIt integrate perception for obstacle avoidance?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

MoveIt integrates perception via **Octomap** (3D occupancy grid) to represent dynamic obstacles from sensors.

**Pipeline:**

```
Sensor (Lidar/Depth Camera) → Point Cloud → Octomap → Planning Scene → Collision Checking
```

**1. Sensor Data:**

Depth camera or 3D lidar publishes point cloud:
```
Topic: /camera/depth/points
Type: sensor_msgs/PointCloud2
```

**2. Octomap Server:**

Converts point clouds to 3D occupancy grid:
```bash
ros2 run octomap_server octomap_server_node \
    --ros-args \
    -p resolution:=0.05 \
    -p frame_id:=world \
    --remap cloud_in:=/camera/depth/points
```

Publishes:
```
/octomap_binary  (compressed octomap)
```

**3. MoveIt Planning Scene:**

Subscribes to octomap and updates planning scene:

```cpp
#include <moveit/planning_scene_monitor/planning_scene_monitor.h>

planning_scene_monitor::PlanningSceneMonitorPtr psm =
    std::make_shared<planning_scene_monitor::PlanningSceneMonitor>("robot_description");

// Enable octomap updates
psm->startWorldGeometryMonitor(
    "/octomap_binary",  // Octomap topic
    "/camera/depth/points",  // Point cloud topic
    false  // Don't skip update
);

psm->startStateMonitor();  // Monitor robot state
psm->startSceneMonitor();  // Monitor planning scene
```

**4. Collision Checking:**

During planning, MoveIt checks collisions between robot and octomap:

```cpp
planning_scene::PlanningScenePtr scene = psm->getPlanningScene();

collision_detection::CollisionRequest collision_request;
collision_detection::CollisionResult collision_result;

scene->checkCollision(collision_request, collision_result, robot_state);

if (collision_result.collision) {
    RCLCPP_WARN(logger, "Collision detected!");
}
```

**Parameters:**

```yaml
octomap_server:
  ros__parameters:
    resolution: 0.05  # 5cm voxels
    frame_id: world
    max_range: 5.0    # Ignore sensor data beyond 5m
    min_range: 0.1    # Ignore data closer than 10cm

    # Filter ground plane
    filter_ground: true
    ground_distance: 0.04  # Ground within 4cm of z=0

    # Update frequency
    publish_free_space: false  # Only publish occupied voxels
```

**Advantages:**

- Real-time obstacle updates
- Handles dynamic environments (people moving)
- 3D representation (not just 2D costmap)

**Limitations:**

- **Memory**: Large octomaps (0.01m resolution) use gigabytes
- **Sensor noise**: Floating voxels (outliers)
- **Computation**: Collision checking with octomap is slower than primitives

**Optimization:**

1. **Coarser resolution** (0.05m instead of 0.01m)
2. **Filter noise** (remove isolated voxels)
3. **Limit octomap size** (only around robot, not entire world)

**Interview Insight:**
MoveIt uses Octomap to represent sensor data (point clouds) as 3D occupancy grid, enabling collision checking with dynamic obstacles. Trade-off: real-time updates vs memory/computation cost.

---

### Q5: What are the trade-offs between Cartesian and joint-space planning?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

**Cartesian-Space Planning:**

Plan end-effector path in Cartesian coordinates (x, y, z), then solve IK at each point.

**Advantages:**
- **Intuitive**: Straight-line motions easy to specify
- **Task-oriented**: "Move 10cm forward" → natural
- **Predictable**: End-effector follows exact path

**Disadvantages:**
- **IK failures**: May not find joint config for every Cartesian waypoint
- **Singularities**: Path may pass through singular configurations
- **Slow**: Requires IK at many waypoints
- **Incomplete**: May fail even if valid joint-space path exists

**Example - Cartesian Path:**
```cpp
std::vector<geometry_msgs::msg::Pose> waypoints;
// Straight line from A to B
waypoints.push_back(pose_A);
waypoints.push_back(pose_B);

move_group.computeCartesianPath(waypoints, 0.01, 0.0);
// May fail if IK fails midway!
```

---

**Joint-Space Planning:**

Plan directly in joint configuration space (θ₁, θ₂, ..., θₙ).

**Advantages:**
- **Always feasible**: If start and goal have valid IK, path exists
- **Avoids singularities**: Planner can route around them
- **Fast**: No IK solving during planning
- **Complete**: RRT/PRM find path if exists

**Disadvantages:**
- **Unpredictable end-effector path**: May swing wide or rotate unexpectedly
- **Not intuitive**: Cannot specify "straight line" easily

**Example - Joint-Space Path:**
```cpp
std::vector<double> joint_target = {0.0, -0.785, 0.0, -2.356, 0.0, 1.571, 0.785};
move_group.setJointValueTarget(joint_target);
move_group.plan();
// Always succeeds (if goal reachable), but path may be indirect
```

---

**Comparison:**

| Aspect | Cartesian | Joint-Space |
|--------|-----------|-------------|
| **Path Predictability** | ✅ Straight lines | ❌ Indirect paths |
| **Singularities** | ❌ May hit | ✅ Avoids |
| **IK Failures** | ❌ Can fail midway | ✅ No IK needed |
| **Planning Speed** | ❌ Slow (IK calls) | ✅ Fast |
| **Completeness** | ❌ Incomplete | ✅ Complete |
| **Use Case** | Pick-place, wiping | General motion, avoiding obstacles |

---

**When to Use:**

**Cartesian:**
- Pick and place (straight approach/retract)
- Surface following (painting, wiping)
- Precise tool paths (welding, gluing)

**Joint-Space:**
- General motion planning
- Obstacle avoidance
- Moving between arbitrary poses
- When end-effector path doesn't matter

**Hybrid Approach:**

Combine both:
```python
# Approach in Cartesian (straight line)
waypoints = []
wpose = move_group.get_current_pose().pose
wpose.position.z -= 0.2  # Move down 20cm
waypoints.append(copy.deepcopy(wpose))
move_group.compute_cartesian_path(waypoints, 0.01, 0.0)
move_group.execute(plan)

# Move away in joint-space (arbitrary path OK)
move_group.set_named_target("home")
move_group.move()
```

**Interview Insight:**
Cartesian planning gives predictable end-effector paths but can fail (IK, singularities). Joint-space planning is robust and complete but produces unpredictable end-effector motion. Choose based on task requirements.

---

## PRACTICE_TASKS

### Task 1: Implement Pick and Place with MoveIt2

**Goal:** Create complete pick-place application.

**Requirements:**
- Add collision objects to planning scene (table, object)
- Plan approach to object (Cartesian path)
- Close gripper and attach object
- Move to place location
- Release and detach object
- Handle failures gracefully

**Bonus:**
- Add perception (detect object pose from camera)
- Multiple grasp attempts if first fails

---

### Task 2: Singularity Detection and Avoidance

**Goal:** Detect and avoid robot singularities.

**Requirements:**
- Compute manipulability measure (Yoshikawa)
- Log warning if manipulability < threshold
- When planning, reject IK solutions near singularities
- Visualize manipulability in RViz (color gradient)

**Bonus:**
- Slow down robot automatically near singularities
- Use null-space optimization to avoid singularities (redundant robots)

---

### Task 3: Dynamic Obstacle Avoidance with Octomap

**Goal:** Integrate depth camera for real-time obstacle avoidance.

**Requirements:**
- Setup octomap_server to process depth camera
- Configure MoveIt to use octomap for collision checking
- Move robot while person walks in workspace
- Robot should replan if path blocked

**Bonus:**
- Filter ground plane from octomap
- Add safety padding around obstacles

---

### Task 4: Multi-Arm Coordination

**Goal:** Coordinate two robot arms for collaborative task.

**Requirements:**
- Setup MoveIt for two arms (separate move groups)
- Plan motions for both arms
- Ensure no collisions between arms
- Handoff object from arm 1 to arm 2

**Bonus:**
- Simultaneous motion (both arms move together)
- Shared workspace management

---

## QUICK_REFERENCE

### MoveIt2 Key APIs

```cpp
// Create move group
moveit::planning_interface::MoveGroupInterface move_group(node, "panda_arm");

// Set pose target
geometry_msgs::msg::Pose target;
move_group.setPoseTarget(target);

// Set joint target
std::vector<double> joints = {0.0, -0.785, 0.0, -2.356, 0.0, 1.571, 0.785};
move_group.setJointValueTarget(joints);

// Plan
moveit::planning_interface::MoveGroupInterface::Plan plan;
move_group.plan(plan);

// Execute
move_group.execute(plan);

// Cartesian path
std::vector<geometry_msgs::msg::Pose> waypoints;
move_group.computeCartesianPath(waypoints, 0.01, 0.0);
```

### Common Launch Commands

```bash
# Launch MoveIt with RViz
ros2 launch moveit_config demo.launch.py

# Launch MoveIt with real robot
ros2 launch moveit_config moveit.launch.py use_sim:=false

# Setup assistant (configure new robot)
ros2 launch moveit_setup_assistant setup_assistant.launch.py
```

### Planning Scene Management

```cpp
// Add collision object
moveit_msgs::msg::CollisionObject object;
object.header.frame_id = "world";
object.id = "box1";

shape_msgs::msg::SolidPrimitive primitive;
primitive.type = primitive.BOX;
primitive.dimensions = {0.5, 0.5, 0.5};

object.primitives.push_back(primitive);
object.primitive_poses.push_back(pose);
object.operation = object.ADD;

planning_scene_interface.applyCollisionObject(object);

// Attach object to gripper
move_group.attachObject("box1", "gripper_link");

// Detach object
move_group.detachObject("box1");
```

---

**END OF TOPIC 5.3: Robot Manipulation & MoveIt2**
