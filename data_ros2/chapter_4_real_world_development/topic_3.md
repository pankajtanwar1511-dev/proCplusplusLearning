# Chapter 4: Real-World Development Practices
## Topic 3: Deployment & Packaging

---

## Theory

### 1. ROS2 Package Structure and Build System

ROS2 uses two main build systems: **ament_cmake** for C++ packages and **ament_python** for Python packages.

#### C++ Package Structure (ament_cmake)

```
my_cpp_package/
├── CMakeLists.txt              # Build configuration
├── package.xml                 # Package metadata and dependencies
├── include/
│   └── my_cpp_package/
│       └── my_class.hpp        # Public headers
├── src/
│   ├── my_class.cpp            # Implementation
│   └── my_node.cpp             # Node executable
├── launch/
│   └── my_launch.py            # Launch files
├── config/
│   └── params.yaml             # Configuration files
├── urdf/                       # Robot descriptions
├── meshes/                     # 3D models
└── README.md
```

#### Python Package Structure (ament_python)

```
my_python_package/
├── package.xml                 # Package metadata
├── setup.py                    # Python package setup
├── setup.cfg                   # Python configuration
├── resource/
│   └── my_python_package       # Resource marker file
├── my_python_package/          # Python module
│   ├── __init__.py
│   ├── my_node.py
│   └── my_module.py
├── launch/
│   └── my_launch.py
├── config/
│   └── params.yaml
└── test/
    └── test_my_node.py
```

---

### 2. Package Metadata (package.xml)

The `package.xml` file defines package metadata, dependencies, and licensing.

#### Complete package.xml Example

```xml
<?xml version="1.0"?>
<?xml-model href="http://download.ros.org/schema/package_format3.xsd"
            schematypens="http://www.w3.org/2001/XMLSchema"?>
<package format="3">
  <!-- Package identity -->
  <name>my_robot_package</name>
  <version>1.2.3</version>
  <description>Robot control and navigation package</description>

  <!-- Maintainer and author info -->
  <maintainer email="maintainer@example.com">John Doe</maintainer>
  <author email="author@example.com">Jane Smith</author>

  <!-- License (REQUIRED) -->
  <license>Apache-2.0</license>

  <!-- URLs -->
  <url type="website">https://github.com/example/my_robot_package</url>
  <url type="bugtracker">https://github.com/example/my_robot_package/issues</url>
  <url type="repository">https://github.com/example/my_robot_package</url>

  <!-- Build tool dependency (REQUIRED) -->
  <buildtool_depend>ament_cmake</buildtool_depend>

  <!-- Runtime dependencies (required to run) -->
  <depend>rclcpp</depend>
  <depend>std_msgs</depend>
  <depend>geometry_msgs</depend>
  <depend>sensor_msgs</depend>

  <!-- Build-only dependencies -->
  <build_depend>rosidl_default_generators</build_depend>

  <!-- Execution-only dependencies -->
  <exec_depend>python3-numpy</exec_depend>
  <exec_depend>ros2launch</exec_depend>

  <!-- Test dependencies -->
  <test_depend>ament_cmake_gtest</test_depend>
  <test_depend>ament_lint_auto</test_depend>
  <test_depend>ament_lint_common</test_depend>

  <!-- Build type -->
  <export>
    <build_type>ament_cmake</build_type>
  </export>
</package>
```

**Dependency Types:**

| Tag | Purpose | When to Use |
|-----|---------|-------------|
| `depend` | Build + runtime | Most common dependencies |
| `build_depend` | Build only | Code generators, build tools |
| `exec_depend` | Runtime only | Python libraries, launch files |
| `test_depend` | Testing only | Test frameworks, linters |
| `buildtool_depend` | Build system | ament_cmake, ament_python |

---

### 3. CMakeLists.txt Configuration

#### Complete CMakeLists.txt Example

```cmake
cmake_minimum_required(VERSION 3.8)
project(my_robot_package)

# Compiler settings
if(CMAKE_COMPILER_IS_GNUCXX OR CMAKE_CXX_COMPILER_ID MATCHES "Clang")
  add_compile_options(-Wall -Wextra -Wpedantic)
endif()

# Find dependencies
find_package(ament_cmake REQUIRED)
find_package(rclcpp REQUIRED)
find_package(rclcpp_components REQUIRED)
find_package(std_msgs REQUIRED)
find_package(geometry_msgs REQUIRED)
find_package(sensor_msgs REQUIRED)

# Include directories
include_directories(include)

#############################
# Libraries
#############################

# Build shared library
add_library(${PROJECT_NAME}_lib SHARED
  src/my_class.cpp
  src/helper_functions.cpp
)
target_include_directories(${PROJECT_NAME}_lib PUBLIC
  $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
  $<INSTALL_INTERFACE:include>
)
ament_target_dependencies(${PROJECT_NAME}_lib
  rclcpp
  std_msgs
  geometry_msgs
)

# Export library for other packages
ament_export_targets(${PROJECT_NAME}_libTargets HAS_LIBRARY_TARGET)
ament_export_dependencies(
  rclcpp
  std_msgs
  geometry_msgs
)

#############################
# Executables
#############################

# Main node executable
add_executable(my_node src/my_node.cpp)
target_link_libraries(my_node ${PROJECT_NAME}_lib)
ament_target_dependencies(my_node rclcpp)

# Another executable
add_executable(controller_node src/controller_node.cpp)
target_link_libraries(controller_node ${PROJECT_NAME}_lib)
ament_target_dependencies(controller_node rclcpp geometry_msgs)

#############################
# Composable nodes (components)
#############################

add_library(my_component SHARED src/my_component.cpp)
target_link_libraries(my_component ${PROJECT_NAME}_lib)
ament_target_dependencies(my_component
  rclcpp
  rclcpp_components
  sensor_msgs
)
rclcpp_components_register_nodes(my_component "my_robot_package::MyComponent")

#############################
# Installation
#############################

# Install library
install(TARGETS ${PROJECT_NAME}_lib
  EXPORT ${PROJECT_NAME}_libTargets
  ARCHIVE DESTINATION lib
  LIBRARY DESTINATION lib
  RUNTIME DESTINATION bin
)

# Install executables
install(TARGETS
  my_node
  controller_node
  DESTINATION lib/${PROJECT_NAME}
)

# Install component
install(TARGETS my_component
  ARCHIVE DESTINATION lib
  LIBRARY DESTINATION lib
  RUNTIME DESTINATION bin
)

# Install headers
install(DIRECTORY include/
  DESTINATION include
)

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

# Install URDF and meshes
install(DIRECTORY
  urdf
  meshes
  DESTINATION share/${PROJECT_NAME}/
)

#############################
# Testing
#############################

if(BUILD_TESTING)
  find_package(ament_cmake_gtest REQUIRED)
  find_package(ament_lint_auto REQUIRED)

  # Linting
  ament_lint_auto_find_test_dependencies()

  # Unit tests
  ament_add_gtest(test_my_class test/test_my_class.cpp)
  target_link_libraries(test_my_class ${PROJECT_NAME}_lib)

  # Install test executables
  install(TARGETS test_my_class
    DESTINATION lib/${PROJECT_NAME}
  )
endif()

#############################
# Finalize
#############################

ament_package()
```

**Key Sections:**

1. **Dependencies:** `find_package()` for all dependencies
2. **Libraries:** Reusable code compiled as shared libraries
3. **Executables:** Node programs
4. **Installation:** Where files are installed
5. **Export:** Make library available to other packages
6. **Testing:** Unit tests and linters

---

### 4. Python Package Setup (setup.py)

#### Complete setup.py Example

```python
from setuptools import setup
from glob import glob
import os

package_name = 'my_python_package'

setup(
    name=package_name,
    version='1.0.0',
    packages=[package_name],
    data_files=[
        # Register package with ament index
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

        # Install URDF files
        (os.path.join('share', package_name, 'urdf'),
            glob('urdf/*.urdf')),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='John Doe',
    maintainer_email='john@example.com',
    description='Python-based robot control package',
    license='Apache-2.0',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            # Create executable commands
            'my_node = my_python_package.my_node:main',
            'controller = my_python_package.controller:main',
            'sensor_reader = my_python_package.sensor_reader:main',
        ],
    },
)
```

**Entry Points:** Define executable commands that users can run with `ros2 run`.

---

### 5. Containerization with Docker

Docker provides isolated, reproducible deployment environments.

#### Dockerfile for ROS2 Application

```dockerfile
# Base image with ROS2 Humble
FROM ros:humble-ros-base

# Set working directory
WORKDIR /root/ros2_ws

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3-pip \
    python3-colcon-common-extensions \
    ros-humble-gazebo-ros-pkgs \
    ros-humble-navigation2 \
    ros-humble-nav2-bringup \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip3 install -r requirements.txt

# Copy source code
COPY src/ src/

# Build workspace
RUN . /opt/ros/humble/setup.sh && \
    colcon build --symlink-install --cmake-args -DCMAKE_BUILD_TYPE=Release

# Source workspace in bashrc for interactive shells
RUN echo "source /opt/ros/humble/setup.bash" >> ~/.bashrc && \
    echo "source /root/ros2_ws/install/setup.bash" >> ~/.bashrc

# Set up entrypoint
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]

# Default command
CMD ["bash"]
```

#### Entrypoint Script (docker/entrypoint.sh)

```bash
#!/bin/bash
set -e

# Source ROS2 setup
source /opt/ros/humble/setup.bash
source /root/ros2_ws/install/setup.bash

# Execute command
exec "$@"
```

#### Docker Compose for Multi-Container Setup

```yaml
# docker-compose.yml
version: '3.8'

services:
  # Robot control node
  robot_control:
    build: .
    command: ros2 launch my_package robot.launch.py
    environment:
      - ROS_DOMAIN_ID=0
      - RMW_IMPLEMENTATION=rmw_cyclonedds_cpp
    volumes:
      - ./logs:/root/ros2_ws/logs
    network_mode: host
    privileged: true
    devices:
      - /dev/ttyUSB0:/dev/ttyUSB0  # Hardware access
    restart: unless-stopped

  # Navigation node
  navigation:
    build: .
    command: ros2 launch nav2_bringup navigation_launch.py
    environment:
      - ROS_DOMAIN_ID=0
    network_mode: host
    depends_on:
      - robot_control
    restart: unless-stopped

  # Visualization (RViz)
  rviz:
    build: .
    command: ros2 run rviz2 rviz2
    environment:
      - DISPLAY=${DISPLAY}
      - ROS_DOMAIN_ID=0
    volumes:
      - /tmp/.X11-unix:/tmp/.X11-unix:rw
      - ./rviz_config:/root/.rviz2
    network_mode: host
```

#### Building and Running

```bash
# Build Docker image
docker build -t my_robot:latest .

# Run single container
docker run -it --rm \
  --network host \
  -e ROS_DOMAIN_ID=0 \
  my_robot:latest \
  ros2 launch my_package robot.launch.py

# Run with docker-compose
docker-compose up

# Run in background
docker-compose up -d

# View logs
docker-compose logs -f robot_control

# Stop containers
docker-compose down
```

---

### 6. systemd Service for Auto-Start

systemd ensures ROS2 nodes start automatically on boot and restart on failure.

#### Service File (my_robot.service)

```ini
[Unit]
Description=My Robot ROS2 Application
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=robot
Group=robot
WorkingDirectory=/home/robot/ros2_ws

# Environment setup
Environment="HOME=/home/robot"
Environment="ROS_DOMAIN_ID=0"
Environment="RMW_IMPLEMENTATION=rmw_cyclonedds_cpp"
Environment="RCUTILS_COLORIZED_OUTPUT=0"

# Source ROS2 and workspace
ExecStartPre=/bin/bash -c 'source /opt/ros/humble/setup.bash && source /home/robot/ros2_ws/install/setup.bash'

# Start application
ExecStart=/bin/bash -c 'source /opt/ros/humble/setup.bash && source /home/robot/ros2_ws/install/setup.bash && ros2 launch my_package robot.launch.py'

# Restart policy
Restart=on-failure
RestartSec=10
StartLimitInterval=200
StartLimitBurst=5

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=my-robot

# Resource limits
MemoryLimit=2G
CPUQuota=80%

[Install]
WantedBy=multi-user.target
```

#### Installation and Management

```bash
# Copy service file
sudo cp my_robot.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable service (start on boot)
sudo systemctl enable my_robot.service

# Start service
sudo systemctl start my_robot.service

# Check status
sudo systemctl status my_robot.service

# View logs
sudo journalctl -u my_robot.service -f

# Stop service
sudo systemctl stop my_robot.service

# Disable auto-start
sudo systemctl disable my_robot.service

# Restart service
sudo systemctl restart my_robot.service
```

#### Service with Configuration Reload

```ini
[Service]
# ... (same as above)

# Reload configuration without restart
ExecReload=/bin/bash -c 'source /opt/ros/humble/setup.bash && ros2 service call /my_node/reload_config std_srvs/srv/Trigger'

# Allow reload
Restart=on-failure
RestartSec=5
```

```bash
# Reload configuration
sudo systemctl reload my_robot.service
```

---

### 7. Debian Package Creation

Create `.deb` packages for easy installation on Ubuntu/Debian systems.

#### Using bloom for ROS2 Package Release

```bash
# Install bloom
sudo apt install python3-bloom

# Initialize bloom in your package
cd my_package
bloom-generate rosdebian --os-name ubuntu --os-version jammy --ros-distro humble

# Build Debian package
fakeroot debian/rules binary

# Install generated .deb
sudo dpkg -i ../ros-humble-my-package_*.deb

# Install dependencies
sudo apt install -f
```

#### Manual Debian Package Structure

```
my-robot-package_1.0.0/
├── DEBIAN/
│   ├── control          # Package metadata
│   ├── postinst         # Post-installation script
│   ├── prerm            # Pre-removal script
│   └── postrm           # Post-removal script
└── opt/
    └── my_robot/
        ├── bin/
        ├── lib/
        ├── share/
        └── install_setup.bash
```

**DEBIAN/control:**
```
Package: my-robot-package
Version: 1.0.0
Section: misc
Priority: optional
Architecture: amd64
Depends: ros-humble-ros-base, python3-numpy
Maintainer: John Doe <john@example.com>
Description: My Robot ROS2 Package
 Complete robot control and navigation system
 built with ROS2 Humble.
```

**DEBIAN/postinst:**
```bash
#!/bin/bash
set -e

# Create user if doesn't exist
if ! id -u robot > /dev/null 2>&1; then
    useradd -r -s /bin/bash -d /home/robot -m robot
fi

# Set permissions
chown -R robot:robot /opt/my_robot

# Install systemd service
cp /opt/my_robot/share/systemd/my_robot.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable my_robot.service

echo "Installation complete. Start service with: sudo systemctl start my_robot"
```

**Build and install:**
```bash
# Build package
dpkg-deb --build my-robot-package_1.0.0

# Install
sudo dpkg -i my-robot-package_1.0.0.deb
```

---

### 8. Snap Package for Cross-Distribution Support

Snaps work across Ubuntu, Fedora, Debian, and other Linux distributions.

#### snapcraft.yaml

```yaml
name: my-robot
version: '1.0.0'
summary: Robot control with ROS2
description: |
  Complete robot control and navigation system built with ROS2 Humble.
  Includes sensor drivers, navigation stack, and visualization tools.

grade: stable
confinement: strict
base: core22

apps:
  my-robot:
    command: opt/ros/humble/setup.bash && ros2 launch my_package robot.launch.py
    daemon: simple
    restart-condition: on-failure
    plugs:
      - network
      - network-bind
      - hardware-observe

parts:
  ros2-humble:
    plugin: nil
    build-packages:
      - curl
      - gnupg2
    override-pull: |
      # Add ROS2 repository
      curl -sSL https://raw.githubusercontent.com/ros/rosdistro/master/ros.key -o /usr/share/keyrings/ros-archive-keyring.gpg
      echo "deb [signed-by=/usr/share/keyrings/ros-archive-keyring.gpg] http://packages.ros.org/ros2/ubuntu jammy main" > /etc/apt/sources.list.d/ros2.list
      apt update
    override-build: |
      apt install -y ros-humble-ros-base

  my-robot-package:
    after: [ros2-humble]
    source: .
    plugin: colcon
    colcon-packages:
      - my_package
    override-build: |
      . /opt/ros/humble/setup.sh
      colcon build --install-base $SNAPCRAFT_PART_INSTALL/opt/my_robot
```

**Build and install:**
```bash
# Install snapcraft
sudo apt install snapcraft

# Build snap
snapcraft

# Install snap
sudo snap install my-robot_1.0.0_amd64.snap --dangerous

# Start service
sudo snap start my-robot

# View logs
sudo snap logs my-robot -f
```

---

### 9. Configuration Management

#### Environment-Specific Configuration

```bash
# config/production.yaml
/**:
  ros__parameters:
    use_sim_time: false
    log_level: info
    max_velocity: 0.5
    safety_distance: 1.0

# config/development.yaml
/**:
  ros__parameters:
    use_sim_time: true
    log_level: debug
    max_velocity: 2.0
    safety_distance: 0.3
```

#### Configuration Loader Script

```bash
#!/bin/bash
# scripts/load_config.sh

ENV=${1:-production}
CONFIG_DIR="/opt/my_robot/config"

if [ ! -f "$CONFIG_DIR/$ENV.yaml" ]; then
    echo "Error: Configuration file not found: $CONFIG_DIR/$ENV.yaml"
    exit 1
fi

# Export configuration path
export ROBOT_CONFIG="$CONFIG_DIR/$ENV.yaml"

# Start robot with configuration
ros2 launch my_package robot.launch.py config:=$ROBOT_CONFIG
```

---

### 10. Deployment Best Practices

**1. Version Control:**
- Tag releases: `git tag -a v1.0.0 -m "Release 1.0.0"`
- Use semantic versioning: MAJOR.MINOR.PATCH
- Maintain CHANGELOG.md

**2. Dependencies:**
- Pin dependency versions in package.xml
- Use rosdep for dependency management
- Document system dependencies

**3. Configuration:**
- Separate configuration from code
- Use environment variables for deployment-specific settings
- Validate configuration on startup

**4. Logging:**
- Use structured logging
- Rotate logs to prevent disk fill
- Send critical logs to monitoring system

**5. Monitoring:**
- Health checks (HTTP endpoint or ROS service)
- Metrics collection (CPU, memory, message rates)
- Alerting for failures

**6. Updates:**
- Blue-green deployment (run old and new versions)
- Graceful shutdown on SIGTERM
- Database/state migration scripts

**7. Security:**
- Run as non-root user
- Limit file system access
- Use ROS2 security (DDS Security)
- Keep dependencies updated

---

## Edge Cases

### Edge Case 1: Missing Runtime Dependencies Not Caught at Build Time

**Scenario:**
Package builds successfully but crashes at runtime due to missing Python libraries or system dependencies.

**Example:**

```xml
<!-- package.xml -->
<package format="3">
  <name>my_vision_package</name>
  <buildtool_depend>ament_cmake</buildtool_depend>
  <depend>rclcpp</depend>
  <depend>sensor_msgs</depend>
  <!-- Missing: Python dependencies! -->
</package>
```

```python
# my_vision_package/my_node.py
import rclpy
import cv2  # OpenCV - not declared!
import numpy as np  # NumPy - not declared!
from sklearn.cluster import DBSCAN  # scikit-learn - not declared!

class VisionNode(Node):
    # ...
```

**Build succeeds:**
```bash
colcon build --packages-select my_vision_package
# Build output: [100%] Built target my_vision_package
```

**Runtime fails:**
```bash
ros2 run my_vision_package my_node

# Error:
# ModuleNotFoundError: No module named 'cv2'
```

**Problem:**
- Python dependencies not declared in package.xml
- Build system doesn't check runtime Python imports
- rosdep can't install missing dependencies

**Solution: Declare All Runtime Dependencies**

```xml
<!-- package.xml -->
<package format="3">
  <name>my_vision_package</name>
  <buildtool_depend>ament_python</buildtool_depend>
  <depend>rclpy</depend>
  <depend>sensor_msgs</depend>

  <!-- Python runtime dependencies -->
  <exec_depend>python3-opencv</exec_depend>
  <exec_depend>python3-numpy</exec_depend>
  <exec_depend>python3-sklearn</exec_depend>
</package>
```

**Verify with rosdep:**
```bash
# Install dependencies
rosdep install --from-paths src --ignore-src -r -y

# Check for missing dependencies
rosdep check --from-paths src --ignore-src
```

**Create requirements.txt for Python packages:**
```txt
# requirements.txt
opencv-python>=4.5.0
numpy>=1.21.0
scikit-learn>=1.0.0
```

**Add to setup.py:**
```python
setup(
    name='my_vision_package',
    # ...
    install_requires=[
        'opencv-python>=4.5.0',
        'numpy>=1.21.0',
        'scikit-learn>=1.0.0',
    ],
)
```

**Best Practices:**
1. **Test in clean environment:** Use Docker to verify all dependencies are declared
   ```bash
   docker run -it --rm -v $(pwd):/workspace ros:humble bash
   cd /workspace
   rosdep install --from-paths src --ignore-src -r -y
   colcon build
   ros2 run my_vision_package my_node
   ```

2. **Use rosdep keys:** Map to system packages
   ```yaml
   # rosdep.yaml
   opencv:
     ubuntu: [python3-opencv]
   ```

3. **Document system dependencies in README:**
   ```markdown
   ## System Dependencies
   - OpenCV 4.5+
   - CUDA 11.0+ (for GPU support)
   ```

---

### Edge Case 2: Conflicting File Installations Between Packages

**Scenario:**
Two packages install files to the same location, causing conflicts during installation or runtime errors.

**Example:**

```cmake
# Package A: robot_description
install(FILES
  urdf/robot.urdf
  DESTINATION share/robot_description/urdf
)

# Package B: robot_description_v2
install(FILES
  urdf/robot.urdf  # Same filename!
  DESTINATION share/robot_description_v2/urdf
)
```

**If both installed in overlay workspace:**
```bash
colcon build

# Both packages install to:
# install/robot_description/share/robot_description/urdf/robot.urdf
# install/robot_description_v2/share/robot_description_v2/urdf/robot.urdf

# Launch file tries to load:
FindPackageShare('robot_description')  # Which package?
```

**Problem:**
- Ambiguous package references
- Last-installed package "wins"
- Hard to debug runtime issues

**Solution 1: Use Unique Namespaces**

```cmake
# Package A
install(FILES
  urdf/robot.urdf
  DESTINATION share/${PROJECT_NAME}/urdf
)

# Package B
install(FILES
  urdf/robot_v2.urdf  # Different filename
  DESTINATION share/${PROJECT_NAME}/urdf
)
```

**Solution 2: Use Package-Specific Paths**

```python
# In launch file
robot_description_pkg = FindPackageShare('robot_description')
robot_urdf = PathJoinSubstitution([
    robot_description_pkg,
    'urdf',
    'robot.urdf'
])

robot_v2_pkg = FindPackageShare('robot_description_v2')
robot_v2_urdf = PathJoinSubstitution([
    robot_v2_pkg,
    'urdf',
    'robot_v2.urdf'  # Unique filename
])
```

**Solution 3: Versioned Resources**

```cmake
# robot_description package
set(ROBOT_VERSION "v1")

install(FILES
  urdf/robot_${ROBOT_VERSION}.urdf
  DESTINATION share/${PROJECT_NAME}/urdf
)
```

**Detection: Check for conflicts**

```bash
# Find duplicate files
find install/ -type f -name "robot.urdf" -print
# If multiple results, conflict exists!

# Check which package provides file
ros2 pkg prefix robot_description
ls $(ros2 pkg prefix robot_description)/share/robot_description/urdf/
```

**Best Practices:**
1. **Use package-specific names:** Prefix files with package name
2. **Document shared resources:** If packages must share files, document in README
3. **Test overlay workspaces:** Build both packages together
4. **Use ament_lint:** Add checks for file conflicts in CI

---

### Edge Case 3: Large Files Not Included in Version Control

**Scenario:**
Package includes large mesh files, maps, or datasets that shouldn't be in git but are needed for deployment.

**Example:**

```bash
my_robot_package/
├── meshes/
│   ├── robot_base.stl       # 50 MB
│   ├── arm_link.stl         # 30 MB
│   └── gripper.dae          # 20 MB
├── maps/
│   └── warehouse_map.pgm    # 100 MB
└── models/
    └── object_detector.pt   # 500 MB (ML model)
```

**Problem:**
- Files too large for git (>100 MB limit)
- Cloning repository becomes slow
- CI/CD pipelines timeout
- Deployment fails with "file not found"

**Solution 1: Git LFS (Large File Storage)**

```bash
# Install git-lfs
sudo apt install git-lfs
git lfs install

# Track large files
git lfs track "*.stl"
git lfs track "*.dae"
git lfs track "*.pgm"
git lfs track "*.pt"

# Commit .gitattributes
git add .gitattributes
git commit -m "Track large files with LFS"

# Add files normally
git add meshes/ maps/ models/
git commit -m "Add robot assets"
git push
```

**Cloning with LFS:**
```bash
# Clone with all LFS files
git clone https://github.com/user/my_robot_package.git

# Clone without LFS files (faster)
GIT_LFS_SKIP_SMUDGE=1 git clone https://github.com/user/my_robot_package.git

# Download LFS files later
cd my_robot_package
git lfs pull
```

**Solution 2: External Asset Server**

```bash
# Download script
#!/bin/bash
# scripts/download_assets.sh

ASSET_URL="https://assets.example.com/my_robot"
ASSET_DIR="$(ros2 pkg prefix my_robot_package)/share/my_robot_package"

echo "Downloading robot assets..."

# Download meshes
mkdir -p "$ASSET_DIR/meshes"
wget -q "$ASSET_URL/meshes/robot_base.stl" -O "$ASSET_DIR/meshes/robot_base.stl"

# Download maps
mkdir -p "$ASSET_DIR/maps"
wget -q "$ASSET_URL/maps/warehouse_map.pgm" -O "$ASSET_DIR/maps/warehouse_map.pgm"

# Download ML models
mkdir -p "$ASSET_DIR/models"
wget -q "$ASSET_URL/models/object_detector.pt" -O "$ASSET_DIR/models/object_detector.pt"

echo "Assets downloaded successfully"
```

**Add to package installation:**
```cmake
# CMakeLists.txt
install(PROGRAMS
  scripts/download_assets.sh
  DESTINATION lib/${PROJECT_NAME}
)

# Add post-install hook
install(CODE "
  message(STATUS \"Downloading large assets...\")
  execute_process(
    COMMAND ${CMAKE_INSTALL_PREFIX}/lib/${PROJECT_NAME}/download_assets.sh
    RESULT_VARIABLE DOWNLOAD_RESULT
  )
  if(NOT DOWNLOAD_RESULT EQUAL 0)
    message(WARNING \"Failed to download assets. Run manually: ros2 run ${PROJECT_NAME} download_assets.sh\")
  endif()
")
```

**Solution 3: Separate Data Package**

```bash
# Create data-only package
my_robot_data/
├── package.xml
├── CMakeLists.txt  # Just installs files
└── data/
    ├── meshes/
    ├── maps/
    └── models/
```

```cmake
# my_robot_data/CMakeLists.txt
cmake_minimum_required(VERSION 3.8)
project(my_robot_data)

find_package(ament_cmake REQUIRED)

# Install data files
install(DIRECTORY
  data/meshes
  data/maps
  data/models
  DESTINATION share/${PROJECT_NAME}/data
)

ament_package()
```

```xml
<!-- my_robot_package/package.xml -->
<depend>my_robot_data</depend>  <!-- Declare dependency -->
```

**Best Practices:**
1. **Use git LFS for assets <500 MB**
2. **External hosting for very large files (>500 MB)**
3. **Document download requirements in README**
4. **Provide checksum verification:**
   ```bash
   sha256sum -c assets.sha256
   ```
5. **Graceful degradation:** Provide low-res fallbacks if assets missing

---

### Edge Case 4: Permission Errors in systemd Service

**Scenario:**
systemd service fails to access hardware devices or files due to incorrect permissions.

**Example:**

```ini
# /etc/systemd/system/robot.service
[Service]
User=robot
ExecStart=/bin/bash -c 'ros2 launch my_package robot.launch.py'
```

**Node tries to access serial device:**
```cpp
// In node
auto fd = open("/dev/ttyUSB0", O_RDWR);
if (fd < 0) {
    RCLCPP_ERROR(get_logger(), "Failed to open /dev/ttyUSB0: %s", strerror(errno));
    // errno = 13 (EACCES - Permission denied)
}
```

**Check device permissions:**
```bash
ls -l /dev/ttyUSB0
# crw-rw---- 1 root dialout 188, 0 Jan 10 10:00 /dev/ttyUSB0
#            ^^^^^^^^^^
#            Only root and dialout group can access
```

**Problem:**
- User `robot` not in `dialout` group
- Service can't access hardware
- Same code works when run manually (your user is in dialout)

**Solution 1: Add User to Required Groups**

```bash
# Add robot user to dialout group
sudo usermod -aG dialout robot

# Add to other common hardware groups
sudo usermod -aG video robot      # Camera access
sudo usermod -aG i2c robot        # I2C devices
sudo usermod -aG gpio robot       # GPIO (Raspberry Pi)
sudo usermod -aG input robot      # Input devices

# Verify groups
groups robot
# robot : robot dialout video i2c gpio input
```

**Restart service for changes to take effect:**
```bash
sudo systemctl restart robot.service
```

**Solution 2: Use udev Rules**

```bash
# /etc/udev/rules.d/99-robot-devices.rules

# Give robot user access to specific USB device (by vendor/product ID)
SUBSYSTEM=="tty", ATTRS{idVendor}=="1234", ATTRS{idProduct}=="5678", MODE="0666", OWNER="robot"

# Or give access to all USB serial devices
SUBSYSTEM=="tty", ATTRS{interface}=="USB Serial", MODE="0666", GROUP="robot"

# Camera access
SUBSYSTEM=="video4linux", MODE="0666", GROUP="robot"
```

**Reload udev rules:**
```bash
sudo udevadm control --reload-rules
sudo udevadm trigger
```

**Solution 3: Use systemd DeviceAllow**

```ini
# /etc/systemd/system/robot.service
[Service]
User=robot
Group=robot

# Grant access to specific devices
DeviceAllow=/dev/ttyUSB0 rw
DeviceAllow=/dev/video0 rw
DeviceAllow=char-usb_device rw

# Or less restrictive
DevicePolicy=auto

ExecStart=/bin/bash -c 'ros2 launch my_package robot.launch.py'
```

**Solution 4: Run as Root (NOT RECOMMENDED for production)**

```ini
[Service]
User=root  # Security risk!
Group=root
ExecStart=/bin/bash -c 'ros2 launch my_package robot.launch.py'
```

**Better: Use capabilities instead:**
```ini
[Service]
User=robot
Group=robot
# Grant specific capabilities instead of root
AmbientCapabilities=CAP_SYS_RAWIO
ExecStart=/bin/bash -c 'ros2 launch my_package robot.launch.py'
```

**Debugging Permission Issues:**

```bash
# Check which user service runs as
ps aux | grep robot.launch

# Check service status for permission errors
sudo journalctl -u robot.service -n 50

# Test manually as service user
sudo -u robot /bin/bash
source /opt/ros/humble/setup.bash
ros2 launch my_package robot.launch.py
# If this fails, permission issue confirmed
```

**Best Practices:**
1. **Create dedicated user for robot services**
2. **Add user to necessary groups during installation (postinst script)**
3. **Document required permissions in README**
4. **Use udev rules for persistent device permissions**
5. **Test service as non-root user before deployment**
6. **Log permission errors clearly for debugging**

---

## Code Examples

### Example: Complete Deployment Package with Docker and systemd

This example shows a production-ready deployment setup.

**Directory Structure:**

```
my_robot_deployment/
├── docker/
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── entrypoint.sh
├── systemd/
│   ├── robot.service
│   └── robot-watchdog.service
├── scripts/
│   ├── install.sh
│   ├── uninstall.sh
│   └── health_check.sh
├── src/
│   └── my_robot_package/
├── config/
│   ├── production.yaml
│   └── development.yaml
└── README.md
```

**1. Dockerfile (docker/Dockerfile):**

```dockerfile
FROM ros:humble-ros-base

# Install dependencies
RUN apt-get update && apt-get install -y \
    python3-colcon-common-extensions \
    ros-humble-navigation2 \
    ros-humble-gazebo-ros-pkgs \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Create workspace
WORKDIR /opt/robot_ws

# Copy source
COPY src/ src/

# Install dependencies via rosdep
RUN . /opt/ros/humble/setup.sh && \
    rosdep update && \
    rosdep install --from-paths src --ignore-src -r -y

# Build workspace
RUN . /opt/ros/humble/setup.sh && \
    colcon build --cmake-args -DCMAKE_BUILD_TYPE=Release

# Setup entrypoint
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Health check
COPY scripts/health_check.sh /health_check.sh
RUN chmod +x /health_check.sh
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD /health_check.sh

ENTRYPOINT ["/entrypoint.sh"]
CMD ["ros2", "launch", "my_robot_package", "robot.launch.py"]
```

**2. Docker Entrypoint (docker/entrypoint.sh):**

```bash
#!/bin/bash
set -e

# Source ROS
source /opt/ros/humble/setup.bash
source /opt/robot_ws/install/setup.bash

# Set DDS configuration
export RMW_IMPLEMENTATION=rmw_cyclonedds_cpp
export CYCLONEDDS_URI=file:///opt/robot_ws/config/cyclonedds.xml

# Wait for required services (if needed)
if [ ! -z "$WAIT_FOR_SERVICE" ]; then
    echo "Waiting for service: $WAIT_FOR_SERVICE"
    ros2 service list | grep -q "$WAIT_FOR_SERVICE" || {
        timeout 60 bash -c "until ros2 service list | grep -q $WAIT_FOR_SERVICE; do sleep 1; done"
    }
fi

# Execute command
exec "$@"
```

**3. Health Check Script (scripts/health_check.sh):**

```bash
#!/bin/bash

# Check if critical nodes are running
REQUIRED_NODES=(
    "/robot_state_publisher"
    "/controller_manager"
    "/navigation"
)

for node in "${REQUIRED_NODES[@]}"; do
    if ! ros2 node list | grep -q "$node"; then
        echo "ERROR: Required node not running: $node"
        exit 1
    fi
done

# Check if topics are publishing
REQUIRED_TOPICS=(
    "/joint_states"
    "/odom"
    "/scan"
)

for topic in "${REQUIRED_TOPICS[@]}"; do
    # Check if topic has publishers
    publishers=$(ros2 topic info "$topic" 2>/dev/null | grep "Publisher count:" | awk '{print $3}')
    if [ "$publishers" == "0" ] || [ -z "$publishers" ]; then
        echo "ERROR: No publishers for required topic: $topic"
        exit 1
    fi
done

echo "Health check passed"
exit 0
```

**4. Docker Compose (docker/docker-compose.yml):**

```yaml
version: '3.8'

services:
  robot:
    build:
      context: ..
      dockerfile: docker/Dockerfile
    container_name: robot_controller
    command: ros2 launch my_robot_package robot.launch.py config:=/opt/robot_ws/config/production.yaml
    environment:
      - ROS_DOMAIN_ID=${ROS_DOMAIN_ID:-0}
      - RMW_IMPLEMENTATION=rmw_cyclonedds_cpp
      - RCUTILS_COLORIZED_OUTPUT=0
    volumes:
      - ../config:/opt/robot_ws/config:ro
      - robot_logs:/opt/robot_ws/logs
      - /dev:/dev  # Hardware access
    network_mode: host
    privileged: true
    restart: unless-stopped
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  watchdog:
    build:
      context: ..
      dockerfile: docker/Dockerfile
    container_name: robot_watchdog
    command: python3 /opt/robot_ws/src/my_robot_package/scripts/watchdog.py
    environment:
      - ROS_DOMAIN_ID=${ROS_DOMAIN_ID:-0}
    network_mode: host
    depends_on:
      - robot
    restart: unless-stopped

volumes:
  robot_logs:
```

**5. systemd Service (systemd/robot.service):**

```ini
[Unit]
Description=Robot Control System
After=docker.service network-online.target
Requires=docker.service
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/my_robot

# Start containers
ExecStart=/usr/bin/docker-compose -f /opt/my_robot/docker/docker-compose.yml up -d

# Stop containers
ExecStop=/usr/bin/docker-compose -f /opt/my_robot/docker/docker-compose.yml down

# Reload configuration
ExecReload=/usr/bin/docker-compose -f /opt/my_robot/docker/docker-compose.yml restart robot

# Restart policy
Restart=on-failure
RestartSec=30

[Install]
WantedBy=multi-user.target
```

**6. Installation Script (scripts/install.sh):**

```bash
#!/bin/bash
set -e

INSTALL_DIR="/opt/my_robot"
SERVICE_FILE="robot.service"

echo "=== Robot Deployment Installation ==="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Error: Please run as root (sudo)"
    exit 1
fi

# Install dependencies
echo "Installing dependencies..."
apt-get update
apt-get install -y docker.io docker-compose

# Create installation directory
echo "Creating installation directory: $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"

# Copy files
echo "Copying files..."
cp -r docker/ "$INSTALL_DIR/"
cp -r config/ "$INSTALL_DIR/"
cp -r scripts/ "$INSTALL_DIR/"
cp -r src/ "$INSTALL_DIR/"

# Build Docker image
echo "Building Docker image..."
cd "$INSTALL_DIR"
docker-compose -f docker/docker-compose.yml build

# Install systemd service
echo "Installing systemd service..."
cp systemd/"$SERVICE_FILE" /etc/systemd/system/
systemctl daemon-reload

# Create robot user
if ! id -u robot > /dev/null 2>&1; then
    echo "Creating robot user..."
    useradd -r -s /bin/bash -d /home/robot -m robot
    usermod -aG docker robot
    usermod -aG dialout robot
fi

# Set permissions
chown -R robot:robot "$INSTALL_DIR"

# Enable service
echo "Enabling service..."
systemctl enable "$SERVICE_FILE"

echo ""
echo "=== Installation Complete ==="
echo "Start service: sudo systemctl start $SERVICE_FILE"
echo "Check status: sudo systemctl status $SERVICE_FILE"
echo "View logs: sudo journalctl -u $SERVICE_FILE -f"
```

**7. Uninstall Script (scripts/uninstall.sh):**

```bash
#!/bin/bash
set -e

INSTALL_DIR="/opt/my_robot"
SERVICE_FILE="robot.service"

echo "=== Robot Deployment Uninstallation ==="

if [ "$EUID" -ne 0 ]; then
    echo "Error: Please run as root (sudo)"
    exit 1
fi

# Stop and disable service
echo "Stopping service..."
systemctl stop "$SERVICE_FILE" || true
systemctl disable "$SERVICE_FILE" || true

# Remove systemd service
rm -f /etc/systemd/system/"$SERVICE_FILE"
systemctl daemon-reload

# Stop containers
echo "Stopping containers..."
cd "$INSTALL_DIR"
docker-compose -f docker/docker-compose.yml down || true

# Remove Docker images
echo "Removing Docker images..."
docker rmi my_robot_deployment_robot || true

# Remove installation directory
echo "Removing installation directory..."
rm -rf "$INSTALL_DIR"

# Optionally remove robot user
read -p "Remove robot user? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    userdel -r robot || true
fi

echo "=== Uninstallation Complete ==="
```

**Usage:**

```bash
# Build and deploy
cd my_robot_deployment
sudo ./scripts/install.sh

# Start service
sudo systemctl start robot.service

# Check status
sudo systemctl status robot.service

# View logs
sudo journalctl -u robot.service -f

# Or view Docker logs
sudo docker logs robot_controller -f

# Health check
sudo docker exec robot_controller /health_check.sh

# Reload configuration
sudo systemctl reload robot.service

# Uninstall
sudo ./scripts/uninstall.sh
```

---

## Interview Questions

### Question 1: What's the difference between `depend`, `build_depend`, and `exec_depend` in package.xml?

**Difficulty:** ⭐⭐ (Medium)

**Answer:**

These tags specify when dependencies are needed:

**`depend`** (Build + Runtime):
```xml
<depend>rclcpp</depend>
<depend>std_msgs</depend>
```
- Required for both building and running
- Most common for core ROS2 libraries
- Equivalent to having both `build_depend` and `exec_depend`

**`build_depend`** (Build Only):
```xml
<build_depend>rosidl_default_generators</build_depend>
<build_depend>ament_cmake_gtest</build_depend>
```
- Only needed during compilation
- Examples: message generators, build tools
- Not needed when running the package

**`exec_depend`** (Runtime Only):
```xml
<exec_depend>python3-numpy</exec_depend>
<exec_depend>ros2launch</exec_depend>
```
- Only needed when executing the package
- Examples: Python libraries, launch files, scripts
- Not needed during build

**When to use:**

| Scenario | Tag |
|----------|-----|
| ROS2 library used in C++ code | `depend` |
| Python library imported at runtime | `exec_depend` |
| Message generation | `build_depend` |
| Launch files from another package | `exec_depend` |
| Test framework | `test_depend` |

**Example:**

```xml
<package format="3">
  <name>vision_processor</name>

  <!-- Build and runtime -->
  <depend>rclcpp</depend>
  <depend>sensor_msgs</depend>

  <!-- Build only (message generation) -->
  <build_depend>rosidl_default_generators</build_depend>

  <!-- Runtime only (Python deps) -->
  <exec_depend>python3-opencv</exec_depend>
  <exec_depend>python3-numpy</exec_depend>

  <!-- Testing only -->
  <test_depend>ament_cmake_gtest</test_depend>
</package>
```

**Why it matters:**
- `rosdep` uses these to install correct dependencies
- Binary packages (`.deb`) have separate build and runtime deps
- Incorrect tags can cause build failures or runtime crashes

---

### Question 2: How would you deploy a ROS2 application to multiple robots with different configurations?

**Difficulty:** ⭐⭐⭐ (Hard)

**Answer:**

I would use a combination of **environment-specific configuration files**, **launch arguments**, and **deployment automation**.

**Approach:**

**1. Create Robot-Specific Configurations:**

```yaml
# config/robot1.yaml
/**:
  ros__parameters:
    robot_id: "robot1"
    max_velocity: 1.0
    sensor_port: "/dev/ttyUSB0"
    camera_id: 0

# config/robot2.yaml
/**:
  ros__parameters:
    robot_id: "robot2"
    max_velocity: 0.8
    sensor_port: "/dev/ttyUSB1"
    camera_id: 1
```

**2. Launch File with Configuration Loading:**

```python
def generate_launch_description():
    robot_id_arg = DeclareLaunchArgument(
        'robot_id',
        default_value=EnvironmentVariable('ROBOT_ID', default_value='robot1'),
        description='Robot identifier'
    )

    robot_id = LaunchConfiguration('robot_id')

    # Load robot-specific config
    config_file = PathJoinSubstitution([
        FindPackageShare('my_package'),
        'config',
        [robot_id, '.yaml']
    ])

    node = Node(
        package='my_package',
        executable='my_node',
        parameters=[config_file]
    )

    return LaunchDescription([robot_id_arg, node])
```

**3. Deployment Script:**

```bash
#!/bin/bash
# deploy.sh

ROBOT_ID=$1
ROBOT_HOST=$2

if [ -z "$ROBOT_ID" ] || [ -z "$ROBOT_HOST" ]; then
    echo "Usage: ./deploy.sh <robot_id> <robot_host>"
    exit 1
fi

echo "Deploying to $ROBOT_ID at $ROBOT_HOST..."

# Build package
colcon build --packages-select my_package

# Copy to robot
rsync -avz --delete \
    install/ \
    robot@$ROBOT_HOST:/opt/robot_ws/install/

# Copy config
scp config/$ROBOT_ID.yaml robot@$ROBOT_HOST:/opt/robot_ws/config/

# Set environment variable on robot
ssh robot@$ROBOT_HOST "echo 'export ROBOT_ID=$ROBOT_ID' >> ~/.bashrc"

# Restart service
ssh robot@$ROBOT_HOST "sudo systemctl restart robot.service"

echo "Deployment complete!"
```

**4. Use Ansible for Large Fleets:**

```yaml
# ansible/deploy.yml
---
- name: Deploy ROS2 application
  hosts: robots
  become: yes
  vars:
    workspace_dir: /opt/robot_ws

  tasks:
    - name: Copy ROS2 workspace
      synchronize:
        src: ../install/
        dest: "{{ workspace_dir }}/install/"
        delete: yes

    - name: Copy robot-specific config
      copy:
        src: "../config/{{ inventory_hostname }}.yaml"
        dest: "{{ workspace_dir }}/config/robot.yaml"

    - name: Set ROBOT_ID environment variable
      lineinfile:
        path: /etc/environment
        regexp: '^ROBOT_ID='
        line: "ROBOT_ID={{ inventory_hostname }}"

    - name: Restart robot service
      systemd:
        name: robot.service
        state: restarted
```

**Inventory file:**
```ini
# ansible/hosts
[robots]
robot1 ansible_host=192.168.1.101
robot2 ansible_host=192.168.1.102
robot3 ansible_host=192.168.1.103

[robots:vars]
ansible_user=robot
ansible_ssh_private_key_file=~/.ssh/robot_key
```

**Deploy:**
```bash
ansible-playbook -i ansible/hosts ansible/deploy.yml
```

**5. Docker for Consistent Environments:**

```bash
# Build once
docker build -t my_robot:latest .

# Deploy to multiple robots
for robot in robot1 robot2 robot3; do
    docker save my_robot:latest | ssh $robot 'docker load'
    ssh $robot "docker stop my_robot || true"
    ssh $robot "docker run -d --name my_robot \
        -e ROBOT_ID=$robot \
        --network host \
        --restart unless-stopped \
        my_robot:latest"
done
```

**Best Practices:**
- Use environment variables for deployment-specific settings
- Store configurations in version control
- Automate deployment with scripts or Ansible
- Test configurations in staging before production
- Use Docker for consistent environments
- Implement rollback mechanism for failed deployments

---

### Question 3: Explain how you would handle a rolling update of a ROS2 system without downtime.

**Difficulty:** ⭐⭐⭐ (Hard)

**Answer:**

A rolling update keeps the system operational while updating nodes one at a time. This requires careful orchestration and redundancy.

**Strategy: Blue-Green Deployment with Namespaces**

**1. Architecture:**
- Run two instances: "blue" (current) and "green" (new)
- Use namespaces to isolate instances
- Switch traffic from blue to green after validation

**2. Implementation:**

```python
# launch/rolling_update.py
def generate_launch_description():
    version = LaunchConfiguration('version')  # 'blue' or 'green'

    # All nodes under version namespace
    robot_group = GroupAction([
        PushRosNamespace(version),
        Node(package='my_package', executable='controller'),
        Node(package='my_package', executable='navigation'),
        Node(package='my_package', executable='perception'),
    ])

    return LaunchDescription([
        DeclareLaunchArgument('version', default_value='blue'),
        robot_group
    ])
```

**3. Update Process:**

```bash
# Step 1: Current system running as "blue"
ros2 launch my_package robot.launch.py version:=blue

# Step 2: Start "green" version (new)
ros2 launch my_package robot.launch.py version:=green

# Step 3: Verify green is healthy
ros2 node list | grep green
ros2 topic echo /green/health_status

# Step 4: Switch traffic to green
# Use topic remapping or gateway node
ros2 run my_package traffic_switch --target green

# Step 5: Monitor green for issues
sleep 60
if [ $? -eq 0 ]; then
    # Step 6: Stop blue version
    killall -SIGTERM blue_controller
fi
```

**4. Traffic Switch Node:**

```cpp
// Bridges /cmd_vel to /blue/cmd_vel or /green/cmd_vel
class TrafficSwitch : public rclcpp::Node {
public:
    TrafficSwitch() : Node("traffic_switch") {
        declare_parameter("target", "blue");

        sub_ = create_subscription<Twist>(
            "/cmd_vel", 10,
            [this](const Twist::SharedPtr msg) {
                std::string target = get_parameter("target").as_string();
                auto pub = get_publisher(target);
                pub->publish(*msg);
            }
        );

        blue_pub_ = create_publisher<Twist>("/blue/cmd_vel", 10);
        green_pub_ = create_publisher<Twist>("/green/cmd_vel", 10);
    }

private:
    rclcpp::Publisher<Twist>::SharedPtr get_publisher(const std::string &target) {
        return (target == "green") ? green_pub_ : blue_pub_;
    }

    rclcpp::Subscription<Twist>::SharedPtr sub_;
    rclcpp::Publisher<Twist>::SharedPtr blue_pub_;
    rclcpp::Publisher<Twist>::SharedPtr green_pub_;
};
```

**5. Automated Rolling Update Script:**

```bash
#!/bin/bash
# rolling_update.sh

CURRENT_VERSION="blue"
NEW_VERSION="green"

echo "Starting rolling update: $CURRENT_VERSION -> $NEW_VERSION"

# Launch new version
echo "Launching $NEW_VERSION..."
ros2 launch my_package robot.launch.py version:=$NEW_VERSION &
NEW_PID=$!

# Wait for new version to be ready
echo "Waiting for $NEW_VERSION to be ready..."
timeout 30 bash -c "until ros2 node list | grep -q '/$NEW_VERSION/'; do sleep 1; done"

if [ $? -ne 0 ]; then
    echo "ERROR: $NEW_VERSION failed to start"
    kill $NEW_PID
    exit 1
fi

# Health check new version
echo "Health checking $NEW_VERSION..."
ros2 service call /${NEW_VERSION}/health_check std_srvs/srv/Trigger

if [ $? -ne 0 ]; then
    echo "ERROR: $NEW_VERSION health check failed"
    kill $NEW_PID
    exit 1
fi

# Switch traffic
echo "Switching traffic to $NEW_VERSION..."
ros2 param set /traffic_switch target $NEW_VERSION

# Monitor for 30 seconds
echo "Monitoring $NEW_VERSION..."
sleep 30

# If successful, stop old version
echo "Stopping $CURRENT_VERSION..."
ros2 lifecycle set /${CURRENT_VERSION}/controller shutdown

echo "Rolling update complete!"
```

**6. With Docker:**

```bash
# Run blue version
docker run -d --name robot_blue \
    --network host \
    -e NAMESPACE=blue \
    my_robot:v1.0

# Deploy green version
docker run -d --name robot_green \
    --network host \
    -e NAMESPACE=green \
    my_robot:v2.0

# Switch traffic (update environment variable or config)
docker exec traffic_switch ros2 param set /traffic_switch target green

# Remove old version after validation
docker stop robot_blue
docker rm robot_blue
```

**Considerations:**
- **State migration:** Transfer state from blue to green (e.g., map, localization)
- **Database compatibility:** Ensure schema changes are backward-compatible
- **Rollback plan:** Keep blue running for quick rollback
- **Monitoring:** Watch metrics during transition
- **Gradual rollout:** Route percentage of traffic first (canary deployment)

---

### Question 4: What strategies would you use to minimize Docker image size for ROS2 applications?

**Difficulty:** ⭐⭐ (Medium)

**Answer:**

Large Docker images slow deployment and consume storage. Here are strategies to minimize size:

**1. Use Minimal Base Images:**

```dockerfile
# BAD: Full desktop install (2+ GB)
FROM ros:humble-desktop-full

# GOOD: Base image only (300 MB)
FROM ros:humble-ros-base

# BEST: Build from scratch
FROM ubuntu:jammy
RUN apt-get update && apt-get install -y \
    ros-humble-ros-core \
    ros-humble-<only-what-you-need>
```

**2. Multi-Stage Builds:**

```dockerfile
# Stage 1: Build
FROM ros:humble-ros-base AS builder

WORKDIR /workspace
COPY src/ src/

RUN . /opt/ros/humble/setup.sh && \
    apt-get update && \
    rosdep install --from-paths src --ignore-src -r -y && \
    colcon build --cmake-args -DCMAKE_BUILD_TYPE=Release

# Stage 2: Runtime (smaller)
FROM ros:humble-ros-base

# Copy only built artifacts (not source or build files)
COPY --from=builder /workspace/install /opt/robot_ws/install

# Runtime dependencies only
RUN apt-get update && apt-get install -y \
    ros-humble-navigation2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/robot_ws
RUN echo "source /opt/ros/humble/setup.bash && source install/setup.bash" >> ~/.bashrc

CMD ["bash"]
```

**Size comparison:**
- Single stage: 1.5 GB
- Multi-stage: 600 MB (60% reduction!)

**3. Clean Up apt Cache:**

```dockerfile
# BAD: Leaves cache
RUN apt-get update && apt-get install -y ros-humble-navigation2

# GOOD: Clean up in same layer
RUN apt-get update && apt-get install -y \
    ros-humble-navigation2 \
    && rm -rf /var/lib/apt/lists/*
```

**4. Minimize Layers:**

```dockerfile
# BAD: Many layers
RUN apt-get update
RUN apt-get install -y package1
RUN apt-get install -y package2
RUN rm -rf /var/lib/apt/lists/*  # Doesn't help, different layer!

# GOOD: Single layer
RUN apt-get update && apt-get install -y \
    package1 \
    package2 \
    && rm -rf /var/lib/apt/lists/*
```

**5. Use .dockerignore:**

```
# .dockerignore
*.md
.git/
.github/
build/
log/
install/
*.pyc
__pycache__/
.vscode/
.DS_Store
```

**6. Install Only Runtime Dependencies:**

```dockerfile
# In final stage, install only exec_depend packages
RUN apt-get update && apt-get install -y \
    $(rosdep install --from-paths /opt/robot_ws/install --ignore-src -r -y --simulate | \
      grep 'apt-get install' | sed 's/apt-get install //' | sed 's/-y //') \
    && rm -rf /var/lib/apt/lists/*
```

**7. Compress Layers:**

```bash
# Use docker-squash to merge layers
pip install docker-squash
docker-squash my_robot:latest -t my_robot:squashed
```

**8. Optimize Python:**

```dockerfile
# Remove pyc files and pycache
RUN find /opt/robot_ws -type f -name '*.pyc' -delete && \
    find /opt/robot_ws -type d -name '__pycache__' -delete
```

**Complete Optimized Dockerfile:**

```dockerfile
FROM ros:humble-ros-base AS builder

WORKDIR /workspace
COPY src/ src/

RUN apt-get update && \
    rosdep install --from-paths src --ignore-src -r -y && \
    . /opt/ros/humble/setup.sh && \
    colcon build --cmake-args -DCMAKE_BUILD_TYPE=Release && \
    rm -rf build/ log/

FROM ros:humble-ros-base

COPY --from=builder /workspace/install /opt/robot_ws/install

RUN apt-get update && \
    rosdep install --from-paths /opt/robot_ws/install --ignore-src -r -y && \
    rm -rf /var/lib/apt/lists/* && \
    find /opt/robot_ws -type f -name '*.pyc' -delete && \
    find /opt/robot_ws -type d -name '__pycache__' -delete

WORKDIR /opt/robot_ws
ENTRYPOINT ["/bin/bash", "-c", "source /opt/ros/humble/setup.bash && source install/setup.bash && exec \"$@\"", "--"]
CMD ["bash"]
```

**Result:**
- Before optimization: 1.8 GB
- After optimization: 500 MB (72% reduction!)

---

### Question 5: How would you implement health checks for a ROS2 service running in production?

**Difficulty:** ⭐⭐ (Medium)

**Answer:**

Health checks ensure the system is functioning correctly and enable automatic recovery.

**Implementation Levels:**

**1. Node-Level Health Check (ROS2 Service):**

```cpp
// health_check_node.cpp
class HealthCheckNode : public rclcpp::Node {
public:
    HealthCheckNode() : Node("health_check") {
        // Service for external health checks
        health_srv_ = create_service<std_srvs::srv::Trigger>(
            "health_check",
            [this](const std_srvs::srv::Trigger::Request::SharedPtr,
                   std_srvs::srv::Trigger::Response::SharedPtr response) {
                response->success = check_health();
                response->message = health_status_;
                return;
            }
        );

        // Periodic self-check
        timer_ = create_wall_timer(std::chrono::seconds(5), [this]() {
            check_health();
        });
    }

private:
    bool check_health() {
        bool healthy = true;
        std::stringstream status;

        // Check 1: Required nodes running
        auto node_names = get_node_names();
        for (const auto &required_node : required_nodes_) {
            if (std::find(node_names.begin(), node_names.end(), required_node) == node_names.end()) {
                status << "Missing node: " << required_node << "; ";
                healthy = false;
            }
        }

        // Check 2: Topics publishing
        for (const auto &topic : required_topics_) {
            auto pub_count = count_publishers(topic);
            if (pub_count == 0) {
                status << "No publishers on: " << topic << "; ";
                healthy = false;
            }
        }

        // Check 3: Message rates
        // (Store last message times and check freshness)

        health_status_ = healthy ? "OK" : status.str();
        return healthy;
    }

    rclcpp::Service<std_srvs::srv::Trigger>::SharedPtr health_srv_;
    rclcpp::TimerBase::SharedPtr timer_;
    std::vector<std::string> required_nodes_ = {"/controller", "/navigation"};
    std::vector<std::string> required_topics_ = {"/scan", "/odom"};
    std::string health_status_;
};
```

**2. Docker Health Check:**

```dockerfile
# Dockerfile
COPY scripts/health_check.sh /health_check.sh
RUN chmod +x /health_check.sh

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD /health_check.sh
```

```bash
# scripts/health_check.sh
#!/bin/bash
source /opt/ros/humble/setup.bash
source /opt/robot_ws/install/setup.bash

# Check if health check service exists
if ! ros2 service list | grep -q "/health_check"; then
    echo "Health check service not available"
    exit 1
fi

# Call health check service
result=$(ros2 service call /health_check std_srvs/srv/Trigger 2>&1)

if echo "$result" | grep -q "success: true"; then
    echo "Health check passed"
    exit 0
else
    echo "Health check failed: $result"
    exit 1
fi
```

**3. systemd Health Check:**

```ini
# /etc/systemd/system/robot.service
[Service]
ExecStart=/opt/robot_ws/start.sh

# Watchdog (requires service to call sd_notify periodically)
WatchdogSec=60s

# Or use separate health check service
ExecStartPost=/opt/robot_ws/scripts/wait_healthy.sh

# Restart if unhealthy
Restart=on-failure
RestartSec=10
```

```bash
# scripts/wait_healthy.sh
#!/bin/bash
for i in {1..30}; do
    if /opt/robot_ws/scripts/health_check.sh; then
        echo "System healthy"
        exit 0
    fi
    sleep 2
done

echo "System failed to become healthy"
exit 1
```

**4. External Monitoring (Prometheus):**

```cpp
// Expose metrics
class MetricsNode : public rclcpp::Node {
public:
    MetricsNode() : Node("metrics") {
        // HTTP server for Prometheus scraping
        http_server_ = std::make_shared<SimpleHttpServer>(9090);

        http_server_->add_endpoint("/metrics", [this]() {
            return generate_metrics();
        });

        timer_ = create_wall_timer(std::chrono::seconds(1), [this]() {
            update_metrics();
        });
    }

private:
    std::string generate_metrics() {
        std::stringstream ss;
        ss << "# HELP nodes_running Number of running nodes\n";
        ss << "# TYPE nodes_running gauge\n";
        ss << "nodes_running " << get_node_names().size() << "\n";

        ss << "# HELP topics_active Number of active topics\n";
        ss << "# TYPE topics_active gauge\n";
        ss << "topics_active " << get_topic_names_and_types().size() << "\n";

        return ss.str();
    }

    void update_metrics() {
        // Update internal metrics
    }

    std::shared_ptr<SimpleHttpServer> http_server_;
    rclcpp::TimerBase::SharedPtr timer_;
};
```

**Prometheus configuration:**
```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'robot'
    static_configs:
      - targets: ['localhost:9090']
    scrape_interval: 10s
```

**5. Comprehensive Health Check Script:**

```bash
#!/bin/bash
# comprehensive_health_check.sh

EXIT_CODE=0

# Check 1: ROS2 daemon
if ! ros2 daemon status | grep -q "running"; then
    echo "FAIL: ROS2 daemon not running"
    EXIT_CODE=1
else
    echo "PASS: ROS2 daemon running"
fi

# Check 2: Required nodes
REQUIRED_NODES=("/controller" "/navigation" "/perception")
for node in "${REQUIRED_NODES[@]}"; do
    if ros2 node list | grep -q "$node"; then
        echo "PASS: Node $node running"
    else
        echo "FAIL: Node $node not running"
        EXIT_CODE=1
    fi
done

# Check 3: Topic rates
if ros2 topic hz /scan --once --timeout 5 > /dev/null 2>&1; then
    echo "PASS: /scan publishing"
else
    echo "FAIL: /scan not publishing"
    EXIT_CODE=1
fi

# Check 4: CPU/Memory
CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
if (( $(echo "$CPU_USAGE > 95" | bc -l) )); then
    echo "WARN: High CPU usage: $CPU_USAGE%"
fi

MEM_USAGE=$(free | grep Mem | awk '{print ($3/$2) * 100.0}')
if (( $(echo "$MEM_USAGE > 90" | bc -l) )); then
    echo "WARN: High memory usage: $MEM_USAGE%"
fi

exit $EXIT_CODE
```

**Best Practices:**
- Implement multiple check levels (node, container, system)
- Check critical dependencies (nodes, topics, hardware)
- Monitor resource usage (CPU, memory, disk)
- Expose metrics for external monitoring
- Implement graceful degradation when possible
- Alert on failures (email, Slack, PagerDuty)

---

## Practice Tasks

### Practice Task 1: Create Production-Ready Debian Package

**Objective:** Package a ROS2 application as a `.deb` file for easy distribution and installation.

**Requirements:**

1. **Package Structure:**
   - Create proper DEBIAN control files
   - Include post-install script to setup systemd service
   - Include pre-remove script for cleanup

2. **Installation:**
   - Install ROS2 workspace to `/opt/my_robot`
   - Create `robot` user
   - Setup systemd service
   - Configure logrotate

3. **Features:**
   - Declare all dependencies in control file
   - Version management
   - Configuration file handling (don't overwrite on upgrade)

4. **Testing:**
   - Install package on clean Ubuntu system
   - Verify service starts automatically
   - Test upgrade path (install v1.0, upgrade to v2.0)
   - Test uninstallation (clean removal)

**Deliverables:**
- Package directory structure
- All DEBIAN scripts (control, postinst, prerm, postrm)
- Build script
- Installation test results
- Documentation

---

### Practice Task 2: Implement Blue-Green Deployment System

**Objective:** Create a zero-downtime deployment system using blue-green strategy.

**Requirements:**

1. **Architecture:**
   - Support running two versions simultaneously
   - Traffic switch mechanism
   - Health monitoring for both versions

2. **Implementation:**
   - Launch files with namespace support
   - Traffic router node (switches /cmd_vel, /goal, etc.)
   - Health check system
   - Automated deployment script

3. **Testing:**
   - Deploy v1 as "blue"
   - Deploy v2 as "green" while blue runs
   - Validate green is healthy
   - Switch traffic from blue to green
   - Verify zero downtime (no message loss)

4. **Rollback:**
   - Implement instant rollback if green fails
   - Automatic rollback on health check failure

**Deliverables:**
- Launch files for blue/green
- Traffic router implementation
- Deployment automation script
- Test report showing zero downtime
- Rollback procedure documentation

---

### Practice Task 3: Optimize Docker Image Size

**Objective:** Reduce Docker image size by at least 50% while maintaining functionality.

**Given:**
```dockerfile
FROM ros:humble-desktop-full
WORKDIR /workspace
COPY . .
RUN colcon build
CMD ["bash"]
```

**Requirements:**

1. **Optimization Techniques:**
   - Use multi-stage build
   - Minimize base image
   - Clean up build artifacts
   - Remove unnecessary dependencies

2. **Maintain Functionality:**
   - All nodes must work identically
   - No runtime errors
   - Same launch files work

3. **Measurement:**
   - Document before/after image sizes
   - List all optimization steps taken
   - Show build time comparison

4. **Bonus:**
   - Implement layer caching for faster rebuilds
   - Create separate dev and prod Dockerfiles

**Deliverables:**
- Optimized Dockerfile
- .dockerignore file
- Size comparison report
- Build time comparison
- Documentation of each optimization

---

## Quick Reference

### Common CMakeLists.txt Patterns

```cmake
# Find dependencies
find_package(ament_cmake REQUIRED)
find_package(rclcpp REQUIRED)

# Build library
add_library(my_lib SHARED src/my_class.cpp)
ament_target_dependencies(my_lib rclcpp)

# Build executable
add_executable(my_node src/my_node.cpp)
target_link_libraries(my_node my_lib)

# Install
install(TARGETS my_lib my_node
  ARCHIVE DESTINATION lib
  LIBRARY DESTINATION lib
  RUNTIME DESTINATION lib/${PROJECT_NAME}
)

install(DIRECTORY launch config
  DESTINATION share/${PROJECT_NAME}/
)

# Export
ament_export_targets(my_libTargets HAS_LIBRARY_TARGET)
ament_export_dependencies(rclcpp)

ament_package()
```

### Docker Commands

```bash
# Build
docker build -t my_robot:latest .

# Run
docker run -it --rm --network host my_robot:latest

# With devices
docker run -it --rm \
  --network host \
  --device=/dev/ttyUSB0 \
  my_robot:latest

# Multi-container
docker-compose up -d
docker-compose logs -f
docker-compose down
```

### systemd Commands

```bash
# Install service
sudo cp my_robot.service /etc/systemd/system/
sudo systemctl daemon-reload

# Manage service
sudo systemctl start my_robot
sudo systemctl stop my_robot
sudo systemctl restart my_robot
sudo systemctl status my_robot

# Enable auto-start
sudo systemctl enable my_robot

# View logs
sudo journalctl -u my_robot -f
```

### rosdep Commands

```bash
# Install dependencies
rosdep install --from-paths src --ignore-src -r -y

# Check dependencies
rosdep check --from-paths src --ignore-src

# Update rosdep database
rosdep update
```

---

This completes Topic 4.3: Deployment & Packaging!