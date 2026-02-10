# Topic 2.5: Quality of Service (QoS) Policies

## THEORY_SECTION

### 1. QoS Fundamentals

**What is QoS?**

Quality of Service (QoS) defines **communication reliability guarantees** for publishers/subscribers in ROS2.

**Why QoS Matters:**

ROS2 uses DDS (Data Distribution Service) which offers **configurable reliability**. Unlike ROS1 (best-effort only), ROS2 lets you choose trade-offs:

- **Reliability** vs **Performance**
- **History** vs **Memory usage**
- **Latency** vs **Completeness**

**Key QoS Policies:**

| Policy | Values | Purpose |
|--------|--------|---------|
| **Reliability** | RELIABLE, BEST_EFFORT | Message delivery guarantee |
| **Durability** | TRANSIENT_LOCAL, VOLATILE | Late-joiner message access |
| **History** | KEEP_LAST(n), KEEP_ALL | Message queue behavior |
| **Deadline** | Duration | Max time between messages |
| **Liveliness** | AUTOMATIC, MANUAL_BY_TOPIC | Publisher "alive" checks |
| **Lifespan** | Duration | Message expiration time |

---

### 2. Reliability Policy

**Controls whether messages are guaranteed to arrive.**

**RELIABLE:**
- **Guarantee**: All messages delivered (with retries)
- **Overhead**: Higher (acknowledgments, retries)
- **Use Case**: Critical data (commands, state)

**BEST_EFFORT:**
- **Guarantee**: None (drop messages under congestion)
- **Overhead**: Lower (no acks, no retries)
- **Use Case**: High-frequency data where drops are acceptable (sensor streams)

**Example:**

```cpp
// RELIABLE: Command messages must arrive
auto qos_reliable = rclcpp::QoS(10).reliable();
auto cmd_pub = create_publisher<Twist>("cmd_vel", qos_reliable);

// BEST_EFFORT: Sensor data, drops OK
auto qos_best_effort = rclcpp::QoS(10).best_effort();
auto sensor_sub = create_subscription<LaserScan>("scan", qos_best_effort, callback);
```

**Reliability Comparison:**

```
RELIABLE:
Pub → [msg1] → Network congestion → [retry] → [retry] → Sub ✓
    → [msg2] → [retry] → Sub ✓

BEST_EFFORT:
Pub → [msg1] → Network congestion → ✗ Dropped
    → [msg2] → Sub ✓ (msg1 lost forever)
```

---

### 3. Durability Policy

**Controls whether late-joining subscribers receive past messages.**

**TRANSIENT_LOCAL:**
- Publisher **caches** messages
- Late subscribers receive **recent messages** (up to History depth)
- Use Case: Configuration, maps, static data

**VOLATILE:**
- No caching
- Late subscribers receive **only new messages** (after subscription)
- Use Case: Real-time data streams

**Example:**

```cpp
// TRANSIENT_LOCAL: Late subscribers get map
auto qos_map = rclcpp::QoS(1).transient_local();
auto map_pub = create_publisher<OccupancyGrid>("map", qos_map);

// VOLATILE: Only get new sensor data
auto qos_sensor = rclcpp::QoS(10).durability_volatile();
auto camera_sub = create_subscription<Image>("camera", qos_sensor, callback);
```

**Timeline:**

```
TRANSIENT_LOCAL:
t=0s:  Pub publishes map
t=5s:  Sub1 subscribes → receives map ✓
t=10s: Sub2 subscribes → receives map ✓ (cached)

VOLATILE:
t=0s:  Pub publishes sensor data
t=5s:  Sub1 subscribes → receives only NEW data
t=10s: Pub publishes again → Sub1 receives ✓
```

---

### 4. History Policy

**Controls how many messages are kept in queue.**

**KEEP_LAST(n):**
- Keep last **N** messages
- Oldest discarded when full
- Bounded memory

**KEEP_ALL:**
- Keep **all** messages until delivered
- Unbounded memory (risk of overflow)
- Use with caution

**Example:**

```cpp
// KEEP_LAST: Keep last 10 sensor readings
auto qos = rclcpp::QoS(rclcpp::KeepLast(10));
auto sensor_pub = create_publisher<Imu>("imu", qos);

// KEEP_ALL: Keep all commands until processed
auto qos_all = rclcpp::QoS(rclcpp::KeepAll());
auto cmd_sub = create_subscription<Command>("commands", qos_all, callback);
```

**Behavior:**

```
KEEP_LAST(3):
Pub sends: [msg1, msg2, msg3, msg4, msg5]
Queue: [msg3, msg4, msg5]  (msg1, msg2 dropped)

KEEP_ALL:
Pub sends: [msg1, msg2, ..., msg1000]
Queue: [msg1, msg2, ..., msg1000]  (all kept, memory grows!)
```

---

### 5. Deadline Policy

**Specifies maximum time between messages.**

**Purpose:**
- Detect **slow publishers** or **network issues**
- Trigger alerts when message rate drops

**Example:**

```cpp
// Expect sensor data every 100ms
auto qos = rclcpp::QoS(10).deadline(std::chrono::milliseconds(100));

auto sensor_sub = create_subscription<LaserScan>(
    "scan", qos,
    [](LaserScan::SharedPtr msg) { /* process */ }
);

// Deadline event callback (called when deadline missed)
auto deadline_event_callback = [](rclcpp::QOSDeadlineRequestedInfo &info) {
    RCLCPP_WARN(logger, "Deadline missed! Messages late.");
};
// Register event callback...
```

**Timeline:**

```
Expected: Every 100ms
t=0ms:   Msg arrives ✓
t=100ms: Msg arrives ✓
t=250ms: Msg arrives (150ms late!) → Deadline event triggered
```

---

### 6. Liveliness Policy

**Determines how "aliveness" of publisher is tracked.**

**AUTOMATIC:**
- DDS automatically tracks publisher liveness
- No action needed from user
- Default

**MANUAL_BY_TOPIC:**
- User must explicitly assert liveness
- Useful for custom health monitoring

**Example:**

```cpp
// Subscriber expects publisher to be alive
auto qos = rclcpp::QoS(10)
    .liveliness(rclcpp::LivelinessPolicy::Automatic)
    .liveliness_lease_duration(std::chrono::seconds(1));

auto sub = create_subscription<Msg>("topic", qos, callback);

// If publisher doesn't publish for >1s → liveliness lost event
```

---

### 7. Lifespan Policy

**Maximum time a message is valid.**

**Purpose:**
- Expire **stale data** (old sensor readings, outdated commands)
- Prevent processing obsolete information

**Example:**

```cpp
// Messages expire after 500ms
auto qos = rclcpp::QoS(10).lifespan(std::chrono::milliseconds(500));
auto cmd_pub = create_publisher<Twist>("cmd_vel", qos);

// Published at t=0ms, expires at t=500ms
// Subscriber receiving at t=600ms won't get message (expired)
```

---

### 8. QoS Profiles (Presets)

**ROS2 provides standard QoS profiles for common use cases.**

**Sensor Data Profile:**

```cpp
auto qos = rclcpp::SensorDataQoS();
// Equivalent to:
// - BEST_EFFORT
// - VOLATILE
// - KEEP_LAST(5)
```

**Use:** High-frequency sensor data (camera, lidar, IMU)

**Services Profile:**

```cpp
auto qos = rclcpp::ServicesQoS();
// Equivalent to:
// - RELIABLE
// - VOLATILE
// - KEEP_LAST(10)
```

**Use:** Request-response communication

**Parameters Profile:**

```cpp
auto qos = rclcpp::ParametersQoS();
// Equivalent to:
// - RELIABLE
// - VOLATILE
// - KEEP_LAST(1000)
```

**Use:** Parameter events

**System Default:**

```cpp
auto qos = rclcpp::SystemDefaultsQoS();
// Equivalent to:
// - RELIABLE
// - VOLATILE
// - KEEP_LAST(10)
```

**Use:** General purpose

**Comparison:**

| Profile | Reliability | Durability | History |
|---------|-------------|------------|---------|
| **SensorData** | BEST_EFFORT | VOLATILE | KEEP_LAST(5) |
| **Services** | RELIABLE | VOLATILE | KEEP_LAST(10) |
| **Parameters** | RELIABLE | VOLATILE | KEEP_LAST(1000) |
| **SystemDefault** | RELIABLE | VOLATILE | KEEP_LAST(10) |

---

### 9. QoS Compatibility

**For pub-sub to connect, QoS must be compatible.**

**Compatibility Rules:**

| Publisher | Subscriber | Compatible? |
|-----------|------------|-------------|
| RELIABLE | RELIABLE | ✓ Yes |
| RELIABLE | BEST_EFFORT | ✓ Yes (sub gets reliable delivery) |
| BEST_EFFORT | RELIABLE | ✗ **NO** |
| BEST_EFFORT | BEST_EFFORT | ✓ Yes |

| Publisher | Subscriber | Compatible? |
|-----------|------------|-------------|
| TRANSIENT_LOCAL | TRANSIENT_LOCAL | ✓ Yes |
| TRANSIENT_LOCAL | VOLATILE | ✓ Yes (sub won't get cached) |
| VOLATILE | TRANSIENT_LOCAL | ✗ **NO** |
| VOLATILE | VOLATILE | ✓ Yes |

**Key Rule:**
- **Subscriber can be "less strict"** than publisher
- **Subscriber cannot be "more strict"** than publisher

**Example Mismatch:**

```cpp
// Publisher: BEST_EFFORT
auto pub_qos = rclcpp::QoS(10).best_effort();
auto pub = create_publisher<Msg>("topic", pub_qos);

// Subscriber: RELIABLE (wants guarantees)
auto sub_qos = rclcpp::QoS(10).reliable();
auto sub = create_subscription<Msg>("topic", sub_qos, callback);

// Result: NO CONNECTION (incompatible)
```

**Check Compatibility:**

```bash
ros2 topic info /topic -v
# Publishers:
#   QoS: Reliability: BEST_EFFORT
#
# Subscribers:
#   QoS: Reliability: RELIABLE
#
# Warning: QoS mismatch!
```

---

## EDGE_CASES

### Edge Case 1: QoS Mismatch Prevents Communication

**Scenario:**
Publisher and subscriber have incompatible QoS. No data flows.

**Publisher:**
```cpp
auto qos = rclcpp::SensorDataQoS();  // BEST_EFFORT
auto pub = create_publisher<LaserScan>("scan", qos);
```

**Subscriber:**
```cpp
auto qos = rclcpp::QoS(10).reliable();  // RELIABLE
auto sub = create_subscription<LaserScan>("scan", qos, callback);
```

**Result:**
- Subscriber never receives messages
- **No error or warning** in code!
- Silent failure

**Diagnosis:**

```bash
ros2 topic info /scan -v

# Type: sensor_msgs/msg/LaserScan
#
# Publisher count: 1
#   QoS Profile:
#     Reliability: BEST_EFFORT
#
# Subscriber count: 1
#   QoS Profile:
#     Reliability: RELIABLE
#
# Warning: Publishers and subscribers have incompatible QoS policies!
```

**Solution:**

Match QoS or make subscriber less strict:

```cpp
// Option 1: Use same profile
auto qos = rclcpp::SensorDataQoS();
auto sub = create_subscription<LaserScan>("scan", qos, callback);

// Option 2: Explicit best-effort
auto qos = rclcpp::QoS(10).best_effort();
auto sub = create_subscription<LaserScan>("scan", qos, callback);
```

**Interview Insight:**
QoS mismatches cause silent failures. Use `ros2 topic info -v` to diagnose.

---

### Edge Case 2: KEEP_ALL Memory Overflow

**Scenario:**
Slow subscriber + KEEP_ALL → unbounded memory growth.

**Publisher (fast):**
```cpp
auto qos = rclcpp::QoS(rclcpp::KeepAll()).reliable();
auto pub = create_publisher<Image>("camera", qos);

// Publishes 30 FPS
auto timer = create_wall_timer(33ms, [&]() {
    pub->publish(image);  // ~10MB per image
});
```

**Subscriber (slow):**
```cpp
auto qos = rclcpp::QoS(rclcpp::KeepAll()).reliable();
auto sub = create_subscription<Image>("camera", qos, [](Image::SharedPtr msg) {
    std::this_thread::sleep_for(1s);  // Slow processing (1 FPS)
});
```

**Result:**
- Publisher: 30 msg/s
- Subscriber: 1 msg/s
- **Queue grows at 29 msg/s**
- Each message ~10MB → **290MB/s memory growth!**
- **Out of memory** crash within minutes

**Solution - Use KEEP_LAST:**

```cpp
auto qos = rclcpp::QoS(rclcpp::KeepLast(10)).reliable();
// Queue capped at 10 messages (~100MB max)
```

**Interview Insight:**
KEEP_ALL is dangerous with slow subscribers. Always use KEEP_LAST with bounded depth.

---

### Edge Case 3: TRANSIENT_LOCAL Late Joiner Gets Stale Data

**Scenario:**
Subscriber joins late, receives outdated cached message.

**Publisher:**
```cpp
auto qos = rclcpp::QoS(1).transient_local().reliable();
auto map_pub = create_publisher<OccupancyGrid>("map", qos);

// Publish map at t=0
map_pub->publish(initial_map);

// Update map at t=60s
map_pub->publish(updated_map);
```

**Subscriber (joins at t=120s):**
```cpp
auto qos = rclcpp::QoS(1).transient_local().reliable();
auto sub = create_subscription<OccupancyGrid>("map", qos, callback);

// Receives updated_map (most recent cached)
```

**Problem:**
If subscriber expects "current" state but receives message published 2 minutes ago, might seem stale.

**Solution - Check Timestamp:**

```cpp
void callback(OccupancyGrid::SharedPtr msg) {
    auto age = now() - rclcpp::Time(msg->header.stamp);

    if (age.seconds() > 10.0) {
        RCLCPP_WARN(get_logger(), "Received stale map: %.1f s old", age.seconds());
        // Request fresh map or handle staleness
    }

    process_map(msg);
}
```

**Interview Insight:**
TRANSIENT_LOCAL provides past messages. Check timestamps to detect staleness.

---

### Edge Case 4: Deadline Missed Due to Processing Time

**Scenario:**
Subscriber processes messages slower than deadline, constant violations.

**Publisher:**
```cpp
auto qos = rclcpp::QoS(10)
    .deadline(std::chrono::milliseconds(100));  // Expect 10 Hz

auto pub = create_publisher<Msg>("topic", qos);

// Publishes every 100ms (on time)
auto timer = create_wall_timer(100ms, [&]() {
    pub->publish(msg);
});
```

**Subscriber:**
```cpp
auto qos = rclcpp::QoS(10)
    .deadline(std::chrono::milliseconds(100));

auto sub = create_subscription<Msg>("topic", qos, [](Msg::SharedPtr msg) {
    process_message(msg);  // Takes 150ms! (too slow)
});
```

**Result:**
- Publisher sends every 100ms
- Subscriber takes 150ms to process
- Callbacks queue up
- **Constant deadline violations**

**Why:**
Deadline measures **time between deliveries**, not just publisher rate.

**Solution - Faster Processing:**

```cpp
// Option 1: Offload processing
auto sub = create_subscription<Msg>("topic", qos, [this](Msg::SharedPtr msg) {
    work_queue_.push(msg);  // Non-blocking
});

// Separate worker thread processes queue

// Option 2: Increase deadline
auto qos = rclcpp::QoS(10)
    .deadline(std::chrono::milliseconds(200));  // More lenient
```

**Interview Insight:**
Deadline violations occur if subscriber can't keep up with message rate. Offload slow processing.

---

## CODE_EXAMPLES

### Example 1: Sensor Fusion with Mixed QoS

```cpp
#include "rclcpp/rclcpp.hpp"
#include "sensor_msgs/msg/laser_scan.hpp"
#include "sensor_msgs/msg/image.hpp"
#include "geometry_msgs/msg/pose_stamped.hpp"

class SensorFusion : public rclcpp::Node {
public:
    SensorFusion() : Node("sensor_fusion") {
        // High-frequency sensors: BEST_EFFORT, small history
        auto lidar_qos = rclcpp::SensorDataQoS();  // BEST_EFFORT, KEEP_LAST(5)

        lidar_sub_ = create_subscription<sensor_msgs::msg::LaserScan>(
            "scan", lidar_qos,
            std::bind(&SensorFusion::lidar_callback, this, std::placeholders::_1)
        );

        camera_sub_ = create_subscription<sensor_msgs::msg::Image>(
            "camera/image", lidar_qos,
            std::bind(&SensorFusion::camera_callback, this, std::placeholders::_1)
        );

        // Low-frequency pose: RELIABLE, cached for late joiners
        auto pose_qos = rclcpp::QoS(1)
            .reliable()
            .transient_local()  // Late subscribers get last pose
            .deadline(std::chrono::milliseconds(500));  // Expect 2 Hz

        pose_sub_ = create_subscription<geometry_msgs::msg::PoseStamped>(
            "pose", pose_qos,
            std::bind(&SensorFusion::pose_callback, this, std::placeholders::_1)
        );

        // Fused output: RELIABLE
        auto output_qos = rclcpp::QoS(10).reliable();
        fused_pub_ = create_publisher<sensor_msgs::msg::PointCloud2>(
            "fused_cloud", output_qos
        );

        // Register QoS event callbacks
        lidar_sub_->set_on_new_qos_event_callback(
            [this](rclcpp::QOSRequestedDeadlineMissedInfo &info) {
                RCLCPP_WARN(get_logger(), "Lidar deadline missed: %d total misses",
                            info.total_count);
            },
            rclcpp::QOSEventType::REQUESTED_DEADLINE_MISSED
        );

        RCLCPP_INFO(get_logger(), "Sensor fusion node initialized");
    }

private:
    void lidar_callback(const sensor_msgs::msg::LaserScan::SharedPtr msg) {
        // Check message age
        auto age = now() - rclcpp::Time(msg->header.stamp);
        if (age.seconds() > 0.2) {
            RCLCPP_WARN_THROTTLE(get_logger(), *get_clock(), 1000,
                "Lidar data is %.3f s old (stale)", age.seconds());
        }

        latest_lidar_ = msg;
        fuse_sensors();
    }

    void camera_callback(const sensor_msgs::msg::Image::SharedPtr msg) {
        latest_camera_ = msg;
        fuse_sensors();
    }

    void pose_callback(const geometry_msgs::msg::PoseStamped::SharedPtr msg) {
        latest_pose_ = msg;
        RCLCPP_INFO(get_logger(), "Received pose update");
    }

    void fuse_sensors() {
        if (!latest_lidar_ || !latest_camera_ || !latest_pose_) {
            return;  // Wait for all sensors
        }

        // Fuse sensor data...
        auto fused = fuse(latest_lidar_, latest_camera_, latest_pose_);

        fused_pub_->publish(fused);
    }

    sensor_msgs::msg::LaserScan::SharedPtr latest_lidar_;
    sensor_msgs::msg::Image::SharedPtr latest_camera_;
    geometry_msgs::msg::PoseStamped::SharedPtr latest_pose_;

    rclcpp::Subscription<sensor_msgs::msg::LaserScan>::SharedPtr lidar_sub_;
    rclcpp::Subscription<sensor_msgs::msg::Image>::SharedPtr camera_sub_;
    rclcpp::Subscription<geometry_msgs::msg::PoseStamped>::SharedPtr pose_sub_;
    rclcpp::Publisher<sensor_msgs::msg::PointCloud2>::SharedPtr fused_pub_;
};
```

---

## INTERVIEW_QA

### Q1: What's the difference between RELIABLE and BEST_EFFORT?

**Difficulty:** ⭐⭐ (Easy)

**Answer:**

| Aspect | RELIABLE | BEST_EFFORT |
|--------|----------|-------------|
| **Guarantee** | All messages delivered | No guarantee (can drop) |
| **Retries** | Yes (until delivered) | No |
| **Overhead** | Higher (acks, retries) | Lower |
| **Latency** | Higher (waits for acks) | Lower |
| **Use Case** | Commands, critical state | Sensor streams |

**Example:**

```cpp
// RELIABLE: Robot commands must arrive
auto cmd_qos = rclcpp::QoS(10).reliable();
auto cmd_pub = create_publisher<Twist>("cmd_vel", cmd_qos);

// BEST_EFFORT: Camera frames, drops OK
auto camera_qos = rclcpp::SensorDataQoS();  // BEST_EFFORT
auto camera_sub = create_subscription<Image>("camera", camera_qos, callback);
```

**Interview Insight:**
RELIABLE for critical data, BEST_EFFORT for high-frequency streams where drops are acceptable.

---

### Q2: Why might a subscriber not receive messages even though publisher is running?

**Difficulty:** ⭐⭐⭐⭐ (Hard)

**Answer:**

**Possible Causes:**

**1. QoS Mismatch:**
- Pub: BEST_EFFORT, Sub: RELIABLE → **Incompatible**
- Pub: VOLATILE, Sub: TRANSIENT_LOCAL → **Incompatible**

**Check:**
```bash
ros2 topic info /topic -v
# Look for QoS mismatch warnings
```

**2. Topic Name Typo:**
- Pub: `/robot/cmd_vel`
- Sub: `/cmd_vel` (wrong!)

**3. Message Type Mismatch:**
- Pub: `geometry_msgs/msg/Twist`
- Sub: `geometry_msgs/msg/TwistStamped` (different!)

**4. Different ROS_DOMAIN_ID:**
- Pub: ROS_DOMAIN_ID=0
- Sub: ROS_DOMAIN_ID=1 (isolated networks)

**5. Network/Firewall Issues:**
- Multicast blocked
- Different subnets
- Docker networking misconfigured

**Debugging:**

```bash
# Check topic list
ros2 topic list

# Check topic info
ros2 topic info /topic -v

# Echo messages
ros2 topic echo /topic

# Check DDS discovery
ros2 daemon stop && ros2 daemon start
```

**Interview Insight:**
QoS mismatch is most common cause. Use `ros2 topic info -v` to diagnose.

---

### Q3: Explain TRANSIENT_LOCAL durability. When would you use it?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

**TRANSIENT_LOCAL:**
- Publisher **caches** recent messages (up to History depth)
- Late-joining subscribers receive **cached messages**
- Messages persist until publisher dies

**Use Cases:**

1. **Configuration/Maps:**
   ```cpp
   auto qos = rclcpp::QoS(1).transient_local();
   auto map_pub = create_publisher<OccupancyGrid>("map", qos);
   ```
   Late subscribers get current map immediately.

2. **Robot State:**
   ```cpp
   auto qos = rclcpp::QoS(1).transient_local().reliable();
   auto state_pub = create_publisher<RobotState>("robot_state", qos);
   ```
   New monitoring tools get current state.

3. **Parameter Updates:**
   ```cpp
   auto qos = rclcpp::ParametersQoS();  // Uses TRANSIENT_LOCAL
   ```

**Comparison with VOLATILE:**

```
TRANSIENT_LOCAL:
t=0: Pub sends map
t=5: Sub1 joins → gets map ✓
t=10: Sub2 joins → gets map ✓ (cached)

VOLATILE:
t=0: Pub sends sensor data
t=5: Sub1 joins → gets nothing (past data gone)
t=10: Pub sends again → Sub1 receives ✓
```

**Interview Insight:**
Use TRANSIENT_LOCAL for "state" messages that late joiners need. Use VOLATILE for streaming data.

---

### Q4: What happens with KEEP_ALL history if subscriber is slower than publisher?

**Difficulty:** ⭐⭐⭐⭐ (Hard)

**Answer:**

**KEEP_ALL = Unbounded memory growth if subscriber can't keep up.**

**Scenario:**

```cpp
// Publisher: 100 msg/s
auto pub_qos = rclcpp::QoS(rclcpp::KeepAll()).reliable();
auto pub = create_publisher<LargeMsg>("topic", pub_qos);

// Subscriber: 10 msg/s (slow)
auto sub_qos = rclcpp::QoS(rclcpp::KeepAll()).reliable();
auto sub = create_subscription<LargeMsg>("topic", sub_qos, slow_callback);
```

**Result:**
- Queue grows at **90 msg/s** (100 published - 10 consumed)
- If each message is 1MB → **90 MB/s memory growth**
- **Out of memory** crash in ~1 minute (with 8GB RAM)

**Solution - Use KEEP_LAST:**

```cpp
auto qos = rclcpp::QoS(rclcpp::KeepLast(100)).reliable();
// Queue capped at 100 messages, oldest dropped when full
```

**When to Use KEEP_ALL:**
- **Rarely** (very risky)
- Only when: Subscriber temporarily slower, but will catch up
- **Always** set reasonable time limits/monitoring

**Interview Insight:**
KEEP_ALL is dangerous. Use KEEP_LAST with bounded depth to prevent memory exhaustion.

---

### Q5: How do you check QoS compatibility between publisher and subscriber?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

**Method 1: Command Line**

```bash
ros2 topic info /topic --verbose

# Output shows QoS for each pub/sub:
# Publishers:
#   Reliability: RELIABLE
#   Durability: VOLATILE
#
# Subscribers:
#   Reliability: BEST_EFFORT
#
# Warning: Publishers and subscribers have incompatible QoS!
```

**Method 2: Programmatic Check**

```cpp
// Get publisher/subscriber counts
auto pub_count = count_publishers("/topic");
auto sub_count = count_subscribers("/topic");

if (pub_count > 0 && sub_count > 0) {
    // If both exist but no data flowing → likely QoS mismatch
    RCLCPP_WARN(get_logger(), "Topic has pubs and subs but may have QoS mismatch");
}
```

**Method 3: Echo Test**

```bash
# Try to echo topic
ros2 topic echo /topic

# If no output despite publisher running → QoS mismatch or other issue
```

**Compatibility Matrix:**

| Publisher QoS | Subscriber QoS | Compatible? |
|--------------|----------------|-------------|
| RELIABLE | RELIABLE | ✓ |
| RELIABLE | BEST_EFFORT | ✓ |
| BEST_EFFORT | RELIABLE | ✗ |
| BEST_EFFORT | BEST_EFFORT | ✓ |
| TRANSIENT_LOCAL | TRANSIENT_LOCAL | ✓ |
| TRANSIENT_LOCAL | VOLATILE | ✓ |
| VOLATILE | TRANSIENT_LOCAL | ✗ |
| VOLATILE | VOLATILE | ✓ |

**Interview Insight:**
Use `ros2 topic info -v` to check QoS settings. Subscriber must be "less or equal strict" than publisher.

---

## PRACTICE_TASKS

### Task 1: QoS Troubleshooting

Given system where subscriber doesn't receive messages:
- Publisher uses SensorDataQoS
- Subscriber uses SystemDefaultsQoS
- Diagnose and fix QoS mismatch

---

### Task 2: Adaptive QoS

Create node that:
- Monitors network quality
- Dynamically switches between RELIABLE and BEST_EFFORT
- Adjusts History depth based on subscriber performance

---

### Task 3: QoS Comparison Benchmark

Implement benchmark comparing:
- RELIABLE vs BEST_EFFORT (latency, throughput)
- KEEP_LAST(10) vs KEEP_LAST(100) (memory, drops)
- Document trade-offs

---

## QUICK_REFERENCE

### QoS Policies Quick Guide

| Policy | Common Values | Use Case |
|--------|---------------|----------|
| **Reliability** | RELIABLE, BEST_EFFORT | Critical vs streaming data |
| **Durability** | TRANSIENT_LOCAL, VOLATILE | State vs real-time |
| **History** | KEEP_LAST(n), KEEP_ALL | Queue depth |
| **Deadline** | Duration | Message rate expectations |
| **Lifespan** | Duration | Message expiration |

### Standard QoS Profiles

```cpp
rclcpp::SensorDataQoS()      // BEST_EFFORT, VOLATILE, KEEP_LAST(5)
rclcpp::ServicesQoS()        // RELIABLE, VOLATILE, KEEP_LAST(10)
rclcpp::ParametersQoS()      // RELIABLE, VOLATILE, KEEP_LAST(1000)
rclcpp::SystemDefaultsQoS()  // RELIABLE, VOLATILE, KEEP_LAST(10)
```

### QoS Compatibility

```
Subscriber can be LESS strict:
- Pub: RELIABLE → Sub: BEST_EFFORT ✓
- Pub: TRANSIENT_LOCAL → Sub: VOLATILE ✓

Subscriber CANNOT be MORE strict:
- Pub: BEST_EFFORT → Sub: RELIABLE ✗
- Pub: VOLATILE → Sub: TRANSIENT_LOCAL ✗
```

### Debugging QoS Issues

```bash
ros2 topic info /topic -v    # Check QoS settings
ros2 topic echo /topic       # Test data flow
ros2 topic hz /topic         # Check message rate
```

---

**END OF TOPIC 2.5**

**CHAPTER 2 COMPLETE!**
