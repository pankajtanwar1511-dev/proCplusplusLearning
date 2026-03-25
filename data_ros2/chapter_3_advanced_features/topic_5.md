# Chapter 3: Advanced ROS2 Features
## Topic 5: Debugging & Introspection Tools

---

## Theory

### 1. ROS2 CLI Introspection Tools

ROS2 provides a comprehensive command-line interface for runtime introspection and debugging. These tools allow you to inspect the state of your ROS2 system without modifying code.

#### ros2 node

Inspect running nodes:

```bash
# List all nodes
ros2 node list

# Show node info (publishers, subscribers, services, actions)
ros2 node info /my_node

# Show detailed node info including QoS settings
ros2 node info /camera_node --verbose
```

**Output example:**
```
/camera_node
  Subscribers:
    /parameter_events: rcl_interfaces/msg/ParameterEvent
  Publishers:
    /camera/image_raw: sensor_msgs/msg/Image [QoS: Reliable, Keep last 10]
    /parameter_events: rcl_interfaces/msg/ParameterEvent
  Service Servers:
    /camera_node/describe_parameters: rcl_interfaces/srv/DescribeParameters
    /camera_node/get_parameter_types: rcl_interfaces/srv/GetParameterTypes
  Service Clients:
  Action Servers:
  Action Clients:
```

#### ros2 topic

Monitor topic activity:

```bash
# List all topics
ros2 topic list

# Show topic type
ros2 topic type /camera/image_raw

# Echo topic messages (print to console)
ros2 topic echo /scan

# Show message rate (Hz)
ros2 topic hz /scan

# Show bandwidth usage
ros2 topic bw /camera/image_raw

# Show detailed topic info (publishers, subscribers, QoS)
ros2 topic info /scan --verbose

# Find topics by type
ros2 topic find sensor_msgs/msg/LaserScan

# Publish message from command line
ros2 topic pub /cmd_vel geometry_msgs/msg/Twist "{linear: {x: 0.5}, angular: {z: 0.1}}"
```

**Performance monitoring:**
```bash
$ ros2 topic hz /scan
average rate: 10.002
  min: 0.099s max: 0.101s std dev: 0.00045s window: 10

$ ros2 topic bw /camera/image_raw
Subscribed to [/camera/image_raw]
average: 30.02MB/s
  mean: 1.00MB min: 0.99MB max: 1.01MB window: 30
```

#### ros2 service

Inspect and call services:

```bash
# List all services
ros2 service list

# Show service type
ros2 service type /add_two_ints

# Find services by type
ros2 service find std_srvs/srv/SetBool

# Call a service
ros2 service call /reset std_srvs/srv/Empty

# Call with request data
ros2 service call /add_two_ints example_interfaces/srv/AddTwoInts "{a: 5, b: 3}"
```

#### ros2 param

Runtime parameter manipulation:

```bash
# List parameters for a node
ros2 param list /my_node

# Get parameter value
ros2 param get /my_node use_sim_time

# Set parameter value
ros2 param set /my_node max_velocity 2.0

# Dump all parameters to file
ros2 param dump /my_node --output-dir ./config

# Load parameters from file
ros2 param load /my_node ./params.yaml
```

#### ros2 action

Monitor action servers and goals:

```bash
# List all action servers
ros2 action list

# Show action type
ros2 action type /navigate_to_pose

# Show action server info
ros2 action info /navigate_to_pose

# Send action goal
ros2 action send_goal /fibonacci example_interfaces/action/Fibonacci "{order: 5}" --feedback
```

#### ros2 interface

Inspect message/service/action definitions:

```bash
# Show message definition
ros2 interface show geometry_msgs/msg/Twist

# Show service definition
ros2 interface show std_srvs/srv/SetBool

# List all interfaces of a type
ros2 interface list msgs
ros2 interface list srvs
ros2 interface list actions

# Show package interfaces
ros2 interface package sensor_msgs
```

---

### 2. System Diagnostics: ros2 doctor

`ros2 doctor` performs automated health checks on your ROS2 installation and runtime environment.

```bash
# Run all diagnostic checks
ros2 doctor

# Show detailed report
ros2 doctor --report

# Include warnings (not just errors)
ros2 doctor --include-warnings
```

**Checks performed:**
1. **Network Configuration**
   - Multicast support (critical for DDS discovery)
   - Network interfaces
   - Firewall rules

2. **Platform Configuration**
   - ROS2 installation
   - RMW implementation
   - Environment variables (ROS_DOMAIN_ID, etc.)

3. **Runtime System**
   - Active nodes
   - Topic connectivity
   - QoS compatibility issues

**Example output:**
```
Checking network...
UserWarning: No multicast support detected on interface eth0
  Your system may not support ROS2 discovery over this interface

Checking ROS2 setup...
Found RMW implementation: rmw_fastrtps_cpp
Found 3 packages in workspace

Checking active system...
Found 5 nodes:
  /teleop_twist_keyboard [OK]
  /robot_state_publisher [OK]
  /camera_node [WARNING: Publishing at 5Hz, expected 30Hz]

QoS Compatibility Issues:
  Publisher /camera_node on /image_raw: BEST_EFFORT
  Subscriber /image_processor on /image_raw: RELIABLE
  → Incompatible QoS policies detected
```

---

### 3. Logging System

ROS2 uses `rcutils` logging with severity levels: DEBUG, INFO, WARN, ERROR, FATAL.

#### Code-Side Logging

```cpp
#include <rclcpp/rclcpp.hpp>

class MyNode : public rclcpp::Node {
public:
    MyNode() : Node("my_node") {
        // Different logging levels
        RCLCPP_DEBUG(this->get_logger(), "Detailed debug info: %d", counter_);
        RCLCPP_INFO(this->get_logger(), "Normal operation");
        RCLCPP_WARN(this->get_logger(), "Potential issue detected");
        RCLCPP_ERROR(this->get_logger(), "Error occurred: %s", error_msg.c_str());
        RCLCPP_FATAL(this->get_logger(), "Critical failure");

        // Throttled logging (max once per second)
        RCLCPP_INFO_THROTTLE(this->get_logger(), *this->get_clock(), 1000,
                             "High-frequency event: %d", count);

        // Skip first N occurrences
        RCLCPP_INFO_SKIPFIRST(this->get_logger(), "Skips first call");

        // Log once only
        RCLCPP_INFO_ONCE(this->get_logger(), "This appears only once");

        // Conditional logging
        if (RCLCPP_DEBUG_ENABLED(this->get_logger())) {
            // Expensive debug computation only when debug enabled
            std::string debug_data = compute_expensive_debug_info();
            RCLCPP_DEBUG(this->get_logger(), "Debug: %s", debug_data.c_str());
        }
    }
};
```

#### Runtime Log Level Control

```bash
# Set log level for specific node
ros2 run demo_nodes_cpp talker --ros-args --log-level debug

# Set log level via parameter
ros2 param set /my_node log_level DEBUG

# Set via environment variable
export RCUTILS_CONSOLE_MIN_SEVERITY=DEBUG
ros2 run my_package my_node

# Custom log format
export RCUTILS_CONSOLE_OUTPUT_FORMAT="[{severity}] [{name}] {message}"
```

**Log format variables:**
- `{severity}`: Log level (DEBUG/INFO/WARN/ERROR/FATAL)
- `{name}`: Logger name (usually node name)
- `{message}`: Log message
- `{function_name}`: Function that logged
- `{file_name}`: Source file
- `{line_number}`: Line number
- `{time}`: Timestamp
- `{time_as_nanoseconds}`: Nanosecond timestamp

**Example custom format:**
```bash
export RCUTILS_CONSOLE_OUTPUT_FORMAT="[{time}] [{severity}] [{name}]: {message} ({function_name}:{line_number})"
```

Output:
```
[1676543210.123456] [INFO] [my_node]: Starting initialization (init_node:42)
[1676543210.456789] [WARN] [my_node]: Sensor timeout detected (check_sensors:156)
```

#### Log to File

```bash
# Redirect stdout/stderr to file
ros2 run my_package my_node 2>&1 | tee node_output.log

# Or use systemd service (automatic journaling)
sudo journalctl -u my_ros_service -f
```

---

### 4. rqt Tools

`rqt` is a Qt-based GUI framework providing graphical debugging tools.

#### rqt_graph

Visualize the ROS2 computation graph (nodes and topics):

```bash
ros2 run rqt_graph rqt_graph
```

**Features:**
- See all nodes and topic connections
- Identify orphaned publishers/subscribers
- Visualize namespace structure
- Filter by node type, topic type
- Export graph as image

**Use cases:**
- Verify system architecture
- Debug communication issues
- Detect unexpected connections

#### rqt_console

Live log message viewer with filtering:

```bash
ros2 run rqt_console rqt_console
```

**Features:**
- Filter by severity, node name, message content
- Pause/resume log stream
- Highlight specific patterns
- Export logs to file
- Search through historical logs

**Use cases:**
- Monitor errors across multiple nodes
- Filter high-frequency debug messages
- Track down intermittent warnings

#### rqt_plot

Real-time plotting of numeric message fields:

```bash
ros2 run rqt_plot rqt_plot
```

**Examples:**
```bash
# Plot single field
ros2 run rqt_plot rqt_plot /odom/pose/pose/position/x

# Plot multiple fields
ros2 run rqt_plot rqt_plot /odom/pose/pose/position/x /odom/pose/pose/position/y

# Plot twist values
ros2 run rqt_plot rqt_plot /cmd_vel/linear/x /cmd_vel/angular/z
```

**Use cases:**
- Visualize sensor data trends
- Monitor control loop behavior
- Detect oscillations or instability

#### rqt_topic

Browse and monitor topics:

```bash
ros2 run rqt_topic rqt_topic
```

**Features:**
- Tree view of all topics
- Real-time message rate (Hz)
- Bandwidth monitoring
- Inspect message contents
- Publish test messages

#### rqt_service_caller

Call services interactively:

```bash
ros2 run rqt_service_caller rqt_service_caller
```

**Use cases:**
- Test service servers without writing code
- Trigger actions during debugging
- Verify service request/response formats

#### rqt_reconfigure

Dynamic parameter reconfiguration (if node supports it):

```bash
ros2 run rqt_reconfigure rqt_reconfigure
```

**Use cases:**
- Tune parameters in real-time
- Experiment with configurations
- Debug parameter-dependent behavior

---

### 5. Performance Profiling

#### Topic Performance

```bash
# Measure publication rate
ros2 topic hz /scan

# Measure bandwidth
ros2 topic bw /camera/image_raw

# Combined stats
ros2 topic hz /scan & ros2 topic bw /scan
```

**Interpreting results:**

```bash
$ ros2 topic hz /scan
average rate: 9.987
  min: 0.095s max: 0.105s std dev: 0.00234s window: 100
```

- **average rate**: Should match expected rate (e.g., 10 Hz)
- **std dev**: Low is good; high indicates jitter
- **min/max**: Extreme outliers indicate dropped messages or timing issues

```bash
$ ros2 topic bw /camera/image_raw
average: 90.12MB/s
  mean: 3.00MB min: 2.95MB max: 3.05MB window: 30
```

- **average**: Total bandwidth consumption
- **mean**: Average message size
- **min/max**: Size variation (compression artifacts, dynamic scenes)

#### CPU and Memory Profiling

**Using `top` or `htop`:**

```bash
# Find ROS2 processes
ps aux | grep ros

# Monitor specific process
top -p $(pgrep -f my_node)
```

**Using `perf` (Linux):**

```bash
# Record CPU profile for 30 seconds
perf record -F 99 -p $(pgrep -f my_node) sleep 30

# Generate report
perf report
```

**Using Valgrind for memory leaks:**

```bash
# Run node under Valgrind
valgrind --leak-check=full --show-leak-kinds=all \
  ros2 run my_package my_node

# More practical: run for limited time
timeout 60 valgrind --leak-check=full ros2 run my_package my_node
```

**Using heaptrack (more user-friendly):**

```bash
# Install heaptrack
sudo apt install heaptrack heaptrack-gui

# Profile node
heaptrack ros2 run my_package my_node

# Analyze results
heaptrack_gui heaptrack.my_node.12345.gz
```

#### DDS Performance

**ROS2 tracing with `ros2_tracing`:**

```bash
# Install tracing tools
sudo apt install ros-humble-ros2trace ros-humble-tracetools-analysis

# Start tracing session
ros2 trace

# Run your nodes
ros2 run my_package my_node

# Stop tracing (Ctrl+C)

# Analyze trace
ros2 trace analyze ~/.ros/tracing/session-YYYYMMDD-HHMMSS
```

**Fast DDS statistics:**

```bash
# Enable Fast DDS statistics
export FASTRTPS_DEFAULT_PROFILES_FILE=/path/to/fastdds_stats_profile.xml

# Profile example
cat << 'EOF' > fastdds_stats_profile.xml
<?xml version="1.0" encoding="UTF-8" ?>
<profiles xmlns="http://www.eprosima.com/XMLSchemas/fastRTPS_Profiles">
    <participant profile_name="default_profile" is_default_profile="true">
        <rtps>
            <builtin>
                <metatrafficUnicastLocatorList>
                    <locator/>
                </metatrafficUnicastLocatorList>
            </builtin>
        </rtps>
    </participant>
</profiles>
EOF
```

---

### 6. Debugging with GDB

Debugging C++ ROS2 nodes with GDB:

```bash
# Run node under GDB
ros2 run --prefix 'gdb -ex run --args' my_package my_node

# Or attach to running process
gdb -p $(pgrep -f my_node)
```

**Common GDB commands for ROS2:**

```bash
# Set breakpoint at function
(gdb) break MyNode::timer_callback

# Set breakpoint at line
(gdb) break my_node.cpp:42

# Continue execution
(gdb) continue

# Step into function
(gdb) step

# Step over function
(gdb) next

# Print variable
(gdb) print my_variable

# Print shared_ptr contents
(gdb) print *msg

# Backtrace (call stack)
(gdb) backtrace
(gdb) bt

# Show all threads
(gdb) info threads

# Switch to thread
(gdb) thread 3

# Set condition breakpoint
(gdb) break my_node.cpp:42 if counter > 100
```

**Debug with symbols:**

```bash
# Build with debug symbols
colcon build --cmake-args -DCMAKE_BUILD_TYPE=Debug

# Or RelWithDebInfo (optimized but with symbols)
colcon build --cmake-args -DCMAKE_BUILD_TYPE=RelWithDebInfo
```

**Catch exceptions:**

```bash
(gdb) catch throw
(gdb) run
# Will stop when any exception is thrown

# Catch specific exception
(gdb) catch throw std::runtime_error
```

---

### 7. Common Troubleshooting Workflows

#### Problem: Node Not Receiving Messages

**Diagnosis steps:**

1. **Check if topic exists:**
   ```bash
   ros2 topic list | grep /my_topic
   ```

2. **Check if anyone is publishing:**
   ```bash
   ros2 topic info /my_topic
   # Look for "Publisher count: N" where N > 0
   ```

3. **Check message rate:**
   ```bash
   ros2 topic hz /my_topic
   ```

4. **Check QoS compatibility:**
   ```bash
   ros2 topic info /my_topic --verbose
   # Compare publisher and subscriber QoS settings
   ```

5. **Echo messages to verify content:**
   ```bash
   ros2 topic echo /my_topic
   ```

6. **Check node subscribers:**
   ```bash
   ros2 node info /my_subscriber_node
   # Verify /my_topic is listed under "Subscribers"
   ```

**Common fixes:**
- QoS mismatch (RELIABLE vs BEST_EFFORT)
- Wrong topic name (typo, missing namespace)
- Node not spinning (forgot `rclcpp::spin`)
- Firewall blocking multicast

---

#### Problem: Slow Performance

**Diagnosis steps:**

1. **Check CPU usage:**
   ```bash
   top -p $(pgrep -f my_node)
   ```

2. **Check message rates:**
   ```bash
   ros2 topic hz /camera/image_raw
   ros2 topic bw /camera/image_raw
   ```

3. **Profile with perf:**
   ```bash
   perf record -F 99 -p $(pgrep -f my_node) sleep 10
   perf report
   ```

4. **Check for busy-waiting:**
   ```bash
   # Strace to see system calls
   strace -p $(pgrep -f my_node) -c
   ```

5. **Check callback execution time:**
   ```cpp
   void callback(const Message::SharedPtr msg) {
       auto start = std::chrono::steady_clock::now();
       // ... processing ...
       auto duration = std::chrono::steady_clock::now() - start;
       RCLCPP_INFO(get_logger(), "Callback took %ld ms",
           std::chrono::duration_cast<std::chrono::milliseconds>(duration).count());
   }
   ```

**Common fixes:**
- Blocking operations in callbacks (use timers or threads)
- Large message copies (use `const SharedPtr&`)
- Insufficient QoS queue size
- Inefficient algorithms in message processing
- Memory leaks causing paging

---

#### Problem: Discovery Failures

Nodes can't see each other.

**Diagnosis steps:**

1. **Check ROS_DOMAIN_ID:**
   ```bash
   echo $ROS_DOMAIN_ID
   # Should be same on all machines
   ```

2. **Check multicast connectivity:**
   ```bash
   ros2 doctor --report
   # Look for multicast warnings
   ```

3. **Check firewall:**
   ```bash
   # Temporarily disable (for testing only!)
   sudo ufw disable

   # Or allow multicast
   sudo ufw allow from 224.0.0.0/4
   ```

4. **Check network interfaces:**
   ```bash
   ip addr show
   ifconfig
   # Verify both machines on same subnet
   ```

5. **Test with ros2 multicast tools:**
   ```bash
   # On machine 1
   ros2 multicast receive

   # On machine 2
   ros2 multicast send
   ```

6. **Check DDS discovery:**
   ```bash
   export RMW_IMPLEMENTATION=rmw_fastrtps_cpp
   export FASTRTPS_DEFAULT_PROFILES_FILE=/tmp/fastdds_profile.xml

   # Create profile with verbose discovery
   cat << 'EOF' > /tmp/fastdds_profile.xml
   <?xml version="1.0" encoding="UTF-8" ?>
   <profiles xmlns="http://www.eprosima.com/XMLSchemas/fastRTPS_Profiles">
       <participant profile_name="verbose" is_default_profile="true">
           <rtps>
               <builtin>
                   <discovery_config>
                       <leaseDuration>
                           <sec>10</sec>
                       </leaseDuration>
                   </discovery_config>
               </builtin>
           </rtps>
       </participant>
   </profiles>
   EOF
   ```

**Common fixes:**
- Mismatched ROS_DOMAIN_ID
- Firewall blocking UDP ports 7400-7500 (Fast DDS)
- Multicast disabled on network switch
- VPN interfering with multicast
- Different RMW implementations

---

#### Problem: Memory Leaks

Node memory usage grows over time.

**Diagnosis steps:**

1. **Monitor memory over time:**
   ```bash
   while true; do
       ps aux | grep my_node | grep -v grep | awk '{print $6}';
       sleep 10;
   done
   ```

2. **Use Valgrind:**
   ```bash
   valgrind --leak-check=full --show-leak-kinds=all \
       ros2 run my_package my_node
   ```

3. **Use heaptrack:**
   ```bash
   heaptrack ros2 run my_package my_node
   # Let run for several minutes
   # Ctrl+C and analyze
   heaptrack_gui heaptrack.my_node.*.gz
   ```

**Common causes:**
- Forgot to destroy subscribers/publishers
- Creating objects in callbacks without cleanup
- Lambda captures with shared_ptr cycles
- Not clearing containers (vectors, maps)
- DDS resource leaks (QoS history keeping old messages)

**Common fixes:**

```cpp
// BAD: Lambda captures 'this' with shared_ptr
timer_ = create_wall_timer(1s, [this, self=shared_from_this()]() {
    // Creates circular reference!
});

// GOOD: Just capture 'this'
timer_ = create_wall_timer(1s, [this]() {
    // No circular reference
});

// BAD: Never clearing old data
std::vector<Image> image_history_;
void callback(const Image::SharedPtr msg) {
    image_history_.push_back(*msg);  // Grows forever!
}

// GOOD: Limit history size
std::deque<Image> image_history_;
void callback(const Image::SharedPtr msg) {
    image_history_.push_back(*msg);
    if (image_history_.size() > 100) {
        image_history_.pop_front();
    }
}
```

---

#### Problem: Clock/Time Issues

Messages have unexpected timestamps.

**Diagnosis steps:**

1. **Check use_sim_time:**
   ```bash
   ros2 param get /my_node use_sim_time
   ```

2. **Check clock source:**
   ```bash
   ros2 topic echo /clock
   # Should be published by simulator if use_sim_time=true
   ```

3. **Verify node time:**
   ```cpp
   RCLCPP_INFO(get_logger(), "Node time: %f", now().seconds());
   RCLCPP_INFO(get_logger(), "System time: %f",
       std::chrono::system_clock::now().time_since_epoch().count() / 1e9);
   ```

4. **Check TF transform times:**
   ```bash
   ros2 run tf2_ros tf2_echo base_link camera_link
   ```

**Common fixes:**
- Set `use_sim_time: true` in parameters when using simulation
- Ensure simulator publishes `/clock` topic
- Use `node->now()` instead of `std::chrono` for ROS-aware time
- Handle `tf2::ExtrapolationException` for future transforms

---

### 8. ROS2-Specific Debugging Tips

#### Namespace Issues

```bash
# Check actual topic names (including namespaces)
ros2 topic list

# Remap topic name
ros2 run my_package my_node --ros-args -r /cmd_vel:=/robot1/cmd_vel

# Set namespace
ros2 run my_package my_node --ros-args -r __ns:=/robot1
```

#### Parameter Loading Issues

```bash
# Verify parameter file syntax
ros2 param load /my_node params.yaml

# Check which parameters were loaded
ros2 param list /my_node

# Dump current parameters
ros2 param dump /my_node
```

#### Component Composition Issues

```bash
# List loaded components
ros2 component list

# Check component types
ros2 component types

# Manually load component (for testing)
ros2 component load /ComponentManager my_package my_package::MyComponent
```

#### Message Serialization Issues

```bash
# Verify message definition matches
ros2 interface show my_package/msg/MyMessage

# Rebuild interface package
colcon build --packages-select my_package --cmake-clean-cache

# Check if interface is registered
ros2 interface list | grep MyMessage
```

---

## Edge Cases

### Edge Case 1: Silent Node Failure (Node Alive but Not Functioning)

**Scenario:**
A node appears in `ros2 node list` and responds to service calls, but its main functionality (e.g., publishing camera images) has stopped. The process is still alive, but an internal thread has crashed.

**Example:**

```cpp
class CameraNode : public rclcpp::Node {
public:
    CameraNode() : Node("camera_node") {
        pub_ = create_publisher<Image>("image_raw", 10);

        // Capture thread started
        capture_thread_ = std::thread([this]() {
            while (rclcpp::ok()) {
                auto img = capture_image();  // May throw
                pub_->publish(img);
                std::this_thread::sleep_for(33ms);
            }
        });
    }

private:
    std::thread capture_thread_;
    // No exception handling! If capture_image() throws, thread dies silently
};
```

**Problem:**
If `capture_image()` throws an exception, the capture thread terminates, but:
- Node still responds to `ros2 node list`
- Node still has active subscribers/publishers
- Main thread still spinning
- No error messages logged

**Diagnosis:**

```bash
# Check publication rate
ros2 topic hz /image_raw
# Output: "WARNING: no messages received"

# Check node info (shows publisher exists)
ros2 node info /camera_node
# Shows: Publishers: /image_raw

# But no data flow!
ros2 topic echo /image_raw
# No output
```

**Solution:**

```cpp
class CameraNode : public rclcpp::Node {
public:
    CameraNode() : Node("camera_node") {
        pub_ = create_publisher<Image>("image_raw", 10);

        // Add heartbeat timer to detect thread death
        last_capture_time_ = now();
        watchdog_timer_ = create_wall_timer(1s, [this]() {
            auto elapsed = (now() - last_capture_time_).seconds();
            if (elapsed > 1.0) {
                RCLCPP_ERROR(get_logger(), "Capture thread died! Last capture %.1fs ago", elapsed);
                // Attempt restart or shutdown gracefully
                restart_capture_thread();
            }
        });

        capture_thread_ = std::thread([this]() {
            while (rclcpp::ok()) {
                try {
                    auto img = capture_image();
                    pub_->publish(img);
                    last_capture_time_ = now();  // Update heartbeat
                } catch (const std::exception &e) {
                    RCLCPP_ERROR(get_logger(), "Capture error: %s", e.what());
                    // Continue rather than dying
                }
                std::this_thread::sleep_for(33ms);
            }
        });
    }

private:
    std::thread capture_thread_;
    rclcpp::Time last_capture_time_;
    rclcpp::TimerBase::SharedPtr watchdog_timer_;
};
```

**Best Practices:**
- Always use try-catch in threads
- Implement heartbeat/watchdog patterns
- Log errors before thread termination
- Consider using `std::async` with futures for better exception propagation
- Use diagnostic messages to report component health

---

### Edge Case 2: Multicast Blocked on Network

**Scenario:**
Two ROS2 machines on the same physical network can't discover each other. `ros2 node list` only shows local nodes. Network switch or router has multicast disabled.

**Diagnosis:**

```bash
# On Machine 1
$ ros2 node list
/local_node_1

# On Machine 2
$ ros2 node list
/local_node_2
# Can't see /local_node_1 from Machine 1!

# Check multicast
$ ros2 multicast receive
# (no output - not receiving multicast packets)

# ros2 doctor shows warning
$ ros2 doctor
UserWarning: No multicast support detected on interface eth0
```

**Root causes:**
1. Network switch has IGMP snooping enabled without querier
2. Corporate firewall blocks multicast (224.0.0.0/4)
3. VPN tunnels don't forward multicast
4. Virtualization (Docker, VM) misconfigured

**Solution 1: Use Unicast (Simple Discovery Server)**

Fast DDS supports a Simple Discovery Server that uses unicast instead of multicast.

**On Server Machine (e.g., Machine 1 at 192.168.1.100):**

```bash
# Start discovery server
fastdds discovery -i 0 -l 192.168.1.100 -p 11811
```

**On Client Machines:**

```bash
# Create discovery profile
export FASTRTPS_DEFAULT_PROFILES_FILE=/tmp/super_client_profile.xml

cat << 'EOF' > /tmp/super_client_profile.xml
<?xml version="1.0" encoding="UTF-8" ?>
<profiles xmlns="http://www.eprosima.com/XMLSchemas/fastRTPS_Profiles">
    <participant profile_name="super_client_profile" is_default_profile="true">
        <rtps>
            <builtin>
                <discovery_config>
                    <discoveryProtocol>SIMPLE</discoveryProtocol>
                    <discoveryServersList>
                        <RemoteServer prefix="44.53.00.5f.45.50.52.4f.53.49.4d.41">
                            <metatrafficUnicastLocatorList>
                                <locator>
                                    <udpv4>
                                        <address>192.168.1.100</address>
                                        <port>11811</port>
                                    </udpv4>
                                </locator>
                            </metatrafficUnicastLocatorList>
                        </RemoteServer>
                    </discoveryServersList>
                </discovery_config>
            </builtin>
        </rtps>
    </participant>
</profiles>
EOF

# Run nodes with profile
ros2 run my_package my_node
```

**Solution 2: Use ROS 2 Discovery Server (ros2 tool)**

```bash
# On server machine
ros2 run ros_discovery_server discovery_server

# On client machines
export ROS_DISCOVERY_SERVER=192.168.1.100:11811
ros2 run my_package my_node
```

**Solution 3: Fix Network Configuration**

```bash
# Enable multicast on interface
sudo ip link set eth0 multicast on

# Check firewall rules
sudo iptables -L | grep 224.0.0.0
# Add rule if needed
sudo iptables -A INPUT -d 224.0.0.0/4 -j ACCEPT

# For Docker: use host network mode
docker run --network host my_ros2_image
```

**Verification:**

```bash
# After fix, verify multicast works
ros2 multicast receive  # Terminal 1
ros2 multicast send      # Terminal 2
# Should see messages in Terminal 1
```

---

### Edge Case 3: Clock Skew Between Nodes (use_sim_time Mismatch)

**Scenario:**
Some nodes use simulation time (`use_sim_time: true`), others use system time. TF lookups fail, messages dropped due to "timestamp too old" warnings.

**Example Setup:**

```bash
# Terminal 1: Start Gazebo simulation (publishes /clock)
ros2 launch gazebo_ros gazebo.launch.py

# Terminal 2: Start robot_state_publisher (with use_sim_time: true)
ros2 run robot_state_publisher robot_state_publisher \
    --ros-args -p use_sim_time:=true

# Terminal 3: Start sensor node (FORGOT use_sim_time!)
ros2 run my_sensors camera_node
# Using system time by default!
```

**Problem:**

```cpp
// camera_node publishes with system time
auto msg = std::make_shared<Image>();
msg->header.stamp = now();  // System time: 1676543210.0
pub_->publish(msg);

// robot_state_publisher TF uses simulation time (e.g., 125.5)
// TF lookup fails: "Lookup would require extrapolation into the future"
```

**Diagnosis:**

```bash
# Check use_sim_time for each node
ros2 param get /camera_node use_sim_time
# Output: Boolean value is: False  (WRONG!)

ros2 param get /robot_state_publisher use_sim_time
# Output: Boolean value is: True  (Correct)

# Check /clock topic
ros2 topic echo /clock --once
# Output: clock: {sec: 125, nanosec: 500000000}  (simulation time)

# Check message timestamps
ros2 topic echo /camera/image_raw --once
# Output: header.stamp: {sec: 1676543210, nanosec: 0}  (system time - WRONG!)

# TF diagnostics show error
ros2 run tf2_ros tf2_echo base_link camera_link
# "Lookup would require extrapolation into the future. Requested time 125.500
#  but the latest data is at time 1676543210.0"
```

**Solution 1: Set use_sim_time Globally**

```yaml
# In launch file
from launch import LaunchDescription
from launch_ros.actions import Node

def generate_launch_description():
    return LaunchDescription([
        Node(
            package='my_sensors',
            executable='camera_node',
            name='camera_node',
            parameters=[{'use_sim_time': True}]  # Set for all nodes
        ),
        Node(
            package='robot_state_publisher',
            executable='robot_state_publisher',
            name='robot_state_publisher',
            parameters=[{'use_sim_time': True}]
        ),
        # ... more nodes
    ])
```

**Solution 2: Set via Command Line**

```bash
# Set for individual node
ros2 run my_sensors camera_node --ros-args -p use_sim_time:=true

# Set globally via environment (ROS 2 Humble+)
export ROS_AUTOMATIC_DISCOVERY_RANGE=SUBNET
ros2 param set /use_sim_time true  # Sets for all nodes
```

**Solution 3: Runtime Fix (Not Recommended)**

```bash
# Dynamically set parameter (node must support dynamic parameters)
ros2 param set /camera_node use_sim_time true
```

**Verification:**

```bash
# Check all nodes have consistent use_sim_time
for node in $(ros2 node list); do
    echo "$node: $(ros2 param get $node use_sim_time 2>/dev/null)"
done

# Expected output:
# /camera_node: Boolean value is: True
# /robot_state_publisher: Boolean value is: True
# /gazebo: Boolean value is: True
```

**Best Practices:**
- Always set `use_sim_time` in launch files for simulations
- Use global parameters in launch files to ensure consistency
- Add assertions in node initialization:
  ```cpp
  bool use_sim_time = get_parameter("use_sim_time").as_bool();
  if (use_sim_time) {
      RCLCPP_INFO(get_logger(), "Using simulation time");
  } else {
      RCLCPP_WARN(get_logger(), "Using system time - ensure this is correct!");
  }
  ```

---

### Edge Case 4: Performance Degradation Over Time (Memory Leak in QoS History)

**Scenario:**
A node's memory usage grows steadily over hours, eventually causing system instability. The leak is caused by `KEEP_ALL` QoS policy accumulating messages.

**Example:**

```cpp
class DataLogger : public rclcpp::Node {
public:
    DataLogger() : Node("data_logger") {
        // QoS: KEEP_ALL (saves every message!)
        auto qos = rclcpp::QoS(rclcpp::KeepAll());
        qos.reliable();
        qos.transient_local();  // Store for late-joining subscribers

        sub_ = create_subscription<Image>(
            "/camera/image_raw", qos,
            [this](const Image::SharedPtr msg) {
                // Process message
                RCLCPP_INFO_THROTTLE(get_logger(), *get_clock(), 5000,
                                     "Received image");
            }
        );
    }
};
```

**Problem:**
With `KEEP_ALL` and `TRANSIENT_LOCAL`, DDS stores every received message in memory indefinitely (until a subscriber requests historical data). For a 30 Hz camera:
- 30 images/sec × 3 MB/image = 90 MB/sec
- After 1 hour: 324 GB memory used!

**Diagnosis:**

```bash
# Monitor memory usage
watch -n 1 'ps aux | grep data_logger'
# RSS column grows: 100MB → 500MB → 2GB → ...

# Check QoS settings
ros2 topic info /camera/image_raw --verbose
# Output shows: History: KEEP_ALL, Durability: TRANSIENT_LOCAL

# Use heaptrack
heaptrack ros2 run my_package data_logger
# After 10 minutes, Ctrl+C
heaptrack_gui heaptrack.data_logger.*.gz
# Shows massive allocation in DDS layer
```

**DDS memory structure:**

```
DataReader (KEEP_ALL, TRANSIENT_LOCAL)
  └─ History Cache
       ├─ Sample 1 (3 MB) ───┐
       ├─ Sample 2 (3 MB)    │
       ├─ Sample 3 (3 MB)    ├─ Grows indefinitely!
       ├─ ...                │
       └─ Sample N (3 MB) ───┘
```

**Solution 1: Use KEEP_LAST with Appropriate Depth**

```cpp
class DataLogger : public rclcpp::Node {
public:
    DataLogger() : Node("data_logger") {
        // Keep only last 10 messages
        auto qos = rclcpp::QoS(10);  // KEEP_LAST with depth 10
        qos.reliable();
        // Use VOLATILE (don't store historical data)
        qos.durability_volatile();

        sub_ = create_subscription<Image>(
            "/camera/image_raw", qos,
            [this](const Image::SharedPtr msg) {
                RCLCPP_INFO_THROTTLE(get_logger(), *get_clock(), 5000,
                                     "Received image");
            }
        );
    }
};
```

**Memory usage now:**
- 10 images × 3 MB = 30 MB (constant)

**Solution 2: If You Need TRANSIENT_LOCAL, Add Resource Limits**

```cpp
// Custom QoS with resource limits
rmw_qos_profile_t qos_profile = rmw_qos_profile_default;
qos_profile.history = RMW_QOS_POLICY_HISTORY_KEEP_LAST;
qos_profile.depth = 100;  // Keep last 100 messages
qos_profile.durability = RMW_QOS_POLICY_DURABILITY_TRANSIENT_LOCAL;

// Fast DDS XML profile with memory limits
std::string xml_profile = R"(
<profiles>
    <data_reader profile_name="limited_reader">
        <qos>
            <durability>TRANSIENT_LOCAL</durability>
            <history>
                <kind>KEEP_LAST</kind>
                <depth>100</depth>
            </history>
        </qos>
        <historyMemoryPolicy>PREALLOCATED_WITH_REALLOC</historyMemoryPolicy>
        <resourceLimits>
            <max_samples>100</max_samples>
            <max_instances>1</max_instances>
            <max_samples_per_instance>100</max_samples_per_instance>
        </resourceLimits>
    </data_reader>
</profiles>
)";
```

**Solution 3: Monitoring and Alerting**

```cpp
class DataLogger : public rclcpp::Node {
public:
    DataLogger() : Node("data_logger") {
        sub_ = create_subscription<Image>(...);

        // Monitor memory usage
        memory_check_timer_ = create_wall_timer(10s, [this]() {
            std::ifstream statm("/proc/self/statm");
            size_t size, resident, share, text, lib, data, dt;
            statm >> size >> resident >> share >> text >> lib >> data >> dt;

            size_t rss_mb = (resident * sysconf(_SC_PAGESIZE)) / (1024 * 1024);
            RCLCPP_INFO(get_logger(), "Memory usage: %zu MB", rss_mb);

            if (rss_mb > 1000) {  // Alert if > 1 GB
                RCLCPP_ERROR(get_logger(), "HIGH MEMORY USAGE! Possible leak!");
            }
        });
    }
};
```

**Verification After Fix:**

```bash
# Memory should stabilize
watch -n 1 'ps aux | grep data_logger'
# RSS column: 50MB → 60MB → 65MB (stabilizes)

# Check QoS
ros2 topic info /camera/image_raw --verbose
# History: KEEP_LAST, Depth: 10, Durability: VOLATILE
```

---

## Code Examples

### Example 1: System Health Monitor Node

A diagnostic node that monitors the health of the ROS2 system and publishes status reports.

```cpp
// system_health_monitor.cpp
#include <rclcpp/rclcpp.hpp>
#include <diagnostic_msgs/msg/diagnostic_array.hpp>
#include <diagnostic_msgs/msg/diagnostic_status.hpp>
#include <diagnostic_msgs/msg/key_value.hpp>
#include <std_msgs/msg/header.hpp>
#include <rcutils/error_handling.h>

#include <fstream>
#include <sstream>
#include <unistd.h>
#include <sys/sysinfo.h>
#include <map>
#include <chrono>

using namespace std::chrono_literals;

class SystemHealthMonitor : public rclcpp::Node {
public:
    SystemHealthMonitor() : Node("system_health_monitor") {
        // Parameters
        declare_parameter("monitor_nodes", std::vector<std::string>{});
        declare_parameter("monitor_topics", std::vector<std::string>{});
        declare_parameter("cpu_warn_threshold", 80.0);
        declare_parameter("cpu_error_threshold", 95.0);
        declare_parameter("mem_warn_threshold", 80.0);
        declare_parameter("mem_error_threshold", 95.0);
        declare_parameter("topic_timeout_sec", 5.0);

        monitored_nodes_ = get_parameter("monitor_nodes").as_string_array();
        monitored_topics_ = get_parameter("monitor_topics").as_string_array();
        cpu_warn_thresh_ = get_parameter("cpu_warn_threshold").as_double();
        cpu_error_thresh_ = get_parameter("cpu_error_threshold").as_double();
        mem_warn_thresh_ = get_parameter("mem_warn_threshold").as_double();
        mem_error_thresh_ = get_parameter("mem_error_threshold").as_double();
        topic_timeout_ = get_parameter("topic_timeout_sec").as_double();

        // Publisher for diagnostics
        diagnostics_pub_ = create_publisher<diagnostic_msgs::msg::DiagnosticArray>(
            "/diagnostics", 10
        );

        // Timer to publish diagnostics
        timer_ = create_wall_timer(1s, std::bind(&SystemHealthMonitor::publish_diagnostics, this));

        // Initialize topic monitoring
        for (const auto &topic : monitored_topics_) {
            auto sub = create_generic_subscription(
                topic,
                "std_msgs/msg/String",  // Generic - will work with any type
                rclcpp::QoS(10),
                [this, topic](std::shared_ptr<rclcpp::SerializedMessage> msg) {
                    (void)msg;  // Don't care about content
                    topic_last_seen_[topic] = now();
                }
            );
            topic_subscribers_.push_back(sub);
            topic_last_seen_[topic] = now();  // Initialize
        }

        RCLCPP_INFO(get_logger(), "System Health Monitor started");
        RCLCPP_INFO(get_logger(), "Monitoring %zu nodes and %zu topics",
                    monitored_nodes_.size(), monitored_topics_.size());
    }

private:
    void publish_diagnostics() {
        auto msg = diagnostic_msgs::msg::DiagnosticArray();
        msg.header.stamp = now();

        // Check system resources
        msg.status.push_back(check_cpu_usage());
        msg.status.push_back(check_memory_usage());
        msg.status.push_back(check_disk_usage());

        // Check monitored nodes
        for (const auto &node_name : monitored_nodes_) {
            msg.status.push_back(check_node_alive(node_name));
        }

        // Check monitored topics
        for (const auto &topic_name : monitored_topics_) {
            msg.status.push_back(check_topic_activity(topic_name));
        }

        diagnostics_pub_->publish(msg);
    }

    diagnostic_msgs::msg::DiagnosticStatus check_cpu_usage() {
        diagnostic_msgs::msg::DiagnosticStatus status;
        status.name = "CPU Usage";
        status.hardware_id = get_hostname();

        double cpu_percent = get_cpu_usage();

        if (cpu_percent > cpu_error_thresh_) {
            status.level = diagnostic_msgs::msg::DiagnosticStatus::ERROR;
            status.message = "CPU usage critical";
        } else if (cpu_percent > cpu_warn_thresh_) {
            status.level = diagnostic_msgs::msg::DiagnosticStatus::WARN;
            status.message = "CPU usage high";
        } else {
            status.level = diagnostic_msgs::msg::DiagnosticStatus::OK;
            status.message = "CPU usage normal";
        }

        diagnostic_msgs::msg::KeyValue kv;
        kv.key = "CPU Usage (%)";
        kv.value = std::to_string(cpu_percent);
        status.values.push_back(kv);

        return status;
    }

    diagnostic_msgs::msg::DiagnosticStatus check_memory_usage() {
        diagnostic_msgs::msg::DiagnosticStatus status;
        status.name = "Memory Usage";
        status.hardware_id = get_hostname();

        struct sysinfo si;
        sysinfo(&si);

        double total_mem = si.totalram * si.mem_unit / (1024.0 * 1024.0 * 1024.0);  // GB
        double used_mem = (si.totalram - si.freeram) * si.mem_unit / (1024.0 * 1024.0 * 1024.0);
        double mem_percent = (used_mem / total_mem) * 100.0;

        if (mem_percent > mem_error_thresh_) {
            status.level = diagnostic_msgs::msg::DiagnosticStatus::ERROR;
            status.message = "Memory usage critical";
        } else if (mem_percent > mem_warn_thresh_) {
            status.level = diagnostic_msgs::msg::DiagnosticStatus::WARN;
            status.message = "Memory usage high";
        } else {
            status.level = diagnostic_msgs::msg::DiagnosticStatus::OK;
            status.message = "Memory usage normal";
        }

        status.values.push_back(make_kv("Total Memory (GB)", total_mem));
        status.values.push_back(make_kv("Used Memory (GB)", used_mem));
        status.values.push_back(make_kv("Memory Usage (%)", mem_percent));

        return status;
    }

    diagnostic_msgs::msg::DiagnosticStatus check_disk_usage() {
        diagnostic_msgs::msg::DiagnosticStatus status;
        status.name = "Disk Usage";
        status.hardware_id = get_hostname();

        // Read /proc/mounts and check disk usage for root
        std::ifstream mounts("/proc/mounts");
        std::string line;
        double disk_percent = 0.0;

        // Simple check for root filesystem (would need statvfs for production)
        // For demo purposes, we'll use df command via popen
        FILE *fp = popen("df / | tail -1 | awk '{print $5}' | sed 's/%//'", "r");
        if (fp) {
            char buffer[128];
            if (fgets(buffer, sizeof(buffer), fp) != nullptr) {
                disk_percent = std::stod(buffer);
            }
            pclose(fp);
        }

        if (disk_percent > 95.0) {
            status.level = diagnostic_msgs::msg::DiagnosticStatus::ERROR;
            status.message = "Disk almost full";
        } else if (disk_percent > 80.0) {
            status.level = diagnostic_msgs::msg::DiagnosticStatus::WARN;
            status.message = "Disk usage high";
        } else {
            status.level = diagnostic_msgs::msg::DiagnosticStatus::OK;
            status.message = "Disk usage normal";
        }

        status.values.push_back(make_kv("Disk Usage (%)", disk_percent));

        return status;
    }

    diagnostic_msgs::msg::DiagnosticStatus check_node_alive(const std::string &node_name) {
        diagnostic_msgs::msg::DiagnosticStatus status;
        status.name = "Node: " + node_name;
        status.hardware_id = get_hostname();

        // Get list of nodes
        auto node_names = get_node_names();
        bool found = false;
        for (const auto &name : node_names) {
            if (name == node_name) {
                found = true;
                break;
            }
        }

        if (found) {
            status.level = diagnostic_msgs::msg::DiagnosticStatus::OK;
            status.message = "Node alive";
        } else {
            status.level = diagnostic_msgs::msg::DiagnosticStatus::ERROR;
            status.message = "Node not found";
        }

        return status;
    }

    diagnostic_msgs::msg::DiagnosticStatus check_topic_activity(const std::string &topic_name) {
        diagnostic_msgs::msg::DiagnosticStatus status;
        status.name = "Topic: " + topic_name;
        status.hardware_id = get_hostname();

        if (topic_last_seen_.find(topic_name) == topic_last_seen_.end()) {
            status.level = diagnostic_msgs::msg::DiagnosticStatus::ERROR;
            status.message = "Topic never seen";
            return status;
        }

        auto elapsed = (now() - topic_last_seen_[topic_name]).seconds();

        if (elapsed > topic_timeout_) {
            status.level = diagnostic_msgs::msg::DiagnosticStatus::ERROR;
            status.message = "Topic timeout";
            status.values.push_back(make_kv("Time since last message (s)", elapsed));
        } else {
            status.level = diagnostic_msgs::msg::DiagnosticStatus::OK;
            status.message = "Topic active";
            status.values.push_back(make_kv("Time since last message (s)", elapsed));
        }

        return status;
    }

    double get_cpu_usage() {
        // Read /proc/stat to calculate CPU usage
        static unsigned long long prev_total = 0, prev_idle = 0;

        std::ifstream stat("/proc/stat");
        std::string line;
        std::getline(stat, line);  // First line: "cpu ..."

        std::istringstream ss(line);
        std::string cpu;
        unsigned long long user, nice, system, idle, iowait, irq, softirq, steal;
        ss >> cpu >> user >> nice >> system >> idle >> iowait >> irq >> softirq >> steal;

        unsigned long long total = user + nice + system + idle + iowait + irq + softirq + steal;
        unsigned long long idle_total = idle + iowait;

        unsigned long long total_diff = total - prev_total;
        unsigned long long idle_diff = idle_total - prev_idle;

        double cpu_percent = 0.0;
        if (total_diff > 0) {
            cpu_percent = 100.0 * (1.0 - static_cast<double>(idle_diff) / total_diff);
        }

        prev_total = total;
        prev_idle = idle_total;

        return cpu_percent;
    }

    std::string get_hostname() {
        char hostname[256];
        gethostname(hostname, sizeof(hostname));
        return std::string(hostname);
    }

    diagnostic_msgs::msg::KeyValue make_kv(const std::string &key, double value) {
        diagnostic_msgs::msg::KeyValue kv;
        kv.key = key;
        kv.value = std::to_string(value);
        return kv;
    }

    rclcpp::Publisher<diagnostic_msgs::msg::DiagnosticArray>::SharedPtr diagnostics_pub_;
    rclcpp::TimerBase::SharedPtr timer_;

    std::vector<std::string> monitored_nodes_;
    std::vector<std::string> monitored_topics_;
    std::vector<rclcpp::GenericSubscription::SharedPtr> topic_subscribers_;
    std::map<std::string, rclcpp::Time> topic_last_seen_;

    double cpu_warn_thresh_, cpu_error_thresh_;
    double mem_warn_thresh_, mem_error_thresh_;
    double topic_timeout_;
};

int main(int argc, char **argv) {
    rclcpp::init(argc, argv);
    rclcpp::spin(std::make_shared<SystemHealthMonitor>());
    rclcpp::shutdown();
    return 0;
}
```

**CMakeLists.txt:**

```cmake
find_package(diagnostic_msgs REQUIRED)

add_executable(system_health_monitor src/system_health_monitor.cpp)
ament_target_dependencies(system_health_monitor
    rclcpp
    diagnostic_msgs
)

install(TARGETS
    system_health_monitor
    DESTINATION lib/${PROJECT_NAME}
)
```

**Usage:**

```bash
# Run with default settings
ros2 run my_package system_health_monitor

# Run with specific nodes/topics to monitor
ros2 run my_package system_health_monitor --ros-args \
    -p monitor_nodes:="['/robot_state_publisher', '/camera_node']" \
    -p monitor_topics:="['/scan', '/camera/image_raw']" \
    -p cpu_warn_threshold:=70.0 \
    -p topic_timeout_sec:=2.0

# View diagnostics
ros2 topic echo /diagnostics

# Use rqt_runtime_monitor for GUI
ros2 run rqt_runtime_monitor rqt_runtime_monitor
```

**What This Example Demonstrates:**
- Publishing diagnostic messages (standard ROS2 diagnostics interface)
- System resource monitoring (CPU, memory, disk)
- Node and topic health checks
- Configurable thresholds via parameters
- Use of generic subscriptions to monitor any topic type
- Integration with standard ROS2 diagnostic tools

---

### Example 2: Performance Profiler Node

A node that profiles callback execution times and publishes metrics.

```cpp
// performance_profiler.cpp
#include <rclcpp/rclcpp.hpp>
#include <std_msgs/msg/string.hpp>
#include <sensor_msgs/msg/laser_scan.hpp>
#include <geometry_msgs/msg/twist.hpp>

#include <chrono>
#include <map>
#include <vector>
#include <numeric>
#include <algorithm>

using namespace std::chrono_literals;

class PerformanceProfiler : public rclcpp::Node {
public:
    PerformanceProfiler() : Node("performance_profiler") {
        // Subscribers for topics to profile
        scan_sub_ = create_subscription<sensor_msgs::msg::LaserScan>(
            "/scan", 10,
            [this](const sensor_msgs::msg::LaserScan::SharedPtr msg) {
                profile_callback("scan_callback", [this, msg]() {
                    // Simulate processing
                    process_scan(msg);
                });
            }
        );

        cmd_vel_sub_ = create_subscription<geometry_msgs::msg::Twist>(
            "/cmd_vel", 10,
            [this](const geometry_msgs::msg::Twist::SharedPtr msg) {
                profile_callback("cmd_vel_callback", [this, msg]() {
                    process_cmd_vel(msg);
                });
            }
        );

        // Timer to print statistics
        stats_timer_ = create_wall_timer(5s, std::bind(&PerformanceProfiler::print_stats, this));

        RCLCPP_INFO(get_logger(), "Performance Profiler started");
    }

private:
    template<typename Func>
    void profile_callback(const std::string &name, Func &&func) {
        auto start = std::chrono::steady_clock::now();

        try {
            func();
        } catch (const std::exception &e) {
            RCLCPP_ERROR(get_logger(), "Exception in %s: %s", name.c_str(), e.what());
        }

        auto end = std::chrono::steady_clock::now();
        auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end - start);

        // Record timing
        callback_timings_[name].push_back(duration.count());

        // Keep only last 1000 samples
        if (callback_timings_[name].size() > 1000) {
            callback_timings_[name].erase(callback_timings_[name].begin());
        }
    }

    void process_scan(const sensor_msgs::msg::LaserScan::SharedPtr msg) {
        // Simulate expensive processing
        double sum = std::accumulate(msg->ranges.begin(), msg->ranges.end(), 0.0);
        (void)sum;  // Suppress unused warning
    }

    void process_cmd_vel(const geometry_msgs::msg::Twist::SharedPtr msg) {
        // Simulate processing
        double speed = std::sqrt(
            msg->linear.x * msg->linear.x +
            msg->linear.y * msg->linear.y +
            msg->linear.z * msg->linear.z
        );
        (void)speed;
    }

    void print_stats() {
        RCLCPP_INFO(get_logger(), "=== Callback Performance Statistics ===");

        for (const auto &[name, timings] : callback_timings_) {
            if (timings.empty()) continue;

            // Calculate statistics
            auto mean = std::accumulate(timings.begin(), timings.end(), 0.0) / timings.size();

            auto sorted_timings = timings;
            std::sort(sorted_timings.begin(), sorted_timings.end());
            auto median = sorted_timings[sorted_timings.size() / 2];
            auto p95 = sorted_timings[static_cast<size_t>(sorted_timings.size() * 0.95)];
            auto p99 = sorted_timings[static_cast<size_t>(sorted_timings.size() * 0.99)];
            auto min = sorted_timings.front();
            auto max = sorted_timings.back();

            // Calculate standard deviation
            double variance = 0.0;
            for (const auto &t : timings) {
                variance += (t - mean) * (t - mean);
            }
            variance /= timings.size();
            double stddev = std::sqrt(variance);

            RCLCPP_INFO(get_logger(), "%s (n=%zu):", name.c_str(), timings.size());
            RCLCPP_INFO(get_logger(), "  Mean: %.2f μs, Median: %.2f μs, StdDev: %.2f μs",
                        mean, median, stddev);
            RCLCPP_INFO(get_logger(), "  Min: %.2f μs, Max: %.2f μs", min, max);
            RCLCPP_INFO(get_logger(), "  P95: %.2f μs, P99: %.2f μs", p95, p99);

            // Warn if slow
            if (mean > 10000.0) {  // > 10ms
                RCLCPP_WARN(get_logger(), "  WARNING: Average callback time > 10ms!");
            }
            if (p99 > 50000.0) {  // > 50ms
                RCLCPP_WARN(get_logger(), "  WARNING: P99 callback time > 50ms!");
            }
        }

        RCLCPP_INFO(get_logger(), "=======================================");
    }

    rclcpp::Subscription<sensor_msgs::msg::LaserScan>::SharedPtr scan_sub_;
    rclcpp::Subscription<geometry_msgs::msg::Twist>::SharedPtr cmd_vel_sub_;
    rclcpp::TimerBase::SharedPtr stats_timer_;

    std::map<std::string, std::vector<double>> callback_timings_;
};

int main(int argc, char **argv) {
    rclcpp::init(argc, argv);
    rclcpp::spin(std::make_shared<PerformanceProfiler>());
    rclcpp::shutdown();
    return 0;
}
```

**Usage:**

```bash
# Run profiler
ros2 run my_package performance_profiler

# Output example:
# [INFO] [performance_profiler]: === Callback Performance Statistics ===
# [INFO] [performance_profiler]: scan_callback (n=250):
# [INFO] [performance_profiler]:   Mean: 1234.56 μs, Median: 1200.00 μs, StdDev: 45.23 μs
# [INFO] [performance_profiler]:   Min: 1100.00 μs, Max: 1500.00 μs
# [INFO] [performance_profiler]:   P95: 1350.00 μs, P99: 1450.00 μs
# [INFO] [performance_profiler]: cmd_vel_callback (n=50):
# [INFO] [performance_profiler]:   Mean: 23.45 μs, Median: 22.00 μs, StdDev: 5.12 μs
# [INFO] [performance_profiler]:   Min: 18.00 μs, Max: 45.00 μs
# [INFO] [performance_profiler]:   P95: 35.00 μs, P99: 42.00 μs
# [INFO] [performance_profiler]: =======================================
```

**What This Example Demonstrates:**
- Profiling callback execution times
- Statistical analysis (mean, median, percentiles, std dev)
- Generic profiling wrapper pattern
- Performance warning thresholds
- Sliding window for continuous monitoring

---

## Interview Questions

### Question 1: How would you debug a node that's not receiving messages on a topic?

**Difficulty:** ⭐⭐ (Medium)

**Answer:**

I would follow a systematic troubleshooting workflow:

1. **Verify topic exists:**
   ```bash
   ros2 topic list | grep /my_topic
   ```

2. **Check if anyone is publishing:**
   ```bash
   ros2 topic info /my_topic
   ```
   Look for "Publisher count > 0".

3. **Check message rate:**
   ```bash
   ros2 topic hz /my_topic
   ```
   If no messages, publisher might be paused or crashed.

4. **Check QoS compatibility:**
   ```bash
   ros2 topic info /my_topic --verbose
   ```
   Compare publisher and subscriber QoS. Common issues:
   - Publisher: BEST_EFFORT, Subscriber: RELIABLE (incompatible)
   - Publisher: VOLATILE, Subscriber: TRANSIENT_LOCAL (late-joining subscriber misses messages)

5. **Echo messages to verify content:**
   ```bash
   ros2 topic echo /my_topic
   ```
   Ensure messages are actually being published.

6. **Check node is subscribing:**
   ```bash
   ros2 node info /my_subscriber_node
   ```
   Verify `/my_topic` is listed under "Subscribers".

7. **Check for discovery issues:**
   ```bash
   ros2 doctor
   ```
   Look for multicast warnings or network issues.

8. **Check namespace/remapping:**
   ```bash
   # Topic name might be remapped
   ros2 topic list  # See actual topic names including namespaces
   ```

**Common fixes:**
- Fix QoS mismatch (align RELIABLE/BEST_EFFORT)
- Verify node is spinning (not blocked in main thread)
- Check ROS_DOMAIN_ID consistency
- Fix topic name typos or namespace issues

---

### Question 2: What tools would you use to identify performance bottlenecks in a ROS2 system?

**Difficulty:** ⭐⭐⭐ (Hard)

**Answer:**

I would use a layered approach:

**1. High-Level Performance Monitoring:**

```bash
# Check message rates
ros2 topic hz /camera/image_raw

# Check bandwidth
ros2 topic bw /camera/image_raw

# Check computation graph
ros2 run rqt_graph rqt_graph
# Identify nodes with many connections (potential bottlenecks)
```

**2. Node-Level CPU/Memory Profiling:**

```bash
# Monitor CPU and memory usage
top -p $(pgrep -f my_node)

# Or use htop for better visualization
htop -p $(pgrep -f my_node)
```

**3. Callback-Level Profiling:**

Instrument callbacks with timing code:

```cpp
void callback(const Message::SharedPtr msg) {
    auto start = std::chrono::steady_clock::now();

    // Processing...

    auto duration = std::chrono::steady_clock::now() - start;
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(duration).count();

    if (ms > 100) {  // Log slow callbacks
        RCLCPP_WARN(get_logger(), "Slow callback: %ld ms", ms);
    }
}
```

**4. System-Level Profiling:**

```bash
# CPU profiling with perf
perf record -F 99 -p $(pgrep -f my_node) sleep 30
perf report

# Memory profiling with heaptrack
heaptrack ros2 run my_package my_node
heaptrack_gui heaptrack.my_node.*.gz
```

**5. DDS-Level Tracing:**

```bash
# ROS2 tracing
ros2 trace
# Run workload
ros2 trace analyze ~/.ros/tracing/session-*
```

**Common Bottlenecks:**
- **Slow callbacks:** Blocking I/O, expensive computation
- **Message size:** Large images without compression
- **QoS queue overflow:** Messages being dropped
- **Discovery overhead:** Too many nodes/topics
- **Memory leaks:** Growing memory usage over time

**Tools Summary:**
- **ros2 topic hz/bw:** Message flow monitoring
- **top/htop:** CPU/memory monitoring
- **perf:** CPU profiling
- **heaptrack/valgrind:** Memory profiling
- **ros2 trace:** DDS-level tracing
- **rqt_graph:** Architecture visualization
- Custom instrumentation in code

---

### Question 3: Explain the purpose of `ros2 doctor` and what issues it can detect.

**Difficulty:** ⭐ (Easy)

**Answer:**

`ros2 doctor` is an automated diagnostic tool that checks the health of your ROS2 installation and runtime environment. It performs several categories of checks:

**1. Network Configuration:**
- **Multicast support:** Critical for DDS discovery. If multicast is blocked, nodes on different machines can't discover each other.
- **Network interfaces:** Detects available interfaces and potential issues.
- **Firewall rules:** Warns if ports might be blocked.

**2. Platform Configuration:**
- **ROS2 installation:** Verifies ROS2 is correctly installed.
- **RMW implementation:** Checks which DDS implementation is active (e.g., Fast DDS, Cyclone DDS).
- **Environment variables:** Verifies `ROS_DOMAIN_ID`, `RMW_IMPLEMENTATION`, etc.

**3. Runtime System:**
- **Active nodes:** Lists running nodes and checks for issues.
- **Topic connectivity:** Detects publishers/subscribers that aren't connected.
- **QoS compatibility:** Identifies QoS mismatches (e.g., RELIABLE publisher with BEST_EFFORT subscriber).

**Example output:**

```bash
$ ros2 doctor
Checking network...
UserWarning: No multicast support detected on interface eth0

Checking ROS2 setup...
Found RMW implementation: rmw_fastrtps_cpp

Checking active system...
QoS Compatibility Issues:
  Publisher /camera_node on /image_raw: BEST_EFFORT
  Subscriber /image_processor on /image_raw: RELIABLE
  → Incompatible QoS policies
```

**Use cases:**
- Troubleshooting discovery issues between machines
- Verifying ROS2 installation
- Identifying QoS mismatches
- Checking network configuration before deployment

**Limitations:**
- Can't detect application-level logic errors
- May have false positives (e.g., warning about multicast on loopback interface)
- Doesn't profile performance

---

### Question 4: How would you debug a memory leak in a ROS2 node?

**Difficulty:** ⭐⭐⭐ (Hard)

**Answer:**

**Step 1: Confirm Memory Leak**

Monitor memory usage over time:

```bash
# Watch RSS (Resident Set Size) column
watch -n 1 'ps aux | grep my_node | grep -v grep'

# Or more detailed
while true; do
    ps aux | grep my_node | grep -v grep | awk '{print $6}';
    sleep 10;
done | tee memory_log.txt
```

If RSS grows steadily, there's likely a leak.

**Step 2: Profile with Valgrind**

```bash
# Run under Valgrind (will be slow)
valgrind --leak-check=full --show-leak-kinds=all \
    --log-file=valgrind_output.txt \
    ros2 run my_package my_node

# Let run for a few minutes, then Ctrl+C

# Check report
cat valgrind_output.txt
```

**Valgrind output example:**

```
==12345== 1,234,567 bytes in 1,234 blocks are definitely lost
==12345==    at malloc (vg_replace_malloc.c:123)
==12345==    by allocate (new_allocator.h:104)
==12345==    by callback (my_node.cpp:56)
```

**Step 3: Profile with heaptrack (More User-Friendly)**

```bash
# Install heaptrack
sudo apt install heaptrack heaptrack-gui

# Profile
heaptrack ros2 run my_package my_node

# Let run, then Ctrl+C

# Analyze with GUI
heaptrack_gui heaptrack.my_node.*.gz
```

heaptrack GUI shows:
- Allocation flamegraph (where memory is allocated)
- Temporary allocations (allocated and freed)
- Peak memory usage
- Leak locations

**Step 4: Analyze Common Causes**

**Common ROS2 memory leaks:**

1. **QoS KEEP_ALL with TRANSIENT_LOCAL:**
   ```cpp
   // LEAK: Stores all messages forever
   auto qos = rclcpp::QoS(rclcpp::KeepAll()).transient_local();
   ```
   Fix: Use `KEEP_LAST` with reasonable depth.

2. **Containers growing without bounds:**
   ```cpp
   // LEAK: Never cleared
   std::vector<Image> history_;
   void callback(const Image::SharedPtr msg) {
       history_.push_back(*msg);
   }
   ```
   Fix: Use deque with size limit.

3. **Circular shared_ptr references:**
   ```cpp
   // LEAK: self=shared_from_this() creates cycle
   timer_ = create_wall_timer(1s, [this, self=shared_from_this()]() { ... });
   ```
   Fix: Remove unnecessary `shared_from_this()`.

4. **Not destroying subscribers/publishers:**
   ```cpp
   // LEAK: Creating new subscriber in loop
   while (rclcpp::ok()) {
       auto sub = create_subscription<>(...);  // Never destroyed!
   }
   ```
   Fix: Store subscribers as member variables.

**Step 5: Verify Fix**

After fixing:

```bash
# Run with heaptrack again
heaptrack ros2 run my_package my_node

# Check memory stabilizes
```

**Summary:**
1. Confirm leak with `ps` monitoring
2. Profile with Valgrind or heaptrack
3. Analyze allocation sites
4. Fix common causes (QoS, containers, shared_ptr cycles)
5. Verify fix

---

### Question 5: What is the difference between using `ros2 topic echo` and `rqt_plot` for monitoring topics?

**Difficulty:** ⭐ (Easy)

**Answer:**

**`ros2 topic echo`:**
- **Text-based** output in terminal
- Shows **full message contents** (all fields)
- Best for:
  - Inspecting message structure
  - Debugging message content
  - Scripting (can parse output with `grep`, `awk`)
  - Quick verification

**Example:**
```bash
$ ros2 topic echo /scan
header:
  stamp:
    sec: 1676543210
    nanosec: 123456789
  frame_id: laser_frame
angle_min: -1.570796
angle_max: 1.570796
ranges: [0.5, 0.6, 0.7, ...]
```

**`rqt_plot`:**
- **Graphical** real-time plotting
- Shows **numeric fields** as time-series graphs
- Best for:
  - Visualizing trends over time
  - Comparing multiple values
  - Detecting oscillations or instability
  - Monitoring control loops

**Example:**
```bash
# Plot odometry position
ros2 run rqt_plot rqt_plot /odom/pose/pose/position/x /odom/pose/pose/position/y
```

Shows X/Y position as lines on a graph.

**Comparison:**

| Feature | ros2 topic echo | rqt_plot |
|---------|----------------|-----------|
| Output | Text | Graph |
| Data shown | All fields | Numeric fields only |
| Temporal view | Scrolling messages | Time-series plot |
| Use case | Debugging messages | Monitoring trends |
| Filtering | grep/awk | Plot multiple fields |
| Overhead | Low | Medium (GUI) |

**When to use:**
- **echo:** Verify message content, check for errors, inspect strings/arrays
- **rqt_plot:** Monitor sensor values, visualize control loops, detect drift

---

### Question 6: How would you investigate high CPU usage in a ROS2 node?

**Difficulty:** ⭐⭐ (Medium)

**Answer:**

**Step 1: Identify the Problem**

```bash
# Check CPU usage
top -p $(pgrep -f my_node)

# Or htop
htop -p $(pgrep -f my_node)
```

Look for consistent high CPU (e.g., 95-100%).

**Step 2: Profile with perf**

```bash
# Record CPU profile for 10 seconds
perf record -F 99 -p $(pgrep -f my_node) sleep 10

# Generate report
perf report
```

**perf output example:**

```
Overhead  Command  Symbol
  45.23%  my_node  MyNode::expensive_computation()
  23.45%  my_node  cv::Mat::convertTo()
  12.34%  my_node  std::vector::push_back()
```

This shows 45% of CPU time is in `expensive_computation()`.

**Step 3: Analyze Common Causes**

1. **Busy-waiting in callback:**
   ```cpp
   // BAD: Blocks executor thread
   void callback(const Message::SharedPtr msg) {
       while (!condition) {
           std::this_thread::sleep_for(10ms);  // Busy-wait!
       }
   }
   ```
   Fix: Use proper synchronization (condition variables).

2. **Expensive computation in callback:**
   ```cpp
   // BAD: Heavy processing blocks other callbacks
   void callback(const Image::SharedPtr msg) {
       auto processed = expensive_image_processing(msg);  // Takes 500ms!
       pub_->publish(processed);
   }
   ```
   Fix: Offload to separate thread or use callback groups.

3. **Spinning too fast:**
   ```cpp
   // BAD: Spin without delay
   while (rclcpp::ok()) {
       rclcpp::spin_some(node);
       // No delay - 100% CPU!
   }
   ```
   Fix: Use `rclcpp::spin()` or add delays.

4. **Inefficient algorithms:**
   ```cpp
   // BAD: O(n²) in hot path
   for (const auto &a : points) {
       for (const auto &b : points) {
           distance(a, b);  // Called n² times!
       }
   }
   ```
   Fix: Optimize algorithm (use spatial data structures).

**Step 4: Instrument Code**

Add profiling to identify slow sections:

```cpp
#include <chrono>

void callback(const Message::SharedPtr msg) {
    auto start = std::chrono::steady_clock::now();

    // Section 1
    process_part1(msg);
    auto t1 = std::chrono::steady_clock::now();
    RCLCPP_DEBUG(get_logger(), "Part 1: %ld ms",
        std::chrono::duration_cast<std::chrono::milliseconds>(t1 - start).count());

    // Section 2
    process_part2(msg);
    auto t2 = std::chrono::steady_clock::now();
    RCLCPP_DEBUG(get_logger(), "Part 2: %ld ms",
        std::chrono::duration_cast<std::chrono::milliseconds>(t2 - t1).count());
}
```

**Step 5: Optimize**

Based on findings:
- Move heavy computation to separate thread
- Use callback groups for parallelism
- Optimize algorithms (better complexity)
- Reduce message processing frequency
- Use more efficient data structures

**Verification:**

```bash
# After optimization
top -p $(pgrep -f my_node)
# CPU should be lower (e.g., 30% instead of 95%)
```

---

### Question 7: What are the key differences between debugging a ROS2 node in a simulation vs. on real hardware?

**Difficulty:** ⭐⭐ (Medium)

**Answer:**

**Simulation-Specific Issues:**

1. **Simulated Time (`use_sim_time`):**
   - Must set `use_sim_time: true` for all nodes
   - Simulation publishes `/clock` topic
   - Time may not advance if simulation is paused
   - **Debug:**
     ```bash
     ros2 param get /my_node use_sim_time
     ros2 topic echo /clock
     ```

2. **Perfect Sensors:**
   - Simulated sensors have no noise (unless explicitly added)
   - Can lead to algorithms that work in sim but fail on hardware
   - **Solution:** Add realistic noise models to simulation

3. **Collision Detection:**
   - Simulation may allow impossible physics (tunneling through walls)
   - **Debug:** Visualize in RViz, check collision meshes in URDF

4. **Performance Differences:**
   - Simulation may run slower or faster than real-time
   - **Debug:** Check TF timestamps, monitor simulation real-time factor

**Real Hardware Issues:**

1. **Sensor Noise and Failures:**
   - Hardware sensors have noise, dropouts, calibration errors
   - **Debug:** Plot raw sensor data, check for outliers
     ```bash
     ros2 run rqt_plot rqt_plot /scan/ranges[0]
     ```

2. **Timing and Latency:**
   - Real hardware has communication delays (USB, Ethernet)
   - May miss real-time deadlines
   - **Debug:** Monitor message timestamps vs. system time
     ```bash
     ros2 topic echo /camera/image_raw --field header.stamp
     ```

3. **Power and Thermal Issues:**
   - Batteries drain, CPU throttles when hot
   - **Debug:** Monitor battery voltage, CPU frequency

4. **Network Issues:**
   - WiFi dropouts, Ethernet cable faults
   - **Debug:** Use `ros2 doctor`, check network connectivity
     ```bash
     ping <robot_ip>
     ros2 multicast send/receive
     ```

5. **Hardware Failures:**
   - Motors burn out, sensors die, cables disconnect
   - **Debug:** Check hardware status, test individual components

**Debugging Workflow Differences:**

| Aspect | Simulation | Real Hardware |
|--------|-----------|---------------|
| Reproducibility | High (deterministic) | Low (non-deterministic) |
| Safety | Safe to crash | Risk of damage |
| Debugging tools | Full GDB, Valgrind | Limited (embedded systems) |
| Time control | Can pause/slow down | Real-time only |
| Sensors | Perfect (no noise) | Noisy, can fail |
| Iteration speed | Fast (restart quickly) | Slow (re-deploy code) |

**Best Practices:**

1. **Develop in simulation first** (faster iteration)
2. **Add realistic noise/failures** to simulation
3. **Log extensively** on hardware for post-mortem analysis
4. **Use rosbag** to record hardware data for replay in simulation
5. **Test incrementally** on hardware (sensor → perception → control)
6. **Have hardware watchdogs** (e-stop, timeout monitors)

---

### Question 8: How would you use `ros2 trace` to diagnose DDS-level performance issues?

**Difficulty:** ⭐⭐⭐ (Hard)

**Answer:**

`ros2 trace` uses LTTng (Linux Trace Toolkit) to record low-level ROS2 events including DDS message passing, callback execution, and timer events.

**Step 1: Start Tracing**

```bash
# Install tracing tools
sudo apt install ros-humble-ros2trace ros-humble-tracetools-analysis

# Start trace session
ros2 trace

# Or specify session name
ros2 trace -s my_session

# Or trace specific nodes
ros2 trace -s my_session my_node_name
```

**Step 2: Run Workload**

While tracing is active, run your ROS2 application:

```bash
# In another terminal
ros2 launch my_package my_launch.py

# Let run for 30 seconds to capture data

# Stop tracing (Ctrl+C in trace terminal)
```

**Step 3: Analyze Trace**

```bash
# Analyze trace data
ros2 trace analyze ~/.ros/tracing/my_session
```

**Analysis output includes:**

1. **Callback Duration Statistics:**
   ```
   Callback                     Count    Mean (ms)    Std Dev    Max (ms)
   /my_node::timer_callback     1000     2.34         0.45       5.67
   /my_node::scan_callback      500      12.45        3.21       45.23
   ```

2. **Message Latency:**
   ```
   Topic             Publisher     Subscriber    Mean Latency (ms)
   /camera/image_raw /camera_node  /processor    15.23
   /cmd_vel          /planner      /controller   2.34
   ```

3. **DDS Events:**
   - Time spent in serialization/deserialization
   - Network transmission time
   - Queue delays

**Step 4: Visualize with Trace Compass**

```bash
# Install Trace Compass
sudo apt install tracecompass

# Open trace
tracecompass ~/.ros/tracing/my_session
```

Trace Compass shows:
- Timeline view of all callbacks
- CPU usage per thread
- Message flow between nodes
- Callback execution overlaps

**Common Issues Detected:**

1. **Long Callback Duration:**
   - Callback taking > 100ms blocks executor
   - **Solution:** Offload to separate thread or callback group

2. **High Serialization Overhead:**
   - Large messages take long to serialize
   - **Solution:** Use zero-copy (intra-process), compress data, or reduce message size

3. **Queue Delays:**
   - Messages waiting in QoS queue
   - **Solution:** Increase queue depth or use faster processing

4. **Callback Starvation:**
   - Low-priority callbacks never execute
   - **Solution:** Use MultiThreadedExecutor or separate callback groups

**Example Workflow:**

```bash
# Trace for 30 seconds
ros2 trace -s perf_test &
TRACE_PID=$!
sleep 30
kill $TRACE_PID

# Analyze
ros2 trace analyze ~/.ros/tracing/perf_test

# Look for:
# - Callbacks with mean > 10ms (blocking executor)
# - High std dev (jitter)
# - Max latency > 100ms (real-time violations)
```

**Advanced: Custom Trace Points**

You can add custom trace points in your code:

```cpp
#include <tracetools/tracetools.h>

void my_function() {
    TRACEPOINT(my_package, my_function_entry);

    // ... do work ...

    TRACEPOINT(my_package, my_function_exit);
}
```

**Summary:**

`ros2 trace` is invaluable for:
- Measuring callback execution times
- Identifying DDS serialization overhead
- Detecting message latency
- Visualizing system timeline
- Finding real-time violations

**Limitations:**
- Requires LTTng (Linux only)
- High overhead (can slow system)
- Complex to interpret raw data (use Trace Compass)

---

## Practice Tasks

### Practice Task 1: Implement a System Health Dashboard

**Objective:** Create a comprehensive monitoring system that tracks node health, topic activity, and system resources.

**Requirements:**

1. **Node Health Monitoring:**
   - Monitor a configurable list of critical nodes
   - Detect when nodes crash or stop responding
   - Track node uptime

2. **Topic Activity Monitoring:**
   - Monitor publication rates for critical topics
   - Alert when topic rate drops below threshold
   - Detect stale messages (old timestamps)

3. **System Resource Monitoring:**
   - Track CPU usage per node
   - Track total memory usage
   - Track disk usage
   - Monitor network bandwidth

4. **Alerting:**
   - Publish diagnostic messages to `/diagnostics`
   - Log warnings/errors for anomalies
   - Support configurable alert thresholds

5. **Dashboard:**
   - Create a simple web dashboard (optional: use Flask/FastAPI)
   - Display status of all monitored components
   - Show historical trends (past 1 hour)

**Expected Architecture:**

```
SystemHealthMonitor (Node)
  ├─ NodeMonitor (tracks nodes)
  ├─ TopicMonitor (tracks topics)
  ├─ ResourceMonitor (tracks CPU/mem)
  └─ DiagnosticsPublisher (publishes to /diagnostics)
```

**Testing:**

```bash
# Start monitor
ros2 run my_package system_health_monitor --ros-args \
    -p monitor_nodes:="['/robot_state_publisher', '/camera_node']" \
    -p monitor_topics:="['/scan', '/cmd_vel']"

# View diagnostics
ros2 topic echo /diagnostics

# Simulate failure
# Kill a monitored node and verify alert is triggered
```

**Bonus:**
- Add historical data storage (SQLite)
- Create email/Slack notifications for critical failures
- Implement automatic node restart on failure

---

### Practice Task 2: Build a Performance Bottleneck Analyzer

**Objective:** Create a tool that automatically identifies performance bottlenecks in a running ROS2 system.

**Requirements:**

1. **Automated Profiling:**
   - Profile callback execution times for all nodes (using `ros2 trace` or custom instrumentation)
   - Measure topic publication rates and bandwidth
   - Track CPU usage per node

2. **Bottleneck Detection:**
   - Identify callbacks with execution time > 50ms
   - Detect topics with rate < 50% of expected
   - Find nodes using > 80% CPU

3. **Analysis Report:**
   - Generate markdown report with findings
   - Include statistics: mean, P95, P99, max
   - Provide recommendations (e.g., "Use callback groups for parallelism")

4. **Integration:**
   - Run as command: `ros2 run my_package analyze_performance --duration 60`
   - Output report to file: `performance_report.md`

**Expected Output:**

```markdown
# ROS2 Performance Analysis Report

**Analysis Duration:** 60 seconds
**Timestamp:** 2025-02-10 14:30:00

## Bottlenecks Detected

### 1. Slow Callback: /image_processor::process_image
- **Mean execution time:** 125.3 ms
- **P99:** 250.1 ms
- **Recommendation:** Offload processing to separate thread or use callback groups

### 2. Low Topic Rate: /camera/image_raw
- **Expected:** 30 Hz
- **Actual:** 12.3 Hz
- **Recommendation:** Check camera driver or increase processing speed

### 3. High CPU Usage: /map_builder
- **CPU Usage:** 94.2%
- **Recommendation:** Optimize mapping algorithm or use more efficient data structures

## Summary
- **Total callbacks analyzed:** 15
- **Slow callbacks:** 3
- **Low-rate topics:** 2
- **High-CPU nodes:** 1
```

**Testing:**

```bash
# Analyze performance
ros2 run my_package analyze_performance --duration 60 --output report.md

# View report
cat report.md
```

**Bonus:**
- Integrate with CI/CD to detect performance regressions
- Add flamegraph generation
- Support distributed systems (multiple machines)

---

### Practice Task 3: Create a Network Diagnostics Tool for Multi-Machine ROS2

**Objective:** Build a tool that diagnoses discovery and connectivity issues in multi-machine ROS2 deployments.

**Requirements:**

1. **Discovery Testing:**
   - Test multicast connectivity between machines
   - Verify nodes on different machines can discover each other
   - Check ROS_DOMAIN_ID consistency

2. **Network Quality:**
   - Measure latency between machines (ping-style)
   - Measure bandwidth for ROS2 messages
   - Detect packet loss

3. **Configuration Checks:**
   - Verify firewall rules (UDP ports 7400-7500 for Fast DDS)
   - Check network interface configuration
   - Verify RMW implementation consistency

4. **Automated Repair:**
   - Suggest fixes for common issues (e.g., "Enable multicast on eth0")
   - Optionally apply fixes (e.g., add firewall rules)

**Expected Usage:**

```bash
# On Machine 1
ros2 run my_package network_diagnostics --mode server

# On Machine 2
ros2 run my_package network_diagnostics --mode client --server-ip 192.168.1.100

# Output:
# [OK] Multicast connectivity: PASS
# [OK] ROS_DOMAIN_ID: 0 (consistent)
# [WARNING] Firewall may block UDP ports 7400-7500
#   Suggestion: sudo ufw allow 7400:7500/udp
# [OK] Latency: 2.3 ms (good)
# [ERROR] Packet loss: 5.2% (high)
#   Suggestion: Check network cable or WiFi signal strength
```

**Components:**

1. **MulticastTester:**
   - Send multicast packets and verify receipt
   - Implement using raw UDP sockets on 224.0.0.0/4

2. **LatencyTester:**
   - Send timestamp messages and measure round-trip
   - Use ROS2 service for bidirectional communication

3. **ConfigurationChecker:**
   - Read `/proc/net/dev` for interface stats
   - Check `iptables` rules
   - Verify `ROS_DOMAIN_ID` environment variable

4. **ReportGenerator:**
   - Summarize findings
   - Provide actionable recommendations

**Testing:**

```bash
# Test with working configuration
ros2 run my_package network_diagnostics

# Test with multicast disabled (simulate issue)
sudo ip link set eth0 multicast off
ros2 run my_package network_diagnostics
# Should detect multicast issue

# Re-enable and verify fix
sudo ip link set eth0 multicast on
ros2 run my_package network_diagnostics
# Should pass
```

**Bonus:**
- Add automated discovery server setup for environments without multicast
- Create web UI to visualize network topology
- Support testing between > 2 machines simultaneously

---

## Quick Reference

### Essential Debugging Commands

```bash
# Node introspection
ros2 node list                      # List all nodes
ros2 node info /my_node             # Show node details
ros2 node info /my_node --verbose   # Include QoS settings

# Topic introspection
ros2 topic list                     # List all topics
ros2 topic echo /my_topic           # Print messages
ros2 topic hz /my_topic             # Show publication rate
ros2 topic bw /my_topic             # Show bandwidth
ros2 topic info /my_topic --verbose # Show QoS and connections

# Service introspection
ros2 service list                   # List all services
ros2 service call /my_service std_srvs/srv/Empty  # Call service

# Parameter introspection
ros2 param list /my_node            # List parameters
ros2 param get /my_node param_name  # Get parameter value
ros2 param set /my_node param_name value  # Set parameter

# System diagnostics
ros2 doctor                         # Run health checks
ros2 doctor --report                # Detailed report

# Logging
export RCUTILS_CONSOLE_MIN_SEVERITY=DEBUG  # Set log level
export RCUTILS_CONSOLE_OUTPUT_FORMAT="[{severity}] {message}"  # Custom format
```

### Performance Profiling Commands

```bash
# Message rate and bandwidth
ros2 topic hz /scan
ros2 topic bw /camera/image_raw

# CPU profiling
top -p $(pgrep -f my_node)
perf record -F 99 -p $(pgrep -f my_node) sleep 30
perf report

# Memory profiling
heaptrack ros2 run my_package my_node
heaptrack_gui heaptrack.my_node.*.gz
valgrind --leak-check=full ros2 run my_package my_node

# ROS2 tracing
ros2 trace -s my_session
ros2 trace analyze ~/.ros/tracing/my_session
```

### GDB Debugging Commands

```bash
# Start node under GDB
ros2 run --prefix 'gdb -ex run --args' my_package my_node

# Attach to running process
gdb -p $(pgrep -f my_node)

# Common GDB commands
(gdb) break MyNode::callback     # Set breakpoint
(gdb) continue                   # Continue execution
(gdb) next                       # Step over
(gdb) step                       # Step into
(gdb) print variable             # Print variable
(gdb) backtrace                  # Show call stack
(gdb) info threads               # Show all threads
```

### Troubleshooting Workflow

**Problem: Node not receiving messages**
1. `ros2 topic list | grep /my_topic`
2. `ros2 topic info /my_topic --verbose` (check QoS)
3. `ros2 topic hz /my_topic` (check rate)
4. `ros2 topic echo /my_topic` (verify content)
5. `ros2 node info /my_node` (verify subscription)

**Problem: Discovery failure**
1. `echo $ROS_DOMAIN_ID` (check consistency)
2. `ros2 doctor` (check multicast)
3. `ros2 multicast receive/send` (test multicast)
4. `sudo ufw status` (check firewall)

**Problem: Performance issue**
1. `ros2 topic hz/bw` (check message flow)
2. `top -p $(pgrep -f my_node)` (check CPU/memory)
3. `perf record/report` (profile CPU)
4. `heaptrack` (profile memory)

### rqt Tools

```bash
ros2 run rqt_graph rqt_graph               # Visualize computation graph
ros2 run rqt_console rqt_console           # Log viewer
ros2 run rqt_plot rqt_plot                 # Real-time plotting
ros2 run rqt_topic rqt_topic               # Topic monitor
ros2 run rqt_service_caller rqt_service_caller  # Service caller
ros2 run rqt_reconfigure rqt_reconfigure   # Dynamic reconfigure
ros2 run rqt_runtime_monitor rqt_runtime_monitor  # Diagnostics viewer
```

### Logging Configuration

```bash
# Log levels
ros2 run my_package my_node --ros-args --log-level DEBUG
ros2 run my_package my_node --ros-args --log-level INFO
ros2 run my_package my_node --ros-args --log-level WARN

# Custom log format
export RCUTILS_CONSOLE_OUTPUT_FORMAT="[{time}] [{severity}] [{name}]: {message}"

# Log to file
ros2 run my_package my_node 2>&1 | tee logfile.txt
```

### Network Configuration

```bash
# Check multicast support
ip link show eth0                  # Look for "MULTICAST"
sudo ip link set eth0 multicast on # Enable multicast

# Check firewall (Fast DDS uses UDP 7400-7500)
sudo ufw status
sudo ufw allow 7400:7500/udp

# Test multicast
ros2 multicast receive  # Terminal 1
ros2 multicast send     # Terminal 2

# Discovery server (for non-multicast networks)
ros2 run ros_discovery_server discovery_server  # Server
export ROS_DISCOVERY_SERVER=192.168.1.100:11811 # Clients
```

---

## Summary

This topic covered the essential debugging and introspection tools for ROS2 development:

1. **CLI Tools:** `ros2 node`, `ros2 topic`, `ros2 service`, `ros2 param` for runtime introspection
2. **System Diagnostics:** `ros2 doctor` for automated health checks
3. **Logging:** RCUTILS logging system with configurable levels and formats
4. **rqt Tools:** Graphical tools for visualization and monitoring
5. **Performance Profiling:** Using `ros2 topic hz/bw`, `perf`, `heaptrack`, and `ros2 trace`
6. **GDB Debugging:** Debugging C++ nodes with breakpoints and stack traces
7. **Troubleshooting Workflows:** Systematic approaches to common issues
8. **Edge Cases:** Silent failures, network issues, time sync, memory leaks

**Key Takeaways:**
- Use systematic troubleshooting workflows (don't guess randomly)
- Start with high-level tools (`ros2 topic`, `ros2 doctor`), then drill down to profiling
- Profile before optimizing (measure, don't assume)
- Understand QoS policies (many issues stem from QoS mismatches)
- Use visualization tools (`rqt_graph`, `rqt_plot`) for intuition
- Monitor system health proactively (don't wait for failures)

**Next Steps:**
- Practice using each tool on a real system
- Build custom diagnostic nodes for your application
- Set up automated health monitoring in production
- Create performance benchmarks for regression testing
