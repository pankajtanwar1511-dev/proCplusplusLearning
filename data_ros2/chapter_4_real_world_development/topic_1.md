# Chapter 4: Real-World Development Practices
## Topic 1: Testing Strategies (Unit, Integration, System)

---

## Theory

### 1. Testing Pyramid for ROS2

The testing pyramid guides the distribution of different test types in a ROS2 project:

```
        /\
       /  \      System Tests (E2E)
      /____\     - Full system integration
     /      \    - Robot in simulation/hardware
    /________\   Integration Tests
   /          \  - Multiple nodes interacting
  /____________\ - Launch files with real communication
 /______________\
 Unit Tests
 - Individual classes/functions
 - Fast, isolated, mocked dependencies
```

**Testing levels:**

1. **Unit Tests (70-80% of tests):**
   - Test individual functions, classes, methods
   - No ROS2 communication (or mocked)
   - Fast execution (< 1 second per test)
   - High coverage of edge cases

2. **Integration Tests (15-20%):**
   - Test interaction between components
   - Real ROS2 communication (topics, services, actions)
   - Multiple nodes in same test
   - Moderate execution time (1-10 seconds)

3. **System Tests (5-10%):**
   - End-to-end testing of complete system
   - Robot in simulation or hardware
   - Validates overall behavior
   - Slow execution (10+ seconds)

**Why this distribution?**
- Unit tests are fast → quick feedback during development
- Integration tests catch interface issues
- System tests validate real-world behavior
- Cost increases up the pyramid (slower, more fragile)

---

### 2. Unit Testing with Google Test

ROS2 uses Google Test (gtest) and Google Mock (gmock) for C++ unit testing.

#### Basic Test Structure

```cpp
// test/test_my_node.cpp
#include <gtest/gtest.h>
#include "my_package/my_node.hpp"

// Test fixture (optional, for shared setup/teardown)
class MyNodeTest : public ::testing::Test {
protected:
    void SetUp() override {
        // Setup before each test
        node_ = std::make_shared<MyNode>();
    }

    void TearDown() override {
        // Cleanup after each test
        node_.reset();
    }

    std::shared_ptr<MyNode> node_;
};

// Simple test
TEST(MyNodeTest, BasicTest) {
    EXPECT_EQ(1 + 1, 2);
}

// Test using fixture
TEST_F(MyNodeTest, NodeInitialization) {
    ASSERT_NE(node_, nullptr);
    EXPECT_EQ(node_->get_name(), "my_node");
}

// Test with multiple assertions
TEST_F(MyNodeTest, ProcessData) {
    std::vector<double> input = {1.0, 2.0, 3.0};
    auto result = node_->process_data(input);

    ASSERT_EQ(result.size(), 3);
    EXPECT_DOUBLE_EQ(result[0], 2.0);
    EXPECT_DOUBLE_EQ(result[1], 4.0);
    EXPECT_DOUBLE_EQ(result[2], 6.0);
}

// Test exception handling
TEST_F(MyNodeTest, ThrowsOnInvalidInput) {
    std::vector<double> empty_input;
    EXPECT_THROW(node_->process_data(empty_input), std::invalid_argument);
}

// Parameterized test
class ParameterizedTest : public ::testing::TestWithParam<std::tuple<int, int, int>> {};

TEST_P(ParameterizedTest, Addition) {
    auto [a, b, expected] = GetParam();
    EXPECT_EQ(a + b, expected);
}

INSTANTIATE_TEST_SUITE_P(
    AdditionTests,
    ParameterizedTest,
    ::testing::Values(
        std::make_tuple(1, 2, 3),
        std::make_tuple(0, 0, 0),
        std::make_tuple(-1, 1, 0)
    )
);

int main(int argc, char **argv) {
    ::testing::InitGoogleTest(&argc, argv);
    return RUN_ALL_TESTS();
}
```

#### CMakeLists.txt Configuration

```cmake
cmake_minimum_required(VERSION 3.8)
project(my_package)

# Find dependencies
find_package(ament_cmake REQUIRED)
find_package(rclcpp REQUIRED)

# Build main library
add_library(my_node_lib src/my_node.cpp)
ament_target_dependencies(my_node_lib rclcpp)

# Testing
if(BUILD_TESTING)
    find_package(ament_cmake_gtest REQUIRED)

    # Unit test
    ament_add_gtest(test_my_node test/test_my_node.cpp)
    target_link_libraries(test_my_node my_node_lib)
    ament_target_dependencies(test_my_node rclcpp)

    # Install test
    install(TARGETS test_my_node
        DESTINATION lib/${PROJECT_NAME}
    )
endif()

ament_package()
```

#### Running Tests

```bash
# Build with tests
colcon build --packages-select my_package

# Run tests
colcon test --packages-select my_package

# View results
colcon test-result --all
colcon test-result --verbose

# Run specific test
./build/my_package/test_my_node

# Run with filter
./build/my_package/test_my_node --gtest_filter=MyNodeTest.ProcessData

# Run with verbose output
./build/my_package/test_my_node --gtest_verbose
```

---

### 3. Testing ROS2 Nodes (with rclcpp)

Testing nodes requires special handling due to ROS2 initialization and spinning.

#### Isolated Node Test

```cpp
#include <gtest/gtest.h>
#include <rclcpp/rclcpp.hpp>
#include "my_package/my_node.hpp"

class MyNodeTest : public ::testing::Test {
protected:
    static void SetUpTestCase() {
        // Initialize ROS2 once for all tests
        rclcpp::init(0, nullptr);
    }

    static void TearDownTestCase() {
        // Shutdown ROS2 once after all tests
        rclcpp::shutdown();
    }

    void SetUp() override {
        // Create node before each test
        node_ = std::make_shared<MyNode>();
    }

    void TearDown() override {
        // Destroy node after each test
        node_.reset();
    }

    std::shared_ptr<MyNode> node_;
};

TEST_F(MyNodeTest, PublisherCreated) {
    // Verify publisher was created
    EXPECT_GT(node_->count_publishers("my_topic"), 0);
}

TEST_F(MyNodeTest, SubscriberCreated) {
    // Verify subscriber was created
    EXPECT_GT(node_->count_subscribers("my_topic"), 0);
}
```

#### Testing Node Functionality with Mocking

```cpp
#include <gtest/gtest.h>
#include <gmock/gmock.h>
#include <rclcpp/rclcpp.hpp>
#include <std_msgs/msg/string.hpp>

using ::testing::_;
using ::testing::Return;

class MockPublisher {
public:
    MOCK_METHOD(void, publish, (const std_msgs::msg::String&), ());
};

class MyNodeTest : public ::testing::Test {
protected:
    void SetUp() override {
        rclcpp::init(0, nullptr);
        node_ = std::make_shared<rclcpp::Node>("test_node");
        executor_ = std::make_shared<rclcpp::executors::SingleThreadedExecutor>();
        executor_->add_node(node_);
    }

    void TearDown() override {
        executor_.reset();
        node_.reset();
        rclcpp::shutdown();
    }

    std::shared_ptr<rclcpp::Node> node_;
    std::shared_ptr<rclcpp::executors::SingleThreadedExecutor> executor_;
};

TEST_F(MyNodeTest, ReceiveMessage) {
    bool message_received = false;
    std::string received_data;

    // Create subscriber
    auto sub = node_->create_subscription<std_msgs::msg::String>(
        "test_topic", 10,
        [&](const std_msgs::msg::String::SharedPtr msg) {
            message_received = true;
            received_data = msg->data;
        }
    );

    // Create publisher
    auto pub = node_->create_publisher<std_msgs::msg::String>("test_topic", 10);

    // Spin to allow discovery
    for (int i = 0; i < 10 && pub->get_subscription_count() == 0; ++i) {
        executor_->spin_some();
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }

    // Publish message
    auto msg = std::make_shared<std_msgs::msg::String>();
    msg->data = "test data";
    pub->publish(*msg);

    // Spin to process message
    executor_->spin_some();
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    executor_->spin_some();

    // Verify
    EXPECT_TRUE(message_received);
    EXPECT_EQ(received_data, "test data");
}
```

---

### 4. Integration Testing with launch_testing

`launch_testing` allows you to test multiple nodes interacting via launch files.

#### Basic Integration Test

```python
# test/test_integration.py
import unittest
import rclpy
from rclpy.node import Node
from std_msgs.msg import String
import launch
import launch_ros
import launch_testing
import pytest

@pytest.mark.launch_test
def generate_test_description():
    """Launch nodes to test."""
    talker_node = launch_ros.actions.Node(
        package='demo_nodes_cpp',
        executable='talker',
        name='talker'
    )

    listener_node = launch_ros.actions.Node(
        package='demo_nodes_cpp',
        executable='listener',
        name='listener'
    )

    return (
        launch.LaunchDescription([
            talker_node,
            listener_node,
            launch_testing.actions.ReadyToTest()
        ]),
        {
            'talker': talker_node,
            'listener': listener_node
        }
    )

class TestTalkerListener(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        rclpy.init()

    @classmethod
    def tearDownClass(cls):
        rclpy.shutdown()

    def setUp(self):
        self.node = rclpy.create_node('test_node')

    def tearDown(self):
        self.node.destroy_node()

    def test_talker_publishes(self, proc_output):
        """Test that talker publishes messages."""
        messages_received = []

        def callback(msg):
            messages_received.append(msg.data)

        sub = self.node.create_subscription(
            String,
            '/chatter',
            callback,
            10
        )

        # Spin for 2 seconds to collect messages
        end_time = self.node.get_clock().now() + rclpy.duration.Duration(seconds=2)
        while self.node.get_clock().now() < end_time:
            rclpy.spin_once(self.node, timeout_sec=0.1)

        # Verify messages were received
        self.assertGreater(len(messages_received), 0, "No messages received")
        self.assertTrue(any("Hello World" in msg for msg in messages_received))

@launch_testing.post_shutdown_test()
class TestProcessOutput(unittest.TestCase):
    def test_exit_codes(self, proc_info):
        """Check that all processes exited cleanly."""
        launch_testing.asserts.assertExitCodes(proc_info)
```

#### CMakeLists.txt for launch_testing

```cmake
if(BUILD_TESTING)
    find_package(ament_cmake_pytest REQUIRED)
    find_package(launch_testing_ament_cmake REQUIRED)

    # Add integration test
    add_launch_test(
        test/test_integration.py
        TIMEOUT 30
    )
endif()
```

#### Advanced Integration Test with Actions

```python
import unittest
import rclpy
from rclpy.action import ActionClient
from example_interfaces.action import Fibonacci
import launch
import launch_ros
import launch_testing
import pytest

@pytest.mark.launch_test
def generate_test_description():
    action_server_node = launch_ros.actions.Node(
        package='my_package',
        executable='fibonacci_server',
        name='fibonacci_server'
    )

    return (
        launch.LaunchDescription([
            action_server_node,
            launch_testing.actions.ReadyToTest()
        ]),
        {'action_server': action_server_node}
    )

class TestFibonacciAction(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        rclpy.init()

    @classmethod
    def tearDownClass(cls):
        rclpy.shutdown()

    def setUp(self):
        self.node = rclpy.create_node('test_action_client')
        self.action_client = ActionClient(
            self.node,
            Fibonacci,
            '/fibonacci'
        )

    def tearDown(self):
        self.action_client.destroy()
        self.node.destroy_node()

    def test_fibonacci_action(self):
        """Test Fibonacci action server."""
        # Wait for action server
        self.assertTrue(
            self.action_client.wait_for_server(timeout_sec=5.0),
            "Action server not available"
        )

        # Send goal
        goal_msg = Fibonacci.Goal()
        goal_msg.order = 5

        goal_future = self.action_client.send_goal_async(goal_msg)
        rclpy.spin_until_future_complete(self.node, goal_future, timeout_sec=5.0)

        goal_handle = goal_future.result()
        self.assertIsNotNone(goal_handle)
        self.assertTrue(goal_handle.accepted)

        # Get result
        result_future = goal_handle.get_result_async()
        rclpy.spin_until_future_complete(self.node, result_future, timeout_sec=5.0)

        result = result_future.result().result
        expected_sequence = [0, 1, 1, 2, 3, 5]
        self.assertEqual(result.sequence, expected_sequence)
```

---

### 5. System Testing (End-to-End)

System tests validate complete robot behavior, often in simulation.

#### Gazebo Simulation Test

```python
# test/test_navigation_system.py
import unittest
import rclpy
from geometry_msgs.msg import PoseStamped
from nav_msgs.msg import Odometry
import launch
import launch_ros
import launch_testing
import pytest
import math

@pytest.mark.launch_test
def generate_test_description():
    """Launch complete navigation system in Gazebo."""

    # Launch Gazebo
    gazebo = launch.actions.IncludeLaunchDescription(
        launch.launch_description_sources.PythonLaunchDescriptionSource(
            '/path/to/gazebo_world.launch.py'
        )
    )

    # Launch robot
    robot_spawn = launch_ros.actions.Node(
        package='my_robot',
        executable='spawn_robot',
        name='spawn_robot'
    )

    # Launch navigation stack
    nav_launch = launch.actions.IncludeLaunchDescription(
        launch.launch_description_sources.PythonLaunchDescriptionSource(
            '/path/to/navigation.launch.py'
        ),
        launch_arguments={'use_sim_time': 'true'}.items()
    )

    return (
        launch.LaunchDescription([
            gazebo,
            robot_spawn,
            nav_launch,
            launch_testing.actions.ReadyToTest()
        ]),
        {}
    )

class TestNavigationSystem(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        rclpy.init()

    @classmethod
    def tearDownClass(cls):
        rclpy.shutdown()

    def setUp(self):
        self.node = rclpy.create_node('test_navigation')
        self.current_pose = None

        # Subscribe to odometry
        self.odom_sub = self.node.create_subscription(
            Odometry,
            '/odom',
            self.odom_callback,
            10
        )

        # Publisher for goal
        self.goal_pub = self.node.create_publisher(
            PoseStamped,
            '/goal_pose',
            10
        )

    def tearDown(self):
        self.node.destroy_node()

    def odom_callback(self, msg):
        self.current_pose = msg.pose.pose

    def test_navigate_to_goal(self):
        """Test robot navigates to goal position."""
        # Wait for odometry
        timeout = 10.0
        start_time = self.node.get_clock().now()
        while self.current_pose is None:
            rclpy.spin_once(self.node, timeout_sec=0.1)
            if (self.node.get_clock().now() - start_time).nanoseconds / 1e9 > timeout:
                self.fail("Odometry not received")

        # Record starting position
        start_x = self.current_pose.position.x
        start_y = self.current_pose.position.y

        # Send goal (5 meters forward)
        goal_msg = PoseStamped()
        goal_msg.header.frame_id = 'map'
        goal_msg.header.stamp = self.node.get_clock().now().to_msg()
        goal_msg.pose.position.x = start_x + 5.0
        goal_msg.pose.position.y = start_y
        goal_msg.pose.orientation.w = 1.0

        self.goal_pub.publish(goal_msg)

        # Wait for robot to reach goal (timeout 60 seconds)
        goal_reached = False
        timeout = 60.0
        start_time = self.node.get_clock().now()

        while not goal_reached:
            rclpy.spin_once(self.node, timeout_sec=0.1)

            if self.current_pose is not None:
                dx = self.current_pose.position.x - goal_msg.pose.position.x
                dy = self.current_pose.position.y - goal_msg.pose.position.y
                distance = math.sqrt(dx*dx + dy*dy)

                if distance < 0.5:  # Within 0.5m of goal
                    goal_reached = True

            elapsed = (self.node.get_clock().now() - start_time).nanoseconds / 1e9
            if elapsed > timeout:
                self.fail(f"Robot did not reach goal within {timeout}s")

        # Verify robot moved
        distance_traveled = math.sqrt(
            (self.current_pose.position.x - start_x)**2 +
            (self.current_pose.position.y - start_y)**2
        )
        self.assertGreater(distance_traveled, 4.0, "Robot did not move far enough")
```

---

### 6. Test Coverage

Measuring test coverage ensures your tests exercise the code.

#### Generating Coverage Reports

```bash
# Build with coverage flags
colcon build --packages-select my_package \
    --cmake-args -DCMAKE_CXX_FLAGS="--coverage" -DCMAKE_C_FLAGS="--coverage"

# Run tests
colcon test --packages-select my_package

# Generate coverage report
lcov --capture --directory build/my_package --output-file coverage.info
lcov --remove coverage.info '/usr/*' --output-file coverage.info
lcov --remove coverage.info '*/test/*' --output-file coverage.info

# Generate HTML report
genhtml coverage.info --output-directory coverage_html

# View report
firefox coverage_html/index.html
```

#### CMakeLists.txt with Coverage

```cmake
if(BUILD_TESTING)
    find_package(ament_cmake_gtest REQUIRED)

    # Enable coverage
    if(CMAKE_BUILD_TYPE STREQUAL "Debug")
        set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} --coverage")
        set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} --coverage")
    endif()

    ament_add_gtest(test_my_node test/test_my_node.cpp)
    target_link_libraries(test_my_node my_node_lib)

    # Add coverage target
    if(CMAKE_BUILD_TYPE STREQUAL "Debug")
        find_program(LCOV_PATH lcov)
        find_program(GENHTML_PATH genhtml)

        if(LCOV_PATH AND GENHTML_PATH)
            add_custom_target(coverage
                COMMAND ${LCOV_PATH} --capture --directory . --output-file coverage.info
                COMMAND ${LCOV_PATH} --remove coverage.info '/usr/*' --output-file coverage.info
                COMMAND ${GENHTML_PATH} coverage.info --output-directory coverage_html
                WORKING_DIRECTORY ${CMAKE_BINARY_DIR}
                COMMENT "Generating coverage report"
            )
        endif()
    endif()
endif()
```

**Coverage metrics:**
- **Line coverage:** Percentage of lines executed
- **Branch coverage:** Percentage of branches taken
- **Function coverage:** Percentage of functions called

**Good targets:**
- Unit tests: 80-90% line coverage
- Integration tests: 60-70% (harder to cover all paths)
- System tests: Focus on critical paths (not coverage percentage)

---

### 7. Mocking and Test Doubles

Mocking isolates the unit under test by replacing dependencies.

#### Using Google Mock

```cpp
#include <gmock/gmock.h>
#include <gtest/gtest.h>

// Interface to mock
class SensorInterface {
public:
    virtual ~SensorInterface() = default;
    virtual double read_temperature() = 0;
    virtual bool is_connected() = 0;
};

// Mock implementation
class MockSensor : public SensorInterface {
public:
    MOCK_METHOD(double, read_temperature, (), (override));
    MOCK_METHOD(bool, is_connected, (), (override));
};

// Class under test
class TemperatureMonitor {
public:
    TemperatureMonitor(std::shared_ptr<SensorInterface> sensor)
        : sensor_(sensor) {}

    bool check_temperature_safe(double threshold) {
        if (!sensor_->is_connected()) {
            return false;  // Sensor disconnected, not safe
        }
        return sensor_->read_temperature() < threshold;
    }

private:
    std::shared_ptr<SensorInterface> sensor_;
};

// Test with mock
TEST(TemperatureMonitorTest, SafeTemperature) {
    auto mock_sensor = std::make_shared<MockSensor>();

    // Set expectations
    EXPECT_CALL(*mock_sensor, is_connected())
        .WillOnce(::testing::Return(true));
    EXPECT_CALL(*mock_sensor, read_temperature())
        .WillOnce(::testing::Return(25.0));

    TemperatureMonitor monitor(mock_sensor);
    EXPECT_TRUE(monitor.check_temperature_safe(30.0));
}

TEST(TemperatureMonitorTest, UnsafeTemperature) {
    auto mock_sensor = std::make_shared<MockSensor>();

    EXPECT_CALL(*mock_sensor, is_connected())
        .WillOnce(::testing::Return(true));
    EXPECT_CALL(*mock_sensor, read_temperature())
        .WillOnce(::testing::Return(35.0));

    TemperatureMonitor monitor(mock_sensor);
    EXPECT_FALSE(monitor.check_temperature_safe(30.0));
}

TEST(TemperatureMonitorTest, SensorDisconnected) {
    auto mock_sensor = std::make_shared<MockSensor>();

    EXPECT_CALL(*mock_sensor, is_connected())
        .WillOnce(::testing::Return(false));
    // read_temperature should NOT be called
    EXPECT_CALL(*mock_sensor, read_temperature())
        .Times(0);

    TemperatureMonitor monitor(mock_sensor);
    EXPECT_FALSE(monitor.check_temperature_safe(30.0));
}
```

#### Mocking ROS2 Publishers/Subscribers

```cpp
#include <gmock/gmock.h>
#include <rclcpp/rclcpp.hpp>

// Mock publisher
template<typename MessageT>
class MockPublisher {
public:
    MOCK_METHOD(void, publish, (const MessageT&), ());
};

// Node using dependency injection for testability
class MyNode : public rclcpp::Node {
public:
    MyNode(std::shared_ptr<MockPublisher<std_msgs::msg::String>> pub = nullptr)
        : Node("my_node"), mock_pub_(pub) {
        if (!mock_pub_) {
            // Production: create real publisher
            real_pub_ = create_publisher<std_msgs::msg::String>("output", 10);
        }
    }

    void process_and_publish(const std::string &data) {
        auto msg = std_msgs::msg::String();
        msg.data = "Processed: " + data;

        if (mock_pub_) {
            mock_pub_->publish(msg);  // Test: use mock
        } else {
            real_pub_->publish(msg);  // Production: use real publisher
        }
    }

private:
    std::shared_ptr<MockPublisher<std_msgs::msg::String>> mock_pub_;
    rclcpp::Publisher<std_msgs::msg::String>::SharedPtr real_pub_;
};

TEST(MyNodeTest, PublishesProcessedData) {
    rclcpp::init(0, nullptr);

    auto mock_pub = std::make_shared<MockPublisher<std_msgs::msg::String>>();

    // Expect publish to be called with processed data
    EXPECT_CALL(*mock_pub, publish(::testing::_))
        .WillOnce(::testing::Invoke([](const std_msgs::msg::String &msg) {
            EXPECT_EQ(msg.data, "Processed: test");
        }));

    auto node = std::make_shared<MyNode>(mock_pub);
    node->process_and_publish("test");

    rclcpp::shutdown();
}
```

---

### 8. Test Best Practices

**1. Test Independence:**
```cpp
// BAD: Tests depend on execution order
int global_counter = 0;

TEST(BadTest, First) {
    global_counter = 1;
    EXPECT_EQ(global_counter, 1);
}

TEST(BadTest, Second) {
    // Depends on First running!
    EXPECT_EQ(global_counter, 1);
}

// GOOD: Each test is independent
class GoodTest : public ::testing::Test {
protected:
    void SetUp() override {
        counter_ = 0;
    }
    int counter_;
};

TEST_F(GoodTest, First) {
    counter_ = 1;
    EXPECT_EQ(counter_, 1);
}

TEST_F(GoodTest, Second) {
    // Independent - SetUp() resets counter_
    EXPECT_EQ(counter_, 0);
}
```

**2. Clear Test Names:**
```cpp
// BAD: Unclear names
TEST(MyTest, Test1) { ... }
TEST(MyTest, Test2) { ... }

// GOOD: Descriptive names
TEST(ObstacleDetectorTest, DetectsObstacleInFront) { ... }
TEST(ObstacleDetectorTest, IgnoresDistantObstacles) { ... }
TEST(ObstacleDetectorTest, ThrowsWhenSensorDisconnected) { ... }
```

**3. Test One Thing:**
```cpp
// BAD: Testing multiple behaviors
TEST(MyNodeTest, DoesEverything) {
    // Tests initialization
    EXPECT_NE(node_, nullptr);

    // Tests publishing
    EXPECT_GT(pub_count, 0);

    // Tests parameters
    EXPECT_EQ(param_value, 42);

    // Too much in one test!
}

// GOOD: Separate tests
TEST(MyNodeTest, InitializesSuccessfully) {
    EXPECT_NE(node_, nullptr);
}

TEST(MyNodeTest, CreatesPublisher) {
    EXPECT_GT(node_->count_publishers("topic"), 0);
}

TEST(MyNodeTest, LoadsParameters) {
    EXPECT_EQ(node_->get_parameter("value").as_int(), 42);
}
```

**4. Use Fixtures for Setup:**
```cpp
class MyNodeTest : public ::testing::Test {
protected:
    void SetUp() override {
        rclcpp::init(0, nullptr);
        node_ = std::make_shared<MyNode>();
        executor_ = std::make_shared<rclcpp::executors::SingleThreadedExecutor>();
        executor_->add_node(node_);
    }

    void TearDown() override {
        executor_.reset();
        node_.reset();
        rclcpp::shutdown();
    }

    std::shared_ptr<MyNode> node_;
    std::shared_ptr<rclcpp::executors::SingleThreadedExecutor> executor_;
};
```

**5. Test Edge Cases:**
```cpp
TEST(DataProcessorTest, HandlesEmptyInput) {
    std::vector<double> empty;
    EXPECT_THROW(process(empty), std::invalid_argument);
}

TEST(DataProcessorTest, HandlesSingleElement) {
    std::vector<double> single = {42.0};
    auto result = process(single);
    EXPECT_EQ(result.size(), 1);
}

TEST(DataProcessorTest, HandlesLargeInput) {
    std::vector<double> large(10000, 1.0);
    auto result = process(large);
    EXPECT_EQ(result.size(), 10000);
}

TEST(DataProcessorTest, HandlesNaN) {
    std::vector<double> with_nan = {1.0, NAN, 3.0};
    auto result = process(with_nan);
    // Define expected behavior for NaN
}
```

---

## Edge Cases

### Edge Case 1: Flaky Tests Due to Timing Issues

**Scenario:**
Integration tests intermittently fail due to race conditions. Messages sometimes don't arrive before assertions, causing false negatives.

**Example:**

```cpp
TEST_F(IntegrationTest, ReceivesMessage) {
    bool received = false;

    auto sub = node_->create_subscription<String>(
        "topic", 10,
        [&](const String::SharedPtr msg) { received = true; }
    );

    auto pub = node_->create_publisher<String>("topic", 10);

    // Publish immediately (FLAKY!)
    auto msg = std::make_shared<String>();
    msg->data = "test";
    pub->publish(*msg);

    // Spin once (may not be enough time!)
    executor_->spin_some();

    EXPECT_TRUE(received);  // Sometimes fails!
}
```

**Problem:**
- Publisher/subscriber discovery takes time
- Message might be published before subscriber is ready
- `spin_some()` might not process message immediately

**Solution: Add Discovery Wait and Retry Logic**

```cpp
TEST_F(IntegrationTest, ReceivesMessage) {
    bool received = false;

    auto sub = node_->create_subscription<String>(
        "topic", 10,
        [&](const String::SharedPtr msg) { received = true; }
    );

    auto pub = node_->create_publisher<String>("topic", 10);

    // Wait for discovery (publisher sees subscriber)
    auto timeout = std::chrono::seconds(5);
    auto start = std::chrono::steady_clock::now();

    while (pub->get_subscription_count() == 0) {
        executor_->spin_some();
        std::this_thread::sleep_for(std::chrono::milliseconds(100));

        if (std::chrono::steady_clock::now() - start > timeout) {
            FAIL() << "Subscriber not discovered within timeout";
        }
    }

    // Now publish
    auto msg = std::make_shared<String>();
    msg->data = "test";
    pub->publish(*msg);

    // Spin with retry logic
    start = std::chrono::steady_clock::now();
    timeout = std::chrono::seconds(2);

    while (!received) {
        executor_->spin_some();
        std::this_thread::sleep_for(std::chrono::milliseconds(10));

        if (std::chrono::steady_clock::now() - start > timeout) {
            FAIL() << "Message not received within timeout";
        }
    }

    EXPECT_TRUE(received);  // Now reliable!
}
```

**Better: Use wait_for_message Helper**

```cpp
template<typename MessageT>
bool wait_for_message(
    rclcpp::Subscription<MessageT>::SharedPtr sub,
    rclcpp::executors::SingleThreadedExecutor::SharedPtr executor,
    std::function<bool(const typename MessageT::SharedPtr&)> predicate,
    std::chrono::seconds timeout = std::chrono::seconds(5))
{
    auto start = std::chrono::steady_clock::now();
    bool condition_met = false;
    typename MessageT::SharedPtr received_msg;

    // Temporarily replace callback
    // (This is simplified; real implementation would use shared state)

    while (!condition_met) {
        executor->spin_some();
        std::this_thread::sleep_for(std::chrono::milliseconds(10));

        if (std::chrono::steady_clock::now() - start > timeout) {
            return false;
        }
    }

    return true;
}

// Usage
TEST_F(IntegrationTest, ReceivesMessage) {
    std::string received_data;

    auto sub = node_->create_subscription<String>(
        "topic", 10,
        [&](const String::SharedPtr msg) { received_data = msg->data; }
    );

    auto pub = node_->create_publisher<String>("topic", 10);
    wait_for_discovery(pub, 1);  // Wait for 1 subscriber

    pub->publish(make_message("test"));

    // Wait for specific message
    bool received = wait_for_condition(
        [&]() { return received_data == "test"; },
        std::chrono::seconds(2)
    );

    EXPECT_TRUE(received);
    EXPECT_EQ(received_data, "test");
}
```

**Best Practices:**
- Always wait for discovery before publishing
- Use timeouts with clear failure messages
- Implement helper functions for common patterns
- Consider using `spin_until_future_complete` for futures

---

### Edge Case 2: Tests Pass Locally but Fail in CI

**Scenario:**
Tests pass on developer's machine but fail in CI environment due to different system configurations (CPU speed, network setup, ROS_DOMAIN_ID conflicts).

**Common Causes:**

**1. Timing Assumptions (CPU speed difference):**

```cpp
// BAD: Assumes fast CPU
TEST(PerformanceTest, ProcessesQuickly) {
    auto start = std::chrono::steady_clock::now();
    process_large_data();
    auto duration = std::chrono::steady_clock::now() - start;

    // Fails on slower CI machines!
    EXPECT_LT(std::chrono::duration_cast<std::chrono::milliseconds>(duration).count(), 100);
}

// GOOD: Test correctness, not absolute performance
TEST(CorrectnessTest, ProcessesDataCorrectly) {
    auto result = process_large_data();
    EXPECT_EQ(result.size(), expected_size);
    EXPECT_DOUBLE_EQ(result[0], expected_value);
    // If you must test performance, use generous timeouts
}
```

**2. ROS_DOMAIN_ID Conflicts:**

CI runs multiple builds in parallel, possibly on same machine. If tests don't isolate domains, nodes from different builds interfere.

```bash
# BAD: Uses default domain (0)
colcon test

# GOOD: Use unique domain per build
export ROS_DOMAIN_ID=${CI_BUILD_ID:-0}
colcon test
```

**In Python tests:**

```python
import os
import random

@pytest.mark.launch_test
def generate_test_description():
    # Use unique domain ID
    domain_id = os.environ.get('ROS_DOMAIN_ID', str(random.randint(100, 200)))
    os.environ['ROS_DOMAIN_ID'] = domain_id

    # Launch nodes...
```

**3. Missing Dependencies:**

```cmake
# BAD: Assumes system has optional dependency
find_package(some_optional_lib)
# Uses some_optional_lib without checking if found!

# GOOD: Conditionally enable tests
find_package(some_optional_lib)
if(some_optional_lib_FOUND)
    ament_add_gtest(test_with_optional_lib ...)
    target_link_libraries(test_with_optional_lib some_optional_lib)
else()
    message(WARNING "some_optional_lib not found, skipping test_with_optional_lib")
endif()
```

**4. Network Configuration:**

CI environments may not have multicast enabled.

```python
# In integration tests
def is_multicast_available():
    """Check if multicast is available."""
    result = subprocess.run(['ros2', 'multicast', 'send'],
                          capture_output=True, timeout=2)
    return result.returncode == 0

@pytest.mark.skipif(not is_multicast_available(),
                    reason="Multicast not available in this environment")
def test_multi_machine_discovery():
    # Test that requires multicast...
```

**5. File System Differences:**

```cpp
// BAD: Hardcoded paths
TEST(ConfigTest, LoadsConfig) {
    load_config("/home/user/config.yaml");  // Fails in CI!
}

// GOOD: Use relative paths or test fixtures
TEST(ConfigTest, LoadsConfig) {
    // Get package share directory
    auto package_dir = ament_index_cpp::get_package_share_directory("my_package");
    auto config_path = package_dir + "/config/test_config.yaml";
    load_config(config_path);
}
```

**Solution: Make Tests Environment-Agnostic**

```cmake
# CMakeLists.txt: Install test fixtures
install(DIRECTORY
    test/fixtures/
    DESTINATION share/${PROJECT_NAME}/test/fixtures
)

# Set environment variables for tests
ament_add_gtest(test_my_node test/test_my_node.cpp)
set_tests_properties(test_my_node PROPERTIES
    ENVIRONMENT "TEST_FIXTURES_DIR=${CMAKE_INSTALL_PREFIX}/share/${PROJECT_NAME}/test/fixtures"
)
```

```cpp
// In test
TEST(ConfigTest, LoadsConfig) {
    const char* fixtures_dir = std::getenv("TEST_FIXTURES_DIR");
    ASSERT_NE(fixtures_dir, nullptr) << "TEST_FIXTURES_DIR not set";

    std::string config_path = std::string(fixtures_dir) + "/test_config.yaml";
    load_config(config_path);
}
```

---

### Edge Case 3: Memory Leaks in Tests

**Scenario:**
Tests pass but leak memory, causing CI to run out of memory when running large test suites.

**Example:**

```cpp
TEST(LeakyTest, CreatesNodes) {
    rclcpp::init(0, nullptr);

    for (int i = 0; i < 100; ++i) {
        auto node = std::make_shared<MyNode>();
        // Node is created but executor holds reference!
        auto executor = std::make_shared<rclcpp::executors::SingleThreadedExecutor>();
        executor->add_node(node);
        // executor destroyed, but node might still have internal references
    }

    // rclcpp::shutdown() not called - leak!
}
```

**Problem:**
- ROS2 context not cleaned up properly
- Nodes/executors not destroyed correctly
- Test fixture doesn't reset state

**Solution 1: Proper Cleanup in Fixtures**

```cpp
class MyNodeTest : public ::testing::Test {
protected:
    void SetUp() override {
        // Initialize ROS2 for each test
        rclcpp::init(0, nullptr);
        node_ = std::make_shared<MyNode>();
        executor_ = std::make_shared<rclcpp::executors::SingleThreadedExecutor>();
        executor_->add_node(node_);
    }

    void TearDown() override {
        // Critical: cleanup in reverse order
        executor_->remove_node(node_);  // Remove from executor first
        executor_.reset();               // Destroy executor
        node_.reset();                   // Destroy node
        rclcpp::shutdown();              // Shutdown ROS2
    }

    std::shared_ptr<MyNode> node_;
    std::shared_ptr<rclcpp::executors::SingleThreadedExecutor> executor_;
};

TEST_F(MyNodeTest, DoesNotLeak) {
    // Test body...
    // TearDown() ensures cleanup
}
```

**Solution 2: Use RAII Helper**

```cpp
class ROS2TestEnvironment {
public:
    ROS2TestEnvironment() {
        if (!rclcpp::ok()) {
            rclcpp::init(0, nullptr);
            initialized_ = true;
        }
    }

    ~ROS2TestEnvironment() {
        if (initialized_) {
            rclcpp::shutdown();
        }
    }

    ROS2TestEnvironment(const ROS2TestEnvironment&) = delete;
    ROS2TestEnvironment& operator=(const ROS2TestEnvironment&) = delete;

private:
    bool initialized_ = false;
};

TEST(MyNodeTest, DoesNotLeak) {
    ROS2TestEnvironment env;  // RAII ensures cleanup

    auto node = std::make_shared<MyNode>();
    // ... test ...
    // env destructor calls rclcpp::shutdown()
}
```

**Solution 3: Detect Leaks with Valgrind in CI**

```yaml
# .github/workflows/test.yml
- name: Run tests with Valgrind
  run: |
    colcon test --packages-select my_package \
      --event-handlers console_direct+ \
      --pytest-with-coverage \
      --return-code-on-test-failure

    # Run Valgrind on test executables
    for test_exe in build/my_package/test_*; do
      if [ -x "$test_exe" ]; then
        valgrind --leak-check=full --error-exitcode=1 "$test_exe"
      fi
    done
```

**Solution 4: Use AddressSanitizer**

```cmake
if(BUILD_TESTING)
    # Enable AddressSanitizer for leak detection
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -fsanitize=address -fno-omit-frame-pointer")
    set(CMAKE_LINKER_FLAGS "${CMAKE_LINKER_FLAGS} -fsanitize=address")

    ament_add_gtest(test_my_node test/test_my_node.cpp)
endif()
```

```bash
# Run tests with ASAN
colcon test --packages-select my_package

# ASAN will report leaks:
# ==12345==ERROR: LeakSanitizer: detected memory leaks
# Direct leak of 512 bytes in 1 object(s) allocated from:
#     #0 in operator new
#     #1 in MyNode::MyNode()
```

---

### Edge Case 4: Testing Time-Dependent Behavior

**Scenario:**
Node behavior depends on time (e.g., timeouts, rate limits). Testing with real time makes tests slow and flaky.

**Example:**

```cpp
class TimeoutNode : public rclcpp::Node {
public:
    TimeoutNode() : Node("timeout_node") {
        last_msg_time_ = now();

        timer_ = create_wall_timer(100ms, [this]() {
            auto elapsed = (now() - last_msg_time_).seconds();
            if (elapsed > 5.0) {  // 5 second timeout
                RCLCPP_ERROR(get_logger(), "Timeout!");
                timeout_occurred_ = true;
            }
        });
    }

    void message_received() {
        last_msg_time_ = now();
        timeout_occurred_ = false;
    }

    bool has_timeout_occurred() const { return timeout_occurred_; }

private:
    rclcpp::Time last_msg_time_;
    rclcpp::TimerBase::SharedPtr timer_;
    bool timeout_occurred_ = false;
};

// BAD TEST: Waits for real time
TEST_F(TimeoutNodeTest, DetectsTimeout) {
    auto node = std::make_shared<TimeoutNode>();
    auto executor = std::make_shared<rclcpp::executors::SingleThreadedExecutor>();
    executor->add_node(node);

    // Wait 6 seconds for timeout (SLOW!)
    auto end_time = std::chrono::steady_clock::now() + std::chrono::seconds(6);
    while (std::chrono::steady_clock::now() < end_time) {
        executor->spin_some();
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }

    EXPECT_TRUE(node->has_timeout_occurred());
    // This test takes 6+ seconds!
}
```

**Solution: Use Simulation Time**

```cpp
TEST_F(TimeoutNodeTest, DetectsTimeout) {
    // Enable simulation time
    rclcpp::Parameter use_sim_time("use_sim_time", true);
    auto node = std::make_shared<TimeoutNode>();
    node->set_parameter(use_sim_time);

    auto executor = std::make_shared<rclcpp::executors::SingleThreadedExecutor>();
    executor->add_node(node);

    // Create time source that publishes to /clock
    auto time_source_node = std::make_shared<rclcpp::Node>("time_source");
    auto clock_pub = time_source_node->create_publisher<rosgraph_msgs::msg::Clock>("/clock", 10);
    executor->add_node(time_source_node);

    // Publish initial time
    auto publish_time = [&](int64_t seconds) {
        auto msg = rosgraph_msgs::msg::Clock();
        msg.clock.sec = seconds;
        msg.clock.nanosec = 0;
        clock_pub->publish(msg);
        executor->spin_some();
    };

    publish_time(0);    // t=0
    publish_time(3);    // t=3 (no timeout yet)
    EXPECT_FALSE(node->has_timeout_occurred());

    publish_time(6);    // t=6 (timeout!)
    executor->spin_some();
    EXPECT_TRUE(node->has_timeout_occurred());

    // Test completes instantly!
}
```

**Alternative: Mock the Clock**

```cpp
class MockClock : public rclcpp::Clock {
public:
    MockClock() : rclcpp::Clock(RCL_ROS_TIME) {}

    void set_now(rclcpp::Time time) {
        current_time_ = time;
    }

    rclcpp::Time now() override {
        return current_time_;
    }

private:
    rclcpp::Time current_time_{0, 0, RCL_ROS_TIME};
};

// Refactor node to accept clock injection
class TimeoutNode : public rclcpp::Node {
public:
    TimeoutNode(rclcpp::Clock::SharedPtr clock = nullptr)
        : Node("timeout_node"),
          clock_(clock ? clock : get_clock()) {
        last_msg_time_ = clock_->now();
        // ...
    }

private:
    rclcpp::Clock::SharedPtr clock_;
};

TEST_F(TimeoutNodeTest, DetectsTimeout) {
    auto mock_clock = std::make_shared<MockClock>();
    auto node = std::make_shared<TimeoutNode>(mock_clock);

    mock_clock->set_now(rclcpp::Time(0, 0, RCL_ROS_TIME));
    node->message_received();

    mock_clock->set_now(rclcpp::Time(6, 0, RCL_ROS_TIME));
    // Trigger timer manually or via executor

    EXPECT_TRUE(node->has_timeout_occurred());
    // Instant test!
}
```

**Best Practices for Time-Dependent Tests:**
- Use simulation time (`use_sim_time: true`)
- Inject clock dependencies for unit tests
- Avoid `std::this_thread::sleep_for` in tests
- Use `spin_until_future_complete` with timeouts
- Test timeout logic separately from real timing

---

## Code Examples

### Example: Complete Testing Setup for a ROS2 Package

This example shows a production-ready testing setup for a sensor processing node.

**Package Structure:**

```
my_sensor_package/
├── CMakeLists.txt
├── package.xml
├── include/my_sensor_package/
│   └── sensor_processor.hpp
├── src/
│   └── sensor_processor.cpp
├── test/
│   ├── test_sensor_processor.cpp          # Unit tests
│   ├── test_sensor_integration.py         # Integration tests
│   └── test_sensor_system.py              # System tests
└── test/fixtures/
    └── test_data.yaml
```

**1. Header File (sensor_processor.hpp):**

```cpp
#ifndef MY_SENSOR_PACKAGE__SENSOR_PROCESSOR_HPP_
#define MY_SENSOR_PACKAGE__SENSOR_PROCESSOR_HPP_

#include <rclcpp/rclcpp.hpp>
#include <sensor_msgs/msg/laser_scan.hpp>
#include <geometry_msgs/msg/point.hpp>
#include <vector>

namespace my_sensor_package
{

// Interface for testability
class SensorDataSource {
public:
    virtual ~SensorDataSource() = default;
    virtual sensor_msgs::msg::LaserScan::SharedPtr get_scan() = 0;
};

class SensorProcessor : public rclcpp::Node
{
public:
    explicit SensorProcessor(
        const rclcpp::NodeOptions & options = rclcpp::NodeOptions(),
        std::shared_ptr<SensorDataSource> data_source = nullptr
    );

    // Public for testing
    std::vector<geometry_msgs::msg::Point> find_obstacles(
        const sensor_msgs::msg::LaserScan & scan,
        double min_distance = 0.0,
        double max_distance = 10.0
    );

    bool is_path_clear(const sensor_msgs::msg::LaserScan & scan, double threshold = 1.0);

    size_t get_obstacle_count() const { return obstacle_count_; }

private:
    void scan_callback(const sensor_msgs::msg::LaserScan::SharedPtr msg);

    rclcpp::Subscription<sensor_msgs::msg::LaserScan>::SharedPtr scan_sub_;
    rclcpp::Publisher<geometry_msgs::msg::Point>::SharedPtr obstacle_pub_;

    std::shared_ptr<SensorDataSource> data_source_;
    size_t obstacle_count_ = 0;
    double obstacle_distance_threshold_;
};

}  // namespace my_sensor_package

#endif  // MY_SENSOR_PACKAGE__SENSOR_PROCESSOR_HPP_
```

**2. Implementation (sensor_processor.cpp):**

```cpp
#include "my_sensor_package/sensor_processor.hpp"
#include <algorithm>
#include <cmath>

namespace my_sensor_package
{

SensorProcessor::SensorProcessor(
    const rclcpp::NodeOptions & options,
    std::shared_ptr<SensorDataSource> data_source)
: Node("sensor_processor", options),
  data_source_(data_source)
{
    declare_parameter("obstacle_distance_threshold", 0.5);
    obstacle_distance_threshold_ = get_parameter("obstacle_distance_threshold").as_double();

    if (!data_source_) {
        // Production: subscribe to real topic
        scan_sub_ = create_subscription<sensor_msgs::msg::LaserScan>(
            "scan", 10,
            std::bind(&SensorProcessor::scan_callback, this, std::placeholders::_1)
        );
    }

    obstacle_pub_ = create_publisher<geometry_msgs::msg::Point>("obstacles", 10);

    RCLCPP_INFO(get_logger(), "SensorProcessor initialized");
}

std::vector<geometry_msgs::msg::Point> SensorProcessor::find_obstacles(
    const sensor_msgs::msg::LaserScan & scan,
    double min_distance,
    double max_distance)
{
    std::vector<geometry_msgs::msg::Point> obstacles;

    for (size_t i = 0; i < scan.ranges.size(); ++i) {
        double range = scan.ranges[i];

        // Skip invalid readings
        if (range < scan.range_min || range > scan.range_max) {
            continue;
        }

        // Check if in obstacle range
        if (range >= min_distance && range <= max_distance) {
            double angle = scan.angle_min + i * scan.angle_increment;

            geometry_msgs::msg::Point point;
            point.x = range * std::cos(angle);
            point.y = range * std::sin(angle);
            point.z = 0.0;

            obstacles.push_back(point);
        }
    }

    return obstacles;
}

bool SensorProcessor::is_path_clear(
    const sensor_msgs::msg::LaserScan & scan,
    double threshold)
{
    // Check front 30 degrees (±15 degrees)
    double front_angle_range = 15.0 * M_PI / 180.0;

    for (size_t i = 0; i < scan.ranges.size(); ++i) {
        double angle = scan.angle_min + i * scan.angle_increment;

        if (std::abs(angle) <= front_angle_range) {
            if (scan.ranges[i] < threshold &&
                scan.ranges[i] >= scan.range_min) {
                return false;  // Obstacle in path
            }
        }
    }

    return true;  // Path clear
}

void SensorProcessor::scan_callback(const sensor_msgs::msg::LaserScan::SharedPtr msg)
{
    auto obstacles = find_obstacles(*msg, 0.0, obstacle_distance_threshold_);
    obstacle_count_ = obstacles.size();

    // Publish each obstacle
    for (const auto & obstacle : obstacles) {
        obstacle_pub_->publish(obstacle);
    }

    if (!is_path_clear(*msg, obstacle_distance_threshold_)) {
        RCLCPP_WARN_THROTTLE(get_logger(), *get_clock(), 1000,
                            "Path blocked! %zu obstacles detected", obstacle_count_);
    }
}

}  // namespace my_sensor_package

#include "rclcpp_components/register_node_macro.hpp"
RCLCPP_COMPONENTS_REGISTER_NODE(my_sensor_package::SensorProcessor)
```

**3. Unit Tests (test_sensor_processor.cpp):**

```cpp
#include <gtest/gtest.h>
#include <gmock/gmock.h>
#include "my_sensor_package/sensor_processor.hpp"

using namespace my_sensor_package;

// Helper to create test scan
sensor_msgs::msg::LaserScan create_test_scan(
    const std::vector<double> & ranges,
    double angle_min = -M_PI,
    double angle_max = M_PI)
{
    sensor_msgs::msg::LaserScan scan;
    scan.angle_min = angle_min;
    scan.angle_max = angle_max;
    scan.angle_increment = (angle_max - angle_min) / ranges.size();
    scan.range_min = 0.1;
    scan.range_max = 10.0;
    scan.ranges = ranges;
    return scan;
}

class SensorProcessorTest : public ::testing::Test {
protected:
    void SetUp() override {
        rclcpp::init(0, nullptr);
        node_ = std::make_shared<SensorProcessor>();
    }

    void TearDown() override {
        node_.reset();
        rclcpp::shutdown();
    }

    std::shared_ptr<SensorProcessor> node_;
};

TEST_F(SensorProcessorTest, NodeInitializes) {
    ASSERT_NE(node_, nullptr);
    EXPECT_EQ(node_->get_name(), std::string("sensor_processor"));
}

TEST_F(SensorProcessorTest, FindsObstaclesInRange) {
    // Create scan with 3 readings: far, close, far
    auto scan = create_test_scan({5.0, 0.5, 5.0}, -M_PI/4, M_PI/4);

    auto obstacles = node_->find_obstacles(scan, 0.0, 1.0);

    ASSERT_EQ(obstacles.size(), 1);  // Only middle reading (0.5m) is in range
    EXPECT_NEAR(obstacles[0].x, 0.5, 0.01);  // Straight ahead
    EXPECT_NEAR(obstacles[0].y, 0.0, 0.01);
}

TEST_F(SensorProcessorTest, IgnoresInvalidReadings) {
    // Include out-of-range readings
    auto scan = create_test_scan({0.05, 0.5, 15.0}, 0, M_PI);
    scan.range_min = 0.1;
    scan.range_max = 10.0;

    auto obstacles = node_->find_obstacles(scan, 0.0, 10.0);

    ASSERT_EQ(obstacles.size(), 1);  // Only middle reading is valid
}

TEST_F(SensorProcessorTest, PathClearWhenNoObstacles) {
    // All readings > 1.0m
    auto scan = create_test_scan(std::vector<double>(360, 5.0), -M_PI, M_PI);

    EXPECT_TRUE(node_->is_path_clear(scan, 1.0));
}

TEST_F(SensorProcessorTest, PathBlockedWhenObstacleInFront) {
    std::vector<double> ranges(360, 5.0);
    ranges[180] = 0.5;  // Obstacle directly in front

    auto scan = create_test_scan(ranges, -M_PI, M_PI);

    EXPECT_FALSE(node_->is_path_clear(scan, 1.0));
}

TEST_F(SensorProcessorTest, PathClearWhenObstacleOnSide) {
    std::vector<double> ranges(360, 5.0);
    ranges[90] = 0.5;  // Obstacle on side (outside front cone)

    auto scan = create_test_scan(ranges, -M_PI, M_PI);

    EXPECT_TRUE(node_->is_path_clear(scan, 1.0));  // Still clear in front
}

TEST_F(SensorProcessorTest, HandlesEmptyScan) {
    auto scan = create_test_scan({}, 0, M_PI);

    auto obstacles = node_->find_obstacles(scan);
    EXPECT_EQ(obstacles.size(), 0);

    EXPECT_TRUE(node_->is_path_clear(scan));  // No obstacles = clear
}

// Parameterized test for different angles
class ObstacleDetectionTest : public ::testing::TestWithParam<std::tuple<double, bool>> {
protected:
    void SetUp() override {
        rclcpp::init(0, nullptr);
        node_ = std::make_shared<SensorProcessor>();
    }

    void TearDown() override {
        node_.reset();
        rclcpp::shutdown();
    }

    std::shared_ptr<SensorProcessor> node_;
};

TEST_P(ObstacleDetectionTest, DetectsObstacleAtAngle) {
    auto [obstacle_angle, should_block] = GetParam();

    std::vector<double> ranges(360, 5.0);
    size_t obstacle_index = (obstacle_angle + M_PI) / (2 * M_PI) * 360;
    ranges[obstacle_index] = 0.5;

    auto scan = create_test_scan(ranges, -M_PI, M_PI);

    EXPECT_EQ(!node_->is_path_clear(scan, 1.0), should_block);
}

INSTANTIATE_TEST_SUITE_P(
    AngleTests,
    ObstacleDetectionTest,
    ::testing::Values(
        std::make_tuple(0.0, true),           // Front (blocks)
        std::make_tuple(10.0 * M_PI/180, true),  // 10° (blocks)
        std::make_tuple(20.0 * M_PI/180, false), // 20° (doesn't block)
        std::make_tuple(M_PI/2, false),       // Side (doesn't block)
        std::make_tuple(M_PI, false)          // Back (doesn't block)
    )
);

int main(int argc, char **argv) {
    ::testing::InitGoogleTest(&argc, argv);
    return RUN_ALL_TESTS();
}
```

**4. Integration Test (test_sensor_integration.py):**

```python
import unittest
import rclpy
from rclpy.node import Node
from sensor_msgs.msg import LaserScan
from geometry_msgs.msg import Point
import launch
import launch_ros
import launch_testing
import pytest
import math

@pytest.mark.launch_test
def generate_test_description():
    sensor_processor_node = launch_ros.actions.Node(
        package='my_sensor_package',
        executable='sensor_processor',
        name='sensor_processor',
        parameters=[{'obstacle_distance_threshold': 1.0}]
    )

    return (
        launch.LaunchDescription([
            sensor_processor_node,
            launch_testing.actions.ReadyToTest()
        ]),
        {'sensor_processor': sensor_processor_node}
    )

class TestSensorIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        rclpy.init()

    @classmethod
    def tearDownClass(cls):
        rclpy.shutdown()

    def setUp(self):
        self.node = rclpy.create_node('test_sensor_integration')
        self.obstacles_received = []

        self.obstacle_sub = self.node.create_subscription(
            Point,
            '/obstacles',
            lambda msg: self.obstacles_received.append(msg),
            10
        )

        self.scan_pub = self.node.create_publisher(LaserScan, '/scan', 10)

        # Wait for connections
        timeout = 5.0
        end_time = self.node.get_clock().now() + rclpy.duration.Duration(seconds=timeout)
        while (self.scan_pub.get_subscription_count() == 0 and
               self.node.get_clock().now() < end_time):
            rclpy.spin_once(self.node, timeout_sec=0.1)

        self.assertGreater(self.scan_pub.get_subscription_count(), 0,
                          "Sensor processor not subscribed")

    def tearDown(self):
        self.node.destroy_node()

    def create_scan(self, ranges, angle_min=-math.pi, angle_max=math.pi):
        scan = LaserScan()
        scan.header.stamp = self.node.get_clock().now().to_msg()
        scan.header.frame_id = 'laser'
        scan.angle_min = angle_min
        scan.angle_max = angle_max
        scan.angle_increment = (angle_max - angle_min) / len(ranges)
        scan.range_min = 0.1
        scan.range_max = 10.0
        scan.ranges = ranges
        return scan

    def test_publishes_obstacles(self):
        """Test that obstacles are published when detected."""
        # Create scan with one close obstacle
        scan = self.create_scan([5.0, 0.5, 5.0], -math.pi/4, math.pi/4)

        self.scan_pub.publish(scan)

        # Spin to process
        timeout = 2.0
        end_time = self.node.get_clock().now() + rclpy.duration.Duration(seconds=timeout)
        while (len(self.obstacles_received) == 0 and
               self.node.get_clock().now() < end_time):
            rclpy.spin_once(self.node, timeout_sec=0.1)

        self.assertGreater(len(self.obstacles_received), 0, "No obstacles published")

        # Verify obstacle position
        obstacle = self.obstacles_received[0]
        self.assertAlmostEqual(obstacle.x, 0.5, delta=0.1)
        self.assertAlmostEqual(obstacle.y, 0.0, delta=0.1)

    def test_no_obstacles_when_clear(self):
        """Test that no obstacles are published when path is clear."""
        scan = self.create_scan([5.0] * 360, -math.pi, math.pi)

        self.obstacles_received.clear()
        self.scan_pub.publish(scan)

        # Spin for a bit
        for _ in range(10):
            rclpy.spin_once(self.node, timeout_sec=0.1)

        self.assertEqual(len(self.obstacles_received), 0,
                        "Unexpected obstacles published")

@launch_testing.post_shutdown_test()
class TestShutdown(unittest.TestCase):
    def test_exit_codes(self, proc_info):
        launch_testing.asserts.assertExitCodes(proc_info)
```

**5. CMakeLists.txt:**

```cmake
cmake_minimum_required(VERSION 3.8)
project(my_sensor_package)

# Compiler settings
if(CMAKE_COMPILER_IS_GNUCXX OR CMAKE_CXX_COMPILER_ID MATCHES "Clang")
  add_compile_options(-Wall -Wextra -Wpedantic)
endif()

# Find dependencies
find_package(ament_cmake REQUIRED)
find_package(rclcpp REQUIRED)
find_package(rclcpp_components REQUIRED)
find_package(sensor_msgs REQUIRED)
find_package(geometry_msgs REQUIRED)

# Build library
add_library(sensor_processor SHARED
  src/sensor_processor.cpp
)
target_include_directories(sensor_processor PUBLIC
  $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
  $<INSTALL_INTERFACE:include>
)
ament_target_dependencies(sensor_processor
  rclcpp
  rclcpp_components
  sensor_msgs
  geometry_msgs
)
rclcpp_components_register_nodes(sensor_processor "my_sensor_package::SensorProcessor")

# Install
install(TARGETS sensor_processor
  ARCHIVE DESTINATION lib
  LIBRARY DESTINATION lib
  RUNTIME DESTINATION bin
)

install(DIRECTORY include/
  DESTINATION include
)

# Testing
if(BUILD_TESTING)
  find_package(ament_cmake_gtest REQUIRED)
  find_package(ament_cmake_pytest REQUIRED)
  find_package(launch_testing_ament_cmake REQUIRED)

  # Unit tests
  ament_add_gtest(test_sensor_processor
    test/test_sensor_processor.cpp
  )
  target_link_libraries(test_sensor_processor sensor_processor)
  ament_target_dependencies(test_sensor_processor rclcpp sensor_msgs geometry_msgs)

  # Integration tests
  add_launch_test(
    test/test_sensor_integration.py
    TIMEOUT 30
  )

  # Install test fixtures
  install(DIRECTORY test/fixtures/
    DESTINATION share/${PROJECT_NAME}/test/fixtures
  )
endif()

ament_package()
```

**6. package.xml:**

```xml
<?xml version="1.0"?>
<?xml-model href="http://download.ros.org/schema/package_format3.xsd" schematypens="http://www.w3.org/2001/XMLSchema"?>
<package format="3">
  <name>my_sensor_package</name>
  <version>1.0.0</version>
  <description>Sensor processing package with comprehensive tests</description>
  <maintainer email="dev@example.com">Developer</maintainer>
  <license>Apache-2.0</license>

  <buildtool_depend>ament_cmake</buildtool_depend>

  <depend>rclcpp</depend>
  <depend>rclcpp_components</depend>
  <depend>sensor_msgs</depend>
  <depend>geometry_msgs</depend>

  <test_depend>ament_cmake_gtest</test_depend>
  <test_depend>ament_cmake_pytest</test_depend>
  <test_depend>launch_testing_ament_cmake</test_depend>

  <export>
    <build_type>ament_cmake</build_type>
  </export>
</package>
```

**Running the tests:**

```bash
# Build
colcon build --packages-select my_sensor_package

# Run all tests
colcon test --packages-select my_sensor_package

# View results
colcon test-result --verbose

# Run only unit tests
./build/my_sensor_package/test_sensor_processor

# Run with coverage
colcon build --packages-select my_sensor_package \
    --cmake-args -DCMAKE_BUILD_TYPE=Debug -DCMAKE_CXX_FLAGS="--coverage"
colcon test --packages-select my_sensor_package
lcov --capture --directory build/my_sensor_package --output-file coverage.info
genhtml coverage.info --output-directory coverage_html
```

---

## Interview Questions

### Question 1: Explain the testing pyramid and why unit tests should outnumber integration tests.

**Difficulty:** ⭐⭐ (Medium)

**Answer:**

The testing pyramid is a strategy for distributing test types:

```
     /\
    /E2E\     System/E2E Tests (5-10%)
   /______\
  /Integr.\   Integration Tests (15-20%)
 /__________\
/   Unit     \ Unit Tests (70-80%)
/______________\
```

**Why more unit tests?**

1. **Speed:**
   - Unit tests: < 1 second (mocked dependencies, no I/O)
   - Integration tests: 1-10 seconds (real communication)
   - System tests: 10+ seconds (full system, simulation)

   Fast tests = quick feedback during development

2. **Reliability:**
   - Unit tests: Deterministic, no timing issues
   - Integration tests: Can be flaky (discovery, timing)
   - System tests: Most flaky (environment dependencies)

3. **Debugging:**
   - Unit tests: Failure points to specific function
   - Integration tests: Failure could be in multiple places
   - System tests: Hard to isolate root cause

4. **Coverage:**
   - Unit tests: Easy to cover edge cases (invalid input, exceptions)
   - Integration tests: Hard to trigger all code paths
   - System tests: Only test happy paths usually

**Example:**

For a path planning node:
- **Unit tests (70%):** Test individual functions like `calculate_path()`, `avoid_obstacle()`, `validate_goal()` with mocked map data
- **Integration tests (20%):** Test node communicates correctly with map server and controller
- **System tests (10%):** Test full navigation pipeline in Gazebo

**Analogy:**
Testing a car: Unit tests check each component (engine, brakes). Integration tests check components work together (engine + transmission). System tests check the whole car drives.

---

### Question 2: How would you test a node that subscribes to a topic and publishes to another?

**Difficulty:** ⭐⭐ (Medium)

**Answer:**

I would use a **integration test** with a test node that acts as both publisher (to provide input) and subscriber (to verify output).

**Approach:**

```python
import unittest
import rclpy
from std_msgs.msg import String

class TestMyNode(unittest.TestCase):
    def setUp(self):
        rclpy.init()
        self.test_node = rclpy.create_node('test_node')
        self.received_messages = []

        # Subscribe to node's output
        self.output_sub = self.test_node.create_subscription(
            String,
            '/output_topic',
            lambda msg: self.received_messages.append(msg.data),
            10
        )

        # Publish to node's input
        self.input_pub = self.test_node.create_publisher(
            String,
            '/input_topic',
            10
        )

        # Wait for discovery
        self.wait_for_connections()

    def wait_for_connections(self):
        timeout = 5.0
        end_time = self.test_node.get_clock().now() + rclpy.duration.Duration(seconds=timeout)
        while (self.input_pub.get_subscription_count() == 0 and
               self.test_node.get_clock().now() < end_time):
            rclpy.spin_once(self.test_node, timeout_sec=0.1)

    def test_transforms_message(self):
        # Publish input
        input_msg = String()
        input_msg.data = "hello"
        self.input_pub.publish(input_msg)

        # Spin to process
        timeout = 2.0
        end_time = self.test_node.get_clock().now() + rclpy.duration.Duration(seconds=timeout)
        while (len(self.received_messages) == 0 and
               self.test_node.get_clock().now() < end_time):
            rclpy.spin_once(self.test_node, timeout_sec=0.1)

        # Verify output
        self.assertEqual(len(self.received_messages), 1)
        self.assertEqual(self.received_messages[0], "HELLO")  # Expecting uppercase
```

**Key steps:**
1. Create test node
2. Subscribe to node's output topic
3. Publish to node's input topic
4. Wait for discovery (critical!)
5. Publish test message
6. Spin to process
7. Assert expected output received

**Alternative for C++:**

```cpp
TEST_F(MyNodeIntegrationTest, TransformsMessage) {
    bool received = false;
    std::string output_data;

    auto sub = test_node_->create_subscription<String>(
        "output_topic", 10,
        [&](const String::SharedPtr msg) {
            received = true;
            output_data = msg->data;
        }
    );

    auto pub = test_node_->create_publisher<String>("input_topic", 10);

    // Wait for discovery
    wait_for_subscriber(pub, 1);

    // Publish input
    auto msg = std::make_shared<String>();
    msg->data = "hello";
    pub->publish(*msg);

    // Spin until received or timeout
    auto timeout = std::chrono::seconds(2);
    auto start = std::chrono::steady_clock::now();
    while (!received && (std::chrono::steady_clock::now() - start < timeout)) {
        executor_->spin_some();
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }

    EXPECT_TRUE(received);
    EXPECT_EQ(output_data, "HELLO");
}
```

---

### Question 3: What is the difference between a mock and a stub? When would you use each?

**Difficulty:** ⭐⭐⭐ (Hard)

**Answer:**

**Stub:**
- Provides **canned responses** to calls
- Used to supply test data
- Doesn't verify how it's called
- Focus: **State verification**

**Mock:**
- Records and **verifies** how it's called
- Can set expectations (must be called N times)
- Fails test if expectations not met
- Focus: **Behavior verification**

**Example:**

```cpp
// STUB: Just returns fake data
class SensorStub : public SensorInterface {
public:
    double read_temperature() override {
        return 25.0;  // Always returns 25°C
    }
};

TEST(ControllerTest, UsesTemperature) {
    SensorStub sensor;
    Controller controller(&sensor);

    auto temp = controller.get_current_temp();
    EXPECT_EQ(temp, 25.0);  // Verify state
}

// MOCK: Verifies expectations
class SensorMock : public SensorInterface {
public:
    MOCK_METHOD(double, read_temperature, (), (override));
};

TEST(ControllerTest, ReadsTemperatureOnce) {
    SensorMock sensor;

    // Expectation: read_temperature called exactly once
    EXPECT_CALL(sensor, read_temperature())
        .Times(1)
        .WillOnce(Return(25.0));

    Controller controller(&sensor);
    controller.get_current_temp();

    // Mock automatically verifies expectations at end of test
}
```

**When to use:**

**Use Stub when:**
- You just need test data
- You don't care how many times it's called
- Testing state/output of the unit

**Use Mock when:**
- You need to verify behavior (how many calls, with what arguments)
- Testing interaction between objects
- Enforcing contracts

**ROS2 Example:**

```cpp
// STUB: Provide fake sensor data
class LaserScanStub {
public:
    sensor_msgs::msg::LaserScan get_scan() {
        sensor_msgs::msg::LaserScan scan;
        scan.ranges = {1.0, 2.0, 3.0};
        return scan;
    }
};

TEST(ProcessorTest, ProcessesScan) {
    LaserScanStub sensor;
    Processor processor;

    auto result = processor.process(sensor.get_scan());
    EXPECT_EQ(result.obstacle_count, 3);  // Verify state
}

// MOCK: Verify publisher is called
class MockPublisher {
public:
    MOCK_METHOD(void, publish, (const String&), ());
};

TEST(ProcessorTest, PublishesResult) {
    MockPublisher mock_pub;

    // Expect publish called once
    EXPECT_CALL(mock_pub, publish(_))
        .Times(1);

    Processor processor(&mock_pub);
    processor.process_data();

    // Mock verifies publish was called
}
```

**Rule of thumb:**
- Stub = "Give me fake data"
- Mock = "Tell me if I called you correctly"

---

### Question 4: How would you handle flaky tests that intermittently fail due to timing issues?

**Difficulty:** ⭐⭐⭐ (Hard)

**Answer:**

**Root cause:** Flaky tests usually stem from race conditions, discovery delays, or timing assumptions.

**Solutions:**

**1. Wait for Discovery (Most Common Fix):**

```cpp
// BAD: Publish immediately
auto pub = node->create_publisher<String>("topic", 10);
pub->publish(msg);  // May publish before subscriber ready!

// GOOD: Wait for subscribers
auto pub = node->create_publisher<String>("topic", 10);

auto timeout = std::chrono::seconds(5);
auto start = std::chrono::steady_clock::now();
while (pub->get_subscription_count() == 0) {
    if (std::chrono::steady_clock::now() - start > timeout) {
        FAIL() << "Subscriber not found within timeout";
    }
    executor->spin_some();
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
}

pub->publish(msg);  // Now subscriber is ready
```

**2. Use Retry Logic with Timeouts:**

```cpp
// BAD: Single check
executor->spin_some();
EXPECT_TRUE(received);  // May not have processed yet!

// GOOD: Retry with timeout
bool wait_for_condition(std::function<bool()> condition, std::chrono::seconds timeout) {
    auto start = std::chrono::steady_clock::now();
    while (!condition()) {
        if (std::chrono::steady_clock::now() - start > timeout) {
            return false;
        }
        executor->spin_some();
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }
    return true;
}

// Usage
EXPECT_TRUE(wait_for_condition([&]() { return received; }, std::chrono::seconds(2)));
```

**3. Use Simulation Time:**

```python
# Instead of real time delays
time.sleep(5)  # FLAKY!

# Use simulation time
clock_msg = Clock()
clock_msg.clock.sec = 5
clock_pub.publish(clock_msg)
```

**4. Increase QoS Depth:**

```cpp
// BAD: Small queue, messages may be dropped
auto qos = rclcpp::QoS(1);

// GOOD: Larger queue for tests
auto qos = rclcpp::QoS(100);  // Ensure no messages lost during test
```

**5. Isolate Tests with Unique Domains:**

```bash
# Prevent interference between parallel test runs
export ROS_DOMAIN_ID=$(shuf -i 100-200 -n 1)
colcon test
```

**6. Mock Time-Dependent Behavior:**

```cpp
// BAD: Tests real time
std::this_thread::sleep_for(std::chrono::seconds(5));  // Slow and flaky

// GOOD: Inject clock and mock time
class MyNode {
public:
    MyNode(std::shared_ptr<rclcpp::Clock> clock) : clock_(clock) {}

    bool is_timeout() {
        return (clock_->now() - last_update_).seconds() > 5.0;
    }
private:
    std::shared_ptr<rclcpp::Clock> clock_;
};

TEST(MyNodeTest, DetectsTimeout) {
    auto mock_clock = std::make_shared<MockClock>();
    MyNode node(mock_clock);

    mock_clock->set_now(rclcpp::Time(0, 0));
    node.update();

    mock_clock->set_now(rclcpp::Time(6, 0));  // Jump forward instantly
    EXPECT_TRUE(node.is_timeout());  // Fast and deterministic!
}
```

**7. Identify Flakiness Systematically:**

```bash
# Run test 100 times to find flakiness
for i in {1..100}; do
    echo "Run $i"
    ./build/my_package/test_my_node || break
done

# If fails, add logging to identify race condition
```

**Prevention:**
- Always wait for discovery
- Use timeouts with retry logic
- Avoid hard-coded delays
- Use simulation time for time-dependent tests
- Isolate tests (unique domains/namespaces)

---

### Question 5: How would you measure and improve test coverage in a ROS2 package?

**Difficulty:** ⭐⭐ (Medium)

**Answer:**

**Measuring Coverage:**

**Step 1: Build with Coverage Flags**

```bash
colcon build --packages-select my_package \
    --cmake-args -DCMAKE_BUILD_TYPE=Debug \
                 -DCMAKE_CXX_FLAGS="--coverage" \
                 -DCMAKE_C_FLAGS="--coverage"
```

**Step 2: Run Tests**

```bash
colcon test --packages-select my_package
```

**Step 3: Generate Coverage Report**

```bash
# Using lcov
lcov --capture --directory build/my_package --output-file coverage.info
lcov --remove coverage.info '/usr/*' '*/test/*' --output-file coverage_filtered.info
genhtml coverage_filtered.info --output-directory coverage_html

# Open report
firefox coverage_html/index.html
```

**Coverage report shows:**
- **Line coverage:** % of lines executed
- **Function coverage:** % of functions called
- **Branch coverage:** % of if/else branches taken

**Interpreting Results:**

```
File: sensor_processor.cpp
Lines: 85/100 (85%)
Functions: 12/15 (80%)
Branches: 45/60 (75%)

Uncovered lines: 42, 55-60, 89
```

**Improving Coverage:**

**1. Test Uncovered Lines:**

```cpp
// Coverage shows line 42 not covered
if (ranges.empty()) {
    throw std::invalid_argument("Empty scan");  // Line 42
}

// Add test for empty input
TEST_F(ProcessorTest, ThrowsOnEmptyScan) {
    sensor_msgs::msg::LaserScan empty_scan;
    EXPECT_THROW(processor->process(empty_scan), std::invalid_argument);
}
```

**2. Test All Branches:**

```cpp
// Original code
if (distance < threshold) {
    return true;   // Branch 1
} else {
    return false;  // Branch 2
}

// Need tests for both branches
TEST(DetectorTest, DetectsCloseObstacle) {
    EXPECT_TRUE(detector.is_close(0.5, 1.0));  // Branch 1
}

TEST(DetectorTest, IgnoresDistantObstacle) {
    EXPECT_FALSE(detector.is_close(2.0, 1.0));  // Branch 2
}
```

**3. Test Error Paths:**

```cpp
// Error handling code often uncovered
try {
    risky_operation();
} catch (const std::exception &e) {
    RCLCPP_ERROR(logger_, "Error: %s", e.what());  // Uncovered!
    return false;
}

// Add test that triggers exception
TEST(MyNodeTest, HandlesError) {
    // Setup to trigger exception
    mock_->set_throw_on_call(true);
    EXPECT_FALSE(node->risky_operation());
}
```

**4. Test Edge Cases:**

```cpp
// Test boundary conditions
TEST(ValidatorTest, AcceptsZero) {
    EXPECT_TRUE(validate(0));
}

TEST(ValidatorTest, AcceptsMaxValue) {
    EXPECT_TRUE(validate(std::numeric_limits<double>::max()));
}

TEST(ValidatorTest, RejectsNegative) {
    EXPECT_FALSE(validate(-1.0));
}

TEST(ValidatorTest, RejectsNaN) {
    EXPECT_FALSE(validate(NAN));
}
```

**Good Coverage Targets:**

| Test Level | Line Coverage Target |
|------------|---------------------|
| Unit tests | 80-90% |
| Integration tests | 60-70% |
| System tests | N/A (focus on critical paths) |

**Coverage is NOT enough:**
- 100% coverage doesn't mean bug-free
- Must also test edge cases, error conditions
- Coverage shows what's tested, not what's tested **well**

**Example CMakeLists.txt with coverage:**

```cmake
if(BUILD_TESTING)
    if(CMAKE_BUILD_TYPE STREQUAL "Debug")
        set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} --coverage")

        add_custom_target(coverage
            COMMAND lcov --capture --directory . --output-file coverage.info
            COMMAND lcov --remove coverage.info '/usr/*' '*/test/*' --output-file coverage_filtered.info
            COMMAND genhtml coverage_filtered.info --output-directory coverage_html
            COMMAND echo "Coverage report: coverage_html/index.html"
            WORKING_DIRECTORY ${CMAKE_BINARY_DIR}
        )
    endif()
endif()
```

**Usage:**
```bash
colcon build --cmake-args -DCMAKE_BUILD_TYPE=Debug
colcon test
cd build/my_package
make coverage
```

---

## Practice Tasks

### Practice Task 1: Build a Comprehensive Test Suite

**Objective:** Create unit, integration, and system tests for a robot navigation node.

**Node Description:**
```
NavigationNode:
- Subscribes to /scan (LaserScan)
- Subscribes to /goal (PoseStamped)
- Publishes /cmd_vel (Twist)
- Logic: Moves toward goal while avoiding obstacles
```

**Requirements:**

**1. Unit Tests (70%):**
- Test `calculate_velocity(current_pose, goal_pose)` function
- Test `detect_obstacles(scan)` function
- Test `is_goal_reached(current_pose, goal_pose, tolerance)` function
- Test edge cases: empty scan, NaN values, zero distance to goal
- Test error handling: invalid goal, sensor disconnected
- Use mocks for all ROS2 dependencies
- Achieve > 85% line coverage

**2. Integration Tests (20%):**
- Test node receives scan and publishes cmd_vel
- Test node stops when goal reached
- Test node publishes zero velocity when obstacle detected
- Use `launch_testing` framework
- Test with various scan patterns (clear, blocked, partial)

**3. System Test (10%):**
- Launch node with Gazebo simulation
- Send goal position
- Verify robot reaches goal within timeout
- Verify robot avoids obstacles (doesn't collide)
- Record success rate over 10 runs

**Deliverables:**
- `test/test_navigation_unit.cpp` (unit tests)
- `test/test_navigation_integration.py` (integration tests)
- `test/test_navigation_system.py` (system test)
- `CMakeLists.txt` with test configuration
- Coverage report showing > 80% coverage

---

### Practice Task 2: Debug and Fix Flaky Tests

**Scenario:** You're given a test suite with 3 flaky tests that fail intermittently (pass 70% of the time).

**Flaky Test 1: Message Timing**
```cpp
TEST_F(IntegrationTest, ReceivesMessage) {
    auto pub = node_->create_publisher<String>("topic", 10);
    auto sub = node_->create_subscription<String>("topic", 10, callback);

    pub->publish(make_message("test"));
    executor_->spin_some();

    EXPECT_TRUE(message_received);  // Fails 30% of time
}
```

**Flaky Test 2: Action Timeout**
```python
def test_action_completes(self):
    goal = Fibonacci.Goal(order=10)
    future = self.client.send_goal_async(goal)
    rclpy.spin_once(self.node)  # Spin once

    result = future.result()
    self.assertIsNotNone(result)  # Fails sometimes
```

**Flaky Test 3: Multi-Node Discovery**
```cpp
TEST_F(MultiNodeTest, NodesDiscoverEachOther) {
    auto node1 = create_node("node1");
    auto node2 = create_node("node2");

    // Immediately check
    EXPECT_GT(node1->count_publishers("/topic"), 0);  # Fails sometimes
}
```

**Tasks:**
1. Identify root cause of each flaky test
2. Fix tests to be 100% reliable
3. Add proper timeout and retry logic
4. Add discovery wait helpers
5. Document the fixes
6. Run each test 100 times to verify fix

**Deliverables:**
- Fixed test code
- README explaining what was wrong and how you fixed it
- Proof of 100/100 passing runs for each test

---

### Practice Task 3: Implement Mock-Based Testing

**Objective:** Refactor an existing node to be testable with mocks, then write comprehensive unit tests.

**Given Node (Tightly Coupled, Hard to Test):**
```cpp
class RobotController : public rclcpp::Node {
public:
    RobotController() : Node("robot_controller") {
        scan_sub_ = create_subscription<LaserScan>(
            "scan", 10,
            [this](const LaserScan::SharedPtr msg) {
                auto obstacles = detect_obstacles(*msg);
                if (obstacles.size() > 0) {
                    stop_robot();
                } else {
                    move_forward();
                }
            }
        );

        cmd_pub_ = create_publisher<Twist>("cmd_vel", 10);
    }

private:
    std::vector<Point> detect_obstacles(const LaserScan& scan) {
        // Complex logic...
    }

    void stop_robot() {
        auto msg = Twist();
        msg.linear.x = 0.0;
        cmd_pub_->publish(msg);
    }

    void move_forward() {
        auto msg = Twist();
        msg.linear.x = 0.5;
        cmd_pub_->publish(msg);
    }

    rclcpp::Subscription<LaserScan>::SharedPtr scan_sub_;
    rclcpp::Publisher<Twist>::SharedPtr cmd_pub_;
};
```

**Requirements:**

**1. Refactor for Testability:**
- Extract `detect_obstacles` to be independently testable
- Use dependency injection for publisher (allow mocking)
- Separate business logic from ROS2 communication

**2. Create Interfaces:**
```cpp
class VelocityPublisher {
public:
    virtual void publish_velocity(double linear, double angular) = 0;
};

class ObstacleDetector {
public:
    virtual std::vector<Point> detect(const LaserScan& scan) = 0;
};
```

**3. Implement Mocks:**
```cpp
class MockVelocityPublisher : public VelocityPublisher {
public:
    MOCK_METHOD(void, publish_velocity, (double, double), (override));
};

class MockObstacleDetector : public ObstacleDetector {
public:
    MOCK_METHOD(std::vector<Point>, detect, (const LaserScan&), (override));
};
```

**4. Write Unit Tests:**
- Test `detect_obstacles` with various scan patterns
- Test controller stops when obstacles detected (using mocks)
- Test controller moves when path clear (using mocks)
- Verify publish_velocity called with correct values
- Test edge cases: empty scan, all obstacles, partial obstacles

**5. Write Integration Test:**
- Test refactored node with real ROS2 communication
- Verify behavior matches original node

**Deliverables:**
- Refactored `robot_controller.hpp` and `.cpp`
- Mock implementations
- `test/test_robot_controller.cpp` with 10+ unit tests
- `test/test_robot_controller_integration.py`
- Coverage report showing > 90% coverage

---

## Quick Reference

### Common Test Assertions

```cpp
// Equality
EXPECT_EQ(a, b);        // a == b
EXPECT_NE(a, b);        // a != b
EXPECT_LT(a, b);        // a < b
EXPECT_LE(a, b);        // a <= b
EXPECT_GT(a, b);        // a > b
EXPECT_GE(a, b);        // a >= b

// Boolean
EXPECT_TRUE(condition);
EXPECT_FALSE(condition);

// Floating point
EXPECT_DOUBLE_EQ(a, b);        // Exact equality
EXPECT_NEAR(a, b, tolerance);  // Within tolerance

// Strings
EXPECT_STREQ(str1, str2);
EXPECT_STRCASEEQ(str1, str2);  // Case-insensitive

// Exceptions
EXPECT_THROW(statement, exception_type);
EXPECT_NO_THROW(statement);
EXPECT_ANY_THROW(statement);

// Containers
EXPECT_THAT(container, ::testing::Contains(element));
EXPECT_THAT(container, ::testing::SizeIs(n));
```

### Test Fixture Template

```cpp
class MyNodeTest : public ::testing::Test {
protected:
    static void SetUpTestCase() {
        // Once before all tests
        rclcpp::init(0, nullptr);
    }

    static void TearDownTestCase() {
        // Once after all tests
        rclcpp::shutdown();
    }

    void SetUp() override {
        // Before each test
        node_ = std::make_shared<MyNode>();
    }

    void TearDown() override {
        // After each test
        node_.reset();
    }

    std::shared_ptr<MyNode> node_;
};
```

### Mock Expectations

```cpp
// Call count
EXPECT_CALL(mock, method())
    .Times(0);           // Never called
    .Times(1);           // Called exactly once
    .Times(AtLeast(1));  // Called at least once
    .Times(Between(2, 5)); // Called 2-5 times

// Return values
EXPECT_CALL(mock, method())
    .WillOnce(Return(42));           // First call returns 42
    .WillRepeatedly(Return(100));    // All subsequent calls return 100

// Arguments
EXPECT_CALL(mock, method(5, _))      // First arg is 5, second is anything
EXPECT_CALL(mock, method(Gt(10)))    // Argument > 10
EXPECT_CALL(mock, method(DoubleEq(3.14, 0.01))) // Arg within tolerance

// Actions
EXPECT_CALL(mock, method(_))
    .WillOnce(Invoke([](int x) { return x * 2; })); // Custom logic
```

### Build and Run Tests

```bash
# Build with tests
colcon build --packages-select my_package

# Run all tests
colcon test --packages-select my_package

# Run specific test executable
./build/my_package/test_my_node

# Run with filter
./build/my_package/test_my_node --gtest_filter=MyNodeTest.*

# Verbose output
colcon test --packages-select my_package --event-handlers console_direct+

# View results
colcon test-result --all
colcon test-result --verbose

# Coverage
colcon build --cmake-args -DCMAKE_BUILD_TYPE=Debug -DCMAKE_CXX_FLAGS="--coverage"
colcon test
lcov --capture --directory build --output-file coverage.info
genhtml coverage.info --output-directory coverage_html
```

### launch_testing Template

```python
import unittest
import rclpy
import launch
import launch_ros
import launch_testing
import pytest

@pytest.mark.launch_test
def generate_test_description():
    node = launch_ros.actions.Node(
        package='my_package',
        executable='my_node',
        name='my_node'
    )

    return (
        launch.LaunchDescription([
            node,
            launch_testing.actions.ReadyToTest()
        ]),
        {'my_node': node}
    )

class TestMyNode(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        rclpy.init()

    @classmethod
    def tearDownClass(cls):
        rclpy.shutdown()

    def setUp(self):
        self.node = rclpy.create_node('test_node')

    def tearDown(self):
        self.node.destroy_node()

    def test_something(self):
        # Test implementation
        pass

@launch_testing.post_shutdown_test()
class TestShutdown(unittest.TestCase):
    def test_exit_codes(self, proc_info):
        launch_testing.asserts.assertExitCodes(proc_info)
```

---

This completes Topic 4.1: Testing Strategies!
