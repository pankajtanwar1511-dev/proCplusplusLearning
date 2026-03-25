# Chapter 5: Robotics Applications
## Topic 5.5: SLAM & Localization

---

## THEORY

### 1. Localization vs Mapping vs SLAM

**Localization:**
- **Known map**, unknown robot pose
- "Where am I?"
- Example: AMCL (Adaptive Monte Carlo Localization)

**Mapping:**
- **Known poses**, create map
- "What does the environment look like?"
- Example: gmapping with perfect odometry

**SLAM (Simultaneous Localization And Mapping):**
- **Unknown map AND unknown pose**
- "Where am I AND what does the environment look like?"
- Chicken-and-egg problem: Need pose to build map, need map to localize

| Task | Map | Pose | Algorithm Examples |
|------|-----|------|-------------------|
| **Localization** | ✅ Known | ❌ Unknown | AMCL, Particle Filter |
| **Mapping** | ❌ Unknown | ✅ Known | Occupancy Grid Mapping |
| **SLAM** | ❌ Unknown | ❌ Unknown | GMapping, Cartographer, RTAB-Map |

---

### 2. SLAM Problem Formulation

**State:**
- Robot poses: x = [x₁, x₂, ..., xₜ]
- Map: m = landmarks or occupancy grid

**Observations:**
- Sensor measurements: z = [z₁, z₂, ..., zₜ]
- Odometry/motion: u = [u₁, u₂, ..., uₜ]

**Goal:**
Estimate probability distribution:
```
P(x₁:ₜ, m | z₁:ₜ, u₁:ₜ)

Given all sensor observations and odometry,
what is the most likely map and robot trajectory?
```

**Challenges:**
1. **High-dimensional**: Map has millions of cells
2. **Non-linear**: Sensor models, motion models
3. **Data association**: Which landmark is which?
4. **Loop closure**: Recognize previously visited places

---

### 3. AMCL (Adaptive Monte Carlo Localization)

**Purpose:** Localize robot in known map (not SLAM).

**Algorithm: Particle Filter**

Represents belief as set of particles (hypotheses):
```
Particle: [x, y, θ, weight]

Robot belief = {particle₁, particle₂, ..., particleₙ}
```

**Steps:**

**1. Initialization:**
```
Generate N particles uniformly in map (or near initial pose)

Example: 500 particles
Each particle: random (x, y, θ) within free space
Weight: 1/N
```

**2. Motion Update (Prediction):**
```
For each particle:
    Apply motion model with noise
    particle.x += Δx + noise
    particle.y += Δy + noise
    particle.θ += Δθ + noise
```

**3. Sensor Update (Correction):**
```
For each particle:
    Simulate laser scan at particle pose
    Compare to actual scan
    weight = similarity(simulated_scan, actual_scan)

Normalize weights: Σ weights = 1
```

**4. Resampling:**
```
Resample particles proportional to weights
- High-weight particles duplicated
- Low-weight particles removed

Result: Particles concentrate around true pose
```

**Convergence:**

```
Initial (uniform):      After motion:        After sensor update:    After resampling:
.  .   .  .            .  .   .  .          ●●●●●                   ●●●●●●●●
  .  .    .              .  .    .          ●●●●●                   ●●●●●●●●
.    .  .   .          .    .  .   .        ●●●●                    ●●●●●●
  .   .   .              .   .   .          .   .                   ●●
```

Particles converge to actual robot pose.

**AMCL Parameters:**

```yaml
amcl:
  ros__parameters:
    min_particles: 100
    max_particles: 5000

    # Odometry model (noise)
    odom_alpha1: 0.2  # Rotation noise from rotation
    odom_alpha2: 0.2  # Rotation noise from translation
    odom_alpha3: 0.2  # Translation noise from translation
    odom_alpha4: 0.2  # Translation noise from rotation

    # Laser model
    laser_model_type: "likelihood_field"
    laser_likelihood_max_dist: 2.0

    # Update thresholds
    update_min_d: 0.2  # Move 20cm before update
    update_min_a: 0.5  # Rotate 0.5 rad before update

    # Resampling
    resample_interval: 1  # Resample every update
```

---

### 4. GMapping (2D Grid-Based SLAM)

**Algorithm: Rao-Blackwellized Particle Filter**

**Key Idea:**
- Use particle filter for robot poses
- For each particle, maintain separate occupancy grid

**Data Structures:**

```
Particle:
  - pose: (x, y, θ)
  - weight: probability
  - map: occupancy grid (P(occupied | observations))
```

**Occupancy Grid:**

```
Cell values: [0, 100]
  0:   Free space
  100: Occupied (obstacle)
  50:  Unknown
```

**Algorithm:**

**1. Motion Update:**
```python
for particle in particles:
    # Predict new pose from odometry
    particle.pose = motion_model(particle.pose, odom)

    # Add noise
    particle.pose += sample_noise()
```

**2. Scan Matching:**
```python
for particle in particles:
    # Find best alignment of scan with particle's map
    corrected_pose = scan_match(particle.map, laser_scan, particle.pose)

    # Update particle pose
    particle.pose = corrected_pose
```

**3. Map Update:**
```python
for particle in particles:
    # Ray tracing: mark cells along laser beams
    for beam in laser_scan.ranges:
        cells = ray_trace(particle.pose, beam)

        # Free cells along ray
        for cell in cells[:-1]:
            particle.map[cell] = mark_free(particle.map[cell])

        # Occupied cell at endpoint
        particle.map[cells[-1]] = mark_occupied(particle.map[cells[-1]])

    # Compute particle weight
    particle.weight = likelihood(laser_scan, particle.map, particle.pose)
```

**4. Resampling:**
```python
particles = resample(particles, weights)
```

**5. Output:**
```python
# Best particle's map is published
best_particle = max(particles, key=lambda p: p.weight)
publish_map(best_particle.map)
```

**GMapping Parameters:**

```yaml
slam_gmapping:
  ros__parameters:
    # Scan matching
    maxUrange: 10.0  # Max laser range (m)
    maxRange: 12.0   # Max sensor range
    sigma: 0.05      # Laser noise

    # Map resolution
    delta: 0.05  # 5cm per cell

    # Particles
    particles: 30  # Number of particles

    # Scan matching iterations
    iterations: 5
    lsigma: 0.075  # Scan matcher sigma
    lstep: 0.05    # Scan matcher step size

    # Likelihood
    llsamplerange: 0.01
    llsamplestep: 0.01
    lasamplerange: 0.005
    lasamplestep: 0.005
```

---

### 5. Cartographer (Google's 2D/3D SLAM)

**Advantages:**
- **Fast**: Real-time on commodity hardware
- **Loop closure**: Automatic global optimization
- **3D capable**: Supports 3D lidar (e.g., Velodyne)
- **Multiple sensors**: Fuses lidar, IMU, odometry

**Architecture:**

```
Sensor Data → Local SLAM → Global SLAM (Loop Closure) → Map
                ↓                    ↓
           Submaps              Pose Graph
```

**Local SLAM:**
- Creates small local submaps (e.g., 10m × 10m)
- Scan-to-submap matching for accurate local pose
- Fast, runs in real-time

**Global SLAM (Loop Closure):**
- Detects when robot revisits area
- Optimizes pose graph to fix drift
- Runs periodically in background

**Submaps:**

```
Submap 1:  [0m - 10m]  ──────┐
Submap 2:       [8m - 18m]    ├─ Overlap for matching
Submap 3:            [16m - 26m]
                          ↑
                    Loop closure: Submap 3 matches Submap 1
                    → Optimize entire trajectory
```

**Pose Graph Optimization:**

Nodes = robot poses
Edges = constraints (odometry, scan matches, loop closures)

```
Pose₁ ──odometry──> Pose₂ ──odometry──> Pose₃
  ↑                                        |
  └─────────loop closure─────────────────┘

Optimize: Adjust poses to satisfy all constraints
```

**Configuration (cartographer):**

```lua
-- cartographer.lua
include "map_builder.lua"
include "trajectory_builder.lua"

options = {
  map_builder = MAP_BUILDER,
  trajectory_builder = TRAJECTORY_BUILDER,
  map_frame = "map",
  tracking_frame = "base_link",
  published_frame = "base_link",
  odom_frame = "odom",
  provide_odom_frame = true,
  publish_frame_projected_to_2d = false,
  use_odometry = true,
  use_nav_sat = false,
  use_landmarks = false,
  num_laser_scans = 1,
  num_multi_echo_laser_scans = 0,
  num_subdivisions_per_laser_scan = 1,
  num_point_clouds = 0,
  lookup_transform_timeout_sec = 0.2,
  submap_publish_period_sec = 0.3,
  pose_publish_period_sec = 5e-3,  -- 200 Hz
  trajectory_publish_period_sec = 30e-3,
}

-- Local SLAM parameters
TRAJECTORY_BUILDER_2D.use_imu_data = false
TRAJECTORY_BUILDER_2D.min_range = 0.1
TRAJECTORY_BUILDER_2D.max_range = 20.0
TRAJECTORY_BUILDER_2D.submaps.num_range_data = 90  -- Scans per submap

-- Global SLAM (loop closure)
POSE_GRAPH.optimize_every_n_nodes = 90
POSE_GRAPH.constraint_builder.min_score = 0.55  # Matching threshold
POSE_GRAPH.constraint_builder.global_localization_min_score = 0.6

return options
```

---

### 6. RTAB-Map (RGB-D SLAM)

**Purpose:** 3D SLAM with RGB-D cameras (RealSense, Kinect).

**Key Features:**
- Visual features (ORB, SIFT)
- Depth information (3D point clouds)
- Loop closure detection (bag-of-words)
- Graph optimization

**Workflow:**

```
RGB-D Image → Feature Extraction (ORB) → Visual Odometry → Pose Estimate
                                                  ↓
                                           Point Cloud → 3D Map
                                                  ↓
                                           Loop Closure Detection
                                                  ↓
                                           Graph Optimization → Refined Map
```

**Parameters:**

```yaml
rtabmap:
  ros__parameters:
    frame_id: base_link
    subscribe_depth: true
    subscribe_rgb: true
    subscribe_scan: false

    # Feature detector
    Kp/DetectorStrategy: "6"  # ORB
    Kp/MaxFeatures: "400"

    # Visual odometry
    Vis/EstimationType: "1"  # Motion from 3D-to-3D
    Vis/MaxDepth: "4.0"      # Max depth for features (m)

    # Loop closure
    Mem/STMSize: "30"         # Short-term memory size
    Rtabmap/TimeThr: "700"    # Loop closure time threshold (ms)
    Rtabmap/DetectionRate: "1"  # Loop closure check rate (Hz)

    # Graph optimization
    RGBD/OptimizeFromGraphEnd: "false"
    Optimizer/Strategy: "0"   # TORO optimizer
```

**Use Cases:**
- Indoor navigation (offices, homes)
- AR/VR applications
- Object recognition with SLAM

---

## EDGE_CASES

### Edge Case 1: Kidnapped Robot Problem

**Scenario:**
Robot is physically moved (picked up, teleported) without odometry → localization lost.

**AMCL Behavior:**
```
Before kidnapping: Particles concentrated at true pose ●●●●●
After kidnapping:  Robot at new location, particles at old location
                   ●●●●● (particles)     🤖 (robot, far away)

Sensor readings don't match particle predictions → all weights ~0
Cannot recover!
```

**Why:**
- Particles far from true pose
- All weights near zero (no good hypotheses)
- Resampling amplifies bad particles

**Solution 1: Global Localization**

Inject random particles across map:
```yaml
amcl:
  ros__parameters:
    recovery_alpha_slow: 0.001
    recovery_alpha_fast: 0.1

# Triggers global localization if average weight too low
```

Adds random particles → eventually one near true pose → converges.

**Solution 2: Manual Relocalization**

```bash
# Set initial pose estimate
ros2 topic pub /initialpose geometry_msgs/msg/PoseWithCovarianceStamped \
  "{header: {frame_id: 'map'}, pose: {pose: {position: {x: 2.0, y: 1.0}, orientation: {w: 1.0}}}}"
```

**Solution 3: Multi-Modal Particle Distribution**

Maintain particles in multiple clusters:
```python
# Instead of single cluster, maintain K clusters
clusters = [
    Cluster(pose=(x1, y1, θ1), weight=w1),
    Cluster(pose=(x2, y2, θ2), weight=w2),
    ...
]

# Prevents over-convergence to wrong location
```

**Interview Insight:**
Kidnapped robot causes localization failure (all particles wrong). Recover with global localization (random particles), manual relocalization, or multi-modal particle distribution.

---

### Edge Case 2: Symmetrical Environment (Ambiguous Localization)

**Scenario:**
Long hallway with identical repeating features → robot can't distinguish location.

**Example:**
```
Hallway:
├──┤   ├──┤   ├──┤   ├──┤   (identical doorways)

Robot sees:  ├──┤
Could be at: position 1, 2, 3, or 4 (ambiguous!)
```

**AMCL Behavior:**
```
Particles split into multiple modes:
●●●     ●●●     ●●●     ●●●
(4 clusters at each doorway)
```

**Why:**
- Features not distinctive
- Multiple hypotheses equally likely
- Particle filter maintains multi-modal distribution

**Solution 1: Wait for Distinctive Feature**

Eventually robot encounters unique feature (corner, furniture, window):
```
Robot reaches corner → only one cluster matches → converges ✓
```

**Solution 2: Add Unique Landmarks**

Place fiducial markers (AprilTags, QR codes):
```
Hallway:
├──┤ [Tag 1]  ├──┤ [Tag 2]  ├──┤ [Tag 3]  ├──┤ [Tag 4]

Robot sees Tag 2 → knows exact position ✓
```

**Solution 3: Use Motion Priors**

If robot knows starting location and has good odometry:
```python
# Weight particles by distance from expected pose
for particle in particles:
    distance = dist(particle.pose, expected_pose)
    particle.weight *= exp(-distance / sigma)

# Favors particles consistent with motion model
```

**Solution 4: Multi-Sensor Fusion**

Add compass, GPS, or ceiling camera:
```
Lidar: Ambiguous (4 locations)
Compass: Robot facing north
Combined: Only 1 location facing north ✓
```

**Interview Insight:**
Symmetrical environments cause ambiguous localization (multi-modal particle distribution). Resolve with distinctive features, landmarks (AprilTags), motion priors, or multi-sensor fusion.

---

### Edge Case 3: Dynamic Objects Corrupt Map

**Scenario:**
People walking through environment during mapping → people appear as permanent obstacles in map.

**GMapping Behavior:**
```
t=0: Robot scans, person present
     Map: ■ (obstacle recorded)

t=10: Person moved away
      Map: ■ (obstacle still in map!)

Result: Ghost obstacles ✗
```

**Why:**
- SLAM assumes static world
- Dynamic objects treated as permanent features
- Map never "forgets" observations

**Solution 1: Temporal Filtering**

Only map features observed multiple times:
```python
for cell in map:
    if observations[cell] > threshold:
        mark_occupied(cell)
    else:
        mark_free(cell)  # Not consistently observed → remove

# People move → not consistently observed → filtered out ✓
```

**Solution 2: Semantic Segmentation**

Detect and ignore dynamic objects:
```python
# Run YOLO on camera
detections = yolo(image)

# Remove lidar points inside person bounding boxes
for detection in detections:
    if detection.class == "person":
        laser_scan = remove_points_in_bbox(laser_scan, detection.bbox)

# Map without dynamic objects ✓
```

**Solution 3: Use Occupancy Grid Decay**

Cells decay over time if not re-observed:
```python
for cell in map:
    if not recently_observed(cell):
        decay(cell)  # Move toward "unknown" (50)

# Dynamic objects eventually decay from map
```

**Solution 4: Map Only During Static Times**

```python
# Only update map when no motion detected
if detect_motion(camera):
    skip_mapping()
else:
    update_map()
```

**Interview Insight:**
Dynamic objects (people, vehicles) create ghost obstacles in maps. Filter with temporal consistency, semantic segmentation (ignore people), occupancy decay, or map only during static periods.

---

### Edge Case 4: Loop Closure False Positives

**Scenario:**
SLAM incorrectly detects loop closure (thinks robot returned to start, but hasn't) → map distorted.

**Example:**
```
Ground truth:
Start ──────────> Current position (no loop)

SLAM belief (false loop closure):
Start ────────┐
              │
              └──── Current (incorrectly matched to start)

Result: Map folded on itself ✗
```

**Why:**
- Perceptual aliasing (similar-looking places)
- Low matching threshold (accepts weak matches)
- Insufficient verification

**Cartographer Behavior:**
```
False loop closure → global optimization → entire trajectory warped
```

**Solution 1: Stricter Matching Threshold**

```lua
-- cartographer.lua
POSE_GRAPH.constraint_builder.min_score = 0.70  -- Increase from 0.55
POSE_GRAPH.constraint_builder.global_localization_min_score = 0.75
```

**Solution 2: Verification with Multiple Constraints**

```python
# Require multiple scans to match before accepting loop closure
loop_closure_confirmed = False

if scan_match_score > threshold:
    # Check next 5 scans
    for next_scan in next_5_scans:
        if scan_match(next_scan, candidate) > threshold:
            confirmed_count += 1

    if confirmed_count >= 4:  # 4 out of 5 match
        loop_closure_confirmed = True
```

**Solution 3: Inertial Verification**

Use IMU to verify plausibility:
```python
# Check if loop closure is geometrically consistent
distance_by_odometry = integrate(imu_data)
distance_by_loop_closure = dist(current_pose, loop_candidate)

if abs(distance_by_odometry - distance_by_loop_closure) > threshold:
    reject_loop_closure()  # Inconsistent with IMU ✗
```

**Solution 4: Manual Verification**

```python
# Flag uncertain loop closures for review
if loop_closure_score < high_confidence_threshold:
    request_human_verification()
```

**Solution 5: Robust Optimization**

Use robust cost functions (Huber, Cauchy) that reduce influence of outliers:
```python
# Standard least squares (sensitive to outliers)
cost = Σ (error²)

# Huber loss (robust to outliers)
cost = Σ (huber(error))

# Outlier loop closures have less effect on optimization
```

**Interview Insight:**
False loop closures distort maps. Prevent with stricter matching thresholds, multi-scan verification, IMU consistency checks, manual review, or robust optimization (Huber loss).

---

## CODE_EXAMPLES

### Example 1: AMCL Localization Node

**File: `amcl_launch.py`**

```python
#!/usr/bin/env python3
from launch import LaunchDescription
from launch_ros.actions import Node
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration
from ament_index_python.packages import get_package_share_directory
import os

def generate_launch_description():
    # Get package directory
    pkg_dir = get_package_share_directory('my_robot_nav')

    # Map file
    map_yaml = os.path.join(pkg_dir, 'maps', 'office.yaml')

    # AMCL parameters
    amcl_config = os.path.join(pkg_dir, 'config', 'amcl.yaml')

    return LaunchDescription([
        # Map server
        Node(
            package='nav2_map_server',
            executable='map_server',
            name='map_server',
            output='screen',
            parameters=[{
                'yaml_filename': map_yaml,
                'use_sim_time': False
            }]
        ),

        # Lifecycle manager for map server
        Node(
            package='nav2_lifecycle_manager',
            executable='lifecycle_manager',
            name='lifecycle_manager_map',
            output='screen',
            parameters=[{
                'node_names': ['map_server'],
                'autostart': True
            }]
        ),

        # AMCL
        Node(
            package='nav2_amcl',
            executable='amcl',
            name='amcl',
            output='screen',
            parameters=[amcl_config, {'use_sim_time': False}]
        ),

        # Lifecycle manager for AMCL
        Node(
            package='nav2_lifecycle_manager',
            executable='lifecycle_manager',
            name='lifecycle_manager_amcl',
            output='screen',
            parameters=[{
                'node_names': ['amcl'],
                'autostart': True
            }]
        ),
    ])
```

**AMCL Config (`amcl.yaml`):**

```yaml
amcl:
  ros__parameters:
    # TF frames
    global_frame_id: "map"
    odom_frame_id: "odom"
    base_frame_id: "base_link"
    scan_topic: "scan"

    # Particle filter
    min_particles: 500
    max_particles: 2000
    pf_err: 0.05
    pf_z: 0.99

    # Laser model
    laser_model_type: "likelihood_field"
    laser_likelihood_max_dist: 2.0
    laser_max_range: 12.0
    laser_min_range: 0.1

    # Odometry model (differential drive)
    odom_model_type: "diff"
    alpha1: 0.2  # Rotation noise from rotation
    alpha2: 0.2  # Rotation noise from translation
    alpha3: 0.2  # Translation noise from translation
    alpha4: 0.2  # Translation noise from rotation
    alpha5: 0.2  # Translation noise

    # Update thresholds (when to run filter)
    update_min_d: 0.15  # 15cm
    update_min_a: 0.25  # ~14 degrees

    # Resampling
    resample_interval: 1

    # Initial pose (if known)
    set_initial_pose: true
    initial_pose:
      x: 0.0
      y: 0.0
      z: 0.0
      yaw: 0.0

    # Recovery (kidnapped robot)
    recovery_alpha_slow: 0.001
    recovery_alpha_fast: 0.1
```

---

### Example 2: Save Map from SLAM

**File: `save_map.py`**

```python
#!/usr/bin/env python3
import rclpy
from rclpy.node import Node
from nav_msgs.srv import GetMap
import yaml
import numpy as np
from PIL import Image

class MapSaver(Node):
    def __init__(self):
        super().__init__('map_saver')

        # Service client to get map
        self.map_client = self.create_client(GetMap, '/map_server/map')

        while not self.map_client.wait_for_service(timeout_sec=1.0):
            self.get_logger().info('Waiting for /map_server/map service...')

        self.save_map('my_map')

    def save_map(self, map_name):
        """Save map to PGM image and YAML metadata."""
        # Request map
        request = GetMap.Request()
        future = self.map_client.call_async(request)

        rclpy.spin_until_future_complete(self, future)

        if future.result() is not None:
            map_msg = future.result().map

            self.get_logger().info(f'Received map: {map_msg.info.width}x{map_msg.info.height}')

            # Convert to numpy array
            width = map_msg.info.width
            height = map_msg.info.height
            data = np.array(map_msg.data, dtype=np.int8).reshape((height, width))

            # Convert occupancy values to grayscale
            # -1 (unknown) → 205 (gray)
            #  0 (free)    → 254 (white)
            # 100 (occupied) → 0 (black)
            image_data = np.zeros((height, width), dtype=np.uint8)

            image_data[data == -1] = 205  # Unknown
            image_data[data == 0] = 254   # Free
            image_data[data == 100] = 0   # Occupied

            # Interpolate intermediate values
            mask = (data > 0) & (data < 100)
            image_data[mask] = 255 - (data[mask] * 255 / 100).astype(np.uint8)

            # Flip vertically (image origin is top-left, map origin is bottom-left)
            image_data = np.flipud(image_data)

            # Save PGM image
            img = Image.fromarray(image_data, mode='L')
            img.save(f'{map_name}.pgm')

            self.get_logger().info(f'Saved map image: {map_name}.pgm')

            # Save YAML metadata
            yaml_data = {
                'image': f'{map_name}.pgm',
                'resolution': float(map_msg.info.resolution),
                'origin': [
                    float(map_msg.info.origin.position.x),
                    float(map_msg.info.origin.position.y),
                    float(map_msg.info.origin.position.z)
                ],
                'occupied_thresh': 0.65,
                'free_thresh': 0.25,
                'negate': 0
            }

            with open(f'{map_name}.yaml', 'w') as f:
                yaml.dump(yaml_data, f)

            self.get_logger().info(f'Saved map metadata: {map_name}.yaml')

        else:
            self.get_logger().error('Failed to get map!')

def main(args=None):
    rclpy.init(args=args)
    saver = MapSaver()
    saver.destroy_node()
    rclpy.shutdown()

if __name__ == '__main__':
    main()
```

**Usage:**

```bash
# While SLAM is running, save map
ros2 run my_package save_map.py

# Outputs:
# my_map.pgm   (image)
# my_map.yaml  (metadata)
```

---

### Example 3: Monitor SLAM Performance

**File: `slam_monitor.py`**

```python
#!/usr/bin/env python3
import rclpy
from rclpy.node import Node
from nav_msgs.msg import Odometry, OccupancyGrid
from geometry_msgs.msg import PoseWithCovarianceStamped
import numpy as np

class SLAMMonitor(Node):
    def __init__(self):
        super().__init__('slam_monitor')

        # Subscriptions
        self.odom_sub = self.create_subscription(
            Odometry, '/odom', self.odom_callback, 10)

        self.amcl_sub = self.create_subscription(
            PoseWithCovarianceStamped, '/amcl_pose', self.amcl_callback, 10)

        self.map_sub = self.create_subscription(
            OccupancyGrid, '/map', self.map_callback, 10)

        # State
        self.odom_pose = None
        self.amcl_pose = None
        self.map_received = False

        # Timer for reporting
        self.timer = self.create_timer(5.0, self.report_status)

        self.get_logger().info('SLAM Monitor started')

    def odom_callback(self, msg):
        self.odom_pose = msg.pose.pose

    def amcl_callback(self, msg):
        self.amcl_pose = msg.pose.pose

        # Check localization uncertainty
        covariance = np.array(msg.pose.covariance).reshape((6, 6))
        pos_uncertainty = np.sqrt(covariance[0, 0] + covariance[1, 1])

        if pos_uncertainty > 0.5:  # >50cm uncertainty
            self.get_logger().warn(f'High localization uncertainty: {pos_uncertainty:.3f}m')

    def map_callback(self, msg):
        self.map_received = True

        # Compute map coverage
        data = np.array(msg.data)
        total_cells = len(data)
        unknown_cells = np.sum(data == -1)
        coverage = (total_cells - unknown_cells) / total_cells * 100

        self.get_logger().info(f'Map coverage: {coverage:.1f}%')

    def report_status(self):
        """Periodic status report."""
        if not self.map_received:
            self.get_logger().warn('No map received yet!')
            return

        if self.odom_pose is None:
            self.get_logger().warn('No odometry received!')
            return

        if self.amcl_pose is None:
            self.get_logger().warn('No AMCL pose received!')
            return

        # Compute odometry drift
        odom_x = self.odom_pose.position.x
        odom_y = self.odom_pose.position.y
        amcl_x = self.amcl_pose.position.x
        amcl_y = self.amcl_pose.position.y

        drift = np.sqrt((odom_x - amcl_x)**2 + (odom_y - amcl_y)**2)

        if drift > 0.5:
            self.get_logger().warn(f'Large odometry drift: {drift:.3f}m')
        else:
            self.get_logger().info(f'Odometry drift: {drift:.3f}m (OK)')

def main(args=None):
    rclpy.init(args=args)
    monitor = SLAMMonitor()
    rclpy.spin(monitor)
    monitor.destroy_node()
    rclpy.shutdown()

if __name__ == '__main__':
    main()
```

---

## INTERVIEW_QA

### Q1: What is the difference between localization and SLAM?

**Difficulty:** ⭐⭐ (Easy)

**Answer:**

| Aspect | Localization | SLAM |
|--------|--------------|------|
| **Map** | ✅ Known (pre-built) | ❌ Unknown (building) |
| **Pose** | ❌ Unknown (estimating) | ❌ Unknown (estimating) |
| **Problem** | "Where am I?" | "Where am I AND what does the environment look like?" |
| **Algorithm Examples** | AMCL (particle filter) | GMapping, Cartographer, RTAB-Map |
| **Difficulty** | Easier | Harder (chicken-and-egg) |
| **Use Case** | Repeat navigation in known environment | First-time exploration |

**Localization:**
```
Input: Known map, laser scan, odometry
Output: Robot pose (x, y, θ)

Robot navigates in pre-mapped warehouse ✓
```

**SLAM:**
```
Input: Laser scans, odometry (no map!)
Output: Map + robot poses over time

Robot explores unknown office, builds map ✓
```

**Why SLAM is Harder:**

Chicken-and-egg problem:
- Need accurate poses to build map
- Need accurate map to localize (get pose)
- Both are unknown simultaneously

**Interview Insight:**
Localization estimates pose in known map (easier). SLAM simultaneously builds map and estimates pose (harder, chicken-and-egg problem).

---

### Q2: How does AMCL (particle filter) converge to robot's true pose?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

AMCL uses **particle filter** to represent belief as set of weighted particles.

**Convergence Process:**

**1. Initialization:**
```
Generate N particles uniformly or near initial guess
All weights equal: w = 1/N

Example: 1000 particles spread across map
```

**2. Motion Update (Prediction):**
```python
for particle in particles:
    # Apply odometry with noise
    particle.x += odom.dx + gaussian_noise()
    particle.y += odom.dy + gaussian_noise()
    particle.θ += odom.dθ + gaussian_noise()

# Particles move, uncertainty increases
```

**3. Sensor Update (Measurement):**
```python
for particle in particles:
    # Simulate laser scan at particle pose
    expected_scan = ray_cast(map, particle.pose)

    # Compare to actual scan
    similarity = compare_scans(expected_scan, actual_scan)

    # Update weight
    particle.weight = similarity

# Particles near true pose have high weight
# Particles far from true pose have low weight
```

**4. Resampling:**
```python
# Resample particles proportional to weights
new_particles = resample(particles, weights)

# High-weight particles duplicated
# Low-weight particles removed

# Particles concentrate around high-weight regions
```

**5. Convergence:**
```
After several cycles:
Particles cluster around true robot pose ●●●●●●
All particles have similar pose
→ Localization converged ✓
```

**Why It Works:**

- **Diversity**: Many particles explore different hypotheses
- **Selection**: Sensor updates favor correct hypotheses (high weight)
- **Concentration**: Resampling removes wrong hypotheses

**Convergence Criteria:**

```python
# Check if particles converged
covariance = compute_particle_covariance(particles)

if covariance < threshold:
    print("Converged!")
```

**Example:**

```
Robot in corridor:
Initial: Particles everywhere .  .  .  .  .
After 1 scan: Some particles match scan ●  .  ●  .  .
After 5 scans: Particles concentrate ●●●●●●
After 10 scans: Fully converged ●●●●●●●● (tight cluster)
```

**Interview Insight:**
AMCL particle filter converges through iterative prediction (motion), measurement (sensor update weights), and resampling (remove wrong hypotheses). Particles concentrate around true pose.

---

### Q3: What is loop closure and why is it critical for SLAM?

**Difficulty:** ⭐⭐⭐⭐ (Hard)

**Answer:**

**Loop Closure:**

Detecting that robot has returned to a previously visited location, enabling global map correction.

**Why Critical:**

**Without Loop Closure:**

```
Robot explores, returns to start:

Ground truth (actual path):
Start ───────┐
            │
            └─ End (back at start)

SLAM without loop closure (drift accumulates):
Start ──────────────────────> End (far from start)

Map is distorted (drift never corrected) ✗
```

**With Loop Closure:**

```
Robot returns to start:
1. Detect: "I've been here before!"
2. Match: Current scan ≈ scan from start
3. Constrain: Add edge in pose graph (Start ↔ End)
4. Optimize: Adjust entire trajectory to satisfy constraint

Result:
Start ───────┐
            │
            └─ End (correctly at start) ✓

Map is globally consistent ✓
```

**Detection Methods:**

**1. Appearance-Based:**
```python
# Extract features from scan/image
features_current = extract_features(current_scan)

# Compare to past scans
for past_scan in history:
    features_past = extract_features(past_scan)
    similarity = compare(features_current, features_past)

    if similarity > threshold:
        loop_closure_detected = True
        break
```

**2. Geometric:**
```python
# Check if current pose is near any past pose
for past_pose in trajectory:
    distance = dist(current_pose, past_pose)

    if distance < threshold:
        # Verify with scan matching
        if scan_matches(current_scan, past_scan):
            loop_closure_detected = True
```

**Pose Graph Optimization:**

After loop closure detected, optimize trajectory:

```
Pose graph:
x₁ ──u₁→ x₂ ──u₂→ x₃ ──u₃→ x₄
 ↑                          ↓
 └─────── loop closure ─────┘

Optimization:
Minimize error:
Σ ||f(xᵢ, uᵢ) - xᵢ₊₁||²   (odometry constraints)
+ ||x₁ - x₄||²             (loop closure constraint)

Adjust all poses x₁, x₂, x₃, x₄ to satisfy constraints
```

**Algorithms:**

- **Cartographer**: Pose graph optimization with Ceres Solver
- **RTAB-Map**: g2o optimizer
- **ORB-SLAM**: Bag-of-words for loop detection, bundle adjustment

**False Positives:**

Incorrectly detecting loop closure (perceptually similar places):

```
Two similar corridors:
Corridor A: ├──┤
Corridor B: ├──┤ (looks identical!)

False loop closure → map folded incorrectly ✗
```

**Prevention:**
- High matching threshold
- Geometric verification (check if consistent with odometry)
- Multiple-scan confirmation

**Interview Insight:**
Loop closure detects when robot revisits locations, enabling global map correction through pose graph optimization. Critical for preventing drift accumulation. Must balance detection sensitivity vs false positives.

---

### Q4: Explain the "kidnapped robot problem" in localization.

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

**Kidnapped Robot Problem:**

Robot is physically moved (teleported) to different location without odometry update → localization system must recover.

**Scenario:**
```
t=0: Robot at (x=2, y=3), AMCL converged ●●●●●
t=1: Robot picked up, moved to (x=10, y=8)
     Odometry still thinks robot at (x=2, y=3)
     Particles still at (x=2, y=3) ●●●●●

t=2: Robot takes laser scan at new location
     Scan doesn't match particles' predictions
     All particle weights ≈ 0
     → Localization lost! ✗
```

**Why Difficult:**

Standard particle filters assume:
- Continuous motion (smooth trajectory)
- Odometry provides approximate motion

Kidnapping violates both → filter cannot recover.

**Recovery Strategies:**

**1. Global Localization (Random Injection):**

```python
# Detect localization failure
avg_weight = sum(p.weight for p in particles) / len(particles)

if avg_weight < threshold:
    # Inject random particles across entire map
    for i in range(num_random):
        random_particle = sample_free_space(map)
        particles.append(random_particle)

# Eventually, some random particle near true pose → converges
```

**2. Augmented MCL (AMCL):**

Maintains two sets of particles:
```python
# Short-term particles (normal tracking)
short_term_particles = []

# Long-term particles (global coverage)
long_term_particles = sample_map_uniformly(count=50)

# Combine
all_particles = short_term_particles + long_term_particles

# Long-term particles enable recovery from kidnapping
```

**3. Entropy-Based Recovery:**

Monitor localization uncertainty:
```python
entropy = -Σ (p.weight * log(p.weight))

if entropy > high_threshold:
    # Uncertainty high → trigger global localization
    reinitialize_particles_globally()
```

**4. Multi-Modal Particle Distribution:**

Maintain multiple clusters (hypotheses):
```python
# Instead of single cluster
clusters = [
    Cluster(pose=pose1, weight=0.7),  # Main hypothesis
    Cluster(pose=pose2, weight=0.2),  # Alternative
    Cluster(pose=pose3, weight=0.1),  # Alternative
]

# If kidnapped, one alternative cluster may be correct
```

**5. Relocalization Service:**

Manual intervention:
```bash
# User provides approximate pose
ros2 topic pub /initialpose geometry_msgs/msg/PoseWithCovarianceStamped \
  "{pose: {pose: {position: {x: 10.0, y: 8.0}, orientation: {w: 1.0}}}}"

# Particles reinitialized near provided pose → recovers
```

**Real-World Examples:**

- Robot lifted during maintenance
- Simulation reset
- GPS glitch (outdoor robots)
- Human intervention (moving robot by hand)

**Interview Insight:**
Kidnapped robot problem: Robot teleported, particles wrong, localization fails (all weights ~0). Recover with random particle injection (global localization), augmented MCL (long-term particles), entropy monitoring, multi-modal distribution, or manual relocalization.

---

### Q5: What are the advantages of Cartographer over GMapping?

**Difficulty:** ⭐⭐⭐⭐ (Hard)

**Answer:**

**Comparison:**

| Feature | GMapping | Cartographer |
|---------|----------|--------------|
| **Loop Closure** | ❌ No (accumulates drift) | ✅ Yes (pose graph optimization) |
| **Real-Time** | ✅ Fast | ✅ Fast |
| **3D SLAM** | ❌ 2D only | ✅ 2D and 3D |
| **Sensor Fusion** | Lidar only | Lidar + IMU + Odometry |
| **Map Quality** | Good for small areas | Excellent for large areas |
| **Drift** | Accumulates over time | Corrected by loop closure |
| **Parameters** | Many to tune | Fewer, more robust |
| **CPU Usage** | Low | Medium-High |

---

**Advantages of Cartographer:**

**1. Loop Closure Detection:**

**GMapping:**
```
Robot explores, returns to start:
Map drifts, start and end don't align ✗

Result: Inconsistent map
```

**Cartographer:**
```
Robot returns to start:
1. Detect loop closure
2. Optimize pose graph
3. Map globally consistent ✓

Result: Start and end align perfectly
```

**2. Submap Architecture:**

**GMapping:**
- Single global grid
- Errors propagate globally
- Hard to correct after accumulation

**Cartographer:**
- Multiple local submaps
- Errors isolated to submaps
- Global optimization fixes alignment

```
Submaps:
[Submap 1] ─ [Submap 2] ─ [Submap 3]
                                │
                    ┌───────────┘
                    ↓
             [Submap 1]  (loop closure)

Optimize relative transforms between submaps
```

**3. Multi-Sensor Fusion:**

**GMapping:**
- Lidar only
- Drift from odometry errors

**Cartographer:**
- Lidar + IMU + Wheel odometry
- IMU reduces rotation drift
- Better pose estimates

```yaml
# Cartographer config
use_odometry = true
use_imu_data = true

# IMU constrains rotation
# Odometry constrains translation
# Lidar provides absolute measurements
→ Robust multi-sensor fusion ✓
```

**4. 3D SLAM:**

**GMapping:**
- 2D only (single-layer lidar)

**Cartographer:**
- Supports 3D lidar (Velodyne, Ouster)
- Full 6-DOF pose estimation
- Useful for drones, uneven terrain

**5. Scalability:**

**GMapping:**
- Works well for small areas (office floor)
- Struggles with large areas (warehouse, campus)
- Drift accumulates → map unusable

**Cartographer:**
- Handles large areas (km-scale)
- Loop closure corrects drift
- Used for Google's Project Tango

**6. Robustness:**

**GMapping:**
- Sensitive to parameter tuning
- Particles can diverge (localization loss)

**Cartographer:**
- More robust defaults
- Scan-to-submap matching is stable

---

**When to Use GMapping:**

- Small, simple environments
- Real-time is critical (low CPU)
- No loop closures (linear trajectory)
- Fast prototyping

**When to Use Cartographer:**

- Large environments
- Long exploration sessions
- Loop closures expected
- Need high-quality maps
- Have IMU

---

**Trade-offs:**

| Aspect | GMapping | Cartographer |
|--------|----------|--------------|
| **Ease of Use** | ✅ Simple | ⚠️ Complex config |
| **Setup Time** | ✅ Quick | ⚠️ Longer |
| **CPU** | ✅ Low | ❌ Higher |
| **Map Quality (small area)** | ✅ Good | ✅ Good |
| **Map Quality (large area)** | ❌ Poor (drift) | ✅ Excellent |

**Interview Insight:**
Cartographer advantages: loop closure (fixes drift), submaps (scalable), multi-sensor fusion (IMU), 3D support, robust to large areas. GMapping is simpler and faster for small environments without loop closures.

---

## PRACTICE_TASKS

### Task 1: Setup AMCL Localization

**Goal:** Localize robot in pre-built map.

**Requirements:**
- Load map with map_server
- Launch AMCL node
- Drive robot around (teleoperation)
- Observe particle convergence in RViz
- Set initial pose if needed

**Bonus:**
- Monitor localization uncertainty (covariance)
- Test kidnapped robot recovery

---

### Task 2: Build Map with GMapping/Cartographer

**Goal:** Create map of environment using SLAM.

**Requirements:**
- Launch SLAM node (GMapping or Cartographer)
- Drive robot to explore environment
- Save map when complete
- Verify map quality in RViz

**Bonus:**
- Compare GMapping vs Cartographer quality
- Test loop closure detection

---

### Task 3: Implement Loop Closure Detector

**Goal:** Detect when robot returns to start.

**Requirements:**
- Subscribe to laser scans
- Extract features (e.g., scan signature)
- Store scan history
- Compare current scan to history
- Detect loop closure (similarity threshold)

**Bonus:**
- Add geometric verification (pose distance)
- Visualize loop closures in RViz

---

### Task 4: Evaluate SLAM Accuracy

**Goal:** Quantify SLAM performance.

**Requirements:**
- Run SLAM in simulation (known ground truth)
- Record estimated trajectory and ground truth
- Compute errors:
  - Absolute Trajectory Error (ATE)
  - Relative Pose Error (RPE)
- Plot errors over time

**Bonus:**
- Compare multiple SLAM algorithms
- Test with sensor noise, dynamic objects

---

## QUICK_REFERENCE

### Launch AMCL

```bash
# Launch AMCL with map
ros2 launch nav2_bringup localization_launch.py \
    map:=/path/to/map.yaml \
    use_sim_time:=false
```

### Launch SLAM (Cartographer)

```bash
# 2D SLAM
ros2 launch cartographer_ros cartographer.launch.py \
    configuration_basename:=my_robot_2d.lua \
    use_sim_time:=false

# Save map
ros2 run nav2_map_server map_saver_cli -f my_map
```

### Set Initial Pose (AMCL)

```bash
# Publish initial pose
ros2 topic pub --once /initialpose geometry_msgs/msg/PoseWithCovarianceStamped \
  "{header: {frame_id: 'map'}, pose: {pose: {position: {x: 0.0, y: 0.0, z: 0.0}, orientation: {w: 1.0}}}}"
```

### Monitor Particle Cloud

```bash
# In RViz, add display:
# - Type: PoseArray
# - Topic: /particle_cloud

# Particles should converge around robot
```

### Check SLAM Status

```bash
# Cartographer constraints (loop closures)
ros2 topic echo /constraint_list

# RTAB-Map statistics
ros2 topic echo /rtabmap/info
```

---

**END OF TOPIC 5.5: SLAM & Localization**

---

**🎉 CHAPTER 5: Robotics Applications COMPLETE! 🎉**

**All 5 topics covered:**
1. Navigation & Nav2 Stack
2. Computer Vision & Image Processing
3. Robot Manipulation & MoveIt2
4. Simulation with Gazebo
5. SLAM & Localization
