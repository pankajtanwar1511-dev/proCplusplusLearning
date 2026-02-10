# Topic 2.2: Services

## THEORY_SECTION

### 1. Service Fundamentals

**What is a Service?**

A service implements **request-response communication** between nodes:
- **Client** sends request
- **Server** processes request, sends response
- **Synchronous** (client waits) or **asynchronous** (client continues, callback later)

**Service vs Topic:**

| Aspect | Topic (Pub/Sub) | Service (Req/Res) |
|--------|----------------|-------------------|
| **Pattern** | One-to-many | One-to-one |
| **Direction** | Unidirectional | Bidirectional |
| **Blocking** | Non-blocking | Can block (sync call) |
| **Use Case** | Continuous data streams | Occasional computations |
| **Example** | Sensor data, telemetry | Trigger action, get state |

**When to Use Services:**

- **Trigger actions**: "Start recording", "Reset odometry"
- **Query state**: "Get current pose", "Is node ready?"
- **Computations**: "Plan path", "Solve inverse kinematics"
- **Configuration**: "Set parameter", "Reload config"

**When NOT to Use Services:**

- High-frequency data (use topics)
- One-way notifications (use topics)
- Long-running tasks (use actions)

---

### 2. Service Definition (.srv Files)

**Structure:**

```
Request fields
---
Response fields
```

**Example: `AddTwoInts.srv`**

```
int64 a
int64 b
---
int64 sum
```

**Example: `SetBool.srv`**

```
bool data
---
bool success
string message
```

**Built-in Service Types:**

| Service | Package | Purpose |
|---------|---------|---------|
| `Trigger` | `std_srvs` | No request, success response |
| `SetBool` | `std_srvs` | Boolean request, success response |
| `Empty` | `std_srvs` | No request/response (just trigger) |

**Creating Custom Service:**

**1. Create package with service definition:**

```
my_interfaces/
├── package.xml
├── CMakeLists.txt
└── srv/
    └── ComputePath.srv
```

**2. Define service (`srv/ComputePath.srv`):**

```
# Request
geometry_msgs/PoseStamped start
geometry_msgs/PoseStamped goal
float32 max_speed
---
# Response
nav_msgs/Path path
bool success
string message
float32 computation_time
```

**3. Update `package.xml`:**

```xml
<build_depend>rosidl_default_generators</build_depend>
<exec_depend>rosidl_default_runtime</exec_depend>
<member_of_group>rosidl_interface_packages</member_of_group>

<depend>geometry_msgs</depend>
<depend>nav_msgs</depend>
```

**4. Update `CMakeLists.txt`:**

```cmake
find_package(rosidl_default_generators REQUIRED)
find_package(geometry_msgs REQUIRED)
find_package(nav_msgs REQUIRED)

rosidl_generate_interfaces(${PROJECT_NAME}
  "srv/ComputePath.srv"
  DEPENDENCIES geometry_msgs nav_msgs
)
```

**5. Build and use:**

```bash
colcon build --packages-select my_interfaces
source install/setup.bash

# List services
ros2 interface list | grep ComputePath
# my_interfaces/srv/ComputePath

# Show definition
ros2 interface show my_interfaces/srv/ComputePath
```

---

### 3. Service Server Implementation

**C++ Server:**

```cpp
#include "rclcpp/rclcpp.hpp"
#include "std_srvs/srv/add_two_ints.hpp"

class AddTwoIntsServer : public rclcpp::Node {
public:
    AddTwoIntsServer() : Node("add_two_ints_server") {
        // Create service
        service_ = create_service<std_srvs::srv::AddTwoInts>(
            "add_two_ints",
            std::bind(&AddTwoIntsServer::handle_service, this,
                     std::placeholders::_1, std::placeholders::_2)
        );

        RCLCPP_INFO(get_logger(), "Service 'add_two_ints' ready");
    }

private:
    void handle_service(
        const std::shared_ptr<std_srvs::srv::AddTwoInts::Request> request,
        std::shared_ptr<std_srvs::srv::AddTwoInts::Response> response)
    {
        RCLCPP_INFO(get_logger(), "Request: %ld + %ld", request->a, request->b);

        // Process request
        response->sum = request->a + request->b;

        RCLCPP_INFO(get_logger(), "Response: %ld", response->sum);
    }

    rclcpp::Service<std_srvs::srv::AddTwoInts>::SharedPtr service_;
};

int main(int argc, char **argv) {
    rclcpp::init(argc, argv);
    rclcpp::spin(std::make_shared<AddTwoIntsServer>());
    rclcpp::shutdown();
    return 0;
}
```

**Python Server:**

```python
import rclpy
from rclpy.node import Node
from std_srvs.srv import AddTwoInts

class AddTwoIntsServer(Node):
    def __init__(self):
        super().__init__('add_two_ints_server')

        self.srv = self.create_service(
            AddTwoInts,
            'add_two_ints',
            self.handle_service
        )

        self.get_logger().info("Service 'add_two_ints' ready")

    def handle_service(self, request, response):
        self.get_logger().info(f'Request: {request.a} + {request.b}')

        response.sum = request.a + request.b

        self.get_logger().info(f'Response: {response.sum}')
        return response

def main():
    rclpy.init()
    node = AddTwoIntsServer()
    rclpy.spin(node)
    rclpy.shutdown()
```

**Service Callback Threading:**

- Service callback runs in **executor thread**
- With `SingleThreadedExecutor`: blocks other callbacks
- With `MultiThreadedExecutor`: can run concurrently (if in separate callback group)

---

### 4. Service Client Implementation

**Synchronous Client (C++):**

```cpp
#include "rclcpp/rclcpp.hpp"
#include "std_srvs/srv/add_two_ints.hpp"

int main(int argc, char **argv) {
    rclcpp::init(argc, argv);
    auto node = rclcpp::Node::make_shared("add_two_ints_client");

    // Create client
    auto client = node->create_client<std_srvs::srv::AddTwoInts>("add_two_ints");

    // Wait for service to be available
    while (!client->wait_for_service(std::chrono::seconds(1))) {
        if (!rclcpp::ok()) {
            RCLCPP_ERROR(node->get_logger(), "Interrupted");
            return 1;
        }
        RCLCPP_INFO(node->get_logger(), "Waiting for service...");
    }

    // Create request
    auto request = std::make_shared<std_srvs::srv::AddTwoInts::Request>();
    request->a = 5;
    request->b = 7;

    // Send request (async)
    auto future = client->async_send_request(request);

    // Wait for response (blocks!)
    if (rclcpp::spin_until_future_complete(node, future) ==
        rclcpp::FutureReturnCode::SUCCESS)
    {
        auto response = future.get();
        RCLCPP_INFO(node->get_logger(), "Result: %ld", response->sum);
    } else {
        RCLCPP_ERROR(node->get_logger(), "Service call failed");
    }

    rclcpp::shutdown();
    return 0;
}
```

**Asynchronous Client with Callback (C++):**

```cpp
class AddTwoIntsAsyncClient : public rclcpp::Node {
public:
    AddTwoIntsAsyncClient() : Node("async_client") {
        client_ = create_client<std_srvs::srv::AddTwoInts>("add_two_ints");

        // Wait for service
        while (!client_->wait_for_service(1s)) {
            RCLCPP_INFO(get_logger(), "Waiting for service...");
        }

        send_request(5, 7);
    }

private:
    void send_request(int64_t a, int64_t b) {
        auto request = std::make_shared<std_srvs::srv::AddTwoInts::Request>();
        request->a = a;
        request->b = b;

        // Async call with callback
        auto future = client_->async_send_request(request,
            std::bind(&AddTwoIntsAsyncClient::response_callback, this,
                     std::placeholders::_1));

        RCLCPP_INFO(get_logger(), "Request sent, continuing...");
        // Node continues processing other callbacks!
    }

    void response_callback(
        rclcpp::Client<std_srvs::srv::AddTwoInts>::SharedFuture future)
    {
        auto response = future.get();
        RCLCPP_INFO(get_logger(), "Response received: %ld", response->sum);
    }

    rclcpp::Client<std_srvs::srv::AddTwoInts>::SharedPtr client_;
};
```

**Python Async Client:**

```python
class AsyncClient(Node):
    def __init__(self):
        super().__init__('async_client')
        self.client = self.create_client(AddTwoInts, 'add_two_ints')

        while not self.client.wait_for_service(timeout_sec=1.0):
            self.get_logger().info('Waiting for service...')

        self.send_request(5, 7)

    def send_request(self, a, b):
        request = AddTwoInts.Request()
        request.a = a
        request.b = b

        # Async call
        self.future = self.client.call_async(request)
        self.future.add_done_callback(self.response_callback)

    def response_callback(self, future):
        try:
            response = future.result()
            self.get_logger().info(f'Result: {response.sum}')
        except Exception as e:
            self.get_logger().error(f'Service call failed: {e}')
```

---

### 5. Service Timeouts and Error Handling

**Client-Side Timeout (C++):**

```cpp
auto future = client->async_send_request(request);

// Wait with timeout
auto status = future.wait_for(std::chrono::seconds(5));

if (status == std::future_status::ready) {
    auto response = future.get();
    RCLCPP_INFO(node->get_logger(), "Success: %ld", response->sum);
} else if (status == std::future_status::timeout) {
    RCLCPP_ERROR(node->get_logger(), "Service call timed out");
} else {
    RCLCPP_ERROR(node->get_logger(), "Service call failed");
}
```

**Server-Side Error Reporting:**

```cpp
void handle_compute_path(
    const Request::SharedPtr request,
    Response::SharedPtr response)
{
    try {
        // Attempt computation
        response->path = compute_path(request->start, request->goal);
        response->success = true;
        response->message = "Path computed successfully";

    } catch (const std::exception &e) {
        // Error occurred
        response->success = false;
        response->message = std::string("Failed: ") + e.what();
        response->path = nav_msgs::msg::Path();  // Empty path

        RCLCPP_ERROR(get_logger(), "Path computation failed: %s", e.what());
    }
}
```

**Retry Logic:**

```cpp
auto call_service_with_retry(int max_retries = 3) {
    for (int i = 0; i < max_retries; ++i) {
        auto future = client->async_send_request(request);
        auto status = future.wait_for(5s);

        if (status == std::future_status::ready) {
            return future.get();  // Success
        }

        RCLCPP_WARN(get_logger(), "Retry %d/%d", i+1, max_retries);
        std::this_thread::sleep_for(1s);
    }

    throw std::runtime_error("Service call failed after retries");
}
```

---

### 6. Service Discovery and Introspection

**List Services:**

```bash
ros2 service list
# /add_two_ints
# /node_name/get_parameters
# /node_name/set_parameters
```

**Service Type:**

```bash
ros2 service type /add_two_ints
# std_srvs/srv/AddTwoInts
```

**Service Info:**

```bash
ros2 service info /add_two_ints
# Type: std_srvs/srv/AddTwoInts
# Clients count: 0
# Servers count: 1
```

**Call Service from Command Line:**

```bash
ros2 service call /add_two_ints std_srvs/srv/AddTwoInts "{a: 5, b: 7}"
# waiting for service to become available...
# requester: making request: std_srvs.srv.AddTwoInts_Request(a=5, b=7)
#
# response:
# std_srvs.srv.AddTwoInts_Response(sum=12)
```

**Programmatic Service Discovery (C++):**

```cpp
// Get list of all services
auto service_names = node->get_node_names();

// Check if specific service exists
auto services = node->get_service_names_and_types();
for (const auto& [name, types] : services) {
    if (name == "/add_two_ints") {
        RCLCPP_INFO(node->get_logger(), "Service found: %s", name.c_str());
        for (const auto& type : types) {
            RCLCPP_INFO(node->get_logger(), "  Type: %s", type.c_str());
        }
    }
}
```

---

## EDGE_CASES

### Edge Case 1: Service Server Crashes During Request Processing

**Scenario:**
Server crashes while processing request. Client waits indefinitely.

**Server:**
```cpp
void handle_service(Request::SharedPtr req, Response::SharedPtr res) {
    // Start long computation
    std::this_thread::sleep_for(10s);  // Simulating work

    // CRASH (nullptr deref, segfault, etc.)
    int* bad_ptr = nullptr;
    *bad_ptr = 42;  // CRASH!

    res->success = true;  // Never reached
}
```

**Client:**
```cpp
auto future = client->async_send_request(request);
rclcpp::spin_until_future_complete(node, future);  // Waits forever!
```

**Why:**
- DDS doesn't notify client when server crashes mid-request
- Client has no way to know server died
- Future never completes

**Solution - Client-Side Timeout:**

```cpp
auto future = client->async_send_request(request);

auto status = future.wait_for(5s);  // Timeout after 5 seconds

if (status == std::future_status::ready) {
    auto response = future.get();
    // Process response
} else {
    RCLCPP_ERROR(node->get_logger(),
                 "Service call timed out (server may have crashed)");
    // Handle timeout: retry, fallback, error
}
```

**Interview Insight:**
Always use timeouts for service calls. Server crashes leave clients hanging without timeout.

---

### Edge Case 2: Multiple Servers for Same Service Name

**Scenario:**
Two nodes create servers with same service name.

**Node A:**
```cpp
auto service_a = node_a->create_service<Trigger>(
    "reset",
    handle_reset_a
);
```

**Node B:**
```cpp
auto service_b = node_b->create_service<Trigger>(
    "reset",
    handle_reset_b
);
```

**Client:**
```cpp
auto client = node->create_client<Trigger>("reset");
client->async_send_request(request);  // Which server responds?
```

**Behavior:**

DDS **allows multiple servers** for same service:
- Client request sent to **one random server** (load balancing)
- No guarantee which server responds
- Can change between calls

**Problem:**
- Non-deterministic behavior
- Different servers may have different implementations
- Hard to debug

**Solution 1 - Unique Service Names:**

```cpp
// Node A
auto service_a = node_a->create_service<Trigger>(
    "robot1/reset",  // Unique!
    handle_reset_a
);

// Node B
auto service_b = node_b->create_service<Trigger>(
    "robot2/reset",  // Unique!
    handle_reset_b
);
```

**Solution 2 - Use Namespaces:**

```cpp
// Launch node_a in namespace /robot1
// Service: /robot1/reset

// Launch node_b in namespace /robot2
// Service: /robot2/reset

// Client specifies which:
auto client = node->create_client<Trigger>("/robot1/reset");
```

**Solution 3 - Service Discovery:**

```cpp
// Find all servers for service type
auto services = node->get_service_names_and_types();

int server_count = 0;
for (const auto& [name, types] : services) {
    if (name == "/reset") {
        server_count++;
    }
}

if (server_count > 1) {
    RCLCPP_WARN(node->get_logger(),
                "Multiple servers found for /reset - behavior undefined!");
}
```

**Interview Insight:**
ROS2 allows multiple servers per service name (DDS feature). Always use unique names or namespaces.

---

### Edge Case 3: Service Call from Within Service Callback (Deadlock Risk)

**Scenario:**
Service callback calls another service synchronously.

**Node with Two Services:**

```cpp
class DeadlockNode : public rclcpp::Node {
public:
    DeadlockNode() : Node("deadlock_node") {
        // Both services in same callback group (default: MutuallyExclusive)
        service_a_ = create_service<Trigger>(
            "service_a",
            std::bind(&DeadlockNode::handle_a, this, _1, _2)
        );

        service_b_ = create_service<Trigger>(
            "service_b",
            std::bind(&DeadlockNode::handle_b, this, _1, _2)
        );

        client_b_ = create_client<Trigger>("service_b");
    }

private:
    void handle_a(Request::SharedPtr req, Response::SharedPtr res) {
        RCLCPP_INFO(get_logger(), "Service A called");

        // Call service B synchronously - DEADLOCK!
        auto request_b = std::make_shared<Trigger::Request>();
        auto future = client_b_->async_send_request(request_b);

        // Wait for service B (but it's in same MutuallyExclusive group!)
        rclcpp::spin_until_future_complete(shared_from_this(), future);
        // DEADLOCK: service_b callback can't run while service_a holds the mutex

        res->success = true;
    }

    void handle_b(Request::SharedPtr req, Response::SharedPtr res) {
        RCLCPP_INFO(get_logger(), "Service B called");
        res->success = true;
    }

    rclcpp::Service<Trigger>::SharedPtr service_a_, service_b_;
    rclcpp::Client<Trigger>::SharedPtr client_b_;
};
```

**Why Deadlock:**
1. `service_a` callback runs (holds MutuallyExclusive mutex)
2. Calls `service_b` (same node)
3. `service_b` callback needs mutex (blocked!)
4. `spin_until_future_complete` waits forever

**Solution - Use Separate Callback Groups:**

```cpp
DeadlockNode() : Node("deadlock_node") {
    // Create separate callback groups
    auto group_a = create_callback_group(CallbackGroupType::MutuallyExclusive);
    auto group_b = create_callback_group(CallbackGroupType::MutuallyExclusive);

    service_a_ = create_service<Trigger>(
        "service_a",
        std::bind(&DeadlockNode::handle_a, this, _1, _2),
        rmw_qos_profile_services_default,
        group_a  // Separate group
    );

    service_b_ = create_service<Trigger>(
        "service_b",
        std::bind(&DeadlockNode::handle_b, this, _1, _2),
        rmw_qos_profile_services_default,
        group_b  // Separate group
    );

    client_b_ = create_client<Trigger>("service_b", rmw_qos_profile_services_default, group_a);
}

// Use MultiThreadedExecutor
int main() {
    rclcpp::init(argc, argv);
    auto node = std::make_shared<DeadlockNode>();

    rclcpp::executors::MultiThreadedExecutor executor;
    executor.add_node(node);
    executor.spin();

    rclcpp::shutdown();
}
```

**Interview Insight:**
Service callbacks in same callback group can deadlock when calling other services. Use separate groups + MultiThreadedExecutor.

---

### Edge Case 4: Service Response Modified After Return

**Scenario:**
Service callback returns, but response pointer is retained and modified.

**Wrong:**

```cpp
Response::SharedPtr cached_response_;

void handle_service(Request::SharedPtr req, Response::SharedPtr res) {
    res->value = 42;
    res->message = "Initial";

    cached_response_ = res;  // Keep pointer!

    // Callback returns - response sent to client
}

void some_other_function() {
    // Later, modify cached response
    cached_response_->value = 99;  // BUG: Response already sent!
}
```

**Why It's Wrong:**
- Response is sent when callback **returns**
- Modifying after return has no effect (already sent)
- Can cause confusion (logging shows modified value but client saw original)

**Correct:**

```cpp
void handle_service(Request::SharedPtr req, Response::SharedPtr res) {
    // Do ALL response modification BEFORE returning
    res->value = compute_value();
    res->message = "Computed";

    RCLCPP_INFO(get_logger(), "Sending response: %d", res->value);

    // Response sent when function returns
}  // ← Response sent HERE
```

**Interview Insight:**
Service response is sent when callback returns. All modifications must happen before return.

---

## CODE_EXAMPLES

### Example 1: Path Planning Service

**Service Definition (`srv/PlanPath.srv`):**

```
geometry_msgs/PoseStamped start
geometry_msgs/PoseStamped goal
float32 max_planning_time
---
nav_msgs/Path path
bool success
string message
float32 computation_time
```

**Server Implementation:**

```cpp
#include "rclcpp/rclcpp.hpp"
#include "my_interfaces/srv/plan_path.hpp"
#include <chrono>

class PathPlannerServer : public rclcpp::Node {
public:
    PathPlannerServer() : Node("path_planner_server") {
        service_ = create_service<my_interfaces::srv::PlanPath>(
            "plan_path",
            std::bind(&PathPlannerServer::handle_plan, this, _1, _2)
        );

        RCLCPP_INFO(get_logger(), "Path planning service ready");
    }

private:
    void handle_plan(
        const my_interfaces::srv::PlanPath::Request::SharedPtr request,
        my_interfaces::srv::PlanPath::Response::SharedPtr response)
    {
        using namespace std::chrono;
        auto start_time = steady_clock::now();

        RCLCPP_INFO(get_logger(), "Planning path from (%.2f, %.2f) to (%.2f, %.2f)",
                    request->start.pose.position.x,
                    request->start.pose.position.y,
                    request->goal.pose.position.x,
                    request->goal.pose.position.y);

        try {
            // Simulate path planning
            nav_msgs::msg::Path path;
            path.header.stamp = now();
            path.header.frame_id = "map";

            // Create waypoints (simplified)
            for (int i = 0; i <= 10; ++i) {
                geometry_msgs::msg::PoseStamped pose;
                pose.header = path.header;

                // Linear interpolation
                double t = i / 10.0;
                pose.pose.position.x = request->start.pose.position.x * (1 - t) +
                                       request->goal.pose.position.x * t;
                pose.pose.position.y = request->start.pose.position.y * (1 - t) +
                                       request->goal.pose.position.y * t;

                path.poses.push_back(pose);
            }

            // Compute duration
            auto end_time = steady_clock::now();
            auto duration_ms = duration_cast<milliseconds>(end_time - start_time);

            // Check timeout
            if (duration_ms.count() > request->max_planning_time * 1000) {
                response->success = false;
                response->message = "Planning exceeded time limit";
                return;
            }

            // Success
            response->path = path;
            response->success = true;
            response->message = "Path computed successfully";
            response->computation_time = duration_ms.count() / 1000.0f;

            RCLCPP_INFO(get_logger(), "Path computed: %zu waypoints in %.3f s",
                        path.poses.size(), response->computation_time);

        } catch (const std::exception &e) {
            response->success = false;
            response->message = std::string("Planning failed: ") + e.what();

            RCLCPP_ERROR(get_logger(), "%s", response->message.c_str());
        }
    }

    rclcpp::Service<my_interfaces::srv::PlanPath>::SharedPtr service_;
};

int main(int argc, char **argv) {
    rclcpp::init(argc, argv);
    rclcpp::spin(std::make_shared<PathPlannerServer>());
    rclcpp::shutdown();
    return 0;
}
```

**Client Implementation:**

```cpp
class PathPlannerClient : public rclcpp::Node {
public:
    PathPlannerClient() : Node("path_planner_client") {
        client_ = create_client<my_interfaces::srv::PlanPath>("plan_path");

        // Wait for service
        while (!client_->wait_for_service(1s)) {
            if (!rclcpp::ok()) {
                RCLCPP_ERROR(get_logger(), "Interrupted");
                return;
            }
            RCLCPP_INFO(get_logger(), "Waiting for path planning service...");
        }

        request_path();
    }

private:
    void request_path() {
        auto request = std::make_shared<my_interfaces::srv::PlanPath::Request>();

        // Set start pose
        request->start.header.frame_id = "map";
        request->start.pose.position.x = 0.0;
        request->start.pose.position.y = 0.0;

        // Set goal pose
        request->goal.header.frame_id = "map";
        request->goal.pose.position.x = 10.0;
        request->goal.pose.position.y = 5.0;

        request->max_planning_time = 5.0;  // 5 seconds max

        // Async call with callback
        auto future = client_->async_send_request(request,
            std::bind(&PathPlannerClient::response_callback, this, _1));

        RCLCPP_INFO(get_logger(), "Path planning request sent");
    }

    void response_callback(
        rclcpp::Client<my_interfaces::srv::PlanPath>::SharedFuture future)
    {
        auto response = future.get();

        if (response->success) {
            RCLCPP_INFO(get_logger(),
                        "Path received: %zu waypoints, computed in %.3f s",
                        response->path.poses.size(),
                        response->computation_time);

            // Use path...
            execute_path(response->path);

        } else {
            RCLCPP_ERROR(get_logger(), "Planning failed: %s",
                         response->message.c_str());
        }
    }

    void execute_path(const nav_msgs::msg::Path &path) {
        RCLCPP_INFO(get_logger(), "Executing path with %zu waypoints",
                    path.poses.size());
        // Execute path...
    }

    rclcpp::Client<my_interfaces::srv::PlanPath>::SharedPtr client_;
};
```

---

## INTERVIEW_QA

### Q1: What's the difference between a service and a topic?

**Difficulty:** ⭐⭐ (Easy)

**Answer:**

| Aspect | Topic | Service |
|--------|-------|---------|
| **Communication** | Publish-Subscribe | Request-Response |
| **Pattern** | One-to-many | One-to-one |
| **Blocking** | Non-blocking | Can block (sync) |
| **Direction** | Unidirectional | Bidirectional |
| **Frequency** | High (continuous data) | Low (occasional requests) |
| **Guarantee** | Best effort | Waits for response |

**Examples:**

- **Topic**: Sensor data, telemetry, robot odometry
- **Service**: Trigger action, get state, perform computation

**Interview Insight:**
Use topics for continuous data streams, services for request-response interactions.

---

### Q2: What happens if a service client calls a service but no server is running?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

**Client blocks indefinitely** (if using `spin_until_future_complete`).

```cpp
auto client = node->create_client<Trigger>("nonexistent_service");

auto request = std::make_shared<Trigger::Request>();
auto future = client->async_send_request(request);

// No server → waits forever!
rclcpp::spin_until_future_complete(node, future);
```

**Solutions:**

**1. Wait for service before calling:**

```cpp
if (!client->wait_for_service(5s)) {
    RCLCPP_ERROR(node->get_logger(), "Service not available");
    return;
}

auto future = client->async_send_request(request);
rclcpp::spin_until_future_complete(node, future);
```

**2. Use timeout:**

```cpp
auto future = client->async_send_request(request);

if (future.wait_for(5s) == std::future_status::ready) {
    auto response = future.get();
    // Process response
} else {
    RCLCPP_ERROR(node->get_logger(), "Service call timed out");
}
```

**Interview Insight:**
Always wait for service availability or use timeouts. Missing server leaves client hanging.

---

### Q3: Can service callbacks run concurrently?

**Difficulty:** ⭐⭐⭐⭐ (Hard)

**Answer:**

**Depends on executor and callback groups.**

**With SingleThreadedExecutor:**
- **NO** - All callbacks sequential

**With MultiThreadedExecutor + default callback group:**
- **NO** - Default group is MutuallyExclusive

**With MultiThreadedExecutor + Reentrant callback group:**
- **YES** - Can run concurrently

**Example:**

```cpp
class ServiceNode : public rclcpp::Node {
public:
    ServiceNode() : Node("service_node") {
        // Create Reentrant callback group
        auto group = create_callback_group(CallbackGroupType::Reentrant);

        service_ = create_service<Trigger>(
            "my_service",
            std::bind(&ServiceNode::handle, this, _1, _2),
            rmw_qos_profile_services_default,
            group  // Reentrant!
        );
    }

private:
    void handle(Request::SharedPtr req, Response::SharedPtr res) {
        // Multiple instances of this callback CAN run simultaneously
        RCLCPP_INFO(get_logger(), "Handling request (thread: %ld)",
                    std::this_thread::get_id());

        std::this_thread::sleep_for(2s);  // Slow processing

        res->success = true;
    }
};

// Must use MultiThreadedExecutor
int main() {
    rclcpp::init(argc, argv);
    auto node = std::make_shared<ServiceNode>();

    rclcpp::executors::MultiThreadedExecutor executor(
        rclcpp::ExecutorOptions(), 4  // 4 threads
    );
    executor.add_node(node);
    executor.spin();
}
```

**Race Conditions:**

```cpp
// UNSAFE with Reentrant group!
int request_count_ = 0;

void handle(Request::SharedPtr req, Response::SharedPtr res) {
    request_count_++;  // Race condition!
    res->count = request_count_;
}

// SAFE: Use mutex
std::mutex mutex_;
int request_count_ = 0;

void handle(Request::SharedPtr req, Response::SharedPtr res) {
    std::lock_guard<std::mutex> lock(mutex_);
    request_count_++;
    res->count = request_count_;
}
```

**Interview Insight:**
Service callbacks can run concurrently with Reentrant group + MultiThreadedExecutor. Must use mutexes to protect shared state.

---

### Q4: How do you handle service timeouts?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

**Use `future.wait_for()` with timeout:**

```cpp
auto future = client->async_send_request(request);

// Wait up to 5 seconds
auto status = future.wait_for(std::chrono::seconds(5));

if (status == std::future_status::ready) {
    auto response = future.get();
    RCLCPP_INFO(node->get_logger(), "Success");

} else if (status == std::future_status::timeout) {
    RCLCPP_ERROR(node->get_logger(), "Service call timed out");
    // Handle timeout: retry, use default, error out

} else {
    // future_status::deferred (shouldn't happen)
    RCLCPP_ERROR(node->get_logger(), "Unexpected future state");
}
```

**With Retry Logic:**

```cpp
auto call_with_retry(int max_retries = 3, std::chrono::seconds timeout = 5s) {
    for (int i = 0; i < max_retries; ++i) {
        auto future = client->async_send_request(request);

        if (future.wait_for(timeout) == std::future_status::ready) {
            return future.get();  // Success
        }

        RCLCPP_WARN(node->get_logger(), "Retry %d/%d", i + 1, max_retries);
        std::this_thread::sleep_for(1s);
    }

    throw std::runtime_error("Service call failed after retries");
}
```

**Interview Insight:**
Always use timeouts for service calls. Prevents hanging when server crashes or is slow.

---

### Q5: What are the built-in ROS2 services every node has?

**Difficulty:** ⭐⭐ (Easy)

**Answer:**

**Every ROS2 node automatically provides these services:**

```bash
ros2 service list
# /my_node/describe_parameters
# /my_node/get_parameter_types
# /my_node/get_parameters
# /my_node/list_parameters
# /my_node/set_parameters
# /my_node/set_parameters_atomically
```

**Purpose:**

| Service | Purpose |
|---------|---------|
| `list_parameters` | Get list of all parameters |
| `get_parameters` | Get values of specific parameters |
| `set_parameters` | Set parameter values |
| `describe_parameters` | Get parameter descriptions |

**Example Usage:**

```bash
# List all parameters of node
ros2 service call /my_node/list_parameters rcl_interfaces/srv/ListParameters

# Get parameter value
ros2 param get /my_node my_param

# Set parameter (uses service under the hood)
ros2 param set /my_node my_param 42
```

**Interview Insight:**
Parameter services are built-in to every node. Enables runtime parameter introspection and modification.

---

## PRACTICE_TASKS

### Task 1: Image Processing Service

Create service that:
- Request: `sensor_msgs/Image`, processing algorithm name
- Response: Processed image, processing time, success status

**Requirements:**
- Support multiple algorithms (blur, edge, threshold)
- Timeout if processing exceeds 5 seconds
- Error handling for invalid algorithm

---

### Task 2: Service Call Chain

Create three services:
- `ServiceA` → calls `ServiceB` → calls `ServiceC`
- Avoid deadlocks
- Proper error propagation

**Requirements:**
- Use separate callback groups
- Multi-threaded executor
- Handle failures at any stage

---

### Task 3: Robust Service Client

Implement client with:
- Automatic retry (3 attempts)
- Exponential backoff
- Timeout handling
- Service availability check

**Requirements:**
- Configurable retry parameters
- Detailed logging
- Graceful degradation

---

## QUICK_REFERENCE

### Service vs Topic

| Use Case | Choose |
|----------|--------|
| Continuous data | Topic |
| Request-response | Service |
| One-way notification | Topic |
| Computation on demand | Service |

### Service Client Patterns

```cpp
// Synchronous
auto future = client->async_send_request(request);
rclcpp::spin_until_future_complete(node, future);
auto response = future.get();

// Asynchronous
client->async_send_request(request, callback);

// With timeout
if (future.wait_for(5s) == std::future_status::ready) {
    auto response = future.get();
}
```

### Common Service Types

```cpp
std_srvs/srv/Trigger       // No request, bool success response
std_srvs/srv/SetBool       // Bool request, bool success response
std_srvs/srv/Empty         // No request, no response
```

---

**END OF TOPIC 2.2**
