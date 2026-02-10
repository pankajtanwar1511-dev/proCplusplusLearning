# Topic 2.3: Actions

## THEORY_SECTION

### 1. Action Fundamentals

**What is an Action?**

An action implements **goal-feedback-result** communication for **long-running tasks**:
- **Goal**: Client sends goal to server
- **Feedback**: Server periodically sends progress updates
- **Result**: Server sends final result when complete
- **Cancel**: Client can cancel goal mid-execution

**Action = Service + Topic Hybrid:**

```
Action components (under the hood):
- Goal service (send goal)
- Result service (get result)
- Feedback topic (stream progress)
- Cancel service (cancel goal)
- Status topic (goal state updates)
```

**When to Use Actions:**

| Pattern | Use When | Example |
|---------|----------|---------|
| **Topic** | Continuous data, no response | Sensor data |
| **Service** | Quick request-response | Get current pose |
| **Action** | Long task with feedback | Navigate to goal, pick object |

**Action vs Service:**

| Aspect | Service | Action |
|--------|---------|--------|
| **Duration** | Short (< 1s) | Long (seconds to minutes) |
| **Feedback** | None | Periodic progress updates |
| **Cancellation** | Not supported | Can cancel mid-execution |
| **Preemption** | N/A | Can accept new goal, cancel old |
| **State** | None | Goal has lifecycle (pending → active → succeeded/aborted) |

**Real-World Examples:**

- **Navigation**: Drive to goal (feedback: distance remaining, ETA)
- **Pick and place**: Grasp object (feedback: gripper position, force)
- **Image processing**: Batch process images (feedback: images processed)
- **Trajectory execution**: Follow path (feedback: current waypoint)

---

### 2. Action Definition (.action Files)

**Structure:**

```
# Goal
<goal_fields>
---
# Result
<result_fields>
---
# Feedback
<feedback_fields>
```

**Example: Fibonacci Action:**

**File: `action/Fibonacci.action`**

```
# Goal
int32 order
---
# Result
int32[] sequence
---
# Feedback
int32[] partial_sequence
```

**Example: Navigation Action:**

**File: `action/NavigateToGoal.action`**

```
# Goal
geometry_msgs/PoseStamped target_pose
float32 max_speed
---
# Result
bool success
string message
float32 total_distance
float32 total_time
---
# Feedback
geometry_msgs/PoseStamped current_pose
float32 distance_remaining
float32 estimated_time_remaining
```

**Built-in Action Types:**

ROS2 provides standard action types:

| Action | Package | Purpose |
|--------|---------|---------|
| `FollowJointTrajectory` | `control_msgs` | Execute robot trajectory |
| `NavigateToPose` | `nav2_msgs` | Navigate to pose |
| `Fibonacci` | `action_tutorials_interfaces` | Tutorial example |

---

### 3. Creating Custom Action

**1. Create action package:**

```
my_action_interfaces/
├── package.xml
├── CMakeLists.txt
└── action/
    └── ProcessImages.action
```

**2. Define action (`action/ProcessImages.action`):**

```
# Goal
string[] image_paths
string algorithm  # "blur", "edge", "threshold"
---
# Result
string[] output_paths
int32 images_processed
float32 total_time
bool success
string message
---
# Feedback
int32 current_index
string current_image
float32 progress_percent
```

**3. package.xml:**

```xml
<build_depend>rosidl_default_generators</build_depend>
<exec_depend>rosidl_default_runtime</exec_depend>
<member_of_group>rosidl_interface_packages</member_of_group>

<depend>geometry_msgs</depend>
<depend>std_msgs</depend>
```

**4. CMakeLists.txt:**

```cmake
find_package(rosidl_default_generators REQUIRED)
find_package(geometry_msgs REQUIRED)

rosidl_generate_interfaces(${PROJECT_NAME}
  "action/ProcessImages.action"
  DEPENDENCIES geometry_msgs
)
```

**5. Build and verify:**

```bash
colcon build --packages-select my_action_interfaces
source install/setup.bash

ros2 interface list | grep ProcessImages
# my_action_interfaces/action/ProcessImages

ros2 interface show my_action_interfaces/action/ProcessImages
```

---

### 4. Action Server Implementation

**C++ Action Server:**

```cpp
#include "rclcpp/rclcpp.hpp"
#include "rclcpp_action/rclcpp_action.hpp"
#include "action_tutorials_interfaces/action/fibonacci.hpp"

using Fibonacci = action_tutorials_interfaces::action::Fibonacci;
using GoalHandleFibonacci = rclcpp_action::ServerGoalHandle<Fibonacci>;

class FibonacciActionServer : public rclcpp::Node {
public:
    FibonacciActionServer() : Node("fibonacci_server") {
        using namespace std::placeholders;

        action_server_ = rclcpp_action::create_server<Fibonacci>(
            this,
            "fibonacci",
            std::bind(&FibonacciActionServer::handle_goal, this, _1, _2),
            std::bind(&FibonacciActionServer::handle_cancel, this, _1),
            std::bind(&FibonacciActionServer::handle_accepted, this, _1)
        );

        RCLCPP_INFO(get_logger(), "Fibonacci action server ready");
    }

private:
    // Called when new goal received
    rclcpp_action::GoalResponse handle_goal(
        const rclcpp_action::GoalUUID & uuid,
        std::shared_ptr<const Fibonacci::Goal> goal)
    {
        RCLCPP_INFO(get_logger(), "Received goal request: order %d", goal->order);

        // Validate goal
        if (goal->order < 0) {
            RCLCPP_WARN(get_logger(), "Rejecting negative order");
            return rclcpp_action::GoalResponse::REJECT;
        }

        if (goal->order > 46) {  // Fibonacci(47) overflows int32
            RCLCPP_WARN(get_logger(), "Rejecting order > 46 (overflow)");
            return rclcpp_action::GoalResponse::REJECT;
        }

        return rclcpp_action::GoalResponse::ACCEPT_AND_EXECUTE;
    }

    // Called when client requests cancellation
    rclcpp_action::CancelResponse handle_cancel(
        const std::shared_ptr<GoalHandleFibonacci> goal_handle)
    {
        RCLCPP_INFO(get_logger(), "Received request to cancel goal");
        return rclcpp_action::CancelResponse::ACCEPT;
    }

    // Called when goal accepted - start execution
    void handle_accepted(const std::shared_ptr<GoalHandleFibonacci> goal_handle) {
        // Execute in separate thread (don't block executor)
        std::thread{std::bind(&FibonacciActionServer::execute, this, _1), goal_handle}.detach();
    }

    // Execute the action
    void execute(const std::shared_ptr<GoalHandleFibonacci> goal_handle) {
        RCLCPP_INFO(get_logger(), "Executing goal");

        const auto goal = goal_handle->get_goal();
        auto feedback = std::make_shared<Fibonacci::Feedback>();
        auto result = std::make_shared<Fibonacci::Result>();

        // Initialize sequence
        feedback->partial_sequence.push_back(0);
        feedback->partial_sequence.push_back(1);

        // Compute Fibonacci sequence
        for (int i = 1; i < goal->order; ++i) {
            // Check if goal was canceled
            if (goal_handle->is_canceling()) {
                result->sequence = feedback->partial_sequence;
                goal_handle->canceled(result);
                RCLCPP_INFO(get_logger(), "Goal canceled");
                return;
            }

            // Compute next number
            feedback->partial_sequence.push_back(
                feedback->partial_sequence[i] + feedback->partial_sequence[i - 1]
            );

            // Publish feedback
            goal_handle->publish_feedback(feedback);
            RCLCPP_INFO(get_logger(), "Publishing feedback");

            // Simulate work
            std::this_thread::sleep_for(std::chrono::seconds(1));
        }

        // Check for final cancellation
        if (goal_handle->is_canceling()) {
            result->sequence = feedback->partial_sequence;
            goal_handle->canceled(result);
            return;
        }

        // Success - send result
        result->sequence = feedback->partial_sequence;
        goal_handle->succeed(result);
        RCLCPP_INFO(get_logger(), "Goal succeeded");
    }

    rclcpp_action::Server<Fibonacci>::SharedPtr action_server_;
};

int main(int argc, char **argv) {
    rclcpp::init(argc, argv);
    auto node = std::make_shared<FibonacciActionServer>();
    rclcpp::spin(node);
    rclcpp::shutdown();
    return 0;
}
```

**Key Methods:**

| Method | Purpose | Return Values |
|--------|---------|---------------|
| `handle_goal()` | Decide to accept/reject goal | `ACCEPT_AND_EXECUTE`, `REJECT` |
| `handle_cancel()` | Decide to accept/reject cancel | `ACCEPT`, `REJECT` |
| `handle_accepted()` | Goal accepted, start execution | void (spawn thread) |
| `execute()` | Main execution loop | Calls `succeed()`, `abort()`, or `canceled()` |

**Goal Handle Methods:**

```cpp
goal_handle->publish_feedback(feedback);  // Send feedback
goal_handle->is_canceling();              // Check if canceled
goal_handle->succeed(result);             // Mark as succeeded
goal_handle->abort(result);               // Mark as aborted (error)
goal_handle->canceled(result);            // Mark as canceled
```

---

### 5. Action Client Implementation

**C++ Async Action Client:**

```cpp
#include "rclcpp/rclcpp.hpp"
#include "rclcpp_action/rclcpp_action.hpp"
#include "action_tutorials_interfaces/action/fibonacci.hpp"

using Fibonacci = action_tutorials_interfaces::action::Fibonacci;
using GoalHandleFibonacci = rclcpp_action::ClientGoalHandle<Fibonacci>;

class FibonacciActionClient : public rclcpp::Node {
public:
    FibonacciActionClient() : Node("fibonacci_client") {
        action_client_ = rclcpp_action::create_client<Fibonacci>(this, "fibonacci");

        // Wait for action server
        if (!action_client_->wait_for_action_server(std::chrono::seconds(10))) {
            RCLCPP_ERROR(get_logger(), "Action server not available");
            rclcpp::shutdown();
            return;
        }

        send_goal(10);
    }

private:
    void send_goal(int order) {
        using namespace std::placeholders;

        auto goal_msg = Fibonacci::Goal();
        goal_msg.order = order;

        auto send_goal_options = rclcpp_action::Client<Fibonacci>::SendGoalOptions();

        // Callback when goal accepted/rejected
        send_goal_options.goal_response_callback =
            std::bind(&FibonacciActionClient::goal_response_callback, this, _1);

        // Callback for feedback
        send_goal_options.feedback_callback =
            std::bind(&FibonacciActionClient::feedback_callback, this, _1, _2);

        // Callback for result
        send_goal_options.result_callback =
            std::bind(&FibonacciActionClient::result_callback, this, _1);

        RCLCPP_INFO(get_logger(), "Sending goal: %d", order);
        action_client_->async_send_goal(goal_msg, send_goal_options);
    }

    void goal_response_callback(const GoalHandleFibonacci::SharedPtr & goal_handle) {
        if (!goal_handle) {
            RCLCPP_ERROR(get_logger(), "Goal was rejected by server");
        } else {
            RCLCPP_INFO(get_logger(), "Goal accepted by server, waiting for result");
        }
    }

    void feedback_callback(
        GoalHandleFibonacci::SharedPtr,
        const std::shared_ptr<const Fibonacci::Feedback> feedback)
    {
        RCLCPP_INFO(get_logger(), "Received feedback: ");
        for (auto num : feedback->partial_sequence) {
            RCLCPP_INFO(get_logger(), "  %d", num);
        }
    }

    void result_callback(const GoalHandleFibonacci::WrappedResult & result) {
        switch (result.code) {
            case rclcpp_action::ResultCode::SUCCEEDED:
                RCLCPP_INFO(get_logger(), "Goal succeeded!");
                break;
            case rclcpp_action::ResultCode::ABORTED:
                RCLCPP_ERROR(get_logger(), "Goal was aborted");
                return;
            case rclcpp_action::ResultCode::CANCELED:
                RCLCPP_WARN(get_logger(), "Goal was canceled");
                return;
            default:
                RCLCPP_ERROR(get_logger(), "Unknown result code");
                return;
        }

        RCLCPP_INFO(get_logger(), "Final sequence:");
        for (auto num : result.result->sequence) {
            RCLCPP_INFO(get_logger(), "  %d", num);
        }

        rclcpp::shutdown();
    }

    rclcpp_action::Client<Fibonacci>::SharedPtr action_client_;
};

int main(int argc, char **argv) {
    rclcpp::init(argc, argv);
    auto node = std::make_shared<FibonacciActionClient>();
    rclcpp::spin(node);
    return 0;
}
```

**Canceling Goal:**

```cpp
void cancel_goal() {
    if (goal_handle_) {
        auto future = action_client_->async_cancel_goal(goal_handle_);

        auto result = future.get();
        if (result == rclcpp_action::CancelResponse::ACCEPT) {
            RCLCPP_INFO(get_logger(), "Goal cancellation accepted");
        } else {
            RCLCPP_WARN(get_logger(), "Goal cancellation rejected");
        }
    }
}
```

---

### 6. Goal State Machine

**Goal Lifecycle:**

```
                    ┌──────────┐
                    │ UNKNOWN  │
                    └────┬─────┘
                         │ send_goal()
                    ┌────▼─────┐
                    │ PENDING  │ (queued)
                    └────┬─────┘
                         │ server starts execution
                    ┌────▼─────┐
                    │  ACTIVE  │ (executing)
                    └────┬─────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    ┌────▼────┐    ┌─────▼─────┐  ┌─────▼──────┐
    │SUCCEEDED│    │  ABORTED  │  │  CANCELED  │
    └─────────┘    └───────────┘  └────────────┘
```

**States:**

| State | Meaning |
|-------|---------|
| **UNKNOWN** | Initial state |
| **PENDING** | Goal accepted, waiting to start |
| **ACTIVE** | Goal executing |
| **SUCCEEDED** | Goal completed successfully |
| **ABORTED** | Goal failed (error) |
| **CANCELED** | Goal canceled by client |

**Result Codes:**

```cpp
enum class ResultCode {
    UNKNOWN,
    SUCCEEDED,  // ✓ Success
    CANCELED,   // ✗ Client canceled
    ABORTED     // ✗ Server error
};
```

**Checking Goal Status (Client):**

```cpp
auto status = goal_handle->get_status();

switch (status) {
    case rclcpp_action::GoalStatus::STATUS_ACCEPTED:
        RCLCPP_INFO(get_logger(), "Goal accepted");
        break;
    case rclcpp_action::GoalStatus::STATUS_EXECUTING:
        RCLCPP_INFO(get_logger(), "Goal executing");
        break;
    case rclcpp_action::GoalStatus::STATUS_SUCCEEDED:
        RCLCPP_INFO(get_logger(), "Goal succeeded");
        break;
    // ...
}
```

---

## EDGE_CASES

### Edge Case 1: Multiple Goals Sent Simultaneously

**Scenario:**
Client sends multiple goals before first completes.

**Default Behavior:**

Action server can handle **multiple goals concurrently** unless explicitly configured otherwise.

```cpp
// Client sends 3 goals rapidly
client->async_send_goal(goal1);
client->async_send_goal(goal2);
client->async_send_goal(goal3);

// Server receives all 3, executes concurrently (if multi-threaded)
```

**Problem:**
- Server may not support concurrent execution
- Resources might be shared (e.g., robot arm can't execute two trajectories simultaneously)

**Solution 1 - Single Goal Server (Reject New Goals):**

```cpp
std::shared_ptr<GoalHandleFibonacci> active_goal_;

rclcpp_action::GoalResponse handle_goal(...) {
    if (active_goal_ && active_goal_->is_active()) {
        RCLCPP_WARN(get_logger(), "Rejecting new goal, already executing");
        return rclcpp_action::GoalResponse::REJECT;
    }

    return rclcpp_action::GoalResponse::ACCEPT_AND_EXECUTE;
}

void handle_accepted(std::shared_ptr<GoalHandleFibonacci> goal_handle) {
    active_goal_ = goal_handle;
    // Execute...
}
```

**Solution 2 - Preemption (Cancel Old, Accept New):**

```cpp
std::shared_ptr<GoalHandleFibonacci> active_goal_;

rclcpp_action::GoalResponse handle_goal(...) {
    if (active_goal_ && active_goal_->is_active()) {
        RCLCPP_INFO(get_logger(), "Canceling previous goal, accepting new");
        auto result = std::make_shared<Fibonacci::Result>();
        active_goal_->canceled(result);  // Cancel old goal
    }

    return rclcpp_action::GoalResponse::ACCEPT_AND_EXECUTE;
}
```

**Solution 3 - Queue Goals:**

```cpp
std::queue<std::shared_ptr<GoalHandleFibonacci>> goal_queue_;

rclcpp_action::GoalResponse handle_goal(...) {
    return rclcpp_action::GoalResponse::ACCEPT_AND_DEFER;  // Queue it
}

void handle_accepted(std::shared_ptr<GoalHandleFibonacci> goal_handle) {
    goal_queue_.push(goal_handle);
    if (goal_queue_.size() == 1) {
        execute_next_goal();  // Start if queue was empty
    }
}

void execute_next_goal() {
    if (goal_queue_.empty()) return;

    auto goal = goal_queue_.front();
    // Execute goal...
    goal->succeed(result);
    goal_queue_.pop();

    execute_next_goal();  // Process next
}
```

**Interview Insight:**
Action servers must decide how to handle multiple goals: reject, preempt, or queue. Default is concurrent execution.

---

### Edge Case 2: Client Disconnects While Goal Executing

**Scenario:**
Client sends goal, then crashes/disconnects. Server keeps executing.

**Server:**
```cpp
void execute(std::shared_ptr<GoalHandleFibonacci> goal_handle) {
    for (int i = 0; i < 100; ++i) {
        // Publish feedback
        goal_handle->publish_feedback(feedback);  // Client disconnected!

        std::this_thread::sleep_for(1s);
    }

    goal_handle->succeed(result);  // No one listening!
}
```

**Behavior:**
- Server **continues execution** even if client disconnected
- Feedback published to empty topic
- Result sent but no one receives it
- Wastes resources

**Solution - Detect Client Disconnect:**

ROS2 doesn't have built-in client disconnect detection. Workarounds:

**Option 1: Client Heartbeat:**

```cpp
// Client sends periodic "I'm alive" messages
rclcpp::TimerBase::SharedPtr heartbeat_timer_;

heartbeat_timer_ = create_wall_timer(1s, [this]() {
    auto msg = std_msgs::msg::Bool();
    msg.data = true;
    heartbeat_pub_->publish(msg);
});

// Server checks heartbeat
rclcpp::Time last_heartbeat_;

void heartbeat_callback(...) {
    last_heartbeat_ = now();
}

void execute(std::shared_ptr<GoalHandleFibonacci> goal_handle) {
    while (executing) {
        if ((now() - last_heartbeat_).seconds() > 5.0) {
            RCLCPP_WARN(get_logger(), "Client disconnected, aborting goal");
            goal_handle->abort(result);
            return;
        }

        // Continue execution...
    }
}
```

**Option 2: Timeout:**

```cpp
void execute(std::shared_ptr<GoalHandleFibonacci> goal_handle) {
    auto start_time = std::chrono::steady_clock::now();
    auto max_duration = std::chrono::minutes(5);

    while (executing) {
        auto elapsed = std::chrono::steady_clock::now() - start_time;
        if (elapsed > max_duration) {
            RCLCPP_ERROR(get_logger(), "Goal execution timeout");
            goal_handle->abort(result);
            return;
        }

        // Continue execution...
    }
}
```

**Interview Insight:**
Action servers don't automatically detect client disconnect. Implement timeouts or heartbeat for long-running tasks.

---

### Edge Case 3: Server Crashes Mid-Execution

**Scenario:**
Server crashes while executing action. Client waits forever.

**Client:**
```cpp
auto future = action_client_->async_send_goal(goal);
// Server crashes here!

rclcpp::spin();  // Waits forever, no result callback
```

**Why:**
- DDS doesn't notify client when server crashes
- Result callback never called
- Client hangs

**Solution - Client-Side Timeout:**

```cpp
auto future = action_client_->async_send_goal(goal, options);

// Wait with timeout
auto spin_result = rclcpp::spin_until_future_complete(
    node,
    future,
    std::chrono::seconds(5)  // Timeout
);

if (spin_result == rclcpp::FutureReturnCode::TIMEOUT) {
    RCLCPP_ERROR(node->get_logger(), "Goal acceptance timed out");
    // Handle timeout: retry, error, fallback
}

// For result, use timer to check periodically
auto result_timer = create_wall_timer(10s, [this]() {
    if (!result_received_) {
        RCLCPP_ERROR(get_logger(), "Result timeout, server may have crashed");
        cancel_goal();
    }
});
```

**Robust Pattern:**

```cpp
class RobustActionClient : public rclcpp::Node {
    void send_goal_with_timeout(Goal goal, std::chrono::seconds timeout) {
        auto future = action_client_->async_send_goal(goal, options);

        // Start watchdog timer
        result_timeout_timer_ = create_wall_timer(timeout, [this]() {
            if (!result_received_) {
                RCLCPP_ERROR(get_logger(), "Action timeout - server unresponsive");
                on_timeout();
            }
        });
    }

    void result_callback(const WrappedResult &result) {
        result_received_ = true;
        result_timeout_timer_->cancel();  // Stop watchdog

        // Process result...
    }

    void on_timeout() {
        // Cleanup, retry, or error handling
    }

    rclcpp::TimerBase::SharedPtr result_timeout_timer_;
    bool result_received_ = false;
};
```

**Interview Insight:**
Always implement client-side timeouts for action goals. Server crashes leave client hanging without timeout.

---

## CODE_EXAMPLES

### Example 1: Image Processing Action Server

**Action Definition (`action/ProcessImages.action`):**

```
string[] image_paths
string algorithm
---
string[] output_paths
int32 images_processed
float32 total_time
bool success
string message
---
int32 current_index
string current_image_path
float32 progress_percent
```

**Server Implementation:**

```cpp
#include "rclcpp/rclcpp.hpp"
#include "rclcpp_action/rclcpp_action.hpp"
#include "my_interfaces/action/process_images.hpp"
#include <opencv2/opencv.hpp>

using ProcessImages = my_interfaces::action::ProcessImages;
using GoalHandle = rclcpp_action::ServerGoalHandle<ProcessImages>;

class ImageProcessorServer : public rclcpp::Node {
public:
    ImageProcessorServer() : Node("image_processor_server") {
        action_server_ = rclcpp_action::create_server<ProcessImages>(
            this, "process_images",
            std::bind(&ImageProcessorServer::handle_goal, this, _1, _2),
            std::bind(&ImageProcessorServer::handle_cancel, this, _1),
            std::bind(&ImageProcessorServer::handle_accepted, this, _1)
        );

        RCLCPP_INFO(get_logger(), "Image processing action server ready");
    }

private:
    rclcpp_action::GoalResponse handle_goal(
        const rclcpp_action::GoalUUID & uuid,
        std::shared_ptr<const ProcessImages::Goal> goal)
    {
        RCLCPP_INFO(get_logger(),
                    "Received request to process %zu images with algorithm '%s'",
                    goal->image_paths.size(),
                    goal->algorithm.c_str());

        // Validate algorithm
        if (goal->algorithm != "blur" &&
            goal->algorithm != "edge" &&
            goal->algorithm != "threshold")
        {
            RCLCPP_WARN(get_logger(), "Unknown algorithm '%s', rejecting",
                        goal->algorithm.c_str());
            return rclcpp_action::GoalResponse::REJECT;
        }

        return rclcpp_action::GoalResponse::ACCEPT_AND_EXECUTE;
    }

    rclcpp_action::CancelResponse handle_cancel(
        const std::shared_ptr<GoalHandle> goal_handle)
    {
        RCLCPP_INFO(get_logger(), "Received cancel request");
        return rclcpp_action::CancelResponse::ACCEPT;
    }

    void handle_accepted(const std::shared_ptr<GoalHandle> goal_handle) {
        std::thread{std::bind(&ImageProcessorServer::execute, this, _1), goal_handle}.detach();
    }

    void execute(const std::shared_ptr<GoalHandle> goal_handle) {
        auto start_time = std::chrono::steady_clock::now();

        const auto goal = goal_handle->get_goal();
        auto feedback = std::make_shared<ProcessImages::Feedback>();
        auto result = std::make_shared<ProcessImages::Result>();

        RCLCPP_INFO(get_logger(), "Starting image processing");

        for (size_t i = 0; i < goal->image_paths.size(); ++i) {
            // Check cancellation
            if (goal_handle->is_canceling()) {
                result->success = false;
                result->message = "Processing canceled";
                result->images_processed = i;
                goal_handle->canceled(result);
                RCLCPP_INFO(get_logger(), "Goal canceled after %zu images", i);
                return;
            }

            const auto& input_path = goal->image_paths[i];
            RCLCPP_INFO(get_logger(), "Processing image %zu/%zu: %s",
                        i + 1, goal->image_paths.size(), input_path.c_str());

            try {
                // Load image
                cv::Mat image = cv::imread(input_path);
                if (image.empty()) {
                    throw std::runtime_error("Failed to load image");
                }

                // Process based on algorithm
                cv::Mat processed;
                if (goal->algorithm == "blur") {
                    cv::GaussianBlur(image, processed, cv::Size(15, 15), 0);
                } else if (goal->algorithm == "edge") {
                    cv::Canny(image, processed, 50, 150);
                } else if (goal->algorithm == "threshold") {
                    cv::cvtColor(image, processed, cv::COLOR_BGR2GRAY);
                    cv::threshold(processed, processed, 128, 255, cv::THRESH_BINARY);
                }

                // Save output
                std::string output_path = "/tmp/processed_" + std::to_string(i) + ".jpg";
                cv::imwrite(output_path, processed);
                result->output_paths.push_back(output_path);

            } catch (const std::exception &e) {
                result->success = false;
                result->message = std::string("Error: ") + e.what();
                result->images_processed = i;
                goal_handle->abort(result);
                RCLCPP_ERROR(get_logger(), "Processing aborted: %s", e.what());
                return;
            }

            // Publish feedback
            feedback->current_index = i;
            feedback->current_image_path = input_path;
            feedback->progress_percent = ((i + 1) * 100.0f) / goal->image_paths.size();
            goal_handle->publish_feedback(feedback);
        }

        // Success
        auto end_time = std::chrono::steady_clock::now();
        auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(
            end_time - start_time
        );

        result->success = true;
        result->message = "All images processed successfully";
        result->images_processed = goal->image_paths.size();
        result->total_time = duration.count() / 1000.0f;

        goal_handle->succeed(result);
        RCLCPP_INFO(get_logger(),
                    "Goal succeeded: %zu images in %.2f seconds",
                    result->images_processed,
                    result->total_time);
    }

    rclcpp_action::Server<ProcessImages>::SharedPtr action_server_;
};
```

---

## INTERVIEW_QA

### Q1: What's the difference between an action and a service?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

| Aspect | Service | Action |
|--------|---------|--------|
| **Duration** | Short (< 1s typically) | Long (seconds to minutes) |
| **Feedback** | None | Periodic progress updates |
| **Cancellation** | Not supported | Can cancel mid-execution |
| **Preemption** | N/A | Can send new goal to replace old |
| **State** | Simple (request → response) | Complex lifecycle (pending → active → result) |
| **Underlying** | 1 request-response | 3 topics + 2 services |

**When to use each:**

- **Service**: "Get current pose", "Reset odometry", "Compute inverse kinematics" (quick)
- **Action**: "Navigate to goal", "Pick object", "Follow trajectory" (long-running with feedback)

**Interview Insight:**
Actions are for long-running tasks where you need progress updates and cancellation ability.

---

### Q2: How does an action work under the hood?

**Difficulty:** ⭐⭐⭐⭐ (Hard)

**Answer:**

An action uses **5 topics/services** under the hood:

```
/action_name/_action/send_goal       (service)  → Send goal
/action_name/_action/cancel_goal     (service)  → Cancel goal
/action_name/_action/get_result      (service)  → Get result
/action_name/_action/feedback        (topic)    → Feedback stream
/action_name/_action/status          (topic)    → Goal status updates
```

**Workflow:**

1. **Client sends goal**:
   ```
   Client → /send_goal (service) → Server
   Server accepts → returns GoalID
   ```

2. **Server executes**:
   ```
   Server publishes feedback:
   Server → /feedback (topic) → Client

   Server publishes status updates:
   Server → /status (topic) → Client (PENDING → ACTIVE)
   ```

3. **Client gets result**:
   ```
   Client → /get_result (service, with GoalID) → Server
   Server returns result + final status (SUCCEEDED/ABORTED/CANCELED)
   ```

4. **(Optional) Client cancels**:
   ```
   Client → /cancel_goal (service, with GoalID) → Server
   Server cancels execution, sends result with CANCELED status
   ```

**Verify with CLI:**

```bash
# List topics for action
ros2 action list
# /fibonacci

ros2 topic list | grep fibonacci
# /fibonacci/_action/feedback
# /fibonacci/_action/status

ros2 service list | grep fibonacci
# /fibonacci/_action/cancel_goal
# /fibonacci/_action/get_result
# /fibonacci/_action/send_goal
```

**Interview Insight:**
Actions are syntactic sugar over multiple topics and services. Understanding this helps debug action issues.

---

### Q3: Can action server handle multiple goals simultaneously?

**Difficulty:** ⭐⭐⭐⭐ (Hard)

**Answer:**

**Yes, by default** - action servers can handle multiple concurrent goals unless explicitly prevented.

**Problem:**
Many use cases require **single goal execution** (e.g., robot arm can't execute two trajectories simultaneously).

**Solutions:**

**1. Reject new goals if one active:**

```cpp
std::shared_ptr<GoalHandle> active_goal_;

GoalResponse handle_goal(...) {
    if (active_goal_ && active_goal_->is_active()) {
        return GoalResponse::REJECT;  // Only one at a time
    }
    return GoalResponse::ACCEPT_AND_EXECUTE;
}
```

**2. Preempt (cancel old goal, accept new):**

```cpp
GoalResponse handle_goal(...) {
    if (active_goal_ && active_goal_->is_active()) {
        active_goal_->canceled(result);  // Cancel previous
    }
    return GoalResponse::ACCEPT_AND_EXECUTE;
}
```

**3. Queue goals (execute sequentially):**

```cpp
std::queue<std::shared_ptr<GoalHandle>> goal_queue_;

GoalResponse handle_goal(...) {
    return GoalResponse::ACCEPT_AND_DEFER;  // Queue it
}

void handle_accepted(std::shared_ptr<GoalHandle> goal_handle) {
    goal_queue_.push(goal_handle);
    if (!currently_executing_) {
        process_next_goal();
    }
}
```

**Interview Insight:**
Default is concurrent execution. Must explicitly implement single-goal, preemption, or queuing logic.

---

### Q4: What happens to executing goal if action server crashes?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

**Server crashes → Client hangs** (no automatic notification).

**Why:**
- DDS doesn't send "server crashed" notification
- Client waits indefinitely for result
- Result callback never called

**Client-Side Solution - Timeout:**

```cpp
bool result_received_ = false;

// Start watchdog when goal sent
auto timeout_timer = create_wall_timer(30s, [this]() {
    if (!result_received_) {
        RCLCPP_ERROR(get_logger(), "Action timeout - server may have crashed");
        // Handle timeout: retry, fallback, error
    }
});

void result_callback(...) {
    result_received_ = true;
    timeout_timer->cancel();  // Stop watchdog
    // Process result...
}
```

**Detection:**

Check if action server is still alive:

```cpp
bool is_action_server_available() {
    return action_client_->action_server_is_ready();
}

// Periodically check
auto check_timer = create_wall_timer(5s, [this]() {
    if (!is_action_server_available()) {
        RCLCPP_WARN(get_logger(), "Action server disappeared!");
    }
});
```

**Interview Insight:**
Action clients must implement timeouts. Server crashes leave clients waiting forever without timeout.

---

### Q5: How do you cancel an action goal?

**Difficulty:** ⭐⭐ (Easy)

**Answer:**

**Client-Side:**

```cpp
// Store goal handle when sending goal
std::shared_ptr<GoalHandleFibonacci> goal_handle_;

void send_goal() {
    auto future = action_client_->async_send_goal(goal, options);
    auto result = future.get();
    goal_handle_ = result.first;  // Save goal handle
}

// Cancel goal
void cancel_goal() {
    if (goal_handle_) {
        auto cancel_future = action_client_->async_cancel_goal(goal_handle_);

        auto cancel_result = cancel_future.get();
        if (cancel_result == rclcpp_action::CancelResponse::ACCEPT) {
            RCLCPP_INFO(get_logger(), "Cancel accepted");
        } else {
            RCLCPP_WARN(get_logger(), "Cancel rejected");
        }
    }
}
```

**Server-Side (Handle Cancellation):**

```cpp
void execute(std::shared_ptr<GoalHandle> goal_handle) {
    while (processing) {
        // Check for cancellation
        if (goal_handle->is_canceling()) {
            RCLCPP_INFO(get_logger(), "Goal canceled");

            auto result = std::make_shared<Result>();
            result->message = "Canceled by user";
            goal_handle->canceled(result);  // Mark as canceled
            return;  // Stop execution
        }

        // Continue processing...
        process_next_item();
    }
}
```

**Command Line:**

```bash
# Cancel all goals for action
ros2 action send_goal --feedback /fibonacci action_tutorials_interfaces/action/Fibonacci "{order: 10}"

# In another terminal:
ros2 action cancel_goal /fibonacci <goal_id>
```

**Interview Insight:**
Client sends cancel request, server must check `is_canceling()` and call `canceled(result)`. Server decides whether to honor cancellation.

---

## PRACTICE_TASKS

### Task 1: File Download Action

Create action for downloading multiple files:
- Goal: List of URLs
- Feedback: Current file, bytes downloaded, speed
- Result: Downloaded file paths, total time
- Support cancellation mid-download

---

### Task 2: Preemptive Navigation Action

Implement navigation action that:
- Accepts new goal and cancels old goal automatically
- Publishes feedback: distance remaining, ETA
- Detects if goal becomes unreachable (abort)

---

### Task 3: Robust Action Client

Create action client with:
- Timeout detection
- Automatic retry on failure
- Progress bar display from feedback
- Graceful handling of server crashes

---

## QUICK_REFERENCE

### Action vs Service vs Topic

| Use Case | Pattern |
|----------|---------|
| Continuous data stream | **Topic** |
| Quick request-response (< 1s) | **Service** |
| Long task with feedback & cancellation | **Action** |

### Action Components (Under the Hood)

```
/action_name/_action/send_goal       (service)
/action_name/_action/cancel_goal     (service)
/action_name/_action/get_result      (service)
/action_name/_action/feedback        (topic)
/action_name/_action/status          (topic)
```

### Goal States

```
UNKNOWN → PENDING → ACTIVE → {SUCCEEDED | ABORTED | CANCELED}
```

### Key Server Methods

```cpp
handle_goal()       // Accept/reject goal
handle_cancel()     // Accept/reject cancel
handle_accepted()   // Start execution (spawn thread!)
execute()           // Main execution loop

goal_handle->publish_feedback(feedback);
goal_handle->is_canceling();
goal_handle->succeed(result);
goal_handle->abort(result);
goal_handle->canceled(result);
```

---

**END OF TOPIC 2.3**
