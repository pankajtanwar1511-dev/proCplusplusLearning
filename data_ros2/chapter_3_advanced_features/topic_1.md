# Topic 3.1: TF2 Transform System

## THEORY_SECTION

### 1. TF2 Fundamentals

**What is TF2?**

TF2 (Transform Framework 2) is ROS2's system for **tracking coordinate frames** and computing **transformations** between them.

**Why TF2 Matters:**

Robots have multiple coordinate frames:
- **base_link**: Robot center
- **odom**: Odometry origin
- **map**: Global map origin
- **camera_link**: Camera position
- **laser_link**: LiDAR position
- **left_wheel**, **right_wheel**, etc.

**Problem TF2 Solves:**

Without TF2:
```cpp
// Manual transform (error-prone!)
geometry_msgs::msg::Point camera_point;
geometry_msgs::msg::Point base_point;

// Need to manually:
// 1. Get camera pose relative to base
// 2. Apply rotation matrix
// 3. Apply translation
// 4. Handle time synchronization
// 5. Deal with coordinate frame changes
```

With TF2:
```cpp
// TF2 handles everything automatically!
auto transform = tf_buffer->lookupTransform("base_link", "camera_link", tf2::TimePointZero);
tf2::doTransform(camera_point, base_point, transform);
```

**Key Concepts:**

| Concept | Description | Example |
|---------|-------------|---------|
| **Frame** | Coordinate system | `base_link`, `odom`, `map` |
| **Transform** | Translation + Rotation between frames | `base_link` → `camera_link` |
| **Tree** | Directed acyclic graph of frames | `map` → `odom` → `base_link` → `camera_link` |
| **Parent** | Source frame | `base_link` (parent of `camera_link`) |
| **Child** | Target frame | `camera_link` (child of `base_link`) |

---

### 2. Transform Tree Structure

**Transform Tree Rules:**

1. **Single parent**: Each frame has exactly ONE parent
2. **No cycles**: Cannot have circular dependencies
3. **Connected**: All frames must connect to tree (no orphans)

**Example Robot Transform Tree:**

```
                    map (global reference)
                     │
                     ├─ transform: map → odom (localization)
                     ↓
                    odom (odometry origin)
                     │
                     ├─ transform: odom → base_link (robot motion)
                     ↓
                  base_link (robot center)
                     │
        ┌────────────┼────────────┐
        │            │            │
        ↓            ↓            ↓
   left_wheel   camera_link   laser_link
                     │
                     ↓
                camera_optical_frame
```

**Transform Lookup:**

TF2 automatically computes transforms through tree:

```cpp
// Direct transform (1 hop)
lookupTransform("base_link", "camera_link", time);
// Uses: base_link → camera_link

// Indirect transform (multiple hops)
lookupTransform("map", "camera_link", time);
// Computes: map → odom → base_link → camera_link
```

**Frame Naming Conventions:**

| Frame | Purpose | Attachment |
|-------|---------|------------|
| **map** | Fixed global frame | World |
| **odom** | Odometry origin | Drifts over time |
| **base_link** | Robot geometric center | Robot chassis |
| **base_footprint** | Projection on ground | Ground plane |
| **<sensor>_link** | Sensor frame | Sensor mounting point |
| **<sensor>_optical_frame** | Optical frame (cameras) | Follows camera conventions |

---

### 3. Broadcasting Transforms

**Static Transforms:**

Fixed transforms (never change):
- Sensor mounting positions
- Robot geometry

**Static Transform Broadcaster:**

```cpp
#include "geometry_msgs/msg/transform_stamped.hpp"
#include "tf2_ros/static_transform_broadcaster.h"

class RobotTFPublisher : public rclcpp::Node {
public:
    RobotTFPublisher() : Node("robot_tf_publisher") {
        tf_static_broadcaster_ = std::make_shared<tf2_ros::StaticTransformBroadcaster>(this);

        // Publish static transform: base_link → camera_link
        publish_static_transform();
    }

private:
    void publish_static_transform() {
        geometry_msgs::msg::TransformStamped transform;

        transform.header.stamp = now();
        transform.header.frame_id = "base_link";  // Parent
        transform.child_frame_id = "camera_link"; // Child

        // Translation: camera is 0.1m forward, 0.05m up
        transform.transform.translation.x = 0.1;
        transform.transform.translation.y = 0.0;
        transform.transform.translation.z = 0.05;

        // Rotation: camera points forward (no rotation)
        tf2::Quaternion q;
        q.setRPY(0, 0, 0);  // Roll, Pitch, Yaw
        transform.transform.rotation.x = q.x();
        transform.transform.rotation.y = q.y();
        transform.transform.rotation.z = q.z();
        transform.transform.rotation.w = q.w();

        tf_static_broadcaster_->sendTransform(transform);
    }

    std::shared_ptr<tf2_ros::StaticTransformBroadcaster> tf_static_broadcaster_;
};
```

**Static Transform from Command Line:**

```bash
ros2 run tf2_ros static_transform_publisher 0.1 0 0.05 0 0 0 base_link camera_link
# Args: x y z yaw pitch roll parent child
```

**Dynamic Transforms:**

Changing transforms:
- Robot odometry (`odom` → `base_link`)
- Moving parts (joints)

**Dynamic Transform Broadcaster:**

```cpp
#include "tf2_ros/transform_broadcaster.h"

class OdometryPublisher : public rclcpp::Node {
public:
    OdometryPublisher() : Node("odometry_publisher") {
        tf_broadcaster_ = std::make_unique<tf2_ros::TransformBroadcaster>(this);

        odom_sub_ = create_subscription<nav_msgs::msg::Odometry>(
            "odom", 10,
            std::bind(&OdometryPublisher::odom_callback, this, std::placeholders::_1)
        );
    }

private:
    void odom_callback(const nav_msgs::msg::Odometry::SharedPtr msg) {
        geometry_msgs::msg::TransformStamped transform;

        transform.header.stamp = msg->header.stamp;
        transform.header.frame_id = "odom";      // Parent
        transform.child_frame_id = "base_link";  // Child

        // Translation from odometry
        transform.transform.translation.x = msg->pose.pose.position.x;
        transform.transform.translation.y = msg->pose.pose.position.y;
        transform.transform.translation.z = msg->pose.pose.position.z;

        // Rotation from odometry
        transform.transform.rotation = msg->pose.pose.orientation;

        // Broadcast transform
        tf_broadcaster_->sendTransform(transform);
    }

    std::unique_ptr<tf2_ros::TransformBroadcaster> tf_broadcaster_;
    rclcpp::Subscription<nav_msgs::msg::Odometry>::SharedPtr odom_sub_;
};
```

---

### 4. Listening to Transforms

**Transform Buffer & Listener:**

```cpp
#include "tf2_ros/transform_listener.h"
#include "tf2_ros/buffer.h"
#include "geometry_msgs/msg/point_stamped.hpp"
#include "tf2_geometry_msgs/tf2_geometry_msgs.hpp"

class TransformListener : public rclcpp::Node {
public:
    TransformListener() : Node("transform_listener") {
        // Create TF buffer (stores transforms)
        tf_buffer_ = std::make_unique<tf2_ros::Buffer>(get_clock());

        // Create TF listener (fills buffer from /tf topic)
        tf_listener_ = std::make_shared<tf2_ros::TransformListener>(*tf_buffer_);

        // Timer to periodically lookup transforms
        timer_ = create_wall_timer(
            std::chrono::seconds(1),
            std::bind(&TransformListener::lookup_transform, this)
        );
    }

private:
    void lookup_transform() {
        try {
            // Lookup transform: target_frame ← source_frame
            auto transform = tf_buffer_->lookupTransform(
                "base_link",           // Target frame
                "camera_link",         // Source frame
                tf2::TimePointZero     // Latest available
            );

            RCLCPP_INFO(get_logger(),
                "Transform camera_link → base_link: [%.2f, %.2f, %.2f]",
                transform.transform.translation.x,
                transform.transform.translation.y,
                transform.transform.translation.z
            );

        } catch (const tf2::TransformException &ex) {
            RCLCPP_WARN(get_logger(), "Could not transform: %s", ex.what());
        }
    }

    std::unique_ptr<tf2_ros::Buffer> tf_buffer_;
    std::shared_ptr<tf2_ros::TransformListener> tf_listener_;
    rclcpp::TimerBase::SharedPtr timer_;
};
```

**Transform Lookup with Timeout:**

```cpp
try {
    auto transform = tf_buffer_->lookupTransform(
        "base_link",
        "camera_link",
        tf2::TimePointZero,
        std::chrono::milliseconds(100)  // Timeout: wait up to 100ms
    );
} catch (const tf2::TransformException &ex) {
    RCLCPP_ERROR(get_logger(), "Transform failed: %s", ex.what());
}
```

**Transform Lookup at Specific Time:**

```cpp
// Get transform at time of sensor measurement
rclcpp::Time sensor_time = msg->header.stamp;

auto transform = tf_buffer_->lookupTransform(
    "base_link",
    "camera_link",
    sensor_time,  // Transform at this specific time
    std::chrono::milliseconds(50)
);
```

---

### 5. Transforming Geometry Messages

**Transform Point:**

```cpp
#include "tf2_geometry_msgs/tf2_geometry_msgs.hpp"

// Point in camera frame
geometry_msgs::msg::PointStamped point_camera;
point_camera.header.frame_id = "camera_link";
point_camera.header.stamp = now();
point_camera.point.x = 1.0;
point_camera.point.y = 0.5;
point_camera.point.z = 0.2;

// Transform to base_link frame
geometry_msgs::msg::PointStamped point_base;

try {
    tf_buffer_->transform(point_camera, point_base, "base_link");

    RCLCPP_INFO(get_logger(), "Point in base_link: [%.2f, %.2f, %.2f]",
                point_base.point.x, point_base.point.y, point_base.point.z);
} catch (const tf2::TransformException &ex) {
    RCLCPP_ERROR(get_logger(), "Transform failed: %s", ex.what());
}
```

**Transform Pose:**

```cpp
geometry_msgs::msg::PoseStamped pose_camera;
pose_camera.header.frame_id = "camera_link";
pose_camera.header.stamp = now();
pose_camera.pose.position.x = 1.0;
pose_camera.pose.orientation.w = 1.0;

geometry_msgs::msg::PoseStamped pose_base;
tf_buffer_->transform(pose_camera, pose_base, "base_link");
```

**Transform Twist (Velocity):**

```cpp
geometry_msgs::msg::TwistStamped twist_camera;
// ... fill twist ...

geometry_msgs::msg::TwistStamped twist_base;
tf_buffer_->transform(twist_camera, twist_base, "base_link");
```

---

### 6. Time Travel in TF2

**TF Buffer stores transform history** (default: 10 seconds).

**Lookup Past Transform:**

```cpp
// Get transform as it was 2 seconds ago
auto past_time = now() - rclcpp::Duration::from_seconds(2.0);

auto transform = tf_buffer_->lookupTransform(
    "map",
    "base_link",
    past_time  // Historical transform
);
```

**Use Case - Synchronize Sensor Data:**

```cpp
void laser_callback(const sensor_msgs::msg::LaserScan::SharedPtr msg) {
    // Laser data has timestamp
    auto laser_time = rclcpp::Time(msg->header.stamp);

    try {
        // Get robot pose at the EXACT time laser scan was captured
        auto transform = tf_buffer_->lookupTransform(
            "map",
            "laser_link",
            laser_time  // Transform at laser capture time
        );

        // Now can correctly project laser points into map frame
        project_laser_scan(msg, transform);

    } catch (const tf2::TransformException &ex) {
        RCLCPP_WARN(get_logger(), "Transform at time %.2f unavailable: %s",
                    laser_time.seconds(), ex.what());
    }
}
```

**TF2 Interpolation:**

TF2 **interpolates** between transforms if exact time not available:

```
Stored transforms:
t=1.0s: odom → base_link  (x=1.0, y=0.0)
t=2.0s: odom → base_link  (x=2.0, y=0.0)

Query at t=1.5s:
→ TF2 interpolates: (x=1.5, y=0.0)  ✓
```

---

### 7. TF2 Tools

**View Transform Tree:**

```bash
# Install
sudo apt install ros-humble-tf2-tools

# View TF tree as PDF
ros2 run tf2_tools view_frames
# Creates frames_<timestamp>.pdf

# View TF tree in terminal
ros2 run tf2_tools view_frames --text
```

**Echo Transform:**

```bash
# Continuously print transform
ros2 run tf2_ros tf2_echo base_link camera_link

# Output:
# At time 1234.567
# - Translation: [0.100, 0.000, 0.050]
# - Rotation: in Quaternion [0.000, 0.000, 0.000, 1.000]
#             in RPY (radian) [0.000, 0.000, 0.000]
#             in RPY (degree) [0.000, 0.000, 0.000]
```

**Monitor TF Messages:**

```bash
# List TF topics
ros2 topic list | grep /tf
# /tf
# /tf_static

# Echo transforms
ros2 topic echo /tf
ros2 topic echo /tf_static
```

---

## EDGE_CASES

### Edge Case 1: Transform Lookup Before Transform Published

**Scenario:**
Node starts, immediately tries to lookup transform, but broadcaster hasn't published yet.

**Code:**
```cpp
MyNode() : Node("my_node") {
    tf_buffer_ = std::make_unique<tf2_ros::Buffer>(get_clock());
    tf_listener_ = std::make_shared<tf2_ros::TransformListener>(*tf_buffer_);

    // Immediately lookup transform (FAILS!)
    try {
        auto transform = tf_buffer_->lookupTransform("map", "base_link", tf2::TimePointZero);
    } catch (const tf2::LookupException &ex) {
        RCLCPP_ERROR(get_logger(), "Transform not available yet: %s", ex.what());
        // Error: "map" passed to lookupTransform argument target_frame does not exist.
    }
}
```

**Why:**
- TF listener subscribes to `/tf` topic
- Takes time to receive messages
- Buffer is empty at node startup

**Solution 1 - Wait for Transform:**

```cpp
MyNode() : Node("my_node") {
    tf_buffer_ = std::make_unique<tf2_ros::Buffer>(get_clock());
    tf_listener_ = std::make_shared<tf2_ros::TransformListener>(*tf_buffer_);

    // Wait for transform to become available
    while (!tf_buffer_->canTransform("map", "base_link", tf2::TimePointZero)) {
        RCLCPP_INFO(get_logger(), "Waiting for transform map → base_link...");
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }

    RCLCPP_INFO(get_logger(), "Transform available!");
}
```

**Solution 2 - Use Timeout:**

```cpp
try {
    auto transform = tf_buffer_->lookupTransform(
        "map", "base_link",
        tf2::TimePointZero,
        std::chrono::seconds(5)  // Wait up to 5 seconds
    );
} catch (const tf2::TransformException &ex) {
    RCLCPP_ERROR(get_logger(), "Transform timeout: %s", ex.what());
}
```

**Solution 3 - Lazy Initialization:**

```cpp
void process_callback() {
    if (!transform_ready_) {
        if (tf_buffer_->canTransform("map", "base_link", tf2::TimePointZero)) {
            transform_ready_ = true;
            RCLCPP_INFO(get_logger(), "Transform now available");
        } else {
            return;  // Skip processing until transform available
        }
    }

    // Use transform...
}
```

**Interview Insight:**
Always wait for transforms to be available before using them. Use `canTransform()` or lookup with timeout.

---

### Edge Case 2: Extrapolation into the Future

**Scenario:**
Request transform at future time (later than latest available transform).

**Code:**
```cpp
// Current time: t=10.0s
// Latest odom → base_link transform: t=10.0s

// Request transform at t=11.0s (future!)
auto future_time = now() + rclcpp::Duration::from_seconds(1.0);

try {
    auto transform = tf_buffer_->lookupTransform(
        "odom", "base_link",
        future_time  // 1 second in the future
    );
} catch (const tf2::ExtrapolationException &ex) {
    RCLCPP_ERROR(get_logger(), "Extrapolation error: %s", ex.what());
    // Error: Lookup would require extrapolation into the future.
}
```

**Why:**
- TF2 stores past transforms (history)
- Cannot predict future robot positions
- Requesting future transform → exception

**Solution 1 - Use Latest Available:**

```cpp
// Use most recent transform
auto transform = tf_buffer_->lookupTransform(
    "odom", "base_link",
    tf2::TimePointZero  // Latest available (safe)
);
```

**Solution 2 - Check Time Validity:**

```cpp
rclcpp::Time desired_time = msg->header.stamp;

// Check if transform exists at desired time
if (tf_buffer_->canTransform("map", "base_link", desired_time)) {
    auto transform = tf_buffer_->lookupTransform("map", "base_link", desired_time);
} else {
    // Use latest instead
    RCLCPP_WARN(get_logger(), "Desired time unavailable, using latest");
    auto transform = tf_buffer_->lookupTransform("map", "base_link", tf2::TimePointZero);
}
```

**Interview Insight:**
TF2 cannot extrapolate into future. Use `tf2::TimePointZero` for latest available transform.

---

### Edge Case 3: Circular Transform Tree

**Scenario:**
Accidentally create circular dependency in transform tree.

**Code:**
```cpp
// Node 1 publishes: A → B
tf_broadcaster->sendTransform(create_transform("A", "B"));

// Node 2 publishes: B → C
tf_broadcaster->sendTransform(create_transform("B", "C"));

// Node 3 (BUG) publishes: C → A (creates cycle!)
tf_broadcaster->sendTransform(create_transform("C", "A"));
```

**Result:**
```
Transform tree:
A → B → C → A (CYCLE!)
```

**Error:**
```bash
ros2 run tf2_tools view_frames
# Warning: TF_REPEATED_DATA ignoring data with redundant timestamp for frame C (parent A) at time...
```

**Effect on Lookups:**

```cpp
try {
    auto transform = tf_buffer_->lookupTransform("A", "C", tf2::TimePointZero);
    // May work but uses incorrect path (undefined behavior)
} catch (...) {
    // Or may throw exception
}
```

**Detection:**

```bash
# View transform tree
ros2 run tf2_tools view_frames

# Check for warnings about repeated data
# Or visualize tree (cycles will be obvious)
```

**Solution - Design Proper Hierarchy:**

```
Correct tree (no cycles):
map → odom → base_link → camera_link

NOT:
map → odom → base_link → map (CYCLE!)
```

**Interview Insight:**
Each frame must have exactly ONE parent. Circular dependencies break TF2. Use `view_frames` to detect cycles.

---

### Edge Case 4: Old Transform Data (Extrapolation into Past)

**Scenario:**
Request very old transform that's beyond buffer history.

**Code:**
```cpp
// TF buffer stores last 10 seconds (default)
// Current time: t=100s

// Request transform at t=85s (15 seconds ago!)
auto old_time = now() - rclcpp::Duration::from_seconds(15.0);

try {
    auto transform = tf_buffer_->lookupTransform(
        "map", "base_link",
        old_time  // Too old!
    );
} catch (const tf2::ExtrapolationException &ex) {
    RCLCPP_ERROR(get_logger(), "Transform too old: %s", ex.what());
    // Error: Lookup would require extrapolation into the past.
}
```

**Why:**
- TF buffer has limited history (default: 10s)
- Old transforms discarded
- Requesting transform older than buffer → exception

**Solution 1 - Increase Buffer Size:**

```cpp
// Create buffer with 30-second history
tf_buffer_ = std::make_unique<tf2_ros::Buffer>(
    get_clock(),
    tf2::durationFromSec(30.0)  // 30 seconds
);
```

**Solution 2 - Check Time Availability:**

```cpp
rclcpp::Time sensor_time = msg->header.stamp;
auto buffer_length = tf2::durationFromSec(10.0);  // Buffer size

if ((now() - sensor_time) > buffer_length) {
    RCLCPP_WARN(get_logger(), "Sensor data too old (%.2f s), skipping",
                (now() - sensor_time).seconds());
    return;
}

// Safe to lookup
auto transform = tf_buffer_->lookupTransform("map", "laser_link", sensor_time);
```

**Interview Insight:**
TF buffer has limited history. Increase buffer size or discard old sensor data that falls outside buffer range.

---

## CODE_EXAMPLES

### Example 1: Complete TF2 Robot Example

**File: `robot_tf_publisher.cpp`**

```cpp
#include "rclcpp/rclcpp.hpp"
#include "tf2_ros/transform_broadcaster.h"
#include "tf2_ros/static_transform_broadcaster.h"
#include "geometry_msgs/msg/transform_stamped.hpp"
#include "nav_msgs/msg/odometry.hpp"
#include "tf2/LinearMath/Quaternion.h"

class RobotTFPublisher : public rclcpp::Node {
public:
    RobotTFPublisher() : Node("robot_tf_publisher") {
        // Dynamic transform broadcaster (for moving frames)
        tf_broadcaster_ = std::make_unique<tf2_ros::TransformBroadcaster>(this);

        // Static transform broadcaster (for fixed frames)
        tf_static_broadcaster_ = std::make_shared<tf2_ros::StaticTransformBroadcaster>(this);

        // Publish static transforms (robot geometry)
        publish_static_transforms();

        // Subscribe to odometry for dynamic transform
        odom_sub_ = create_subscription<nav_msgs::msg::Odometry>(
            "odom", 10,
            std::bind(&RobotTFPublisher::odom_callback, this, std::placeholders::_1)
        );

        RCLCPP_INFO(get_logger(), "Robot TF publisher initialized");
    }

private:
    void publish_static_transforms() {
        std::vector<geometry_msgs::msg::TransformStamped> static_transforms;

        // base_link → laser_link
        auto laser_tf = create_transform("base_link", "laser_link",
                                         0.15, 0.0, 0.10,  // x, y, z
                                         0.0, 0.0, 0.0);    // roll, pitch, yaw
        static_transforms.push_back(laser_tf);

        // base_link → camera_link
        auto camera_tf = create_transform("base_link", "camera_link",
                                          0.20, 0.0, 0.15,
                                          0.0, 0.0, 0.0);
        static_transforms.push_back(camera_tf);

        // camera_link → camera_optical_frame (90° rotation)
        auto optical_tf = create_transform("camera_link", "camera_optical_frame",
                                           0.0, 0.0, 0.0,
                                           -M_PI/2, 0.0, -M_PI/2);  // Camera coordinate convention
        static_transforms.push_back(optical_tf);

        // base_link → left_wheel
        auto left_wheel_tf = create_transform("base_link", "left_wheel",
                                              0.0, 0.15, -0.05,
                                              0.0, 0.0, 0.0);
        static_transforms.push_back(left_wheel_tf);

        // base_link → right_wheel
        auto right_wheel_tf = create_transform("base_link", "right_wheel",
                                               0.0, -0.15, -0.05,
                                               0.0, 0.0, 0.0);
        static_transforms.push_back(right_wheel_tf);

        // Publish all static transforms
        tf_static_broadcaster_->sendTransform(static_transforms);

        RCLCPP_INFO(get_logger(), "Published %zu static transforms", static_transforms.size());
    }

    geometry_msgs::msg::TransformStamped create_transform(
        const std::string &parent, const std::string &child,
        double x, double y, double z,
        double roll, double pitch, double yaw)
    {
        geometry_msgs::msg::TransformStamped transform;

        transform.header.stamp = now();
        transform.header.frame_id = parent;
        transform.child_frame_id = child;

        transform.transform.translation.x = x;
        transform.transform.translation.y = y;
        transform.transform.translation.z = z;

        tf2::Quaternion q;
        q.setRPY(roll, pitch, yaw);
        transform.transform.rotation.x = q.x();
        transform.transform.rotation.y = q.y();
        transform.transform.rotation.z = q.z();
        transform.transform.rotation.w = q.w();

        return transform;
    }

    void odom_callback(const nav_msgs::msg::Odometry::SharedPtr msg) {
        // Publish dynamic transform: odom → base_link
        geometry_msgs::msg::TransformStamped transform;

        transform.header.stamp = msg->header.stamp;
        transform.header.frame_id = "odom";
        transform.child_frame_id = "base_link";

        transform.transform.translation.x = msg->pose.pose.position.x;
        transform.transform.translation.y = msg->pose.pose.position.y;
        transform.transform.translation.z = msg->pose.pose.position.z;

        transform.transform.rotation = msg->pose.pose.orientation;

        tf_broadcaster_->sendTransform(transform);
    }

    std::unique_ptr<tf2_ros::TransformBroadcaster> tf_broadcaster_;
    std::shared_ptr<tf2_ros::StaticTransformBroadcaster> tf_static_broadcaster_;
    rclcpp::Subscription<nav_msgs::msg::Odometry>::SharedPtr odom_sub_;
};

int main(int argc, char **argv) {
    rclcpp::init(argc, argv);
    rclcpp::spin(std::make_shared<RobotTFPublisher>());
    rclcpp::shutdown();
    return 0;
}
```

**File: `laser_to_map.cpp` (Transform Listener Example)**

```cpp
#include "rclcpp/rclcpp.hpp"
#include "tf2_ros/buffer.h"
#include "tf2_ros/transform_listener.h"
#include "sensor_msgs/msg/laser_scan.hpp"
#include "sensor_msgs/msg/point_cloud2.hpp"
#include "tf2_geometry_msgs/tf2_geometry_msgs.hpp"
#include "laser_geometry/laser_geometry.hpp"

class LaserToMapConverter : public rclcpp::Node {
public:
    LaserToMapConverter() : Node("laser_to_map") {
        // TF setup
        tf_buffer_ = std::make_unique<tf2_ros::Buffer>(get_clock());
        tf_listener_ = std::make_shared<tf2_ros::TransformListener>(*tf_buffer_);

        // Subscribe to laser scan
        laser_sub_ = create_subscription<sensor_msgs::msg::LaserScan>(
            "scan", rclcpp::SensorDataQoS(),
            std::bind(&LaserToMapConverter::laser_callback, this, std::placeholders::_1)
        );

        // Publish transformed point cloud
        cloud_pub_ = create_publisher<sensor_msgs::msg::PointCloud2>("scan_map", 10);

        RCLCPP_INFO(get_logger(), "Laser to map converter ready");
    }

private:
    void laser_callback(const sensor_msgs::msg::LaserScan::SharedPtr scan) {
        // Convert laser scan to point cloud
        sensor_msgs::msg::PointCloud2 cloud_laser;
        projector_.projectLaser(*scan, cloud_laser);

        try {
            // Transform point cloud from laser_link to map frame
            sensor_msgs::msg::PointCloud2 cloud_map;

            // Get transform at time of laser scan
            auto transform = tf_buffer_->lookupTransform(
                "map",                    // Target frame
                cloud_laser.header.frame_id,  // Source frame (laser_link)
                tf2_ros::fromMsg(scan->header.stamp),  // Time of scan
                std::chrono::milliseconds(100)  // Timeout
            );

            // Transform point cloud
            tf2::doTransform(cloud_laser, cloud_map, transform);

            // Publish
            cloud_pub_->publish(cloud_map);

        } catch (const tf2::TransformException &ex) {
            RCLCPP_WARN_THROTTLE(get_logger(), *get_clock(), 1000,
                "Transform failed: %s", ex.what());
        }
    }

    std::unique_ptr<tf2_ros::Buffer> tf_buffer_;
    std::shared_ptr<tf2_ros::TransformListener> tf_listener_;
    laser_geometry::LaserProjection projector_;

    rclcpp::Subscription<sensor_msgs::msg::LaserScan>::SharedPtr laser_sub_;
    rclcpp::Publisher<sensor_msgs::msg::PointCloud2>::SharedPtr cloud_pub_;
};
```

---

## INTERVIEW_QA

### Q1: What is TF2 and why is it important in ROS2?

**Difficulty:** ⭐⭐ (Easy)

**Answer:**

TF2 is ROS2's **transform library** for managing coordinate frames and transformations between them.

**Why Important:**

Robots have many coordinate frames:
- Sensors (camera, lidar)
- Robot parts (base, wheels)
- World frames (map, odom)

**Without TF2:**
- Manually compute transforms (error-prone)
- Handle time synchronization manually
- Track all frame relationships

**With TF2:**
- Automatic transform computation through tree
- Time synchronization built-in
- Centralized frame management

**Example:**

```cpp
// Without TF2 (manual, error-prone)
Point camera_point = {1.0, 0.5, 0.2};
Point base_point;
base_point.x = camera_point.x * cos(angle) + offset_x;
// ... complex math, easy to make mistakes

// With TF2 (automatic)
tf_buffer->transform(camera_point, base_point, "base_link");
// TF2 handles everything!
```

**Interview Insight:**
TF2 is essential for coordinate frame management. It automates transform computation and time synchronization.

---

### Q2: What's the difference between static and dynamic transforms?

**Difficulty:** ⭐⭐ (Easy)

**Answer:**

| Aspect | Static Transform | Dynamic Transform |
|--------|-----------------|-------------------|
| **Changes** | Never | Frequently |
| **Broadcaster** | `StaticTransformBroadcaster` | `TransformBroadcaster` |
| **Topic** | `/tf_static` (latched) | `/tf` (streaming) |
| **Example** | Sensor mount, robot geometry | Odometry, joint states |
| **Frequency** | Once at startup | Every update (10-100 Hz) |

**Static Example:**
```cpp
// Camera mounted on robot (fixed position)
tf_static_broadcaster->sendTransform(base_to_camera_transform);
// Published once, never changes
```

**Dynamic Example:**
```cpp
// Robot moving in world
tf_broadcaster->sendTransform(odom_to_base_transform);
// Published every odometry update (e.g., 50 Hz)
```

**Interview Insight:**
Use static transforms for fixed geometry, dynamic transforms for moving frames.

---

### Q3: How does TF2 handle transform lookups at specific times?

**Difficulty:** ⭐⭐⭐⭐ (Hard)

**Answer:**

TF2 stores **transform history** (default: 10 seconds) and supports:

1. **Latest transform:**
   ```cpp
   lookupTransform("map", "base_link", tf2::TimePointZero);
   ```

2. **Historical transform:**
   ```cpp
   rclcpp::Time past_time = now() - rclcpp::Duration::from_seconds(2.0);
   lookupTransform("map", "base_link", past_time);
   ```

3. **Interpolation:**
   If exact time not available, TF2 **interpolates** between nearest transforms:
   ```
   Stored: t=1.0s (x=1.0), t=2.0s (x=2.0)
   Query:  t=1.5s
   Result: x=1.5 (interpolated) ✓
   ```

4. **Extrapolation (NOT supported):**
   ```cpp
   // Future time → Exception!
   lookupTransform("map", "base_link", future_time);  // ✗
   ```

**Use Case - Sensor Synchronization:**

```cpp
void laser_callback(sensor_msgs::msg::LaserScan::SharedPtr scan) {
    // Get robot pose at EXACT time laser was captured
    auto transform = tf_buffer->lookupTransform(
        "map", "laser_link",
        scan->header.stamp  // Historical lookup
    );

    // Correctly project laser into map (time-synchronized)
}
```

**Interview Insight:**
TF2 buffer stores history and interpolates between transforms. Cannot extrapolate into future.

---

### Q4: What causes "Lookup would require extrapolation into the past" error?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

**Cause:**
Requesting transform **older than TF buffer history**.

**Default buffer:** 10 seconds

**Example:**
```cpp
// Buffer stores last 10 seconds
// Current time: t=100s

// Request transform at t=85s (15s ago)
lookupTransform("map", "base_link",
                now() - Duration::from_seconds(15.0));
// ✗ Error: Too old!
```

**Solutions:**

**1. Increase buffer size:**
```cpp
tf_buffer_ = std::make_unique<tf2_ros::Buffer>(
    get_clock(),
    tf2::durationFromSec(30.0)  // 30-second history
);
```

**2. Discard old data:**
```cpp
if ((now() - sensor_time) > Duration::from_seconds(10.0)) {
    RCLCPP_WARN(logger, "Sensor data too old, discarding");
    return;
}
```

**3. Use latest available:**
```cpp
lookupTransform("map", "base_link", tf2::TimePointZero);
```

**Interview Insight:**
TF buffer has limited history. Increase buffer size or discard old sensor data.

---

### Q5: Can you have multiple parents for a single frame in TF2?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

**NO** - Each frame must have exactly **ONE parent**.

**Why:**
- TF tree is a **directed acyclic graph**
- Multiple parents create ambiguity
- Which path to use for transform?

**Example (WRONG):**
```cpp
// Node 1: map → base_link
sendTransform(create_tf("map", "base_link"));

// Node 2: odom → base_link (CONFLICT!)
sendTransform(create_tf("odom", "base_link"));
```

**Result:**
- TF tree has two parents for `base_link` (invalid!)
- Undefined behavior (which transform used?)
- Error messages in TF

**Correct Design:**
```
map → odom → base_link  ✓ (single parent per frame)

NOT:
map → base_link  }
odom → base_link }  ✗ (two parents)
```

**Detection:**
```bash
ros2 run tf2_tools view_frames
# Warning: Frame base_link has multiple parents
```

**Interview Insight:**
Transform tree must be acyclic with single parent per frame. Multiple parents break TF2.

---

## PRACTICE_TASKS

### Task 1: Complete Robot TF Tree

Create node publishing complete TF tree:
- `map` → `odom` (identity initially)
- `odom` → `base_link` (from odometry)
- `base_link` → `laser_link` (static)
- `base_link` → `camera_link` (static)

Verify with `view_frames`.

---

### Task 2: Transform Point Cloud

Create node that:
- Subscribes to laser scan
- Transforms to map frame
- Publishes as PointCloud2
- Handles transform errors gracefully

---

### Task 3: TF Time Synchronization

Create node that:
- Subscribes to camera images (with timestamps)
- Transforms camera pose to map at image capture time
- Logs any extrapolation errors
- Increases buffer if needed

---

## QUICK_REFERENCE

### TF2 Frame Hierarchy

```
map (global)
 └─ odom (odometry origin)
     └─ base_link (robot center)
         ├─ laser_link
         ├─ camera_link
         │   └─ camera_optical_frame
         ├─ left_wheel
         └─ right_wheel
```

### Broadcasting Transforms

```cpp
// Static (fixed geometry)
tf2_ros::StaticTransformBroadcaster tf_static_broadcaster(node);
tf_static_broadcaster.sendTransform(transform);

// Dynamic (moving frames)
tf2_ros::TransformBroadcaster tf_broadcaster(node);
tf_broadcaster.sendTransform(transform);
```

### Looking Up Transforms

```cpp
tf2_ros::Buffer tf_buffer(clock);
tf2_ros::TransformListener tf_listener(tf_buffer);

// Latest
auto tf = tf_buffer.lookupTransform("target", "source", tf2::TimePointZero);

// At specific time
auto tf = tf_buffer.lookupTransform("target", "source", time, timeout);
```

### Common Commands

```bash
ros2 run tf2_tools view_frames           # Visualize TF tree
ros2 run tf2_ros tf2_echo parent child   # Print transform
ros2 topic echo /tf                      # View all transforms
ros2 topic echo /tf_static               # View static transforms
```

---

**END OF TOPIC 3.1**
