## TOPIC: Security & DDS Security


---

## THEORY_SECTION
### 1. ROS2 Security Overview

ROS2 implements security through **DDS Security**, which provides authentication, encryption, and access control at the DDS layer.

**Security Features:**

```
┌─────────────────────────────────────────────────┐
│           ROS2 Security (SROS2)                 │
├─────────────────────────────────────────────────┤
│  • Authentication (Who are you?)                │
│  • Encryption (Data confidentiality)            │
│  • Access Control (What can you do?)            │
│  • Integrity (Data not tampered with)           │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│         DDS Security Specification              │
├─────────────────────────────────────────────────┤
│  • Authentication Plugin                        │
│  • Access Control Plugin                        │
│  • Cryptographic Plugin                         │
└─────────────────────────────────────────────────┘
```

**Key Concepts:**

- **Identity:** Each node has a unique identity (certificate)
- **Authentication:** Nodes verify each other's identities
- **Authorization:** Permissions define what each node can access
- **Encryption:** All communication encrypted (AES-256)
- **Signing:** Messages signed to prevent tampering

---

### 2. PKI (Public Key Infrastructure)

ROS2 security uses X.509 certificates for authentication.

**Certificate Hierarchy:**

```
Root CA (Certificate Authority)
  ├── Node Certificate 1 (my_robot_node)
  ├── Node Certificate 2 (camera_node)
  └── Node Certificate 3 (controller_node)
```

**Certificate Components:**

1. **Identity Certificate:** Node's identity
2. **CA Certificate:** Trusted Certificate Authority
3. **Private Key:** Node's secret key
4. **Permissions:** Access control rules (XML)

**Certificate Files:**

```
/etc/ros2_security_credentials/
└── enclaves/
    └── my_robot/
        ├── identity_ca.cert.pem          # CA certificate
        ├── cert.pem                      # Node certificate
        ├── key.pem                       # Private key
        ├── governance.p7s                # Governance rules (signed)
        └── permissions.p7s               # Permissions (signed)
```

---

### 3. Enabling Security in ROS2

#### Step 1: Install Security Tools

```bash
# Install ros2 security tools
sudo apt install ros-humble-ros2-security

# Or from source
git clone https://github.com/ros2/sros2.git
cd sros2
colcon build
```

#### Step 2: Create Security Directory

```bash
# Create keystore
ros2 security create_keystore ~/ros2_security_demo

# Result:
# ~/ros2_security_demo/
#   ├── enclaves/
#   ├── public/
#   └── private/
```

#### Step 3: Create Node Keys

```bash
# Generate keys for specific node
ros2 security create_enclave ~/ros2_security_demo /my_robot/my_node

# Result:
# ~/ros2_security_demo/enclaves/my_robot/my_node/
#   ├── identity_ca.cert.pem
#   ├── cert.pem
#   ├── key.pem
#   ├── governance.p7s
#   └── permissions.p7s
```

#### Step 4: Generate Permissions

```bash
# Create permissions file
ros2 security create_permission ~/ros2_security_demo /my_robot/my_node policy.xml

# Or let it auto-generate
ros2 security create_enclave ~/ros2_security_demo /my_robot/my_node
```

#### Step 5: Run with Security Enabled

```bash
# Set environment variable
export ROS_SECURITY_KEYSTORE=~/ros2_security_demo
export ROS_SECURITY_ENABLE=true
export ROS_SECURITY_STRATEGY=Enforce

# Run node
ros2 run my_package my_node --ros-args --enclave /my_robot/my_node
```

---

### 4. Permissions and Access Control

Permissions define what each node can publish, subscribe to, and call.

#### Permissions File Format (XML)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<dds xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     xsi:noNamespaceSchemaLocation="http://www.omg.org/spec/DDS-SECURITY/20170901/omg_shared_ca_permissions.xsd">
  <permissions>
    <grant name="my_robot_permissions">
      <!-- Subject name (from certificate) -->
      <subject_name>CN=/my_robot/my_node</subject_name>

      <validity>
        <!-- Not before -->
        <not_before>2024-01-01T00:00:00</not_before>
        <!-- Not after -->
        <not_after>2034-01-01T00:00:00</not_after>
      </validity>

      <!-- Rules -->
      <allow_rule>
        <domains>
          <id>0</id>  <!-- ROS_DOMAIN_ID -->
        </domains>

        <!-- Publish permissions -->
        <publish>
          <topics>
            <topic>rt/cmd_vel</topic>  <!-- DDS topic name -->
            <topic>rt/robot_status</topic>
          </topics>
        </publish>

        <!-- Subscribe permissions -->
        <subscribe>
          <topics>
            <topic>rt/scan</topic>
            <topic>rt/odom</topic>
          </topics>
        </subscribe>
      </allow_rule>

      <!-- Deny rule (takes precedence) -->
      <deny_rule>
        <domains>
          <id>0</id>
        </domains>
        <publish>
          <topics>
            <topic>rt/admin/*</topic>  <!-- Wildcard: deny all admin topics -->
          </topics>
        </publish>
      </deny_rule>
    </grant>
  </permissions>
</dds>
```

**Topic Name Mapping:**

ROS2 topic `/cmd_vel` → DDS topic `rt/cmd_vel`

**Wildcards:**

- `*` matches any sequence
- `rt/robot/*` matches `rt/robot/cmd_vel`, `rt/robot/status`, etc.

---

### 5. Governance Document

The governance document defines global security policies.

```xml
<?xml version="1.0" encoding="utf-8"?>
<dds xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     xsi:noNamespaceSchemaLocation="http://www.omg.org/spec/DDS-SECURITY/20170901/omg_shared_ca_governance.xsd">
  <domain_access_rules>
    <domain_rule>
      <domains>
        <id>0</id>  <!-- Apply to ROS_DOMAIN_ID 0 -->
      </domains>

      <!-- Allow unauthenticated participants? -->
      <allow_unauthenticated_participants>false</allow_unauthenticated_participants>

      <!-- Enable authentication -->
      <enable_join_access_control>true</enable_join_access_control>

      <!-- Discovery protection -->
      <discovery_protection_kind>ENCRYPT</discovery_protection_kind>
      <!-- Options: NONE, SIGN, ENCRYPT -->

      <!-- Liveliness protection -->
      <liveliness_protection_kind>ENCRYPT</liveliness_protection_kind>

      <!-- RTPS (data) protection -->
      <rtps_protection_kind>SIGN</rtps_protection_kind>
      <!-- Options: NONE, SIGN, ENCRYPT -->

      <!-- Topic access control -->
      <topic_access_rules>
        <topic_rule>
          <topic_expression>rt/cmd_vel</topic_expression>

          <!-- Enable topic-level access control -->
          <enable_discovery_protection>true</enable_discovery_protection>
          <enable_liveliness_protection>false</enable_liveliness_protection>

          <!-- Encrypt data on this topic -->
          <enable_read_access_control>true</enable_read_access_control>
          <enable_write_access_control>true</enable_write_access_control>

          <!-- Metadata protection -->
          <metadata_protection_kind>ENCRYPT</metadata_protection_kind>

          <!-- Data protection -->
          <data_protection_kind>ENCRYPT</data_protection_kind>
          <!-- Options: NONE, SIGN, ENCRYPT -->
        </topic_rule>
      </topic_access_rules>
    </domain_rule>
  </domain_access_rules>
</dds>
```

**Protection Levels:**

| Level | Description | Performance Impact |
|-------|-------------|-------------------|
| NONE | No protection | None |
| SIGN | Digital signature | Low |
| ENCRYPT | AES-256 encryption | Medium |

---

### 6. Security Strategies

ROS2 supports different security enforcement strategies:

```bash
# Enforce: All nodes must have valid credentials
export ROS_SECURITY_STRATEGY=Enforce

# Permissive: Nodes without credentials are allowed
export ROS_SECURITY_STRATEGY=Permissive
```

**Enforce Mode:**
- All nodes must have certificates
- Unauthenticated nodes rejected
- Production deployment

**Permissive Mode:**
- Nodes without certificates allowed
- Mixed secure/insecure nodes
- Development and testing

---

### 7. Automated Security Setup

#### Script to Generate Keys for All Nodes

```bash
#!/bin/bash
# generate_keys.sh

KEYSTORE_PATH=~/ros2_security
DOMAIN_ID=0

# List of nodes in your system
NODES=(
  "/my_robot/controller"
  "/my_robot/camera"
  "/my_robot/lidar"
  "/my_robot/navigation"
)

# Create keystore if doesn't exist
if [ ! -d "$KEYSTORE_PATH" ]; then
  echo "Creating keystore at $KEYSTORE_PATH"
  ros2 security create_keystore "$KEYSTORE_PATH"
fi

# Generate keys for each node
for node in "${NODES[@]}"; do
  echo "Generating keys for $node"

  # Create enclave with auto-generated permissions
  ros2 security create_enclave "$KEYSTORE_PATH" "$node"

  # Or with custom permissions
  # ros2 security create_permission "$KEYSTORE_PATH" "$node" "policies/${node}.xml"
done

echo "Security setup complete!"
echo "Export these environment variables:"
echo "  export ROS_SECURITY_KEYSTORE=$KEYSTORE_PATH"
echo "  export ROS_SECURITY_ENABLE=true"
echo "  export ROS_SECURITY_STRATEGY=Enforce"
```

#### Launch File with Security

```python
# secure_robot.launch.py
import os
from launch import LaunchDescription
from launch_ros.actions import Node
from ament_index_python.packages import get_package_share_directory

def generate_launch_description():
    # Security keystore path
    keystore_path = os.path.expanduser('~/ros2_security')

    # Check if keystore exists
    if not os.path.exists(keystore_path):
        raise Exception(f"Security keystore not found at {keystore_path}")

    # Set environment for all nodes
    env = {
        'ROS_SECURITY_KEYSTORE': keystore_path,
        'ROS_SECURITY_ENABLE': 'true',
        'ROS_SECURITY_STRATEGY': 'Enforce'
    }

    controller_node = Node(
        package='my_robot',
        executable='controller',
        name='controller',
        namespace='my_robot',
        additional_env=env,
        arguments=['--ros-args', '--enclave', '/my_robot/controller']
    )

    camera_node = Node(
        package='my_robot',
        executable='camera',
        name='camera',
        namespace='my_robot',
        additional_env=env,
        arguments=['--ros-args', '--enclave', '/my_robot/camera']
    )

    return LaunchDescription([
        controller_node,
        camera_node
    ])
```

---

### 8. Network Security Best Practices

#### 1. Firewall Configuration

```bash
# Allow only ROS2 DDS ports
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Fast DDS default ports (UDP)
sudo ufw allow 7400:7500/udp

# Cyclone DDS default ports (UDP)
sudo ufw allow 7400:7500/udp

# Or restrict to specific network
sudo ufw allow from 192.168.1.0/24 to any port 7400:7500 proto udp

# Enable firewall
sudo ufw enable
```

#### 2. Network Isolation

```bash
# Use VPN for multi-machine ROS2
# OpenVPN configuration example

# Or use SSH tunneling
ssh -L 7400:localhost:7400 robot@192.168.1.100
```

#### 3. Disable Multicast Discovery (Use Discovery Server)

```bash
# Start discovery server
ros2 run ros2_discovery_server discovery_server

# Configure clients to use server
export ROS_DISCOVERY_SERVER=192.168.1.100:11811

# All nodes now communicate via server (no multicast)
ros2 run my_package my_node
```

**Benefits:**
- No multicast traffic (more secure)
- Better firewall control
- Works across network boundaries

---

### 9. Secure Communication Patterns

#### TLS for ROS2 Services (Using DDS Security)

DDS Security automatically encrypts all communication when enabled.

```cpp
// Node code unchanged - encryption handled by DDS layer
class SecureServiceServer : public rclcpp::Node {
public:
    SecureServiceServer() : Node("secure_server") {
        service_ = create_service<std_srvs::srv::Trigger>(
            "secure_service",
            [this](const std_srvs::srv::Trigger::Request::SharedPtr,
                   std_srvs::srv::Trigger::Response::SharedPtr response) {
                response->success = true;
                response->message = "Secure response";
                // Communication automatically encrypted!
            }
        );
    }
};
```

#### Authentication Tokens in Messages

For application-level authentication:

```cpp
// custom_msgs/msg/AuthenticatedCommand.msg
std_msgs/Header header
string auth_token
string command
float64 value

// Node with token validation
class SecureController : public rclcpp::Node {
public:
    SecureController() : Node("secure_controller") {
        sub_ = create_subscription<custom_msgs::msg::AuthenticatedCommand>(
            "authenticated_cmd", 10,
            [this](const custom_msgs::msg::AuthenticatedCommand::SharedPtr msg) {
                if (validate_token(msg->auth_token)) {
                    execute_command(msg->command, msg->value);
                } else {
                    RCLCPP_ERROR(get_logger(), "Invalid authentication token");
                }
            }
        );
    }

private:
    bool validate_token(const std::string &token) {
        // Validate JWT token or similar
        return verify_jwt(token, secret_key_);
    }

    std::string secret_key_;
};
```

---

### 10. Security Checklist for Production

**Before Deployment:**

- [ ] Enable DDS Security (ROS_SECURITY_ENABLE=true)
- [ ] Use Enforce strategy (ROS_SECURITY_STRATEGY=Enforce)
- [ ] Generate unique certificates for each node
- [ ] Define minimal permissions (principle of least privilege)
- [ ] Encrypt sensitive topics (cmd_vel, camera, etc.)
- [ ] Configure firewall rules
- [ ] Disable unused services/topics
- [ ] Use strong passwords for all accounts
- [ ] Keep certificates in secure location (not in git!)
- [ ] Set certificate expiration dates
- [ ] Implement certificate rotation plan
- [ ] Monitor for security events
- [ ] Regular security audits
- [ ] Keep ROS2 and dependencies updated

**Network Security:**

- [ ] Isolate robot network (separate VLAN)
- [ ] Use VPN for remote access
- [ ] Disable multicast if not needed
- [ ] Use discovery server for controlled discovery
- [ ] Monitor network traffic for anomalies
- [ ] Implement rate limiting on inputs

**Application Security:**

- [ ] Validate all inputs
- [ ] Sanitize user commands
- [ ] Implement authentication for critical operations
- [ ] Log security-relevant events
- [ ] Use read-only file systems where possible
- [ ] Run nodes as non-root user
- [ ] Use Docker/containers for isolation

---

## EDGE_CASES
### Edge Case 1: Certificate Expiration in Production

**Scenario:**
Robot deployed in production. Certificates expire after 1 year. Robot stops working when certificates expire.

**Example:**

```bash
# Certificate created on 2024-01-01, valid for 1 year
ros2 security create_enclave ~/keystore /my_robot/controller

# On 2025-01-02, certificate expires
ros2 run my_package controller --ros-args --enclave /my_robot/controller

# Error:
# [ERROR] [security]: Certificate expired
# [ERROR] [rmw_fastrtps_cpp]: Failed to create participant
# Node crashes!
```

**Problem:**
- Certificates have expiration dates (validity period)
- No automatic renewal in ROS2
- Robot becomes non-functional

**Check Certificate Expiration:**

```bash
# View certificate details
openssl x509 -in ~/keystore/enclaves/my_robot/controller/cert.pem -text -noout

# Output:
# Validity
#     Not Before: Jan  1 00:00:00 2024 GMT
#     Not After : Jan  1 00:00:00 2025 GMT
```

**Solution 1: Long-Lived Certificates**

```bash
# Create certificate valid for 10 years
ros2 security create_keystore ~/keystore --validity 3650

# Or modify existing CA
# (Requires regenerating all certificates)
```

**Solution 2: Certificate Monitoring**

```bash
#!/bin/bash
# monitor_certs.sh

KEYSTORE_PATH=~/keystore
WARNING_DAYS=30

find "$KEYSTORE_PATH" -name "cert.pem" | while read cert; do
    expiry=$(openssl x509 -in "$cert" -noout -enddate | cut -d= -f2)
    expiry_epoch=$(date -d "$expiry" +%s)
    now_epoch=$(date +%s)
    days_left=$(( ($expiry_epoch - $now_epoch) / 86400 ))

    if [ $days_left -lt 0 ]; then
        echo "CRITICAL: Certificate expired: $cert"
    elif [ $days_left -lt $WARNING_DAYS ]; then
        echo "WARNING: Certificate expires in $days_left days: $cert"
    fi
done
```

**Solution 3: Automated Certificate Rotation**

```bash
#!/bin/bash
# rotate_certs.sh

KEYSTORE_PATH=~/keystore
NODE_ENCLAVE=/my_robot/controller
BACKUP_DIR=~/keystore_backup

# Backup old certificates
echo "Backing up old certificates..."
cp -r "$KEYSTORE_PATH" "$BACKUP_DIR/$(date +%Y%m%d)"

# Generate new certificates
echo "Generating new certificates..."
ros2 security create_enclave "$KEYSTORE_PATH" "$NODE_ENCLAVE" --force

# Restart nodes (via systemd)
echo "Restarting nodes..."
sudo systemctl restart robot.service

echo "Certificate rotation complete"
```

**Solution 4: Use systemd Timer for Automatic Rotation**

```ini
# /etc/systemd/system/cert-rotation.service
[Unit]
Description=ROS2 Certificate Rotation
After=network.target

[Service]
Type=oneshot
User=robot
ExecStart=/opt/robot/scripts/rotate_certs.sh

# /etc/systemd/system/cert-rotation.timer
[Unit]
Description=ROS2 Certificate Rotation Timer

[Timer]
OnCalendar=monthly
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
# Enable timer
sudo systemctl enable cert-rotation.timer
sudo systemctl start cert-rotation.timer

# Check status
sudo systemctl list-timers cert-rotation.timer
```

**Best Practices:**
1. **Set expiration to 5-10 years for production**
2. **Monitor certificate expiration (30 days warning)**
3. **Automate rotation before expiration**
4. **Test rotation in staging environment**
5. **Document rotation procedure**
6. **Alert on expiration warnings**

---

### Edge Case 2: Permission Denied After Updating Node Code

**Scenario:**
Developer adds new topic to node. Node has certificate but permissions don't include new topic. Node can't publish to new topic.

**Example:**

```cpp
// Original node
class MyNode : public rclcpp::Node {
public:
    MyNode() : Node("my_node") {
        cmd_pub_ = create_publisher<Twist>("cmd_vel", 10);  // Allowed
    }
};

// Updated node - added diagnostics
class MyNode : public rclcpp::Node {
public:
    MyNode() : Node("my_node") {
        cmd_pub_ = create_publisher<Twist>("cmd_vel", 10);  // Allowed
        diag_pub_ = create_publisher<String>("diagnostics", 10);  // NEW!
    }
};
```

**Permissions file (outdated):**

```xml
<publish>
  <topics>
    <topic>rt/cmd_vel</topic>
    <!-- Missing: rt/diagnostics -->
  </topics>
</publish>
```

**Runtime error:**

```bash
ros2 run my_package my_node --ros-args --enclave /my_robot/my_node

# Node starts but can't publish to diagnostics
[WARN] [security]: Denied: publish on topic 'rt/diagnostics'
[ERROR] [my_node]: Failed to create publisher for /diagnostics
```

**Problem:**
- Permissions are static (defined in XML)
- Code changes require permission updates
- Easy to forget when adding features

**Solution 1: Update Permissions Manually**

```xml
<!-- Updated permissions.xml -->
<publish>
  <topics>
    <topic>rt/cmd_vel</topic>
    <topic>rt/diagnostics</topic>  <!-- Added -->
  </topics>
</publish>
```

```bash
# Regenerate permissions
ros2 security create_permission ~/keystore /my_robot/my_node updated_permissions.xml

# Restart node
ros2 run my_package my_node --ros-args --enclave /my_robot/my_node
```

**Solution 2: Use Wildcards in Permissions**

```xml
<publish>
  <topics>
    <topic>rt/*</topic>  <!-- Allow all topics -->
  </topics>
</publish>
```

**Pros:** No updates needed when adding topics
**Cons:** Less secure (too permissive)

**Better: Namespace wildcards**

```xml
<publish>
  <topics>
    <topic>rt/my_robot/*</topic>  <!-- Allow all topics under my_robot namespace -->
  </topics>
</publish>
```

**Solution 3: Automated Permission Generation**

```bash
#!/bin/bash
# generate_permissions.sh

NODE_NAME=/my_robot/my_node
KEYSTORE=~/keystore

# Run node in discovery mode to see what topics it uses
timeout 10 ros2 run my_package my_node --ros-args --enclave $NODE_NAME \
    -p use_sim_time:=true 2>&1 | tee node_output.log

# Parse node output to find topics
TOPICS=$(ros2 topic list | grep "my_robot")

# Generate permissions XML
cat > /tmp/permissions.xml <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<dds>
  <permissions>
    <grant name="auto_generated">
      <subject_name>CN=$NODE_NAME</subject_name>
      <validity>
        <not_before>2024-01-01T00:00:00</not_before>
        <not_after>2034-01-01T00:00:00</not_after>
      </validity>
      <allow_rule>
        <domains><id>0</id></domains>
        <publish>
          <topics>
EOF

# Add each topic
for topic in $TOPICS; do
    echo "            <topic>rt${topic}</topic>" >> /tmp/permissions.xml
done

cat >> /tmp/permissions.xml <<EOF
          </topics>
        </publish>
      </allow_rule>
    </grant>
  </permissions>
</dds>
EOF

# Update permissions
ros2 security create_permission $KEYSTORE $NODE_NAME /tmp/permissions.xml

echo "Permissions updated for $NODE_NAME"
```

**Solution 4: CI/CD Validation**

```yaml
# .github/workflows/security-check.yml
name: Security Permissions Check

on: [push, pull_request]

jobs:
  check-permissions:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Setup ROS2
        run: |
          sudo apt update
          sudo apt install ros-humble-desktop

      - name: Build packages
        run: |
          source /opt/ros/humble/setup.bash
          colcon build

      - name: Check node permissions
        run: |
          source install/setup.bash
          # Run tool to verify all topics have permissions
          python3 scripts/verify_permissions.py
```

**Best Practices:**
1. **Document required permissions** in README
2. **Version control permissions files** (in git)
3. **Test permissions in staging** before production
4. **Use namespaces** to group related topics
5. **Automate permission generation** where possible
6. **Add CI checks** for permission completeness

---

### Edge Case 3: Mixed Secure and Insecure Nodes

**Scenario:**
Some nodes have security enabled, others don't. Nodes can't communicate due to security mismatch.

**Example:**

```bash
# Terminal 1: Secure node
export ROS_SECURITY_KEYSTORE=~/keystore
export ROS_SECURITY_ENABLE=true
export ROS_SECURITY_STRATEGY=Enforce
ros2 run my_package secure_node --ros-args --enclave /secure_node

# Terminal 2: Insecure node (no security vars set)
ros2 run my_package insecure_node

# Result: Nodes can't discover each other!
```

**Problem:**
- Secure nodes reject unauthenticated participants
- Insecure nodes can't authenticate
- No communication possible

**Discovery behavior:**

```
Secure Node (Enforce mode)
  ↓ Sends authenticated discovery message
Insecure Node
  ↓ Responds without authentication
Secure Node
  ✗ Rejects insecure node
```

**Solution 1: Use Permissive Mode (Development Only)**

```bash
# Secure node with Permissive mode
export ROS_SECURITY_STRATEGY=Permissive

# Now secure and insecure nodes can communicate
# But data is NOT encrypted!
```

**Permissive mode behavior:**
- Secure nodes prefer encrypted communication
- Falls back to unencrypted if peer doesn't support security
- **WARNING:** Not secure! Use only for development/migration

**Solution 2: Enable Security on All Nodes**

```bash
# Generate keys for all nodes
ros2 security create_enclave ~/keystore /secure_node
ros2 security create_enclave ~/keystore /insecure_node

# Set environment for all nodes
export ROS_SECURITY_KEYSTORE=~/keystore
export ROS_SECURITY_ENABLE=true
export ROS_SECURITY_STRATEGY=Enforce

# Now all nodes authenticate
```

**Solution 3: Gradual Migration Plan**

```yaml
# Phase 1: Setup infrastructure (Week 1)
- Create keystore
- Generate certificates for all nodes
- Test in staging

# Phase 2: Enable Permissive mode (Week 2)
- Set ROS_SECURITY_STRATEGY=Permissive
- Deploy to production
- Monitor for issues

# Phase 3: Switch to Enforce (Week 3)
- Set ROS_SECURITY_STRATEGY=Enforce
- Verify all nodes have certificates
- Monitor for rejected participants

# Phase 4: Lock down (Week 4)
- Remove Permissive fallback
- Enable encryption on all topics
- Final security audit
```

**Solution 4: Network Segmentation**

```
Secure Network (VLAN 10)
  ├── Secure Node 1 (with DDS Security)
  ├── Secure Node 2 (with DDS Security)
  └── Gateway Node (bridges to unsecure network)

Unsecure Network (VLAN 20)
  ├── Legacy Node 1 (no security)
  └── Legacy Node 2 (no security)
```

**Gateway node:**

```cpp
class SecurityGateway : public rclcpp::Node {
public:
    SecurityGateway() : Node("gateway") {
        // Subscribe to insecure network
        insecure_sub_ = create_subscription<Twist>(
            "/insecure/cmd_vel", 10,
            [this](const Twist::SharedPtr msg) {
                // Validate and filter
                if (validate(msg)) {
                    secure_pub_->publish(*msg);  // Forward to secure network
                }
            }
        );

        // Publish to secure network
        secure_pub_ = create_publisher<Twist>("/secure/cmd_vel", 10);
    }

private:
    bool validate(const Twist::SharedPtr msg) {
        // Implement validation logic
        return msg->linear.x < max_speed_;
    }
};
```

**Best Practices:**
1. **Plan migration** before enabling security
2. **Test in staging** with mixed environment
3. **Use Permissive mode** only during migration
4. **Monitor rejected participants** for debugging
5. **Document security status** of each node
6. **Network segmentation** for legacy systems

---

### Edge Case 4: Performance Impact of Encryption

**Scenario:**
High-bandwidth topics (camera, lidar) suffer significant latency/CPU usage after enabling encryption.

**Example:**

```bash
# Without security
ros2 topic hz /camera/image_raw
# average rate: 30.001 Hz

# With security (ENCRYPT)
export ROS_SECURITY_ENABLE=true
ros2 topic hz /camera/image_raw
# average rate: 15.223 Hz  (50% drop!)

# CPU usage
top -p $(pgrep camera_node)
# Without security: 20% CPU
# With security: 60% CPU (3x increase!)
```

**Measurements:**

| Topic | Message Size | Rate (no security) | Rate (encrypt) | Latency Increase |
|-------|-------------|-------------------|----------------|------------------|
| /cmd_vel | 32 bytes | 50 Hz | 49 Hz | ~2% |
| /scan | 10 KB | 10 Hz | 9.8 Hz | ~5% |
| /camera (1080p) | 6 MB | 30 Hz | 15 Hz | ~50% |
| /point_cloud | 50 MB | 5 Hz | 2 Hz | ~60% |

**Problem:**
- Encryption overhead scales with message size
- Large messages (images, point clouds) severely impacted
- CPU bottleneck on resource-constrained systems

**Solution 1: Selective Encryption**

Only encrypt sensitive topics, leave high-bandwidth topics unencrypted.

```xml
<!-- governance.xml -->
<topic_access_rules>
  <!-- Encrypt sensitive commands -->
  <topic_rule>
    <topic_expression>rt/cmd_vel</topic_expression>
    <data_protection_kind>ENCRYPT</data_protection_kind>
  </topic_rule>

  <!-- Only sign (not encrypt) high-bandwidth topics -->
  <topic_rule>
    <topic_expression>rt/camera/image_raw</topic_expression>
    <data_protection_kind>SIGN</data_protection_kind>  <!-- Faster! -->
  </topic_rule>

  <!-- No protection for internal debug topics -->
  <topic_rule>
    <topic_expression>rt/debug/*</topic_expression>
    <data_protection_kind>NONE</data_protection_kind>
  </topic_rule>
</topic_access_rules>
```

**Performance comparison:**

| Protection | Overhead | Security |
|-----------|----------|----------|
| NONE | 0% | None |
| SIGN | ~5% | Integrity only |
| ENCRYPT | ~50% | Full confidentiality |

**Solution 2: Hardware Acceleration**

Use CPU with AES-NI (hardware AES acceleration):

```bash
# Check if CPU supports AES-NI
grep aes /proc/cpuinfo

# If available, enable in DDS
export FASTRTPS_BUILTIN_TRANSPORTS_AES=1
```

**Solution 3: Compression Before Encryption**

```cpp
class CompressedImagePublisher : public rclcpp::Node {
public:
    CompressedImagePublisher() : Node("compressed_pub") {
        // Publish compressed images (smaller = faster encryption)
        pub_ = create_publisher<sensor_msgs::msg::CompressedImage>(
            "camera/compressed", 10
        );

        timer_ = create_wall_timer(33ms, [this]() {
            auto img = capture_image();  // 6 MB raw
            auto compressed = compress_jpeg(img, 80);  // 200 KB compressed
            pub_->publish(compressed);
            // Encrypting 200 KB vs 6 MB = 30x faster!
        });
    }
};
```

**Solution 4: Intra-Process Communication**

For nodes in same process, use intra-process (zero-copy) which bypasses DDS security:

```python
# Composable nodes in same container
container = ComposableNodeContainer(
    name='vision_container',
    namespace='',
    package='rclcpp_components',
    executable='component_container',
    composable_node_descriptions=[
        ComposableNode(
            package='camera',
            plugin='camera::CameraNode',
            name='camera',
            extra_arguments=[{'use_intra_process_comms': True}]
        ),
        ComposableNode(
            package='processing',
            plugin='processing::ImageProcessor',
            name='processor',
            extra_arguments=[{'use_intra_process_comms': True}]
        ),
    ],
)
# Intra-process communication bypasses DDS (and encryption)
# Still secure because nodes are in same process
```

**Solution 5: Dedicated Network**

Isolate high-bandwidth traffic on separate network interface:

```bash
# Bind DDS to specific interface
export FASTRTPS_DEFAULT_PROFILES_FILE=/path/to/fastdds_profile.xml
```

```xml
<!-- fastdds_profile.xml -->
<transport_descriptors>
  <transport_descriptor>
    <transport_id>CustomUDP</transport_id>
    <type>UDPv4</type>
    <interfaceWhiteList>
      <address>192.168.10.1</address>  <!-- Dedicated network -->
    </interfaceWhiteList>
  </transport_descriptor>
</transport_descriptors>
```

**Best Practices:**
1. **Profile performance** before and after security
2. **Selective encryption** (encrypt only sensitive topics)
3. **Use SIGN instead of ENCRYPT** for high-bandwidth
4. **Hardware acceleration** (AES-NI)
5. **Compression** before encryption
6. **Intra-process** for co-located nodes
7. **Dedicated networks** for high-bandwidth

---

## CODE_EXAMPLES
### Example: Complete Secure ROS2 System Setup

This example demonstrates a production-ready secure ROS2 deployment.

**Directory Structure:**

```
secure_robot_system/
├── security/
│   ├── setup_security.sh
│   ├── policies/
│   │   ├── controller.xml
│   │   ├── camera.xml
│   │   └── navigation.xml
│   ├── governance.xml
│   └── monitor_certs.sh
├── launch/
│   └── secure_robot.launch.py
├── config/
│   └── security_config.yaml
└── scripts/
    └── validate_security.py
```

**1. Security Setup Script (security/setup_security.sh):**

```bash
#!/bin/bash
set -e

KEYSTORE_PATH="${HOME}/robot_keystore"
PACKAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
POLICIES_DIR="${PACKAGE_DIR}/security/policies"

echo "=== ROS2 Security Setup ==="

# Check if ROS2 is sourced
if [ -z "$ROS_DISTRO" ]; then
    echo "ERROR: ROS2 not sourced. Run: source /opt/ros/humble/setup.bash"
    exit 1
fi

# Create keystore
if [ -d "$KEYSTORE_PATH" ]; then
    echo "Keystore already exists at $KEYSTORE_PATH"
    read -p "Recreate? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf "$KEYSTORE_PATH"
    else
        exit 0
    fi
fi

echo "Creating keystore at $KEYSTORE_PATH..."
ros2 security create_keystore "$KEYSTORE_PATH"

# List of nodes
NODES=(
    "/robot/controller"
    "/robot/camera"
    "/robot/lidar"
    "/robot/navigation"
)

# Generate keys and permissions for each node
for node in "${NODES[@]}"; do
    echo "Setting up security for $node..."

    # Extract node name from path
    node_name=$(basename "$node")

    # Create enclave
    ros2 security create_enclave "$KEYSTORE_PATH" "$node"

    # Apply custom permissions if available
    policy_file="${POLICIES_DIR}/${node_name}.xml"
    if [ -f "$policy_file" ]; then
        echo "  Applying custom permissions from $policy_file"
        ros2 security create_permission "$KEYSTORE_PATH" "$node" "$policy_file"
    else
        echo "  Using auto-generated permissions"
    fi
done

# Copy governance document
if [ -f "${PACKAGE_DIR}/security/governance.xml" ]; then
    echo "Copying governance document..."
    # Governance file needs to be signed
    # This is a simplified version; in production, use proper signing
    cp "${PACKAGE_DIR}/security/governance.xml" \
       "$KEYSTORE_PATH/enclaves/governance.xml"
fi

echo ""
echo "=== Security Setup Complete ==="
echo ""
echo "Export these environment variables:"
echo "  export ROS_SECURITY_KEYSTORE=$KEYSTORE_PATH"
echo "  export ROS_SECURITY_ENABLE=true"
echo "  export ROS_SECURITY_STRATEGY=Enforce"
echo ""
echo "Or add to ~/.bashrc:"
echo "  echo 'export ROS_SECURITY_KEYSTORE=$KEYSTORE_PATH' >> ~/.bashrc"
echo "  echo 'export ROS_SECURITY_ENABLE=true' >> ~/.bashrc"
echo "  echo 'export ROS_SECURITY_STRATEGY=Enforce' >> ~/.bashrc"
```

**2. Controller Permissions (security/policies/controller.xml):**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<dds xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     xsi:noNamespaceSchemaLocation="http://www.omg.org/spec/DDS-SECURITY/20170901/omg_shared_ca_permissions.xsd">
  <permissions>
    <grant name="controller_permissions">
      <subject_name>CN=/robot/controller</subject_name>
      <validity>
        <not_before>2024-01-01T00:00:00</not_before>
        <not_after>2034-01-01T00:00:00</not_after>
      </validity>

      <allow_rule>
        <domains>
          <id>0</id>
        </domains>

        <!-- Controller can publish velocity commands -->
        <publish>
          <topics>
            <topic>rt/cmd_vel</topic>
            <topic>rt/controller/status</topic>
            <topic>rq/*Request</topic>  <!-- Service requests -->
            <topic>rr/*Reply</topic>     <!-- Service responses -->
          </topics>
        </publish>

        <!-- Controller subscribes to sensor data -->
        <subscribe>
          <topics>
            <topic>rt/scan</topic>
            <topic>rt/odom</topic>
            <topic>rt/camera/image_raw</topic>
            <topic>rq/*Request</topic>
            <topic>rr/*Reply</topic>
          </topics>
        </subscribe>
      </allow_rule>

      <!-- Deny admin topics -->
      <deny_rule>
        <domains>
          <id>0</id>
        </domains>
        <publish>
          <topics>
            <topic>rt/admin/*</topic>
          </topics>
        </publish>
        <subscribe>
          <topics>
            <topic>rt/admin/*</topic>
          </topics>
        </subscribe>
      </deny_rule>
    </grant>
  </permissions>
</dds>
```

**3. Governance Document (security/governance.xml):**

```xml
<?xml version="1.0" encoding="utf-8"?>
<dds xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     xsi:noNamespaceSchemaLocation="http://www.omg.org/spec/DDS-SECURITY/20170901/omg_shared_ca_governance.xsd">
  <domain_access_rules>
    <domain_rule>
      <domains>
        <id>0</id>
      </domains>

      <!-- Require authentication -->
      <allow_unauthenticated_participants>false</allow_unauthenticated_participants>
      <enable_join_access_control>true</enable_join_access_control>

      <!-- Encrypt discovery -->
      <discovery_protection_kind>ENCRYPT</discovery_protection_kind>
      <liveliness_protection_kind>ENCRYPT</liveliness_protection_kind>
      <rtps_protection_kind>SIGN</rtps_protection_kind>

      <!-- Topic-specific rules -->
      <topic_access_rules>

        <!-- Critical command topics: ENCRYPT -->
        <topic_rule>
          <topic_expression>rt/cmd_vel</topic_expression>
          <enable_discovery_protection>true</enable_discovery_protection>
          <enable_read_access_control>true</enable_read_access_control>
          <enable_write_access_control>true</enable_write_access_control>
          <metadata_protection_kind>ENCRYPT</metadata_protection_kind>
          <data_protection_kind>ENCRYPT</data_protection_kind>
        </topic_rule>

        <!-- Sensor data: SIGN only (performance) -->
        <topic_rule>
          <topic_expression>rt/scan</topic_expression>
          <enable_discovery_protection>true</enable_discovery_protection>
          <enable_read_access_control>true</enable_read_access_control>
          <enable_write_access_control>true</enable_write_access_control>
          <metadata_protection_kind>SIGN</metadata_protection_kind>
          <data_protection_kind>SIGN</data_protection_kind>
        </topic_rule>

        <!-- High-bandwidth camera: SIGN only -->
        <topic_rule>
          <topic_expression>rt/camera/image_raw</topic_expression>
          <enable_discovery_protection>true</enable_discovery_protection>
          <enable_read_access_control>true</enable_read_access_control>
          <enable_write_access_control>true</enable_write_access_control>
          <metadata_protection_kind>NONE</metadata_protection_kind>
          <data_protection_kind>SIGN</data_protection_kind>
        </topic_rule>

        <!-- Services: ENCRYPT -->
        <topic_rule>
          <topic_expression>rq/*</topic_expression>  <!-- Service requests -->
          <enable_discovery_protection>true</enable_discovery_protection>
          <enable_read_access_control>true</enable_read_access_control>
          <enable_write_access_control>true</enable_write_access_control>
          <metadata_protection_kind>ENCRYPT</metadata_protection_kind>
          <data_protection_kind>ENCRYPT</data_protection_kind>
        </topic_rule>

      </topic_access_rules>
    </domain_rule>
  </domain_access_rules>
</dds>
```

**4. Certificate Monitor (security/monitor_certs.sh):**

```bash
#!/bin/bash

KEYSTORE_PATH="${HOME}/robot_keystore"
WARNING_DAYS=30
CRITICAL_DAYS=7

if [ ! -d "$KEYSTORE_PATH" ]; then
    echo "ERROR: Keystore not found at $KEYSTORE_PATH"
    exit 1
fi

echo "=== Certificate Expiration Monitor ==="
echo ""

EXIT_CODE=0

find "$KEYSTORE_PATH" -name "cert.pem" | while read cert; do
    # Get enclave name from path
    enclave=$(echo "$cert" | sed "s|$KEYSTORE_PATH/enclaves/||" | sed 's|/cert.pem||')

    # Get expiration date
    expiry=$(openssl x509 -in "$cert" -noout -enddate | cut -d= -f2)
    expiry_epoch=$(date -d "$expiry" +%s)
    now_epoch=$(date +%s)
    days_left=$(( ($expiry_epoch - $now_epoch) / 86400 ))

    # Check status
    if [ $days_left -lt 0 ]; then
        echo "❌ EXPIRED: $enclave (expired $((-days_left)) days ago)"
        EXIT_CODE=2
    elif [ $days_left -lt $CRITICAL_DAYS ]; then
        echo "🔴 CRITICAL: $enclave (expires in $days_left days)"
        EXIT_CODE=1
    elif [ $days_left -lt $WARNING_DAYS ]; then
        echo "⚠️  WARNING: $enclave (expires in $days_left days)"
    else
        echo "✅ OK: $enclave (expires in $days_left days)"
    fi
done

echo ""
if [ $EXIT_CODE -eq 0 ]; then
    echo "All certificates OK"
elif [ $EXIT_CODE -eq 1 ]; then
    echo "Some certificates expiring soon!"
else
    echo "EXPIRED CERTIFICATES FOUND!"
fi

exit $EXIT_CODE
```

**5. Secure Launch File (launch/secure_robot.launch.py):**

```python
import os
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, OpaqueFunction
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node
from ament_index_python.packages import get_package_share_directory

def launch_setup(context, *args, **kwargs):
    # Get keystore path
    keystore_path = os.path.expanduser('~/robot_keystore')

    # Verify keystore exists
    if not os.path.exists(keystore_path):
        raise Exception(
            f"Security keystore not found at {keystore_path}. "
            f"Run: ./security/setup_security.sh"
        )

    # Security environment
    security_env = {
        'ROS_SECURITY_KEYSTORE': keystore_path,
        'ROS_SECURITY_ENABLE': 'true',
        'ROS_SECURITY_STRATEGY': 'Enforce'
    }

    # Controller node
    controller = Node(
        package='robot_control',
        executable='controller',
        name='controller',
        namespace='robot',
        additional_env=security_env,
        arguments=['--ros-args', '--enclave', '/robot/controller'],
        output='both'
    )

    # Camera node
    camera = Node(
        package='robot_sensors',
        executable='camera',
        name='camera',
        namespace='robot',
        additional_env=security_env,
        arguments=['--ros-args', '--enclave', '/robot/camera'],
        output='both'
    )

    # Lidar node
    lidar = Node(
        package='robot_sensors',
        executable='lidar',
        name='lidar',
        namespace='robot',
        additional_env=security_env,
        arguments=['--ros-args', '--enclave', '/robot/lidar'],
        output='both'
    )

    # Navigation node
    navigation = Node(
        package='robot_navigation',
        executable='navigation',
        name='navigation',
        namespace='robot',
        additional_env=security_env,
        arguments=['--ros-args', '--enclave', '/robot/navigation'],
        output='both'
    )

    return [controller, camera, lidar, navigation]

def generate_launch_description():
    return LaunchDescription([
        DeclareLaunchArgument(
            'log_level',
            default_value='info',
            description='Logging level'
        ),
        OpaqueFunction(function=launch_setup)
    ])
```

**6. Security Validation Script (scripts/validate_security.py):**

```python
#!/usr/bin/env python3

import subprocess
import sys
import os

def run_command(cmd):
    """Run shell command and return output"""
    try:
        result = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            text=True,
            timeout=10
        )
        return result.returncode, result.stdout, result.stderr
    except subprocess.TimeoutExpired:
        return 1, "", "Command timed out"

def check_environment():
    """Verify security environment variables"""
    print("Checking environment variables...")

    required_vars = {
        'ROS_SECURITY_KEYSTORE': os.environ.get('ROS_SECURITY_KEYSTORE'),
        'ROS_SECURITY_ENABLE': os.environ.get('ROS_SECURITY_ENABLE'),
        'ROS_SECURITY_STRATEGY': os.environ.get('ROS_SECURITY_STRATEGY')
    }

    all_set = True
    for var, value in required_vars.items():
        if value:
            print(f"  ✓ {var}={value}")
        else:
            print(f"  ✗ {var} not set")
            all_set = False

    return all_set

def check_keystore():
    """Verify keystore exists and has certificates"""
    print("\nChecking keystore...")

    keystore = os.environ.get('ROS_SECURITY_KEYSTORE')
    if not keystore:
        print("  ✗ ROS_SECURITY_KEYSTORE not set")
        return False

    if not os.path.exists(keystore):
        print(f"  ✗ Keystore not found at {keystore}")
        return False

    print(f"  ✓ Keystore found at {keystore}")

    # Check for enclaves
    enclaves_dir = os.path.join(keystore, 'enclaves')
    if not os.path.exists(enclaves_dir):
        print(f"  ✗ Enclaves directory not found")
        return False

    enclaves = [d for d in os.listdir(enclaves_dir)
                if os.path.isdir(os.path.join(enclaves_dir, d))]

    if not enclaves:
        print("  ✗ No enclaves found")
        return False

    print(f"  ✓ Found {len(enclaves)} enclave(s)")
    for enclave in enclaves:
        print(f"    - {enclave}")

    return True

def check_certificates():
    """Verify certificates are valid"""
    print("\nChecking certificates...")

    keystore = os.environ.get('ROS_SECURITY_KEYSTORE')
    enclaves_dir = os.path.join(keystore, 'enclaves')

    all_valid = True
    for root, dirs, files in os.walk(enclaves_dir):
        if 'cert.pem' in files:
            cert_path = os.path.join(root, 'cert.pem')
            enclave = root.replace(enclaves_dir + '/', '')

            # Check expiration
            rc, out, err = run_command(
                f"openssl x509 -in {cert_path} -noout -enddate"
            )

            if rc == 0:
                print(f"  ✓ {enclave}: {out.strip()}")
            else:
                print(f"  ✗ {enclave}: Failed to read certificate")
                all_valid = False

    return all_valid

def check_running_nodes():
    """Check if nodes are running with security"""
    print("\nChecking running nodes...")

    rc, out, err = run_command("ros2 node list")
    if rc != 0:
        print("  ✗ Failed to list nodes")
        return False

    nodes = [n.strip() for n in out.split('\n') if n.strip()]
    if not nodes:
        print("  ! No nodes running")
        return True

    print(f"  Found {len(nodes)} node(s)")
    for node in nodes:
        print(f"    - {node}")

    return True

def main():
    print("=== ROS2 Security Validation ===\n")

    checks = [
        ("Environment", check_environment),
        ("Keystore", check_keystore),
        ("Certificates", check_certificates),
        ("Running Nodes", check_running_nodes)
    ]

    results = []
    for name, check_func in checks:
        result = check_func()
        results.append(result)

    print("\n=== Summary ===")
    all_passed = all(results)

    if all_passed:
        print("✓ All security checks passed")
        return 0
    else:
        print("✗ Some security checks failed")
        return 1

if __name__ == '__main__':
    sys.exit(main())
```

**Usage:**

```bash
# Setup security
cd secure_robot_system
./security/setup_security.sh

# Source environment
source ~/.bashrc  # Or manually export variables

# Validate setup
python3 scripts/validate_security.py

# Monitor certificates
./security/monitor_certs.sh

# Launch secure system
ros2 launch launch/secure_robot.launch.py

# In another terminal (also with security enabled)
export ROS_SECURITY_KEYSTORE=~/robot_keystore
export ROS_SECURITY_ENABLE=true
export ROS_SECURITY_STRATEGY=Enforce
ros2 topic list  # Should see topics from secure nodes
```

---

## Interview Questions

### Question 1: What are the three main security features provided by DDS Security in ROS2?

**Difficulty:** ⭐⭐ (Medium)

**Answer:**

The three main security features are:

**1. Authentication (Who are you?)**
- Nodes prove their identity using X.509 certificates
- Certificate signed by trusted Certificate Authority (CA)
- Mutual authentication (both sides verify each other)

**Example:**
```
Node A: "I am /robot/controller, here's my certificate"
Node B: "I verify your certificate is signed by trusted CA"
Node B: "I am /robot/camera, here's my certificate"
Node A: "I verify your certificate too"
→ Handshake successful, communication established
```

**2. Encryption (Data confidentiality)**
- All communication encrypted using AES-256
- Prevents eavesdropping on network
- Configurable per-topic (ENCRYPT, SIGN, or NONE)

**Example:**
```cpp
// Without encryption
Wireshark capture: "linear: {x: 0.5}"  // Plaintext visible!

// With encryption
Wireshark capture: "8f3a9b2c..."  // Encrypted, unreadable
```

**3. Access Control (What can you do?)**
- Permissions define which topics each node can access
- Specified in XML permission files
- Enforce principle of least privilege

**Example permissions:**
```xml
<publish>
  <topics>
    <topic>rt/cmd_vel</topic>  <!-- Controller can publish velocity -->
  </topics>
</publish>
<subscribe>
  <topics>
    <topic>rt/scan</topic>  <!-- Controller can subscribe to scan -->
  </topics>
</subscribe>
<!-- Controller CANNOT access rt/admin/* topics -->
```

**Additional feature: Integrity (Signing)**
- Messages digitally signed to detect tampering
- Verifies data hasn't been modified in transit
- Lighter than encryption (better performance)

**When to use:**
- **Authentication:** Always (verify identities)
- **Encryption:** Sensitive data (commands, private info)
- **Access Control:** Always (limit what nodes can do)
- **Signing:** High-bandwidth data where confidentiality not needed

---

### Question 2: How would you debug a node that fails to start due to security configuration errors?

**Difficulty:** ⭐⭐⭐ (Hard)

**Answer:**

**Systematic debugging approach:**

**Step 1: Check Environment Variables**

```bash
# Verify security is enabled
echo $ROS_SECURITY_ENABLE  # Should be 'true'
echo $ROS_SECURITY_KEYSTORE  # Should point to keystore
echo $ROS_SECURITY_STRATEGY  # Should be 'Enforce' or 'Permissive'

# If not set:
export ROS_SECURITY_KEYSTORE=~/keystore
export ROS_SECURITY_ENABLE=true
export ROS_SECURITY_STRATEGY=Enforce
```

**Step 2: Verify Keystore Structure**

```bash
# Check keystore exists
ls -la $ROS_SECURITY_KEYSTORE

# Should have structure:
# keystore/
#   ├── enclaves/
#   │   └── my_robot/
#   │       └── my_node/
#   │           ├── cert.pem
#   │           ├── key.pem
#   │           ├── identity_ca.cert.pem
#   │           ├── permissions.p7s
#   │           └── governance.p7s
#   ├── public/
#   └── private/

# Check enclave exists
ls -la $ROS_SECURITY_KEYSTORE/enclaves/my_robot/my_node/
```

**Step 3: Verify Certificate Validity**

```bash
# Check certificate hasn't expired
openssl x509 -in $ROS_SECURITY_KEYSTORE/enclaves/my_robot/my_node/cert.pem \
    -noout -enddate

# Output: notAfter=Jan  1 00:00:00 2034 GMT
# If expired, regenerate:
ros2 security create_enclave $ROS_SECURITY_KEYSTORE /my_robot/my_node --force
```

**Step 4: Check Enclave Path**

```bash
# Enclave path must match
ros2 run my_package my_node --ros-args --enclave /my_robot/my_node
#                                                 ^^^^^^^^^^^^^^^^^
#                                                 Must match keystore path!

# Common mistake:
ros2 run my_package my_node --ros-args --enclave /wrong/path
# Error: Enclave not found
```

**Step 5: Run with Debug Logging**

```bash
# Enable security debug output
export RCUTILS_CONSOLE_MIN_SEVERITY=DEBUG
export FASTRTPS_DEFAULT_PROFILES_FILE=/tmp/debug_profile.xml

# Create debug profile
cat > /tmp/debug_profile.xml <<'EOF'
<?xml version="1.0" encoding="UTF-8" ?>
<profiles>
    <participant profile_name="default">
        <rtps>
            <builtin>
                <discovery_config>
                    <loglevel>INFO</loglevel>
                </discovery_config>
            </builtin>
        </rtps>
    </participant>
</profiles>
EOF

# Run node
ros2 run my_package my_node --ros-args --enclave /my_robot/my_node

# Look for errors like:
# [security]: Failed to load certificate
# [security]: Permission denied for topic rt/cmd_vel
# [security]: Certificate expired
```

**Step 6: Test with Permissive Mode**

```bash
# Temporarily use Permissive to isolate issue
export ROS_SECURITY_STRATEGY=Permissive

ros2 run my_package my_node --ros-args --enclave /my_robot/my_node

# If works in Permissive but not Enforce:
# - Permissions are too restrictive
# - Certificate issue
```

**Step 7: Validate Permissions**

```bash
# Extract and view permissions
openssl smime -verify \
    -in $ROS_SECURITY_KEYSTORE/enclaves/my_robot/my_node/permissions.p7s \
    -CAfile $ROS_SECURITY_KEYSTORE/enclaves/my_robot/my_node/identity_ca.cert.pem \
    -out /tmp/permissions.xml

# Check if required topics are listed
cat /tmp/permissions.xml | grep "rt/cmd_vel"
```

**Common Errors and Solutions:**

| Error Message | Cause | Solution |
|--------------|-------|----------|
| "Enclave not found" | Wrong enclave path | Check --enclave argument |
| "Certificate expired" | Old certificate | Regenerate with create_enclave --force |
| "Permission denied" | Missing topic in permissions | Update permissions.xml |
| "Failed to authenticate" | CA mismatch | Regenerate all certificates from same CA |
| "Keystore not found" | Wrong ROS_SECURITY_KEYSTORE | Check environment variable |

**Best Practices:**
1. **Start simple:** Test with single node first
2. **Use Permissive mode** during development
3. **Enable debug logging** to see detailed errors
4. **Validate each component** (certs, permissions, governance)
5. **Document enclave paths** for each node
6. **Automate certificate management** (expiration monitoring)

---

### Question 3: What's the performance difference between SIGN and ENCRYPT protection, and when would you use each?

**Difficulty:** ⭐⭐ (Medium)

**Answer:**

**SIGN (Digital Signature):**

**How it works:**
1. Compute hash of message (SHA-256)
2. Encrypt hash with sender's private key
3. Receiver verifies hash with sender's public key

**Performance:**
- Overhead: ~5-10%
- CPU: Low (just hash + signature verification)
- Latency: ~1-2ms additional

**What it provides:**
- **Integrity:** Detects if message was tampered with
- **Authentication:** Verifies sender's identity
- **No confidentiality:** Message content visible on network

**ENCRYPT (Encryption + Signing):**

**How it works:**
1. Sign message (as above)
2. Encrypt entire message with AES-256
3. Receiver decrypts then verifies signature

**Performance:**
- Overhead: ~30-60% (depending on message size)
- CPU: High (encryption/decryption of full message)
- Latency: Scales with message size
  - Small (<1 KB): +2-5ms
  - Medium (100 KB): +10-20ms
  - Large (10 MB): +100-500ms

**What it provides:**
- **Integrity:** Detects tampering
- **Authentication:** Verifies sender
- **Confidentiality:** Message content hidden from eavesdroppers

**Comparison:**

| Metric | SIGN | ENCRYPT |
|--------|------|---------|
| CPU overhead | ~5% | ~30-60% |
| Latency (1 MB) | +5ms | +50ms |
| Bandwidth increase | Minimal | None |
| Protects against eavesdropping | No | Yes |
| Protects against tampering | Yes | Yes |

**When to use SIGN:**

```xml
<!-- High-bandwidth sensor data where confidentiality not critical -->
<topic_rule>
  <topic_expression>rt/scan</topic_expression>
  <data_protection_kind>SIGN</data_protection_kind>
</topic_rule>

<topic_rule>
  <topic_expression>rt/camera/image_raw</topic_expression>
  <data_protection_kind>SIGN</data_protection_kind>
</topic_rule>
```

**Use cases:**
- Lidar/radar data (need integrity, not confidentiality)
- Camera feeds in controlled environment
- Odometry/IMU data
- Debug/status topics
- High-frequency data (>100 Hz)

**When to use ENCRYPT:**

```xml
<!-- Sensitive commands and data -->
<topic_rule>
  <topic_expression>rt/cmd_vel</topic_expression>
  <data_protection_kind>ENCRYPT</data_protection_kind>
</topic_rule>

<topic_rule>
  <topic_expression>rt/admin/*</topic_expression>
  <data_protection_kind>ENCRYPT</data_protection_kind>
</topic_rule>
```

**Use cases:**
- Robot control commands (cmd_vel, joint commands)
- Configuration/parameters
- User data (GPS location, identification)
- Admin/management topics
- Credentials or API keys
- Low-frequency, high-value data

**Hybrid approach (recommended):**

```xml
<governance>
  <!-- Critical commands: ENCRYPT -->
  <topic_rule>
    <topic_expression>rt/cmd_vel</topic_expression>
    <data_protection_kind>ENCRYPT</data_protection_kind>
  </topic_rule>

  <!-- High-bandwidth sensors: SIGN -->
  <topic_rule>
    <topic_expression>rt/camera/*</topic_expression>
    <data_protection_kind>SIGN</data_protection_kind>
  </topic_rule>

  <!-- Internal debug: NONE -->
  <topic_rule>
    <topic_expression>rt/debug/*</topic_expression>
    <data_protection_kind>NONE</data_protection_kind>
  </topic_rule>
</governance>
```

**Decision tree:**

```
Is data confidential? (passwords, location, commands)
├─ Yes → ENCRYPT
└─ No → Is integrity critical?
    ├─ Yes → SIGN
    └─ No (internal debug only) → NONE
```

**Performance optimization tip:**
For camera at 30 FPS (6 MB/image):
- ENCRYPT: 180 MB/s encrypted → ~40% CPU
- SIGN: 180 MB/s signed → ~10% CPU
- NONE: 180 MB/s unsecured → ~5% CPU

Choose SIGN for 4x less CPU usage while maintaining integrity!

---

### Question 4: How would you securely deploy a ROS2 robot fleet with centralized certificate management?

**Difficulty:** ⭐⭐⭐ (Hard)

**Answer:**

**Architecture:**

```
Central Certificate Server
  ├─ Certificate Authority (CA)
  ├─ Certificate Database
  ├─ Automated Certificate Generation
  └─ Certificate Distribution (HTTPS)

Fleet of Robots
  ├─ Robot 1 (downloads certs on boot)
  ├─ Robot 2 (downloads certs on boot)
  └─ Robot N (downloads certs on boot)
```

**Implementation:**

**1. Central Certificate Server Setup:**

```bash
# server/setup_ca.sh
#!/bin/bash

CA_DIR=/opt/ros_ca
KEYSTORE_DIR=/opt/ros_keystores

# Create Certificate Authority
mkdir -p $CA_DIR
cd $CA_DIR

# Generate CA private key
openssl genrsa -out ca_key.pem 4096

# Generate CA certificate (valid 20 years)
openssl req -x509 -new -nodes -key ca_key.pem \
    -sha256 -days 7300 -out ca_cert.pem \
    -subj "/C=US/ST=State/L=City/O=RobotFleet/CN=RootCA"

echo "Certificate Authority created"

# Create keystores directory
mkdir -p $KEYSTORE_DIR
```

**2. Certificate Generation API (Python Flask):**

```python
# server/cert_server.py
from flask import Flask, request, jsonify, send_file
import subprocess
import os
import tempfile
import shutil

app = Flask(__name__)

CA_DIR = '/opt/ros_ca'
KEYSTORE_DIR = '/opt/ros_keystores'

@app.route('/api/request_certificate', methods=['POST'])
def request_certificate():
    """Generate and return certificate for a robot"""
    data = request.json
    robot_id = data.get('robot_id')
    enclave = data.get('enclave')

    if not robot_id or not enclave:
        return jsonify({'error': 'Missing robot_id or enclave'}), 400

    # Validate robot_id (check against database/whitelist)
    if not is_authorized_robot(robot_id):
        return jsonify({'error': 'Unauthorized robot'}), 403

    # Generate keystore for this robot+enclave
    keystore_path = f"{KEYSTORE_DIR}/{robot_id}/{enclave}"

    try:
        # Create keystore if doesn't exist
        if not os.path.exists(keystore_path):
            subprocess.run([
                'ros2', 'security', 'create_keystore', keystore_path
            ], check=True)

        # Generate enclave
        subprocess.run([
            'ros2', 'security', 'create_enclave',
            keystore_path, enclave
        ], check=True)

        # Create tarball of certificates
        with tempfile.NamedTemporaryFile(suffix='.tar.gz', delete=False) as tmp:
            tarball_path = tmp.name

        subprocess.run([
            'tar', '-czf', tarball_path,
            '-C', keystore_path, '.'
        ], check=True)

        return send_file(tarball_path, as_attachment=True,
                        download_name=f'{robot_id}_{enclave}.tar.gz')

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/revoke_certificate', methods='POST'])
def revoke_certificate():
    """Revoke certificate for a robot"""
    # Implement certificate revocation list (CRL)
    pass

def is_authorized_robot(robot_id):
    """Check if robot is authorized (implement your logic)"""
    # Query database, check whitelist, etc.
    return True  # Simplified

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, ssl_context='adhoc')
```

**3. Robot-Side Certificate Fetcher:**

```bash
# robot/fetch_certificates.sh
#!/bin/bash

CERT_SERVER="https://cert-server.example.com:5000"
ROBOT_ID=$(hostname)
KEYSTORE_DIR=/opt/ros2_keystore

# List of enclaves this robot needs
ENCLAVES=(
    "/robot/controller"
    "/robot/camera"
    "/robot/lidar"
)

echo "Fetching certificates for robot: $ROBOT_ID"

for enclave in "${ENCLAVES[@]}"; do
    echo "Requesting certificate for $enclave..."

    # Request certificate from server
    response=$(curl -X POST "$CERT_SERVER/api/request_certificate" \
        -H "Content-Type: application/json" \
        -d "{\"robot_id\": \"$ROBOT_ID\", \"enclave\": \"$enclave\"}" \
        -o /tmp/certs.tar.gz \
        -w "%{http_code}")

    if [ "$response" -eq 200 ]; then
        # Extract certificates
        mkdir -p "$KEYSTORE_DIR/enclaves/$enclave"
        tar -xzf /tmp/certs.tar.gz -C "$KEYSTORE_DIR/enclaves/$enclave"
        echo "  ✓ Certificate installed for $enclave"
    else
        echo "  ✗ Failed to fetch certificate for $enclave (HTTP $response)"
        exit 1
    fi
done

# Set environment variables
cat >> /etc/environment <<EOF
ROS_SECURITY_KEYSTORE=$KEYSTORE_DIR
ROS_SECURITY_ENABLE=true
ROS_SECURITY_STRATEGY=Enforce
EOF

echo "Certificate setup complete!"
```

**4. Systemd Service for Auto-Update:**

```ini
# /etc/systemd/system/ros-cert-updater.service
[Unit]
Description=ROS2 Certificate Auto-Updater
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/opt/robot/fetch_certificates.sh
User=robot
Group=robot

[Install]
WantedBy=multi-user.target
```

```ini
# /etc/systemd/system/ros-cert-updater.timer
[Unit]
Description=Update ROS2 Certificates Weekly

[Timer]
OnCalendar=weekly
Persistent=true

[Install]
WantedBy=timers.target
```

**5. Certificate Monitoring Dashboard:**

```python
# server/monitoring_dashboard.py
from flask import Flask, render_template
import os
import OpenSSL

app = Flask(__name__)

@app.route('/dashboard')
def dashboard():
    """Show certificate status for all robots"""
    keystores = scan_keystores('/opt/ros_keystores')

    robots = []
    for keystore in keystores:
        robot_info = {
            'robot_id': keystore['robot_id'],
            'enclaves': []
        }

        for enclave in keystore['enclaves']:
            cert_path = f"{enclave}/cert.pem"
            cert_info = get_cert_info(cert_path)

            robot_info['enclaves'].append({
                'path': enclave,
                'expires': cert_info['expires'],
                'days_left': cert_info['days_left'],
                'status': cert_info['status']  # OK, WARNING, EXPIRED
            })

        robots.append(robot_info)

    return render_template('dashboard.html', robots=robots)

def get_cert_info(cert_path):
    """Extract certificate information"""
    with open(cert_path, 'rb') as f:
        cert = OpenSSL.crypto.load_certificate(
            OpenSSL.crypto.FILETYPE_PEM, f.read()
        )

    expires = cert.get_notAfter().decode('ascii')
    # Calculate days left, status, etc.

    return {'expires': expires, 'days_left': 30, 'status': 'OK'}
```

**6. Deployment Process:**

```bash
# Initial setup (once per robot)
# 1. SSH to robot
ssh robot@robot1.local

# 2. Install certificate fetcher
sudo cp fetch_certificates.sh /opt/robot/
sudo chmod +x /opt/robot/fetch_certificates.sh

# 3. Enable auto-update
sudo systemctl enable ros-cert-updater.timer
sudo systemctl start ros-cert-updater.timer

# 4. Fetch initial certificates
sudo /opt/robot/fetch_certificates.sh

# 5. Start ROS2 services
sudo systemctl restart robot.service
```

**Security Considerations:**

1. **Mutual TLS:** Certificate server uses HTTPS with client certificates
2. **Robot authentication:** Only authorized robots can request certs
3. **Certificate revocation:** Implement CRL for compromised robots
4. **Audit logging:** Log all certificate requests
5. **Secure storage:** Protect CA private key
6. **Network isolation:** Certificate server on separate VLAN

**Benefits:**
- ✓ Centralized certificate management
- ✓ Automated certificate distribution
- ✓ Easy to rotate certificates
- ✓ Visibility into fleet security status
- ✓ Scalable to thousands of robots

---

### Question 5: What are the limitations of ROS2 security, and how would you address them?

**Difficulty:** ⭐⭐⭐ (Hard)

**Answer:**

**Limitations and Solutions:**

**1. Limitation: No Application-Layer Authentication**

DDS Security authenticates nodes, not users or commands.

**Problem:**
```cpp
// Anyone with valid certificate can send any command
auto pub = create_publisher<Twist>("cmd_vel", 10);
pub->publish(dangerous_command);  // No user authentication!
```

**Solution: Add Application-Layer Auth:**

```cpp
// custom_msgs/msg/AuthenticatedCommand.msg
std_msgs/Header header
string user_id
string auth_token  # JWT or API key
geometry_msgs/Twist command

// Validate token in subscriber
void cmd_callback(const AuthenticatedCommand::SharedPtr msg) {
    if (!verify_token(msg->auth_token, msg->user_id)) {
        RCLCPP_ERROR(get_logger(), "Unauthorized command from %s", msg->user_id.c_str());
        return;  // Reject
    }

    if (!check_permissions(msg->user_id, "drive_robot")) {
        RCLCPP_ERROR(get_logger(), "User %s lacks permission", msg->user_id.c_str());
        return;
    }

    // Execute command
    execute(msg->command);
}
```

**2. Limitation: Static Permissions (No Runtime Updates)**

Permissions defined at certificate generation, can't change without regenerating.

**Solution: Dynamic Access Control Service:**

```cpp
class DynamicACL : public rclcpp::Node {
public:
    DynamicACL() : Node("dynamic_acl") {
        // Service to check permissions at runtime
        check_perm_srv_ = create_service<CheckPermission>(
            "check_permission",
            [this](const Request::SharedPtr req, Response::SharedPtr resp) {
                resp->allowed = query_database(req->node, req->topic, req->action);
            }
        );
    }

private:
    bool query_database(const std::string &node, const std::string &topic,
                       const std::string &action) {
        // Query central database/policy engine
        // Allows runtime permission updates without certificate regen
    }
};

// Nodes query before publishing
if (check_permission("/my_node", "/cmd_vel", "publish")) {
    publisher_->publish(msg);
}
```

**3. Limitation: Performance Impact on High-Bandwidth Topics**

Encryption adds significant overhead for large messages (images, point clouds).

**Solution: Selective Encryption + Hardware Acceleration:**

```xml
<!-- Encrypt only sensitive topics -->
<topic_rule>
  <topic_expression>rt/cmd_vel</topic_expression>
  <data_protection_kind>ENCRYPT</data_protection_kind>
</topic_rule>

<!-- Sign (don't encrypt) high-bandwidth -->
<topic_rule>
  <topic_expression>rt/camera/*</topic_expression>
  <data_protection_kind>SIGN</data_protection_kind>
</topic_rule>
```

```bash
# Enable hardware AES acceleration (if available)
export FASTRTPS_BUILTIN_TRANSPORTS_AES=1
```

**4. Limitation: No Key Rotation Mechanism**

Certificates expire, no automatic renewal.

**Solution: Automated Certificate Rotation:**

```bash
# Cron job or systemd timer
# /etc/systemd/system/cert-rotation.timer
[Timer]
OnCalendar=monthly
Persistent=true
```

```bash
# rotation script
#!/bin/bash
# 1. Fetch new certificates from central server
curl -X POST https://cert-server/api/rotate ...

# 2. Replace old certificates
mv new_certs/* $ROS_SECURITY_KEYSTORE/

# 3. Restart nodes with new certs
systemctl restart robot.service
```

**5. Limitation: No Protection Against Compromised Nodes**

If a node's certificate is stolen, attacker has full access until expiration.

**Solution: Certificate Revocation + Monitoring:**

```python
# Certificate Revocation List (CRL)
revoked_certs = load_crl("https://cert-server/crl.pem")

# Check on startup
if my_cert in revoked_certs:
    raise Exception("Certificate revoked!")

# Intrusion detection
class SecurityMonitor(Node):
    def __init__(self):
        # Monitor for suspicious activity
        self.sub = self.create_subscription(...)

    def callback(self, msg):
        if is_suspicious(msg):
            alert("Potential compromised node detected")
            revoke_certificate(msg.node_id)
```

**6. Limitation: Complexity**

DDS Security is complex to set up and maintain.

**Solution: Automation Tools:**

```bash
# Simplified setup tool
ros2 security quickstart \
    --fleet-size 10 \
    --validity 5y \
    --output ~/fleet_keystore

# Auto-generates keys for standard robot setup
# Creates deployment packages for each robot
# Generates monitoring dashboard
```

**Summary of Mitigations:**

| Limitation | Impact | Mitigation |
|-----------|---------|-----------|
| No app-layer auth | Medium | Add JWT/token validation |
| Static permissions | Low | Dynamic ACL service |
| Performance overhead | High | Selective encryption, HW accel |
| No key rotation | High | Automated cert management |
| Compromised nodes | High | CRL, monitoring, revocation |
| Complexity | Medium | Automation tools, docs |

**Best Practices:**
1. **Defense in depth:** Combine DDS Security with application-layer security
2. **Monitor continuously:** Detect anomalies and compromised nodes
3. **Automate everything:** Certificate management, rotation, monitoring
4. **Selective protection:** Don't encrypt everything (performance)
5. **Regular audits:** Review permissions, check for vulnerabilities
6. **Training:** Ensure team understands security mechanisms

---

## PRACTICE_TASKS
### Practice Task 1: Setup Complete Secure ROS2 System

**Objective:** Configure DDS Security for a multi-node robot system from scratch.

**Requirements:**

1. **Certificate Infrastructure:**
   - Create keystore with CA
   - Generate certificates for 5 nodes:
     - /robot/controller
     - /robot/camera
     - /robot/lidar
     - /robot/navigation
     - /robot/diagnostics

2. **Permissions:**
   - Define minimal permissions for each node
   - Controller: publish cmd_vel, subscribe sensors
   - Camera: publish images only
   - Lidar: publish scan only
   - Navigation: subscribe sensors, publish goals
   - Diagnostics: subscribe all, publish diagnostics

3. **Governance:**
   - Encrypt cmd_vel, goals
   - Sign sensor data (scan, images)
   - No protection for diagnostics

4. **Testing:**
   - Launch all nodes with security
   - Verify nodes can communicate
   - Attempt to violate permissions (should fail)
   - Measure performance impact

5. **Monitoring:**
   - Check certificate expiration dates
   - Validate permissions are enforced
   - Monitor for security events

**Deliverables:**
- Keystore directory with all certificates
- Permission XML files for each node
- Governance document
- Launch file with security enabled
- Test report with performance measurements
- Documentation

---

### Practice Task 2: Implement Certificate Rotation System

**Objective:** Build an automated system for certificate rotation without downtime.

**Requirements:**

1. **Certificate Monitoring:**
   - Script to check expiration dates
   - Alert when certificates expire in < 30 days
   - Daily cron job or systemd timer

2. **Rotation Process:**
   - Generate new certificates
   - Deploy to robots
   - Graceful switchover (no downtime)
   - Rollback on failure

3. **Testing:**
   - Test rotation on single robot
   - Test fleet-wide rotation
   - Verify no communication interruption
   - Handle robots offline during rotation

4. **Automation:**
   - Fully automated rotation script
   - Integration with configuration management (Ansible)
   - Logging and audit trail

**Deliverables:**
- Certificate monitoring script
- Rotation automation script
- Ansible playbook (or similar)
- Test results showing zero downtime
- Documentation

---

### Practice Task 3: Security Performance Analysis

**Objective:** Measure and optimize performance impact of DDS Security.

**Requirements:**

1. **Baseline Measurement:**
   - Measure latency and throughput WITHOUT security
   - Test topics: cmd_vel, scan, camera (1080p)
   - Record CPU and memory usage

2. **Security Enabled:**
   - Measure with ENCRYPT on all topics
   - Measure with SIGN on all topics
   - Measure with selective (cmd_vel encrypted, others signed)

3. **Analysis:**
   - Create comparison table
   - Identify bottlenecks
   - Calculate overhead percentage

4. **Optimization:**
   - Apply hardware acceleration
   - Use selective encryption
   - Compression before encryption
   - Re-measure after optimization

5. **Recommendations:**
   - Document when to use ENCRYPT vs SIGN vs NONE
   - CPU requirements for secure communication
   - Network bandwidth impact

**Deliverables:**
- Performance measurement scripts
- Comparison graphs (latency, throughput, CPU)
- Optimization report
- Recommendations document
- Sample governance file with optimized settings

---

## QUICK_REFERENCE
### Enable Security Commands

```bash
# Create keystore
ros2 security create_keystore ~/keystore

# Create node enclave
ros2 security create_enclave ~/keystore /my_robot/my_node

# Generate with custom permissions
ros2 security create_permission ~/keystore /my_robot/my_node permissions.xml

# Set environment
export ROS_SECURITY_KEYSTORE=~/keystore
export ROS_SECURITY_ENABLE=true
export ROS_SECURITY_STRATEGY=Enforce

# Run node with security
ros2 run my_package my_node --ros-args --enclave /my_robot/my_node
```

### Certificate Management

```bash
# Check certificate expiration
openssl x509 -in ~/keystore/enclaves/my_robot/my_node/cert.pem -noout -enddate

# View certificate details
openssl x509 -in cert.pem -text -noout

# Verify permissions file
openssl smime -verify \
    -in permissions.p7s \
    -CAfile identity_ca.cert.pem \
    -out permissions.xml
```

### Protection Levels

```xml
<!-- governance.xml -->
<data_protection_kind>NONE</data_protection_kind>      <!-- No protection -->
<data_protection_kind>SIGN</data_protection_kind>      <!-- Integrity only -->
<data_protection_kind>ENCRYPT</data_protection_kind>  <!-- Full encryption -->
```

### Common Firewall Rules

```bash
# Fast DDS
sudo ufw allow 7400:7500/udp

# Cyclone DDS
sudo ufw allow 7400:7500/udp

# Allow from specific network
sudo ufw allow from 192.168.1.0/24 to any port 7400:7500 proto udp
```

---

This completes Topic 4.4: Security & DDS Security!