# Topic 3.2: URDF & Robot Description

## THEORY_SECTION

### 1. URDF Fundamentals

**What is URDF?**

URDF (Unified Robot Description Format) is an **XML specification** for describing:
- Robot **geometry** (links, joints)
- **Visual** models (for visualization in RViz)
- **Collision** models (for physics/planning)
- **Inertial** properties (for simulation)
- **Sensors** and **actuators**

**Why URDF?**

- **Standard format** across ROS ecosystem
- Used by: RViz, Gazebo, MoveIt, Navigation
- Defines: Kinematics, dynamics, visualization

**URDF vs SDF:**

| Format | Used By | Complexity |
|--------|---------|------------|
| **URDF** | ROS, MoveIt | Simple robots |
| **SDF** | Gazebo | Complex worlds, multiple robots |
| **Xacro** | URDF extension | Parametric URDF with macros |

---

### 2. Basic URDF Structure

**Minimal Robot URDF:**

```xml
<?xml version="1.0"?>
<robot name="my_robot">
  <!-- Links define rigid bodies -->
  <link name="base_link">
    <visual>
      <geometry>
        <box size="0.5 0.3 0.1"/>
      </geometry>
      <material name="blue">
        <color rgba="0 0 1 1"/>
      </material>
    </visual>
  </link>

  <!-- Joints define connections between links -->
  <joint name="base_to_wheel" type="continuous">
    <parent link="base_link"/>
    <child link="wheel_link"/>
    <origin xyz="0 0 -0.05" rpy="0 0 0"/>
    <axis xyz="0 1 0"/>
  </joint>

  <link name="wheel_link">
    <visual>
      <geometry>
        <cylinder radius="0.05" length="0.04"/>
      </geometry>
      <material name="black">
        <color rgba="0 0 0 1"/>
      </material>
    </visual>
  </link>
</robot>
```

**Key Components:**

| Element | Purpose | Required |
|---------|---------|----------|
| `<robot>` | Root element | Yes |
| `<link>` | Rigid body | Yes (at least 1) |
| `<joint>` | Connection between links | No (for multi-link) |
| `<visual>` | Visualization geometry | No |
| `<collision>` | Collision geometry | No |
| `<inertial>` | Mass, inertia | No (required for simulation) |

---

### 3. Links

**Link defines a rigid body with:**
- Visual representation
- Collision geometry
- Inertial properties

**Complete Link Example:**

```xml
<link name="chassis">
  <!-- Visual: What you see in RViz -->
  <visual>
    <origin xyz="0 0 0" rpy="0 0 0"/>
    <geometry>
      <box size="0.6 0.4 0.2"/>
    </geometry>
    <material name="blue">
      <color rgba="0 0.5 1.0 1.0"/>
    </material>
  </visual>

  <!-- Collision: For physics/planning -->
  <collision>
    <origin xyz="0 0 0" rpy="0 0 0"/>
    <geometry>
      <box size="0.6 0.4 0.2"/>  <!-- Often simpler than visual -->
    </geometry>
  </collision>

  <!-- Inertial: Mass and inertia tensor -->
  <inertial>
    <origin xyz="0 0 0" rpy="0 0 0"/>
    <mass value="10.0"/>  <!-- kg -->
    <inertia ixx="0.15" ixy="0.0" ixz="0.0"
             iyy="0.25" iyz="0.0"
             izz="0.35"/>
  </inertial>
</link>
```

**Geometry Types:**

```xml
<!-- Box -->
<geometry>
  <box size="length width height"/>
</geometry>

<!-- Cylinder -->
<geometry>
  <cylinder radius="0.1" length="0.5"/>
</geometry>

<!-- Sphere -->
<geometry>
  <sphere radius="0.1"/>
</geometry>

<!-- Mesh (STL, DAE, OBJ) -->
<geometry>
  <mesh filename="package://my_robot_description/meshes/chassis.stl" scale="1.0 1.0 1.0"/>
</geometry>
```

---

### 4. Joints

**Joint Types:**

| Type | DOF | Description | Use Case |
|------|-----|-------------|----------|
| **fixed** | 0 | No movement | Sensor mounts |
| **revolute** | 1 | Rotation with limits | Robot arm joints |
| **continuous** | 1 | Unlimited rotation | Wheels |
| **prismatic** | 1 | Linear motion with limits | Elevator, gripper |
| **floating** | 6 | Full 6-DOF | Simulation only |
| **planar** | 2 | Movement in plane | Omni-directional base |

**Revolute Joint (with limits):**

```xml
<joint name="shoulder_joint" type="revolute">
  <parent link="base_link"/>
  <child link="upper_arm"/>

  <!-- Joint origin (relative to parent) -->
  <origin xyz="0 0.1 0.3" rpy="0 0 0"/>

  <!-- Rotation axis (in joint frame) -->
  <axis xyz="0 1 0"/>  <!-- Y-axis rotation -->

  <!-- Joint limits -->
  <limit effort="100.0"    <!-- Max torque (N⋅m) -->
         velocity="1.57"   <!-- Max velocity (rad/s) -->
         lower="-1.57"     <!-- Min angle (rad) -->
         upper="1.57"/>    <!-- Max angle (rad) -->

  <!-- Dynamics (optional) -->
  <dynamics damping="0.7" friction="0.0"/>
</joint>
```

**Continuous Joint (wheel):**

```xml
<joint name="left_wheel_joint" type="continuous">
  <parent link="base_link"/>
  <child link="left_wheel"/>
  <origin xyz="0 0.15 -0.05" rpy="-1.57 0 0"/>  <!-- Wheel on side -->
  <axis xyz="0 0 1"/>  <!-- Rotation axis -->
  <limit effort="10.0" velocity="10.0"/>  <!-- No position limits -->
</joint>
```

**Fixed Joint (sensor mount):**

```xml
<joint name="camera_joint" type="fixed">
  <parent link="base_link"/>
  <child link="camera_link"/>
  <origin xyz="0.2 0 0.1" rpy="0 0 0"/>
</joint>
```

---

### 5. Xacro: Parametric URDF

**Problem with Pure URDF:**
- Repetitive (multiple similar links/joints)
- No variables or math
- Hard to maintain

**Xacro Solution:**
- **Macros** for reusable components
- **Properties** (variables)
- **Math expressions**
- **Includes** (modular files)

**Basic Xacro:**

```xml
<?xml version="1.0"?>
<robot xmlns:xacro="http://www.ros.org/wiki/xacro" name="my_robot">

  <!-- Properties (variables) -->
  <xacro:property name="wheel_radius" value="0.05"/>
  <xacro:property name="wheel_width" value="0.04"/>
  <xacro:property name="wheel_mass" value="0.5"/>

  <!-- Macro for wheel -->
  <xacro:macro name="wheel" params="prefix reflect">
    <link name="${prefix}_wheel">
      <visual>
        <geometry>
          <cylinder radius="${wheel_radius}" length="${wheel_width}"/>
        </geometry>
        <material name="black">
          <color rgba="0 0 0 1"/>
        </material>
      </visual>

      <collision>
        <geometry>
          <cylinder radius="${wheel_radius}" length="${wheel_width}"/>
        </geometry>
      </collision>

      <inertial>
        <mass value="${wheel_mass}"/>
        <inertia ixx="${wheel_mass * wheel_radius * wheel_radius / 2}"
                 iyy="${wheel_mass * wheel_radius * wheel_radius / 2}"
                 izz="${wheel_mass * wheel_radius * wheel_radius / 2}"
                 ixy="0" ixz="0" iyz="0"/>
      </inertial>
    </link>

    <joint name="${prefix}_wheel_joint" type="continuous">
      <parent link="base_link"/>
      <child link="${prefix}_wheel"/>
      <origin xyz="0 ${reflect * 0.15} -0.05" rpy="-1.57 0 0"/>
      <axis xyz="0 0 1"/>
    </joint>
  </xacro:macro>

  <!-- Base link -->
  <link name="base_link">
    <!-- ... -->
  </link>

  <!-- Instantiate wheels -->
  <xacro:wheel prefix="left" reflect="1"/>
  <xacro:wheel prefix="right" reflect="-1"/>

</robot>
```

**Xacro Includes:**

```xml
<!-- Main robot file -->
<robot xmlns:xacro="http://www.ros.org/wiki/xacro">
  <!-- Include common properties -->
  <xacro:include filename="$(find my_robot_description)/urdf/common.xacro"/>

  <!-- Include wheel macro -->
  <xacro:include filename="$(find my_robot_description)/urdf/wheel.xacro"/>

  <!-- Include sensors -->
  <xacro:include filename="$(find my_robot_description)/urdf/sensors.xacro"/>

  <!-- Use included macros -->
  <xacro:wheel_macro prefix="left"/>
</robot>
```

**Converting Xacro to URDF:**

```bash
# Command line
xacro robot.urdf.xacro > robot.urdf

# Or in launch file (automatic)
Command(['xacro ', urdf_file])
```

---

### 6. Robot State Publisher

**robot_state_publisher** reads URDF and publishes TF transforms for all fixed joints.

**Launch File:**

```python
from launch import LaunchDescription
from launch_ros.actions import Node
from launch.substitutions import Command, PathJoinSubstitution
from launch_ros.substitutions import FindPackageShare

def generate_launch_description():
    # Get URDF file path
    urdf_file = PathJoinSubstitution([
        FindPackageShare('my_robot_description'),
        'urdf',
        'robot.urdf.xacro'
    ])

    # Process xacro to URDF
    robot_description = Command(['xacro ', urdf_file])

    # robot_state_publisher
    robot_state_publisher_node = Node(
        package='robot_state_publisher',
        executable='robot_state_publisher',
        parameters=[{
            'robot_description': robot_description,
            'publish_frequency': 30.0  # Hz
        }]
    )

    return LaunchDescription([
        robot_state_publisher_node
    ])
```

**What robot_state_publisher Does:**

1. Parses URDF
2. Publishes `/robot_description` topic (for RViz, MoveIt)
3. Publishes TF transforms for all **fixed** joints
4. Subscribes to `/joint_states` for **movable** joints
5. Computes forward kinematics

**Joint State Publisher:**

For robots with movable joints:

```python
joint_state_publisher_node = Node(
    package='joint_state_publisher_gui',  # GUI for manual control
    executable='joint_state_publisher_gui',
    name='joint_state_publisher_gui'
)
```

Or publish from robot driver:

```cpp
#include "sensor_msgs/msg/joint_state.hpp"

// Publish joint states
auto joint_state_pub = node->create_publisher<sensor_msgs::msg::JointState>(
    "joint_states", 10
);

sensor_msgs::msg::JointState joint_state;
joint_state.header.stamp = node->now();
joint_state.name = {"left_wheel_joint", "right_wheel_joint"};
joint_state.position = {left_wheel_angle, right_wheel_angle};
joint_state.velocity = {left_wheel_vel, right_wheel_vel};

joint_state_pub->publish(joint_state);
```

---

### 7. Visualizing in RViz

**Launch RViz with Robot Model:**

```python
rviz_config = PathJoinSubstitution([
    FindPackageShare('my_robot_description'),
    'rviz',
    'robot.rviz'
])

rviz_node = Node(
    package='rviz2',
    executable='rviz2',
    arguments=['-d', rviz_config],
    parameters=[{
        'use_sim_time': False
    }]
)
```

**RViz Configuration:**
1. Add **RobotModel** display
2. Set **Robot Description** topic: `/robot_description`
3. Set **Fixed Frame**: `base_link`
4. Add **TF** display to see coordinate frames

**Common RViz Displays for Robots:**

| Display | Purpose |
|---------|---------|
| RobotModel | Show robot URDF |
| TF | Show coordinate frames |
| LaserScan | Show lidar data |
| PointCloud2 | Show 3D sensor data |
| Camera | Show camera images |
| Path | Show planned paths |

---

## EDGE_CASES

### Edge Case 1: Missing Parent Link in Joint

**Scenario:**
Joint references non-existent parent link.

**URDF:**
```xml
<joint name="my_joint" type="fixed">
  <parent link="nonexistent_link"/>  <!-- Typo! Link doesn't exist -->
  <child link="camera_link"/>
  <origin xyz="0 0 0" rpy="0 0 0"/>
</joint>

<link name="camera_link">
  <!-- ... -->
</link>

<!-- Missing: <link name="base_link"> -->
```

**Error:**
```
Error: parent link [nonexistent_link] of joint [my_joint] not found
```

**Why:**
- URDF parser validates link references
- All joints must connect existing links
- Breaks TF tree if parent missing

**Solution:**

```xml
<!-- Define parent link -->
<link name="base_link">
  <visual>
    <geometry>
      <box size="0.5 0.3 0.1"/>
    </geometry>
  </visual>
</link>

<joint name="my_joint" type="fixed">
  <parent link="base_link"/>  <!-- Now exists -->
  <child link="camera_link"/>
  <origin xyz="0 0 0" rpy="0 0 0"/>
</joint>
```

**Validation:**

```bash
# Check URDF validity
check_urdf robot.urdf

# Or with xacro
xacro robot.urdf.xacro | check_urdf
```

**Interview Insight:**
Always validate URDF with `check_urdf`. Catches missing links, joint loops, and syntax errors.

---

### Edge Case 2: Joint Loop (Kinematic Cycle)

**Scenario:**
Joints form a closed loop (cycle in tree).

**URDF:**
```xml
<link name="base_link"/>
<link name="link1"/>
<link name="link2"/>

<joint name="joint1" type="fixed">
  <parent link="base_link"/>
  <child link="link1"/>
</joint>

<joint name="joint2" type="fixed">
  <parent link="link1"/>
  <child link="link2"/>
</joint>

<!-- BUG: Creates loop! -->
<joint name="joint3" type="fixed">
  <parent link="link2"/>
  <child link="base_link"/>  <!-- Closes loop -->
</joint>
```

**Result:**
```
base_link → link1 → link2 → base_link (LOOP!)
```

**Error:**
```bash
check_urdf robot.urdf
# Error: link [base_link] is both "parent" and "child"
# Error: Failed to build tree: Tree must be directed acyclic graph
```

**Why:**
- URDF must form **tree** (DAG), not graph
- Loops break FK/IK computations
- TF cannot handle cycles

**Solution:**

Design proper tree:
```
base_link
  ├─ link1
  │   └─ link2
  └─ link3

NOT:
base_link → link1 → link2 → base_link (loop)
```

**Interview Insight:**
URDF must be a tree. Closed-loop mechanisms (parallel robots) require special handling (constraints).

---

### Edge Case 3: Inertial Origin Not at Center of Mass

**Scenario:**
Inertial origin placed incorrectly, causing simulation instability.

**Wrong:**
```xml
<link name="box">
  <inertial>
    <!-- Origin at corner instead of COM! -->
    <origin xyz="0 0 0" rpy="0 0 0"/>
    <mass value="10.0"/>
    <inertia ixx="0.1" iyy="0.1" izz="0.1" ixy="0" ixz="0" iyz="0"/>
  </inertial>

  <visual>
    <origin xyz="0.25 0.15 0.1" rpy="0 0 0"/>  <!-- Box centered here -->
    <geometry>
      <box size="0.5 0.3 0.2"/>
    </geometry>
  </visual>
</link>
```

**Result in Gazebo:**
- Physics simulation unstable
- Robot "wobbles" or explodes
- Incorrect dynamics

**Correct:**

```xml
<link name="box">
  <inertial>
    <!-- COM at geometric center of box -->
    <origin xyz="0.25 0.15 0.1" rpy="0 0 0"/>  <!-- Matches visual center -->
    <mass value="10.0"/>
    <!-- Inertia for box about COM -->
    <inertia ixx="${(mass * (height^2 + depth^2)) / 12}"
             iyy="${(mass * (width^2 + depth^2)) / 12}"
             izz="${(mass * (width^2 + height^2)) / 12}"
             ixy="0" ixz="0" iyz="0"/>
  </inertial>

  <visual>
    <origin xyz="0.25 0.15 0.1" rpy="0 0 0"/>
    <geometry>
      <box size="0.5 0.3 0.2"/>
    </geometry>
  </visual>
</link>
```

**Inertia Formulas:**

**Box:**
```
Ixx = (m * (h² + d²)) / 12
Iyy = (m * (w² + d²)) / 12
Izz = (m * (w² + h²)) / 12
```

**Cylinder (axis along Z):**
```
Ixx = Iyy = (m * (3r² + h²)) / 12
Izz = (m * r²) / 2
```

**Sphere:**
```
Ixx = Iyy = Izz = (2 * m * r²) / 5
```

**Interview Insight:**
Inertial origin must be at center of mass. Use proper inertia tensors for shape. Incorrect inertia causes simulation instability.

---

### Edge Case 4: Mesh File Not Found

**Scenario:**
URDF references mesh file that doesn't exist or can't be found.

**URDF:**
```xml
<link name="chassis">
  <visual>
    <geometry>
      <mesh filename="package://my_robot_description/meshes/chassis.stl"/>
      <!-- File doesn't exist or package not found -->
    </geometry>
  </visual>
</link>
```

**Error in RViz:**
```
Could not load resource [package://my_robot_description/meshes/chassis.stl]:
Unable to open file [/path/to/workspace/install/my_robot_description/share/my_robot_description/meshes/chassis.stl]
```

**Causes:**

1. **File doesn't exist:**
   - Typo in filename
   - Mesh not exported/committed

2. **Package not found:**
   - `my_robot_description` not built
   - Not sourced workspace

3. **Wrong install path:**
   - Mesh not installed in CMakeLists.txt

**Solution:**

**1. Verify file exists:**
```bash
ls ~/ros2_ws/src/my_robot_description/meshes/chassis.stl
```

**2. Install mesh files (CMakeLists.txt):**
```cmake
install(DIRECTORY meshes/
  DESTINATION share/${PROJECT_NAME}/meshes
)
```

**3. Verify package installed:**
```bash
ros2 pkg prefix my_robot_description
# Should show install path
```

**4. Check path in URDF:**
```xml
<!-- Correct -->
<mesh filename="package://my_robot_description/meshes/chassis.stl"/>

<!-- Wrong -->
<mesh filename="file:///absolute/path/chassis.stl"/>  <!-- Not portable -->
```

**Interview Insight:**
Use `package://` URIs for mesh files. Install meshes with CMake. Verify with `ros2 pkg prefix`.

---

## CODE_EXAMPLES

### Example 1: Complete Differential Drive Robot

**File: `robot.urdf.xacro`**

```xml
<?xml version="1.0"?>
<robot xmlns:xacro="http://www.ros.org/wiki/xacro" name="diff_drive_robot">

  <!-- Properties -->
  <xacro:property name="base_width" value="0.4"/>
  <xacro:property name="base_length" value="0.6"/>
  <xacro:property name="base_height" value="0.2"/>
  <xacro:property name="base_mass" value="15.0"/>

  <xacro:property name="wheel_radius" value="0.1"/>
  <xacro:property name="wheel_width" value="0.05"/>
  <xacro:property name="wheel_mass" value="2.0"/>
  <xacro:property name="wheel_separation" value="0.5"/>

  <!-- Colors -->
  <material name="blue">
    <color rgba="0 0 0.8 1"/>
  </material>

  <material name="black">
    <color rgba="0 0 0 1"/>
  </material>

  <material name="white">
    <color rgba="1 1 1 1"/>
  </material>

  <!-- Base Link -->
  <link name="base_link">
    <visual>
      <geometry>
        <box size="${base_length} ${base_width} ${base_height}"/>
      </geometry>
      <material name="blue"/>
    </visual>

    <collision>
      <geometry>
        <box size="${base_length} ${base_width} ${base_height}"/>
      </geometry>
    </collision>

    <inertial>
      <mass value="${base_mass}"/>
      <inertia ixx="${(base_mass * (base_width*base_width + base_height*base_height)) / 12}"
               iyy="${(base_mass * (base_length*base_length + base_height*base_height)) / 12}"
               izz="${(base_mass * (base_length*base_length + base_width*base_width)) / 12}"
               ixy="0" ixz="0" iyz="0"/>
    </inertial>
  </link>

  <!-- Wheel Macro -->
  <xacro:macro name="wheel" params="prefix reflect">
    <link name="${prefix}_wheel">
      <visual>
        <origin xyz="0 0 0" rpy="${pi/2} 0 0"/>
        <geometry>
          <cylinder radius="${wheel_radius}" length="${wheel_width}"/>
        </geometry>
        <material name="black"/>
      </visual>

      <collision>
        <origin xyz="0 0 0" rpy="${pi/2} 0 0"/>
        <geometry>
          <cylinder radius="${wheel_radius}" length="${wheel_width}"/>
        </geometry>
      </collision>

      <inertial>
        <mass value="${wheel_mass}"/>
        <inertia ixx="${(wheel_mass * wheel_radius * wheel_radius) / 2}"
                 iyy="${(wheel_mass * wheel_radius * wheel_radius) / 2}"
                 izz="${(wheel_mass * wheel_radius * wheel_radius) / 2}"
                 ixy="0" ixz="0" iyz="0"/>
      </inertial>
    </link>

    <joint name="${prefix}_wheel_joint" type="continuous">
      <parent link="base_link"/>
      <child link="${prefix}_wheel"/>
      <origin xyz="0 ${reflect * wheel_separation/2} ${-base_height/2 + wheel_radius/2}" rpy="0 0 0"/>
      <axis xyz="0 1 0"/>
      <limit effort="10.0" velocity="5.0"/>
    </joint>
  </xacro:macro>

  <!-- Instantiate Wheels -->
  <xacro:wheel prefix="left" reflect="1"/>
  <xacro:wheel prefix="right" reflect="-1"/>

  <!-- Caster Wheel -->
  <link name="caster">
    <visual>
      <geometry>
        <sphere radius="0.05"/>
      </geometry>
      <material name="white"/>
    </visual>

    <collision>
      <geometry>
        <sphere radius="0.05"/>
      </geometry>
    </collision>

    <inertial>
      <mass value="0.5"/>
      <inertia ixx="0.001" iyy="0.001" izz="0.001" ixy="0" ixz="0" iyz="0"/>
    </inertial>
  </link>

  <joint name="caster_joint" type="fixed">
    <parent link="base_link"/>
    <child link="caster"/>
    <origin xyz="${-base_length/2 + 0.05} 0 ${-base_height/2 - 0.03}" rpy="0 0 0"/>
  </joint>

  <!-- Laser Scanner -->
  <link name="laser_link">
    <visual>
      <geometry>
        <cylinder radius="0.05" length="0.04"/>
      </geometry>
      <material name="black"/>
    </visual>

    <collision>
      <geometry>
        <cylinder radius="0.05" length="0.04"/>
      </geometry>
    </collision>

    <inertial>
      <mass value="0.3"/>
      <inertia ixx="0.001" iyy="0.001" izz="0.001" ixy="0" ixz="0" iyz="0"/>
    </inertial>
  </link>

  <joint name="laser_joint" type="fixed">
    <parent link="base_link"/>
    <child link="laser_link"/>
    <origin xyz="${base_length/2 - 0.05} 0 ${base_height/2 + 0.05}" rpy="0 0 0"/>
  </joint>

</robot>
```

**Launch File:**

```python
from launch import LaunchDescription
from launch_ros.actions import Node
from launch.substitutions import Command, PathJoinSubstitution
from launch_ros.substitutions import FindPackageShare

def generate_launch_description():
    urdf_file = PathJoinSubstitution([
        FindPackageShare('my_robot_description'),
        'urdf',
        'robot.urdf.xacro'
    ])

    robot_description = Command(['xacro ', urdf_file])

    robot_state_publisher_node = Node(
        package='robot_state_publisher',
        executable='robot_state_publisher',
        parameters=[{'robot_description': robot_description}]
    )

    joint_state_publisher_gui_node = Node(
        package='joint_state_publisher_gui',
        executable='joint_state_publisher_gui'
    )

    rviz_node = Node(
        package='rviz2',
        executable='rviz2',
        arguments=['-d', PathJoinSubstitution([
            FindPackageShare('my_robot_description'),
            'rviz',
            'robot.rviz'
        ])]
    )

    return LaunchDescription([
        robot_state_publisher_node,
        joint_state_publisher_gui_node,
        rviz_node
    ])
```

---

## INTERVIEW_QA

### Q1: What's the difference between visual, collision, and inertial elements in URDF?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

| Element | Purpose | Used By | Can Be Different? |
|---------|---------|---------|-------------------|
| **Visual** | What you see | RViz | Yes |
| **Collision** | For collision detection | Gazebo, MoveIt | Yes |
| **Inertial** | Mass and inertia | Gazebo (physics) | N/A |

**Visual:**
- Detailed, high-poly meshes
- Textures, materials
- Appearance in RViz

**Collision:**
- Simplified geometry (faster collision checks)
- Often primitive shapes (box, cylinder)
- Used by physics engine and motion planning

**Inertial:**
- Required for simulation
- Must match actual mass distribution
- COM at geometric center

**Example:**

```xml
<link name="robot_chassis">
  <!-- High-detail mesh for visualization -->
  <visual>
    <geometry>
      <mesh filename="package://my_robot/meshes/chassis_detailed.stl"/>
    </geometry>
  </visual>

  <!-- Simple box for fast collision detection -->
  <collision>
    <geometry>
      <box size="0.6 0.4 0.2"/>
    </geometry>
  </collision>

  <!-- Physical properties for simulation -->
  <inertial>
    <mass value="15.0"/>
    <inertia ixx="0.15" iyy="0.25" izz="0.35" ixy="0" ixz="0" iyz="0"/>
  </inertial>
</link>
```

**Interview Insight:**
Visual can be detailed, collision should be simple for performance. Inertial required only for simulation.

---

### Q2: What is Xacro and why use it over plain URDF?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

**Xacro** = XML Macros for URDF

**Problems with Pure URDF:**
- No variables → hard-coded values
- Repetitive → copy-paste errors
- No reusability → duplicate code
- No modularity → monolithic files

**Xacro Solutions:**

**1. Properties (Variables):**
```xml
<xacro:property name="wheel_radius" value="0.1"/>
<xacro:property name="wheel_mass" value="2.0"/>

<cylinder radius="${wheel_radius}" length="0.05"/>
<mass value="${wheel_mass}"/>
```

**2. Macros (Reusable Components):**
```xml
<xacro:macro name="wheel" params="prefix reflect">
  <!-- Define wheel once, use multiple times -->
</xacro:macro>

<xacro:wheel prefix="left" reflect="1"/>
<xacro:wheel prefix="right" reflect="-1"/>
```

**3. Math:**
```xml
<xacro:property name="wheel_separation" value="0.5"/>
<origin xyz="0 ${wheel_separation / 2} 0"/>  <!-- Computed! -->
```

**4. Includes (Modularity):**
```xml
<xacro:include filename="$(find my_robot)/urdf/wheels.xacro"/>
<xacro:include filename="$(find my_robot)/urdf/sensors.xacro"/>
```

**Conversion:**
```bash
xacro robot.urdf.xacro > robot.urdf
```

**Interview Insight:**
Xacro eliminates repetition, enables parametrization, and improves maintainability. Always use Xacro for production robots.

---

### Q3: What does robot_state_publisher do?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

**robot_state_publisher** is a ROS2 node that:

**1. Parses URDF:**
- Reads `robot_description` parameter
- Builds kinematic tree

**2. Publishes /robot_description:**
- Makes URDF available to other nodes (RViz, MoveIt)
- Latched topic (new subscribers get last message)

**3. Publishes TF for Fixed Joints:**
- Automatically publishes static transforms
- For all `type="fixed"` joints

**4. Computes Forward Kinematics:**
- Subscribes to `/joint_states`
- Computes TF for movable joints
- Publishes complete TF tree

**Workflow:**

```
Joint States → robot_state_publisher → TF Tree
                      ↓
               /robot_description
```

**Example:**

```python
# Launch robot_state_publisher
Node(
    package='robot_state_publisher',
    executable='robot_state_publisher',
    parameters=[{'robot_description': robot_description}]
)
```

**Published Topics:**
- `/robot_description` (std_msgs/String): URDF content
- `/tf_static` (tf2_msgs/TFMessage): Static transforms
- `/tf` (tf2_msgs/TFMessage): Dynamic transforms (from joint states)

**Subscribed Topics:**
- `/joint_states` (sensor_msgs/JointState): Joint positions/velocities

**Interview Insight:**
robot_state_publisher bridges URDF and TF. Essential for visualizing and using robot model in ROS2.

---

### Q4: How do you validate a URDF file?

**Difficulty:** ⭐⭐ (Easy)

**Answer:**

**Tool: `check_urdf`**

```bash
# Install
sudo apt install liburdfdom-tools

# Check URDF
check_urdf robot.urdf

# With xacro
xacro robot.urdf.xacro | check_urdf
```

**What it Checks:**
- XML syntax errors
- Missing links/joints
- Kinematic loops (cycles)
- Invalid joint types
- Missing parent/child links

**Example Output:**

**Valid URDF:**
```
robot name is: my_robot
---------- Successfully Parsed XML ---------------
root Link: base_link has 3 child(ren)
    child(1):  left_wheel
    child(2):  right_wheel
    child(3):  laser_link
```

**Invalid URDF:**
```
Error:   parent link [nonexistent_link] of joint [my_joint] not found
```

**Additional Tool: `urdf_to_graphiz`**

```bash
# Visualize URDF structure
urdf_to_graphiz robot.urdf

# Creates robot.pdf with graph visualization
```

**In Launch File:**

```python
# Add assertion to catch errors early
assert os.path.exists(urdf_file), f"URDF file not found: {urdf_file}"
```

**Interview Insight:**
Always validate URDF with `check_urdf` before deployment. Catches syntax errors, missing links, and kinematic loops.

---

### Q5: What are common causes of "transform timeout" errors when using URDF?

**Difficulty:** ⭐⭐⭐⭐ (Hard)

**Answer:**

**Error:**
```
Lookup would require extrapolation into the future. Requested time [...] but the latest data is at time [...]
```

**Causes:**

**1. robot_state_publisher Not Running:**
- TF not published
- Solution: Start robot_state_publisher

**2. joint_states Not Published:**
- robot_state_publisher can't compute FK
- Solution: Publish joint_states from robot driver

**3. Timestamp Mismatch:**
```cpp
// Wrong: Using now() for historical sensor data
auto transform = tf_buffer->lookupTransform("map", "laser_link", node->now());

// Correct: Use sensor timestamp
auto transform = tf_buffer->lookupTransform("map", "laser_link", sensor_msg->header.stamp);
```

**4. Clock Skew:**
- Simulation time vs wall time mismatch
- Solution: Set `use_sim_time` consistently

**5. Missing Fixed Joint:**
```xml
<!-- No joint connecting sensor to base -->
<link name="base_link"/>
<link name="laser_link"/>  <!-- Orphan! Not connected -->

<!-- Add joint -->
<joint name="laser_joint" type="fixed">
  <parent link="base_link"/>
  <child link="laser_link"/>
</joint>
```

**6. Joint States Not Published Fast Enough:**
```cpp
// Publish at least 10 Hz
timer_ = create_wall_timer(100ms, [this]() {
    publish_joint_states();
});
```

**Debugging:**

```bash
# Check if robot_state_publisher running
ros2 node list | grep robot_state_publisher

# Check TF tree
ros2 run tf2_tools view_frames

# Echo TF
ros2 run tf2_ros tf2_echo base_link laser_link

# Check joint_states
ros2 topic hz /joint_states
```

**Interview Insight:**
Transform timeouts often caused by missing robot_state_publisher, unpublished joint_states, or timestamp mismatches. Check TF tree with `view_frames`.

---

## PRACTICE_TASKS

### Task 1: Create Mobile Robot URDF

Design URDF for differential drive robot with:
- Chassis (box)
- 2 drive wheels
- 1 caster wheel
- Lidar sensor
- Camera

Use Xacro with macros. Validate with check_urdf.

---

### Task 2: Visualize Robot in RViz

Create launch file that:
- Loads robot URDF
- Starts robot_state_publisher
- Launches RViz with robot model
- Adds joint_state_publisher_gui for joint control

---

### Task 3: Add Inertial Properties

Take existing URDF and:
- Calculate correct inertia tensors
- Set realistic masses
- Place inertial origins at COM
- Test in Gazebo for stability

---

## QUICK_REFERENCE

### Joint Types

```
fixed       - No movement
revolute    - Rotation with limits
continuous  - Unlimited rotation
prismatic   - Linear motion
floating    - 6-DOF (simulation)
planar      - 2D motion
```

### Geometry Types

```xml
<box size="x y z"/>
<cylinder radius="r" length="l"/>
<sphere radius="r"/>
<mesh filename="package://pkg/mesh.stl"/>
```

### Xacro Basics

```xml
<!-- Property -->
<xacro:property name="var" value="1.0"/>

<!-- Use property -->
<size value="${var * 2}"/>

<!-- Macro -->
<xacro:macro name="wheel" params="prefix">
  <link name="${prefix}_wheel"/>
</xacro:macro>

<!-- Call macro -->
<xacro:wheel prefix="left"/>
```

### Validation

```bash
check_urdf robot.urdf                    # Validate URDF
xacro file.xacro | check_urdf            # Validate xacro
urdf_to_graphiz robot.urdf               # Visualize structure
ros2 run tf2_tools view_frames           # Check TF tree
```

---

**END OF TOPIC 3.2**
