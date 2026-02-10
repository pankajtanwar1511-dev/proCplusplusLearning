# Topic 1.5: Workspace Management

## THEORY_SECTION

### 1. ROS2 Workspace Fundamentals

**What is a Workspace?**

A workspace is a **directory structure** containing:
- Source code (`src/`)
- Build artifacts (`build/`)
- Installed packages (`install/`)
- Build logs (`log/`)

**Standard Workspace Structure:**

```
ros2_workspace/
├── src/                   # Source code (YOUR code)
│   ├── package_1/
│   ├── package_2/
│   └── package_3/
├── build/                 # Build intermediates (CMake cache, object files)
│   ├── package_1/
│   ├── package_2/
│   └── package_3/
├── install/               # Install space (FINAL artifacts)
│   ├── package_1/
│   ├── package_2/
│   ├── package_3/
│   ├── setup.bash         # Source this!
│   └── local_setup.bash
└── log/                   # Build logs
    ├── build_2024-02-10_10-30-15/
    └── latest_build -> build_2024-02-10_10-30-15/
```

**Directory Purposes:**

| Directory | Content | Committed to Git? | Purpose |
|-----------|---------|-------------------|---------|
| `src/` | Source code | **YES** | Your packages |
| `build/` | CMake cache, .o files | NO | Build intermediates |
| `install/` | Executables, libraries | NO | Final build output |
| `log/` | Build logs | NO | Debugging build issues |

**Why Separate Directories?**

1. **Clean builds:** `rm -rf build install` doesn't touch source
2. **Version control:** Only `src/` in git
3. **Multiple builds:** Different build configs (Debug/Release)
4. **Deployment:** Copy `install/` to robot (not `src/`)

---

### 2. Workspace Overlaying

**Concept:**
Workspaces can be **layered** (overlaid) to override or extend packages from lower layers.

**Workspace Hierarchy:**

```
/opt/ros/humble/           # Base layer (ROS2 installation)
    └── setup.bash

~/ros2_ws/                 # Overlay layer 1 (your workspace)
    └── install/setup.bash

~/experimental_ws/         # Overlay layer 2 (experimental features)
    └── install/setup.bash
```

**How Overlaying Works:**

```bash
# Source base ROS2
source /opt/ros/humble/setup.bash

# Overlay your workspace
source ~/ros2_ws/install/setup.bash

# Overlay experimental workspace
source ~/experimental_ws/install/setup.bash
```

**Package Resolution Order:**

When you run `ros2 run package_name node_name`:

1. Search in `~/experimental_ws/install/` (most recent overlay)
2. If not found → search in `~/ros2_ws/install/`
3. If not found → search in `/opt/ros/humble/`
4. If not found → error

**Example:**

```bash
# ROS2 has 'turtlesim' package
/opt/ros/humble/share/turtlesim/

# You create modified 'turtlesim' in your workspace
~/ros2_ws/src/turtlesim/  (your version)

# After building and sourcing:
source ~/ros2_ws/install/setup.bash

ros2 run turtlesim turtlesim_node  # Runs YOUR version (overlay)
```

**Use Cases:**
- **Modify existing packages** without touching system install
- **Test new features** in overlay before merging
- **Separate stable vs experimental** code

---

### 3. Source Order and Environment Setup

**setup.bash vs local_setup.bash:**

| File | Includes Parent | Use Case |
|------|-----------------|----------|
| `setup.bash` | **YES** (chains parent workspaces) | Standard usage |
| `local_setup.bash` | **NO** (only this workspace) | Advanced scenarios |

**Example:**

```bash
# setup.bash (includes parent)
source ~/ros2_ws/install/setup.bash
# This automatically sources /opt/ros/humble/setup.bash

# local_setup.bash (isolated)
source /opt/ros/humble/setup.bash
source ~/ros2_ws/install/local_setup.bash
# Must manually source parent
```

**Environment Variables Set:**

```bash
$ source install/setup.bash

# Key variables:
export AMENT_PREFIX_PATH="/workspace/install:/opt/ros/humble"
export CMAKE_PREFIX_PATH="/workspace/install:/opt/ros/humble"
export LD_LIBRARY_PATH="/workspace/install/lib:/opt/ros/humble/lib"
export PATH="/workspace/install/bin:/opt/ros/humble/bin:$PATH"
export PYTHONPATH="/workspace/install/lib/python3.10/site-packages:..."
export ROS_DISTRO="humble"
export ROS_VERSION="2"
```

**Check Current Workspace:**

```bash
# Which ROS2 distro?
echo $ROS_DISTRO
# humble

# Which workspaces are sourced?
echo $AMENT_PREFIX_PATH
# /home/user/experimental_ws/install:/home/user/ros2_ws/install:/opt/ros/humble

# Which package will run?
ros2 pkg prefix turtlesim
# /home/user/ros2_ws/install/turtlesim  (overlay)
```

---

### 4. Building Workspaces with Colcon

**Basic Build:**

```bash
cd ~/ros2_ws
colcon build
```

**Common Build Options:**

```bash
# Build specific package
colcon build --packages-select my_package

# Build package and dependencies
colcon build --packages-up-to my_package

# Build with symlink install (fast iteration for Python)
colcon build --symlink-install

# Build in Release mode
colcon build --cmake-args -DCMAKE_BUILD_TYPE=Release

# Parallel build (4 jobs)
colcon build --parallel-workers 4

# Continue build on error
colcon build --continue-on-error

# Clean build
rm -rf build install
colcon build

# Verbose output
colcon build --event-handlers console_direct+
```

**Build Only Changed Packages:**

```bash
# Colcon tracks changes automatically
colcon build  # Only rebuilds modified packages
```

**Build from Subdirectory:**

```bash
# Must be in workspace root!
cd ~/ros2_ws
colcon build  # ✓

cd ~/ros2_ws/src
colcon build  # ✗ Error: "No packages found"
```

---

### 5. Workspace Dependencies and Underlay/Overlay

**Underlay:**
- Workspace providing dependencies
- Usually: `/opt/ros/humble` (ROS2 base installation)

**Overlay:**
- Workspace depending on underlay
- Your custom workspace: `~/ros2_ws`

**Dependency Flow:**

```
┌─────────────────────────────┐
│   /opt/ros/humble           │  ← Underlay (ROS2 base)
│   - rclcpp                  │
│   - std_msgs                │
│   - sensor_msgs             │
└──────────────┬──────────────┘
               │ depends on
┌──────────────▼──────────────┐
│   ~/ros2_ws                 │  ← Overlay (your workspace)
│   - my_robot_driver         │
│   - my_controller           │
└──────────────┬──────────────┘
               │ depends on
┌──────────────▼──────────────┐
│   ~/experimental_ws         │  ← Second overlay
│   - experimental_feature    │
└─────────────────────────────┘
```

**Setting Up Overlay:**

```bash
# 1. Source underlay
source /opt/ros/humble/setup.bash

# 2. Create workspace
mkdir -p ~/ros2_ws/src
cd ~/ros2_ws

# 3. Add packages to src/
# (clone repos, create packages, etc.)

# 4. Install dependencies
rosdep install --from-paths src -y --ignore-src

# 5. Build
colcon build

# 6. Source overlay
source install/setup.bash

# Now overlay packages available!
```

**Checking Overlay Status:**

```bash
# Which workspace provides package?
ros2 pkg prefix my_robot_driver
# /home/user/ros2_ws/install/my_robot_driver

# List all packages in workspace
colcon list
# or
ros2 pkg list | grep my_
```

---

### 6. Managing Multiple Workspaces

**Use Case:**
- **Stable workspace:** Tested, working code
- **Development workspace:** Active development
- **Experimental workspace:** Unstable features

**Setup:**

```bash
# Stable workspace
~/stable_ws/
source ~/stable_ws/install/setup.bash

# Development workspace (overlays stable)
~/dev_ws/
source ~/stable_ws/install/setup.bash
cd ~/dev_ws
colcon build
source install/setup.bash

# Experimental workspace (overlays dev)
~/experimental_ws/
source ~/dev_ws/install/setup.bash
cd ~/experimental_ws
colcon build
source install/setup.bash
```

**Switching Workspaces:**

```bash
# Terminal 1: Use stable
source ~/stable_ws/install/setup.bash
ros2 run my_pkg my_node  # Runs stable version

# Terminal 2: Use dev
source ~/dev_ws/install/setup.bash
ros2 run my_pkg my_node  # Runs dev version (overlay)
```

**Best Practice - Use Aliases:**

```bash
# Add to ~/.bashrc
alias ros_stable='source ~/stable_ws/install/setup.bash'
alias ros_dev='source ~/dev_ws/install/setup.bash'
alias ros_exp='source ~/experimental_ws/install/setup.bash'

# Usage:
ros_dev
ros2 run my_pkg my_node
```

---

### 7. Dependency Management with rosdep

**rosdep:**
Tool to install system dependencies for ROS packages.

**Initialize rosdep (once per system):**

```bash
sudo rosdep init
rosdep update
```

**Install Dependencies for Workspace:**

```bash
cd ~/ros2_ws

# Install all dependencies
rosdep install --from-paths src -y --ignore-src

# Breakdown:
# --from-paths src    : Scan packages in src/
# -y                  : Auto-confirm install
# --ignore-src        : Don't try to install packages in src/ (we're building those)
```

**What rosdep Does:**

1. Reads `<depend>` tags in `package.xml`
2. Maps ROS package names to system packages
3. Installs via apt (Ubuntu), yum (Fedora), etc.

**Example:**

```xml
<!-- package.xml -->
<depend>rclcpp</depend>          <!-- ROS package (from workspace) -->
<exec_depend>python3-numpy</exec_depend>  <!-- System package (via apt) -->
```

```bash
$ rosdep install --from-paths src -y --ignore-src

#apt-get install python3-numpy
Reading package lists... Done
Installing: python3-numpy
```

**Check Missing Dependencies:**

```bash
# Simulate install (don't actually install)
rosdep install --from-paths src -y --ignore-src --simulate
```

---

### 8. vcstool: Multi-Repo Workspace Management

**Problem:**
Managing multiple git repositories in `src/` is tedious.

**Solution:**
`vcstool` clones/updates multiple repos from a YAML manifest.

**Install:**

```bash
sudo apt install python3-vcstool
```

**Create Manifest (repos.yaml):**

```yaml
repositories:
  robot_driver:
    type: git
    url: https://github.com/myorg/robot_driver.git
    version: main

  robot_controller:
    type: git
    url: https://github.com/myorg/robot_controller.git
    version: humble

  sensor_fusion:
    type: git
    url: https://github.com/myorg/sensor_fusion.git
    version: v2.1.0
```

**Clone All Repos:**

```bash
cd ~/ros2_ws
vcs import src < repos.yaml
```

**Update All Repos:**

```bash
vcs pull src
```

**Check Status:**

```bash
vcs status src
```

**Export Current Workspace:**

```bash
# Generate repos.yaml from existing workspace
vcs export src > repos.yaml
```

**Use Case:**
- **Onboarding:** New team member clones workspace with one command
- **CI/CD:** Reproducible builds from manifest
- **Version control:** Lock specific versions of dependencies

---

### 9. Workspace Best Practices

**Directory Organization:**

```bash
~/ros2_workspaces/
├── stable_ws/          # Production code
├── dev_ws/             # Active development
├── experiment_ws/      # Research features
└── forks_ws/           # Forked external packages
```

**Single vs Multiple Workspaces:**

| Strategy | Pros | Cons | Use Case |
|----------|------|------|----------|
| **Single workspace** | Simple, all packages together | Slow builds, dependency conflicts | Small projects (<10 packages) |
| **Multiple workspaces** | Modular, fast builds | Complex sourcing | Large projects, team work |

**Workspace Workflow:**

```bash
# 1. Start fresh terminal (clean environment)
source /opt/ros/humble/setup.bash

# 2. Navigate to workspace
cd ~/ros2_ws

# 3. Build
colcon build --symlink-install

# 4. Source
source install/setup.bash

# 5. Work
ros2 run my_pkg my_node
```

**Avoiding Common Mistakes:**

```bash
# ✗ Wrong: Build without sourcing underlay
cd ~/ros2_ws
colcon build  # Missing ROS2 dependencies!

# ✓ Correct: Source underlay first
source /opt/ros/humble/setup.bash
colcon build

# ✗ Wrong: Source install before building
source install/setup.bash  # Doesn't exist yet!
colcon build

# ✓ Correct: Build then source
colcon build
source install/setup.bash

# ✗ Wrong: Source in wrong order
source ~/dev_ws/install/setup.bash
source ~/stable_ws/install/setup.bash  # Overwrites dev!

# ✓ Correct: Source base to overlay
source ~/stable_ws/install/setup.bash
source ~/dev_ws/install/setup.bash  # Overlays stable
```

---

## EDGE_CASES

### Edge Case 1: Package Found in Multiple Overlays

**Scenario:**
Same package name in two workspaces, unexpected version runs.

```bash
# Workspace 1
~/stable_ws/src/my_robot/  (version 1.0)

# Workspace 2
~/dev_ws/src/my_robot/  (version 2.0)

# Source both
source ~/stable_ws/install/setup.bash
source ~/dev_ws/install/setup.bash

# Which version runs?
ros2 run my_robot my_node  # ???
```

**Answer:**
**Most recently sourced overlay wins** (version 2.0 from dev_ws).

**Verification:**

```bash
ros2 pkg prefix my_robot
# /home/user/dev_ws/install/my_robot  ← dev_ws

echo $AMENT_PREFIX_PATH
# /home/user/dev_ws/install:/home/user/stable_ws/install:/opt/ros/humble
# ↑ First in path = highest priority
```

**Solution - Be Explicit:**

```bash
# Unset previous workspace
unset AMENT_PREFIX_PATH

# Source only desired workspace
source ~/stable_ws/install/setup.bash

ros2 run my_robot my_node  # Definitely version 1.0
```

**Interview Insight:**
Workspace sourcing order matters. Last sourced = highest priority.

---

### Edge Case 2: Broken Workspace After Partial Build

**Scenario:**
Build fails midway, `install/` has partial/broken packages.

```bash
colcon build
# ... building package_a: SUCCESS
# ... building package_b: FAILED (compilation error)
# ... building package_c: SKIPPED (depends on package_b)

source install/setup.bash
ros2 run package_c node  # Tries to use broken package_b!
```

**Why:**
- `package_a` installed successfully
- `package_b` partially installed (headers but no library)
- `package_c` not built (dependency failed)

**Solution 1 - Clean Rebuild:**

```bash
rm -rf build install
colcon build  # Start fresh
```

**Solution 2 - Fix and Rebuild Failed Package:**

```bash
# Fix code in package_b
colcon build --packages-select package_b  # Rebuild only package_b

# Now build packages that depend on it
colcon build --packages-up-to package_c
```

**Prevention - Stop on Error:**

```bash
# Don't continue on errors
colcon build  # Default: stops on first error

# Explicitly continue (for CI, to see all errors):
colcon build --continue-on-error
```

**Interview Insight:**
Partial builds can leave workspace in inconsistent state. Clean rebuild is safest.

---

### Edge Case 3: Environment Pollution from Old Sourcing

**Scenario:**
Source workspace A, then switch to workspace B without cleaning.

```bash
# Terminal session 1
source ~/ws_a/install/setup.bash
# Work on workspace A...

# Later, try to switch to workspace B
source ~/ws_b/install/setup.bash

# Environment is MERGED (both workspaces active!)
echo $AMENT_PREFIX_PATH
# /home/user/ws_b/install:/home/user/ws_a/install:/opt/ros/humble
```

**Problem:**
- Packages from both workspaces available
- Unexpected package versions might run
- Confusing debugging

**Solution - Clean Terminal:**

```bash
# Option 1: New terminal
exit
# Open new terminal
source ~/ws_b/install/setup.bash

# Option 2: Unset environment (fragile)
unset AMENT_PREFIX_PATH
unset CMAKE_PREFIX_PATH
# ... (many variables)
source ~/ws_b/install/setup.bash

# Option 3: Use subshell
bash  # Start subshell
source ~/ws_b/install/setup.bash
# Work...
exit  # Return to original environment
```

**Best Practice:**

```bash
# Use dedicated terminal per workspace
# Terminal 1: Workspace A
source ~/ws_a/install/setup.bash

# Terminal 2: Workspace B
source ~/ws_b/install/setup.bash
```

**Interview Insight:**
Sourcing multiple workspaces is cumulative. Clean terminals prevent pollution.

---

### Edge Case 4: Missing Underlay Causes Build Failure

**Scenario:**
Build workspace without sourcing ROS2 base.

```bash
# Fresh terminal (no ROS2 sourced)
cd ~/ros2_ws
colcon build
```

**Error:**

```
--- stderr: my_package
CMake Error at CMakeLists.txt:5 (find_package):
  By not providing "Findament_cmake.cmake" in CMAKE_MODULE_PATH...
  Could not find a package configuration file provided by "ament_cmake"
```

**Why:**
- `ament_cmake` is in `/opt/ros/humble/`
- CMake doesn't know where to find it
- Need `CMAKE_PREFIX_PATH` from sourcing ROS2

**Solution:**

```bash
# Source ROS2 base BEFORE building
source /opt/ros/humble/setup.bash
colcon build  # Now works
```

**Verification:**

```bash
# Check CMAKE_PREFIX_PATH
echo $CMAKE_PREFIX_PATH
# Should include: /opt/ros/humble
```

**Interview Insight:**
Always source underlay before building overlay. Colcon needs underlay's CMake configs.

---

## CODE_EXAMPLES

### Example 1: Complete Workspace Setup Script

```bash
#!/bin/bash
# setup_workspace.sh - Initialize new ROS2 workspace

set -e  # Exit on error

WORKSPACE_NAME=${1:-"ros2_ws"}
WORKSPACE_DIR="$HOME/$WORKSPACE_NAME"

echo "Creating workspace: $WORKSPACE_DIR"

# 1. Create directory structure
mkdir -p "$WORKSPACE_DIR/src"
cd "$WORKSPACE_DIR"

# 2. Source ROS2 base
if [ -f "/opt/ros/humble/setup.bash" ]; then
    source "/opt/ros/humble/setup.bash"
    echo "Sourced ROS2 Humble"
else
    echo "Error: ROS2 Humble not found"
    exit 1
fi

# 3. Clone repositories (if repos.yaml exists)
if [ -f "repos.yaml" ]; then
    echo "Importing repositories from repos.yaml..."
    vcs import src < repos.yaml
fi

# 4. Install dependencies
echo "Installing dependencies with rosdep..."
rosdep update
rosdep install --from-paths src -y --ignore-src

# 5. Build workspace
echo "Building workspace..."
colcon build --symlink-install --cmake-args -DCMAKE_BUILD_TYPE=Release

# 6. Create setup script
cat > "$WORKSPACE_DIR/setup_ws.bash" << 'EOF'
#!/bin/bash
# Auto-generated workspace setup script

# Source ROS2 base
source /opt/ros/humble/setup.bash

# Source this workspace
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
source "$SCRIPT_DIR/install/setup.bash"

echo "Workspace ready!"
echo "ROS_DISTRO: $ROS_DISTRO"
echo "Workspace: $(ros2 pkg list | wc -l) packages"
EOF

chmod +x "$WORKSPACE_DIR/setup_ws.bash"

echo ""
echo "Workspace created successfully!"
echo "To use this workspace:"
echo "  source $WORKSPACE_DIR/setup_ws.bash"
echo ""
echo "Or add to ~/.bashrc:"
echo "  echo 'source $WORKSPACE_DIR/setup_ws.bash' >> ~/.bashrc"
```

**Usage:**

```bash
./setup_workspace.sh my_robot_ws
source ~/my_robot_ws/setup_ws.bash
```

---

### Example 2: Multi-Workspace Manager

**File: `ws_manager.bash`**

```bash
#!/bin/bash
# Workspace manager for switching between multiple ROS2 workspaces

# Define workspaces
declare -A WORKSPACES=(
    ["stable"]="$HOME/stable_ws"
    ["dev"]="$HOME/dev_ws"
    ["exp"]="$HOME/experimental_ws"
)

# Function: Source workspace
ws_source() {
    local ws_name=$1

    if [ -z "$ws_name" ]; then
        echo "Usage: ws_source <workspace_name>"
        echo "Available workspaces:"
        for name in "${!WORKSPACES[@]}"; do
            echo "  - $name (${WORKSPACES[$name]})"
        done
        return 1
    fi

    local ws_path="${WORKSPACES[$ws_name]}"

    if [ -z "$ws_path" ]; then
        echo "Error: Unknown workspace '$ws_name'"
        return 1
    fi

    if [ ! -f "$ws_path/install/setup.bash" ]; then
        echo "Error: Workspace not built: $ws_path"
        echo "Run: cd $ws_path && colcon build"
        return 1
    fi

    # Clean environment (optional - prevents pollution)
    if [ ! -z "$CURRENT_WORKSPACE" ]; then
        echo "Switching from $CURRENT_WORKSPACE to $ws_name"
    fi

    # Source ROS2 base
    source /opt/ros/humble/setup.bash

    # Source workspace
    source "$ws_path/install/setup.bash"

    # Track current workspace
    export CURRENT_WORKSPACE="$ws_name"
    export CURRENT_WORKSPACE_PATH="$ws_path"

    echo "Workspace: $ws_name ($ws_path)"
    echo "Packages: $(ros2 pkg list 2>/dev/null | wc -l)"
}

# Function: Build current workspace
ws_build() {
    if [ -z "$CURRENT_WORKSPACE_PATH" ]; then
        echo "Error: No workspace sourced"
        return 1
    fi

    echo "Building workspace: $CURRENT_WORKSPACE ($CURRENT_WORKSPACE_PATH)"
    cd "$CURRENT_WORKSPACE_PATH"
    colcon build "$@"
    source install/setup.bash
}

# Function: Show current workspace
ws_info() {
    if [ -z "$CURRENT_WORKSPACE" ]; then
        echo "No workspace sourced"
        return
    fi

    echo "Current Workspace: $CURRENT_WORKSPACE"
    echo "Path: $CURRENT_WORKSPACE_PATH"
    echo "ROS_DISTRO: $ROS_DISTRO"
    echo "Packages:"
    colcon list -p "$CURRENT_WORKSPACE_PATH" 2>/dev/null || echo "  (workspace not built)"
}

# Function: List all workspaces
ws_list() {
    echo "Available workspaces:"
    for name in "${!WORKSPACES[@]}"; do
        local path="${WORKSPACES[$name]}"
        local status="not built"
        if [ -f "$path/install/setup.bash" ]; then
            status="ready"
        fi
        echo "  [$status] $name: $path"
    done

    if [ ! -z "$CURRENT_WORKSPACE" ]; then
        echo ""
        echo "Current: $CURRENT_WORKSPACE"
    fi
}

# Aliases for convenience
alias wss='ws_source'
alias wsb='ws_build'
alias wsi='ws_info'
alias wsl='ws_list'

echo "Workspace manager loaded!"
echo "Commands: ws_source, ws_build, ws_info, ws_list"
```

**Add to ~/.bashrc:**

```bash
source ~/ws_manager.bash
```

**Usage:**

```bash
# List workspaces
wsl
# Available workspaces:
#   [ready] stable: /home/user/stable_ws
#   [ready] dev: /home/user/dev_ws
#   [not built] exp: /home/user/experimental_ws

# Switch to dev workspace
wss dev
# Workspace: dev (/home/user/dev_ws)
# Packages: 42

# Build current workspace
wsb --packages-select my_pkg

# Show info
wsi
# Current Workspace: dev
# Path: /home/user/dev_ws
```

---

## INTERVIEW_QA

### Q1: What's the difference between sourcing `setup.bash` and `local_setup.bash`?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

| File | Includes Parent Workspaces | Use Case |
|------|---------------------------|----------|
| `setup.bash` | **YES** (chains underlays) | Standard usage |
| `local_setup.bash` | **NO** (only this workspace) | Advanced control |

**Behavior:**

```bash
# setup.bash
source ~/ros2_ws/install/setup.bash
# Internally runs:
#   source /opt/ros/humble/setup.bash  (parent)
#   source ~/ros2_ws/install/local_setup.bash  (this workspace)

# local_setup.bash
source ~/ros2_ws/install/local_setup.bash
# Only sets up THIS workspace (no parent)
# Must manually source parent first:
source /opt/ros/humble/setup.bash
source ~/ros2_ws/install/local_setup.bash
```

**When to Use `local_setup.bash`:**

1. **Custom underlay:** Want different parent than default
   ```bash
   source ~/custom_base_ws/install/setup.bash
   source ~/overlay_ws/install/local_setup.bash  # Overlays custom base
   ```

2. **Prevent double-sourcing:**
   ```bash
   # Already sourced ROS2
   source /opt/ros/humble/setup.bash

   # Don't want to source it again
   source ~/ws/install/local_setup.bash  # Skip redundant parent sourcing
   ```

**Interview Insight:**
99% of time use `setup.bash`. Use `local_setup.bash` only for advanced workspace chaining.

---

### Q2: How do you check which workspace a package comes from?

**Difficulty:** ⭐⭐ (Easy)

**Answer:**

**Method 1: `ros2 pkg prefix`**

```bash
ros2 pkg prefix turtlesim
# /opt/ros/humble/share/turtlesim  (from ROS2 base)

ros2 pkg prefix my_robot_driver
# /home/user/ros2_ws/install/my_robot_driver  (from overlay)
```

**Method 2: `echo $AMENT_PREFIX_PATH`**

```bash
echo $AMENT_PREFIX_PATH
# /home/user/dev_ws/install:/home/user/stable_ws/install:/opt/ros/humble
# ↑ Priority order (first = highest)
```

**Method 3: `ros2 pkg list`**

```bash
ros2 pkg list | grep my_robot
# my_robot_driver
# my_robot_controller

ros2 pkg prefix my_robot_driver
# Shows exact location
```

**Method 4: `which` (for executables)**

```bash
which turtlesim_node
# /opt/ros/humble/lib/turtlesim/turtlesim_node
```

**Interview Insight:**
`ros2 pkg prefix` is most direct. Shows exact install location of package.

---

### Q3: What happens if you build a workspace without sourcing the underlay?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

**Build will fail** with "package not found" errors.

**Example:**

```bash
# Fresh terminal (no ROS2 sourced)
cd ~/ros2_ws
colcon build
```

**Error:**

```
CMake Error: Could not find a package configuration file provided by "ament_cmake"
CMake Error: Could not find a package configuration file provided by "rclcpp"
```

**Why:**

Colcon/CMake uses `CMAKE_PREFIX_PATH` to find packages:

```bash
# Without sourcing:
echo $CMAKE_PREFIX_PATH
# (empty or system paths only)

# With sourcing:
source /opt/ros/humble/setup.bash
echo $CMAKE_PREFIX_PATH
# /opt/ros/humble  ← Now CMake can find ROS2 packages
```

**Solution:**

```bash
# Always source underlay before building
source /opt/ros/humble/setup.bash
colcon build
```

**Interview Insight:**
Workspace overlay requires underlay's CMake config files. Must source underlay before building.

---

### Q4: How do overlays work when multiple workspaces have the same package?

**Difficulty:** ⭐⭐⭐⭐ (Hard)

**Answer:**

**Resolution Rule: First in `$AMENT_PREFIX_PATH` wins.**

**Example:**

```bash
# Workspace hierarchy
/opt/ros/humble/share/turtlesim/           (version 1.0 - ROS2 base)
~/stable_ws/install/turtlesim/             (version 2.0 - your version)
~/dev_ws/install/turtlesim/                (version 3.0 - dev version)

# Source order
source /opt/ros/humble/setup.bash
source ~/stable_ws/install/setup.bash
source ~/dev_ws/install/setup.bash

# Check path
echo $AMENT_PREFIX_PATH
# ~/dev_ws/install:~/stable_ws/install:/opt/ros/humble
# ↑ dev_ws first = highest priority

# Which version runs?
ros2 run turtlesim turtlesim_node
# Version 3.0 from ~/dev_ws  (first match)
```

**Package Shadowing:**

- `~/dev_ws/turtlesim` **shadows** `~/stable_ws/turtlesim`
- `~/stable_ws/turtlesim` **shadows** `/opt/ros/humble/turtlesim`

**Verification:**

```bash
ros2 pkg prefix turtlesim
# ~/dev_ws/install/turtlesim  ← Highest priority

# Force use lower priority version (hack):
export AMENT_PREFIX_PATH="/opt/ros/humble"
ros2 run turtlesim turtlesim_node  # Now uses version 1.0
```

**Interview Insight:**
Last sourced workspace has highest priority. Package lookup is first-match in prefix path.

---

### Q5: What's the purpose of the `build/` directory and can you delete it?

**Difficulty:** ⭐⭐ (Easy)

**Answer:**

**Purpose:**

The `build/` directory contains **build intermediates**:
- CMake cache (`CMakeCache.txt`)
- Makefiles
- Object files (`.o`)
- Build state

**Can You Delete It?**

**YES** - but triggers full rebuild.

```bash
rm -rf build/
colcon build  # Rebuilds everything from scratch
```

**When to Delete:**

1. **Clean build needed:**
   - CMake cache corrupted
   - Changed build type (Debug → Release)
   - Dependency changes not detected

2. **Free disk space:**
   - `build/` can be large (GBs for big projects)
   - Safe to delete (can rebuild anytime)

3. **Resolve build errors:**
   - Stale state causing issues
   - Unexplained build failures

**What Happens:**

```bash
# With build/ present
colcon build
# Incremental build (only changed files)
# Fast: 5-10 seconds

# Without build/
rm -rf build/
colcon build
# Full rebuild (all files)
# Slow: 2-5 minutes
```

**Interview Insight:**
`build/` is regenerated from `src/`. Safe to delete, but costs rebuild time.

---

### Q6: Explain the purpose of `rosdep` and how it relates to workspaces.

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

**rosdep** installs **system dependencies** required by packages in workspace.

**Workflow:**

```bash
cd ~/ros2_ws

# Install dependencies for all packages in src/
rosdep install --from-paths src -y --ignore-src
```

**What It Does:**

1. **Scans `package.xml` files** in `src/` for `<depend>` tags
2. **Resolves** ROS package names to system packages
3. **Installs** via system package manager (apt, yum, etc.)

**Example:**

```xml
<!-- my_package/package.xml -->
<depend>rclcpp</depend>                    <!-- ROS package -->
<exec_depend>python3-numpy</exec_depend>   <!-- System package -->
<depend>opencv2</depend>                   <!-- Maps to libopencv-dev -->
```

```bash
$ rosdep install --from-paths src -y --ignore-src

executing command [sudo apt-get install -y python3-numpy]
executing command [sudo apt-get install -y libopencv-dev]
# rclcpp is a ROS package (not installed via apt)
```

**Key Flags:**

- `--from-paths src`: Scan all packages in src/
- `-y`: Auto-confirm installs
- `--ignore-src`: Don't try to install packages we're building

**Relation to Workspaces:**

- Run **before first build** of new workspace
- Run **after adding new packages** to ensure dependencies present
- Ensures workspace has all required system libraries

**Interview Insight:**
rosdep bridges ROS package dependencies to system packages. Essential for reproducible builds.

---

## PRACTICE_TASKS

### Task 1: Multi-Workspace Setup

Create three workspaces:
1. **base_ws**: Forked versions of 3 ROS2 packages (modified)
2. **app_ws**: Your application (depends on base_ws)
3. **tools_ws**: Development tools (independent)

**Requirements:**
- Correct overlay structure
- Script to source each workspace
- Verify package resolution order

---

### Task 2: Workspace Migration Script

Write script to:
1. Clone workspace from repos.yaml
2. Install dependencies with rosdep
3. Build in Release mode
4. Create sourcing alias

**Requirements:**
- Handle errors gracefully
- Check for existing workspace
- Verify ROS2 installation

---

### Task 3: Debug Broken Workspace

Given workspace with:
- Missing underlay sourcing
- Circular dependencies
- Wrong install rules
- Partial build artifacts

**Task:** Diagnose and fix all issues.

---

## QUICK_REFERENCE

### Workspace Structure

```
ros2_workspace/
├── src/        # Source code (version controlled)
├── build/      # Build intermediates (can delete)
├── install/    # Final artifacts (can delete)
└── log/        # Build logs (can delete)
```

### Essential Commands

```bash
# Build
colcon build
colcon build --packages-select pkg
colcon build --packages-up-to pkg
colcon build --symlink-install

# Source
source install/setup.bash
source install/local_setup.bash

# Dependencies
rosdep install --from-paths src -y --ignore-src

# Info
ros2 pkg prefix <package>
ros2 pkg list
colcon list
```

### Source Order

```bash
# Correct (base → overlay)
source /opt/ros/humble/setup.bash
source ~/ros2_ws/install/setup.bash

# Wrong (overlay → base)
source ~/ros2_ws/install/setup.bash
source /opt/ros/humble/setup.bash  # Overwrites!
```

### Clean Workspace

```bash
# Full clean
rm -rf build install log
colcon build

# Package-specific clean
rm -rf build/pkg install/pkg
colcon build --packages-select pkg
```

---

**END OF TOPIC 1.5**

**CHAPTER 1 COMPLETE!**
