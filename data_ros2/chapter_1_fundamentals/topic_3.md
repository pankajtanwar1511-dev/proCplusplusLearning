# Topic 1.3: Packages & Build System

## THEORY_SECTION

### 1. ROS2 Package Structure

**What is a ROS2 Package?**

A package is the **fundamental unit of software organization** in ROS2. It contains:
- Nodes (executables)
- Libraries
- Configuration files
- Launch files
- Messages/Services/Actions definitions

**Minimal Package Structure:**

```
my_package/
├── package.xml          # Package metadata (required)
├── CMakeLists.txt       # Build configuration (C++ packages)
├── setup.py             # Build configuration (Python packages)
├── src/                 # Source code
├── include/             # Header files (C++)
├── launch/              # Launch files
├── config/              # YAML configs
└── resource/            # Resource index (Python packages)
```

**Package Types:**

| Type | Build Tool | Languages | Example |
|------|-----------|-----------|---------|
| **ament_cmake** | CMake | C++, C | Sensor drivers, performance-critical |
| **ament_python** | setuptools | Python | Simple nodes, scripting |
| **ament_cmake + Python** | CMake + setuptools | Both | Mixed language packages |

---

### 2. package.xml: Package Metadata

The `package.xml` file describes the package and its dependencies using the **REP-149** format (ROS Enhancement Proposal).

**Minimal package.xml:**

```xml
<?xml version="1.0"?>
<?xml-model href="http://download.ros.org/schema/package_format3.xsd" schematypens="http://www.w3.org/2001/XMLSchema"?>
<package format="3">
  <name>my_robot_driver</name>
  <version>1.0.0</version>
  <description>Hardware driver for my robot</description>
  <maintainer email="dev@example.com">Developer Name</maintainer>
  <license>Apache-2.0</license>

  <!-- Build tool (required) -->
  <buildtool_depend>ament_cmake</buildtool_depend>

  <!-- Dependencies -->
  <depend>rclcpp</depend>
  <depend>sensor_msgs</depend>

  <!-- Testing -->
  <test_depend>ament_lint_auto</test_depend>
  <test_depend>ament_lint_common</test_depend>

  <!-- Export information -->
  <export>
    <build_type>ament_cmake</build_type>
  </export>
</package>
```

**Dependency Types:**

| Tag | When Needed | Installed | Use Case |
|-----|-------------|-----------|----------|
| `<build_depend>` | Compile time only | Build only | Header-only libs, code generators |
| `<exec_depend>` | Runtime only | Runtime only | Dynamic libraries, scripts |
| `<depend>` | Both compile & runtime | Both | Most common (shorthand) |
| `<test_depend>` | Testing only | Test env | pytest, gtest, linters |
| `<buildtool_depend>` | Build tool itself | Build only | ament_cmake, colcon |

**Example with All Dependency Types:**

```xml
<package format="3">
  <name>camera_driver</name>
  <version>2.1.3</version>
  <description>USB camera driver with image processing</description>
  <maintainer email="robotics@company.com">Robotics Team</maintainer>
  <license>BSD-3-Clause</license>

  <!-- Build tool -->
  <buildtool_depend>ament_cmake</buildtool_depend>

  <!-- Build-time only (headers, code gen) -->
  <build_depend>rosidl_default_generators</build_depend>  <!-- For custom messages -->

  <!-- Runtime only (no compilation) -->
  <exec_depend>python3-numpy</exec_depend>  <!-- Python script dependency -->
  <exec_depend>v4l-utils</exec_depend>      <!-- System tool -->

  <!-- Both build and runtime -->
  <depend>rclcpp</depend>
  <depend>sensor_msgs</depend>
  <depend>image_transport</depend>
  <depend>cv_bridge</depend>

  <!-- Message generation -->
  <build_depend>rosidl_default_generators</build_depend>
  <exec_depend>rosidl_default_runtime</exec_depend>
  <member_of_group>rosidl_interface_packages</member_of_group>

  <!-- Testing -->
  <test_depend>ament_cmake_gtest</test_depend>
  <test_depend>ament_lint_auto</test_depend>
  <test_depend>ament_lint_common</test_depend>

  <export>
    <build_type>ament_cmake</build_type>
  </export>
</package>
```

**Key Fields Explained:**

- **format="3"**: Use format 3 (ROS2 standard, supports condition tags)
- **version**: Semantic versioning (MAJOR.MINOR.PATCH)
- **license**: SPDX identifier (Apache-2.0, BSD-3-Clause, MIT, etc.)
- **member_of_group**: Special groups (e.g., rosidl_interface_packages for msg packages)

---

### 3. CMakeLists.txt: Build Configuration (C++ Packages)

**Minimal CMakeLists.txt:**

```cmake
cmake_minimum_required(VERSION 3.8)
project(my_robot_driver)

# Compiler settings
if(CMAKE_COMPILER_IS_GNUCXX OR CMAKE_CXX_COMPILER_ID MATCHES "Clang")
  add_compile_options(-Wall -Wextra -Wpedantic)
endif()

# Find dependencies
find_package(ament_cmake REQUIRED)
find_package(rclcpp REQUIRED)
find_package(sensor_msgs REQUIRED)

# Build executable
add_executable(robot_node src/robot_node.cpp)
ament_target_dependencies(robot_node rclcpp sensor_msgs)

# Install targets
install(TARGETS robot_node
  DESTINATION lib/${PROJECT_NAME}
)

# Install launch files
install(DIRECTORY launch
  DESTINATION share/${PROJECT_NAME}/
)

# Testing
if(BUILD_TESTING)
  find_package(ament_lint_auto REQUIRED)
  ament_lint_auto_find_test_dependencies()
endif()

ament_package()
```

**Key Components Explained:**

**1. Dependency Finding:**
```cmake
find_package(ament_cmake REQUIRED)  # Always first
find_package(rclcpp REQUIRED)
find_package(sensor_msgs REQUIRED)
```

**2. Building Executables:**
```cmake
# Create executable
add_executable(node_name src/node_source.cpp src/helper.cpp)

# Link dependencies (modern ament way)
ament_target_dependencies(node_name
  rclcpp
  sensor_msgs
  geometry_msgs
)

# Old way (still works, more verbose):
# target_link_libraries(node_name ${rclcpp_LIBRARIES} ${sensor_msgs_LIBRARIES})
# target_include_directories(node_name PUBLIC ${rclcpp_INCLUDE_DIRS})
```

**3. Building Libraries:**
```cmake
# Shared library
add_library(robot_lib SHARED
  src/robot_controller.cpp
  src/kinematics.cpp
)
ament_target_dependencies(robot_lib rclcpp geometry_msgs)

# Install library
install(TARGETS robot_lib
  ARCHIVE DESTINATION lib
  LIBRARY DESTINATION lib
  RUNTIME DESTINATION bin
)

# Install headers
install(DIRECTORY include/
  DESTINATION include
)

# Export library for downstream packages
ament_export_targets(robot_lib_targets HAS_LIBRARY_TARGET)
ament_export_dependencies(rclcpp geometry_msgs)

install(TARGETS robot_lib
  EXPORT robot_lib_targets
  LIBRARY DESTINATION lib
  ARCHIVE DESTINATION lib
  RUNTIME DESTINATION bin
  INCLUDES DESTINATION include
)
```

**4. Install Rules:**

```cmake
# Install executables (goes to lib/<package_name>/)
install(TARGETS my_node
  DESTINATION lib/${PROJECT_NAME}
)

# Install launch files (goes to share/<package_name>/launch/)
install(DIRECTORY launch/
  DESTINATION share/${PROJECT_NAME}/launch
)

# Install config files
install(DIRECTORY config/
  DESTINATION share/${PROJECT_NAME}/config
)

# Install specific files
install(FILES my_config.yaml
  DESTINATION share/${PROJECT_NAME}/config
)
```

**Why the `lib/` vs `share/` distinction?**

| Location | Content | Reason |
|----------|---------|--------|
| `lib/<pkg>/` | Executables, libraries | Architecture-specific (x86_64, arm64) |
| `share/<pkg>/` | Launch files, configs, URDF | Architecture-independent (text files) |

---

### 4. ament_cmake: Modern CMake for ROS2

**Key Functions:**

**1. `ament_target_dependencies()`**
Simplified dependency linking (replaces `target_link_libraries` + `target_include_directories`).

```cmake
# Modern ament way (recommended)
ament_target_dependencies(my_node
  rclcpp
  std_msgs
)

# Equivalent old CMake way (verbose)
target_link_libraries(my_node
  ${rclcpp_LIBRARIES}
  ${std_msgs_LIBRARIES}
)
target_include_directories(my_node PUBLIC
  ${rclcpp_INCLUDE_DIRS}
  ${std_msgs_INCLUDE_DIRS}
)
```

**2. `ament_export_*()` - Make Library Usable by Other Packages**

```cmake
# Export include directories
ament_export_include_directories(include)

# Export libraries
ament_export_libraries(my_lib)

# Export dependencies (downstream packages need these too)
ament_export_dependencies(
  rclcpp
  sensor_msgs
)

# Modern way: export targets
ament_export_targets(my_lib_targets HAS_LIBRARY_TARGET)
```

**When Downstream Package Uses Your Library:**

```cmake
# In another package's CMakeLists.txt
find_package(my_robot_driver REQUIRED)  # Finds your package

add_executable(my_app src/app.cpp)
ament_target_dependencies(my_app
  my_robot_driver  # Automatically includes exported deps
)
```

**3. `ament_package()` - Finalize Package**

Must be the **last line** in CMakeLists.txt. Generates:
- Package metadata files
- Environment hooks
- Resource indexes

```cmake
ament_package()  # Always last!
```

---

### 5. Python Packages (ament_python)

**Structure:**

```
my_python_pkg/
├── package.xml
├── setup.py
├── setup.cfg
├── resource/
│   └── my_python_pkg  # Empty marker file
└── my_python_pkg/
    ├── __init__.py
    └── my_node.py
```

**setup.py:**

```python
from setuptools import setup
import os
from glob import glob

package_name = 'my_python_pkg'

setup(
    name=package_name,
    version='1.0.0',
    packages=[package_name],
    data_files=[
        # Install package marker
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
        # Install package.xml
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
    maintainer='Developer',
    maintainer_email='dev@example.com',
    description='Python node package',
    license='Apache-2.0',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            'my_node = my_python_pkg.my_node:main',
            'another_node = my_python_pkg.another:main',
        ],
    },
)
```

**setup.cfg:**

```ini
[develop]
script_dir=$base/lib/my_python_pkg

[install]
install_scripts=$base/lib/my_python_pkg
```

**Key Difference from C++:**

- **No CMakeLists.txt** (uses setuptools)
- **entry_points** define executables (like `add_executable` in CMake)
- **resource/** directory required for ament indexing

**Python Node Template:**

```python
#!/usr/bin/env python3
import rclpy
from rclpy.node import Node
from std_msgs.msg import String

class MyNode(Node):
    def __init__(self):
        super().__init__('my_node')
        self.publisher = self.create_publisher(String, 'topic', 10)
        self.timer = self.create_timer(1.0, self.timer_callback)

    def timer_callback(self):
        msg = String()
        msg.data = 'Hello ROS2'
        self.publisher.publish(msg)

def main(args=None):
    rclpy.init(args=args)
    node = MyNode()
    rclpy.spin(node)
    node.destroy_node()
    rclpy.shutdown()

if __name__ == '__main__':
    main()
```

---

### 6. Colcon: The Build Tool

**colcon** (collective construction) is the ROS2 build tool (replaces catkin from ROS1).

**Key Commands:**

```bash
# Build all packages in workspace
colcon build

# Build specific package
colcon build --packages-select my_package

# Build package and dependencies
colcon build --packages-up-to my_package

# Build with debug symbols
colcon build --cmake-args -DCMAKE_BUILD_TYPE=Debug

# Build with verbose output
colcon build --event-handlers console_direct+

# Clean build
colcon build --cmake-clean-cache

# Parallel build (4 jobs)
colcon build --parallel-workers 4

# Test
colcon test
colcon test-result --verbose
```

**Build Artifacts:**

```
workspace/
├── src/              # Source code
├── build/            # Build intermediates (CMake cache, object files)
├── install/          # Install space (where packages are "installed")
└── log/              # Build logs
```

**Install Space Structure:**

```
install/
├── setup.bash        # Source this to use packages
├── local_setup.bash  # Setup without parent workspaces
├── my_package/
│   ├── lib/my_package/
│   │   └── my_node        # Executable
│   └── share/my_package/
│       ├── package.xml
│       ├── launch/
│       └── config/
```

**Sourcing:**

```bash
# Source workspace
source install/setup.bash

# Now package is in ROS2 environment
ros2 run my_package my_node
ros2 launch my_package my_launch.py
```

---

### 7. Build Types and Optimization

**CMake Build Types:**

| Build Type | Optimization | Debug Symbols | Use Case |
|------------|--------------|---------------|----------|
| **Debug** | None (-O0) | Yes | Development, debugging |
| **Release** | Max (-O3) | No | Production, benchmarking |
| **RelWithDebInfo** | High (-O2) | Yes | Profiling, production debugging |
| **MinSizeRel** | Size (-Os) | No | Embedded systems |

**Setting Build Type:**

```bash
# Global build type
colcon build --cmake-args -DCMAKE_BUILD_TYPE=Release

# Per-package build type
colcon build --packages-select my_package \
  --cmake-args -DCMAKE_BUILD_TYPE=Debug
```

**In CMakeLists.txt (default):**

```cmake
# Set default build type
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE "Release")
endif()

# Custom flags per build type
if(CMAKE_BUILD_TYPE STREQUAL "Release")
  add_compile_options(-O3 -march=native)  # CPU-specific optimizations
endif()
```

**Performance Impact:**

```
Benchmark: Processing 1M messages

Debug:           2500 ms  (baseline)
Release:          800 ms  (3.1x faster)
RelWithDebInfo:   900 ms  (2.8x faster, debuggable)
```

**Interview Insight:**
Always benchmark in Release mode. Debug builds can be 2-5x slower.

---

### 8. Message/Service/Action Generation

**Creating Custom Messages:**

**1. Package Structure:**

```
my_interfaces/
├── package.xml
├── CMakeLists.txt
├── msg/
│   ├── RobotStatus.msg
│   └── SensorData.msg
├── srv/
│   └── SetMode.srv
└── action/
    └── Navigate.action
```

**2. Message Definition (msg/RobotStatus.msg):**

```
# RobotStatus.msg
std_msgs/Header header
string robot_id
uint8 mode
float32 battery_voltage
geometry_msgs/Pose pose

# Constants
uint8 MODE_IDLE = 0
uint8 MODE_MANUAL = 1
uint8 MODE_AUTO = 2
```

**3. package.xml:**

```xml
<package format="3">
  <name>my_interfaces</name>

  <buildtool_depend>ament_cmake</buildtool_depend>

  <!-- Message generation -->
  <build_depend>rosidl_default_generators</build_depend>
  <exec_depend>rosidl_default_runtime</exec_depend>
  <member_of_group>rosidl_interface_packages</member_of_group>

  <!-- Message dependencies -->
  <depend>std_msgs</depend>
  <depend>geometry_msgs</depend>

  <export>
    <build_type>ament_cmake</build_type>
  </export>
</package>
```

**4. CMakeLists.txt:**

```cmake
cmake_minimum_required(VERSION 3.8)
project(my_interfaces)

find_package(ament_cmake REQUIRED)
find_package(rosidl_default_generators REQUIRED)
find_package(std_msgs REQUIRED)
find_package(geometry_msgs REQUIRED)

# Generate interfaces
rosidl_generate_interfaces(${PROJECT_NAME}
  "msg/RobotStatus.msg"
  "msg/SensorData.msg"
  "srv/SetMode.srv"
  "action/Navigate.action"
  DEPENDENCIES std_msgs geometry_msgs
)

ament_package()
```

**5. Using Custom Messages:**

**In package.xml of consumer package:**
```xml
<depend>my_interfaces</depend>
```

**In CMakeLists.txt:**
```cmake
find_package(my_interfaces REQUIRED)
ament_target_dependencies(my_node
  rclcpp
  my_interfaces
)
```

**In C++ code:**
```cpp
#include "my_interfaces/msg/robot_status.hpp"

auto msg = my_interfaces::msg::RobotStatus();
msg.robot_id = "robot_1";
msg.mode = my_interfaces::msg::RobotStatus::MODE_AUTO;
msg.battery_voltage = 12.4;
pub_->publish(msg);
```

---

## EDGE_CASES

### Edge Case 1: Circular Dependencies

**Scenario:**
Package A depends on Package B, and Package B depends on Package A.

```
package_a/package.xml:
<depend>package_b</depend>

package_b/package.xml:
<depend>package_a</depend>
```

**Problem:**
```bash
$ colcon build
Starting >>> package_a
--- stderr: package_a
CMake Error: Could not find package configuration file provided by "package_b"
```

**Why it Fails:**
Colcon builds in dependency order. Can't build A (needs B) or B (needs A).

**Solutions:**

**1. Refactor into Three Packages (Best):**
```
package_common/     # Shared interfaces/utilities
package_a/          # Depends on package_common
package_b/          # Depends on package_common
```

**2. Use Interface Package:**
```
my_interfaces/      # Messages, services (no code)
package_a/          # Depends on my_interfaces
package_b/          # Depends on my_interfaces
```

**3. Split Dependencies by Type:**
```xml
<!-- package_a/package.xml -->
<build_depend>package_b</build_depend>  <!-- Needs B's headers at compile time -->

<!-- package_b/package.xml -->
<exec_depend>package_a</exec_depend>   <!-- Needs A only at runtime -->
```

This works if:
- B only needs A's executables (not libraries)
- A needs B's headers for compilation

**Interview Insight:**
Circular dependencies indicate poor separation of concerns. Always refactor into a third package.

---

### Edge Case 2: Header-Only Library Not Found

**Scenario:**
Created header-only library but downstream packages can't find it.

**my_utils/include/my_utils/math.hpp:**
```cpp
#pragma once
namespace my_utils {
    inline double square(double x) { return x * x; }
}
```

**my_utils/CMakeLists.txt (WRONG):**
```cmake
find_package(ament_cmake REQUIRED)

# No add_library() call (header-only)

install(DIRECTORY include/
  DESTINATION include
)

ament_package()  # Missing export!
```

**Problem:**
```bash
# In downstream package:
$ colcon build --packages-select my_app
CMake Error: Could not find my_utils
```

**Why:**
Didn't export include directories. Downstream packages don't know where to find headers.

**Solution:**

```cmake
cmake_minimum_required(VERSION 3.8)
project(my_utils)

find_package(ament_cmake REQUIRED)

# Install headers
install(DIRECTORY include/
  DESTINATION include
)

# CRITICAL: Export include directories
ament_export_include_directories(include)

ament_package()
```

**Downstream package can now use it:**
```cmake
find_package(my_utils REQUIRED)

add_executable(my_app src/main.cpp)
ament_target_dependencies(my_app my_utils)  # Includes exported paths
```

**Interview Insight:**
Header-only libraries still need `ament_export_include_directories()` for discovery.

---

### Edge Case 3: Missing Install Rules for Launch Files

**Scenario:**
Created launch file but `ros2 launch` can't find it.

```bash
$ ros2 launch my_package my_launch.py
Package 'my_package' not found
```

**Problem:**
Forgot install rule in CMakeLists.txt.

**CMakeLists.txt (WRONG):**
```cmake
# Build executable
add_executable(my_node src/node.cpp)
# ... dependencies ...

install(TARGETS my_node
  DESTINATION lib/${PROJECT_NAME}
)

# Missing: install(DIRECTORY launch/ ...)

ament_package()
```

**Why:**
Launch files exist in `src/` directory but not copied to `install/` space.

**Solution:**

```cmake
# Install launch files
install(DIRECTORY launch/
  DESTINATION share/${PROJECT_NAME}/launch
)

# Or install specific files
install(FILES launch/my_launch.py
  DESTINATION share/${PROJECT_NAME}/launch
)
```

**Verification:**

```bash
$ colcon build --packages-select my_package
$ source install/setup.bash

# Check if launch file installed
$ ls install/my_package/share/my_package/launch/
my_launch.py

$ ros2 launch my_package my_launch.py  # Now works
```

**Common Install Locations:**

```cmake
# Executables
install(TARGETS node DESTINATION lib/${PROJECT_NAME})

# Launch files
install(DIRECTORY launch/ DESTINATION share/${PROJECT_NAME}/launch)

# Config files
install(DIRECTORY config/ DESTINATION share/${PROJECT_NAME}/config)

# URDF/meshes
install(DIRECTORY urdf/ DESTINATION share/${PROJECT_NAME}/urdf)
install(DIRECTORY meshes/ DESTINATION share/${PROJECT_NAME}/meshes)
```

---

### Edge Case 4: Version Mismatch Between package.xml and Code

**Scenario:**
Updated package version in `package.xml` but macros in code still show old version.

**package.xml:**
```xml
<version>2.0.0</version>
```

**Code uses hardcoded version:**
```cpp
std::string get_version() {
    return "1.5.0";  // Forgot to update!
}
```

**Better Solution - Generate Version Header:**

**CMakeLists.txt:**
```cmake
# Read version from package.xml
find_package(ament_cmake REQUIRED)

# Extract project version
set(PROJECT_VERSION_MAJOR 2)
set(PROJECT_VERSION_MINOR 0)
set(PROJECT_VERSION_PATCH 0)

# Generate version header
configure_file(
  ${CMAKE_CURRENT_SOURCE_DIR}/include/${PROJECT_NAME}/version.hpp.in
  ${CMAKE_CURRENT_BINARY_DIR}/include/${PROJECT_NAME}/version.hpp
)

# Include generated header directory
target_include_directories(my_node PUBLIC
  ${CMAKE_CURRENT_BINARY_DIR}/include
)
```

**include/my_package/version.hpp.in (template):**
```cpp
#pragma once

#define MY_PACKAGE_VERSION_MAJOR @PROJECT_VERSION_MAJOR@
#define MY_PACKAGE_VERSION_MINOR @PROJECT_VERSION_MINOR@
#define MY_PACKAGE_VERSION_PATCH @PROJECT_VERSION_PATCH@
#define MY_PACKAGE_VERSION "@PROJECT_VERSION_MAJOR@.@PROJECT_VERSION_MINOR@.@PROJECT_VERSION_PATCH@"
```

**Usage in code:**
```cpp
#include "my_package/version.hpp"

std::string get_version() {
    return MY_PACKAGE_VERSION;  // Auto-generated from CMake
}
```

**Interview Insight:**
Use `configure_file()` to inject CMake variables into C++ headers for version consistency.

---

## CODE_EXAMPLES

### Example 1: Complete Package with Library and Executable

**Package Structure:**

```
robot_controller/
├── package.xml
├── CMakeLists.txt
├── include/robot_controller/
│   ├── controller.hpp
│   └── pid.hpp
├── src/
│   ├── controller.cpp
│   ├── pid.cpp
│   └── controller_node.cpp
├── launch/
│   └── controller.launch.py
└── config/
    └── pid_params.yaml
```

**package.xml:**

```xml
<?xml version="1.0"?>
<package format="3">
  <name>robot_controller</name>
  <version>1.0.0</version>
  <description>Robot motion controller with PID</description>
  <maintainer email="dev@robot.com">Robot Team</maintainer>
  <license>Apache-2.0</license>

  <buildtool_depend>ament_cmake</buildtool_depend>

  <depend>rclcpp</depend>
  <depend>geometry_msgs</depend>
  <depend>nav_msgs</depend>

  <test_depend>ament_cmake_gtest</test_depend>
  <test_depend>ament_lint_auto</test_depend>

  <export>
    <build_type>ament_cmake</build_type>
  </export>
</package>
```

**CMakeLists.txt:**

```cmake
cmake_minimum_required(VERSION 3.8)
project(robot_controller)

if(CMAKE_COMPILER_IS_GNUCXX OR CMAKE_CXX_COMPILER_ID MATCHES "Clang")
  add_compile_options(-Wall -Wextra -Wpedantic)
endif()

# Find dependencies
find_package(ament_cmake REQUIRED)
find_package(rclcpp REQUIRED)
find_package(geometry_msgs REQUIRED)
find_package(nav_msgs REQUIRED)

# Build library (reusable)
add_library(controller_lib SHARED
  src/controller.cpp
  src/pid.cpp
)
target_include_directories(controller_lib PUBLIC
  $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
  $<INSTALL_INTERFACE:include>
)
ament_target_dependencies(controller_lib
  rclcpp
  geometry_msgs
  nav_msgs
)

# Build executable
add_executable(controller_node src/controller_node.cpp)
target_link_libraries(controller_node controller_lib)
ament_target_dependencies(controller_node rclcpp)

# Install library
install(TARGETS controller_lib
  EXPORT controller_lib_targets
  ARCHIVE DESTINATION lib
  LIBRARY DESTINATION lib
  RUNTIME DESTINATION bin
)

# Install executable
install(TARGETS controller_node
  DESTINATION lib/${PROJECT_NAME}
)

# Install headers
install(DIRECTORY include/
  DESTINATION include
)

# Install launch and config
install(DIRECTORY launch config
  DESTINATION share/${PROJECT_NAME}
)

# Export library for downstream packages
ament_export_targets(controller_lib_targets HAS_LIBRARY_TARGET)
ament_export_dependencies(rclcpp geometry_msgs nav_msgs)

# Testing
if(BUILD_TESTING)
  find_package(ament_cmake_gtest REQUIRED)
  ament_add_gtest(test_pid test/test_pid.cpp)
  target_link_libraries(test_pid controller_lib)

  find_package(ament_lint_auto REQUIRED)
  ament_lint_auto_find_test_dependencies()
endif()

ament_package()
```

**include/robot_controller/pid.hpp:**

```cpp
#pragma once

namespace robot_controller {

class PIDController {
public:
    PIDController(double kp, double ki, double kd);

    double compute(double error, double dt);
    void reset();

private:
    double kp_, ki_, kd_;
    double integral_;
    double prev_error_;
};

}  // namespace robot_controller
```

**src/controller_node.cpp:**

```cpp
#include <rclcpp/rclcpp.hpp>
#include <geometry_msgs/msg/twist.hpp>
#include <nav_msgs/msg/odometry.hpp>
#include "robot_controller/pid.hpp"

class ControllerNode : public rclcpp::Node {
public:
    ControllerNode() : Node("controller_node") {
        // Parameters
        declare_parameter("kp", 1.0);
        declare_parameter("ki", 0.1);
        declare_parameter("kd", 0.05);

        double kp = get_parameter("kp").as_double();
        double ki = get_parameter("ki").as_double();
        double kd = get_parameter("kd").as_double();

        pid_ = std::make_unique<robot_controller::PIDController>(kp, ki, kd);

        // Subscribers and publishers
        odom_sub_ = create_subscription<nav_msgs::msg::Odometry>(
            "odom", 10,
            std::bind(&ControllerNode::odom_callback, this, std::placeholders::_1)
        );

        cmd_pub_ = create_publisher<geometry_msgs::msg::Twist>("cmd_vel", 10);

        timer_ = create_wall_timer(
            std::chrono::milliseconds(50),
            std::bind(&ControllerNode::control_loop, this)
        );
    }

private:
    void odom_callback(const nav_msgs::msg::Odometry::SharedPtr msg) {
        current_position_ = msg->pose.pose.position.x;
    }

    void control_loop() {
        double error = target_position_ - current_position_;
        double control = pid_->compute(error, 0.05);

        auto cmd = geometry_msgs::msg::Twist();
        cmd.linear.x = control;
        cmd_pub_->publish(cmd);
    }

    std::unique_ptr<robot_controller::PIDController> pid_;
    rclcpp::Subscription<nav_msgs::msg::Odometry>::SharedPtr odom_sub_;
    rclcpp::Publisher<geometry_msgs::msg::Twist>::SharedPtr cmd_pub_;
    rclcpp::TimerBase::SharedPtr timer_;

    double current_position_ = 0.0;
    double target_position_ = 5.0;
};

int main(int argc, char **argv) {
    rclcpp::init(argc, argv);
    rclcpp::spin(std::make_shared<ControllerNode>());
    rclcpp::shutdown();
    return 0;
}
```

**Building and Using:**

```bash
# Build
colcon build --packages-select robot_controller

# Run
source install/setup.bash
ros2 run robot_controller controller_node --ros-args -p kp:=2.0
```

---

### Example 2: Mixed C++ and Python Package

**Package Structure:**

```
sensor_fusion/
├── package.xml
├── CMakeLists.txt
├── setup.py
├── src/
│   └── fusion_node.cpp       # C++ node
├── sensor_fusion/
│   ├── __init__.py
│   └── visualizer.py         # Python node
├── launch/
│   └── fusion.launch.py
└── resource/
    └── sensor_fusion
```

**package.xml:**

```xml
<package format="3">
  <name>sensor_fusion</name>
  <version>1.0.0</version>
  <description>Mixed C++/Python sensor fusion</description>
  <maintainer email="dev@robot.com">Developer</maintainer>
  <license>Apache-2.0</license>

  <buildtool_depend>ament_cmake</buildtool_depend>
  <buildtool_depend>ament_cmake_python</buildtool_depend>

  <depend>rclcpp</depend>
  <depend>rclpy</depend>
  <depend>sensor_msgs</depend>

  <export>
    <build_type>ament_cmake</build_type>
  </export>
</package>
```

**CMakeLists.txt:**

```cmake
cmake_minimum_required(VERSION 3.8)
project(sensor_fusion)

find_package(ament_cmake REQUIRED)
find_package(ament_cmake_python REQUIRED)
find_package(rclcpp REQUIRED)
find_package(sensor_msgs REQUIRED)

# C++ executable
add_executable(fusion_node src/fusion_node.cpp)
ament_target_dependencies(fusion_node rclcpp sensor_msgs)

install(TARGETS fusion_node
  DESTINATION lib/${PROJECT_NAME}
)

# Python setup
ament_python_install_package(${PROJECT_NAME})

# Install Python executables
install(PROGRAMS
  sensor_fusion/visualizer.py
  DESTINATION lib/${PROJECT_NAME}
)

# Install launch
install(DIRECTORY launch
  DESTINATION share/${PROJECT_NAME}
)

ament_package()
```

**setup.py:**

```python
from setuptools import setup

package_name = 'sensor_fusion'

setup(
    name=package_name,
    version='1.0.0',
    packages=[package_name],
    data_files=[
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    entry_points={
        'console_scripts': [
            'visualizer = sensor_fusion.visualizer:main',
        ],
    },
)
```

**sensor_fusion/visualizer.py:**

```python
#!/usr/bin/env python3
import rclpy
from rclpy.node import Node
from sensor_msgs.msg import PointCloud2

class Visualizer(Node):
    def __init__(self):
        super().__init__('visualizer')
        self.subscription = self.create_subscription(
            PointCloud2, 'fused_cloud', self.callback, 10
        )

    def callback(self, msg):
        self.get_logger().info(f'Received cloud with {msg.width} points')

def main():
    rclpy.init()
    node = Visualizer()
    rclpy.spin(node)
    rclpy.shutdown()

if __name__ == '__main__':
    main()
```

**Usage:**

```bash
# Both C++ and Python nodes available
ros2 run sensor_fusion fusion_node      # C++
ros2 run sensor_fusion visualizer       # Python
```

---

## INTERVIEW_QA

### Q1: What's the difference between `<depend>`, `<build_depend>`, and `<exec_depend>`?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

| Tag | Used At | Installed When | Example Use Case |
|-----|---------|---------------|------------------|
| `<depend>` | Build + Runtime | Both | Most common: libraries used in code |
| `<build_depend>` | Build only | Development | Header-only libs, code generators |
| `<exec_depend>` | Runtime only | Deployment | Python packages, runtime tools |

**Examples:**

```xml
<!-- Need at both build and runtime (links against library) -->
<depend>rclcpp</depend>

<!-- Only needed to compile (header-only library) -->
<build_depend>eigen3_cmake_module</build_depend>

<!-- Only needed at runtime (Python script calls this) -->
<exec_depend>python3-numpy</exec_depend>

<!-- Message generation: build to generate, runtime to use -->
<build_depend>rosidl_default_generators</build_depend>
<exec_depend>rosidl_default_runtime</exec_depend>
```

**Interview Insight:**
Using `<depend>` is safest but can over-install. Use specific tags for:
- Smaller deployment images (don't install build-only deps)
- Clearer dependency intent
- Faster CI (skip unnecessary build deps)

---

### Q2: Why must `ament_package()` be the last line in CMakeLists.txt?

**Difficulty:** ⭐⭐ (Easy)

**Answer:**

`ament_package()` **generates package metadata** and **collects all registered exports**. Must be last because it needs to see all:
- `install()` commands
- `ament_export_*()` calls
- Target definitions

**What it does:**
1. Generates `<package>Config.cmake` (for `find_package()`)
2. Writes package metadata to ament index
3. Creates environment hooks
4. Processes all accumulated export information

**Wrong:**
```cmake
ament_package()  # Too early!

install(TARGETS my_node ...)  # Not included in package metadata
ament_export_libraries(my_lib)  # Export lost
```

**Correct:**
```cmake
install(TARGETS my_node ...)
ament_export_libraries(my_lib)
ament_package()  # Last line, sees everything
```

---

### Q3: How do you make a library from one package usable in another package?

**Difficulty:** ⭐⭐⭐⭐ (Hard)

**Answer:**

**In Library Package (my_lib):**

```cmake
# 1. Create library
add_library(my_lib SHARED src/lib.cpp)
target_include_directories(my_lib PUBLIC
  $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
  $<INSTALL_INTERFACE:include>
)

# 2. Install library files
install(TARGETS my_lib
  EXPORT my_lib_targets      # Export name
  ARCHIVE DESTINATION lib
  LIBRARY DESTINATION lib
  RUNTIME DESTINATION bin
  INCLUDES DESTINATION include  # Tell users where headers are
)

# 3. Install headers
install(DIRECTORY include/
  DESTINATION include
)

# 4. Export targets (modern way)
ament_export_targets(my_lib_targets HAS_LIBRARY_TARGET)

# 5. Export dependencies (users need these too)
ament_export_dependencies(rclcpp std_msgs)

ament_package()
```

**In User Package:**

```cmake
find_package(my_lib REQUIRED)  # Finds exported package

add_executable(my_app src/app.cpp)
ament_target_dependencies(my_app
  my_lib  # Automatically links library, includes headers, and transitive deps
)
```

**Key Steps:**
1. **Export targets** with `EXPORT my_lib_targets`
2. **Install with INCLUDES** to specify header location
3. **ament_export_targets()** to make findable
4. **ament_export_dependencies()** for transitive deps

**Interview Insight:**
Forgetting any of these steps breaks downstream packages. Most common: forgetting `ament_export_targets()`.

---

### Q4: What's the difference between `colcon build` and `colcon build --symlink-install`?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

**Normal install:**
```bash
colcon build
```
- **Copies** files from `src/` to `install/`
- Changes to launch files, configs require rebuild
- Slower iteration for Python/launch development

**Symlink install:**
```bash
colcon build --symlink-install
```
- **Creates symlinks** from `install/` to `src/`
- Changes to Python/launch files immediately visible (no rebuild)
- Faster iteration

**When Symlinks Work:**

| File Type | Requires Rebuild | Why |
|-----------|------------------|-----|
| Python source | No | Symlinked, interpreted at runtime |
| Launch files | No | Symlinked, loaded at runtime |
| Config YAML | No | Symlinked, loaded at runtime |
| C++ source | Yes | Must be compiled |
| CMakeLists.txt | Yes | Build configuration changed |

**Example Workflow:**

```bash
# Initial build with symlinks
colcon build --symlink-install

# Edit Python node or launch file
vim src/my_pkg/my_pkg/my_node.py

# No rebuild needed!
ros2 run my_pkg my_node  # Picks up changes immediately

# Edit C++ source
vim src/my_pkg/src/node.cpp

# Rebuild required
colcon build --packages-select my_pkg
```

**Caveat:**
Symlinks can cause issues with:
- Docker containers (if source not in image)
- Deployment (need source files, not just install/)

**Best Practice:**
- Development: `--symlink-install`
- Production build: normal install (copies everything)

---

### Q5: How do you create a package that defines custom messages?

**Difficulty:** ⭐⭐⭐⭐ (Hard)

**Answer:**

**1. Create Interface Package (separate from implementation):**

```
my_interfaces/
├── package.xml
├── CMakeLists.txt
├── msg/
│   └── RobotStatus.msg
├── srv/
│   └── SetMode.srv
└── action/
    └── Navigate.action
```

**2. package.xml:**

```xml
<package format="3">
  <name>my_interfaces</name>

  <buildtool_depend>ament_cmake</buildtool_depend>

  <!-- CRITICAL: Message generation dependencies -->
  <build_depend>rosidl_default_generators</build_depend>
  <exec_depend>rosidl_default_runtime</exec_depend>
  <member_of_group>rosidl_interface_packages</member_of_group>

  <!-- Dependencies for field types -->
  <depend>std_msgs</depend>
  <depend>geometry_msgs</depend>

  <export>
    <build_type>ament_cmake</build_type>
  </export>
</package>
```

**3. CMakeLists.txt:**

```cmake
cmake_minimum_required(VERSION 3.8)
project(my_interfaces)

find_package(ament_cmake REQUIRED)
find_package(rosidl_default_generators REQUIRED)
find_package(std_msgs REQUIRED)
find_package(geometry_msgs REQUIRED)

# List all interfaces
rosidl_generate_interfaces(${PROJECT_NAME}
  "msg/RobotStatus.msg"
  "msg/SensorData.msg"
  "srv/SetMode.srv"
  "action/Navigate.action"
  DEPENDENCIES std_msgs geometry_msgs  # For types used in messages
)

ament_package()
```

**4. Message Definition (msg/RobotStatus.msg):**

```
std_msgs/Header header
string robot_id
uint8 mode
float32 battery_voltage

uint8 MODE_IDLE = 0
uint8 MODE_MANUAL = 1
uint8 MODE_AUTO = 2
```

**5. Using in Another Package:**

**package.xml:**
```xml
<depend>my_interfaces</depend>
```

**CMakeLists.txt:**
```cmake
find_package(my_interfaces REQUIRED)

add_executable(my_node src/node.cpp)
ament_target_dependencies(my_node
  rclcpp
  my_interfaces
)

# IMPORTANT: If using custom messages in same package (rare):
rosidl_get_typesupport_target(cpp_typesupport_target ${PROJECT_NAME} "rosidl_typesupport_cpp")
target_link_libraries(my_node "${cpp_typesupport_target}")
```

**C++ Code:**
```cpp
#include "my_interfaces/msg/robot_status.hpp"

auto pub = create_publisher<my_interfaces::msg::RobotStatus>("status", 10);

auto msg = my_interfaces::msg::RobotStatus();
msg.robot_id = "robot_1";
msg.mode = my_interfaces::msg::RobotStatus::MODE_AUTO;
pub->publish(msg);
```

**Interview Insight:**
- Interface packages should have NO implementation code (only message definitions)
- Can't use generated messages in same package (circular dependency)
- Always use separate `_interfaces` package

---

### Q6: What happens if you forget to source `install/setup.bash`?

**Difficulty:** ⭐⭐ (Easy)

**Answer:**

Without sourcing, package is **not in ROS2 environment**.

**Symptoms:**

```bash
$ ros2 run my_package my_node
Package 'my_package' not found

$ ros2 launch my_package my_launch.py
Package 'my_package' not found

$ ros2 pkg list | grep my_package
(no output)
```

**Why:**
- `ros2` commands search `$AMENT_PREFIX_PATH`
- Sourcing `setup.bash` adds `install/` to this path
- Without it, package doesn't exist to ROS2 tools

**What setup.bash Does:**

```bash
export AMENT_PREFIX_PATH="/workspace/install/my_package:$AMENT_PREFIX_PATH"
export CMAKE_PREFIX_PATH="/workspace/install/my_package:$CMAKE_PREFIX_PATH"
export LD_LIBRARY_PATH="/workspace/install/my_package/lib:$LD_LIBRARY_PATH"
export PATH="/workspace/install/my_package/bin:$PATH"
export PYTHONPATH="/workspace/install/my_package/lib/python3.10/site-packages:$PYTHONPATH"
```

**Correct Workflow:**

```bash
colcon build
source install/setup.bash  # REQUIRED after every build

ros2 run my_package my_node  # Now works
```

**Persistent Setup (add to ~/.bashrc):**

```bash
echo "source ~/ros2_ws/install/setup.bash" >> ~/.bashrc
```

---

### Q7: How do build types (Debug/Release) affect performance?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

**Compiler Optimization Levels:**

| Build Type | GCC Flags | Optimizations | Debug Info |
|------------|-----------|---------------|------------|
| Debug | `-O0 -g` | None | Full |
| Release | `-O3` | Maximum | None |
| RelWithDebInfo | `-O2 -g` | High | Full |
| MinSizeRel | `-Os` | Size-optimized | None |

**Performance Impact (Real-World):**

```
Benchmark: 1M Point Cloud Processing

Debug:           1200 ms  (baseline)
Release:          350 ms  (3.4x faster)
RelWithDebInfo:   400 ms  (3.0x faster, debuggable)
MinSizeRel:       420 ms  (2.9x faster, smaller binary)
```

**What Release Mode Enables:**

1. **Function inlining:** Small functions merged into callers
2. **Loop unrolling:** Fewer loop iterations, more code per iteration
3. **Vectorization:** SIMD instructions (SSE, AVX)
4. **Dead code elimination:** Unused code removed
5. **Constant propagation:** Compile-time evaluation

**Example - Loop Optimization:**

```cpp
// Source code
for (int i = 0; i < 1000; ++i) {
    data[i] = compute(i);
}

// Debug build (-O0): Exact as written

// Release build (-O3): Unrolled, vectorized
for (int i = 0; i < 1000; i += 4) {  // Process 4 at once (SIMD)
    __m128 vec = compute_vectorized(i, i+1, i+2, i+3);
    _mm_store_ps(&data[i], vec);
}
```

**When to Use Each:**

- **Debug:** Development, step-through debugging
- **Release:** Production, benchmarking, deployment
- **RelWithDebInfo:** Profiling (need symbols + performance)
- **MinSizeRel:** Embedded systems with limited storage

**Set Build Type:**

```bash
# All packages
colcon build --cmake-args -DCMAKE_BUILD_TYPE=Release

# Specific package
colcon build --packages-select my_pkg \
  --cmake-args -DCMAKE_BUILD_TYPE=Debug
```

**Interview Insight:**
Always benchmark and profile in Release mode. Debug builds misrepresent performance by 2-5x.

---

### Q8: What's the purpose of the `resource/` directory in Python packages?

**Difficulty:** ⭐⭐ (Easy)

**Answer:**

The `resource/<package_name>` file is a **marker** for the ament resource index.

**Purpose:**
- Allows `ros2 pkg list` to discover the package
- Enables `ros2 run <package> <executable>` to find package
- Required for ament's package discovery mechanism

**Structure:**

```
my_python_pkg/
├── package.xml
├── setup.py
└── resource/
    └── my_python_pkg   # Empty file (marker)
```

**In setup.py:**

```python
data_files=[
    # Register package in ament index
    ('share/ament_index/resource_index/packages',
        ['resource/' + package_name]),  # Installs marker
    ('share/' + package_name, ['package.xml']),
],
```

**What Happens:**

```bash
$ colcon build --packages-select my_python_pkg

# Creates:
install/my_python_pkg/share/ament_index/resource_index/packages/my_python_pkg
```

**Without It:**

```bash
$ ros2 pkg list | grep my_python_pkg
(nothing)

$ ros2 run my_python_pkg my_node
Package 'my_python_pkg' not found
```

**With It:**

```bash
$ ros2 pkg list | grep my_python_pkg
my_python_pkg

$ ros2 run my_python_pkg my_node
(node runs)
```

**Interview Insight:**
C++ packages don't need this (ament_cmake creates it automatically). Python packages must include it manually.

---

## PRACTICE_TASKS

### Task 1: Create Multi-Package Workspace

Build a workspace with:
1. **my_interfaces**: Custom message `RobotCmd` (velocity, steering)
2. **my_driver**: C++ node publishing RobotCmd
3. **my_monitor**: Python node subscribing to RobotCmd

**Requirements:**
- Correct dependency declarations
- my_driver exports a library (PID controller)
- All install rules correct
- Launch file starting both nodes

---

### Task 2: Optimize Build Configuration

Take existing package and:
1. Measure performance in Debug vs Release
2. Add custom compiler flags for Release (`-march=native`)
3. Create RelWithDebInfo build for profiling
4. Generate version header from package.xml

**Expected:**
- Clear performance difference documented
- Build type selection documented in README

---

### Task 3: Diagnose Broken Package

Given package with errors:
- Missing install rules for launch files
- Circular dependencies
- Wrong dependency tags in package.xml
- Missing exports for library

**Task:** Fix all errors and document each fix.

---

## QUICK_REFERENCE

### Dependency Tag Selection

| Dependency | Tag | Example |
|------------|-----|---------|
| Used in C++ code (linked) | `<depend>` | `rclcpp`, `sensor_msgs` |
| Header-only library | `<build_depend>` | `eigen3` |
| Python runtime | `<exec_depend>` | `python3-numpy` |
| Testing framework | `<test_depend>` | `ament_cmake_gtest` |
| Build tool | `<buildtool_depend>` | `ament_cmake` |

### Install Locations

| Content | Destination |
|---------|-------------|
| Executables | `lib/${PROJECT_NAME}` |
| Libraries | `lib` |
| Headers | `include` |
| Launch files | `share/${PROJECT_NAME}/launch` |
| Config files | `share/${PROJECT_NAME}/config` |

### Colcon Build Options

```bash
colcon build                                    # Build all
colcon build --packages-select pkg              # Build one
colcon build --packages-up-to pkg               # Build pkg + deps
colcon build --symlink-install                  # Symlink Python/launch
colcon build --cmake-args -DCMAKE_BUILD_TYPE=Release
colcon build --parallel-workers 4               # Limit parallelism
```

### Build Types

| Type | Flags | Use Case |
|------|-------|----------|
| Debug | `-O0 -g` | Development |
| Release | `-O3` | Production |
| RelWithDebInfo | `-O2 -g` | Profiling |

---

**END OF TOPIC 1.3**
