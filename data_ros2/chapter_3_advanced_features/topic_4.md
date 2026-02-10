# Topic 3.4: Recording & Playback (rosbag2)

## THEORY_SECTION

### 1. rosbag2 Fundamentals

**What is rosbag2?**

rosbag2 is ROS2's tool for **recording and replaying** topic data:
- **Record** messages during robot operation
- **Replay** for testing, debugging, visualization
- **Share** data for analysis
- **Reproduce** bugs offline

**Use Cases:**

| Use Case | Benefit |
|----------|---------|
| **Development** | Test algorithms without hardware |
| **Debugging** | Reproduce bugs deterministically |
| **Data collection** | Gather training data for ML |
| **Demos** | Show robot behavior without robot |
| **Regression testing** | Verify behavior on recorded data |

**ROS1 vs ROS2 (rosbag2):**

| Feature | ROS1 (rosbag) | ROS2 (rosbag2) |
|---------|---------------|----------------|
| **Storage** | Single file | Directory with metadata + data |
| **Formats** | Custom binary | SQLite, MCAP (pluggable) |
| **Compression** | BZ2, LZ4 | Zstd, LZ4 (pluggable) |
| **Type safety** | Weak | Strong (message types recorded) |
| **Performance** | Good | Better (parallel read/write) |

---

### 2. Recording Data

**Basic Recording:**

```bash
# Record all topics
ros2 bag record -a

# Record specific topics
ros2 bag record /camera/image /laser/scan /odom

# Record with custom name
ros2 bag record -o my_dataset /camera/image /laser/scan

# Record for specific duration
ros2 bag record --duration 60 /camera/image  # 60 seconds

# Record with compression
ros2 bag record --compression-mode file --compression-format zstd /camera/image
```

**Recording Options:**

| Option | Purpose | Example |
|--------|---------|---------|
| `-a, --all` | Record all topics | `ros2 bag record -a` |
| `-o, --output` | Output bag name | `ros2 bag record -o dataset` |
| `-e, --regex` | Record by regex | `ros2 bag record -e "/robot.*/.*"` |
| `--max-bag-size` | Split into multiple files | `--max-bag-size 1000000000` (1GB) |
| `--max-bag-duration` | Split by time | `--max-bag-duration 60` (60s) |
| `--compression-mode` | `file` or `message` | `--compression-mode file` |
| `--compression-format` | `zstd`, `lz4` | `--compression-format zstd` |

**Selective Recording:**

```bash
# Exclude topics
ros2 bag record -a -x "/camera/.*"  # All except camera topics

# Include only specific patterns
ros2 bag record -e "/robot1/.*"     # Only robot1 topics

# Record with QoS override
ros2 bag record --qos-profile-overrides-path qos.yaml /topic
```

**Example - Robot Data Collection:**

```bash
# Record sensor data for 5 minutes with compression
ros2 bag record \
  -o robot_run_001 \
  --duration 300 \
  --compression-mode file \
  --compression-format zstd \
  /camera/image_raw \
  /laser/scan \
  /imu/data \
  /odom \
  /tf \
  /tf_static
```

---

### 3. Playing Back Data

**Basic Playback:**

```bash
# Play bag file
ros2 bag play my_dataset

# Play at half speed
ros2 bag play --rate 0.5 my_dataset

# Play at 2x speed
ros2 bag play --rate 2.0 my_dataset

# Play in loop
ros2 bag play --loop my_dataset

# Start from specific time
ros2 bag play --start-offset 10.0 my_dataset  # Start at 10s

# Play specific duration
ros2 bag play --duration 30.0 my_dataset  # Play 30s
```

**Playback Options:**

| Option | Purpose | Example |
|--------|---------|---------|
| `--rate` | Playback speed multiplier | `--rate 2.0` (2x speed) |
| `--loop` | Repeat playback | `--loop` |
| `--start-offset` | Start time (seconds) | `--start-offset 10.0` |
| `--duration` | Play duration | `--duration 60.0` |
| `--clock` | Publish /clock | `--clock` (for use_sim_time) |
| `--remap` | Remap topics | `--remap /old:=/new` |
| `--topics` | Play specific topics | `--topics /camera /lidar` |

**Using Sim Time:**

When playing back bag files, use simulated time for time-dependent nodes:

```bash
# Terminal 1: Play with clock
ros2 bag play --clock my_dataset

# Terminal 2: Run node with sim time
ros2 run my_package my_node --ros-args -p use_sim_time:=true
```

**Remapping During Playback:**

```bash
# Remap topic names during playback
ros2 bag play --remap /camera/image:=/camera/image_raw my_dataset

# Play only specific topics
ros2 bag play --topics /camera/image /laser/scan my_dataset
```

---

### 4. Bag File Information

**Get Bag Info:**

```bash
ros2 bag info my_dataset

# Output:
# Files:             my_dataset_0.db3
# Bag size:          1.2 GB
# Storage id:        sqlite3
# Duration:          60.5s
# Start:             Jan  1 2024 12:00:00.0 (1704110400.0)
# End:               Jan  1 2024 12:01:00.5 (1704110460.5)
# Messages:          15234
# Topic information: Topic: /camera/image | Type: sensor_msgs/msg/Image | Count: 1800 | Serialization Format: cdr
#                    Topic: /laser/scan | Type: sensor_msgs/msg/LaserScan | Count: 600 | Serialization Format: cdr
#                    Topic: /odom | Type: nav_msgs/msg/Odometry | Count: 3000 | Serialization Format: cdr
```

**List Topics in Bag:**

```bash
ros2 bag info my_dataset | grep "Topic:"
```

---

### 5. Storage Formats

**SQLite3 (Default):**

```bash
ros2 bag record -s sqlite3 /topic
```

- **Pros:** Simple, widely supported
- **Cons:** Slower for large datasets
- **Use:** Development, small datasets

**MCAP (Modern):**

```bash
# Install MCAP plugin
sudo apt install ros-humble-rosbag2-storage-mcap

# Record with MCAP
ros2 bag record -s mcap /topic
```

- **Pros:** Faster, better for large data
- **Cons:** Requires plugin
- **Use:** Production, large datasets

**Comparison:**

| Format | Read Speed | Write Speed | File Size | Tooling |
|--------|------------|-------------|-----------|---------|
| **SQLite3** | Good | Good | Larger | Excellent |
| **MCAP** | Excellent | Excellent | Smaller | Good |

---

### 6. Compression

**File-Level Compression:**

```bash
# Compress entire bag file
ros2 bag record --compression-mode file --compression-format zstd /topic

# Result: Single compressed file (decompress on read)
```

**Message-Level Compression:**

```bash
# Compress individual messages
ros2 bag record --compression-mode message --compression-format zstd /topic

# Result: Each message compressed separately (random access)
```

**Compression Formats:**

| Format | Ratio | Speed | Use Case |
|--------|-------|-------|----------|
| **zstd** | High | Fast | Default choice |
| **lz4** | Medium | Very fast | Low latency needed |

**Example - High Compression:**

```bash
ros2 bag record \
  --compression-mode file \
  --compression-format zstd \
  -o compressed_dataset \
  /camera/image
```

**Compression Results:**

```
Uncompressed: 10 GB
zstd file:    2 GB  (5x reduction)
lz4 file:     4 GB  (2.5x reduction)
```

---

### 7. Programmatic Recording (C++)

**Recording from Code:**

```cpp
#include "rclcpp/rclcpp.hpp"
#include "rosbag2_cpp/writer.hpp"
#include "rosbag2_cpp/writers/sequential_writer.hpp"
#include "rosbag2_storage/storage_options.hpp"

class BagRecorder : public rclcpp::Node {
public:
    BagRecorder() : Node("bag_recorder") {
        // Configure storage
        rosbag2_storage::StorageOptions storage_options;
        storage_options.uri = "my_bag";
        storage_options.storage_id = "sqlite3";
        storage_options.max_bagfile_size = 1024 * 1024 * 1024;  // 1GB

        // Configure recording
        rosbag2_cpp::ConverterOptions converter_options;
        converter_options.input_serialization_format = "cdr";
        converter_options.output_serialization_format = "cdr";

        // Create writer
        writer_ = std::make_unique<rosbag2_cpp::Writer>();
        writer_->open(storage_options, converter_options);

        // Create topic metadata
        rosbag2_storage::TopicMetadata topic_metadata;
        topic_metadata.name = "/camera/image";
        topic_metadata.type = "sensor_msgs/msg/Image";
        topic_metadata.serialization_format = "cdr";
        topic_metadata.offered_qos_profiles = "";

        writer_->create_topic(topic_metadata);

        // Subscribe to topic
        sub_ = create_subscription<sensor_msgs::msg::Image>(
            "/camera/image", 10,
            std::bind(&BagRecorder::image_callback, this, std::placeholders::_1)
        );

        RCLCPP_INFO(get_logger(), "Recording started");
    }

    ~BagRecorder() {
        writer_->close();
        RCLCPP_INFO(get_logger(), "Recording stopped");
    }

private:
    void image_callback(const sensor_msgs::msg::Image::SharedPtr msg) {
        // Serialize message
        rclcpp::SerializedMessage serialized_msg;
        rclcpp::Serialization<sensor_msgs::msg::Image> serialization;
        serialization.serialize_message(msg.get(), &serialized_msg);

        // Write to bag
        auto bag_message = std::make_shared<rosbag2_storage::SerializedBagMessage>();
        bag_message->topic_name = "/camera/image";
        bag_message->time_stamp = now().nanoseconds();
        bag_message->serialized_data = std::make_shared<rcutils_uint8_array_t>();
        *bag_message->serialized_data = serialized_msg.get_rcl_serialized_message();

        writer_->write(bag_message);
    }

    std::unique_ptr<rosbag2_cpp::Writer> writer_;
    rclcpp::Subscription<sensor_msgs::msg::Image>::SharedPtr sub_;
};
```

---

### 8. Programmatic Playback (C++)

**Reading from Bag:**

```cpp
#include "rosbag2_cpp/reader.hpp"
#include "rosbag2_cpp/readers/sequential_reader.hpp"

class BagPlayer : public rclcpp::Node {
public:
    BagPlayer() : Node("bag_player") {
        // Configure storage
        rosbag2_storage::StorageOptions storage_options;
        storage_options.uri = "my_bag";
        storage_options.storage_id = "sqlite3";

        // Create reader
        reader_ = std::make_unique<rosbag2_cpp::Reader>();
        reader_->open(storage_options);

        // Create publisher for playback
        pub_ = create_publisher<sensor_msgs::msg::Image>("/camera/image", 10);

        // Start playback timer
        timer_ = create_wall_timer(
            std::chrono::milliseconds(33),  // ~30 Hz
            std::bind(&BagPlayer::play_next_message, this)
        );

        RCLCPP_INFO(get_logger(), "Playback started");
    }

private:
    void play_next_message() {
        if (!reader_->has_next()) {
            RCLCPP_INFO(get_logger(), "Playback complete");
            rclcpp::shutdown();
            return;
        }

        // Read next message
        auto bag_message = reader_->read_next();

        // Deserialize
        rclcpp::SerializedMessage serialized_msg(*bag_message->serialized_data);
        rclcpp::Serialization<sensor_msgs::msg::Image> serialization;

        auto msg = std::make_shared<sensor_msgs::msg::Image>();
        serialization.deserialize_message(&serialized_msg, msg.get());

        // Publish
        pub_->publish(*msg);
    }

    std::unique_ptr<rosbag2_cpp::Reader> reader_;
    rclcpp::Publisher<sensor_msgs::msg::Image>::SharedPtr pub_;
    rclcpp::TimerBase::SharedPtr timer_;
};
```

---

## EDGE_CASES

### Edge Case 1: Bag File Exceeds Disk Space

**Scenario:**
Recording fills up disk, bag file corrupted.

**Recording:**
```bash
ros2 bag record -a  # Records everything indefinitely

# Disk fills up mid-recording
# Error: No space left on device
# Bag file may be corrupted
```

**Why:**
- High-bandwidth topics (cameras, lidar)
- Long recording duration
- Forgot to stop recording

**Prevention:**

**1. Set size limit:**
```bash
ros2 bag record \
  --max-bag-size 10000000000 \  # 10GB per file
  /camera/image
```

**2. Set duration limit:**
```bash
ros2 bag record --duration 300 /topic  # Stop after 5 minutes
```

**3. Monitor disk space:**
```bash
# Script to monitor and stop recording
while true; do
    DISK_FREE=$(df / | tail -1 | awk '{print $4}')
    if [ $DISK_FREE -lt 1000000 ]; then  # Less than 1GB free
        echo "Low disk space, stopping recording"
        pkill -SIGINT "ros2 bag"
        break
    fi
    sleep 10
done
```

**4. Use compression:**
```bash
ros2 bag record \
  --compression-mode file \
  --compression-format zstd \
  /camera/image  # 3-5x smaller
```

**Recovery:**

```bash
# Check bag integrity
ros2 bag info corrupted_bag

# If corrupted, try to repair (not always possible)
# Often need to discard last file in split bag
```

**Interview Insight:**
Always set size/duration limits when recording. Monitor disk space. Use compression for large datasets.

---

### Edge Case 2: Clock Mismatch During Playback

**Scenario:**
Node uses wall time while bag plays sim time, timestamps don't match.

**Playback:**
```bash
# Playing bag with --clock
ros2 bag play --clock my_dataset
```

**Node (WRONG):**
```cpp
// Node uses wall time
rclcpp::Node::SharedPtr node = std::make_shared<rclcpp::Node>("my_node");

auto now = node->now();  // Uses wall time!
// Doesn't match sim time from bag playback
```

**Problem:**
- Bag publishes `/clock` topic (sim time)
- Node uses wall time (system clock)
- Time mismatch breaks time-dependent operations (TF lookups, timeouts)

**Solution:**

```cpp
// Enable use_sim_time parameter
auto node = std::make_shared<rclcpp::Node>(
    "my_node",
    rclcpp::NodeOptions().automatically_declare_parameters_from_overrides(true)
);

// Set parameter
node->set_parameter(rclcpp::Parameter("use_sim_time", true));

auto now = node->now();  // Now uses /clock from bag
```

**Or via command line:**
```bash
ros2 run my_package my_node --ros-args -p use_sim_time:=true
```

**Or launch file:**
```python
Node(
    package='my_package',
    executable='my_node',
    parameters=[{'use_sim_time': True}]
)
```

**Verification:**
```bash
# Check if node uses sim time
ros2 param get /my_node use_sim_time
# Boolean value is: true
```

**Interview Insight:**
Always set `use_sim_time:=true` when playing back bags with `--clock`. Prevents timestamp mismatches.

---

### Edge Case 3: Missing Message Type Definitions

**Scenario:**
Bag recorded with custom message type, playback fails on different system.

**Recording (System A):**
```bash
# System A has custom message package installed
ros2 bag record /robot/custom_state
# Records messages of type: my_msgs/msg/RobotState
```

**Playback (System B):**
```bash
# System B doesn't have my_msgs package
ros2 bag play robot_bag

# Error: Could not find message type 'my_msgs/msg/RobotState'
# Playback fails
```

**Why:**
- Bag stores serialized data but requires message definition for deserialization
- Missing message package on playback system

**Solutions:**

**1. Install message package:**
```bash
# On System B
sudo apt install ros-humble-my-msgs
# Or build from source
```

**2. Export bag with type definitions (future feature):**
```bash
# Not yet available in rosbag2, but planned
ros2 bag export --with-types robot_bag
```

**3. Convert to common message types:**
```bash
# Record using standard messages instead of custom
```

**4. Share message package with bag:**
```
dataset/
  ├── robot_bag/  (bag files)
  └── my_msgs/    (message package source)
  └── README.md   (build instructions)
```

**Workaround - View without deserializing:**
```bash
# Can see topics but not message content
ros2 bag info robot_bag

# Can't echo messages without type definitions
ros2 bag play robot_bag  # Publishes, but subscribers need types
```

**Interview Insight:**
Bag files depend on message type definitions. Share message packages with recorded data or use standard message types.

---

### Edge Case 4: Large Images Fill Bag Too Quickly

**Scenario:**
Recording high-res camera at full rate creates huge bag files.

**Recording:**
```bash
ros2 bag record /camera/image_raw  # 1920x1080 @ 30 FPS

# File size: ~200 MB/sec
# 1 minute = 12 GB!
```

**Solutions:**

**1. Record compressed images:**
```bash
# Record compressed stream instead
ros2 bag record /camera/image_raw/compressed  # ~10x smaller
```

**2. Throttle during recording:**
```bash
# Use ros2 topic hz to throttle
ros2 run topic_tools throttle messages /camera/image_raw 10.0 \
  /camera/image_throttled

# Record throttled topic
ros2 bag record /camera/image_throttled
```

**3. Use compression:**
```bash
ros2 bag record \
  --compression-mode file \
  --compression-format zstd \
  /camera/image_raw  # 3-5x smaller
```

**4. Record selective frames:**
```cpp
// Custom recorder that skips frames
class SelectiveRecorder : public rclcpp::Node {
    void image_callback(const Image::SharedPtr msg) {
        frame_count_++;
        if (frame_count_ % 10 == 0) {  // Record every 10th frame
            record_to_bag(msg);
        }
    }
};
```

**5. Lower resolution during recording:**
```bash
# Configure camera for lower resolution
ros2 param set /camera_node width 640
ros2 param set /camera_node height 480
```

**Comparison:**

| Configuration | Size/min | Duration for 100GB |
|---------------|----------|-------------------|
| 1920x1080 @ 30 FPS | 12 GB | 8 minutes |
| 1920x1080 @ 10 FPS | 4 GB | 25 minutes |
| 640x480 @ 30 FPS | 1.3 GB | 75 minutes |
| Compressed @ 30 FPS | 2 GB | 50 minutes |
| Zstd compression | 2.4 GB | 42 minutes |

**Interview Insight:**
High-bandwidth topics need throttling, compression, or selective recording. Consider data rate before recording.

---

## CODE_EXAMPLES

### Example 1: Conditional Recording Node

**Record only when robot is moving:**

```cpp
#include "rclcpp/rclcpp.hpp"
#include "rosbag2_cpp/writer.hpp"
#include "geometry_msgs/msg/twist.hpp"
#include "sensor_msgs/msg/laser_scan.hpp"

class ConditionalRecorder : public rclcpp::Node {
public:
    ConditionalRecorder() : Node("conditional_recorder") {
        // Setup bag writer
        rosbag2_storage::StorageOptions storage_options;
        storage_options.uri = "conditional_bag";
        storage_options.storage_id = "sqlite3";

        rosbag2_cpp::ConverterOptions converter_options;

        writer_ = std::make_unique<rosbag2_cpp::Writer>();
        writer_->open(storage_options, converter_options);

        // Create topics
        rosbag2_storage::TopicMetadata scan_metadata;
        scan_metadata.name = "/scan";
        scan_metadata.type = "sensor_msgs/msg/LaserScan";
        scan_metadata.serialization_format = "cdr";
        writer_->create_topic(scan_metadata);

        // Subscribe to velocity commands (to detect motion)
        cmd_sub_ = create_subscription<geometry_msgs::msg::Twist>(
            "/cmd_vel", 10,
            std::bind(&ConditionalRecorder::cmd_callback, this, std::placeholders::_1)
        );

        // Subscribe to laser scan
        scan_sub_ = create_subscription<sensor_msgs::msg::LaserScan>(
            "/scan", 10,
            std::bind(&ConditionalRecorder::scan_callback, this, std::placeholders::_1)
        );

        RCLCPP_INFO(get_logger(), "Conditional recorder started");
    }

    ~ConditionalRecorder() {
        writer_->close();
        RCLCPP_INFO(get_logger(), "Recorded %ld messages", message_count_);
    }

private:
    void cmd_callback(const geometry_msgs::msg::Twist::SharedPtr msg) {
        // Check if robot is moving
        is_moving_ = (std::abs(msg->linear.x) > 0.01 ||
                      std::abs(msg->angular.z) > 0.01);

        if (is_moving_) {
            last_motion_time_ = now();
        }
    }

    void scan_callback(const sensor_msgs::msg::LaserScan::SharedPtr msg) {
        // Only record if robot moved recently (within last 2 seconds)
        if ((now() - last_motion_time_).seconds() < 2.0) {
            record_message("/scan", msg);
        }
    }

    template<typename T>
    void record_message(const std::string &topic, const std::shared_ptr<T> msg) {
        rclcpp::SerializedMessage serialized_msg;
        rclcpp::Serialization<T> serialization;
        serialization.serialize_message(msg.get(), &serialized_msg);

        auto bag_message = std::make_shared<rosbag2_storage::SerializedBagMessage>();
        bag_message->topic_name = topic;
        bag_message->time_stamp = now().nanoseconds();
        bag_message->serialized_data = std::make_shared<rcutils_uint8_array_t>();
        *bag_message->serialized_data = serialized_msg.get_rcl_serialized_message();

        writer_->write(bag_message);
        message_count_++;

        if (message_count_ % 100 == 0) {
            RCLCPP_INFO(get_logger(), "Recorded %ld messages", message_count_);
        }
    }

    std::unique_ptr<rosbag2_cpp::Writer> writer_;
    rclcpp::Subscription<geometry_msgs::msg::Twist>::SharedPtr cmd_sub_;
    rclcpp::Subscription<sensor_msgs::msg::LaserScan>::SharedPtr scan_sub_;

    bool is_moving_ = false;
    rclcpp::Time last_motion_time_;
    size_t message_count_ = 0;
};

int main(int argc, char **argv) {
    rclcpp::init(argc, argv);
    rclcpp::spin(std::make_shared<ConditionalRecorder>());
    rclcpp::shutdown();
    return 0;
}
```

---

## INTERVIEW_QA

### Q1: What is rosbag2 and what are its main uses?

**Difficulty:** ⭐⭐ (Easy)

**Answer:**

**rosbag2** = ROS2's tool for **recording and replaying topic data**.

**Main Uses:**

1. **Development/Testing:**
   - Test algorithms without hardware
   - Reproducible testing scenarios

2. **Debugging:**
   - Record bug occurrence
   - Replay to reproduce and fix

3. **Data Collection:**
   - Gather sensor data for analysis
   - Training data for machine learning

4. **Demos:**
   - Show robot behavior without robot
   - Presentations and documentation

5. **Regression Testing:**
   - Verify behavior on known datasets
   - CI/CD integration

**Basic Commands:**

```bash
# Record
ros2 bag record -a                    # All topics
ros2 bag record /topic1 /topic2       # Specific topics

# Playback
ros2 bag play my_bag                  # Normal speed
ros2 bag play --rate 0.5 my_bag       # Half speed
ros2 bag play --loop my_bag           # Loop forever

# Info
ros2 bag info my_bag                  # Bag statistics
```

**Interview Insight:**
rosbag2 is essential for development, testing, and debugging. Enables offline algorithm development.

---

### Q2: How do you handle large image topics when recording?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

**Problem:**
High-res images at high frame rate create huge bag files.

```
1920x1080 @ 30 FPS = ~200 MB/sec
1 minute = 12 GB
```

**Solutions:**

**1. Record compressed stream:**
```bash
ros2 bag record /camera/image_raw/compressed  # 10x smaller
```

**2. Enable compression:**
```bash
ros2 bag record \
  --compression-mode file \
  --compression-format zstd \
  /camera/image_raw  # 3-5x reduction
```

**3. Throttle frame rate:**
```bash
# Throttle to 10 Hz
ros2 run topic_tools throttle messages /camera/image_raw 10.0

# Record throttled topic
ros2 bag record /camera/image_raw_throttled
```

**4. Lower resolution:**
```bash
# Configure camera for lower resolution
ros2 param set /camera width 640
ros2 param set /camera height 480
```

**5. Selective recording:**
```cpp
// Record only when robot moving
if (robot_is_moving) {
    record_message(image);
}
```

**Comparison:**

| Method | Size Reduction | Quality |
|--------|---------------|---------|
| Compressed stream | 10x | Good |
| File compression | 3-5x | Lossless |
| Throttle to 10 Hz | 3x | Acceptable |
| Lower resolution | 4x | Depends |

**Interview Insight:**
Always consider data rate before recording. Use compression, throttling, or compressed streams for cameras.

---

### Q3: Why is `use_sim_time` important when playing back bags?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

**Problem:**

When playing bags, time-sensitive operations break if node uses wall time instead of bag time.

**Without use_sim_time:**
```bash
# Play bag
ros2 bag play my_bag

# Node uses wall time
ros2 run my_package my_node

# Problem:
# - Bag has timestamps from past (e.g., 2 hours ago)
# - Node uses current wall time
# - TF lookups fail (extrapolation errors)
# - Timeouts don't work correctly
```

**With use_sim_time:**
```bash
# Play bag with clock
ros2 bag play --clock my_bag

# Node uses sim time
ros2 run my_package my_node --ros-args -p use_sim_time:=true

# Now:
# - Bag publishes /clock topic
# - Node uses /clock for time
# - Timestamps match
# - TF works correctly
```

**What happens:**

| Component | Without use_sim_time | With use_sim_time |
|-----------|---------------------|-------------------|
| Bag | Publishes old timestamps | Publishes old timestamps + /clock |
| Node | Uses wall time (now) | Uses /clock (bag time) |
| TF lookup | Fails (time mismatch) | Works (time match) |
| Timeouts | Wrong (past is "timeout") | Correct (relative to bag time) |

**Implementation:**

```cpp
// Enable sim time
node->set_parameter(rclcpp::Parameter("use_sim_time", true));

// Now node->now() returns time from /clock topic
auto current_time = node->now();
```

**Interview Insight:**
Always use `use_sim_time:=true` with `ros2 bag play --clock`. Prevents timestamp mismatches in time-dependent operations.

---

### Q4: What's the difference between file-level and message-level compression?

**Difficulty:** ⭐⭐⭐⭐ (Hard)

**Answer:**

**File-Level Compression:**

```bash
ros2 bag record --compression-mode file --compression-format zstd /topic
```

- Compresses **entire bag file** as a whole
- Higher compression ratio
- Must decompress entire file to read
- **No random access**

**Message-Level Compression:**

```bash
ros2 bag record --compression-mode message --compression-format zstd /topic
```

- Compresses **each message individually**
- Lower compression ratio (less context)
- Can decompress single message
- **Supports random access**

**Comparison:**

| Aspect | File-Level | Message-Level |
|--------|------------|---------------|
| **Compression ratio** | Higher | Lower |
| **Random access** | No | Yes |
| **Read latency** | Higher (decompress all) | Lower (decompress one) |
| **Use case** | Archive, full playback | Selective playback, analysis |

**Example:**

```
Original bag: 10 GB

File-level (zstd):
- Compressed: 2 GB (5x)
- Read message 1000: Must decompress from start

Message-level (zstd):
- Compressed: 3 GB (3.3x)
- Read message 1000: Decompress only message 1000
```

**When to Use:**

| Scenario | Recommendation |
|----------|---------------|
| Archive long-term | File-level (best compression) |
| Full sequential playback | File-level |
| Random access / analysis | Message-level |
| Selective topic replay | Message-level |

**Interview Insight:**
File-level gives better compression, message-level gives random access. Choose based on use case.

---

### Q5: How do you verify bag file integrity?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

**Methods:**

**1. Check bag info:**
```bash
ros2 bag info my_bag

# If corrupted:
# Error: Could not read metadata.yaml
# Or: Database file is corrupted
```

**2. Verify message counts:**
```bash
# Record expected count
ros2 topic hz /camera/image  # 30 Hz
# Recording 60s → expect ~1800 messages

# Verify in bag
ros2 bag info my_bag | grep image
# Topic: /camera/image | Count: 1800  ✓
```

**3. Check for gaps:**
```bash
# Play and monitor
ros2 bag play my_bag
ros2 topic hz /camera/image  # Should show consistent rate
```

**4. Test playback:**
```bash
# Full playback test
ros2 bag play --start-offset 0 --duration 5 my_bag

# If plays without errors → likely OK
```

**5. Check file size:**
```bash
du -sh my_bag/
# Should be reasonable for recording duration

# If 0 bytes or very small → corrupted
```

**Common Corruption Signs:**

- Error opening database
- Missing metadata.yaml
- Message count is 0
- Cannot play back
- File size is 0 or unreasonably small

**Prevention:**

```bash
# Graceful stop (Ctrl+C, not kill -9)
ros2 bag record /topic
^C  # Clean shutdown

# Set size limits (auto-split if disk fills)
ros2 bag record --max-bag-size 1000000000 /topic

# Monitor disk space during recording
```

**Interview Insight:**
Verify bags with `ros2 bag info` and test playback. Prevent corruption with graceful shutdown and disk space monitoring.

---

## PRACTICE_TASKS

### Task 1: Create Dataset Collection System

Create system that:
- Records sensor data (camera, lidar, IMU)
- Automatically splits bags every 5 minutes
- Compresses with zstd
- Monitors disk space, stops at 90% full

---

### Task 2: Bag Playback Pipeline

Create pipeline that:
- Plays bag file with simulated time
- Processes images
- Publishes results
- Verify time synchronization works correctly

---

### Task 3: Selective Recording

Implement recorder that:
- Records only when specific event occurs (e.g., object detected)
- Includes 2 seconds before and after event
- Saves to separate bag files per event

---

## QUICK_REFERENCE

### Recording

```bash
ros2 bag record -a                              # All topics
ros2 bag record /topic1 /topic2                 # Specific topics
ros2 bag record -o name /topic                  # Custom name
ros2 bag record --duration 60 /topic            # Time limit
ros2 bag record --max-bag-size 1000000000 /topic  # Size limit
ros2 bag record --compression-mode file --compression-format zstd /topic
```

### Playback

```bash
ros2 bag play my_bag                            # Normal
ros2 bag play --rate 0.5 my_bag                 # Half speed
ros2 bag play --loop my_bag                     # Loop
ros2 bag play --clock my_bag                    # With sim time
ros2 bag play --start-offset 10 my_bag          # Start at 10s
ros2 bag play --remap /old:=/new my_bag         # Remap topic
```

### Info

```bash
ros2 bag info my_bag                            # Bag details
```

### Storage Formats

```bash
ros2 bag record -s sqlite3 /topic               # SQLite (default)
ros2 bag record -s mcap /topic                  # MCAP (faster)
```

### Compression

```
--compression-mode file     # Compress whole file
--compression-mode message  # Compress each message
--compression-format zstd   # Best compression
--compression-format lz4    # Fastest
```

---

**END OF TOPIC 3.4**
