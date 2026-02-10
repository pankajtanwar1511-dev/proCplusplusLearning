# Chapter 5: Robotics Applications
## Topic 5.4: Simulation with Gazebo

---

## THEORY

### 1. Why Simulation?

**Benefits:**

| Benefit | Description |
|---------|-------------|
| **Safe Testing** | Test dangerous scenarios (collisions, failures) without risking hardware |
| **Rapid Prototyping** | Iterate designs quickly without building physical robots |
| **Reproducibility** | Exact same conditions every time |
| **Cost Effective** | No hardware needed for development |
| **Parallel Development** | Multiple developers test simultaneously |
| **Edge Cases** | Test rare conditions (sensor failures, extreme weather) |

**Limitations:**

- **Sim-to-Real Gap**: Physics approximations don't match reality
- **Sensor Modeling**: Simplified (noise, distortion imperfect)
- **Computation**: High-fidelity simulation is slow
- **Material Properties**: Friction, compliance hard to model accurately

---

### 2. Gazebo Architecture

**Gazebo Fortress/Garden (New) vs Gazebo Classic:**

| Feature | Gazebo Classic (11) | Gazebo (Fortress+) |
|---------|---------------------|---------------------|
| **Architecture** | Monolithic | Modular (Ignition libraries) |
| **Performance** | Single-threaded | Multi-threaded |
| **Physics Engines** | ODE, Bullet, Simbody | DART, TPE, Bullet |
| **Rendering** | OGRE 1.x | OGRE 2.x (PBR) |
| **ROS2 Integration** | ros_gz_bridge | Native ros_gz |

**Core Components:**

**A. World:**
- Contains models, lights, physics
- Defined in SDF (Simulation Description Format)

**B. Models:**
- Robots, objects, sensors
- Links (rigid bodies) + Joints (connections)
- Visual (appearance) + Collision (physics)

**C. Physics Engine:**
- Computes dynamics (forces, velocities, collisions)
- Options: ODE (fast), DART (accurate), Bullet (gaming)

**D. Sensors:**
- Camera, lidar, IMU, GPS, force/torque
- Generate simulated data

**E. Plugins:**
- Custom behaviors (controllers, sensors, world logic)
- C++ shared libraries loaded at runtime

---

### 3. SDF (Simulation Description Format)

**vs URDF:**

| Aspect | URDF | SDF |
|--------|------|-----|
| **Purpose** | Robot description | World + robots |
| **Scope** | Single robot | Multiple models |
| **Physics** | No physics params | Full physics support |
| **Sensors** | Limited | Comprehensive |
| **Gazebo** | Needs `<gazebo>` tags | Native |

**Basic SDF Structure:**

```xml
<?xml version="1.0"?>
<sdf version="1.8">
  <world name="my_world">
    <!-- Physics -->
    <physics type="ode">
      <max_step_size>0.001</max_step_size>
      <real_time_factor>1.0</real_time_factor>
    </physics>

    <!-- Lighting -->
    <light name="sun" type="directional">
      <pose>0 0 10 0 0 0</pose>
      <diffuse>1 1 1 1</diffuse>
      <specular>0.5 0.5 0.5 1</specular>
      <direction>-0.5 -0.5 -1</direction>
    </light>

    <!-- Ground plane -->
    <model name="ground_plane">
      <static>true</static>
      <link name="link">
        <collision name="collision">
          <geometry>
            <plane><normal>0 0 1</normal></plane>
          </geometry>
        </collision>
        <visual name="visual">
          <geometry>
            <plane><normal>0 0 1</normal></plane>
          </geometry>
        </visual>
      </link>
    </model>

    <!-- Custom model -->
    <model name="box">
      <pose>0 0 0.5 0 0 0</pose>
      <link name="link">
        <inertial>
          <mass>1.0</mass>
          <inertia>
            <ixx>0.166667</ixx>
            <iyy>0.166667</iyy>
            <izz>0.166667</izz>
          </inertia>
        </inertial>

        <collision name="collision">
          <geometry>
            <box><size>1 1 1</size></box>
          </geometry>
        </collision>

        <visual name="visual">
          <geometry>
            <box><size>1 1 1</size></box>
          </geometry>
          <material>
            <ambient>1 0 0 1</ambient>
            <diffuse>1 0 0 1</diffuse>
          </material>
        </visual>
      </link>
    </model>

  </world>
</sdf>
```

---

### 4. URDF to Gazebo Integration

**URDF with Gazebo Tags:**

```xml
<robot name="my_robot">
  <!-- Robot links and joints -->
  <link name="base_link">
    <visual>
      <geometry>
        <box size="0.6 0.4 0.2"/>
      </geometry>
    </visual>
    <collision>
      <geometry>
        <box size="0.6 0.4 0.2"/>
      </geometry>
    </collision>
    <inertial>
      <mass value="50.0"/>
      <inertia ixx="1.0" ixy="0.0" ixz="0.0"
               iyy="1.0" iyz="0.0" izz="1.0"/>
    </inertial>
  </link>

  <!-- Gazebo-specific properties -->
  <gazebo reference="base_link">
    <material>Gazebo/Orange</material>
    <mu1>0.8</mu1>  <!-- Friction coefficient -->
    <mu2>0.8</mu2>
    <kp>1000000.0</kp>  <!-- Contact stiffness -->
    <kd>100.0</kd>  <!-- Contact damping -->
  </gazebo>

  <!-- Sensor plugin -->
  <gazebo reference="camera_link">
    <sensor name="camera" type="camera">
      <update_rate>30.0</update_rate>
      <camera>
        <horizontal_fov>1.047</horizontal_fov>
        <image>
          <width>640</width>
          <height>480</height>
          <format>R8G8B8</format>
        </image>
        <clip>
          <near>0.1</near>
          <far>100.0</far>
        </clip>
      </camera>
      <plugin name="camera_controller" filename="libgazebo_ros_camera.so">
        <frame_name>camera_link_optical</frame_name>
      </plugin>
    </sensor>
  </gazebo>

  <!-- Controller plugin -->
  <gazebo>
    <plugin name="diff_drive" filename="libgazebo_ros_diff_drive.so">
      <left_joint>left_wheel_joint</left_joint>
      <right_joint>right_wheel_joint</right_joint>
      <wheel_separation>0.4</wheel_separation>
      <wheel_diameter>0.2</wheel_diameter>
      <max_wheel_torque>20</max_wheel_torque>
      <max_wheel_acceleration>1.0</max_wheel_acceleration>
      <command_topic>cmd_vel</command_topic>
      <publish_odom>true</publish_odom>
      <publish_odom_tf>true</publish_odom_tf>
      <publish_wheel_tf>false</publish_wheel_tf>
      <odometry_topic>odom</odometry_topic>
      <odometry_frame>odom</odometry_frame>
      <robot_base_frame>base_link</robot_base_frame>
    </plugin>
  </gazebo>
</robot>
```

---

### 5. Sensor Simulation

**A. Camera**

```xml
<gazebo reference="camera_link">
  <sensor name="camera" type="camera">
    <update_rate>30</update_rate>
    <visualize>true</visualize>
    <camera>
      <horizontal_fov>1.047</horizontal_fov>  <!-- 60 degrees -->
      <image>
        <width>640</width>
        <height>480</height>
      </image>
      <clip>
        <near>0.1</near>
        <far>100</far>
      </clip>
      <!-- Noise model -->
      <noise>
        <type>gaussian</type>
        <mean>0.0</mean>
        <stddev>0.007</stddev>
      </noise>
    </camera>
    <plugin name="camera_plugin" filename="libgazebo_ros_camera.so">
      <ros>
        <namespace>/robot</namespace>
        <remapping>image_raw:=camera/image</remapping>
        <remapping>camera_info:=camera/camera_info</remapping>
      </ros>
      <camera_name>front_camera</camera_name>
      <frame_name>camera_link_optical</frame_name>
    </plugin>
  </sensor>
</gazebo>
```

**B. Lidar (Ray Sensor)**

```xml
<gazebo reference="lidar_link">
  <sensor name="lidar" type="gpu_ray">
    <update_rate>10</update_rate>
    <visualize>true</visualize>
    <ray>
      <scan>
        <horizontal>
          <samples>360</samples>  <!-- Points per scan -->
          <resolution>1</resolution>
          <min_angle>-3.14159</min_angle>  <!-- -180° -->
          <max_angle>3.14159</max_angle>   <!-- +180° -->
        </horizontal>
      </scan>
      <range>
        <min>0.1</min>  <!-- Minimum range (m) -->
        <max>30.0</max>  <!-- Maximum range (m) -->
        <resolution>0.01</resolution>
      </range>
      <noise>
        <type>gaussian</type>
        <mean>0.0</mean>
        <stddev>0.01</stddev>  <!-- 1cm noise -->
      </noise>
    </ray>
    <plugin name="lidar_plugin" filename="libgazebo_ros_ray_sensor.so">
      <ros>
        <remapping>~/out:=scan</remapping>
      </ros>
      <output_type>sensor_msgs/LaserScan</output_type>
      <frame_name>lidar_link</frame_name>
    </plugin>
  </sensor>
</gazebo>
```

**C. IMU (Inertial Measurement Unit)**

```xml
<gazebo reference="imu_link">
  <sensor name="imu" type="imu">
    <update_rate>100</update_rate>
    <imu>
      <!-- Accelerometer -->
      <angular_velocity>
        <x>
          <noise type="gaussian">
            <mean>0.0</mean>
            <stddev>2e-4</stddev>  <!-- rad/s -->
          </noise>
        </x>
        <!-- y, z similar -->
      </angular_velocity>
      <linear_acceleration>
        <x>
          <noise type="gaussian">
            <mean>0.0</mean>
            <stddev>1.7e-2</stddev>  <!-- m/s² -->
          </noise>
        </x>
        <!-- y, z similar -->
      </linear_acceleration>
    </imu>
    <plugin name="imu_plugin" filename="libgazebo_ros_imu_sensor.so">
      <ros>
        <remapping>~/out:=imu/data</remapping>
      </ros>
      <frame_name>imu_link</frame_name>
    </plugin>
  </sensor>
</gazebo>
```

**D. Depth Camera (RGB-D)**

```xml
<gazebo reference="camera_link">
  <sensor name="rgbd_camera" type="depth">
    <update_rate>30</update_rate>
    <camera>
      <horizontal_fov>1.047</horizontal_fov>
      <image>
        <width>640</width>
        <height>480</height>
        <format>R8G8B8</format>
      </image>
      <clip>
        <near>0.1</near>
        <far>10.0</far>
      </clip>
    </camera>
    <plugin name="depth_camera_plugin" filename="libgazebo_ros_camera.so">
      <ros>
        <remapping>image_raw:=camera/rgb/image_raw</remapping>
        <remapping>depth/image_raw:=camera/depth/image_raw</remapping>
        <remapping>points:=camera/depth/points</remapping>
      </ros>
      <camera_name>rgbd</camera_name>
      <frame_name>camera_link_optical</frame_name>
      <hack_baseline>0.07</hack_baseline>  <!-- For point cloud generation -->
    </plugin>
  </sensor>
</gazebo>
```

---

### 6. Physics Configuration

**Physics Engines:**

**A. ODE (Open Dynamics Engine):**
- Default in Gazebo Classic
- Fast
- Less accurate (drift over time)
- Good for: Mobile robots, basic manipulation

**B. DART (Dynamic Animation and Robotics Toolkit):**
- More accurate
- Slower
- Better constraint handling
- Good for: Manipulation, humanoids

**C. Bullet:**
- Gaming physics engine
- Fast
- Good collision detection
- Good for: Multi-robot simulation

**Physics Parameters:**

```xml
<physics type="ode">
  <!-- Simulation step -->
  <max_step_size>0.001</max_step_size>  <!-- 1ms timestep -->
  <real_time_factor>1.0</real_time_factor>  <!-- 1× real-time -->
  <real_time_update_rate>1000</real_time_update_rate>  <!-- 1000 Hz -->

  <!-- ODE-specific -->
  <ode>
    <solver>
      <type>quick</type>  <!-- quick, world -->
      <iters>50</iters>  <!-- Iterations for constraint solver -->
      <sor>1.3</sor>  <!-- Successive over-relaxation -->
    </solver>
    <constraints>
      <cfm>0.0</cfm>  <!-- Constraint force mixing (softness) -->
      <erp>0.2</erp>  <!-- Error reduction parameter -->
      <contact_max_correcting_vel>100.0</contact_max_correcting_vel>
      <contact_surface_layer>0.001</contact_surface_layer>
    </constraints>
  </ode>
</physics>
```

**Gravity:**

```xml
<gravity>0 0 -9.81</gravity>  <!-- m/s² -->
```

**Contact Properties (Friction, Bouncing):**

```xml
<gazebo reference="wheel_link">
  <mu1>1.0</mu1>  <!-- Friction coefficient 1 -->
  <mu2>1.0</mu2>  <!-- Friction coefficient 2 -->
  <kp>1000000.0</kp>  <!-- Contact stiffness (high = rigid) -->
  <kd>100.0</kd>  <!-- Contact damping -->
  <minDepth>0.001</minDepth>  <!-- Min penetration before contact -->
  <maxVel>0.1</maxVel>  <!-- Max velocity for contact resolution -->
  <fdir1>1 0 0</fdir1>  <!-- Friction direction -->
</gazebo>
```

---

## EDGE_CASES

### Edge Case 1: Simulation Slower Than Real-Time

**Scenario:**
Complex robot with many sensors → simulation runs at 0.5× real-time (twice as slow).

**Symptoms:**
```bash
Real time factor: 0.53  # Should be ~1.0
```

**Why:**
- Too many collision checks
- High-resolution sensors (4K camera, dense lidar)
- Complex physics (many joints, contacts)
- Inefficient models (high-poly meshes)

**Solution 1: Reduce Physics Complexity**

```xml
<!-- Reduce timestep iterations -->
<physics type="ode">
  <ode>
    <solver>
      <iters>20</iters>  <!-- Reduce from 50 to 20 -->
    </solver>
  </ode>
  <max_step_size>0.002</max_step_size>  <!-- Increase from 0.001 to 0.002 -->
</physics>
```

**Solution 2: Simplify Collision Geometry**

```xml
<!-- Use simple shapes for collision (not visual mesh) -->
<collision>
  <geometry>
    <box><size>0.5 0.3 0.2</size></box>  <!-- Simple box -->
  </geometry>
</collision>

<visual>
  <geometry>
    <mesh>
      <uri>model://robot/meshes/base_link.dae</uri>  <!-- Detailed mesh -->
    </mesh>
  </geometry>
</visual>
```

**Solution 3: Reduce Sensor Update Rates**

```xml
<!-- Camera: 30 Hz → 10 Hz -->
<update_rate>10</update_rate>

<!-- Lidar: 360 samples → 180 samples -->
<horizontal>
  <samples>180</samples>
</horizontal>
```

**Solution 4: Use GPU Sensors**

```xml
<!-- GPU-accelerated lidar (much faster) -->
<sensor name="lidar" type="gpu_ray">  <!-- was "ray" -->
  ...
</sensor>
```

**Solution 5: Disable GUI**

```bash
# Headless mode (no rendering)
gz sim -s world.sdf

# Or with gzserver only
gzserver world.sdf
```

**Interview Insight:**
Slow simulation is caused by complex physics or sensors. Reduce timestep iterations, simplify collision geometry, lower sensor rates, use GPU sensors, or run headless.

---

### Edge Case 2: Robot Falls Through Ground (Tunneling)

**Scenario:**
Fast-moving object (bullet, robot falling) passes through ground plane without collision.

**Why:**
- **Discrete collision detection**: Checks only at timesteps
- Large timestep + high velocity → object teleports through thin obstacles
- Example: Timestep = 0.01s, velocity = 10 m/s → moves 0.1m per step (may skip collision)

**Visualization:**
```
Frame 1: Object above ground ●
                            ───── ground

Frame 2: Object below ground (missed collision!)
         ───── ground
           ●
```

**Solution 1: Reduce Physics Timestep**

```xml
<physics>
  <max_step_size>0.001</max_step_size>  <!-- Smaller = more checks -->
</physics>
```

**Solution 2: Increase Ground Thickness**

```xml
<collision name="ground_collision">
  <geometry>
    <box><size>100 100 0.5</size></box>  <!-- Thick ground (0.5m) -->
  </geometry>
  <pose>0 0 -0.25 0 0 0</pose>  <!-- Half buried -->
</collision>
```

**Solution 3: Set Contact Properties**

```xml
<gazebo reference="base_link">
  <kp>1000000.0</kp>  <!-- High stiffness (rigid contact) -->
  <kd>100.0</kd>
  <maxVel>0.1</maxVel>  <!-- Limit correction velocity -->
  <minDepth>0.001</minDepth>  <!-- Detect shallow penetrations -->
</gazebo>
```

**Solution 4: Enable CCD (Continuous Collision Detection)**

Some engines (Bullet) support CCD:
```xml
<physics type="bullet">
  <bullet>
    <solver>
      <type>sequential_impulse</type>
    </solver>
    <constraints>
      <use_ccd>true</use_ccd>  <!-- Continuous collision detection -->
    </constraints>
  </bullet>
</physics>
```

**Interview Insight:**
Tunneling occurs when objects move too fast relative to physics timestep. Solutions: smaller timestep, thicker obstacles, higher contact stiffness, or continuous collision detection (CCD).

---

### Edge Case 3: Sensor Noise Too Idealistic (Sim-to-Real Gap)

**Scenario:**
Algorithm works perfectly in simulation but fails on real robot due to sensor noise/errors.

**Problem:**
```
Simulation: Lidar noise = 1cm, Gaussian
Real robot: Lidar has:
  - 1-5cm noise (worse at long range)
  - Outliers (reflections, multi-path)
  - Missing returns (black surfaces)
  - Beam divergence
```

**Solution 1: Add Realistic Noise Models**

```xml
<ray>
  <noise>
    <type>gaussian</type>
    <mean>0.0</mean>
    <stddev>0.03</stddev>  <!-- 3cm noise (more realistic) -->
  </noise>
</ray>
```

**Solution 2: Add Outliers/Drop-outs**

Custom Gazebo plugin:
```cpp
// In sensor plugin
void OnNewLaserScans(ConstLaserScanStampedPtr &_msg) {
    auto scan = *_msg;

    for (int i = 0; i < scan.ranges_size(); i++) {
        // Add outliers (10% of readings)
        if (rand() % 10 == 0) {
            scan.ranges(i) = scan.range_max();  // Max range (dropout)
        }

        // Add noise proportional to distance
        double noise = randn(0, 0.01 * scan.ranges(i));  // 1% of range
        scan.ranges(i) += noise;
    }

    publisher_->Publish(scan);
}
```

**Solution 3: Simulate Material Properties**

```xml
<!-- Black surface (absorbs lidar) -->
<gazebo reference="black_box">
  <material>Gazebo/Black</material>
  <sensor_material>  <!-- Custom property -->
    <lidar_return_probability>0.3</lidar_return_probability>
  </sensor_material>
</gazebo>
```

**Solution 4: Add Camera Distortion**

```xml
<camera>
  <distortion>
    <k1>-0.25</k1>  <!-- Radial distortion -->
    <k2>0.12</k2>
    <k3>0.0</k3>
    <p1>-0.00028</p1>  <!-- Tangential distortion -->
    <p2>-0.00005</p2>
    <center>0.5 0.5</center>
  </distortion>
</camera>
```

**Solution 5: Domain Randomization**

Vary simulation parameters to increase robustness:
```python
# Randomize lighting
light_intensity = random.uniform(0.5, 1.5)

# Randomize object poses
object_pose.x += random.gauss(0, 0.1)

# Randomize friction
friction = random.uniform(0.5, 1.5)
```

**Interview Insight:**
Sim-to-real gap is major challenge. Add realistic noise models, outliers, material properties, sensor distortion, and use domain randomization to make simulation less idealistic.

---

### Edge Case 4: Joint Drifts Over Time (Integrator Error)

**Scenario:**
Robot arm with gravity compensation holds position in simulation, but slowly drifts downward over hours.

**Why:**
- Numerical integration errors accumulate
- Constraint violations (joint limits, contacts)
- Insufficient solver iterations
- Floating-point precision limits

**Detection:**
```cpp
// Monitor joint positions
void joint_state_callback(const sensor_msgs::msg::JointState::SharedPtr msg) {
    static double prev_position = 0.0;
    double current_position = msg->position[0];

    double drift = current_position - prev_position;

    if (abs(drift) > 0.001) {  // 1mm drift per update
        RCLCPP_WARN(get_logger(), "Joint drifting: %.3f", drift);
    }

    prev_position = current_position;
}
```

**Solution 1: Increase Solver Iterations**

```xml
<physics type="ode">
  <ode>
    <solver>
      <iters>100</iters>  <!-- Increase from 50 -->
      <sor>1.4</sor>  <!-- Improve convergence -->
    </solver>
  </ode>
</physics>
```

**Solution 2: Adjust Constraint Parameters**

```xml
<constraints>
  <cfm>0.00001</cfm>  <!-- Constraint force mixing (lower = stiffer) -->
  <erp>0.3</erp>  <!-- Error reduction (higher = faster correction) -->
</constraints>
```

**Solution 3: Use Better Physics Engine**

```xml
<!-- Switch to DART (more accurate) -->
<physics type="dart">
  <dart>
    <solver>
      <solver_type>dantzig</solver_type>  <!-- Better constraint solver -->
    </solver>
  </dart>
</physics>
```

**Solution 4: Add Joint Damping**

```xml
<joint name="joint1" type="revolute">
  <dynamics>
    <damping>0.5</damping>  <!-- Resists motion (stabilizes) -->
    <friction>0.1</friction>
  </dynamics>
</joint>
```

**Solution 5: Reset Periodically (Last Resort)**

```cpp
// If drift detected, reset to known state
if (drift > threshold) {
    gz_reset_world_client_->async_send_request(request);
}
```

**Interview Insight:**
Joint drift is caused by numerical integration errors. Increase solver iterations, adjust constraint parameters (CFM/ERP), use more accurate physics engines (DART), add joint damping, or reset periodically.

---

## CODE_EXAMPLES

### Example 1: Launch Gazebo with Custom World

**File: `spawn_robot.launch.py`**

```python
#!/usr/bin/env python3
import os
from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import IncludeLaunchDescription, ExecuteProcess
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch_ros.actions import Node

def generate_launch_description():
    pkg_ros_gz_sim = get_package_share_directory('ros_gz_sim')
    pkg_my_robot = get_package_share_directory('my_robot_description')

    # Gazebo launch
    gazebo = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(
            os.path.join(pkg_ros_gz_sim, 'launch', 'gz_sim.launch.py')
        ),
        launch_arguments={
            'gz_args': '-r empty.sdf'  # Empty world, run simulation
        }.items()
    )

    # Spawn robot
    spawn_robot = Node(
        package='ros_gz_sim',
        executable='create',
        arguments=[
            '-name', 'my_robot',
            '-topic', '/robot_description',
            '-x', '0.0',
            '-y', '0.0',
            '-z', '0.5'
        ],
        output='screen'
    )

    # ROS-Gazebo bridge (topics)
    bridge = Node(
        package='ros_gz_bridge',
        executable='parameter_bridge',
        arguments=[
            '/cmd_vel@geometry_msgs/msg/Twist@gz.msgs.Twist',
            '/odom@nav_msgs/msg/Odometry@gz.msgs.Odometry',
            '/scan@sensor_msgs/msg/LaserScan@gz.msgs.LaserScan',
            '/camera/image@sensor_msgs/msg/Image@gz.msgs.Image',
            '/imu@sensor_msgs/msg/Imu@gz.msgs.IMU',
        ],
        output='screen'
    )

    # Robot state publisher
    robot_description = open(os.path.join(pkg_my_robot, 'urdf', 'robot.urdf')).read()

    robot_state_publisher = Node(
        package='robot_state_publisher',
        executable='robot_state_publisher',
        parameters=[{'robot_description': robot_description}],
        output='screen'
    )

    return LaunchDescription([
        gazebo,
        spawn_robot,
        bridge,
        robot_state_publisher,
    ])
```

---

### Example 2: Custom Gazebo Plugin (Apply Force)

**File: `push_plugin.cpp`**

```cpp
#include <gazebo/gazebo.hh>
#include <gazebo/physics/physics.hh>
#include <rclcpp/rclcpp.hpp>
#include <geometry_msgs/msg/wrench.hpp>

namespace gazebo {

class PushPlugin : public ModelPlugin {
public:
    PushPlugin() : ModelPlugin() {}

    void Load(physics::ModelPtr _model, sdf::ElementPtr _sdf) override {
        // Store model pointer
        model_ = _model;
        link_ = model_->GetLink("base_link");

        if (!link_) {
            gzerr << "Link 'base_link' not found!\n";
            return;
        }

        // Initialize ROS2
        if (!rclcpp::ok()) {
            rclcpp::init(0, nullptr);
        }

        node_ = rclcpp::Node::make_shared("push_plugin");

        // Subscribe to force commands
        force_sub_ = node_->create_subscription<geometry_msgs::msg::Wrench>(
            "/apply_force", 10,
            std::bind(&PushPlugin::OnForceMsg, this, std::placeholders::_1));

        // Spin in separate thread
        ros_thread_ = std::thread([this]() { rclcpp::spin(node_); });

        // Connect to world update event
        update_connection_ = event::Events::ConnectWorldUpdateBegin(
            std::bind(&PushPlugin::OnUpdate, this));

        gzmsg << "Push plugin loaded for model: " << model_->GetName() << "\n";
    }

    ~PushPlugin() {
        rclcpp::shutdown();
        if (ros_thread_.joinable()) {
            ros_thread_.join();
        }
    }

private:
    void OnForceMsg(const geometry_msgs::msg::Wrench::SharedPtr msg) {
        std::lock_guard<std::mutex> lock(mutex_);
        force_.Set(msg->force.x, msg->force.y, msg->force.z);
        torque_.Set(msg->torque.x, msg->torque.y, msg->torque.z);
        apply_force_ = true;
    }

    void OnUpdate() {
        std::lock_guard<std::mutex> lock(mutex_);

        if (apply_force_) {
            // Apply force to link
            link_->AddForce(force_);
            link_->AddTorque(torque_);

            // One-time application (or continuous if desired)
            apply_force_ = false;
        }
    }

    physics::ModelPtr model_;
    physics::LinkPtr link_;
    rclcpp::Node::SharedPtr node_;
    rclcpp::Subscription<geometry_msgs::msg::Wrench>::SharedPtr force_sub_;

    event::ConnectionPtr update_connection_;
    std::thread ros_thread_;
    std::mutex mutex_;

    ignition::math::Vector3d force_;
    ignition::math::Vector3d torque_;
    bool apply_force_ = false;
};

// Register plugin
GZ_REGISTER_MODEL_PLUGIN(PushPlugin)

}  // namespace gazebo
```

**Usage in URDF:**

```xml
<gazebo>
  <plugin name="push_plugin" filename="libpush_plugin.so"/>
</gazebo>
```

**Apply force from ROS2:**

```bash
ros2 topic pub /apply_force geometry_msgs/msg/Wrench "{force: {x: 10.0, y: 0.0, z: 0.0}}"
```

---

### Example 3: Spawn Multiple Objects Programmatically

**File: `spawn_objects.py`**

```python
#!/usr/bin/env python3
import rclpy
from rclpy.node import Node
from gazebo_msgs.srv import SpawnEntity
import random

class ObjectSpawner(Node):
    def __init__(self):
        super().__init__('object_spawner')

        self.spawn_client = self.create_client(SpawnEntity, '/spawn_entity')

        while not self.spawn_client.wait_for_service(timeout_sec=1.0):
            self.get_logger().info('Waiting for /spawn_entity service...')

        self.spawn_boxes(10)

    def spawn_boxes(self, count):
        """Spawn multiple boxes at random positions."""
        box_sdf = """
        <?xml version="1.0"?>
        <sdf version="1.6">
          <model name="box">
            <static>false</static>
            <link name="link">
              <collision name="collision">
                <geometry>
                  <box><size>0.5 0.5 0.5</size></box>
                </geometry>
              </collision>
              <visual name="visual">
                <geometry>
                  <box><size>0.5 0.5 0.5</size></box>
                </geometry>
                <material>
                  <ambient>{r} {g} {b} 1</ambient>
                  <diffuse>{r} {g} {b} 1</diffuse>
                </material>
              </visual>
              <inertial>
                <mass>1.0</mass>
                <inertia>
                  <ixx>0.083</ixx><iyy>0.083</iyy><izz>0.083</izz>
                </inertia>
              </inertial>
            </link>
          </model>
        </sdf>
        """

        for i in range(count):
            # Random position
            x = random.uniform(-5, 5)
            y = random.uniform(-5, 5)
            z = 0.25  # Half box height

            # Random color
            r = random.random()
            g = random.random()
            b = random.random()

            # Format SDF with color
            sdf = box_sdf.format(r=r, g=g, b=b)

            # Create request
            request = SpawnEntity.Request()
            request.name = f'box_{i}'
            request.xml = sdf
            request.robot_namespace = ''
            request.initial_pose.position.x = x
            request.initial_pose.position.y = y
            request.initial_pose.position.z = z
            request.reference_frame = 'world'

            # Spawn
            future = self.spawn_client.call_async(request)
            rclpy.spin_until_future_complete(self, future)

            if future.result().success:
                self.get_logger().info(f'Spawned {request.name} at ({x:.2f}, {y:.2f})')
            else:
                self.get_logger().error(f'Failed to spawn {request.name}')

def main(args=None):
    rclpy.init(args=args)
    spawner = ObjectSpawner()
    spawner.destroy_node()
    rclpy.shutdown()

if __name__ == '__main__':
    main()
```

---

## INTERVIEW_QA

### Q1: What is the difference between visual and collision geometry in Gazebo?

**Difficulty:** ⭐⭐ (Easy)

**Answer:**

**Visual Geometry:**
- **Purpose**: Rendering (what you see)
- **Used by**: Gazebo GUI, cameras
- **Can be**: High-detail meshes, textures
- **Performance**: Affects rendering FPS, not physics

**Collision Geometry:**
- **Purpose**: Physics simulation (collision detection)
- **Used by**: Physics engine
- **Should be**: Simple shapes (boxes, cylinders, spheres)
- **Performance**: Affects physics update rate

**Why Separate:**

Complex meshes are expensive for collision detection. Use detailed visual mesh, simple collision shape:

```xml
<link name="robot_body">
  <!-- Visual: detailed mesh -->
  <visual>
    <geometry>
      <mesh><uri>model://robot/meshes/body.dae</uri></mesh>
    </geometry>
  </visual>

  <!-- Collision: simple box (much faster) -->
  <collision>
    <geometry>
      <box><size>0.6 0.4 0.2</size></box>
    </geometry>
  </collision>
</link>
```

**Example:**

```
Humanoid robot:
Visual: 10,000 triangles (realistic appearance)
Collision: 15 boxes (head, torso, arms, legs)

Physics: Only checks 15 boxes → fast ✓
Visual: Renders detailed mesh → looks good ✓
```

**Interview Insight:**
Visual geometry is for rendering (can be complex), collision geometry is for physics (should be simple). Separating them optimizes both appearance and performance.

---

### Q2: How does Gazebo integrate with ROS2?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

Gazebo and ROS2 are separate systems. Integration happens via **ros_gz_bridge** (message translation).

**Architecture:**

```
ROS2 Node ←→ ROS2 Topics ←→ ros_gz_bridge ←→ Gazebo Topics ←→ Gazebo Plugin
```

**Message Translation:**

ros_gz_bridge translates between ROS2 and Gazebo message types:

| ROS2 | Gazebo (Ignition) |
|------|-------------------|
| `geometry_msgs/Twist` | `gz.msgs.Twist` |
| `sensor_msgs/LaserScan` | `gz.msgs.LaserScan` |
| `sensor_msgs/Image` | `gz.msgs.Image` |
| `nav_msgs/Odometry` | `gz.msgs.Odometry` |

**Example Bridge:**

```bash
ros2 run ros_gz_bridge parameter_bridge \
    /cmd_vel@geometry_msgs/msg/Twist@gz.msgs.Twist \
    /scan@sensor_msgs/msg/LaserScan@gz.msgs.LaserScan
```

Format: `topic@ROS_type@GZ_type`

**Plugin-Based Integration:**

Gazebo plugins subscribe to Gazebo topics, publish to ROS2 via bridge:

```xml
<!-- Camera plugin publishes to Gazebo topic -->
<plugin name="camera_plugin" filename="libgazebo_ros_camera.so">
  <ros>
    <remapping>image_raw:=camera/image</remapping>  <!-- ROS2 topic -->
  </ros>
</plugin>
```

**Internally:**
1. Plugin generates image
2. Publishes to Gazebo topic `/gazebo/camera/image`
3. Bridge translates to ROS2 topic `/camera/image`
4. ROS2 nodes subscribe to `/camera/image`

**TF Integration:**

```bash
# Bridge Gazebo poses to TF2
ros2 run ros_gz_bridge parameter_bridge \
    /model/robot/pose@tf2_msgs/msg/TFMessage@gz.msgs.Pose_V
```

**Services:**

```bash
# Spawn entity service
ros2 service call /spawn_entity gazebo_msgs/srv/SpawnEntity ...
```

**Interview Insight:**
Gazebo and ROS2 integrate via ros_gz_bridge, which translates messages between systems. Gazebo plugins publish to Gazebo topics, bridge forwards to ROS2, where nodes subscribe.

---

### Q3: What causes the "sim-to-real gap" and how can it be reduced?

**Difficulty:** ⭐⭐⭐⭐ (Hard)

**Answer:**

**Sim-to-Real Gap:**

Algorithms work in simulation but fail on real robots due to differences between simulated and real environments.

**Causes:**

**1. Physics Approximations:**
- Simplified friction models (Coulomb friction vs complex real-world)
- Contact modeling (stiff spring-damper vs real material compliance)
- Numerical integration errors (discrete timesteps)

**2. Sensor Modeling:**
- Idealistic noise (Gaussian vs complex real noise)
- Missing artifacts (reflections, multi-path, sun interference)
- Perfect calibration (real sensors have biases)

**3. Actuator Modeling:**
- Instantaneous response (real actuators have delays, backlash)
- Perfect control (real motors have saturation, heating)
- No wear/tear (real robots degrade over time)

**4. Environment Differences:**
- Lighting (sim: uniform, real: shadows, glare)
- Textures (sim: smooth, real: scratches, dirt)
- Dynamics (sim: rigid, real: flexible, compliant)

**Reduction Strategies:**

**1. System Identification:**

Measure real robot parameters, update simulation:
```python
# Measure real robot inertia
real_inertia = measure_inertia_experimentally()

# Update URDF
urdf.link.inertial.ixx = real_inertia.ixx
```

**2. Domain Randomization:**

Randomize simulation parameters to increase robustness:
```python
# Randomize during training
friction = random.uniform(0.5, 1.5)
mass = random.uniform(0.9 * nominal, 1.1 * nominal)
light_intensity = random.uniform(0.5, 2.0)
camera_pos += random.gauss(0, 0.05)  # 5cm noise
```

Policy learns to be robust to variations → transfers better to real world.

**3. Realistic Sensor Models:**

Add real-world sensor characteristics:
```xml
<!-- Lidar with realistic noise -->
<noise>
  <type>gaussian</type>
  <stddev>0.03</stddev>  <!-- 3cm noise -->
</noise>

<!-- Add outliers (10% dropout rate) -->
<dropout_probability>0.1</dropout_probability>

<!-- Range-dependent noise -->
<noise_model>range_dependent</noise_model>
```

**4. Add Actuator Lag:**

Model motor response delays:
```cpp
// Command filtering (1st-order lag)
double tau = 0.05;  // 50ms time constant
cmd_filtered = cmd_filtered + (cmd_target - cmd_filtered) * dt / tau;
```

**5. Sim-to-Real Transfer Learning:**

Train in simulation, fine-tune on real robot:
```
1. Train policy in simulation (millions of samples)
2. Transfer to real robot
3. Collect real-world data (hundreds of samples)
4. Fine-tune policy on real data
```

**6. Physics Engine Tuning:**

Match simulation physics to reality:
```xml
<physics type="ode">
  <ode>
    <solver>
      <iters>50</iters>  <!-- More accurate -->
    </solver>
    <constraints>
      <cfm>0.00001</cfm>  <!-- Stiffer contacts -->
      <erp>0.3</erp>
    </constraints>
  </ode>
</physics>
```

**7. Perception-Based Sim:**

Use real images as Gazebo textures:
```python
# Replace sim textures with real camera images
gazebo_scene.set_texture(real_camera_image)
```

**Interview Insight:**
Sim-to-real gap arises from physics approximations, idealistic sensors, and simplified environments. Reduce with system identification, domain randomization, realistic sensor/actuator models, and sim-to-real transfer learning.

---

### Q4: How do you debug performance issues in Gazebo?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

**Profiling Tools:**

**1. Real-Time Factor:**

```bash
# Monitor in Gazebo GUI (bottom-right corner)
Real time factor: 0.72  # <1.0 = slower than real-time
```

**2. Gazebo Stats:**

```bash
# Subscribe to stats topic
gz topic -e /stats

# Shows:
# - sim_time: Simulation time
# - real_time: Wall-clock time
# - iterations: Physics update count
```

**3. Physics Profiling:**

```bash
# Enable profiling
export GZ_VERBOSE=1

# Gazebo will log timing:
# [physics] Step time: 5.2ms
# [collision] Check time: 3.1ms
# [contacts] Solve time: 1.8ms
```

**Common Bottlenecks:**

**1. Collision Detection:**

- **Symptom**: `[collision]` time high
- **Cause**: Complex collision meshes, many objects
- **Fix**: Simplify collision geometry, reduce object count

```xml
<!-- Replace mesh with simple shape -->
<collision>
  <geometry>
    <cylinder><radius>0.3</radius><length>0.5</length></cylinder>
  </geometry>
</collision>
```

**2. Sensors:**

- **Symptom**: FPS drops when robot turns (camera views complex scene)
- **Cause**: High-resolution sensors, many sensors
- **Fix**: Reduce resolution, lower update rates, use GPU sensors

```xml
<!-- Reduce camera resolution -->
<image>
  <width>320</width>  <!-- was 1920 -->
  <height>240</height>  <!-- was 1080 -->
</image>
<update_rate>10</update_rate>  <!-- was 30 -->
```

**3. Physics Solver:**

- **Symptom**: `[physics]` time high
- **Cause**: Many contacts, high solver iterations
- **Fix**: Reduce iterations, larger timestep, simpler physics

```xml
<ode>
  <solver>
    <iters>20</iters>  <!-- was 50 -->
  </solver>
</ode>
<max_step_size>0.002</max_step_size>  <!-- was 0.001 -->
```

**4. Rendering:**

- **Symptom**: GUI slow, physics fast
- **Cause**: Complex scenes, shadows, reflections
- **Fix**: Disable shadows, reduce visual detail, run headless

```bash
# Disable shadows in GUI
Edit → View → Shadows (uncheck)

# Or run headless (no GUI)
gzserver world.sdf
```

**Debugging Workflow:**

```
1. Measure real-time factor
   ↓
2. If <1.0, identify bottleneck:
   - Run headless → if faster, rendering issue
   - Disable sensors → if faster, sensor issue
   - Simplify world → if faster, collision issue
   ↓
3. Profile specific component (physics, collision, rendering)
   ↓
4. Apply targeted optimizations
   ↓
5. Re-measure real-time factor
```

**Interview Insight:**
Debug Gazebo performance by monitoring real-time factor, profiling physics/collision/rendering, and identifying bottlenecks. Common fixes: simplify collision, reduce sensor resolution, lower solver iterations, or run headless.

---

### Q5: What is domain randomization and why is it important for sim-to-real transfer?

**Difficulty:** ⭐⭐⭐⭐ (Hard)

**Answer:**

**Domain Randomization:**

Technique to train robust policies by randomizing simulation parameters, exposing model to diverse conditions.

**Concept:**

Instead of training in single deterministic simulation:
```
Train policy in simulation → Policy overfits to sim → Fails in real world ✗
```

Randomize simulation:
```
Train policy in many randomized simulations → Policy learns robust features → Transfers to real world ✓
```

**What to Randomize:**

**1. Visual Appearance:**
```python
# Textures
object.texture = random_texture()

# Colors
object.color = (random.random(), random.random(), random.random())

# Lighting
light.intensity = random.uniform(0.5, 2.0)
light.position = random.gauss(nominal_pos, std=0.5)
```

**2. Physics Parameters:**
```python
# Friction
object.friction = random.uniform(0.5, 1.5)

# Mass
object.mass = random.uniform(0.9 * nominal, 1.1 * nominal)

# Restitution (bounciness)
object.restitution = random.uniform(0.0, 0.5)

# Damping
joint.damping = random.uniform(0.1, 0.5)
```

**3. Sensor Characteristics:**
```python
# Camera
camera.noise_stddev = random.uniform(0.0, 0.01)
camera.fov = random.uniform(50, 70)  # Field of view

# Lidar
lidar.noise_stddev = random.uniform(0.01, 0.05)
lidar.dropout_rate = random.uniform(0.0, 0.1)

# IMU
imu.bias = random.gauss(0, 0.01)
```

**4. Object Poses:**
```python
# Target position
target.position.x += random.gauss(0, 0.1)
target.position.y += random.gauss(0, 0.1)

# Object orientation
object.orientation = random_quaternion()
```

**5. Dynamics:**
```python
# Wind/disturbances
apply_force(random.gauss(0, 10))  # Random wind

# Actuator lag
actuator_delay = random.uniform(0.01, 0.05)

# Payload variation
gripper.payload = random.uniform(0.0, 2.0)
```

**Why It Works:**

**Without Randomization:**
```
Simulation: Perfect friction=1.0, exact lighting
Policy: Learns to exploit these specific values
Real world: Friction=0.8, shadows, glare
Result: Policy fails (overfit to sim) ✗
```

**With Randomization:**
```
Simulation: Friction ∈ [0.5, 1.5], lighting ∈ [0.5, 2.0]
Policy: Learns robust features (works across variations)
Real world: Friction=0.8, shadows, glare (within randomized range)
Result: Policy succeeds (robust to variations) ✓
```

**Implementation Example:**

```python
class RandomizedEnv:
    def reset(self):
        # Randomize at each episode
        self.randomize_physics()
        self.randomize_visual()
        self.randomize_sensors()

        return self.get_observation()

    def randomize_physics(self):
        # Mass
        for link in self.robot.links:
            link.mass *= random.uniform(0.8, 1.2)

        # Friction
        for surface in self.world.surfaces:
            surface.friction = random.uniform(0.5, 1.5)

    def randomize_visual(self):
        # Lighting
        self.world.sun.intensity = random.uniform(0.5, 2.0)

        # Textures
        for object in self.world.objects:
            object.texture = self.random_texture_generator()

    def randomize_sensors(self):
        self.camera.noise_stddev = random.uniform(0.0, 0.02)
        self.lidar.dropout_rate = random.uniform(0.0, 0.15)
```

**Results:**

Studies show domain randomization significantly improves sim-to-real transfer:
- Without: 30% success rate on real robot
- With: 85% success rate on real robot

**Trade-offs:**

- **Pro**: Improves transfer, increases robustness
- **Con**: Requires more training samples (more diverse scenarios)
- **Con**: May hurt peak performance (optimizing for robustness, not one specific condition)

**Interview Insight:**
Domain randomization trains policies in diverse simulated conditions (physics, visuals, sensors), preventing overfitting to simulation specifics. Policy learns robust features that transfer better to real-world variations.

---

## PRACTICE_TASKS

### Task 1: Create Custom Gazebo World

**Goal:** Build simulation environment for mobile robot testing.

**Requirements:**
- Create world SDF with obstacles (walls, boxes, cylinders)
- Add lighting (sun + point lights)
- Configure physics (ODE, timestep=0.001s)
- Spawn mobile robot with lidar and camera
- Test navigation

**Bonus:**
- Add textures to ground/walls
- Create multi-room environment

---

### Task 2: Implement Custom Sensor Plugin

**Goal:** Create Gazebo plugin for custom sensor.

**Requirements:**
- Write C++ plugin that reads model pose
- Publish to ROS2 topic
- Add configurable noise
- Integrate with ros_gz_bridge

**Bonus:**
- Add sensor visualization in RViz
- Simulate sensor failures (dropout)

---

### Task 3: Optimize Simulation Performance

**Goal:** Make slow simulation run at real-time.

**Given:**
- Complex robot with 10 sensors
- Real-time factor: 0.5× (too slow)

**Tasks:**
- Profile bottlenecks
- Simplify collision geometry
- Reduce sensor rates
- Switch to GPU sensors
- Achieve real-time factor ≥ 0.95×

**Bonus:**
- Run headless (gzserver only)
- Parallelize multiple simulations

---

### Task 4: Domain Randomization for Sim-to-Real

**Goal:** Implement domain randomization for robot training.

**Requirements:**
- Randomize object poses at each reset
- Randomize lighting intensity and position
- Randomize friction coefficients
- Randomize sensor noise parameters
- Train RL policy with randomization

**Bonus:**
- Compare transfer performance with/without randomization
- Visualize randomization effects

---

## QUICK_REFERENCE

### Launch Gazebo

```bash
# Gazebo Classic
gazebo --verbose

# Gazebo Fortress (new)
gz sim -v 4

# With specific world
gz sim -r world.sdf

# Headless (no GUI)
gzserver world.sdf
```

### ros_gz_bridge

```bash
# Bridge single topic
ros2 run ros_gz_bridge parameter_bridge \
    /cmd_vel@geometry_msgs/msg/Twist@gz.msgs.Twist

# Bridge multiple topics (launch file recommended)
```

### Spawn Entity

```bash
# Spawn from SDF file
ros2 service call /spawn_entity gazebo_msgs/srv/SpawnEntity \
    "{name: 'my_robot', xml: '$(cat robot.sdf)', initial_pose: {position: {x: 0, y: 0, z: 0.5}}}"

# Spawn from URDF
ros2 run gazebo_ros spawn_entity.py \
    -entity robot_name \
    -topic /robot_description \
    -x 0 -y 0 -z 0.5
```

### Reset World

```bash
# Reset simulation
ros2 service call /reset_world std_srvs/srv/Empty
```

### Pause/Unpause

```bash
# Pause physics
ros2 service call /pause_physics std_srvs/srv/Empty

# Unpause
ros2 service call /unpause_physics std_srvs/srv/Empty
```

---

**END OF TOPIC 5.4: Simulation with Gazebo**
