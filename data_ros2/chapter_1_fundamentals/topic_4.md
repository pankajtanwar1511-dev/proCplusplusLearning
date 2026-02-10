# Topic 1.4: Launch Files

## THEORY_SECTION

### 1. Launch System Fundamentals

**What is a Launch File?**

A launch file is a Python script that **programmatically starts multiple nodes** with specific configurations, parameters, and relationships. It replaces manual `ros2 run` commands for complex systems.

**Why Launch Files?**

```bash
# Manual startup (tedious, error-prone):
ros2 run camera_pkg camera_node --ros-args -p fps:=30 -r __ns:=/robot1
ros2 run lidar_pkg lidar_node --ros-args -p range:=100 -r __ns:=/robot1
ros2 run control_pkg controller --ros-args -p speed:=1.0 -r __ns:=/robot1
# ... (10 more nodes)

# Launch file (one command):
ros2 launch robot_bringup robot.launch.py
```

**Benefits:**
- **Single command** to start entire system
- **Parameter management** in YAML files
- **Conditional logic** (start nodes based on arguments)
- **Namespaces and remapping** for multi-robot
- **Event handling** (start node when another is ready)
- **Composition** (include other launch files)

---

### 2. Basic Launch File Structure

**Minimal Launch File:**

```python
from launch import LaunchDescription
from launch_ros.actions import Node

def generate_launch_description():
    return LaunchDescription([
        Node(
            package='turtlesim',
            executable='turtlesim_node',
            name='sim'
        )
    ])
```

**Key Components:**

1. **`generate_launch_description()` function (required):**
   - Must return `LaunchDescription` object
   - Called by `ros2 launch` command

2. **`LaunchDescription`:**
   - Container for launch actions
   - Actions execute in order (unless event-driven)

3. **`Node` action:**
   - Starts a ROS2 node
   - Parameters: package, executable, name, namespace, parameters, etc.

**Running:**

```bash
ros2 launch my_package my_launch.py
```

---

### 3. Launch Actions

**Node - Start ROS2 Node:**

```python
Node(
    package='camera_driver',
    executable='camera_node',
    name='front_camera',
    namespace='sensors',
    parameters=[{
        'fps': 30,
        'resolution': '1920x1080'
    }],
    remappings=[
        ('image', 'camera/image_raw')
    ],
    output='screen',  # Print to terminal
    respawn=True,     # Restart if crashes
    respawn_delay=2.0
)
```

**ExecuteProcess - Run Arbitrary Command:**

```python
from launch.actions import ExecuteProcess

ExecuteProcess(
    cmd=['ros2', 'bag', 'record', '-a'],
    output='screen',
    cwd='/tmp/bags',  # Working directory
    env={'ROS_DOMAIN_ID': '5'}  # Environment variables
)
```

**IncludeLaunchDescription - Include Other Launch Files:**

```python
from launch.actions import IncludeLaunchDescription
from launch.launch_description_sources import PythonLaunchDescriptionSource
from ament_index_python.packages import get_package_share_directory
import os

IncludeLaunchDescription(
    PythonLaunchDescriptionSource([
        os.path.join(
            get_package_share_directory('navigation'),
            'launch',
            'nav2.launch.py'
        )
    ]),
    launch_arguments={
        'use_sim_time': 'true',
        'map': '/maps/office.yaml'
    }.items()
)
```

**SetParameter - Set Global Parameters:**

```python
from launch.actions import SetParameter

SetParameter(name='use_sim_time', value=True)
```

**TimerAction - Delay Action:**

```python
from launch.actions import TimerAction

TimerAction(
    period=5.0,  # Wait 5 seconds
    actions=[
        Node(package='foo', executable='bar')
    ]
)
```

---

### 4. Launch Arguments and Substitutions

**Declare and Use Arguments:**

```python
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node

def generate_launch_description():
    # Declare argument
    robot_name_arg = DeclareLaunchArgument(
        'robot_name',
        default_value='robot1',
        description='Name of the robot'
    )

    # Use argument
    robot_name = LaunchConfiguration('robot_name')

    return LaunchDescription([
        robot_name_arg,

        Node(
            package='robot_driver',
            executable='driver_node',
            name='driver',
            namespace=robot_name,  # Use argument value
            parameters=[{
                'robot_id': robot_name
            }]
        )
    ])
```

**Passing Arguments:**

```bash
ros2 launch my_package robot.launch.py robot_name:=robot2
```

**Common Substitutions:**

| Substitution | Purpose | Example |
|--------------|---------|---------|
| `LaunchConfiguration` | Get launch argument value | `LaunchConfiguration('robot_name')` |
| `PathJoinSubstitution` | Join file paths | `PathJoinSubstitution([pkg_share, 'config', 'params.yaml'])` |
| `FindPackageShare` | Get package share directory | `FindPackageShare('my_package')` |
| `Command` | Execute command, use output | `Command(['xacro ', urdf_file])` |
| `TextSubstitution` | Plain text | `TextSubstitution(text='hello')` |
| `EnvironmentVariable` | Get env variable | `EnvironmentVariable('HOME')` |

**Path Example:**

```python
from launch_ros.substitutions import FindPackageShare
from launch.substitutions import PathJoinSubstitution

config_file = PathJoinSubstitution([
    FindPackageShare('my_package'),
    'config',
    'params.yaml'
])

Node(
    package='my_package',
    executable='my_node',
    parameters=[config_file]  # Resolves to: install/my_package/share/my_package/config/params.yaml
)
```

**Command Substitution (URDF/Xacro):**

```python
from launch.substitutions import Command

robot_description = Command([
    'xacro ',
    PathJoinSubstitution([
        FindPackageShare('my_robot_description'),
        'urdf',
        'robot.urdf.xacro'
    ])
])

Node(
    package='robot_state_publisher',
    executable='robot_state_publisher',
    parameters=[{
        'robot_description': robot_description
    }]
)
```

---

### 5. Conditional Execution

**IfCondition / UnlessCondition:**

```python
from launch.conditions import IfCondition, UnlessCondition
from launch.substitutions import LaunchConfiguration

def generate_launch_description():
    use_sim = LaunchConfiguration('use_sim')

    return LaunchDescription([
        DeclareLaunchArgument('use_sim', default_value='false'),

        # Start only if use_sim=true
        Node(
            package='gazebo_ros',
            executable='gzserver',
            condition=IfCondition(use_sim)
        ),

        # Start only if use_sim=false
        Node(
            package='robot_driver',
            executable='hardware_driver',
            condition=UnlessCondition(use_sim)
        )
    ])
```

**LaunchConfigurationEquals:**

```python
from launch.conditions import LaunchConfigurationEquals

Node(
    package='navigation',
    executable='nav_node',
    condition=LaunchConfigurationEquals('mode', 'auto')
)
```

**Complex Conditions:**

```python
from launch.conditions import IfCondition
from launch.substitutions import LaunchConfiguration, PythonExpression

Node(
    package='foo',
    executable='bar',
    condition=IfCondition(
        PythonExpression([
            '"', LaunchConfiguration('use_sim'), '" == "true" and "',
            LaunchConfiguration('enable_lidar'), '" == "true"'
        ])
    )
)
```

---

### 6. Parameter Management

**Inline Parameters:**

```python
Node(
    package='my_package',
    executable='my_node',
    parameters=[{
        'update_rate': 100.0,
        'frame_id': 'base_link',
        'enable_debug': True
    }]
)
```

**YAML Parameter File:**

**config/params.yaml:**
```yaml
my_node:
  ros__parameters:
    update_rate: 100.0
    frame_id: 'base_link'
    enable_debug: true
```

**Launch file:**
```python
config_file = PathJoinSubstitution([
    FindPackageShare('my_package'),
    'config',
    'params.yaml'
])

Node(
    package='my_package',
    executable='my_node',
    name='my_node',  # Must match YAML node name
    parameters=[config_file]
)
```

**Mixing Inline and File:**

```python
Node(
    package='my_package',
    executable='my_node',
    parameters=[
        config_file,  # Load from YAML
        {
            'override_param': 42  # Override specific param
        }
    ]
)
```

**Namespace Scoping:**

```python
# config/multi_robot.yaml
robot1:
  camera_node:
    ros__parameters:
      fps: 30

robot2:
  camera_node:
    ros__parameters:
      fps: 60

# Launch file
Node(
    package='camera',
    executable='camera_node',
    namespace='robot1',
    name='camera_node',
    parameters=[config_file]  # Loads robot1/camera_node parameters
)
```

---

### 7. Event Handlers

**RegisterEventHandler - React to Events:**

**OnProcessStart - When Node Starts:**

```python
from launch.event_handlers import OnProcessStart

Node(
    package='camera',
    executable='camera_node',
    name='camera',
    on_exit=[
        LogInfo(msg='Camera node exited!')
    ]
)
```

**OnProcessExit - When Node Exits:**

```python
from launch.event_handlers import OnProcessExit

camera_node = Node(
    package='camera',
    executable='camera_node',
    name='camera'
)

processor_node = Node(
    package='processor',
    executable='processor_node',
    name='processor'
)

# Start processor after camera exits
camera_exit_handler = RegisterEventHandler(
    OnProcessExit(
        target_action=camera_node,
        on_exit=[
            LogInfo(msg='Camera exited, starting processor'),
            processor_node
        ]
    )
)

return LaunchDescription([
    camera_node,
    camera_exit_handler
])
```

**OnExecutionComplete - When Action Completes:**

```python
from launch.event_handlers import OnExecutionComplete

setup_action = ExecuteProcess(cmd=['ros2', 'param', 'set', '/node', 'param', 'value'])

RegisterEventHandler(
    OnExecutionComplete(
        target_action=setup_action,
        on_completion=[
            Node(package='my_pkg', executable='my_node')
        ]
    )
)
```

**OnShutdown - At Launch Shutdown:**

```python
from launch.event_handlers import OnShutdown

RegisterEventHandler(
    OnShutdown(
        on_shutdown=[
            LogInfo(msg='Shutting down, saving data...'),
            ExecuteProcess(cmd=['ros2', 'bag', 'stop'])
        ]
    )
)
```

---

### 8. Namespaces and Remapping

**Namespaces:**

```python
# Namespace applied to all topics/services
Node(
    package='camera',
    executable='camera_node',
    namespace='robot1/sensors'
)
# Topics: /robot1/sensors/image, /robot1/sensors/info
```

**Remapping:**

```python
Node(
    package='camera',
    executable='camera_node',
    remappings=[
        # Remap local topic to different name
        ('image', 'camera/image_raw'),           # /image → /camera/image_raw
        ('camera_info', 'camera/camera_info'),   # /camera_info → /camera/camera_info

        # Remap with namespace
        ('/global_topic', '/robot1/global_topic')  # Absolute remapping
    ]
)
```

**Multi-Robot Example:**

```python
def generate_launch_description():
    robots = ['robot1', 'robot2', 'robot3']
    nodes = []

    for robot in robots:
        nodes.append(
            Node(
                package='robot_driver',
                executable='driver',
                namespace=robot,
                parameters=[{
                    'robot_id': robot
                }],
                remappings=[
                    ('cmd_vel', 'commands/velocity'),
                    ('odom', 'odometry/filtered')
                ]
            )
        )

    return LaunchDescription(nodes)
```

**Result:**
```
/robot1/commands/velocity
/robot1/odometry/filtered
/robot2/commands/velocity
/robot2/odometry/filtered
...
```

---

### 9. Composable Nodes in Launch Files

**Loading Components Dynamically:**

```python
from launch_ros.actions import ComposableNodeContainer
from launch_ros.descriptions import ComposableNode

container = ComposableNodeContainer(
    name='my_container',
    namespace='',
    package='rclcpp_components',
    executable='component_container',
    composable_node_descriptions=[
        ComposableNode(
            package='camera_driver',
            plugin='camera::CameraNode',
            name='camera',
            parameters=[{
                'fps': 30
            }]
        ),
        ComposableNode(
            package='image_processor',
            plugin='processor::ProcessorNode',
            name='processor',
            parameters=[{
                'algorithm': 'fast'
            }]
        )
    ],
    output='screen'
)
```

**Benefits:**
- Intra-process communication (zero-copy)
- Lower overhead (single process)
- Easier deployment (one container vs many processes)

---

## EDGE_CASES

### Edge Case 1: Parameter File Not Found

**Scenario:**
Launch file references non-existent parameter file.

```python
Node(
    package='my_pkg',
    executable='my_node',
    parameters=['/nonexistent/params.yaml']  # Typo or wrong path
)
```

**Error:**
```
[ERROR] [launch]: Caught exception in launch (see debug for traceback): file '/nonexistent/params.yaml' was not found
```

**Why:**
- Path is evaluated at launch time
- If file doesn't exist, launch aborts

**Solution - Use Substitutions:**

```python
config_file = PathJoinSubstitution([
    FindPackageShare('my_package'),  # Finds installed package
    'config',
    'params.yaml'
])

Node(
    package='my_pkg',
    executable='my_node',
    parameters=[config_file]  # Correct path
)
```

**Debugging:**

```python
from launch.actions import LogInfo

LogInfo(msg=['Loading config from: ', config_file])
```

**Interview Insight:**
Always use `FindPackageShare` + `PathJoinSubstitution` for robustness across installs.

---

### Edge Case 2: Argument Default Value Not a String

**Scenario:**
Passing non-string default value to `DeclareLaunchArgument`.

```python
DeclareLaunchArgument(
    'rate',
    default_value=100  # Wrong! Must be string
)
```

**Error:**
```
TypeError: default_value must be a string or list of strings and substitutions
```

**Why:**
- All launch arguments are strings (evaluated at launch time)
- Type conversion happens when passed to node

**Correct:**

```python
DeclareLaunchArgument(
    'rate',
    default_value='100'  # String
)

# In node parameter:
Node(
    parameters=[{
        'rate': LaunchConfiguration('rate')  # Passed as string, node converts to int
    }]
)
```

**For Complex Types (Lists, Dicts):**

```python
DeclareLaunchArgument(
    'joint_names',
    default_value='["joint1", "joint2", "joint3"]'  # JSON string
)

# In node (Python):
import json
joint_names = json.loads(self.get_parameter('joint_names').value)
```

**Interview Insight:**
Launch arguments are always strings. Type conversion happens at node parameter level.

---

### Edge Case 3: Circular Launch File Inclusion

**Scenario:**
Launch file A includes B, and B includes A.

**a.launch.py:**
```python
IncludeLaunchDescription(
    PythonLaunchDescriptionSource('b.launch.py')
)
```

**b.launch.py:**
```python
IncludeLaunchDescription(
    PythonLaunchDescriptionSource('a.launch.py')  # Circular!
)
```

**Result:**
- Infinite recursion
- Python stack overflow
- Launch crashes

**Solution - Conditional Inclusion:**

**a.launch.py:**
```python
DeclareLaunchArgument('include_b', default_value='true')

IncludeLaunchDescription(
    PythonLaunchDescriptionSource('b.launch.py'),
    launch_arguments={'include_a': 'false'}.items(),  # Prevent B from including A
    condition=IfCondition(LaunchConfiguration('include_b'))
)
```

**b.launch.py:**
```python
DeclareLaunchArgument('include_a', default_value='true')

IncludeLaunchDescription(
    PythonLaunchDescriptionSource('a.launch.py'),
    launch_arguments={'include_b': 'false'}.items(),  # Prevent A from including B
    condition=IfCondition(LaunchConfiguration('include_a'))
)
```

**Interview Insight:**
Use arguments to control inclusion depth and prevent circular dependencies.

---

### Edge Case 4: Environment Variables Not Passed to Nodes

**Scenario:**
Set environment variable in launch file but node doesn't see it.

```python
import os
os.environ['MY_VAR'] = 'value'  # Wrong! Only affects launch process

Node(
    package='my_pkg',
    executable='my_node'
)
```

**In node:**
```cpp
const char* var = std::getenv("MY_VAR");  // nullptr!
```

**Why:**
- Setting `os.environ` in Python affects launch script process
- Node runs in separate process (doesn't inherit)

**Solution - Use `additional_env` parameter:**

```python
Node(
    package='my_pkg',
    executable='my_node',
    additional_env={'MY_VAR': 'value'}  # Passed to node process
)
```

**Global Environment Variables:**

```python
from launch.actions import SetEnvironmentVariable

SetEnvironmentVariable('ROS_DOMAIN_ID', '42')  # All subsequent nodes see this
```

**Interview Insight:**
Node processes don't inherit Python environment. Use `additional_env` or `SetEnvironmentVariable`.

---

## CODE_EXAMPLES

### Example 1: Multi-Robot Launch with Arguments

```python
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, GroupAction
from launch.substitutions import LaunchConfiguration, PathJoinSubstitution
from launch_ros.actions import Node, PushRosNamespace
from launch_ros.substitutions import FindPackageShare

def generate_launch_description():
    # Arguments
    num_robots_arg = DeclareLaunchArgument(
        'num_robots',
        default_value='3',
        description='Number of robots to spawn'
    )

    use_sim_arg = DeclareLaunchArgument(
        'use_sim',
        default_value='false',
        description='Use simulation time'
    )

    # Get values
    num_robots = LaunchConfiguration('num_robots')
    use_sim = LaunchConfiguration('use_sim')

    # Config file
    config_file = PathJoinSubstitution([
        FindPackageShare('multi_robot'),
        'config',
        'robot_params.yaml'
    ])

    # Create nodes for each robot
    robots = []
    for i in range(int(num_robots.perform(context=None) if hasattr(num_robots, 'perform') else 3)):
        robot_name = f'robot{i+1}'

        robot_group = GroupAction([
            PushRosNamespace(robot_name),

            # Driver node
            Node(
                package='robot_driver',
                executable='driver_node',
                name='driver',
                parameters=[
                    config_file,
                    {
                        'robot_id': robot_name,
                        'use_sim_time': use_sim
                    }
                ],
                remappings=[
                    ('cmd_vel', 'commands/velocity'),
                    ('odom', 'odometry/filtered')
                ]
            ),

            # Controller node
            Node(
                package='robot_controller',
                executable='controller_node',
                name='controller',
                parameters=[{
                    'use_sim_time': use_sim
                }]
            )
        ])

        robots.append(robot_group)

    return LaunchDescription([
        num_robots_arg,
        use_sim_arg,
        *robots  # Unpack all robot groups
    ])
```

**Usage:**

```bash
# 3 robots (default)
ros2 launch multi_robot robots.launch.py

# 5 robots in simulation
ros2 launch multi_robot robots.launch.py num_robots:=5 use_sim:=true
```

---

### Example 2: Conditional Driver Selection

```python
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.conditions import IfCondition, UnlessCondition
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node

def generate_launch_description():
    # Argument: hardware type
    hardware_arg = DeclareLaunchArgument(
        'hardware',
        default_value='simulation',
        choices=['simulation', 'real_robot', 'mock'],
        description='Hardware interface to use'
    )

    hardware = LaunchConfiguration('hardware')

    # Simulation driver
    sim_driver = Node(
        package='gazebo_ros',
        executable='gazebo_sim',
        name='sim_driver',
        condition=IfCondition(
            LaunchConfiguration('hardware').equals('simulation')
        ),
        parameters=[{
            'world_file': '/path/to/world.sdf'
        }]
    )

    # Real hardware driver
    real_driver = Node(
        package='robot_hardware',
        executable='hardware_interface',
        name='hw_driver',
        condition=IfCondition(
            LaunchConfiguration('hardware').equals('real_robot')
        ),
        parameters=[{
            'port': '/dev/ttyUSB0',
            'baud_rate': 115200
        }]
    )

    # Mock driver (testing)
    mock_driver = Node(
        package='mock_driver',
        executable='mock_node',
        name='mock_driver',
        condition=IfCondition(
            LaunchConfiguration('hardware').equals('mock')
        )
    )

    # Controller (always starts)
    controller = Node(
        package='robot_controller',
        executable='controller',
        name='controller',
        parameters=[{
            'use_sim_time': LaunchConfiguration('hardware').equals('simulation')
        }]
    )

    return LaunchDescription([
        hardware_arg,
        sim_driver,
        real_driver,
        mock_driver,
        controller
    ])
```

**Usage:**

```bash
ros2 launch robot_bringup bringup.launch.py hardware:=real_robot
```

---

## INTERVIEW_QA

### Q1: What's the difference between a Python launch file and an XML launch file?

**Difficulty:** ⭐⭐ (Easy)

**Answer:**

ROS2 supports both Python and XML launch files, but Python is **strongly recommended**.

| Aspect | Python Launch | XML Launch |
|--------|---------------|------------|
| **Language** | Python script | XML markup |
| **Flexibility** | Full Python (loops, conditionals, functions) | Limited declarative syntax |
| **Complex Logic** | Easy (native Python) | Difficult (limited expressions) |
| **Readability** | Better for complex logic | Better for simple cases |
| **ROS2 Standard** | **Recommended** | Legacy/compatibility |

**Python Example:**
```python
# Easy to create multiple robots with loop
for i in range(10):
    nodes.append(Node(package='robot', executable='node', namespace=f'robot{i}'))
```

**XML Equivalent:**
```xml
<!-- Must manually repeat 10 times -->
<node pkg="robot" exec="node" namespace="robot0"/>
<node pkg="robot" exec="node" namespace="robot1"/>
...
```

**When to Use XML:**
- Simple launch files (< 5 nodes)
- Team prefers declarative style
- ROS1 migration (similar to roslaunch XML)

**Interview Insight:**
Python launch is the ROS2 standard. Use XML only for simple cases or legacy compatibility.

---

### Q2: How do you pass parameters from a launch file to a node?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

**Three Methods:**

**1. Inline Dictionary:**
```python
Node(
    package='my_pkg',
    executable='my_node',
    parameters=[{
        'param1': 100,
        'param2': 'value',
        'nested.param': True
    }]
)
```

**2. YAML File:**
```yaml
# config/params.yaml
my_node:
  ros__parameters:
    param1: 100
    param2: 'value'
```

```python
Node(
    package='my_pkg',
    executable='my_node',
    name='my_node',  # Must match YAML key
    parameters=[config_file]
)
```

**3. Launch Arguments:**
```python
DeclareLaunchArgument('rate', default_value='50')

Node(
    parameters=[{
        'update_rate': LaunchConfiguration('rate')
    }]
)
```

**Combination:**
```python
Node(
    parameters=[
        config_file,         # Load base config
        {
            'override': 42  # Override specific param
        }
    ]
)
```

**Interview Insight:**
Use YAML for static configs, inline for dynamic/computed values, launch args for user overrides.

---

### Q3: Explain the purpose of `FindPackageShare` and why it's necessary.

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

`FindPackageShare` locates the **install share directory** of a package at runtime.

**Why Needed:**

Hardcoded paths break when:
- Installed to different location (`/opt/ros/humble` vs `~/ros2_ws/install`)
- Deployed to different machine
- Using Docker containers

**Wrong (hardcoded):**
```python
config_file = '/home/user/ros2_ws/install/my_pkg/share/my_pkg/config/params.yaml'
# Breaks on different machine/install location
```

**Correct (FindPackageShare):**
```python
from launch_ros.substitutions import FindPackageShare
from launch.substitutions import PathJoinSubstitution

config_file = PathJoinSubstitution([
    FindPackageShare('my_pkg'),  # Finds install location dynamically
    'config',
    'params.yaml'
])
# Works anywhere
```

**What FindPackageShare Does:**

1. Searches `$AMENT_PREFIX_PATH` for package
2. Returns: `<install_prefix>/share/my_pkg`
3. Example result: `/opt/ros/humble/share/my_pkg`

**Usage Pattern:**

```python
# Find package
pkg_share = FindPackageShare('my_package')

# Build paths relative to package
urdf_file = PathJoinSubstitution([pkg_share, 'urdf', 'robot.urdf'])
config_file = PathJoinSubstitution([pkg_share, 'config', 'params.yaml'])
```

**Interview Insight:**
Always use `FindPackageShare` for portability. Never hardcode install paths.

---

### Q4: How do you handle node dependencies (start node B after node A is ready)?

**Difficulty:** ⭐⭐⭐⭐ (Hard)

**Answer:**

**Problem:**
Nodes start concurrently. Node B might need Node A's service/topic.

**Solution 1: Event Handlers (Basic):**

```python
from launch.event_handlers import OnProcessStart

node_a = Node(package='pkg_a', executable='node_a', name='node_a')

# Start node_b after node_a process starts
node_b_delayed = RegisterEventHandler(
    OnProcessStart(
        target_action=node_a,
        on_start=[
            TimerAction(
                period=2.0,  # Wait 2s for node_a to be ready
                actions=[
                    Node(package='pkg_b', executable='node_b', name='node_b')
                ]
            )
        ]
    )
)

return LaunchDescription([node_a, node_b_delayed])
```

**Limitation:** Process start ≠ node ready (ROS2 node might take time to initialize).

**Solution 2: Lifecycle Management (Robust):**

Use lifecycle nodes with transitions:

```python
from launch_ros.actions import LifecycleNode
from launch_ros.event_handlers import OnStateTransition
from launch_ros.events.lifecycle import ChangeState
from lifecycle_msgs.msg import Transition

# Node A (lifecycle)
node_a = LifecycleNode(
    package='pkg_a',
    executable='node_a',
    name='node_a'
)

# Configure node_a
configure_a = EmitEvent(event=ChangeState(
    lifecycle_node_matcher=matches_action(node_a),
    transition_id=Transition.TRANSITION_CONFIGURE
))

# Activate node_a
activate_a = EmitEvent(event=ChangeState(
    lifecycle_node_matcher=matches_action(node_a),
    transition_id=Transition.TRANSITION_ACTIVATE
))

# Start node_b when node_a is ACTIVE
start_b_when_a_active = RegisterEventHandler(
    OnStateTransition(
        target_lifecycle_node=node_a,
        goal_state='active',
        entities=[
            Node(package='pkg_b', executable='node_b', name='node_b')
        ]
    )
)

return LaunchDescription([
    node_a,
    configure_a,
    activate_a,
    start_b_when_a_active
])
```

**Solution 3: Delay with TimerAction (Simple):**

```python
Node(package='pkg_a', executable='node_a'),

TimerAction(
    period=5.0,  # Wait 5 seconds
    actions=[
        Node(package='pkg_b', executable='node_b')
    ]
)
```

**Interview Insight:**
Use lifecycle nodes for robust dependency management. Timer delays are fragile but simple.

---

### Q5: What are composable nodes and how do you launch them?

**Difficulty:** ⭐⭐⭐⭐ (Hard)

**Answer:**

**Composable nodes** are components loaded into a **container process** for intra-process communication (zero-copy).

**Benefits:**
- Lower latency (no serialization)
- Lower CPU (no copying)
- Single process (easier debugging)

**Launch File:**

```python
from launch_ros.actions import ComposableNodeContainer
from launch_ros.descriptions import ComposableNode

container = ComposableNodeContainer(
    name='sensor_container',
    namespace='',
    package='rclcpp_components',
    executable='component_container',
    composable_node_descriptions=[
        ComposableNode(
            package='camera_driver',
            plugin='camera::CameraNode',  # Class name (not executable)
            name='camera',
            parameters=[{
                'fps': 30
            }]
        ),
        ComposableNode(
            package='image_processor',
            plugin='processor::ProcessorNode',
            name='processor'
        )
    ],
    output='screen'
)
```

**Key Differences from Regular Nodes:**

| Aspect | Regular Node | Composable Node |
|--------|--------------|-----------------|
| **Launch** | `package` + `executable` | `package` + `plugin` (class name) |
| **Process** | Separate process | Shared container process |
| **Communication** | DDS (always) | Intra-process (zero-copy) |
| **Isolation** | Full (separate process) | None (shared memory) |

**Component Registration (C++):**

```cpp
#include "rclcpp_components/register_node_macro.hpp"

class CameraNode : public rclcpp::Node { /* ... */ };

RCLCPP_COMPONENTS_REGISTER_NODE(camera::CameraNode)
```

**When to Use:**
- High-frequency data (images, point clouds)
- Latency-critical pipelines
- Related nodes (sensor + processing)

**Interview Insight:**
Composable nodes trade isolation for performance. Use for tightly coupled nodes.

---

### Q6: How do you debug launch files that aren't working as expected?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

**Debugging Techniques:**

**1. Print Substitutions:**

```python
from launch.actions import LogInfo

LogInfo(msg=['Config file: ', config_file]),
LogInfo(msg=['Robot namespace: ', LaunchConfiguration('robot_name')])
```

**2. Use `--show-args`:**

```bash
ros2 launch my_pkg my_launch.py --show-args
# Shows all declared arguments and defaults
```

**3. Use `--print-description`:**

```bash
ros2 launch my_pkg my_launch.py --print-description
# Shows launch file structure without executing
```

**4. Run with Debug Output:**

```bash
ros2 launch my_pkg my_launch.py --debug
# Verbose output showing action execution
```

**5. Check Node Output:**

```python
Node(
    output='screen',  # Print to terminal
    emulate_tty=True   # Colored output
)
```

**6. Validate Parameters:**

```python
from launch.actions import OpaqueFunction

def validate_args(context):
    robot_name = LaunchConfiguration('robot_name').perform(context)
    if not robot_name:
        raise RuntimeError('robot_name cannot be empty')
    print(f'Validated robot_name: {robot_name}')

OpaqueFunction(function=validate_args)
```

**7. Check Running Nodes:**

```bash
ros2 node list  # List running nodes
ros2 node info /node_name  # Node details
```

**Common Issues:**

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Node not in `ros2 node list` | Launch crashed | Check terminal output |
| "Package not found" | Wrong package name | Verify `ros2 pkg list` |
| "File not found" | Wrong path | Use `FindPackageShare` |
| Parameters not loaded | Wrong node name in YAML | Match name exactly |

**Interview Insight:**
Use `--show-args` and `LogInfo` to debug substitutions. Check node output with `output='screen'`.

---

## PRACTICE_TASKS

### Task 1: Multi-Robot Launch System

Create launch file that:
- Spawns N robots (argument `num_robots`)
- Each robot has driver + controller nodes
- Namespaced: `/robot1/driver`, `/robot2/driver`, etc.
- Loads parameters from YAML
- Conditional simulation vs hardware mode

**Requirements:**
- Support 1-10 robots
- Clean namespace structure
- Parameter file organization

---

### Task 2: Staged Bringup with Dependencies

Launch system with dependencies:
1. Start `map_server` (lifecycle node)
2. When map_server ACTIVE → start `localization`
3. When localization ready → start `navigation`
4. If navigation crashes → restart automatically

**Requirements:**
- Use lifecycle event handlers
- Respawn on failure
- Clean shutdown

---

### Task 3: Debug Broken Launch File

Given launch file with errors:
- Hardcoded paths
- Missing namespace
- Parameters not loading
- Wrong node order

**Task:** Fix all issues and document changes.

---

## QUICK_REFERENCE

### Common Launch Actions

```python
Node()                      # Start ROS2 node
ExecuteProcess()            # Run command
IncludeLaunchDescription()  # Include launch file
SetParameter()              # Global parameter
TimerAction()               # Delay action
RegisterEventHandler()      # React to events
```

### Substitutions

```python
LaunchConfiguration()       # Get argument value
FindPackageShare()          # Find package install dir
PathJoinSubstitution()      # Join paths
Command()                   # Execute command
EnvironmentVariable()       # Get env var
```

### Conditions

```python
IfCondition()               # If true
UnlessCondition()           # If false
LaunchConfigurationEquals() # Argument equals value
```

### Event Handlers

```python
OnProcessStart()            # When process starts
OnProcessExit()             # When process exits
OnExecutionComplete()       # When action completes
OnShutdown()                # At launch shutdown
OnStateTransition()         # Lifecycle state change
```

---

**END OF TOPIC 1.4**
