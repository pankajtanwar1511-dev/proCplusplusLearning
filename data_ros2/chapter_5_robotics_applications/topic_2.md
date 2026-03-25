# Chapter 5: Robotics Applications
## Topic 5.2: Computer Vision & Image Processing with ROS2

---

## THEORY

### 1. Image Transport in ROS2

**Image Messages in ROS2:**

ROS2 uses standardized message types for images:

| Message Type | Package | Purpose | Use Case |
|--------------|---------|---------|----------|
| **sensor_msgs/Image** | sensor_msgs | Raw image data | Uncompressed images |
| **sensor_msgs/CompressedImage** | sensor_msgs | JPEG/PNG compressed | Bandwidth-limited networks |
| **sensor_msgs/CameraInfo** | sensor_msgs | Camera calibration | Undistortion, depth estimation |

**Why Compression Matters:**

```
Raw Image (640×480 RGB):
640 × 480 × 3 bytes = 921,600 bytes ≈ 900 KB per frame

At 30 FPS:
900 KB × 30 = 27 MB/s bandwidth!

JPEG Compressed:
~50-100 KB per frame
30 FPS = 1.5-3 MB/s bandwidth ✓
```

**Image Transport Library:**

ROS2 `image_transport` provides:
- Automatic compression/decompression
- Plugin system for different codecs (JPEG, PNG, H.264, Theora)
- Transparent transport (subscriber doesn't need to know encoding)

**Publisher with Compression:**

```cpp
#include <image_transport/image_transport.hpp>
#include <sensor_msgs/msg/image.hpp>

class CameraPublisher : public rclcpp::Node {
public:
    CameraPublisher() : Node("camera_pub") {
        // Create image transport publisher
        image_transport::ImageTransport it(shared_from_this());
        pub_ = it.advertise("camera/image", 1);

        // Automatically publishes to:
        // - /camera/image/raw (uncompressed)
        // - /camera/image/compressed (JPEG)
        // - /camera/image/theora (video codec)
    }

private:
    image_transport::Publisher pub_;
};
```

**Subscriber with Automatic Decompression:**

```cpp
class CameraSubscriber : public rclcpp::Node {
public:
    CameraSubscriber() : Node("camera_sub") {
        image_transport::ImageTransport it(shared_from_this());

        // Subscribes to best available transport
        sub_ = it.subscribe("camera/image", 1,
            std::bind(&CameraSubscriber::image_callback, this, std::placeholders::_1));
    }

private:
    void image_callback(const sensor_msgs::msg::Image::ConstSharedPtr& msg) {
        // Automatically decompressed regardless of transport
        RCLCPP_INFO(get_logger(), "Received image: %dx%d", msg->width, msg->height);
    }

    image_transport::Subscriber sub_;
};
```

---

### 2. OpenCV Integration with cv_bridge

**cv_bridge:**

Converts between ROS image messages and OpenCV `cv::Mat`.

**ROS → OpenCV:**

```cpp
#include <cv_bridge/cv_bridge.h>
#include <opencv2/opencv.hpp>

void image_callback(const sensor_msgs::msg::Image::ConstSharedPtr& msg) {
    // Convert ROS message to OpenCV
    cv_bridge::CvImagePtr cv_ptr;
    try {
        cv_ptr = cv_bridge::toCvCopy(msg, sensor_msgs::image_encodings::BGR8);
    } catch (cv_bridge::Exception& e) {
        RCLCPP_ERROR(get_logger(), "cv_bridge exception: %s", e.what());
        return;
    }

    // Now have OpenCV Mat
    cv::Mat& image = cv_ptr->image;

    // Process with OpenCV
    cv::GaussianBlur(image, image, cv::Size(5, 5), 0);
    cv::imshow("Processed", image);
    cv::waitKey(1);
}
```

**OpenCV → ROS:**

```cpp
void publish_processed_image() {
    // Create OpenCV image
    cv::Mat image = cv::Mat::zeros(480, 640, CV_8UC3);
    cv::circle(image, cv::Point(320, 240), 50, cv::Scalar(0, 255, 0), -1);

    // Convert to ROS message
    std_msgs::msg::Header header;
    header.stamp = now();
    header.frame_id = "camera_frame";

    sensor_msgs::msg::Image::SharedPtr msg =
        cv_bridge::CvImage(header, "bgr8", image).toImageMsg();

    // Publish
    pub_->publish(*msg);
}
```

**Image Encodings:**

| Encoding | Channels | Depth | OpenCV Type | Use Case |
|----------|----------|-------|-------------|----------|
| **mono8** | 1 | 8-bit | CV_8UC1 | Grayscale |
| **mono16** | 1 | 16-bit | CV_16UC1 | Depth images |
| **bgr8** | 3 | 8-bit | CV_8UC3 | Color (BGR order) |
| **rgb8** | 3 | 8-bit | CV_8UC3 | Color (RGB order) |
| **bgra8** | 4 | 8-bit | CV_8UC4 | Color + alpha |
| **32FC1** | 1 | 32-bit float | CV_32FC1 | Depth (meters) |

**Important:** OpenCV uses **BGR**, ROS typically uses **RGB**. Use correct encoding!

---

### 3. Camera Calibration

**Why Calibrate?**

Real cameras have distortion:
- **Radial distortion**: Straight lines appear curved (barrel/pincushion)
- **Tangential distortion**: Image plane not parallel to lens

**Calibration Parameters (CameraInfo):**

```yaml
# Intrinsic matrix K (3x3):
K = [fx  0  cx]
    [ 0 fy  cy]
    [ 0  0   1]

fx, fy: Focal lengths (pixels)
cx, cy: Principal point (image center)

# Distortion coefficients D:
D = [k1, k2, p1, p2, k3]

k1, k2, k3: Radial distortion
p1, p2: Tangential distortion
```

**Calibration Process:**

1. **Capture checkerboard images** from multiple angles
2. **Run calibration tool**:
   ```bash
   ros2 run camera_calibration cameracalibrator \
       --size 8x6 \
       --square 0.025 \
       image:=/camera/image \
       camera:=/camera
   ```
3. **Save calibration** → outputs YAML file
4. **Publish CameraInfo** with every image

**Undistorting Images:**

```cpp
#include <image_geometry/pinhole_camera_model.h>

class ImageUndistorter : public rclcpp::Node {
public:
    ImageUndistorter() : Node("undistorter") {
        image_sub_.subscribe(this, "image_raw");
        info_sub_.subscribe(this, "camera_info");

        sync_ = std::make_shared<message_filters::Synchronizer<SyncPolicy>>(
            SyncPolicy(10), image_sub_, info_sub_);
        sync_->registerCallback(
            std::bind(&ImageUndistorter::callback, this, _1, _2));

        image_pub_ = this->create_publisher<sensor_msgs::msg::Image>("image_rect", 10);
    }

private:
    void callback(const sensor_msgs::msg::Image::ConstSharedPtr& image_msg,
                  const sensor_msgs::msg::CameraInfo::ConstSharedPtr& info_msg) {

        // Setup camera model
        cam_model_.fromCameraInfo(info_msg);

        // Convert to OpenCV
        cv_bridge::CvImagePtr cv_ptr = cv_bridge::toCvCopy(image_msg);

        // Undistort
        cv::Mat undistorted;
        cam_model_.rectifyImage(cv_ptr->image, undistorted);

        // Publish
        sensor_msgs::msg::Image::SharedPtr out_msg =
            cv_bridge::CvImage(image_msg->header, image_msg->encoding, undistorted).toImageMsg();
        image_pub_->publish(*out_msg);
    }

    message_filters::Subscriber<sensor_msgs::msg::Image> image_sub_;
    message_filters::Subscriber<sensor_msgs::msg::CameraInfo> info_sub_;
    std::shared_ptr<message_filters::Synchronizer<SyncPolicy>> sync_;

    rclcpp::Publisher<sensor_msgs::msg::Image>::SharedPtr image_pub_;
    image_geometry::PinholeCameraModel cam_model_;
};
```

---

### 4. Common Vision Tasks

**A. Object Detection:**

Detect objects in images and publish bounding boxes.

**Pipeline:**
```
Image → Preprocessing → Deep Learning Model (YOLO/SSD) → Bounding Boxes → TF Broadcast
```

**Example with YOLOv8:**

```python
import rclpy
from rclpy.node import Node
from sensor_msgs.msg import Image
from vision_msgs.msg import Detection2DArray, Detection2D, ObjectHypothesisWithPose
from cv_bridge import CvBridge
from ultralytics import YOLO
import cv2

class ObjectDetector(Node):
    def __init__(self):
        super().__init__('object_detector')

        # Load YOLO model
        self.model = YOLO('yolov8n.pt')
        self.bridge = CvBridge()

        # Subscribers & Publishers
        self.image_sub = self.create_subscription(
            Image, 'camera/image', self.image_callback, 10)

        self.detection_pub = self.create_publisher(
            Detection2DArray, 'detections', 10)

        self.viz_pub = self.create_publisher(
            Image, 'detections_image', 10)

    def image_callback(self, msg):
        # Convert to OpenCV
        cv_image = self.bridge.imgmsg_to_cv2(msg, 'bgr8')

        # Run YOLO
        results = self.model(cv_image)

        # Create detection message
        detection_array = Detection2DArray()
        detection_array.header = msg.header

        for result in results:
            for box in result.boxes:
                detection = Detection2D()

                # Bounding box
                x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                detection.bbox.center.position.x = float((x1 + x2) / 2)
                detection.bbox.center.position.y = float((y1 + y2) / 2)
                detection.bbox.size_x = float(x2 - x1)
                detection.bbox.size_y = float(y2 - y1)

                # Class and confidence
                hypothesis = ObjectHypothesisWithPose()
                hypothesis.hypothesis.class_id = str(int(box.cls))
                hypothesis.hypothesis.score = float(box.conf)
                detection.results.append(hypothesis)

                detection_array.detections.append(detection)

                # Draw on image
                cv2.rectangle(cv_image, (int(x1), int(y1)), (int(x2), int(y2)),
                             (0, 255, 0), 2)
                label = f"{self.model.names[int(box.cls)]}: {box.conf:.2f}"
                cv2.putText(cv_image, label, (int(x1), int(y1)-10),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

        # Publish detections
        self.detection_pub.publish(detection_array)

        # Publish visualization
        viz_msg = self.bridge.cv2_to_imgmsg(cv_image, 'bgr8')
        viz_msg.header = msg.header
        self.viz_pub.publish(viz_msg)
```

---

**B. Line Detection for Lane Following:**

Detect lane lines for autonomous driving.

```cpp
#include <opencv2/opencv.hpp>

class LaneDetector : public rclcpp::Node {
public:
    void detect_lanes(const cv::Mat& image) {
        // 1. Convert to grayscale
        cv::Mat gray;
        cv::cvtColor(image, gray, cv::COLOR_BGR2GRAY);

        // 2. Gaussian blur
        cv::GaussianBlur(gray, gray, cv::Size(5, 5), 0);

        // 3. Canny edge detection
        cv::Mat edges;
        cv::Canny(gray, edges, 50, 150);

        // 4. Region of interest (trapezoid mask)
        cv::Mat mask = cv::Mat::zeros(edges.size(), edges.type());
        std::vector<cv::Point> roi_points = {
            cv::Point(0, image.rows),
            cv::Point(image.cols * 0.4, image.rows * 0.6),
            cv::Point(image.cols * 0.6, image.rows * 0.6),
            cv::Point(image.cols, image.rows)
        };
        cv::fillConvexPoly(mask, roi_points, cv::Scalar(255));
        cv::bitwise_and(edges, mask, edges);

        // 5. Hough transform for lines
        std::vector<cv::Vec4i> lines;
        cv::HoughLinesP(edges, lines, 1, CV_PI/180, 50, 50, 10);

        // 6. Separate left and right lanes
        std::vector<cv::Vec4i> left_lines, right_lines;
        for (const auto& line : lines) {
            float slope = (line[3] - line[1]) / float(line[2] - line[0] + 1e-6);

            if (slope < -0.5) {  // Left lane (negative slope)
                left_lines.push_back(line);
            } else if (slope > 0.5) {  // Right lane (positive slope)
                right_lines.push_back(line);
            }
        }

        // 7. Average lines
        auto left_lane = average_lines(left_lines, image.rows);
        auto right_lane = average_lines(right_lines, image.rows);

        // 8. Compute steering angle
        float steering_angle = compute_steering(left_lane, right_lane, image.cols);

        RCLCPP_INFO(get_logger(), "Steering angle: %.2f°", steering_angle);
    }

private:
    cv::Vec4i average_lines(const std::vector<cv::Vec4i>& lines, int height) {
        if (lines.empty()) return cv::Vec4i(0, 0, 0, 0);

        std::vector<float> slopes, intercepts;
        for (const auto& line : lines) {
            float slope = (line[3] - line[1]) / float(line[2] - line[0] + 1e-6);
            float intercept = line[1] - slope * line[0];
            slopes.push_back(slope);
            intercepts.push_back(intercept);
        }

        float avg_slope = std::accumulate(slopes.begin(), slopes.end(), 0.0f) / slopes.size();
        float avg_intercept = std::accumulate(intercepts.begin(), intercepts.end(), 0.0f) / intercepts.size();

        int y1 = height;
        int y2 = int(height * 0.6);
        int x1 = int((y1 - avg_intercept) / avg_slope);
        int x2 = int((y2 - avg_intercept) / avg_slope);

        return cv::Vec4i(x1, y1, x2, y2);
    }

    float compute_steering(const cv::Vec4i& left, const cv::Vec4i& right, int width) {
        int lane_center = (left[0] + right[0]) / 2;
        int image_center = width / 2;

        float offset = lane_center - image_center;
        float steering_angle = std::atan(offset / (width * 0.5)) * 180.0 / CV_PI;

        return steering_angle;
    }
};
```

---

**C. Feature Detection & Matching:**

Useful for visual odometry, SLAM, object recognition.

```cpp
#include <opencv2/features2d.hpp>

void detect_and_match_features(const cv::Mat& img1, const cv::Mat& img2) {
    // 1. Detect ORB features
    cv::Ptr<cv::ORB> orb = cv::ORB::create(1000);

    std::vector<cv::KeyPoint> kp1, kp2;
    cv::Mat desc1, desc2;

    orb->detectAndCompute(img1, cv::noArray(), kp1, desc1);
    orb->detectAndCompute(img2, cv::noArray(), kp2, desc2);

    // 2. Match features
    cv::BFMatcher matcher(cv::NORM_HAMMING);
    std::vector<cv::DMatch> matches;
    matcher.match(desc1, desc2, matches);

    // 3. Filter good matches (Lowe's ratio test)
    float max_dist = 0;
    float min_dist = 100;
    for (const auto& match : matches) {
        if (match.distance < min_dist) min_dist = match.distance;
        if (match.distance > max_dist) max_dist = match.distance;
    }

    std::vector<cv::DMatch> good_matches;
    for (const auto& match : matches) {
        if (match.distance <= std::max(2 * min_dist, 30.0f)) {
            good_matches.push_back(match);
        }
    }

    // 4. Draw matches
    cv::Mat img_matches;
    cv::drawMatches(img1, kp1, img2, kp2, good_matches, img_matches);

    cv::imshow("Feature Matches", img_matches);
    cv::waitKey(0);
}
```

---

### 5. Depth Estimation

**Stereo Vision:**

Two cameras (known baseline) → triangulate to get depth.

**Disparity to Depth Formula:**
```
Depth (Z) = (focal_length × baseline) / disparity

Where:
- focal_length: camera focal length (pixels)
- baseline: distance between cameras (meters)
- disparity: pixel offset between left and right images
```

**Stereo Matching with OpenCV:**

```cpp
#include <opencv2/calib3d.hpp>

class StereoDepth : public rclcpp::Node {
public:
    void compute_depth(const cv::Mat& left, const cv::Mat& right) {
        // Convert to grayscale
        cv::Mat left_gray, right_gray;
        cv::cvtColor(left, left_gray, cv::COLOR_BGR2GRAY);
        cv::cvtColor(right, right_gray, cv::COLOR_BGR2GRAY);

        // Create stereo matcher (Semi-Global Block Matching)
        cv::Ptr<cv::StereoSGBM> stereo = cv::StereoSGBM::create(
            0,               // min disparity
            128,             // max disparity (must be divisible by 16)
            5,               // block size
            600,             // P1 (smoothness penalty)
            2400,            // P2 (smoothness penalty)
            10,              // max disparity difference
            16,              // pre-filter cap
            1,               // uniqueness ratio
            100,             // speckle window size
            32               // speckle range
        );

        // Compute disparity
        cv::Mat disparity;
        stereo->compute(left_gray, right_gray, disparity);

        // Convert to depth (meters)
        cv::Mat depth;
        disparity.convertTo(depth, CV_32F, 1.0/16.0);  // Disparity is in 16-bit fixed point

        float focal_length = 700.0;  // pixels
        float baseline = 0.12;        // meters (12 cm)

        depth = (focal_length * baseline) / depth;

        // Visualize
        cv::Mat depth_viz;
        cv::normalize(depth, depth_viz, 0, 255, cv::NORM_MINMAX, CV_8U);
        cv::applyColorMap(depth_viz, depth_viz, cv::COLORMAP_JET);

        cv::imshow("Depth", depth_viz);
        cv::waitKey(1);
    }
};
```

**RGB-D Cameras (e.g., RealSense, Kinect):**

Provide aligned color + depth images directly.

```cpp
void rgbd_callback(const sensor_msgs::msg::Image::ConstSharedPtr& rgb_msg,
                   const sensor_msgs::msg::Image::ConstSharedPtr& depth_msg) {

    cv_bridge::CvImagePtr rgb_ptr = cv_bridge::toCvCopy(rgb_msg, "bgr8");
    cv_bridge::CvImagePtr depth_ptr = cv_bridge::toCvCopy(depth_msg, "32FC1");

    cv::Mat& rgb = rgb_ptr->image;
    cv::Mat& depth = depth_ptr->image;  // Depth in meters

    // Example: Get depth at pixel (320, 240)
    float depth_value = depth.at<float>(240, 320);
    RCLCPP_INFO(get_logger(), "Depth at center: %.2f meters", depth_value);

    // Example: Create 3D point cloud
    for (int y = 0; y < depth.rows; y++) {
        for (int x = 0; x < depth.cols; x++) {
            float z = depth.at<float>(y, x);

            if (z > 0.1 && z < 5.0) {  // Valid depth range
                // Convert pixel to 3D point (requires camera intrinsics)
                float X = (x - cx) * z / fx;
                float Y = (y - cy) * z / fy;
                float Z = z;

                // Now have 3D point (X, Y, Z) in camera frame
            }
        }
    }
}
```

---

## EDGE_CASES

### Edge Case 1: Image Synchronization Mismatch

**Scenario:**
Processing stereo images (left + right) or RGB + Depth, but they arrive at different times with different timestamps.

**Problem:**
```
Time t=1.00s: Left image arrives
Time t=1.05s: Right image arrives (50ms delay)

If processed naively:
- Left at t=1.00s paired with Right at t=1.05s
- Robot moved between captures
- Stereo matching fails (images misaligned)
```

**Why:**
- Network delays
- Different camera drivers
- USB bandwidth limitations
- Cameras not hardware-synchronized

**Solution: ApproximateTime Synchronizer**

```cpp
#include <message_filters/subscriber.h>
#include <message_filters/time_synchronizer.h>
#include <message_filters/sync_policies/approximate_time.h>

class StereoSync : public rclcpp::Node {
public:
    StereoSync() : Node("stereo_sync") {
        // Create subscribers
        left_sub_.subscribe(this, "left/image_raw");
        right_sub_.subscribe(this, "right/image_raw");

        // Sync policy: allow 100ms time difference
        typedef message_filters::sync_policies::ApproximateTime<
            sensor_msgs::msg::Image,
            sensor_msgs::msg::Image> SyncPolicy;

        sync_ = std::make_shared<message_filters::Synchronizer<SyncPolicy>>(
            SyncPolicy(10), left_sub_, right_sub_);

        // Callback receives synchronized messages
        sync_->registerCallback(
            std::bind(&StereoSync::callback, this, _1, _2));
    }

private:
    void callback(const sensor_msgs::msg::Image::ConstSharedPtr& left,
                  const sensor_msgs::msg::Image::ConstSharedPtr& right) {

        // Check timestamp difference
        rclcpp::Time left_time(left->header.stamp);
        rclcpp::Time right_time(right->header.stamp);

        auto diff = std::abs((left_time - right_time).seconds());

        if (diff > 0.05) {  // > 50ms
            RCLCPP_WARN(get_logger(), "Images not well synchronized: %.3fs diff", diff);
        }

        // Process synchronized images
        process_stereo(left, right);
    }

    message_filters::Subscriber<sensor_msgs::msg::Image> left_sub_, right_sub_;
    std::shared_ptr<message_filters::Synchronizer<SyncPolicy>> sync_;
};
```

**Interview Insight:**
Use `message_filters` with `ApproximateTime` policy to synchronize images with different timestamps. Adjust time tolerance based on camera frame rate.

---

### Edge Case 2: Handling Variable Lighting Conditions

**Scenario:**
Robot transitions from indoor (dark) to outdoor (bright sunlight) → camera auto-exposure adjusts → image processing breaks.

**Problem:**
```
Indoor: Brightness = 50/255
- Thresholds tuned for indoor
- Edge detection works well

Outdoor: Brightness = 200/255
- Same thresholds fail
- Over-exposed, edges washed out
```

**Why:**
- Fixed thresholds don't adapt to lighting
- Auto-exposure causes sudden brightness changes
- Shadows create high contrast

**Solution 1: Adaptive Thresholding**

Instead of fixed threshold:
```cpp
// Fixed threshold (breaks with lighting changes)
cv::threshold(gray, binary, 100, 255, cv::THRESH_BINARY);

// Adaptive threshold (adjusts locally)
cv::adaptiveThreshold(gray, binary, 255,
    cv::ADAPTIVE_THRESH_GAUSSIAN_C,
    cv::THRESH_BINARY,
    11,   // Block size
    2);   // Constant subtracted from mean
```

**Solution 2: Histogram Equalization**

Normalize image brightness:
```cpp
cv::Mat equalized;
cv::equalizeHist(gray, equalized);

// Now thresholds work consistently regardless of lighting
```

**Solution 3: CLAHE (Contrast Limited Adaptive Histogram Equalization)**

Better than regular histogram equalization (prevents over-amplifying noise):

```cpp
cv::Ptr<cv::CLAHE> clahe = cv::createCLAHE(2.0, cv::Size(8, 8));
cv::Mat enhanced;
clahe->apply(gray, enhanced);
```

**Solution 4: Color Spaces Less Sensitive to Lighting**

HSV separates color from brightness:

```cpp
cv::Mat hsv;
cv::cvtColor(image, hsv, cv::COLOR_BGR2HSV);

std::vector<cv::Mat> channels;
cv::split(hsv, channels);

cv::Mat hue = channels[0];        // 0-180 (color, lighting-invariant)
cv::Mat saturation = channels[1]; // 0-255 (colorfulness)
cv::Mat value = channels[2];      // 0-255 (brightness)

// Use Hue for color detection (invariant to lighting)
cv::Mat mask;
cv::inRange(hue, cv::Scalar(30), cv::Scalar(90), mask);  // Detect green regardless of brightness
```

**Interview Insight:**
Lighting changes break fixed-threshold algorithms. Use adaptive thresholding, histogram equalization (CLAHE), or lighting-invariant color spaces (HSV Hue channel).

---

### Edge Case 3: Motion Blur During Fast Movement

**Scenario:**
Robot moves quickly, camera exposure time causes motion blur → image processing (feature detection, OCR, QR codes) fails.

**Visualization:**
```
Robot stationary:
Clear image → ████ ← Sharp edges

Robot moving fast:
Blurred image → ≈≈≈≈ ← Smeared edges
```

**Why:**
- Camera shutter is open during robot motion
- Fast motion → object moves during exposure
- Longer exposure → more blur

**Solution 1: Reduce Exposure Time**

```python
# Example with V4L2 camera driver
import cv2

cap = cv2.VideoCapture(0)

# Reduce exposure (camera-dependent)
cap.set(cv2.CAP_PROP_EXPOSURE, -5)  # Lower value = shorter exposure
cap.set(cv2.CAP_PROP_FPS, 60)        # Higher frame rate

# Trade-off: Darker images, but less blur
```

**Solution 2: Increase Camera Frame Rate**

Higher FPS → shorter exposure per frame:
```
30 FPS: Max exposure = 33ms
60 FPS: Max exposure = 16ms (less blur)
120 FPS: Max exposure = 8ms (even less)
```

**Solution 3: Stop Robot During Capture**

For critical tasks (QR code scanning, precision inspection):

```python
class QRScanner(Node):
    def scan_qr_code(self):
        # Stop robot
        self.publish_velocity(0.0, 0.0)

        # Wait for motion to settle
        time.sleep(0.5)

        # Capture image
        image = self.get_camera_image()

        # Process (no motion blur)
        qr_data = self.detect_qr_code(image)

        # Resume motion
        self.publish_velocity(0.3, 0.0)

        return qr_data
```

**Solution 4: Deblurring Algorithms**

Restore blurred images (computationally expensive):

```cpp
// Wiener deconvolution
cv::Mat deblur_image(const cv::Mat& blurred) {
    // Estimate blur kernel (motion direction)
    cv::Mat kernel = cv::getStructuringElement(cv::MORPH_RECT, cv::Size(15, 1));
    kernel /= kernel.total();

    // Wiener filter
    cv::Mat deblurred;
    cv::Mat kernel_fft, blurred_fft;

    // FFT-based deconvolution (simplified)
    cv::dft(kernel, kernel_fft);
    cv::dft(blurred, blurred_fft);

    // ... deconvolution math ...

    return deblurred;
}
```

**Interview Insight:**
Motion blur occurs during fast movement with slow camera shutter. Solutions: reduce exposure time, increase FPS, stop robot during critical captures, or use deblurring algorithms.

---

### Edge Case 4: Memory Leak from Unreleased cv::Mat

**Scenario:**
Long-running vision node gradually uses more memory until system crashes (out of memory).

**Problem:**
```cpp
void image_callback(const sensor_msgs::msg::Image::ConstSharedPtr& msg) {
    cv::Mat* image = new cv::Mat();  // Heap allocation

    // Convert and process
    *image = cv_bridge::toCvCopy(msg)->image;

    // Process image...

    // BUG: Never deleted!
    // Memory leak: 640×480×3 = 900KB per frame
    // At 30 FPS: 27 MB/s leak!
}

After 1 hour: 27 MB/s × 3600s ≈ 97 GB leaked!
```

**Why:**
- C++ requires manual memory management
- `new` without corresponding `delete`
- OpenCV `cv::Mat` can be large (megabytes per image)
- High frame rates amplify leaks

**Solution 1: Use Stack Allocation**

```cpp
void image_callback(const sensor_msgs::msg::Image::ConstSharedPtr& msg) {
    // Stack allocation (automatic cleanup)
    cv::Mat image = cv_bridge::toCvCopy(msg)->image;

    // Process...

    // Automatically freed when function returns ✓
}
```

**Solution 2: Use Smart Pointers**

```cpp
void image_callback(const sensor_msgs::msg::Image::ConstSharedPtr& msg) {
    std::shared_ptr<cv::Mat> image = std::make_shared<cv::Mat>();

    *image = cv_bridge::toCvCopy(msg)->image;

    // Process...

    // Automatically freed when shared_ptr goes out of scope ✓
}
```

**Solution 3: Reuse Buffers**

For performance-critical applications:

```cpp
class VisionNode : public rclcpp::Node {
public:
    VisionNode() : Node("vision") {
        // Pre-allocate buffers
        processing_buffer_ = cv::Mat(480, 640, CV_8UC3);
    }

private:
    void image_callback(const sensor_msgs::msg::Image::ConstSharedPtr& msg) {
        // Copy into pre-allocated buffer (no new allocation)
        cv::Mat src = cv_bridge::toCvCopy(msg)->image;
        src.copyTo(processing_buffer_);

        // Process reused buffer
        process(processing_buffer_);

        // No allocation/deallocation overhead ✓
    }

    cv::Mat processing_buffer_;  // Reused across frames
};
```

**Detection:**

Monitor memory usage:
```bash
# Watch node memory usage
watch -n 1 "ps aux | grep vision_node"

# Or use ROS2 tools
ros2 run demo_nodes_cpp talker &
htop -p $(pgrep vision_node)
```

**Interview Insight:**
Memory leaks are common with `cv::Mat` in callbacks. Use stack allocation or smart pointers. For performance, reuse pre-allocated buffers across frames.

---

## CODE_EXAMPLES

### Example 1: Complete Object Detection Node with TF Broadcasting

**File: `object_detector_tf.py`**

```python
#!/usr/bin/env python3
import rclpy
from rclpy.node import Node
from sensor_msgs.msg import Image, CameraInfo
from vision_msgs.msg import Detection2DArray, Detection2D
from geometry_msgs.msg import TransformStamped
from cv_bridge import CvBridge
from tf2_ros import TransformBroadcaster
from ultralytics import YOLO
import cv2
import numpy as np

class ObjectDetectorTF(Node):
    def __init__(self):
        super().__init__('object_detector_tf')

        # Parameters
        self.declare_parameter('model_path', 'yolov8n.pt')
        self.declare_parameter('confidence_threshold', 0.5)

        model_path = self.get_parameter('model_path').value
        self.conf_threshold = self.get_parameter('confidence_threshold').value

        # Load YOLO
        self.model = YOLO(model_path)
        self.bridge = CvBridge()
        self.tf_broadcaster = TransformBroadcaster(self)

        # Camera intrinsics (updated from CameraInfo)
        self.fx = None
        self.fy = None
        self.cx = None
        self.cy = None

        # Subscribers
        self.image_sub = self.create_subscription(
            Image, 'camera/image_raw', self.image_callback, 10)

        self.depth_sub = self.create_subscription(
            Image, 'camera/depth/image_raw', self.depth_callback, 10)

        self.info_sub = self.create_subscription(
            CameraInfo, 'camera/camera_info', self.info_callback, 10)

        # Publishers
        self.detection_pub = self.create_publisher(Detection2DArray, 'detections', 10)
        self.viz_pub = self.create_publisher(Image, 'detections_viz', 10)

        # Store latest depth image
        self.latest_depth = None

        self.get_logger().info('Object detector with TF broadcasting initialized')

    def info_callback(self, msg):
        """Update camera intrinsics."""
        self.fx = msg.k[0]
        self.fy = msg.k[4]
        self.cx = msg.k[2]
        self.cy = msg.k[5]

    def depth_callback(self, msg):
        """Store latest depth image."""
        self.latest_depth = self.bridge.imgmsg_to_cv2(msg, '32FC1')

    def image_callback(self, msg):
        """Detect objects and broadcast TF."""
        # Convert to OpenCV
        cv_image = self.bridge.imgmsg_to_cv2(msg, 'bgr8')

        # Run YOLO
        results = self.model(cv_image, conf=self.conf_threshold)

        detection_array = Detection2DArray()
        detection_array.header = msg.header

        for result in results:
            for i, box in enumerate(result.boxes):
                # Get bounding box
                x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                cx_pixel = int((x1 + x2) / 2)
                cy_pixel = int((y1 + y2) / 2)

                # Create detection message
                detection = Detection2D()
                detection.bbox.center.position.x = float(cx_pixel)
                detection.bbox.center.position.y = float(cy_pixel)
                detection.bbox.size_x = float(x2 - x1)
                detection.bbox.size_y = float(y2 - y1)

                class_id = int(box.cls)
                confidence = float(box.conf)
                class_name = self.model.names[class_id]

                detection.results.append(...)  # Add class info
                detection_array.detections.append(detection)

                # Get 3D position from depth
                if self.latest_depth is not None and self.fx is not None:
                    depth = self.latest_depth[cy_pixel, cx_pixel]

                    if depth > 0.1 and depth < 10.0:  # Valid depth
                        # Convert pixel to 3D point
                        X = (cx_pixel - self.cx) * depth / self.fx
                        Y = (cy_pixel - self.cy) * depth / self.fy
                        Z = depth

                        # Broadcast TF for detected object
                        t = TransformStamped()
                        t.header.stamp = msg.header.stamp
                        t.header.frame_id = 'camera_link'
                        t.child_frame_id = f'detected_{class_name}_{i}'

                        t.transform.translation.x = float(Z)  # Camera forward = Z
                        t.transform.translation.y = float(-X)  # Camera right = -X
                        t.transform.translation.z = float(-Y)  # Camera down = -Y

                        t.transform.rotation.w = 1.0

                        self.tf_broadcaster.sendTransform(t)

                # Draw visualization
                cv2.rectangle(cv_image, (int(x1), int(y1)), (int(x2), int(y2)),
                             (0, 255, 0), 2)
                label = f"{class_name}: {confidence:.2f}"
                cv2.putText(cv_image, label, (int(x1), int(y1)-10),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

        # Publish
        self.detection_pub.publish(detection_array)

        viz_msg = self.bridge.cv2_to_imgmsg(cv_image, 'bgr8')
        viz_msg.header = msg.header
        self.viz_pub.publish(viz_msg)

def main(args=None):
    rclpy.init(args=args)
    node = ObjectDetectorTF()
    rclpy.spin(node)
    node.destroy_node()
    rclpy.shutdown()

if __name__ == '__main__':
    main()
```

---

### Example 2: AprilTag Detection for Robot Localization

**File: `apriltag_detector.cpp`**

```cpp
#include <rclcpp/rclcpp.hpp>
#include <sensor_msgs/msg/image.hpp>
#include <sensor_msgs/msg/camera_info.hpp>
#include <geometry_msgs/msg/pose_stamped.hpp>
#include <tf2_ros/transform_broadcaster.h>
#include <cv_bridge/cv_bridge.h>
#include <opencv2/opencv.hpp>
#include <apriltag/apriltag.h>
#include <apriltag/tag36h11.h>
#include <apriltag/apriltag_pose.h>

class AprilTagDetector : public rclcpp::Node {
public:
    AprilTagDetector() : Node("apriltag_detector") {
        // Parameters
        this->declare_parameter("tag_family", "tag36h11");
        this->declare_parameter("tag_size", 0.16);  // meters

        tag_size_ = this->get_parameter("tag_size").as_double();

        // Initialize AprilTag detector
        td_ = apriltag_detector_create();
        tf_ = tag36h11_create();
        apriltag_detector_add_family(td_, tf_);

        td_->quad_decimate = 2.0;
        td_->quad_sigma = 0.0;
        td_->nthreads = 4;
        td_->debug = 0;
        td_->refine_edges = 1;

        // Subscribers
        image_sub_ = this->create_subscription<sensor_msgs::msg::Image>(
            "camera/image_raw", 10,
            std::bind(&AprilTagDetector::image_callback, this, std::placeholders::_1));

        info_sub_ = this->create_subscription<sensor_msgs::msg::CameraInfo>(
            "camera/camera_info", 10,
            std::bind(&AprilTagDetector::info_callback, this, std::placeholders::_1));

        // Publishers
        pose_pub_ = this->create_publisher<geometry_msgs::msg::PoseStamped>("tag_pose", 10);

        // TF broadcaster
        tf_broadcaster_ = std::make_unique<tf2_ros::TransformBroadcaster>(*this);

        RCLCPP_INFO(this->get_logger(), "AprilTag detector initialized");
    }

    ~AprilTagDetector() {
        apriltag_detector_destroy(td_);
        tag36h11_destroy(tf_);
    }

private:
    void info_callback(const sensor_msgs::msg::CameraInfo::SharedPtr msg) {
        fx_ = msg->k[0];
        fy_ = msg->k[4];
        cx_ = msg->k[2];
        cy_ = msg->k[5];
    }

    void image_callback(const sensor_msgs::msg::Image::ConstSharedPtr& msg) {
        // Convert to grayscale
        cv_bridge::CvImagePtr cv_ptr;
        try {
            cv_ptr = cv_bridge::toCvCopy(msg, sensor_msgs::image_encodings::MONO8);
        } catch (cv_bridge::Exception& e) {
            RCLCPP_ERROR(this->get_logger(), "cv_bridge exception: %s", e.what());
            return;
        }

        // Create AprilTag image
        image_u8_t im = {
            .width = cv_ptr->image.cols,
            .height = cv_ptr->image.rows,
            .stride = cv_ptr->image.cols,
            .buf = cv_ptr->image.data
        };

        // Detect tags
        zarray_t* detections = apriltag_detector_detect(td_, &im);

        RCLCPP_INFO(this->get_logger(), "Detected %d tags", zarray_size(detections));

        for (int i = 0; i < zarray_size(detections); i++) {
            apriltag_detection_t* det;
            zarray_get(detections, i, &det);

            // Estimate pose
            apriltag_detection_info_t info;
            info.det = det;
            info.tagsize = tag_size_;
            info.fx = fx_;
            info.fy = fy_;
            info.cx = cx_;
            info.cy = cy_;

            apriltag_pose_t pose;
            estimate_tag_pose(&info, &pose);

            // Convert to ROS pose
            geometry_msgs::msg::PoseStamped pose_msg;
            pose_msg.header = msg->header;

            pose_msg.pose.position.x = pose.t->data[0];
            pose_msg.pose.position.y = pose.t->data[1];
            pose_msg.pose.position.z = pose.t->data[2];

            // Convert rotation matrix to quaternion (simplified)
            // ... quaternion conversion ...

            pose_pub_->publish(pose_msg);

            // Broadcast TF
            geometry_msgs::msg::TransformStamped tf;
            tf.header = msg->header;
            tf.child_frame_id = "tag_" + std::to_string(det->id);

            tf.transform.translation.x = pose.t->data[0];
            tf.transform.translation.y = pose.t->data[1];
            tf.transform.translation.z = pose.t->data[2];

            // ... set rotation ...

            tf_broadcaster_->sendTransform(tf);

            RCLCPP_INFO(this->get_logger(), "Tag %d at (%.2f, %.2f, %.2f)",
                       det->id, pose.t->data[0], pose.t->data[1], pose.t->data[2]);
        }

        apriltag_detections_destroy(detections);
    }

    apriltag_detector_t* td_;
    apriltag_family_t* tf_;
    double tag_size_;

    double fx_, fy_, cx_, cy_;

    rclcpp::Subscription<sensor_msgs::msg::Image>::SharedPtr image_sub_;
    rclcpp::Subscription<sensor_msgs::msg::CameraInfo>::SharedPtr info_sub_;
    rclcpp::Publisher<geometry_msgs::msg::PoseStamped>::SharedPtr pose_pub_;

    std::unique_ptr<tf2_ros::TransformBroadcaster> tf_broadcaster_;
};

int main(int argc, char** argv) {
    rclcpp::init(argc, argv);
    rclcpp::spin(std::make_shared<AprilTagDetector>());
    rclcpp::shutdown();
    return 0;
}
```

---

## INTERVIEW_QA

### Q1: What is cv_bridge and why is it necessary in ROS2 vision applications?

**Difficulty:** ⭐⭐ (Easy)

**Answer:**

**cv_bridge** is a library that converts between ROS image messages (`sensor_msgs/Image`) and OpenCV images (`cv::Mat`).

**Why Necessary:**

ROS and OpenCV use different image representations:

| Aspect | ROS Message | OpenCV |
|--------|-------------|---------|
| **Type** | `sensor_msgs::msg::Image` | `cv::Mat` |
| **Storage** | Serialized message | In-memory array |
| **Metadata** | Header (timestamp, frame_id) | None |
| **Encoding** | String (e.g., "bgr8") | Type (e.g., CV_8UC3) |

**Without cv_bridge:**
```cpp
// Manual conversion (tedious, error-prone)
cv::Mat image(msg->height, msg->width, CV_8UC3);
memcpy(image.data, msg->data.data(), msg->data.size());
// Need to handle encoding, stride, endianness...
```

**With cv_bridge:**
```cpp
// Automatic conversion
cv_bridge::CvImagePtr cv_ptr = cv_bridge::toCvCopy(msg, "bgr8");
cv::Mat& image = cv_ptr->image;  // Ready to use!
```

**Key Functions:**

- `toCvCopy()`: Copies ROS msg → OpenCV (safe, allows modification)
- `toCvShare()`: Shares data ROS msg → OpenCV (zero-copy, read-only)
- `toImageMsg()`: Converts OpenCV → ROS msg

**Interview Insight:**
cv_bridge converts between ROS messages and OpenCV images, handling encoding, memory layout, and metadata automatically.

---

### Q2: How do you synchronize RGB and Depth images in ROS2?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

RGB and Depth images from RGB-D cameras (RealSense, Kinect) arrive as separate topics with potentially different timestamps. Must synchronize to ensure they correspond to the same moment.

**Method: message_filters**

```cpp
#include <message_filters/subscriber.h>
#include <message_filters/sync_policies/approximate_time.h>

class RGBDSync : public rclcpp::Node {
public:
    RGBDSync() : Node("rgbd_sync") {
        rgb_sub_.subscribe(this, "camera/color/image_raw");
        depth_sub_.subscribe(this, "camera/depth/image_raw");

        // ApproximateTime: allow small timestamp differences
        typedef message_filters::sync_policies::ApproximateTime<
            sensor_msgs::msg::Image,
            sensor_msgs::msg::Image> SyncPolicy;

        sync_ = std::make_shared<message_filters::Synchronizer<SyncPolicy>>(
            SyncPolicy(10),  // Queue size
            rgb_sub_, depth_sub_);

        sync_->registerCallback(
            std::bind(&RGBDSync::callback, this, _1, _2));
    }

private:
    void callback(const sensor_msgs::msg::Image::ConstSharedPtr& rgb,
                  const sensor_msgs::msg::Image::ConstSharedPtr& depth) {
        // Guaranteed to be temporally synchronized

        rclcpp::Time rgb_time(rgb->header.stamp);
        rclcpp::Time depth_time(depth->header.stamp);

        RCLCPP_INFO(get_logger(), "Time diff: %.3f ms",
                   std::abs((rgb_time - depth_time).seconds() * 1000));

        // Process synchronized images
    }

    message_filters::Subscriber<sensor_msgs::msg::Image> rgb_sub_, depth_sub_;
    std::shared_ptr<message_filters::Synchronizer<SyncPolicy>> sync_;
};
```

**Sync Policies:**

1. **ExactTime**: Requires identical timestamps (hardware-synced cameras)
2. **ApproximateTime**: Matches closest timestamps within tolerance (most common)

**Parameters:**
- **Queue size**: How many messages to buffer while waiting for match
- **slop**: Maximum time difference allowed (ApproximateTime default: 0.1s)

**Interview Insight:**
Use `message_filters` with `ApproximateTime` sync policy to match RGB and Depth images by timestamp. Essential for RGB-D processing.

---

### Q3: Explain the trade-offs between compressed and uncompressed image transport.

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

**Uncompressed (`sensor_msgs/Image`):**

**Pros:**
- No compression/decompression latency
- No quality loss
- Low CPU usage
- Direct access to raw pixel data

**Cons:**
- High bandwidth: 640×480 RGB = 900 KB/frame
- Network bottleneck at high frame rates
- Not suitable for wireless or limited bandwidth

**Compressed (`sensor_msgs/CompressedImage`):**

**Pros:**
- Low bandwidth: JPEG ~50-100 KB (10× reduction)
- Enables high frame rates over network
- Multiple codecs (JPEG, PNG, H.264)

**Cons:**
- Compression artifacts (JPEG lossy)
- CPU overhead (encode/decode)
- Added latency (10-50 ms typical)

**Comparison:**

| Metric | Raw | JPEG | H.264 (video) |
|--------|-----|------|---------------|
| **Bandwidth** | 27 MB/s @ 30fps | 3 MB/s | 1 MB/s |
| **Quality** | Perfect | ~95% | ~90% |
| **Latency** | 0 ms | 10-30 ms | 50-100 ms |
| **CPU** | Low | Medium | High |

**When to Use:**

**Uncompressed:**
- Local processing (no network)
- Precision tasks (measurement, calibration)
- GPU processing (compression not bottleneck)

**Compressed:**
- Remote robots (WiFi, 4G)
- Multiple camera streams
- Cloud processing
- Human visualization (quality loss acceptable)

**Hybrid Approach:**

```yaml
# publisher: Publish both
image_transport: raw compressed

# subscriber 1 (local): Use raw
image_transport: raw

# subscriber 2 (remote): Use compressed
image_transport: compressed
```

**Interview Insight:**
Uncompressed is low-latency but high-bandwidth. Compressed reduces bandwidth 10× but adds latency and CPU cost. Choose based on network capacity and latency requirements.

---

### Q4: How does stereo vision compute depth, and what are its limitations?

**Difficulty:** ⭐⭐⭐⭐ (Hard)

**Answer:**

**Stereo Vision Principle:**

Two cameras separated by baseline observe same scene. Depth computed via **triangulation** using **disparity** (horizontal pixel offset between matched features).

**Formula:**
```
Depth (Z) = (focal_length × baseline) / disparity

Where:
- focal_length: Camera focal length (pixels)
- baseline: Distance between cameras (meters)
- disparity: Pixel difference (left vs right image)
```

**Example:**
```
Camera setup:
- focal_length = 700 pixels
- baseline = 0.12 m (12 cm)

Object appears at:
- Left image: x = 320
- Right image: x = 280
- Disparity: 320 - 280 = 40 pixels

Depth = (700 × 0.12) / 40 = 2.1 meters
```

**Stereo Matching Process:**

1. **Calibrate cameras**: Get intrinsics and extrinsics
2. **Rectify images**: Align epipolar lines horizontally
3. **Match pixels**: Find corresponding point in right image
4. **Compute disparity**: Horizontal offset
5. **Triangulate depth**: Apply formula

**Limitations:**

**1. Textureless Regions:**
```
Smooth white wall:
┌─────────┐
│         │  ← No features to match
│         │     Stereo matching fails
└─────────┘
```
Solution: Use structured light (project pattern)

**2. Occlusions:**
```
Object visible in left camera, hidden in right:
  Left    Right
  [●]     [X]  ← No correspondence
```
Solution: Use multiple camera pairs or RGB-D sensor

**3. Depth Range Limited:**
```
Depth accuracy ∝ Z² / baseline

Close objects (Z=1m): ±2 cm accuracy ✓
Far objects (Z=10m): ±2 m accuracy ✗
```
Solution: Larger baseline (but causes more occlusions)

**4. Computational Cost:**
```
Stereo matching: O(width × height × max_disparity)

640×480 image, 128 disparity levels:
640 × 480 × 128 = 39 million operations/frame

At 30 FPS: 1.2 billion operations/second
```
Solution: Use GPU or semi-global matching (SGBM)

**5. Lighting Sensitivity:**
```
Different lighting in left vs right:
Left: Bright │ Right: Shadow
Matching fails (intensity mismatch)
```
Solution: Use normalized cross-correlation or census transform

**Stereo vs RGB-D:**

| Aspect | Stereo | RGB-D (e.g., RealSense) |
|--------|--------|-------------------------|
| **Range** | 0.5-50m | 0.3-10m |
| **Outdoor** | ✓ Works | ✗ Infrared interference (sunlight) |
| **Textureless** | ✗ Fails | ✓ Works (structured light) |
| **Computation** | High | Low (hardware depth) |
| **Cost** | $ (2 cameras) | $$ (specialized sensor) |

**Interview Insight:**
Stereo depth uses triangulation from disparity. Limitations: textureless regions, occlusions, quadratic depth error growth, and computational cost. RGB-D sensors solve some issues but fail outdoors.

---

### Q5: What causes memory leaks in vision nodes and how do you prevent them?

**Difficulty:** ⭐⭐⭐ (Medium)

**Answer:**

**Common Causes:**

**1. Heap-allocated cv::Mat not freed:**
```cpp
void callback(const sensor_msgs::msg::Image::ConstSharedPtr& msg) {
    cv::Mat* image = new cv::Mat();  // Leak!
    *image = cv_bridge::toCvCopy(msg)->image;
    // Never deleted
}
```

**2. Accumulating processed images:**
```cpp
std::vector<cv::Mat> image_history;  // Class member

void callback(...) {
    cv::Mat image = ...;
    image_history.push_back(image.clone());  // Grows unbounded!
}
```

**3. OpenCV GUI windows:**
```cpp
void callback(...) {
    cv::imshow("Image", image);  // Creates new window each time
    // Windows accumulate
}
```

**4. Unclosed video writers:**
```cpp
cv::VideoWriter writer;
writer.open("output.avi", ...);
// Never released
```

**Prevention:**

**1. Use Stack Allocation:**
```cpp
void callback(const sensor_msgs::msg::Image::ConstSharedPtr& msg) {
    cv::Mat image = cv_bridge::toCvCopy(msg)->image;
    // Auto-freed when function returns ✓
}
```

**2. Use Smart Pointers:**
```cpp
std::unique_ptr<cv::Mat> image = std::make_unique<cv::Mat>();
// Auto-freed when out of scope ✓
```

**3. Limit Buffer Sizes:**
```cpp
void callback(...) {
    image_history.push_back(image.clone());

    if (image_history.size() > 100) {
        image_history.erase(image_history.begin());  // Remove oldest
    }
}
```

**4. Create Windows Once:**
```cpp
ImageProcessor() {
    cv::namedWindow("Image", cv::WINDOW_AUTOSIZE);  // Create once
}

void callback(...) {
    cv::imshow("Image", image);  // Reuse existing window ✓
    cv::waitKey(1);
}
```

**5. Explicit Resource Management:**
```cpp
~ImageProcessor() {
    if (writer.isOpened()) {
        writer.release();  // Explicit cleanup
    }
    cv::destroyAllWindows();
}
```

**Detection:**

```bash
# Monitor memory usage
watch -n 1 "ps aux | grep vision_node | awk '{print \$6/1024 \" MB\"}'"

# Valgrind for detailed leak detection
valgrind --leak-check=full ./vision_node
```

**Interview Insight:**
Vision node memory leaks commonly from heap-allocated cv::Mat, unbounded buffers, and unclosed resources. Use stack allocation, smart pointers, bounded containers, and explicit cleanup in destructors.

---

## PRACTICE_TASKS

### Task 1: Build Object Detection with Distance Measurement

**Requirements:**
- Subscribe to RGB and Depth images (RGB-D camera)
- Detect objects with YOLOv8 or similar
- Compute 3D position of each detected object
- Broadcast TF frame for each object
- Visualize bounding boxes with distance labels

**Bonus:**
- Filter detections by distance (e.g., only objects < 3m)
- Track objects across frames (assign IDs)

---

### Task 2: Line Following for Autonomous Vehicle

**Goal:** Implement lane detection and steering control.

**Requirements:**
- Detect lane lines using Canny edge detection + Hough transform
- Compute steering angle to keep robot centered
- Publish steering commands to `/cmd_vel`
- Handle edge cases: missing lines, sharp turns

**Bonus:**
- Adaptive thresholding for varying lighting
- Use polynomial fitting for curved lanes

---

### Task 3: AprilTag-Based Robot Localization

**Goal:** Use AprilTags as landmarks for robot localization.

**Requirements:**
- Detect AprilTags in camera images
- Estimate tag pose (position + orientation)
- Broadcast TF: camera → tag
- If tag position known in map, compute robot pose in map

**Bonus:**
- Handle multiple tags (average pose estimates)
- Integrate with AMCL for sensor fusion

---

### Task 4: Visual Odometry from Feature Matching

**Goal:** Estimate robot motion from consecutive camera frames.

**Requirements:**
- Extract ORB features from each frame
- Match features between frames
- Estimate camera motion (translation + rotation)
- Publish odometry to `/odom`
- Compare with wheel odometry

**Bonus:**
- Use RANSAC to filter outliers
- Visualize feature matches
- Estimate scale from IMU or depth

---

## QUICK_REFERENCE

### cv_bridge Key Functions

```cpp
// ROS → OpenCV (copy, allows modification)
cv_bridge::CvImagePtr cv_ptr = cv_bridge::toCvCopy(msg, "bgr8");
cv::Mat image = cv_ptr->image;

// ROS → OpenCV (shared, read-only)
cv_bridge::CvImageConstPtr cv_ptr = cv_bridge::toCvShare(msg, "bgr8");

// OpenCV → ROS
sensor_msgs::msg::Image::SharedPtr msg =
    cv_bridge::CvImage(header, "bgr8", image).toImageMsg();
```

### Image Encodings

```cpp
sensor_msgs::image_encodings::MONO8     // Grayscale 8-bit
sensor_msgs::image_encodings::BGR8      // BGR color
sensor_msgs::image_encodings::RGB8      // RGB color
sensor_msgs::image_encodings::TYPE_32FC1 // Float depth
```

### message_filters Synchronization

```cpp
// Approximate time sync (RGB + Depth)
#include <message_filters/sync_policies/approximate_time.h>

typedef message_filters::sync_policies::ApproximateTime<
    sensor_msgs::msg::Image,
    sensor_msgs::msg::Image> SyncPolicy;

sync_ = std::make_shared<message_filters::Synchronizer<SyncPolicy>>(
    SyncPolicy(10), rgb_sub_, depth_sub_);

sync_->registerCallback(std::bind(&Node::callback, this, _1, _2));
```

### Common OpenCV Operations

```cpp
// Color conversion
cv::cvtColor(image, gray, cv::COLOR_BGR2GRAY);
cv::cvtColor(image, hsv, cv::COLOR_BGR2HSV);

// Filtering
cv::GaussianBlur(image, blurred, cv::Size(5, 5), 0);
cv::Canny(gray, edges, 50, 150);

// Thresholding
cv::threshold(gray, binary, 100, 255, cv::THRESH_BINARY);
cv::adaptiveThreshold(gray, adaptive, 255, cv::ADAPTIVE_THRESH_GAUSSIAN_C,
                      cv::THRESH_BINARY, 11, 2);

// Feature detection
cv::Ptr<cv::ORB> orb = cv::ORB::create();
std::vector<cv::KeyPoint> keypoints;
cv::Mat descriptors;
orb->detectAndCompute(image, cv::noArray(), keypoints, descriptors);
```

---

**END OF TOPIC 5.2: Computer Vision & Image Processing with ROS2**
