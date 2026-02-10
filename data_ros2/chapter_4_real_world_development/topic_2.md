# Chapter 4: Real-World Development Practices
## Topic 2: Launch File Best Practices

---

## Theory

### 1. Launch System Architecture

ROS2 uses a Python-based launch system that provides programmatic control over starting nodes, setting parameters, and managing system lifecycle.

**Key Components:**

```python
from launch import LaunchDescription
from launch_ros.actions import Node
from launch.actions import DeclareLaunchArgument, ExecuteProcess
from launch.substitutions import LaunchConfiguration

def generate_launch_description():
    return LaunchDescription([
        # Launch arguments (command-line parameters)
        DeclareLaunchArgument('param', default_value='value'),

        # Nodes
        Node(package='my_pkg', executable='my_node'),

        # Processes
        ExecuteProcess(cmd=['echo', 'Hello']),
    ])
```

**Launch file types:**
- **Python launch files (`.launch.py`):** Most flexible, programmatic
- **XML launch files (`.launch.xml`):** Declarative, simpler for basic cases
- **YAML launch files (`.launch.yaml`):** Simplest, limited functionality

**Modern ROS2 prefers Python** for maximum flexibility.

---

### 2. Launch Arguments and Configuration

Launch arguments allow parameterization at runtime.

#### Basic Launch Arguments

```python
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node

def generate_launch_description():
    # Declare arguments
    use_sim_time_arg = DeclareLaunchArgument(
        'use_sim_time',
        default_value='false',
        description='Use simulation time'
    )

    robot_name_arg = DeclareLaunchArgument(
        'robot_name',
        default_value='robot1',
        description='Name of the robot'
    )

    log_level_arg = DeclareLaunchArgument(
        'log_level',
        default_value='info',
        choices=['debug', 'info', 'warn', 'error'],
        description='Logging level'
    )

    # Use arguments
    use_sim_time = LaunchConfiguration('use_sim_time')
    robot_name = LaunchConfiguration('robot_name')
    log_level = LaunchConfiguration('log_level')

    node = Node(
        package='my_package',
        executable='my_node',
        name='my_node',
        namespace=robot_name,
        parameters=[{'use_sim_time': use_sim_time}],
        arguments=['--ros-args', '--log-level', log_level]
    )

    return LaunchDescription([
        use_sim_time_arg,
        robot_name_arg,
        log_level_arg,
        node
    ])
```

**Usage:**
```bash
ros2 launch my_package my_launch.py robot_name:=robot2 use_sim_time:=true log_level:=debug
```

#### Conditional Launch Based on Arguments

```python
from launch.conditions import IfCondition, UnlessCondition
from launch.substitutions import PythonExpression

def generate_launch_description():
    enable_camera_arg = DeclareLaunchArgument(
        'enable_camera',
        default_value='true'
    )

    enable_camera = LaunchConfiguration('enable_camera')

    # Launch camera only if enabled
    camera_node = Node(
        package='camera_pkg',
        executable='camera_node',
        condition=IfCondition(enable_camera)
    )

    # Launch alternative node if camera disabled
    fake_camera_node = Node(
        package='camera_pkg',
        executable='fake_camera',
        condition=UnlessCondition(enable_camera)
    )

    return LaunchDescription([
        enable_camera_arg,
        camera_node,
        fake_camera_node
    ])
```

---

### 3. Composable Node Launch

Composable nodes can be launched in the same process for efficiency (zero-copy communication).

#### Component Container Pattern

```python
from launch import LaunchDescription
from launch_ros.actions import ComposableNodeContainer
from launch_ros.descriptions import ComposableNode

def generate_launch_description():
    # Create container
    container = ComposableNodeContainer(
        name='my_container',
        namespace='',
        package='rclcpp_components',
        executable='component_container',
        composable_node_descriptions=[
            # Load multiple components into container
            ComposableNode(
                package='image_tools',
                plugin='image_tools::Cam2Image',
                name='cam2image',
                parameters=[{'frequency': 30.0}]
            ),
            ComposableNode(
                package='image_tools',
                plugin='image_tools::ImageView',
                name='image_view',
                parameters=[{'reliability': 'best_effort'}]
            ),
        ],
        output='both',
    )

    return LaunchDescription([container])
```

**Benefits:**
- Intra-process communication (zero-copy)
- Lower CPU overhead (single process)
- Shared memory between components

**When to use:**
- High-frequency communication (e.g., camera → processing)
- Resource-constrained systems
- When latency is critical

---

### 4. Including Other Launch Files

Modular launch files improve maintainability.

#### Basic Include

```python
from launch import LaunchDescription
from launch.actions import IncludeLaunchDescription
from launch.launch_description_sources import PythonLaunchDescriptionSource
from ament_index_python.packages import get_package_share_directory
import os

def generate_launch_description():
    pkg_share = get_package_share_directory('my_package')

    # Include another launch file
    sensors_launch = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(
            os.path.join(pkg_share, 'launch', 'sensors.launch.py')
        ),
        launch_arguments={
            'use_sim_time': 'true',
            'sensor_rate': '30'
        }.items()
    )

    navigation_launch = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(
            os.path.join(pkg_share, 'launch', 'navigation.launch.py')
        )
    )

    return LaunchDescription([
        sensors_launch,
        navigation_launch
    ])
```

#### Conditional Include

```python
from launch.conditions import IfCondition

def generate_launch_description():
    use_sensors_arg = DeclareLaunchArgument('use_sensors', default_value='true')
    use_sensors = LaunchConfiguration('use_sensors')

    sensors_launch = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(...),
        condition=IfCondition(use_sensors)
    )

    return LaunchDescription([use_sensors_arg, sensors_launch])
```

---

### 5. Parameter Management

#### Loading Parameters from YAML

```python
from launch_ros.actions import Node
import os
from ament_index_python.packages import get_package_share_directory

def generate_launch_description():
    pkg_share = get_package_share_directory('my_package')
    config_file = os.path.join(pkg_share, 'config', 'params.yaml')

    node = Node(
        package='my_package',
        executable='my_node',
        parameters=[config_file]  # Load params from file
    )

    return LaunchDescription([node])
```

**YAML file format (config/params.yaml):**
```yaml
my_node:
  ros__parameters:
    max_velocity: 1.0
    min_distance: 0.5
    debug: false
    sensor_topics:
      - /scan
      - /camera/image_raw
```

#### Mixing File and Inline Parameters

```python
node = Node(
    package='my_package',
    executable='my_node',
    parameters=[
        config_file,  # Load from file
        {
            'use_sim_time': LaunchConfiguration('use_sim_time'),
            'robot_name': LaunchConfiguration('robot_name')
        }
    ]
)
```

**Override priority:** Inline parameters override file parameters.

#### Dynamic Parameter Loading

```python
from launch.substitutions import PathJoinSubstitution
from launch_ros.substitutions import FindPackageShare

def generate_launch_description():
    config_file = PathJoinSubstitution([
        FindPackageShare('my_package'),
        'config',
        'params.yaml'
    ])

    node = Node(
        package='my_package',
        executable='my_node',
        parameters=[config_file]
    )

    return LaunchDescription([node])
```

---

### 6. Remapping Topics and Services

#### Basic Remapping

```python
node = Node(
    package='my_package',
    executable='my_node',
    remappings=[
        ('/input_topic', '/sensor/data'),
        ('/output_topic', '/processed/data'),
        ('/my_service', '/robot/my_service')
    ]
)
```

#### Namespace Remapping

```python
# All topics prefixed with namespace
node = Node(
    package='my_package',
    executable='my_node',
    namespace='robot1',  # Topics become /robot1/topic_name
    remappings=[
        ('scan', '/global_scan')  # Can still remap to global topic
    ]
)
```

#### Using Launch Arguments for Remapping

```python
def generate_launch_description():
    input_topic_arg = DeclareLaunchArgument(
        'input_topic',
        default_value='/scan'
    )

    node = Node(
        package='my_package',
        executable='my_node',
        remappings=[
            ('scan', LaunchConfiguration('input_topic'))
        ]
    )

    return LaunchDescription([input_topic_arg, node])
```

---

### 7. Event Handlers and Lifecycle Management

#### Restarting on Failure

```python
from launch.actions import RegisterEventHandler
from launch.event_handlers import OnProcessExit
from launch_ros.actions import Node

def generate_launch_description():
    critical_node = Node(
        package='my_package',
        executable='critical_node',
        name='critical_node'
    )

    # Restart if node exits
    restart_handler = RegisterEventHandler(
        OnProcessExit(
            target_action=critical_node,
            on_exit=[
                Node(
                    package='my_package',
                    executable='critical_node',
                    name='critical_node'
                )
            ]
        )
    )

    return LaunchDescription([critical_node, restart_handler])
```

#### Sequential Node Startup

```python
from launch.actions import RegisterEventHandler
from launch.event_handlers import OnProcessStart

def generate_launch_description():
    first_node = Node(package='pkg', executable='first')

    # Start second node after first starts
    second_node = Node(package='pkg', executable='second')
    second_handler = RegisterEventHandler(
        OnProcessStart(
            target_action=first_node,
            on_start=[second_node]
        )
    )

    return LaunchDescription([first_node, second_handler])
```

#### Graceful Shutdown

```python
from launch.actions import Shutdown

node = Node(
    package='my_package',
    executable='my_node',
    on_exit=Shutdown()  # Shutdown entire launch on node exit
)
```

---

### 8. Environment Variables

#### Setting Environment Variables

```python
from launch.actions import SetEnvironmentVariable

def generate_launch_description():
    return LaunchDescription([
        SetEnvironmentVariable('RMW_IMPLEMENTATION', 'rmw_cyclonedds_cpp'),
        SetEnvironmentVariable('RCUTILS_COLORIZED_OUTPUT', '1'),

        Node(package='my_package', executable='my_node')
    ])
```

#### Using Environment Variables

```python
from launch.substitutions import EnvironmentVariable

node = Node(
    package='my_package',
    executable='my_node',
    parameters=[{
        'robot_id': EnvironmentVariable('ROBOT_ID', default_value='robot1')
    }]
)
```

---

### 9. Group Actions and Scoping

#### Grouping Nodes

```python
from launch.actions import GroupAction
from launch_ros.actions import PushRosNamespace

def generate_launch_description():
    # Group nodes under namespace
    robot1_group = GroupAction([
        PushRosNamespace('robot1'),
        Node(package='pkg', executable='node1'),
        Node(package='pkg', executable='node2'),
    ])

    robot2_group = GroupAction([
        PushRosNamespace('robot2'),
        Node(package='pkg', executable='node1'),
        Node(package='pkg', executable='node2'),
    ])

    return LaunchDescription([robot1_group, robot2_group])
```

#### Conditional Groups

```python
from launch.conditions import IfCondition

enable_robot2 = LaunchConfiguration('enable_robot2')

robot2_group = GroupAction(
    actions=[
        PushRosNamespace('robot2'),
        Node(package='pkg', executable='node1'),
    ],
    condition=IfCondition(enable_robot2)
)
```

---

### 10. Launch File Best Practices Summary

**1. Structure:**
- Use modular launch files (one per subsystem)
- Include launch files for composition
- Separate configuration (YAML) from launch logic

**2. Arguments:**
- Provide defaults for all arguments
- Add descriptions
- Use choices for enum-like arguments
- Document required vs optional

**3. Parameters:**
- Store parameters in YAML files
- Use launch arguments for runtime overrides
- Group related parameters

**4. Namespaces:**
- Use namespaces for multi-robot systems
- Be consistent with naming conventions
- Document remapping expectations

**5. Error Handling:**
- Add restart handlers for critical nodes
- Use `on_exit` for cleanup
- Validate arguments

**6. Documentation:**
- Comment complex logic
- Provide usage examples
- Document all launch arguments

---

## Edge Cases

### Edge Case 1: Launch Argument Type Coercion

**Scenario:**
Launch arguments are always strings, but nodes expect typed parameters (bool, int, float). Improper handling causes type mismatches.

**Example:**

```python
# BAD: String "false" is truthy in Python!
def generate_launch_description():
    use_sim_arg = DeclareLaunchArgument('use_sim', default_value='false')
    use_sim = LaunchConfiguration('use_sim')

    node = Node(
        package='my_package',
        executable='my_node',
        parameters=[{'use_sim_time': use_sim}]
    )

    return LaunchDescription([use_sim_arg, node])
```

**Problem:**

```bash
ros2 launch my_package my_launch.py use_sim:=false

# In node parameter callback:
bool use_sim = get_parameter("use_sim_time").as_bool();
# ERROR: rclcpp::exceptions::InvalidParameterTypeException
# Expected bool, got string "false"
```

**Why:**
- `LaunchConfiguration` returns string
- Node expects bool
- String "false" != bool false

**Solution 1: Use TextSubstitution with Evaluation**

```python
from launch.substitutions import LaunchConfiguration, TextSubstitution

def generate_launch_description():
    use_sim_arg = DeclareLaunchArgument('use_sim', default_value='false')
    use_sim = LaunchConfiguration('use_sim')

    node = Node(
        package='my_package',
        executable='my_node',
        parameters=[{
            'use_sim_time': LaunchConfiguration('use_sim')
        }],
        # Let the node parameter system handle conversion
        ros_arguments=['--param', 'use_sim_time:=', use_sim]
    )

    return LaunchDescription([use_sim_arg, node])
```

**Solution 2: Explicit Type Conversion in Launch File**

```python
from launch.substitutions import PythonExpression

def generate_launch_description():
    use_sim_arg = DeclareLaunchArgument('use_sim', default_value='false')

    # Convert string to bool
    use_sim_bool = PythonExpression([
        '"true" if "',
        LaunchConfiguration('use_sim'),
        '" == "true" else "false"'
    ])

    node = Node(
        package='my_package',
        executable='my_node',
        parameters=[{
            'use_sim_time': use_sim_bool
        }]
    )

    return LaunchDescription([use_sim_arg, node])
```

**Solution 3: Use YAML for Type Safety**

```python
# In launch file
def generate_launch_description():
    # Load from YAML (properly typed)
    config_file = os.path.join(
        get_package_share_directory('my_package'),
        'config',
        'params.yaml'
    )

    # Override specific params from launch args if needed
    use_sim = LaunchConfiguration('use_sim')

    node = Node(
        package='my_package',
        executable='my_node',
        parameters=[
            config_file,  # Base config with types
            {'use_sim_time': use_sim}  # Override from CLI
        ]
    )

    return LaunchDescription([...])
```

```yaml
# config/params.yaml - properly typed
my_node:
  ros__parameters:
    use_sim_time: false  # bool, not string
    rate: 10  # int, not string
    threshold: 0.5  # float, not string
```

**Best Practice:**
- **For simple cases:** Let ROS2 parameter system handle conversion
- **For complex cases:** Use YAML files with proper types
- **Always test:** `ros2 param get /node param_name` to verify type

**Verification:**

```bash
ros2 launch my_package my_launch.py use_sim:=true

# In another terminal
ros2 param get /my_node use_sim_time
# Should show: Boolean value is: True (not String value)
```

---

### Edge Case 2: Package Not Found Due to Missing Installation

**Scenario:**
Launch file tries to include a launch file or load a config file from a package, but the file wasn't installed in CMakeLists.txt/setup.py.

**Example:**

```python
# launch/main.launch.py
def generate_launch_description():
    pkg_share = get_package_share_directory('my_package')

    # Try to load config
    config = os.path.join(pkg_share, 'config', 'params.yaml')

    node = Node(
        package='my_package',
        executable='my_node',
        parameters=[config]  # File doesn't exist!
    )

    return LaunchDescription([node])
```

**Error:**

```bash
ros2 launch my_package main.launch.py

FileNotFoundError: [Errno 2] No such file or directory:
'/opt/ros/humble/share/my_package/config/params.yaml'
```

**Problem:**
Config file exists in source tree but wasn't installed.

**Solution: Install Files in CMakeLists.txt**

```cmake
cmake_minimum_required(VERSION 3.8)
project(my_package)

# ... build configuration ...

# Install launch files
install(DIRECTORY
  launch
  DESTINATION share/${PROJECT_NAME}/
)

# Install config files
install(DIRECTORY
  config
  DESTINATION share/${PROJECT_NAME}/
)

# Install URDF, meshes, etc.
install(DIRECTORY
  urdf
  meshes
  DESTINATION share/${PROJECT_NAME}/
)

ament_package()
```

**For Python packages (setup.py):**

```python
from setuptools import setup
import os
from glob import glob

package_name = 'my_package'

setup(
    name=package_name,
    version='0.0.1',
    packages=[package_name],
    data_files=[
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
        # Install launch files
        (os.path.join('share', package_name, 'launch'),
            glob('launch/*.launch.py')),
        # Install config files
        (os.path.join('share', package_name, 'config'),
            glob('config/*.yaml')),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    # ...
)
```

**Verification After Installation:**

```bash
# Rebuild with install
colcon build --packages-select my_package

# Check installed files
ls $(ros2 pkg prefix my_package)/share/my_package/
# Should show: launch/ config/ urdf/ etc.

# Check specific file
ls $(ros2 pkg prefix my_package)/share/my_package/config/params.yaml
```

**Pro Tip: Check Installation in CI**

```yaml
# .github/workflows/test.yml
- name: Verify installation
  run: |
    source install/setup.bash
    test -f $(ros2 pkg prefix my_package)/share/my_package/config/params.yaml || exit 1
    test -f $(ros2 pkg prefix my_package)/share/my_package/launch/main.launch.py || exit 1
```

---

### Edge Case 3: Node Order Dependency Causing Race Conditions

**Scenario:**
Node B depends on services/topics from Node A, but Node B starts before Node A is ready, causing failures or timeouts.

**Example:**

```python
# BAD: No ordering guarantees
def generate_launch_description():
    # Map server must be ready before localization
    map_server = Node(
        package='nav2_map_server',
        executable='map_server',
        parameters=[{'yaml_filename': 'map.yaml'}]
    )

    # Needs map from map_server
    localization = Node(
        package='nav2_amcl',
        executable='amcl'
    )

    return LaunchDescription([
        map_server,
        localization  # May start before map_server ready!
    ])
```

**Problem:**
- Both nodes start simultaneously
- `amcl` tries to request map service immediately
- Service not available yet → timeout or failure

**Solution 1: Use Event Handlers for Sequencing**

```python
from launch.actions import RegisterEventHandler
from launch.event_handlers import OnProcessStart

def generate_launch_description():
    map_server = Node(
        package='nav2_map_server',
        executable='map_server',
        name='map_server',
        parameters=[{'yaml_filename': 'map.yaml'}]
    )

    # Start localization AFTER map_server starts
    localization = Node(
        package='nav2_amcl',
        executable='amcl',
        name='amcl'
    )

    localization_handler = RegisterEventHandler(
        OnProcessStart(
            target_action=map_server,
            on_start=[localization]
        )
    )

    return LaunchDescription([
        map_server,
        localization_handler
    ])
```

**Solution 2: Add Startup Delay**

```python
from launch.actions import TimerAction

def generate_launch_description():
    map_server = Node(
        package='nav2_map_server',
        executable='map_server',
        parameters=[{'yaml_filename': 'map.yaml'}]
    )

    # Delay localization startup by 3 seconds
    localization_delayed = TimerAction(
        period=3.0,
        actions=[
            Node(
                package='nav2_amcl',
                executable='amcl'
            )
        ]
    )

    return LaunchDescription([
        map_server,
        localization_delayed
    ])
```

**Solution 3: Lifecycle Nodes (Best for Production)**

Use managed/lifecycle nodes for explicit state management:

```python
from launch_ros.actions import LifecycleNode
from launch.actions import RegisterEventHandler, EmitEvent
from launch.event_handlers import OnStateTransition
from lifecycle_msgs.msg import Transition

def generate_launch_description():
    # Lifecycle node
    map_server = LifecycleNode(
        package='nav2_map_server',
        executable='map_server',
        name='map_server',
        namespace='',
        parameters=[{'yaml_filename': 'map.yaml'}]
    )

    # Configure map_server
    configure_map_server = EmitEvent(
        event=ChangeState(
            lifecycle_node_matcher=matches_action(map_server),
            transition_id=Transition.TRANSITION_CONFIGURE
        )
    )

    # When map_server reaches INACTIVE, activate it
    activate_map_server = RegisterEventHandler(
        OnStateTransition(
            target_lifecycle_node=map_server,
            goal_state='inactive',
            entities=[
                EmitEvent(
                    event=ChangeState(
                        lifecycle_node_matcher=matches_action(map_server),
                        transition_id=Transition.TRANSITION_ACTIVATE
                    )
                )
            ]
        )
    )

    # When map_server reaches ACTIVE, start localization
    localization = Node(
        package='nav2_amcl',
        executable='amcl'
    )

    start_localization = RegisterEventHandler(
        OnStateTransition(
            target_lifecycle_node=map_server,
            goal_state='active',
            entities=[localization]
        )
    )

    return LaunchDescription([
        map_server,
        configure_map_server,
        activate_map_server,
        start_localization
    ])
```

**Solution 4: Node-Side Retry Logic**

```cpp
// In dependent node (amcl)
class LocalizationNode : public rclcpp::Node {
public:
    LocalizationNode() : Node("amcl") {
        map_client_ = create_client<nav_msgs::srv::GetMap>("map");

        // Wait for map service with timeout
        if (!map_client_->wait_for_service(std::chrono::seconds(10))) {
            RCLCPP_ERROR(get_logger(), "Map service not available after 10s");
            throw std::runtime_error("Map service timeout");
        }

        // Service available, continue initialization
        request_map();
    }
};
```

**Best Practice:**
- Use event handlers for deterministic ordering
- Add timeouts and retry logic in nodes
- Use lifecycle nodes for complex dependencies
- Document startup order requirements

---

### Edge Case 4: Parameter Overriding Confusion

**Scenario:**
Parameters loaded from multiple sources (YAML, command line, launch file) with unclear precedence, leading to unexpected values.

**Example:**

```yaml
# config/default.yaml
my_node:
  ros__parameters:
    max_speed: 1.0
    debug: false
```

```python
# launch/robot.launch.py
def generate_launch_description():
    config_file = 'config/default.yaml'

    node = Node(
        package='my_package',
        executable='my_node',
        parameters=[
            config_file,
            {'max_speed': 2.0},  # Override from launch file
            {'debug': True}
        ]
    )

    return LaunchDescription([node])
```

```bash
# Command line override
ros2 launch my_package robot.launch.py --ros-args -p max_speed:=3.0
```

**Question:** What is the final value of `max_speed`?

**Answer:** It depends on parameter override order!

**Parameter Precedence (lowest to highest):**
1. YAML file
2. Inline launch file parameters
3. Command-line arguments

**Final values:**
- `max_speed: 3.0` (command line wins)
- `debug: True` (launch file override)

**Problem:**
This can be confusing and lead to hard-to-debug issues.

**Solution: Explicit Parameter Management**

```python
def generate_launch_description():
    # Declare all overridable parameters as launch arguments
    max_speed_arg = DeclareLaunchArgument(
        'max_speed',
        default_value='1.0',
        description='Maximum speed (m/s)'
    )

    debug_arg = DeclareLaunchArgument(
        'debug',
        default_value='false',
        description='Enable debug mode'
    )

    # Load base config
    config_file = PathJoinSubstitution([
        FindPackageShare('my_package'),
        'config',
        'default.yaml'
    ])

    node = Node(
        package='my_package',
        executable='my_node',
        parameters=[
            config_file,  # Base configuration
            {
                # Explicit overrides from launch arguments
                'max_speed': LaunchConfiguration('max_speed'),
                'debug': LaunchConfiguration('debug')
            }
        ]
    )

    return LaunchDescription([
        max_speed_arg,
        debug_arg,
        node
    ])
```

**Now usage is clear:**

```bash
# Override via launch arguments
ros2 launch my_package robot.launch.py max_speed:=2.5 debug:=true

# Check actual value
ros2 param get /my_node max_speed
# Float value is: 2.5
```

**Best Practices:**
1. **Document parameter sources:**
   ```python
   # In launch file comments
   # Parameters loaded in order:
   # 1. config/default.yaml (base configuration)
   # 2. Launch arguments (runtime overrides)
   ```

2. **Use launch arguments for all runtime parameters:**
   ```python
   # All overridable params as launch args
   DeclareLaunchArgument('param1', default_value='...'),
   DeclareLaunchArgument('param2', default_value='...'),
   ```

3. **Separate environment-specific configs:**
   ```python
   # config/sim.yaml, config/hardware.yaml
   env_arg = DeclareLaunchArgument('env', default_value='sim')
   config_file = PathJoinSubstitution([
       FindPackageShare('my_package'),
       'config',
       [LaunchConfiguration('env'), '.yaml']
   ])
   ```

4. **Log loaded parameters:**
   ```cpp
   // In node
   RCLCPP_INFO(get_logger(), "Loaded parameters:");
   RCLCPP_INFO(get_logger(), "  max_speed: %.2f", get_parameter("max_speed").as_double());
   RCLCPP_INFO(get_logger(), "  debug: %s", get_parameter("debug").as_bool() ? "true" : "false");
   ```

---

## Code Examples

### Example 1: Production-Ready Multi-Robot Launch System

A comprehensive launch setup for deploying multiple robots with proper configuration management.

**Directory Structure:**

```
my_robot_system/
├── launch/
│   ├── robot.launch.py           # Main robot launch
│   ├── sensors.launch.py         # Sensor subsystem
│   ├── navigation.launch.py      # Navigation subsystem
│   └── multi_robot.launch.py     # Multi-robot coordinator
├── config/
│   ├── common.yaml               # Common parameters
│   ├── robot1.yaml               # Robot 1 specific
│   ├── robot2.yaml               # Robot 2 specific
│   └── sensors/
│       ├── lidar.yaml
│       └── camera.yaml
└── CMakeLists.txt
```

**1. Main Robot Launch (launch/robot.launch.py):**

```python
from launch import LaunchDescription
from launch.actions import (
    DeclareLaunchArgument,
    GroupAction,
    IncludeLaunchDescription,
    OpaqueFunction
)
from launch.conditions import IfCondition
from launch.substitutions import LaunchConfiguration, PathJoinSubstitution
from launch_ros.actions import Node, PushRosNamespace
from launch_ros.substitutions import FindPackageShare
from launch.launch_description_sources import PythonLaunchDescriptionSource
import os

def launch_setup(context, *args, **kwargs):
    """
    This function is called with launch context to allow dynamic evaluation
    of LaunchConfiguration values.
    """
    # Get launch arguments
    robot_name = LaunchConfiguration('robot_name').perform(context)
    use_sim_time = LaunchConfiguration('use_sim_time')
    enable_sensors = LaunchConfiguration('enable_sensors')
    enable_navigation = LaunchConfiguration('enable_navigation')

    pkg_share = FindPackageShare('my_robot_system').find('my_robot_system')

    # Load robot-specific config
    robot_config = PathJoinSubstitution([
        FindPackageShare('my_robot_system'),
        'config',
        f'{robot_name}.yaml'
    ])

    # Check if config exists
    robot_config_path = os.path.join(pkg_share, 'config', f'{robot_name}.yaml')
    if not os.path.exists(robot_config_path):
        print(f"WARNING: Config file not found: {robot_config_path}")
        print(f"Using default config instead")
        robot_config = PathJoinSubstitution([
            FindPackageShare('my_robot_system'),
            'config',
            'common.yaml'
        ])

    # Robot state publisher
    robot_state_publisher = Node(
        package='robot_state_publisher',
        executable='robot_state_publisher',
        name='robot_state_publisher',
        parameters=[
            robot_config,
            {'use_sim_time': use_sim_time}
        ]
    )

    # Include sensor launch
    sensors_launch = IncludeLaunchDescription(
        PythonLaunchDescriptionSource([
            PathJoinSubstitution([
                FindPackageShare('my_robot_system'),
                'launch',
                'sensors.launch.py'
            ])
        ]),
        launch_arguments={
            'robot_name': robot_name,
            'use_sim_time': use_sim_time
        }.items(),
        condition=IfCondition(enable_sensors)
    )

    # Include navigation launch
    navigation_launch = IncludeLaunchDescription(
        PythonLaunchDescriptionSource([
            PathJoinSubstitution([
                FindPackageShare('my_robot_system'),
                'launch',
                'navigation.launch.py'
            ])
        ]),
        launch_arguments={
            'robot_name': robot_name,
            'use_sim_time': use_sim_time
        }.items(),
        condition=IfCondition(enable_navigation)
    )

    # Group all nodes under robot namespace
    robot_group = GroupAction([
        PushRosNamespace(robot_name),
        robot_state_publisher,
        sensors_launch,
        navigation_launch
    ])

    return [robot_group]

def generate_launch_description():
    # Declare arguments
    robot_name_arg = DeclareLaunchArgument(
        'robot_name',
        default_value='robot1',
        description='Name of the robot (used for namespace and config)'
    )

    use_sim_time_arg = DeclareLaunchArgument(
        'use_sim_time',
        default_value='false',
        choices=['true', 'false'],
        description='Use simulation time'
    )

    enable_sensors_arg = DeclareLaunchArgument(
        'enable_sensors',
        default_value='true',
        choices=['true', 'false'],
        description='Launch sensor drivers'
    )

    enable_navigation_arg = DeclareLaunchArgument(
        'enable_navigation',
        default_value='true',
        choices=['true', 'false'],
        description='Launch navigation stack'
    )

    log_level_arg = DeclareLaunchArgument(
        'log_level',
        default_value='info',
        choices=['debug', 'info', 'warn', 'error'],
        description='Logging level for all nodes'
    )

    return LaunchDescription([
        robot_name_arg,
        use_sim_time_arg,
        enable_sensors_arg,
        enable_navigation_arg,
        log_level_arg,
        OpaqueFunction(function=launch_setup)
    ])
```

**2. Sensors Launch (launch/sensors.launch.py):**

```python
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration, PathJoinSubstitution
from launch_ros.actions import Node
from launch_ros.substitutions import FindPackageShare

def generate_launch_description():
    robot_name = LaunchConfiguration('robot_name')
    use_sim_time = LaunchConfiguration('use_sim_time')

    # Lidar config
    lidar_config = PathJoinSubstitution([
        FindPackageShare('my_robot_system'),
        'config',
        'sensors',
        'lidar.yaml'
    ])

    # Camera config
    camera_config = PathJoinSubstitution([
        FindPackageShare('my_robot_system'),
        'config',
        'sensors',
        'camera.yaml'
    ])

    # Lidar driver
    lidar_node = Node(
        package='lidar_driver',
        executable='lidar_node',
        name='lidar',
        parameters=[
            lidar_config,
            {'use_sim_time': use_sim_time}
        ],
        remappings=[
            ('scan', 'scan_raw')
        ],
        respawn=True,  # Restart on failure
        respawn_delay=2.0
    )

    # Lidar filter
    lidar_filter = Node(
        package='laser_filters',
        executable='scan_to_scan_filter_chain',
        name='lidar_filter',
        parameters=[
            lidar_config,
            {'use_sim_time': use_sim_time}
        ],
        remappings=[
            ('scan', 'scan_raw'),
            ('scan_filtered', 'scan')
        ]
    )

    # Camera driver
    camera_node = Node(
        package='camera_driver',
        executable='camera_node',
        name='camera',
        parameters=[
            camera_config,
            {'use_sim_time': use_sim_time}
        ],
        remappings=[
            ('image_raw', 'camera/image_raw'),
            ('camera_info', 'camera/camera_info')
        ],
        respawn=True,
        respawn_delay=2.0
    )

    return LaunchDescription([
        DeclareLaunchArgument('robot_name'),
        DeclareLaunchArgument('use_sim_time'),
        lidar_node,
        lidar_filter,
        camera_node
    ])
```

**3. Multi-Robot Coordinator (launch/multi_robot.launch.py):**

```python
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, IncludeLaunchDescription
from launch.substitutions import LaunchConfiguration, PathJoinSubstitution
from launch_ros.substitutions import FindPackageShare
from launch.launch_description_sources import PythonLaunchDescriptionSource

def generate_launch_description():
    use_sim_time = LaunchConfiguration('use_sim_time')
    num_robots = LaunchConfiguration('num_robots')

    # Launch multiple robots
    robot_launches = []
    for i in range(1, 4):  # Support up to 3 robots
        robot_launch = IncludeLaunchDescription(
            PythonLaunchDescriptionSource([
                PathJoinSubstitution([
                    FindPackageShare('my_robot_system'),
                    'launch',
                    'robot.launch.py'
                ])
            ]),
            launch_arguments={
                'robot_name': f'robot{i}',
                'use_sim_time': use_sim_time,
                'enable_sensors': 'true',
                'enable_navigation': 'true'
            }.items()
        )
        robot_launches.append(robot_launch)

    return LaunchDescription([
        DeclareLaunchArgument(
            'use_sim_time',
            default_value='true',
            description='Use simulation time'
        ),
        DeclareLaunchArgument(
            'num_robots',
            default_value='2',
            description='Number of robots to launch'
        ),
        *robot_launches
    ])
```

**4. Config Files:**

```yaml
# config/common.yaml
robot_state_publisher:
  ros__parameters:
    use_sim_time: true
    publish_frequency: 50.0

# config/robot1.yaml
robot_state_publisher:
  ros__parameters:
    robot_description_file: robot1.urdf

navigation:
  ros__parameters:
    max_velocity: 1.0
    min_velocity: 0.1

# config/sensors/lidar.yaml
lidar:
  ros__parameters:
    frame_id: "laser_link"
    scan_frequency: 10
    angle_min: -3.14159
    angle_max: 3.14159
    range_min: 0.1
    range_max: 30.0

laser_filters:
  ros__parameters:
    filter_chain:
      - name: range_filter
        type: laser_filters/LaserScanRangeFilter
        params:
          lower_threshold: 0.2
          upper_threshold: 10.0
```

**5. CMakeLists.txt:**

```cmake
cmake_minimum_required(VERSION 3.8)
project(my_robot_system)

find_package(ament_cmake REQUIRED)

# Install launch files
install(DIRECTORY
  launch
  DESTINATION share/${PROJECT_NAME}/
)

# Install config files
install(DIRECTORY
  config
  DESTINATION share/${PROJECT_NAME}/
)

# Install URDF files
install(DIRECTORY
  urdf
  DESTINATION share/${PROJECT_NAME}/
)

ament_package()
```

**Usage:**

```bash
# Launch single robot
ros2 launch my_robot_system robot.launch.py robot_name:=robot1

# Launch with custom options
ros2 launch my_robot_system robot.launch.py \
    robot_name:=robot2 \
    use_sim_time:=true \
    enable_navigation:=false \
    log_level:=debug

# Launch multiple robots
ros2 launch my_robot_system multi_robot.launch.py num_robots:=3

# Launch in simulation
ros2 launch my_robot_system robot.launch.py use_sim_time:=true
```

**What This Demonstrates:**
- Modular launch file architecture
- Dynamic configuration loading
- Proper parameter management
- Multi-robot support with namespaces
- Conditional includes
- Respawn on failure
- Comprehensive documentation via arguments

---

### Example 2: Component Container with Dynamic Loading

```python
# launch/composable_pipeline.launch.py
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, TimerAction
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import ComposableNodeContainer, LoadComposableNodes
from launch_ros.descriptions import ComposableNode

def generate_launch_description():
    use_sim_time = LaunchConfiguration('use_sim_time')

    # Create container
    container = ComposableNodeContainer(
        name='processing_container',
        namespace='',
        package='rclcpp_components',
        executable='component_container_mt',  # Multi-threaded
        composable_node_descriptions=[
            # Camera component
            ComposableNode(
                package='image_tools',
                plugin='image_tools::Cam2Image',
                name='camera',
                parameters=[{
                    'frequency': 30.0,
                    'use_sim_time': use_sim_time
                }],
                extra_arguments=[{'use_intra_process_comms': True}]
            ),
        ],
        output='both',
    )

    # Dynamically load additional components after delay
    # (Useful for staged startup)
    load_processors = TimerAction(
        period=2.0,  # Wait 2 seconds
        actions=[
            LoadComposableNodes(
                target_container='processing_container',
                composable_node_descriptions=[
                    # Image processor component
                    ComposableNode(
                        package='image_processing',
                        plugin='image_processing::ImageProcessor',
                        name='processor',
                        parameters=[{'use_sim_time': use_sim_time}],
                        remappings=[
                            ('image_raw', 'camera/image_raw'),
                            ('image_processed', 'processed/image')
                        ],
                        extra_arguments=[{'use_intra_process_comms': True}]
                    ),
                    # Object detector component
                    ComposableNode(
                        package='object_detection',
                        plugin='object_detection::Detector',
                        name='detector',
                        parameters=[{
                            'use_sim_time': use_sim_time,
                            'confidence_threshold': 0.7
                        }],
                        remappings=[
                            ('image', 'processed/image'),
                            ('detections', 'objects')
                        ],
                        extra_arguments=[{'use_intra_process_comms': True}]
                    ),
                ]
            )
        ]
    )

    return LaunchDescription([
        DeclareLaunchArgument('use_sim_time', default_value='false'),
        container,
        load_processors
    ])
```

**Benefits:**
- Zero-copy communication between components
- Lower CPU overhead
- Staged component loading
- Easy to add/remove components

---

## Interview Questions

### Question 1: What are the advantages of using Python launch files over XML in ROS2?

**Difficulty:** ⭐⭐ (Medium)

**Answer:**

Python launch files offer significantly more flexibility than XML:

**1. Programmatic Logic:**

```python
# Python: Conditional logic
if some_condition:
    nodes.append(camera_node)
else:
    nodes.append(fake_camera_node)

# XML: Limited conditional support
```

**2. Dynamic Configuration:**

```python
# Python: Generate nodes in loop
for i in range(num_robots):
    nodes.append(Node(
        package='my_pkg',
        executable='my_node',
        namespace=f'robot{i}'
    ))

# XML: Must manually specify each node
```

**3. Complex Substitutions:**

```python
# Python: Full Python expressions
robot_config = PathJoinSubstitution([
    FindPackageShare('my_pkg'),
    'config',
    [LaunchConfiguration('env'), '.yaml']
])

# XML: Limited substitution support
```

**4. Error Handling:**

```python
# Python: Try-catch, validation
try:
    config_path = os.path.join(pkg_share, 'config', f'{robot_name}.yaml')
    if not os.path.exists(config_path):
        raise FileNotFoundError(f"Config not found: {config_path}")
except Exception as e:
    print(f"Error: {e}")
    # Use fallback config
```

**5. Reusability:**

```python
# Python: Functions for repeated patterns
def create_robot_node(name, namespace):
    return Node(
        package='robot_pkg',
        executable='robot_node',
        name=name,
        namespace=namespace
    )

robots = [create_robot_node(f'robot{i}', f'ns{i}') for i in range(5)]
```

**When to use XML:**
- Simple, static launch files
- For users uncomfortable with Python
- When declarative style is preferred

**When to use Python:**
- Complex startup logic
- Dynamic node generation
- Multi-robot systems
- Conditional includes

**Modern ROS2 practice:** Python launch files are strongly preferred for production systems.

---

### Question 2: How would you handle different configurations for simulation vs. real hardware?

**Difficulty:** ⭐⭐ (Medium)

**Answer:**

I would use a combination of launch arguments and environment-specific config files:

**Approach 1: Launch Argument with Conditional Includes**

```python
def generate_launch_description():
    env_arg = DeclareLaunchArgument(
        'env',
        default_value='sim',
        choices=['sim', 'hardware'],
        description='Environment: sim or hardware'
    )

    env = LaunchConfiguration('env')

    # Simulation nodes
    sim_nodes = GroupAction(
        actions=[
            IncludeLaunchDescription(..., 'gazebo.launch.py'),
            Node(package='sim_driver', executable='fake_sensor')
        ],
        condition=IfCondition(PythonExpression(['"', env, '" == "sim"']))
    )

    # Hardware nodes
    hw_nodes = GroupAction(
        actions=[
            Node(package='hw_driver', executable='real_sensor'),
            Node(package='hw_driver', executable='motor_controller')
        ],
        condition=IfCondition(PythonExpression(['"', env, '" == "hardware"']))
    )

    return LaunchDescription([env_arg, sim_nodes, hw_nodes])
```

**Approach 2: Separate Config Files**

```python
def generate_launch_description():
    env_arg = DeclareLaunchArgument('env', default_value='sim')
    env = LaunchConfiguration('env')

    # Load environment-specific config
    config_file = PathJoinSubstitution([
        FindPackageShare('my_package'),
        'config',
        [env, '.yaml']  # sim.yaml or hardware.yaml
    ])

    node = Node(
        package='my_package',
        executable='my_node',
        parameters=[
            config_file,
            {'use_sim_time': PythonExpression(['"', env, '" == "sim"'])}
        ]
    )

    return LaunchDescription([env_arg, node])
```

```yaml
# config/sim.yaml
my_node:
  ros__parameters:
    use_sim_time: true
    sensor_topic: /sim/sensor
    update_rate: 100  # Fast in sim

# config/hardware.yaml
my_node:
  ros__parameters:
    use_sim_time: false
    sensor_topic: /hardware/sensor
    update_rate: 10  # Hardware limited to 10Hz
    device_path: /dev/ttyUSB0
```

**Approach 3: Environment Variables**

```bash
# Set environment
export ROBOT_ENV=hardware

# In launch file
env = os.environ.get('ROBOT_ENV', 'sim')
```

**Best Practice: Combination Approach**

```python
def generate_launch_description():
    # Allow override via launch arg or environment variable
    default_env = os.environ.get('ROBOT_ENV', 'sim')

    env_arg = DeclareLaunchArgument(
        'env',
        default_value=default_env,
        choices=['sim', 'hardware'],
        description=f'Environment (default from ROBOT_ENV: {default_env})'
    )

    # Load base + environment-specific configs
    base_config = PathJoinSubstitution([..., 'base.yaml'])
    env_config = PathJoinSubstitution([..., [LaunchConfiguration('env'), '.yaml']])

    node = Node(
        package='my_package',
        executable='my_node',
        parameters=[
            base_config,      # Common parameters
            env_config,       # Environment-specific overrides
            {'use_sim_time': PythonExpression(['"', LaunchConfiguration('env'), '" == "sim"'])}
        ]
    )

    return LaunchDescription([env_arg, node])
```

**Usage:**

```bash
# Simulation
ros2 launch my_package robot.launch.py env:=sim

# Hardware
ros2 launch my_package robot.launch.py env:=hardware

# Or via environment variable
export ROBOT_ENV=hardware
ros2 launch my_package robot.launch.py
```

---

### Question 3: Explain the purpose of ComposableNodeContainer and when you would use it.

**Difficulty:** ⭐⭐⭐ (Hard)

**Answer:**

`ComposableNodeContainer` loads multiple node components into a single process, enabling **intra-process communication** (zero-copy message passing).

**Traditional Multi-Node (Separate Processes):**

```
Process 1: Camera Node
  ↓ (serialization, copy, DDS)
Process 2: Image Processor
  ↓ (serialization, copy, DDS)
Process 3: Object Detector
```

**Cost:**
- 2× serialization
- 2× deserialization
- 2× memory copies
- DDS overhead

**Composable Container (Single Process):**

```
Process: Component Container
  ├─ Camera Component
  │   ↓ (shared_ptr, zero-copy)
  ├─ Image Processor Component
  │   ↓ (shared_ptr, zero-copy)
  └─ Object Detector Component
```

**Cost:**
- 0× serialization
- 0× copies (just passing pointers)
- No DDS overhead

**When to Use:**

**✅ Use Composable Containers When:**
1. **High-frequency communication** (>10 Hz)
   - Camera pipelines (30+ FPS)
   - Sensor fusion (100+ Hz IMU)

2. **Large messages**
   - Images (1-10 MB)
   - Point clouds (10+ MB)

3. **Resource-constrained systems**
   - Embedded platforms
   - Limited RAM/CPU

4. **Latency-critical**
   - Real-time control loops
   - Safety-critical systems

**❌ Don't Use When:**
1. **Different machines** (components must be in same process)
2. **Language mixing** (C++ component can't share memory with Python)
3. **Isolation needed** (crash in one component crashes all)
4. **Development/debugging** (separate processes easier to debug)

**Example: Camera Processing Pipeline**

```python
from launch_ros.actions import ComposableNodeContainer
from launch_ros.descriptions import ComposableNode

container = ComposableNodeContainer(
    name='vision_container',
    namespace='',
    package='rclcpp_components',
    executable='component_container',
    composable_node_descriptions=[
        # Camera driver (publishes images)
        ComposableNode(
            package='camera_driver',
            plugin='camera_driver::CameraNode',
            name='camera',
            extra_arguments=[{'use_intra_process_comms': True}]
        ),
        # Image rectification
        ComposableNode(
            package='image_proc',
            plugin='image_proc::RectifyNode',
            name='rectify',
            remappings=[('image_raw', 'camera/image_raw')],
            extra_arguments=[{'use_intra_process_comms': True}]
        ),
        # Object detection
        ComposableNode(
            package='object_detection',
            plugin='object_detection::DetectorNode',
            name='detector',
            remappings=[('image', 'rectified_image')],
            extra_arguments=[{'use_intra_process_comms': True}]
        ),
    ],
    output='both',
)
```

**Key Points:**
- `extra_arguments=[{'use_intra_process_comms': True}]` enables zero-copy
- Components must publish with `unique_ptr` for zero-copy:
  ```cpp
  auto msg = std::make_unique<Image>();
  publisher_->publish(std::move(msg));  // Zero-copy!
  ```
- All components in container share same process = single point of failure

**Performance Comparison:**

| Metric | Separate Processes | Composable Container |
|--------|-------------------|---------------------|
| 1080p image latency | ~50ms | ~5ms |
| CPU usage (3 nodes) | 45% | 15% |
| Memory copies | 6 (pub+sub × 3) | 0 |

---

### Question 4: How would you debug a launch file that's not starting nodes correctly?

**Difficulty:** ⭐⭐ (Medium)

**Answer:**

**Step 1: Check Launch Output**

```bash
# Run with verbose output
ros2 launch my_package my_launch.py --show-args
ros2 launch my_package my_launch.py --show-all-subprocesses-output

# Or use --debug for maximum verbosity
ros2 launch my_package my_launch.py --debug
```

**Step 2: Verify Nodes Started**

```bash
# Check if nodes are running
ros2 node list

# If node not listed, check process
ps aux | grep my_node

# Check for error messages
ros2 launch my_package my_launch.py 2>&1 | tee launch_log.txt
```

**Step 3: Check Launch Arguments**

```bash
# Print all launch arguments
ros2 launch my_package my_launch.py --show-args

# Verify argument values
ros2 launch my_package my_launch.py my_arg:=value --print-description
```

**Step 4: Validate Config Files**

```python
# Add validation in launch file
import os

config_path = os.path.join(pkg_share, 'config', 'params.yaml')
if not os.path.exists(config_path):
    raise FileNotFoundError(f"Config not found: {config_path}")
print(f"Loading config from: {config_path}")
```

**Step 5: Test Node Independently**

```bash
# Run node directly (bypass launch file)
ros2 run my_package my_node --ros-args -p param:=value

# If this works, issue is in launch file
```

**Step 6: Add Logging to Launch File**

```python
from launch.actions import LogInfo

def generate_launch_description():
    return LaunchDescription([
        LogInfo(msg="Starting launch file..."),
        LogInfo(msg=["Robot name: ", LaunchConfiguration('robot_name')]),

        node,

        LogInfo(msg="Launch file completed")
    ])
```

**Step 7: Check Common Issues**

```python
# Issue 1: Package not found
try:
    pkg_share = get_package_share_directory('my_package')
except PackageNotFoundError:
    raise Exception("Package 'my_package' not found. Did you build and source?")

# Issue 2: Executable not found
# Check if executable exists
executable_path = os.path.join(pkg_share, 'lib', 'my_package', 'my_node')
if not os.path.exists(executable_path):
    raise Exception(f"Executable not found: {executable_path}")

# Issue 3: Wrong parameter type
# Use explicit type conversion
parameters=[{
    'use_sim_time': True,  # bool, not string "true"
    'rate': 10,  # int, not string "10"
}]
```

**Step 8: Use Python Debugger**

```bash
# Run launch with pdb
python3 -m pdb /opt/ros/humble/bin/ros2 launch my_package my_launch.py

# Set breakpoint in launch file
def generate_launch_description():
    import pdb; pdb.set_trace()  # Debugger stops here
    # ... launch logic
```

**Common Issues and Fixes:**

| Issue | Symptom | Fix |
|-------|---------|-----|
| Package not found | `PackageNotFoundError` | Source workspace, rebuild |
| Config not installed | `FileNotFoundError` | Add to CMakeLists install() |
| Wrong parameter type | Node crashes/ignores param | Use correct type (bool not "true") |
| Node not starting | No output, not in node list | Check executable name, permissions |
| Namespace issue | Topics not found | Check remappings, namespace |

---

### Question 5: What's the difference between `condition=IfCondition` and Python `if` statements in launch files?

**Difficulty:** ⭐⭐⭐ (Hard)

**Answer:**

Both can conditionally include nodes, but they differ in **when** the decision is made.

**Python `if` Statement (Compile-Time):**

```python
def generate_launch_description():
    env = LaunchConfiguration('env')

    # This evaluates IMMEDIATELY during launch file parsing
    if env == 'sim':  # WRONG! LaunchConfiguration is not yet resolved
        nodes = [sim_node]
    else:
        nodes = [hardware_node]

    return LaunchDescription(nodes)
```

**Problem:** `LaunchConfiguration('env')` is a **substitution**, not a string. It's not resolved until launch-time, but the `if` statement executes at parse-time.

**Result:** This will always take the `else` branch because:
```python
LaunchConfiguration('env') == 'sim'  # Always False!
# Comparing object reference to string
```

**`IfCondition` (Launch-Time):**

```python
from launch.conditions import IfCondition
from launch.substitutions import PythonExpression

def generate_launch_description():
    env = LaunchConfiguration('env')

    sim_node = Node(
        package='sim_pkg',
        executable='sim_node',
        condition=IfCondition(
            PythonExpression(['"', env, '" == "sim"'])
        )
    )

    hardware_node = Node(
        package='hw_pkg',
        executable='hw_node',
        condition=IfCondition(
            PythonExpression(['"', env, '" == "hardware"'])
        )
    )

    return LaunchDescription([sim_node, hardware_node])
```

**How it works:**
1. Parse-time: Both nodes added to launch description with conditions
2. Launch-time: `env` argument resolved to actual value ("sim" or "hardware")
3. Conditions evaluated: Only nodes matching condition start

**When to Use Each:**

**Use Python `if` (Compile-Time):**

```python
# When condition is known at parse-time
import os

if os.environ.get('ROBOT_ENV') == 'sim':
    nodes = [sim_node]  # Decision made during parsing
else:
    nodes = [hardware_node]
```

✅ **Advantages:**
- Simpler syntax
- Faster (no runtime evaluation)
- Can use full Python logic

❌ **Disadvantages:**
- Can't use LaunchConfiguration values
- Decision fixed at parse-time

**Use `IfCondition` (Launch-Time):**

```python
# When condition depends on launch arguments
env = LaunchConfiguration('env')  # From command line

node = Node(
    ...,
    condition=IfCondition(PythonExpression(['"', env, '" == "sim"']))
)
```

✅ **Advantages:**
- Works with launch arguments
- Dynamic decision at runtime
- User can override

❌ **Disadvantages:**
- More verbose
- Slightly slower (runtime evaluation)

**Correct Hybrid Approach:**

```python
def generate_launch_description():
    # Default from environment, but allow override
    default_env = os.environ.get('ROBOT_ENV', 'sim')

    env_arg = DeclareLaunchArgument('env', default_value=default_env)
    env = LaunchConfiguration('env')

    # Use IfCondition for launch-time decision
    sim_node = Node(
        package='sim_pkg',
        executable='sim_node',
        condition=IfCondition(PythonExpression(['"', env, '" == "sim"']))
    )

    return LaunchDescription([env_arg, sim_node])
```

**Key Insight:**
- `if`: Compile-time, for static decisions
- `IfCondition`: Launch-time, for dynamic decisions based on arguments

---

## Practice Tasks

### Practice Task 1: Build a Modular Multi-Environment Launch System

**Objective:** Create a production-ready launch system that supports multiple environments (simulation, hardware, hybrid) with proper configuration management.

**Requirements:**

**1. Directory Structure:**
```
my_system/
├── launch/
│   ├── main.launch.py
│   ├── simulation.launch.py
│   ├── hardware.launch.py
│   └── common.launch.py
├── config/
│   ├── sim/
│   │   ├── sensors.yaml
│   │   └── navigation.yaml
│   ├── hardware/
│   │   ├── sensors.yaml
│   │   └── navigation.yaml
│   └── common.yaml
└── CMakeLists.txt
```

**2. Main Launch File:**
- Accept `env` argument (sim/hardware/hybrid)
- Load environment-specific configurations
- Support single-robot and multi-robot modes
- Provide clear error messages for missing files

**3. Environment-Specific Launches:**
- `simulation.launch.py`: Start Gazebo, spawn robot, use sim time
- `hardware.launch.py`: Start hardware drivers, no sim time
- Support switching between environments without code changes

**4. Features:**
- Proper namespacing for multi-robot
- Conditional node loading
- Event handlers for critical node failures
- Comprehensive launch arguments with validation

**5. Documentation:**
- README with usage examples
- Comments explaining all launch arguments
- Diagram of node architecture

**Deliverables:**
- Complete launch file system
- Config files for all environments
- CMakeLists.txt with proper installation
- README.md with examples
- Test script that launches all environments

---

### Practice Task 2: Debug Complex Launch File Issues

**Scenario:** You're given a broken launch system with multiple issues. Debug and fix them.

**Broken Launch File:**

```python
# broken_launch.py
from launch import LaunchDescription
from launch_ros.actions import Node
from launch.substitutions import LaunchConfiguration

def generate_launch_description():
    robot_name = LaunchConfiguration('robot_name')
    use_sim = LaunchConfiguration('use_sim')

    # Issue 1: Missing config file
    config = '/path/to/nonexistent/config.yaml'

    # Issue 2: Wrong type for boolean parameter
    node1 = Node(
        package='my_pkg',
        executable='node1',
        parameters=[{
            'use_sim_time': use_sim  # String, not bool!
        }]
    )

    # Issue 3: Conditional not working
    if use_sim == 'true':  # Won't work!
        sensor_node = Node(package='sim_sensor', executable='sensor')
    else:
        sensor_node = Node(package='hw_sensor', executable='sensor')

    # Issue 4: Namespace not applied
    robot_nodes = [
        Node(package='pkg', executable='nav'),
        Node(package='pkg', executable='ctrl')
    ]
    # Should be under robot_name namespace

    # Issue 5: Missing launch argument declarations

    return LaunchDescription([node1, sensor_node, *robot_nodes])
```

**Tasks:**

1. Identify all 5+ issues
2. Fix each issue with proper solution
3. Add validation and error handling
4. Add logging for debugging
5. Write test cases to verify fixes
6. Document each fix in comments

**Expected Fixes:**
- Proper config file handling with existence check
- Correct parameter type handling
- Working conditional with `IfCondition`
- Proper namespace application with `GroupAction`
- Launch argument declarations with defaults

---

### Practice Task 3: Implement Component Container Pipeline

**Objective:** Convert a multi-node pipeline to use composable components for performance optimization.

**Given: Traditional Multi-Node Setup**

```python
# Before: Separate processes
camera_node = Node(package='camera', executable='camera_node')
rectify_node = Node(package='image_proc', executable='rectify_node')
detector_node = Node(package='detection', executable='detector_node')
```

**Requirements:**

**1. Create Component Implementations:**
- Convert each node to a component (using `rclcpp_components`)
- Implement proper zero-copy publishing (use `unique_ptr`)
- Register components with macros

**2. Launch File with Container:**
- Create `ComposableNodeContainer`
- Load all components with intra-process communication enabled
- Support dynamic component loading

**3. Performance Comparison:**
- Measure latency: separate processes vs. components
- Measure CPU usage
- Measure memory usage
- Document findings

**4. Hybrid Mode:**
- Support both modes (separate processes and components)
- Use launch argument to switch: `composition:=true/false`
- Ensure behavior is identical

**5. Testing:**
- Test that pipeline works in both modes
- Verify zero-copy is actually happening (use logging)
- Measure performance improvements

**Deliverables:**
- Component implementations (C++)
- Launch file supporting both modes
- Performance comparison report
- Documentation on when to use each mode

---

## Quick Reference

### Essential Launch File Patterns

**Basic Node:**
```python
Node(
    package='my_package',
    executable='my_node',
    name='my_node',
    namespace='robot1',
    parameters=[{'param': 'value'}],
    remappings=[('old_topic', 'new_topic')],
    arguments=['--ros-args', '--log-level', 'info'],
    output='both'
)
```

**Launch Arguments:**
```python
DeclareLaunchArgument(
    'arg_name',
    default_value='default',
    description='Description',
    choices=['opt1', 'opt2']
)

# Use argument
LaunchConfiguration('arg_name')
```

**Conditional Launch:**
```python
from launch.conditions import IfCondition, UnlessCondition
from launch.substitutions import PythonExpression

Node(...,
    condition=IfCondition(LaunchConfiguration('enable'))
)

Node(...,
    condition=UnlessCondition(
        PythonExpression(['"', LaunchConfiguration('env'), '" == "sim"'])
    )
)
```

**Include Launch File:**
```python
IncludeLaunchDescription(
    PythonLaunchDescriptionSource(
        PathJoinSubstitution([
            FindPackageShare('package'),
            'launch',
            'file.launch.py'
        ])
    ),
    launch_arguments={'arg': 'value'}.items()
)
```

**Group with Namespace:**
```python
from launch.actions import GroupAction
from launch_ros.actions import PushRosNamespace

GroupAction([
    PushRosNamespace('robot1'),
    Node(...),
    Node(...),
])
```

**Event Handlers:**
```python
from launch.actions import RegisterEventHandler
from launch.event_handlers import OnProcessExit, OnProcessStart

RegisterEventHandler(
    OnProcessExit(
        target_action=node,
        on_exit=[restart_node]
    )
)
```

**Composable Container:**
```python
ComposableNodeContainer(
    name='container',
    namespace='',
    package='rclcpp_components',
    executable='component_container',
    composable_node_descriptions=[
        ComposableNode(
            package='pkg',
            plugin='pkg::ComponentClass',
            name='component_name',
            extra_arguments=[{'use_intra_process_comms': True}]
        ),
    ],
    output='both'
)
```

### Common Substitutions

```python
from launch.substitutions import (
    LaunchConfiguration,
    PathJoinSubstitution,
    PythonExpression,
    EnvironmentVariable,
    TextSubstitution
)
from launch_ros.substitutions import FindPackageShare

# Launch argument
LaunchConfiguration('arg_name')

# Package path
FindPackageShare('package_name')

# Join paths
PathJoinSubstitution([
    FindPackageShare('pkg'),
    'config',
    'file.yaml'
])

# Python expression
PythonExpression(['"', LaunchConfiguration('var'), '" == "value"'])

# Environment variable
EnvironmentVariable('ENV_VAR', default_value='default')
```

### CMakeLists.txt Installation

```cmake
# Install launch files
install(DIRECTORY
  launch
  DESTINATION share/${PROJECT_NAME}/
)

# Install config files
install(DIRECTORY
  config
  DESTINATION share/${PROJECT_NAME}/
)

# Install specific files
install(FILES
  config/params.yaml
  DESTINATION share/${PROJECT_NAME}/config
)
```

### Usage Commands

```bash
# Launch with arguments
ros2 launch my_package my_launch.py arg1:=value1 arg2:=value2

# Show available arguments
ros2 launch my_package my_launch.py --show-args

# Show all output
ros2 launch my_package my_launch.py --show-all-subprocesses-output

# Debug mode
ros2 launch my_package my_launch.py --debug

# Print description
ros2 launch my_package my_launch.py --print-description
```

---

This completes Topic 4.2: Launch File Best Practices!