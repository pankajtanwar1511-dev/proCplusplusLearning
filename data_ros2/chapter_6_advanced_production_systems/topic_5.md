# Chapter 6: Advanced Production Systems
## Topic 6.5: Multi-Robot Systems & Coordination

---

## THEORY

### 1. Why Multi-Robot Systems?

**Multi-robot systems** involve multiple robots working together to accomplish tasks.

**Use Cases:**
- **Warehouse automation**: Multiple robots moving goods
- **Search and rescue**: Swarm exploration
- **Manufacturing**: Collaborative assembly
- **Agriculture**: Fleet of harvesting robots
- **Surveillance**: Distributed monitoring

**Benefits:**
✅ **Parallelism**: Multiple tasks simultaneously
✅ **Redundancy**: System continues if one robot fails
✅ **Scalability**: Add more robots to increase throughput
✅ **Coverage**: Larger area coverage

**Challenges:**
❌ **Coordination**: Avoid collisions, synchronize tasks
❌ **Communication**: Network bandwidth, latency
❌ **Naming conflicts**: Topic/node name collisions
❌ **Discovery**: Robots finding each other

---

### 2. Robot Separation Strategies

**Problem:**

Multiple robots, each running same software:

```
Robot A: /camera/image, /cmd_vel, /odom
Robot B: /camera/image, /cmd_vel, /odom

Topic collision! Which robot's camera? Which cmd_vel?
```

---

**Strategy 1: Namespacing**

Prefix all topics/nodes with robot name:

```
Robot A: /robot_a/camera/image, /robot_a/cmd_vel, /robot_a/odom
Robot B: /robot_b/camera/image, /robot_b/cmd_vel, /robot_b/odom

No collisions! ✓
```

**Implementation:**

```python
# Launch file for robot A
def generate_launch_description():
    return LaunchDescription([
        Node(
            package='my_robot',
            executable='robot_node',
            name='robot_node',
            namespace='robot_a',  # ← Namespace
            parameters=[{'robot_id': 'robot_a'}]
        )
    ])
```

**Effect:**

```
# Without namespace:
/robot_node/camera/image

# With namespace='robot_a':
/robot_a/robot_node/camera/image
```

---

**Strategy 2: Domain IDs**

Use **DDS Domain ID** to isolate robots on different networks:

```
Robot A: ROS_DOMAIN_ID=0
Robot B: ROS_DOMAIN_ID=1

Robots on different domains CAN'T communicate (network isolation)
```

**When to use:**
- Multiple robot systems on same physical network
- Want complete isolation (testing, safety)
- Different robot fleets that shouldn't interact

**Example:**

```bash
# Terminal 1 (Robot A)
export ROS_DOMAIN_ID=0
ros2 run my_pkg robot_node

# Terminal 2 (Robot B)
export ROS_DOMAIN_ID=1
ros2 run my_pkg robot_node

# Terminal 3 (List topics for domain 0)
export ROS_DOMAIN_ID=0
ros2 topic list

# Terminal 4 (List topics for domain 1)
export ROS_DOMAIN_ID=1
ros2 topic list
```

Robots on different domains **don't see each other's topics**.

---

**Strategy 3: Hybrid (Namespace + Domain ID)**

```
Fleet 1 (Warehouse A):
  Domain ID: 0
  Robots: /robot_a1/..., /robot_a2/..., /robot_a3/...

Fleet 2 (Warehouse B):
  Domain ID: 1
  Robots: /robot_b1/..., /robot_b2/..., /robot_b3/...

Complete isolation between fleets, namespacing within fleet
```

---

### 3. Multi-Robot Communication Patterns

**Pattern 1: Centralized Coordination**

**Architecture:**

```
         ┌───────────────┐
         │  Fleet Manager │
         │  (Coordinator)  │
         └────────┬────────┘
                  │
      ┌───────────┼───────────┐
      │           │           │
 ┌────▼────┐ ┌───▼─────┐ ┌──▼──────┐
 │ Robot 1 │ │ Robot 2 │ │ Robot 3 │
 └─────────┘ └─────────┘ └─────────┘
```

**Coordinator assigns tasks to robots.**

**Example:**

```python
class FleetManager(Node):
    def __init__(self):
        super().__init__('fleet_manager')

        # Subscribe to robot statuses
        self.create_subscription(RobotStatus, '/robot_1/status', self.robot1_callback, 10)
        self.create_subscription(RobotStatus, '/robot_2/status', self.robot2_callback, 10)

        # Task assignment clients
        self.task_client_1 = self.create_client(AssignTask, '/robot_1/assign_task')
        self.task_client_2 = self.create_client(AssignTask, '/robot_2/assign_task')

    def assign_tasks(self, tasks):
        # Assign task 1 to robot 1
        request = AssignTask.Request()
        request.task = tasks[0]
        self.task_client_1.call_async(request)

        # Assign task 2 to robot 2
        request = AssignTask.Request()
        request.task = tasks[1]
        self.task_client_2.call_async(request)
```

**Pros:**
✅ Simple coordination
✅ Easy to implement
✅ Global optimization possible

**Cons:**
❌ Single point of failure
❌ Scalability limited (coordinator bottleneck)
❌ High network load (all comm through coordinator)

---

**Pattern 2: Decentralized (Peer-to-Peer)**

**Architecture:**

```
 ┌─────────┐      ┌─────────┐
 │ Robot 1 │◄────►│ Robot 2 │
 └────▲────┘      └────▲────┘
      │                │
      │           ┌────▼────┐
      └──────────►│ Robot 3 │
                  └─────────┘
```

**Robots communicate directly, make decisions collaboratively.**

**Example:**

```python
class DecentralizedRobot(Node):
    def __init__(self):
        super().__init__('robot')

        # Publish own status
        self.status_pub = self.create_publisher(RobotStatus, '~/status', 10)

        # Subscribe to all other robots' status
        self.create_subscription(RobotStatus, '/robot_1/status', self.peer_callback, 10)
        self.create_subscription(RobotStatus, '/robot_2/status', self.peer_callback, 10)
        self.create_subscription(RobotStatus, '/robot_3/status', self.peer_callback, 10)

        self.peers = {}

    def peer_callback(self, msg):
        # Update peer information
        self.peers[msg.robot_id] = msg

        # Make distributed decision based on peer states
        self.coordinate_with_peers()

    def coordinate_with_peers(self):
        # Distributed task allocation, collision avoidance, etc.
        pass
```

**Pros:**
✅ No single point of failure
✅ Scales better
✅ Lower coordinator load

**Cons:**
❌ More complex
❌ Harder to debug
❌ Consensus algorithms needed

---

**Pattern 3: Hybrid (Leader Election)**

```
Start: Decentralized
↓
Elect leader
↓
Leader coordinates (centralized)
↓
Leader fails?
↓
Re-elect new leader
```

**Example: Raft Consensus**

---

### 4. Task Allocation

**Problem:**

5 tasks, 3 robots. How to assign?

**Approaches:**

---

**Approach 1: Greedy Assignment**

Assign each task to nearest available robot.

```python
class TaskAllocator:
    def allocate(self, tasks, robots):
        assignments = {}

        for task in tasks:
            # Find nearest available robot
            nearest_robot = min(
                robots,
                key=lambda r: distance(r.position, task.position)
            )

            assignments[task.id] = nearest_robot.id
            robots.remove(nearest_robot)  # Mark as busy

        return assignments
```

**Pros:** Simple, fast
**Cons:** Not optimal (local minima)

---

**Approach 2: Auction-Based**

Robots "bid" for tasks based on cost.

```python
class AuctionAllocator:
    def allocate(self, tasks, robots):
        assignments = {}

        for task in tasks:
            bids = {}

            # Each robot bids
            for robot in robots:
                cost = robot.compute_cost(task)
                bids[robot.id] = cost

            # Assign to lowest bidder
            winner = min(bids, key=bids.get)
            assignments[task.id] = winner

        return assignments
```

**Pros:** More optimal, distributed
**Cons:** Requires bidding protocol, coordination overhead

---

**Approach 3: Optimization (MILP)**

Mixed-Integer Linear Programming for global optimal.

```python
import pulp

def optimize_assignment(tasks, robots):
    # Decision variables: x[i,j] = 1 if robot i assigned to task j
    x = pulp.LpVariable.dicts("assign",
                               ((i, j) for i in robots for j in tasks),
                               cat='Binary')

    # Objective: minimize total cost
    problem = pulp.LpProblem("TaskAllocation", pulp.LpMinimize)
    problem += pulp.lpSum(cost(i, j) * x[i, j]
                          for i in robots for j in tasks)

    # Constraint: each task assigned to exactly one robot
    for j in tasks:
        problem += pulp.lpSum(x[i, j] for i in robots) == 1

    # Solve
    problem.solve()

    # Extract assignments
    assignments = {j: i for i in robots for j in tasks if x[i, j].value() == 1}
    return assignments
```

**Pros:** Globally optimal
**Cons:** Computationally expensive, centralized

---

### 5. Collision Avoidance

**Problem:**

Multiple robots navigating in shared space can collide.

---

**Approach 1: Priority-Based**

Assign priority to robots (e.g., by ID).

```python
class PriorityCollisionAvoidance:
    def __init__(self, robot_id, all_robot_ids):
        self.robot_id = robot_id
        self.priority = all_robot_ids.index(robot_id)

    def should_yield(self, other_robot_id, all_robot_ids):
        other_priority = all_robot_ids.index(other_robot_id)

        # Lower ID = higher priority
        return self.priority > other_priority

    def navigate(self, goal):
        # Check for nearby robots
        nearby_robots = self.detect_nearby_robots()

        for other in nearby_robots:
            if self.should_yield(other.id, self.all_robot_ids):
                # Yield: stop or slow down
                self.stop()
                return

        # No yielding needed, proceed
        self.navigate_to_goal(goal)
```

**Pros:** Simple, deadlock-free (strict ordering)
**Cons:** Unfair (low-priority robots starve)

---

**Approach 2: Reservation-Based**

Robots reserve space-time cells.

```
Grid:
  ┌───┬───┬───┐
  │ 1 │   │   │  t=0
  ├───┼───┼───┤
  │   │ 2 │   │  t=0
  ├───┼───┼───┤
  │   │   │   │
  └───┴───┴───┘

Robot 1 reserves cell (0,0) at t=0, (1,0) at t=1
Robot 2 reserves cell (1,1) at t=0, (1,0) at t=2

Conflict at cell (1,0)!
  Robot 1 at t=1
  Robot 2 at t=2
  → No conflict (different times) ✓
```

**Implementation:**

```python
class ReservationTable:
    def __init__(self):
        self.reservations = {}  # (x, y, t) -> robot_id

    def reserve(self, x, y, t, robot_id):
        key = (x, y, t)

        if key in self.reservations:
            return False  # Conflict

        self.reservations[key] = robot_id
        return True

    def plan_path(self, robot_id, start, goal):
        path = []
        current = start
        t = 0

        while current != goal:
            next_cell = self.compute_next(current, goal)

            if self.reserve(next_cell.x, next_cell.y, t, robot_id):
                path.append(next_cell)
                current = next_cell
                t += 1
            else:
                # Conflict, wait or replan
                t += 1

        return path
```

**Pros:** Collision-free guarantees
**Cons:** Requires global coordination, centralized table

---

**Approach 3: Velocity Obstacle**

Compute velocities that avoid collisions.

```python
class VelocityObstacle:
    def compute_safe_velocity(self, robot_pos, robot_vel, obstacles):
        candidate_velocities = self.sample_velocities()
        safe_velocities = []

        for vel in candidate_velocities:
            collision_free = True

            for obs in obstacles:
                if self.will_collide(robot_pos, vel, obs):
                    collision_free = False
                    break

            if collision_free:
                safe_velocities.append(vel)

        # Choose velocity closest to desired
        best_vel = min(safe_velocities,
                       key=lambda v: distance(v, robot_vel))

        return best_vel
```

**Pros:** Distributed, reactive
**Cons:** Local minima, oscillations

---

### 6. Discovery and Heartbeats

**Problem:**

How do robots know about each other?

---

**Approach 1: Static Configuration**

Hardcode robot list in configuration.

```yaml
# fleet_config.yaml
robots:
  - robot_1
  - robot_2
  - robot_3
```

**Pros:** Simple
**Cons:** Not dynamic (can't add/remove robots at runtime)

---

**Approach 2: Heartbeat Protocol**

Robots periodically announce presence.

```python
class HeartbeatPublisher(Node):
    def __init__(self, robot_id):
        super().__init__(f'{robot_id}_heartbeat')

        self.robot_id = robot_id

        # Publish heartbeat
        self.heartbeat_pub = self.create_publisher(Heartbeat, '/fleet/heartbeat', 10)

        self.timer = self.create_timer(1.0, self.publish_heartbeat)

    def publish_heartbeat(self):
        msg = Heartbeat()
        msg.robot_id = self.robot_id
        msg.timestamp = self.get_clock().now().to_msg()
        msg.status = 'ACTIVE'

        self.heartbeat_pub.publish(msg)


class HeartbeatMonitor(Node):
    def __init__(self):
        super().__init__('heartbeat_monitor')

        self.robots = {}  # robot_id -> last_heartbeat_time

        self.create_subscription(Heartbeat, '/fleet/heartbeat',
                                 self.heartbeat_callback, 10)

        self.timer = self.create_timer(5.0, self.check_alive)

    def heartbeat_callback(self, msg):
        self.robots[msg.robot_id] = self.get_clock().now()

    def check_alive(self):
        now = self.get_clock().now()
        timeout = rclpy.duration.Duration(seconds=10.0)

        dead_robots = []

        for robot_id, last_time in self.robots.items():
            if (now - last_time) > timeout:
                self.get_logger().warn(f'Robot {robot_id} is dead!')
                dead_robots.append(robot_id)

        # Remove dead robots
        for robot_id in dead_robots:
            del self.robots[robot_id]
```

**Pros:** Dynamic discovery, fault detection
**Cons:** Network overhead, heartbeat frequency tuning

---

**Approach 3: Service Discovery (ROS2 Built-in)**

Use ROS2's discovery mechanism to find nodes/topics.

```python
class RobotDiscovery(Node):
    def __init__(self):
        super().__init__('robot_discovery')

        self.discovered_robots = set()

        self.timer = self.create_timer(5.0, self.discover_robots)

    def discover_robots(self):
        # Get all node names
        node_names = self.get_node_names()

        # Filter robot nodes (e.g., nodes matching pattern)
        robot_nodes = [name for name in node_names if 'robot_' in name]

        for robot in robot_nodes:
            if robot not in self.discovered_robots:
                self.get_logger().info(f'Discovered robot: {robot}')
                self.discovered_robots.add(robot)
```

**Pros:** No custom protocol, leverages ROS2
**Cons:** Less control, depends on DDS discovery

---

### 7. Multi-Robot Namespacing Best Practices

**Best Practices:**

**1. Consistent Namespace Structure:**

```
/robot_{id}/
├── sensors/
│   ├── camera/image
│   ├── lidar/scan
│   └── imu/data
├── control/
│   ├── cmd_vel
│   └── odom
├── navigation/
│   ├── goal
│   └── path
└── status/
    └── heartbeat
```

**2. Use Robot-Specific TF Frames:**

```
robot_1:
  map → robot_1/odom → robot_1/base_link → robot_1/camera_link

robot_2:
  map → robot_2/odom → robot_2/base_link → robot_2/camera_link

Shared:
  world → map (if using shared map)
```

**3. Separate Fleet-Level Topics:**

```
# Per-robot topics (namespaced)
/robot_1/cmd_vel
/robot_2/cmd_vel

# Fleet-level topics (global, no namespace)
/fleet/task_assignments
/fleet/heartbeats
/fleet/collision_warnings
```

---

## EDGE_CASES

### Edge Case 1: Topic Name Collision Despite Namespaces

**Scenario:**

Two nodes in different robots subscribe to absolute topic names, bypassing namespaces.

```python
# Robot 1, namespaced as /robot_1
class Node1(Node):
    def __init__(self):
        super().__init__('node1', namespace='robot_1')

        # ❌ Absolute topic name (starts with /)
        self.sub = self.create_subscription(String, '/cmd_vel', self.callback, 10)
        # Subscribes to /cmd_vel (not /robot_1/cmd_vel!)

# Robot 2, namespaced as /robot_2
class Node2(Node):
    def __init__(self):
        super().__init__('node2', namespace='robot_2')

        # ❌ Also absolute topic
        self.sub = self.create_subscription(String, '/cmd_vel', self.callback, 10)
        # Also subscribes to /cmd_vel!

# Both robots listen to same /cmd_vel → collision!
```

**Why:**

Absolute topic names (starting with `/`) ignore namespaces.

**Solution: Use Relative Topics**

```python
# ✅ Relative topic name (no leading /)
self.sub = self.create_subscription(String, 'cmd_vel', self.callback, 10)

# Result:
# Robot 1: /robot_1/cmd_vel
# Robot 2: /robot_2/cmd_vel
# No collision! ✓
```

**Interview Insight:**
Absolute topic names (starting with `/`) bypass namespaces. Always use relative names in multi-robot systems. Check for `/` prefix in topic names.

---

### Edge Case 2: DDS Discovery Storms

**Scenario:**

Large fleet (50+ robots) on same network, DDS discovery overwhelms network.

```
50 robots, each with:
  - 10 topics
  - 5 services
  = 750 endpoints total

DDS discovery:
  - Every robot announces all endpoints
  - Every robot discovers all other endpoints
  - 50 × 750 = 37,500 discovery messages!

Network saturated!
```

**Why:**

DDS discovery is peer-to-peer multicast. Large fleets create broadcast storms.

**Solution 1: Use Different Domain IDs**

Split fleet into groups:

```
Group 1 (Robots 1-10):  Domain ID 0
Group 2 (Robots 11-20): Domain ID 1
Group 3 (Robots 21-30): Domain ID 2
...

Each group isolated, reduces discovery load.
```

**Solution 2: Static Discovery (Peer List)**

Disable multicast, use static peer list:

```xml
<!-- dds_config.xml -->
<dds>
  <profiles>
    <transport_descriptors>
      <transport_descriptor>
        <transport_id>udp_transport</transport_id>
        <type>UDPv4</type>
      </transport_descriptor>
    </transport_descriptors>

    <participant>
      <rtps>
        <builtin>
          <discovery_config>
            <leaseDuration>
              <sec>INFINITE</sec>
            </leaseDuration>
            <!-- Disable multicast -->
            <simple>
              <disable_multicast>true</disable_multicast>
            </simple>
            <!-- Static peer list -->
            <initialPeersList>
              <locator>
                <udpv4>
                  <address>192.168.1.10</address>
                  <port>7400</port>
                </udpv4>
              </locator>
              <locator>
                <udpv4>
                  <address>192.168.1.11</address>
                  <port>7400</port>
                </udpv4>
              </locator>
            </initialPeersList>
          </discovery_config>
        </builtin>
      </rtps>
    </participant>
  </profiles>
</dds>
```

**Solution 3: Fast DDS Discovery Server**

Use centralized discovery server:

```bash
# Start discovery server
fastdds discovery -i 0

# Configure robots to use discovery server
export ROS_DISCOVERY_SERVER="192.168.1.100:11811"
ros2 run my_pkg robot_node
```

**Interview Insight:**
Large fleets cause DDS discovery storms. Solutions: split into domain IDs, use static peer lists, or Fast DDS discovery server. Limit multicast discovery.

---

### Edge Case 3: Clock Synchronization Issues

**Scenario:**

Multi-robot sensor fusion requires synchronized timestamps.

```
Robot 1: Camera at t=10.000s
Robot 2: Lidar at t=10.050s

Difference: 50ms

For sensor fusion at 100 Hz (10ms period):
  50ms offset = 5 frames misalignment!
```

**Why:**

Robot clocks drift over time without synchronization.

**Solution 1: NTP (Network Time Protocol)**

```bash
# Install NTP
sudo apt install ntp

# Configure NTP server (central time source)
# /etc/ntp.conf
server ntp.local.network iburst

# Restart NTP
sudo systemctl restart ntp

# Check sync status
ntpq -p
```

**Solution 2: PTP (Precision Time Protocol)**

Higher precision (~microseconds):

```bash
# Install PTP
sudo apt install linuxptp

# Start PTP client
sudo ptp4l -i eth0 -m

# Typical sync: < 1μs
```

**Solution 3: ROS2 `/clock` Topic**

Use shared clock published by time server:

```python
# Time server
class TimeServer(Node):
    def __init__(self):
        super().__init__('time_server')

        self.clock_pub = self.create_publisher(Clock, '/clock', 10)

        self.timer = self.create_timer(0.01, self.publish_time)  # 100 Hz

    def publish_time(self):
        msg = Clock()
        msg.clock = self.get_clock().now().to_msg()
        self.clock_pub.publish(msg)


# Robots use /clock
class Robot(Node):
    def __init__(self):
        super().__init__('robot', parameter_overrides=[
            Parameter('use_sim_time', Parameter.Type.BOOL, True)
        ])

        # Now get_clock() uses /clock topic
```

**Interview Insight:**
Multi-robot systems need clock sync for sensor fusion and coordination. Use NTP (second-level), PTP (microsecond-level), or ROS2 `/clock` topic. Critical for distributed perception.

---

## CODE_EXAMPLES

### Example 1: Multi-Robot Launch with Namespaces

**File: `multi_robot.launch.py`**

```python
from launch import LaunchDescription
from launch_ros.actions import Node
from launch.actions import DeclareLaunchArgument, GroupAction
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import PushRosNamespace


def generate_robot_launch(robot_id):
    """Generate launch description for one robot."""
    return GroupAction([
        PushRosNamespace(robot_id),

        Node(
            package='my_robot',
            executable='robot_node',
            name='robot_node',
            parameters=[{
                'robot_id': robot_id,
                'max_speed': 1.0
            }],
            output='screen'
        ),

        Node(
            package='robot_state_publisher',
            executable='robot_state_publisher',
            name='robot_state_publisher',
            parameters=[{
                'robot_description': f'<robot name="{robot_id}">...</robot>',
                'frame_prefix': f'{robot_id}/'
            }]
        )
    ])


def generate_launch_description():
    return LaunchDescription([
        # Launch 3 robots
        generate_robot_launch('robot_1'),
        generate_robot_launch('robot_2'),
        generate_robot_launch('robot_3'),
    ])
```

**Result:**

```
Nodes:
  /robot_1/robot_node
  /robot_1/robot_state_publisher
  /robot_2/robot_node
  /robot_2/robot_state_publisher
  /robot_3/robot_node
  /robot_3/robot_state_publisher

Topics:
  /robot_1/cmd_vel
  /robot_1/odom
  /robot_2/cmd_vel
  /robot_2/odom
  /robot_3/cmd_vel
  /robot_3/odom
```

---

### Example 2: Fleet Coordinator

**File: `fleet_coordinator.py`**

```python
#!/usr/bin/env python3
import rclpy
from rclpy.node import Node
from geometry_msgs.msg import PoseStamped
from std_msgs.msg import String
from my_msgs.srv import AssignTask


class FleetCoordinator(Node):
    def __init__(self):
        super().__init__('fleet_coordinator')

        # Track robot states
        self.robots = {
            'robot_1': {'status': 'IDLE', 'position': None},
            'robot_2': {'status': 'IDLE', 'position': None},
            'robot_3': {'status': 'IDLE', 'position': None}
        }

        # Subscribe to robot statuses
        for robot_id in self.robots.keys():
            self.create_subscription(
                String,
                f'/{robot_id}/status',
                lambda msg, rid=robot_id: self.status_callback(msg, rid),
                10
            )

            self.create_subscription(
                PoseStamped,
                f'/{robot_id}/pose',
                lambda msg, rid=robot_id: self.pose_callback(msg, rid),
                10
            )

        # Task assignment clients
        self.task_clients = {}
        for robot_id in self.robots.keys():
            self.task_clients[robot_id] = self.create_client(
                AssignTask,
                f'/{robot_id}/assign_task'
            )

        # Incoming tasks
        self.create_subscription(
            String,
            '/fleet/new_task',
            self.new_task_callback,
            10
        )

        self.get_logger().info('Fleet coordinator started')

    def status_callback(self, msg, robot_id):
        self.robots[robot_id]['status'] = msg.data
        self.get_logger().info(f'{robot_id} status: {msg.data}')

    def pose_callback(self, msg, robot_id):
        self.robots[robot_id]['position'] = msg.pose

    def new_task_callback(self, msg):
        task_description = msg.data
        self.get_logger().info(f'New task received: {task_description}')

        # Find idle robot
        idle_robot = self.find_idle_robot()

        if idle_robot:
            self.assign_task(idle_robot, task_description)
        else:
            self.get_logger().warn('No idle robots available, queuing task')

    def find_idle_robot(self):
        for robot_id, state in self.robots.items():
            if state['status'] == 'IDLE':
                return robot_id
        return None

    def assign_task(self, robot_id, task):
        self.get_logger().info(f'Assigning task to {robot_id}: {task}')

        # Call task assignment service
        client = self.task_clients[robot_id]

        if not client.wait_for_service(timeout_sec=1.0):
            self.get_logger().error(f'{robot_id} task service not available')
            return

        request = AssignTask.Request()
        request.task_description = task

        future = client.call_async(request)
        future.add_done_callback(
            lambda f, rid=robot_id: self.task_response_callback(f, rid)
        )

    def task_response_callback(self, future, robot_id):
        try:
            response = future.result()
            if response.success:
                self.get_logger().info(f'{robot_id} accepted task')
            else:
                self.get_logger().error(f'{robot_id} rejected task: {response.message}')
        except Exception as e:
            self.get_logger().error(f'Task assignment failed: {e}')


def main(args=None):
    rclpy.init(args=args)
    coordinator = FleetCoordinator()
    rclpy.spin(coordinator)
    coordinator.destroy_node()
    rclpy.shutdown()


if __name__ == '__main__':
    main()
```

---

## INTERVIEW_QA

### Q1: How do you prevent topic name collisions in multi-robot systems?

**Difficulty:** ⭐⭐ (Easy)

**Answer:**

**Use Namespacing:**

Prefix all topics, nodes, and TF frames with robot-specific namespace.

**Implementation:**

```python
# Launch file
Node(
    package='my_robot',
    executable='robot_node',
    namespace='robot_1',  # ← Namespace
    ...
)
```

**Effect:**

```
Without namespace:
  /cmd_vel
  /odom
  /camera/image

With namespace='robot_1':
  /robot_1/cmd_vel
  /robot_1/odom
  /robot_1/camera/image
```

**Key Points:**

1. **Use relative topic names** (no leading `/`):
   ```python
   # ✅ Good (relative)
   self.pub = self.create_publisher(String, 'cmd_vel', 10)
   # Result: /robot_1/cmd_vel

   # ❌ Bad (absolute)
   self.pub = self.create_publisher(String, '/cmd_vel', 10)
   # Result: /cmd_vel (ignores namespace!)
   ```

2. **Namespace TF frames**:
   ```python
   # robot_1
   map → robot_1/odom → robot_1/base_link

   # robot_2
   map → robot_2/odom → robot_2/base_link
   ```

3. **Fleet-level topics stay global**:
   ```
   # Per-robot (namespaced)
   /robot_1/cmd_vel
   /robot_2/cmd_vel

   # Fleet-level (global)
   /fleet/task_assignments
   /fleet/heartbeats
   ```

**Interview Insight:**
Use namespacing to prefix all robot-specific topics. Use relative topic names (no `/` prefix). Keep fleet-level coordination topics global. Namespace TF frames too.

---

### Q2: What is a DDS Domain ID and when would you use it?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

**DDS Domain ID** is a network isolation mechanism in ROS2's Data Distribution Service.

**What it does:**

Separates ROS2 participants into isolated networks:

```
Domain ID 0:  Robots A, B, C  (can communicate)
Domain ID 1:  Robots D, E, F  (can communicate)

Robot A (domain 0) CANNOT see Robot D (domain 1)
```

**How it works:**

DDS uses multicast groups based on domain ID:

```
Domain 0 → Multicast group: 239.255.0.1
Domain 1 → Multicast group: 239.255.0.2
```

Different multicast groups = isolated networks.

---

**Setting Domain ID:**

```bash
# Environment variable (affects all ROS2 commands in this terminal)
export ROS_DOMAIN_ID=0

# Launch robot
ros2 run my_pkg robot_node
```

**In code:**

```python
# Set programmatically (before rclpy.init)
os.environ['ROS_DOMAIN_ID'] = '0'

rclpy.init()
```

---

**When to use:**

**Use Case 1: Multiple Independent Fleets**

```
Warehouse A: Domain 0 (Robots 1-10)
Warehouse B: Domain 1 (Robots 11-20)

Complete isolation between warehouses.
```

**Use Case 2: Testing**

```
Production robots: Domain 0
Development robots: Domain 1

Test new software without affecting production.
```

**Use Case 3: Network Load Reduction**

```
Large fleet (100 robots):
  - Domain 0: Robots 1-25
  - Domain 1: Robots 26-50
  - Domain 2: Robots 51-75
  - Domain 3: Robots 76-100

Each domain has 25 robots → 75% less discovery traffic.
```

**Use Case 4: Security Isolation**

```
Sensitive tasks: Domain 0 (restricted network)
General tasks: Domain 1 (open network)
```

---

**Domain ID Range:**

Valid range: **0-232** (233 domain IDs)

Default: **0** (if not set)

---

**Mixing Domains:**

Robots on different domains **cannot communicate** unless:

1. Use **ROS2 bridge** (domain bridge):
   ```python
   from ros2_domain_bridge import DomainBridge

   bridge = DomainBridge()
   bridge.create_bridge(
       from_domain=0,
       to_domain=1,
       topic='/fleet/status'
   )
   ```

2. Use **external coordinator** (e.g., REST API, database):
   ```
   Domain 0 → HTTP POST → Coordinator
   Domain 1 ← HTTP GET  ← Coordinator
   ```

---

**Limitations:**

❌ Different domains can't see each other's topics
❌ No ROS2 communication across domains (by design)
❌ Requires careful planning (which robots on which domain)

---

**Interview Insight:**
DDS Domain ID isolates ROS2 networks using different multicast groups. Use for: independent fleets, testing, reducing discovery load, security. Range: 0-232. Default: 0. Robots on different domains can't communicate unless using bridge.

---

### Q3: How would you coordinate task allocation across multiple robots?

**Difficulty:** ⭐⭐⭐⭐ (Hard)

**Answer:**

Task allocation assigns tasks to robots to optimize some objective (minimize time, distance, cost).

---

**Approach 1: Centralized Coordinator**

**Architecture:**

```
Fleet Manager
  ↓
Receives tasks → Allocates to robots → Monitors execution
```

**Algorithm: Greedy Assignment**

```python
class GreedyTaskAllocator:
    def allocate(self, tasks, robots):
        assignments = {}

        # Sort tasks by priority
        sorted_tasks = sorted(tasks, key=lambda t: t.priority, reverse=True)

        for task in sorted_tasks:
            # Find best robot for this task
            best_robot = None
            min_cost = float('inf')

            for robot in robots:
                if robot.is_available():
                    cost = self.compute_cost(robot, task)
                    if cost < min_cost:
                        min_cost = cost
                        best_robot = robot

            if best_robot:
                assignments[task.id] = best_robot.id
                best_robot.assign_task(task)

        return assignments

    def compute_cost(self, robot, task):
        # Cost = distance + task difficulty
        distance = euclidean_distance(robot.position, task.location)
        difficulty = task.estimated_time

        return distance + difficulty
```

**Pros:**
✅ Simple to implement
✅ Centralized optimization

**Cons:**
❌ Single point of failure
❌ Scalability issues (N robots → O(N²) updates)

---

**Approach 2: Auction-Based (Distributed)**

**Protocol:**

```
1. Auctioneer announces task
2. Robots bid (based on cost)
3. Lowest bidder wins
4. Winner executes task
```

**Implementation:**

```python
class AuctionProtocol:
    # Auctioneer
    def announce_task(self, task):
        msg = TaskAuction()
        msg.task = task
        msg.auction_id = generate_id()

        self.auction_pub.publish(msg)

        # Wait for bids (timeout 5s)
        bids = self.collect_bids(timeout=5.0)

        # Select winner (lowest bid)
        winner = min(bids, key=lambda b: b.cost)

        self.assign_task(winner.robot_id, task)

    # Robot (bidder)
    def auction_callback(self, msg):
        task = msg.task

        # Compute cost
        my_cost = self.compute_cost(task)

        # Submit bid
        bid = Bid()
        bid.robot_id = self.robot_id
        bid.auction_id = msg.auction_id
        bid.cost = my_cost

        self.bid_pub.publish(bid)

    def compute_cost(self, task):
        # Distance to task
        distance = euclidean_distance(self.position, task.location)

        # Current workload
        workload = len(self.current_tasks)

        return distance * 10 + workload * 100
```

**Pros:**
✅ Distributed (no single point of failure)
✅ Robots make local decisions
✅ Scalable

**Cons:**
❌ Communication overhead (bids, announcements)
❌ Not globally optimal (greedy)
❌ Requires consensus protocol

---

**Approach 3: Optimization (MILP)**

**Formulation:**

```
Variables:
  x[i,j] = 1 if robot i assigned to task j, 0 otherwise

Objective:
  minimize Σ cost[i,j] * x[i,j]

Constraints:
  1. Each task assigned to exactly one robot:
     Σ_i x[i,j] = 1  ∀j

  2. Robot capacity:
     Σ_j x[i,j] ≤ capacity[i]  ∀i
```

**Implementation (using PuLP):**

```python
import pulp

class OptimalTaskAllocator:
    def allocate(self, tasks, robots):
        # Decision variables
        x = {}
        for i, robot in enumerate(robots):
            for j, task in enumerate(tasks):
                x[i, j] = pulp.LpVariable(f"x_{i}_{j}", cat='Binary')

        # Problem
        prob = pulp.LpProblem("TaskAllocation", pulp.LpMinimize)

        # Objective: minimize total cost
        prob += pulp.lpSum(
            self.compute_cost(robots[i], tasks[j]) * x[i, j]
            for i in range(len(robots))
            for j in range(len(tasks))
        )

        # Constraint: each task assigned to exactly one robot
        for j in range(len(tasks)):
            prob += pulp.lpSum(x[i, j] for i in range(len(robots))) == 1

        # Constraint: robot capacity
        for i, robot in enumerate(robots):
            prob += pulp.lpSum(x[i, j] for j in range(len(tasks))) <= robot.capacity

        # Solve
        prob.solve()

        # Extract solution
        assignments = {}
        for i in range(len(robots)):
            for j in range(len(tasks)):
                if x[i, j].varValue == 1:
                    assignments[tasks[j].id] = robots[i].id

        return assignments

    def compute_cost(self, robot, task):
        return euclidean_distance(robot.position, task.location)
```

**Pros:**
✅ Globally optimal solution
✅ Handles complex constraints

**Cons:**
❌ Computationally expensive (NP-hard)
❌ Centralized (requires global knowledge)
❌ Not real-time for large problems

---

**Comparison:**

| Approach | Optimality | Scalability | Fault Tolerance | Complexity |
|----------|------------|-------------|-----------------|------------|
| **Greedy** | ⭐ Local | ⭐⭐⭐ Good | ❌ Centralized | ⭐ Low |
| **Auction** | ⭐⭐ Better | ⭐⭐⭐ Good | ✅ Distributed | ⭐⭐ Medium |
| **MILP** | ⭐⭐⭐ Optimal | ⭐ Poor | ❌ Centralized | ⭐⭐⭐ High |

---

**Recommendation:**

```
Small fleet (< 10 robots):
  → Use MILP (optimal solution)

Medium fleet (10-50 robots):
  → Use Auction (good balance)

Large fleet (> 50 robots):
  → Use Greedy or Market-Based (scalable)
```

---

**Interview Insight:**
Task allocation approaches: Greedy (simple, local optimal), Auction (distributed, better), MILP (globally optimal, expensive). Choose based on fleet size and requirements. Auction-based is most common for production multi-robot systems.

---

## PRACTICE_TASKS

### Task 1: Multi-Robot Launch

**Goal:** Launch 3 robots with namespaces.

**Requirements:**
- Create launch file for 3 robots
- Each robot in different namespace (robot_1, robot_2, robot_3)
- Each publishes `/status` topic (should be /robot_X/status)
- Verify no topic collisions

---

### Task 2: Heartbeat Protocol

**Goal:** Implement robot discovery via heartbeats.

**Requirements:**
- Each robot publishes heartbeat every 1 second
- Fleet monitor subscribes to heartbeats
- Detect dead robots (no heartbeat for 5 seconds)
- Log robot discovery and death

---

### Task 3: Simple Task Coordinator

**Goal:** Build centralized task allocator.

**Requirements:**
- Coordinator receives tasks on `/fleet/new_task`
- Allocate to nearest idle robot
- Track robot status (IDLE, BUSY)
- Test with 2 robots and 5 tasks

---

## QUICK_REFERENCE

### Namespacing

```python
# Launch with namespace
Node(
    package='my_pkg',
    executable='node',
    namespace='robot_1',  # All topics prefixed with /robot_1/
    ...
)
```

### Domain IDs

```bash
# Set domain ID
export ROS_DOMAIN_ID=0

# Robots on different domains can't communicate
Domain 0: Robots A, B, C
Domain 1: Robots D, E, F
```

### Common Multi-Robot Topics

```
# Per-robot (namespaced)
/robot_1/cmd_vel
/robot_1/odom
/robot_1/status

# Fleet-level (global)
/fleet/task_assignments
/fleet/heartbeats
/fleet/coordination
```

### TF Frames

```
# Robot 1
map → robot_1/odom → robot_1/base_link

# Robot 2
map → robot_2/odom → robot_2/base_link

# Shared map
world → map (shared by all robots)
```

---

**END OF TOPIC 6.5: Multi-Robot Systems & Coordination**
