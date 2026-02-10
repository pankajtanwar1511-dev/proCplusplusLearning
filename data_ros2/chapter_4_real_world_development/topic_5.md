# Chapter 4: Real-World Development Practices
## Topic 5: CI/CD for ROS2

---

## Theory

### 1. CI/CD Overview for ROS2

CI/CD (Continuous Integration / Continuous Deployment) automates building, testing, and deploying ROS2 applications.

**CI/CD Pipeline Stages:**

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Commit    │ ───> │    Build    │ ───> │    Test     │ ───> │   Deploy    │
│   to Git    │      │   Package   │      │  Lint/Unit  │      │  to Robot   │
└─────────────┘      └─────────────┘      └─────────────┘      └─────────────┘
                            │                     │                     │
                            ↓                     ↓                     ↓
                     Compile errors         Test failures         Production
                     Dependencies           Code quality
                     Cache layers          Coverage report
```

**Benefits:**
- **Automated testing:** Catch bugs before deployment
- **Consistent builds:** Same environment every time
- **Fast feedback:** Know immediately if code breaks
- **Automated deployment:** Push to robots automatically
- **Documentation:** Build history and artifacts

---

### 2. GitHub Actions for ROS2

GitHub Actions provides free CI/CD for open-source projects.

#### Basic Workflow

```yaml
# .github/workflows/ros2-ci.yml
name: ROS2 CI

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  build-and-test:
    runs-on: ubuntu-22.04

    steps:
    - name: Checkout code
      uses: actions/checkout@v3

    - name: Setup ROS2
      uses: ros-tooling/setup-ros@v0.6
      with:
        required-ros-distributions: humble

    - name: Install dependencies
      run: |
        source /opt/ros/humble/setup.bash
        sudo apt update
        rosdep update
        rosdep install --from-paths src --ignore-src -r -y

    - name: Build workspace
      run: |
        source /opt/ros/humble/setup.bash
        colcon build --symlink-install

    - name: Run tests
      run: |
        source /opt/ros/humble/setup.bash
        source install/setup.bash
        colcon test
        colcon test-result --verbose
```

#### Multi-ROS Distro Testing

```yaml
# .github/workflows/multi-distro.yml
name: Multi-Distro CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-22.04, ubuntu-24.04]
        ros_distro: [humble, jazzy]
        include:
          - os: ubuntu-22.04
            ros_distro: humble
          - os: ubuntu-24.04
            ros_distro: jazzy

    steps:
    - uses: actions/checkout@v3

    - name: Setup ROS2
      uses: ros-tooling/setup-ros@v0.6
      with:
        required-ros-distributions: ${{ matrix.ros_distro }}

    - name: Build and test
      run: |
        source /opt/ros/${{ matrix.ros_distro }}/setup.bash
        colcon build
        colcon test
```

#### Code Coverage

```yaml
# .github/workflows/coverage.yml
name: Code Coverage

on: [push, pull_request]

jobs:
  coverage:
    runs-on: ubuntu-22.04

    steps:
    - uses: actions/checkout@v3

    - name: Setup ROS2
      uses: ros-tooling/setup-ros@v0.6
      with:
        required-ros-distributions: humble

    - name: Install coverage tools
      run: |
        sudo apt update
        sudo apt install -y lcov

    - name: Build with coverage
      run: |
        source /opt/ros/humble/setup.bash
        colcon build --cmake-args -DCMAKE_BUILD_TYPE=Debug -DCMAKE_CXX_FLAGS="--coverage"

    - name: Run tests
      run: |
        source install/setup.bash
        colcon test

    - name: Generate coverage report
      run: |
        lcov --capture --directory build --output-file coverage.info
        lcov --remove coverage.info '/usr/*' '*/test/*' --output-file coverage_filtered.info
        genhtml coverage_filtered.info --output-directory coverage_html

    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v3
      with:
        files: ./coverage_filtered.info
        fail_ci_if_error: true

    - name: Upload coverage artifact
      uses: actions/upload-artifact@v3
      with:
        name: coverage-report
        path: coverage_html/
```

---

### 3. GitLab CI/CD for ROS2

GitLab CI is popular for self-hosted CI/CD.

#### Basic Pipeline

```yaml
# .gitlab-ci.yml
image: ros:humble-ros-base

stages:
  - build
  - test
  - deploy

variables:
  GIT_SUBMODULE_STRATEGY: recursive

before_script:
  - apt update
  - rosdep update
  - rosdep install --from-paths src --ignore-src -r -y

build:
  stage: build
  script:
    - source /opt/ros/humble/setup.bash
    - colcon build --symlink-install
  artifacts:
    paths:
      - build/
      - install/
    expire_in: 1 day

test:
  stage: test
  dependencies:
    - build
  script:
    - source /opt/ros/humble/setup.bash
    - source install/setup.bash
    - colcon test
    - colcon test-result --verbose
  artifacts:
    when: always
    reports:
      junit: build/*/test_results/*/*.xml

lint:
  stage: test
  script:
    - apt install -y python3-pip
    - pip3 install ament_lint
    - source /opt/ros/humble/setup.bash
    - ament_cpplint src/
    - ament_uncrustify --reformat src/

deploy-staging:
  stage: deploy
  only:
    - develop
  script:
    - echo "Deploying to staging..."
    - rsync -avz install/ robot@staging-robot:/opt/ros2_ws/install/
    - ssh robot@staging-robot "sudo systemctl restart robot.service"

deploy-production:
  stage: deploy
  only:
    - main
  when: manual
  script:
    - echo "Deploying to production..."
    - rsync -avz install/ robot@production-robot:/opt/ros2_ws/install/
    - ssh robot@production-robot "sudo systemctl restart robot.service"
```

#### Docker-in-Docker for Container Builds

```yaml
# .gitlab-ci.yml
image: docker:latest

services:
  - docker:dind

variables:
  DOCKER_HOST: tcp://docker:2375
  DOCKER_TLS_CERTDIR: ""

build-docker:
  stage: build
  script:
    - docker build -t my-robot:$CI_COMMIT_SHA .
    - docker tag my-robot:$CI_COMMIT_SHA my-robot:latest
    - docker push my-robot:$CI_COMMIT_SHA
    - docker push my-robot:latest
```

---

### 4. Jenkins Pipeline for ROS2

Jenkins provides flexible, self-hosted CI/CD with plugins.

#### Jenkinsfile

```groovy
// Jenkinsfile
pipeline {
    agent {
        docker {
            image 'ros:humble-ros-base'
            args '-u root:root'
        }
    }

    environment {
        ROS_DISTRO = 'humble'
    }

    stages {
        stage('Setup') {
            steps {
                sh '''
                    apt-get update
                    rosdep update
                    rosdep install --from-paths src --ignore-src -r -y
                '''
            }
        }

        stage('Build') {
            steps {
                sh '''
                    source /opt/ros/${ROS_DISTRO}/setup.bash
                    colcon build --symlink-install --cmake-args -DCMAKE_BUILD_TYPE=Release
                '''
            }
        }

        stage('Test') {
            steps {
                sh '''
                    source /opt/ros/${ROS_DISTRO}/setup.bash
                    source install/setup.bash
                    colcon test
                    colcon test-result --verbose
                '''
            }
            post {
                always {
                    junit 'build/*/test_results/*/*.xml'
                }
            }
        }

        stage('Lint') {
            steps {
                sh '''
                    apt-get install -y python3-pip
                    pip3 install ament_lint
                    source /opt/ros/${ROS_DISTRO}/setup.bash
                    ament_cpplint src/
                '''
            }
        }

        stage('Coverage') {
            when {
                branch 'develop'
            }
            steps {
                sh '''
                    apt-get install -y lcov
                    source /opt/ros/${ROS_DISTRO}/setup.bash
                    colcon build --cmake-args -DCMAKE_CXX_FLAGS="--coverage"
                    colcon test
                    lcov --capture --directory build --output-file coverage.info
                    genhtml coverage.info --output-directory coverage_html
                '''
                publishHTML([
                    reportDir: 'coverage_html',
                    reportFiles: 'index.html',
                    reportName: 'Coverage Report'
                ])
            }
        }

        stage('Deploy to Staging') {
            when {
                branch 'develop'
            }
            steps {
                sh '''
                    rsync -avz install/ robot@staging:/opt/ros2_ws/install/
                    ssh robot@staging "sudo systemctl restart robot.service"
                '''
            }
        }

        stage('Deploy to Production') {
            when {
                branch 'main'
            }
            steps {
                input message: 'Deploy to production?', ok: 'Deploy'
                sh '''
                    rsync -avz install/ robot@production:/opt/ros2_ws/install/
                    ssh robot@production "sudo systemctl restart robot.service"
                '''
            }
        }
    }

    post {
        always {
            cleanWs()
        }
        failure {
            emailext(
                subject: "Build Failed: ${env.JOB_NAME} - ${env.BUILD_NUMBER}",
                body: "Check console output at ${env.BUILD_URL}",
                to: "team@example.com"
            )
        }
    }
}
```

---

### 5. Docker Build Optimization

Optimize Docker builds for faster CI/CD.

#### Multi-Stage Build

```dockerfile
# Dockerfile
# Stage 1: Dependencies
FROM ros:humble-ros-base AS dependencies

WORKDIR /workspace
COPY src/my_package/package.xml src/my_package/

RUN apt-get update && \
    rosdep update && \
    rosdep install --from-paths src --ignore-src -r -y && \
    rm -rf /var/lib/apt/lists/*

# Stage 2: Build
FROM dependencies AS builder

COPY src/ src/
RUN source /opt/ros/humble/setup.bash && \
    colcon build --cmake-args -DCMAKE_BUILD_TYPE=Release

# Stage 3: Runtime
FROM ros:humble-ros-base AS runtime

COPY --from=builder /workspace/install /opt/ros2_ws/install

RUN echo "source /opt/ros/humble/setup.bash" >> ~/.bashrc && \
    echo "source /opt/ros2_ws/install/setup.bash" >> ~/.bashrc

WORKDIR /opt/ros2_ws
CMD ["bash"]
```

#### Layer Caching

```dockerfile
# Dockerfile with optimized caching
FROM ros:humble-ros-base

# Install system dependencies (rarely changes)
RUN apt-get update && apt-get install -y \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Copy only package.xml first (for dependency caching)
WORKDIR /workspace
COPY src/*/package.xml src/*/

# Install ROS dependencies (cached unless package.xml changes)
RUN rosdep update && \
    rosdep install --from-paths src --ignore-src -r -y

# Copy source code (changes frequently)
COPY src/ src/

# Build
RUN source /opt/ros/humble/setup.bash && \
    colcon build --symlink-install
```

---

### 6. Automated Testing Strategies

#### Unit Test Integration

```yaml
# .github/workflows/tests.yml
name: Tests

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-22.04
    steps:
    - uses: actions/checkout@v3

    - name: Setup ROS2
      uses: ros-tooling/setup-ros@v0.6
      with:
        required-ros-distributions: humble

    - name: Build and run unit tests
      run: |
        source /opt/ros/humble/setup.bash
        colcon build --packages-select my_package
        colcon test --packages-select my_package --event-handlers console_direct+
        colcon test-result --verbose

    - name: Upload test results
      if: always()
      uses: actions/upload-artifact@v3
      with:
        name: test-results
        path: build/*/test_results/

  integration-tests:
    runs-on: ubuntu-22.04
    steps:
    - uses: actions/checkout@v3

    - name: Setup ROS2
      uses: ros-tooling/setup-ros@v0.6
      with:
        required-ros-distributions: humble

    - name: Build
      run: |
        source /opt/ros/humble/setup.bash
        colcon build

    - name: Run integration tests
      run: |
        source install/setup.bash
        colcon test --packages-select my_package --pytest-args -m integration
        colcon test-result --verbose

  simulation-tests:
    runs-on: ubuntu-22.04
    steps:
    - uses: actions/checkout@v3

    - name: Setup ROS2 with Gazebo
      run: |
        sudo apt update
        sudo apt install -y ros-humble-gazebo-ros-pkgs

    - name: Run simulation tests
      run: |
        source /opt/ros/humble/setup.bash
        colcon build
        source install/setup.bash
        timeout 300 ros2 launch my_package simulation_test.launch.py || true
        python3 scripts/validate_simulation_results.py
```

#### Linting and Code Quality

```yaml
# .github/workflows/lint.yml
name: Code Quality

on: [push, pull_request]

jobs:
  cpplint:
    runs-on: ubuntu-22.04
    steps:
    - uses: actions/checkout@v3

    - name: Setup ROS2
      uses: ros-tooling/setup-ros@v0.6
      with:
        required-ros-distributions: humble

    - name: Run cpplint
      run: |
        source /opt/ros/humble/setup.bash
        ament_cpplint src/

  cppcheck:
    runs-on: ubuntu-22.04
    steps:
    - uses: actions/checkout@v3

    - name: Install cppcheck
      run: sudo apt install -y cppcheck

    - name: Run cppcheck
      run: |
        cppcheck --enable=all --inconclusive --xml --xml-version=2 \
          src/ 2> cppcheck_report.xml

    - name: Upload report
      uses: actions/upload-artifact@v3
      with:
        name: cppcheck-report
        path: cppcheck_report.xml

  flake8:
    runs-on: ubuntu-22.04
    steps:
    - uses: actions/checkout@v3

    - name: Install flake8
      run: pip3 install flake8

    - name: Run flake8
      run: |
        flake8 src/ --count --select=E9,F63,F7,F82 --show-source --statistics
        flake8 src/ --count --max-complexity=10 --max-line-length=100 --statistics
```

---

### 7. Deployment Automation

#### Automated Deployment with Ansible

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-22.04
    steps:
    - uses: actions/checkout@v3

    - name: Setup SSH
      run: |
        mkdir -p ~/.ssh
        echo "${{ secrets.ROBOT_SSH_KEY }}" > ~/.ssh/id_rsa
        chmod 600 ~/.ssh/id_rsa
        ssh-keyscan -H robot1.local >> ~/.ssh/known_hosts

    - name: Build Docker image
      run: |
        docker build -t my-robot:${{ github.sha }} .
        docker save my-robot:${{ github.sha }} | gzip > robot_image.tar.gz

    - name: Deploy with Ansible
      run: |
        pip3 install ansible
        ansible-playbook -i ansible/inventory.yml ansible/deploy.yml \
          -e "image_tag=${{ github.sha }}"
```

**Ansible Playbook:**

```yaml
# ansible/deploy.yml
---
- name: Deploy ROS2 application
  hosts: robots
  become: yes
  vars:
    workspace_dir: /opt/ros2_ws
    image_tag: "{{ image_tag }}"

  tasks:
    - name: Copy Docker image
      copy:
        src: ../robot_image.tar.gz
        dest: /tmp/robot_image.tar.gz

    - name: Load Docker image
      docker_image:
        name: my-robot
        tag: "{{ image_tag }}"
        load_path: /tmp/robot_image.tar.gz
        source: load

    - name: Stop old container
      docker_container:
        name: robot_app
        state: stopped
      ignore_errors: yes

    - name: Remove old container
      docker_container:
        name: robot_app
        state: absent

    - name: Start new container
      docker_container:
        name: robot_app
        image: "my-robot:{{ image_tag }}"
        state: started
        restart_policy: unless-stopped
        network_mode: host
        devices:
          - /dev/ttyUSB0:/dev/ttyUSB0
        env:
          ROS_DOMAIN_ID: "0"

    - name: Wait for health check
      uri:
        url: http://localhost:8080/health
        status_code: 200
      register: result
      until: result.status == 200
      retries: 30
      delay: 2

    - name: Notify success
      debug:
        msg: "Deployment successful on {{ inventory_hostname }}"
```

---

### 8. Release Automation

#### Semantic Versioning with Tags

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  create-release:
    runs-on: ubuntu-22.04
    steps:
    - uses: actions/checkout@v3

    - name: Setup ROS2
      uses: ros-tooling/setup-ros@v0.6
      with:
        required-ros-distributions: humble

    - name: Build release
      run: |
        source /opt/ros/humble/setup.bash
        colcon build --cmake-args -DCMAKE_BUILD_TYPE=Release

    - name: Create tarball
      run: |
        tar -czf my-robot-${{ github.ref_name }}.tar.gz install/

    - name: Create Debian package
      run: |
        # Use bloom to create .deb
        bloom-generate rosdebian --os-name ubuntu --os-version jammy --ros-distro humble
        fakeroot debian/rules binary

    - name: Create GitHub Release
      uses: softprops/action-gh-release@v1
      with:
        files: |
          my-robot-${{ github.ref_name }}.tar.gz
          ../ros-humble-my-robot_*.deb
        body: |
          ## Changes in this Release
          - See CHANGELOG.md for details

          ## Installation
          ```bash
          # From tarball
          tar -xzf my-robot-${{ github.ref_name }}.tar.gz

          # From Debian package
          sudo dpkg -i ros-humble-my-robot_*.deb
          ```
      env:
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

    - name: Push Docker image
      run: |
        docker build -t myregistry/my-robot:${{ github.ref_name }} .
        docker push myregistry/my-robot:${{ github.ref_name }}
        docker tag myregistry/my-robot:${{ github.ref_name }} myregistry/my-robot:latest
        docker push myregistry/my-robot:latest
```

---

### 9. Monitoring and Notifications

#### Slack Notifications

```yaml
# .github/workflows/notify.yml
name: Build Status

on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-22.04
    steps:
    - uses: actions/checkout@v3

    - name: Build
      id: build
      run: |
        source /opt/ros/humble/setup.bash
        colcon build

    - name: Notify Slack on Success
      if: success()
      uses: slackapi/slack-github-action@v1
      with:
        payload: |
          {
            "text": "✅ Build succeeded for ${{ github.repository }}",
            "blocks": [
              {
                "type": "section",
                "text": {
                  "type": "mrkdwn",
                  "text": "*Build Successful*\nRepository: ${{ github.repository }}\nBranch: ${{ github.ref }}\nCommit: ${{ github.sha }}"
                }
              }
            ]
          }
      env:
        SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}

    - name: Notify Slack on Failure
      if: failure()
      uses: slackapi/slack-github-action@v1
      with:
        payload: |
          {
            "text": "❌ Build failed for ${{ github.repository }}",
            "blocks": [
              {
                "type": "section",
                "text": {
                  "type": "mrkdwn",
                  "text": "*Build Failed*\nRepository: ${{ github.repository }}\nBranch: ${{ github.ref }}\n<${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}|View logs>"
                }
              }
            ]
          }
      env:
        SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

---

### 10. Best Practices

**1. Fast Feedback:**
- Run tests in parallel
- Use caching for dependencies
- Fail fast on errors

**2. Reproducible Builds:**
- Pin dependency versions
- Use Docker for consistent environment
- Version control everything (including CI config)

**3. Test Coverage:**
- Unit tests (fast, many)
- Integration tests (moderate, fewer)
- System tests (slow, minimal)

**4. Security:**
- Scan for vulnerabilities
- Don't commit secrets (use CI secrets)
- Sign releases

**5. Documentation:**
- README with build badges
- CHANGELOG.md for releases
- CI logs archived

**6. Deployment:**
- Blue-green deployment
- Automated rollback on failure
- Gradual rollout (canary)

---

## Edge Cases

### Edge Case 1: Flaky Tests Failing CI Intermittently

**Scenario:**
Integration tests pass locally but fail randomly in CI due to timing issues or resource constraints.

**Example:**

```python
# test_navigation.py
def test_robot_reaches_goal():
    # Launch navigation stack
    nav_process = launch_navigation()
    time.sleep(2)  # Wait for startup (FLAKY!)

    # Send goal
    send_goal(x=5.0, y=0.0)

    # Wait for goal reached
    assert wait_for_goal(timeout=30)  # Sometimes times out in CI!
```

**Problem:**
- CI runners slower than local machine
- Resource contention (multiple jobs)
- Network latency
- Timing assumptions

**Symptoms:**
```bash
# CI output
Test test_navigation.py::test_robot_reaches_goal FAILED
AssertionError: Goal not reached within 30 seconds

# Works locally:
$ pytest test_navigation.py -v
test_robot_reaches_goal PASSED
```

**Solution 1: Increase Timeouts for CI**

```python
import os

# Detect CI environment
IS_CI = os.environ.get('CI', 'false') == 'true'
TIMEOUT_MULTIPLIER = 3 if IS_CI else 1

def test_robot_reaches_goal():
    nav_process = launch_navigation()

    # Longer timeout in CI
    startup_timeout = 5 * TIMEOUT_MULTIPLIER
    time.sleep(startup_timeout)

    send_goal(x=5.0, y=0.0)

    # CI gets 3x timeout
    goal_timeout = 30 * TIMEOUT_MULTIPLIER
    assert wait_for_goal(timeout=goal_timeout)
```

**Solution 2: Retry Failed Tests**

```yaml
# .github/workflows/tests.yml
- name: Run tests with retry
  uses: nick-invision/retry@v2
  with:
    timeout_minutes: 10
    max_attempts: 3
    command: |
      source install/setup.bash
      colcon test --packages-select my_package
      colcon test-result --verbose
```

**Solution 3: Proper Wait Conditions**

```python
def test_robot_reaches_goal():
    nav_process = launch_navigation()

    # Wait for service availability (not arbitrary sleep)
    assert wait_for_service('/navigate_to_pose', timeout=30)

    send_goal(x=5.0, y=0.0)

    # Poll for completion
    for i in range(60):  # 60 attempts
        if goal_reached():
            break
        time.sleep(0.5)
    else:
        pytest.fail("Goal not reached")
```

**Solution 4: Mark Flaky Tests**

```python
import pytest

@pytest.mark.flaky(reruns=3, reruns_delay=2)
def test_robot_reaches_goal():
    # Test that may fail occasionally
    # Will retry up to 3 times
    pass
```

```bash
# Install pytest-rerunfailures
pip3 install pytest-rerunfailures

# Run tests with automatic retry
pytest --reruns 3 --reruns-delay 2
```

**Solution 5: Resource Allocation in CI**

```yaml
# .github/workflows/tests.yml
jobs:
  test:
    runs-on: ubuntu-22.04
    # Request more resources for flaky tests
    container:
      options: --cpus 2 --memory 4g

    steps:
    - name: Increase ulimits
      run: |
        ulimit -n 4096
        ulimit -u 2048

    - name: Run tests
      run: |
        # Set nice priority
        nice -n -10 colcon test
```

**Best Practices:**
1. **Avoid arbitrary sleeps** - use wait conditions
2. **Longer timeouts in CI** - CI is slower than local
3. **Retry flaky tests** - up to 3 times
4. **Isolate tests** - don't share state
5. **Monitor CI performance** - detect slowdowns
6. **Local reproduction** - use same Docker image as CI

---

### Edge Case 2: Large Build Artifacts Exceeding Storage Limits

**Scenario:**
CI builds accumulate artifacts (binaries, logs, coverage reports) and exceed storage quota, causing builds to fail.

**Example:**

```yaml
# .github/workflows/build.yml
- name: Build
  run: colcon build

- name: Upload artifacts
  uses: actions/upload-artifact@v3
  with:
    name: build-output
    path: |
      build/
      install/
      log/
# Problem: Uploads 500+ MB per build
# After 100 builds = 50 GB consumed!
```

**GitHub Actions limits:**
- Free: 500 MB per artifact, 2 GB total storage
- Pro: 2 GB per artifact, 50 GB total storage

**Error:**
```
Error: Artifact storage quota exceeded
Total storage: 51.2 GB / 50 GB limit
Please delete old artifacts or upgrade plan
```

**Solution 1: Selective Artifact Upload**

```yaml
- name: Upload only test results
  uses: actions/upload-artifact@v3
  with:
    name: test-results
    path: build/*/test_results/
    # Only upload small test results, not entire build/

- name: Upload coverage report
  uses: actions/upload-artifact@v3
  with:
    name: coverage
    path: coverage_html/
    if-no-files-found: ignore
```

**Solution 2: Set Expiration**

```yaml
- name: Upload build artifacts
  uses: actions/upload-artifact@v3
  with:
    name: build-output
    path: install/
    retention-days: 7  # Auto-delete after 7 days
```

**Solution 3: Conditional Upload**

```yaml
- name: Upload artifacts only on failure
  if: failure()
  uses: actions/upload-artifact@v3
  with:
    name: debug-logs
    path: log/
```

**Solution 4: Compress Artifacts**

```yaml
- name: Compress build output
  run: |
    tar -czf build-output.tar.gz install/
    # 500 MB uncompressed → 100 MB compressed

- name: Upload compressed artifact
  uses: actions/upload-artifact@v3
  with:
    name: build-output
    path: build-output.tar.gz
```

**Solution 5: External Storage**

```yaml
- name: Upload to S3
  run: |
    aws s3 cp install/ s3://my-builds/${{ github.sha }}/ --recursive
  env:
    AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
    AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}

- name: Comment with artifact link
  uses: actions/github-script@v6
  with:
    script: |
      github.rest.issues.createComment({
        issue_number: context.issue.number,
        owner: context.repo.owner,
        repo: context.repo.repo,
        body: 'Build artifacts: https://my-builds.s3.amazonaws.com/${{ github.sha }}/'
      })
```

**Solution 6: Cleanup Old Artifacts**

```yaml
# .github/workflows/cleanup.yml
name: Cleanup Old Artifacts

on:
  schedule:
    - cron: '0 0 * * 0'  # Weekly

jobs:
  cleanup:
    runs-on: ubuntu-22.04
    steps:
    - name: Delete old artifacts
      uses: c-hive/gha-remove-artifacts@v1
      with:
        age: '30 days'
        skip-recent: 5  # Keep last 5
```

**Best Practices:**
1. **Upload selectively** - only what's needed for debugging
2. **Set retention** - auto-delete after N days
3. **Compress** - reduce artifact size
4. **External storage** - for large/long-term artifacts
5. **Clean up** - automated deletion of old artifacts

---

### Edge Case 3: CI Breaking Due to External Dependency Updates

**Scenario:**
CI uses "latest" versions of dependencies. An upstream package updates and breaks compatibility, causing all builds to fail.

**Example:**

```yaml
# .github/workflows/build.yml (BAD)
- name: Install dependencies
  run: |
    sudo apt update
    sudo apt install -y ros-humble-navigation2  # Gets latest version!
```

**Problem:**
```bash
# Yesterday: navigation2 version 1.0.0 → Build passes
# Today: navigation2 version 2.0.0 released → Build fails!

Error: undefined reference to 'NavigateToPose::execute()'
# API changed in new version!
```

**Solution 1: Pin Dependency Versions**

```yaml
# .github/workflows/build.yml (GOOD)
- name: Install dependencies
  run: |
    sudo apt update
    # Pin to specific version
    sudo apt install -y \
      ros-humble-navigation2=1.0.0-1jammy \
      ros-humble-gazebo-ros-pkgs=3.7.0-1jammy
```

**Solution 2: Lock File (rosdep)**

```yaml
# rosdep.lock (commit to git)
navigation2: 1.0.0
gazebo_ros_pkgs: 3.7.0
```

```bash
# In CI
rosdep install --from-paths src --ignore-src -r -y --rosdistro humble \
  --skip-keys "$(cat rosdep.lock | tr '\n' ' ')"
```

**Solution 3: Use Docker with Fixed Base Image**

```dockerfile
# Dockerfile
FROM ros:humble-ros-base-jammy-20240101  # Tag with date!
# Not: FROM ros:humble-ros-base (floating tag)

RUN apt update && apt install -y \
    ros-humble-navigation2=1.0.0-1jammy \
    && rm -rf /var/lib/apt/lists/*
```

```yaml
# .github/workflows/build.yml
- name: Build in Docker
  run: |
    docker build -t my-robot:ci .
    docker run my-robot:ci colcon build
```

**Solution 4: Dependency Version Matrix**

```yaml
# Test with multiple versions
strategy:
  matrix:
    nav2_version: ['1.0.0', '2.0.0']

steps:
- name: Install navigation2
  run: |
    sudo apt install -y ros-humble-navigation2=${{ matrix.nav2_version }}-1jammy
```

**Solution 5: Renovate Bot for Dependency Updates**

```json
// renovate.json
{
  "extends": ["config:base"],
  "packageRules": [
    {
      "matchPackagePatterns": ["ros-humble-*"],
      "automerge": false,
      "schedule": ["before 9am on monday"]
    }
  ]
}
```

Renovate creates PRs when dependencies update, allowing testing before merge.

**Best Practices:**
1. **Pin all versions** - no floating dependencies
2. **Test upgrades** - in separate branch/PR
3. **Use lock files** - document exact versions
4. **Docker with tags** - not "latest"
5. **Automated monitoring** - Renovate, Dependabot

---

### Edge Case 4: Secrets Leaked in CI Logs

**Scenario:**
Developer accidentally commits secrets (API keys, passwords) or CI logs expose secrets, creating security vulnerability.

**Example:**

```yaml
# .github/workflows/deploy.yml (BAD!)
- name: Deploy
  run: |
    export AWS_SECRET_KEY="abc123secret"  # Visible in logs!
    rsync -avz --password=mypassword robot@robot1:/opt/  # Password in logs!
```

**CI Log output:**
```
Run export AWS_SECRET_KEY="abc123secret"
export AWS_SECRET_KEY="abc123secret"
rsync -avz --password=mypassword robot@robot1:/opt/
# SECRET EXPOSED IN PUBLIC LOGS!
```

**Problem:**
- Secrets visible in logs
- Anyone with repo access can see
- Historical logs retain secrets even after rotation

**Solution 1: Use CI Secrets (Proper Way)**

```yaml
# .github/workflows/deploy.yml (GOOD)
- name: Deploy
  env:
    AWS_SECRET_KEY: ${{ secrets.AWS_SECRET_KEY }}
    ROBOT_PASSWORD: ${{ secrets.ROBOT_PASSWORD }}
  run: |
    # Secrets are masked in logs as ***
    echo "AWS key: $AWS_SECRET_KEY"  # Output: AWS key: ***
    deploy_script.sh
```

**GitHub secrets configuration:**
```
Repository → Settings → Secrets → Actions
Add secret: AWS_SECRET_KEY = abc123secret
```

**Solution 2: Detect Secrets in Commits**

```yaml
# .github/workflows/secret-scan.yml
name: Secret Scan

on: [push, pull_request]

jobs:
  detect-secrets:
    runs-on: ubuntu-22.04
    steps:
    - uses: actions/checkout@v3
      with:
        fetch-depth: 0  # Full history

    - name: Install detect-secrets
      run: pip3 install detect-secrets

    - name: Scan for secrets
      run: |
        detect-secrets scan --all-files --force-use-all-plugins
        if [ $? -ne 0 ]; then
          echo "Secrets detected in repository!"
          exit 1
        fi
```

**Solution 3: Pre-commit Hook**

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/Yelp/detect-secrets
    rev: v1.4.0
    hooks:
      - id: detect-secrets
        args: ['--baseline', '.secrets.baseline']
```

```bash
# Install pre-commit
pip3 install pre-commit
pre-commit install

# Now commits with secrets are blocked locally
git commit -m "Add config"
# Error: Detected secrets in config.yaml!
```

**Solution 4: Rotate Exposed Secrets**

```bash
# If secret was exposed:
# 1. Immediately rotate/revoke
aws iam delete-access-key --access-key-id EXPOSED_KEY

# 2. Generate new secret
aws iam create-access-key

# 3. Update GitHub secret
# Repository → Settings → Secrets → Edit AWS_SECRET_KEY

# 4. Clear CI cache (may contain old secret)
gh cache delete --all

# 5. Re-run failed builds with new secret
```

**Solution 5: Audit Logs**

```bash
# Check GitHub audit log for secret access
curl -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/repos/owner/repo/events | grep secret
```

**Best Practices:**
1. **Never commit secrets** - use CI secrets feature
2. **Scan for secrets** - in CI and pre-commit hooks
3. **Rotate regularly** - every 90 days minimum
4. **Principle of least privilege** - minimal permissions per secret
5. **Monitor access** - audit logs for secret usage
6. **Encrypt at rest** - use secret management tools (Vault, AWS Secrets Manager)

**Example secret management:**

```yaml
# .github/workflows/secure-deploy.yml
- name: Get secrets from Vault
  uses: hashicorp/vault-action@v2
  with:
    url: https://vault.example.com
    token: ${{ secrets.VAULT_TOKEN }}
    secrets: |
      secret/data/robot aws_key | AWS_KEY ;
      secret/data/robot ssh_key | SSH_KEY

- name: Deploy with secrets
  run: |
    echo "$SSH_KEY" > ~/.ssh/id_rsa
    chmod 600 ~/.ssh/id_rsa
    AWS_ACCESS_KEY_ID=$AWS_KEY deploy.sh
```

---

## Code Examples

### Example: Complete CI/CD Pipeline for ROS2 Project

This example shows a production-ready CI/CD setup.

**Directory Structure:**

```
my_robot_project/
├── .github/
│   └── workflows/
│       ├── ci.yml
│       ├── deploy.yml
│       └── release.yml
├── .gitlab-ci.yml
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
├── ansible/
│   ├── inventory.yml
│   └── deploy.yml
├── src/
│   └── my_robot_package/
├── scripts/
│   ├── build.sh
│   ├── test.sh
│   └── deploy.sh
└── README.md
```

**1. GitHub Actions CI (.github/workflows/ci.yml):**

```yaml
name: ROS2 CI/CD

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]
  schedule:
    - cron: '0 0 * * 1'  # Weekly on Monday

env:
  ROS_DISTRO: humble

jobs:
  # Job 1: Lint and static analysis
  lint:
    name: Lint & Static Analysis
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v3

      - name: Setup ROS2
        uses: ros-tooling/setup-ros@v0.6
        with:
          required-ros-distributions: ${{ env.ROS_DISTRO }}

      - name: Run linters
        run: |
          source /opt/ros/${{ env.ROS_DISTRO }}/setup.bash

          # C++ linting
          ament_cpplint src/

          # Python linting
          ament_flake8 src/

          # CMake linting
          ament_lint_cmake src/

      - name: Run cppcheck
        run: |
          sudo apt install -y cppcheck
          cppcheck --enable=all --inconclusive --xml \
            --suppress=missingIncludeSystem \
            src/ 2> cppcheck_report.xml

      - name: Upload cppcheck results
        uses: actions/upload-artifact@v3
        with:
          name: cppcheck-report
          path: cppcheck_report.xml

  # Job 2: Build and unit test
  build-and-test:
    name: Build & Test (ROS2 ${{ matrix.ros_distro }})
    runs-on: ubuntu-${{ matrix.ubuntu_version }}
    strategy:
      matrix:
        include:
          - ros_distro: humble
            ubuntu_version: '22.04'
          - ros_distro: jazzy
            ubuntu_version: '24.04'
      fail-fast: false

    steps:
      - uses: actions/checkout@v3

      - name: Setup ROS2
        uses: ros-tooling/setup-ros@v0.6
        with:
          required-ros-distributions: ${{ matrix.ros_distro }}

      - name: Cache dependencies
        uses: actions/cache@v3
        with:
          path: |
            ~/.ros
            ~/ros2_ws/build
          key: ${{ runner.os }}-ros2-${{ matrix.ros_distro }}-${{ hashFiles('**/package.xml') }}
          restore-keys: |
            ${{ runner.os }}-ros2-${{ matrix.ros_distro }}-

      - name: Install dependencies
        run: |
          source /opt/ros/${{ matrix.ros_distro }}/setup.bash
          sudo apt update
          rosdep update
          rosdep install --from-paths src --ignore-src -r -y

      - name: Build workspace
        run: |
          source /opt/ros/${{ matrix.ros_distro }}/setup.bash
          colcon build \
            --symlink-install \
            --cmake-args -DCMAKE_BUILD_TYPE=Release \
            --event-handlers console_direct+

      - name: Run tests
        run: |
          source /opt/ros/${{ matrix.ros_distro }}/setup.bash
          source install/setup.bash
          colcon test \
            --event-handlers console_direct+ \
            --return-code-on-test-failure

      - name: Test results
        if: always()
        run: |
          colcon test-result --verbose

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: test-results-${{ matrix.ros_distro }}
          path: build/*/test_results/
          retention-days: 7

  # Job 3: Code coverage
  coverage:
    name: Code Coverage
    runs-on: ubuntu-22.04
    needs: build-and-test

    steps:
      - uses: actions/checkout@v3

      - name: Setup ROS2
        uses: ros-tooling/setup-ros@v0.6
        with:
          required-ros-distributions: ${{ env.ROS_DISTRO }}

      - name: Install coverage tools
        run: sudo apt install -y lcov

      - name: Build with coverage
        run: |
          source /opt/ros/${{ env.ROS_DISTRO }}/setup.bash
          colcon build \
            --cmake-args \
              -DCMAKE_BUILD_TYPE=Debug \
              -DCMAKE_CXX_FLAGS="--coverage" \
              -DCMAKE_C_FLAGS="--coverage"

      - name: Run tests
        run: |
          source install/setup.bash
          colcon test

      - name: Generate coverage report
        run: |
          lcov --capture \
            --directory build \
            --output-file coverage.info

          lcov --remove coverage.info \
            '/usr/*' \
            '*/test/*' \
            '*/build/*' \
            --output-file coverage_filtered.info

          genhtml coverage_filtered.info \
            --output-directory coverage_html

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage_filtered.info
          flags: unittests
          name: codecov-umbrella
          fail_ci_if_error: true

      - name: Upload coverage HTML
        uses: actions/upload-artifact@v3
        with:
          name: coverage-report
          path: coverage_html/

  # Job 4: Build Docker image
  docker:
    name: Build Docker Image
    runs-on: ubuntu-22.04
    needs: build-and-test
    if: github.event_name == 'push'

    steps:
      - uses: actions/checkout@v3

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v2

      - name: Login to DockerHub
        uses: docker/login-action@v2
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v4
        with:
          images: myusername/my-robot
          tags: |
            type=ref,event=branch
            type=sha,prefix={{branch}}-
            type=semver,pattern={{version}}

      - name: Build and push
        uses: docker/build-push-action@v4
        with:
          context: .
          file: ./docker/Dockerfile
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=registry,ref=myusername/my-robot:buildcache
          cache-to: type=registry,ref=myusername/my-robot:buildcache,mode=max

  # Job 5: Integration tests
  integration:
    name: Integration Tests
    runs-on: ubuntu-22.04
    needs: build-and-test

    steps:
      - uses: actions/checkout@v3

      - name: Setup ROS2
        uses: ros-tooling/setup-ros@v0.6
        with:
          required-ros-distributions: ${{ env.ROS_DISTRO }}

      - name: Install Gazebo
        run: |
          sudo apt update
          sudo apt install -y ros-${{ env.ROS_DISTRO }}-gazebo-ros-pkgs

      - name: Build
        run: |
          source /opt/ros/${{ env.ROS_DISTRO }}/setup.bash
          colcon build

      - name: Run integration tests
        run: |
          source install/setup.bash
          timeout 300 colcon test \
            --packages-select my_robot_package \
            --pytest-args -m integration \
            || true

      - name: Collect test results
        run: colcon test-result --verbose
```

**2. Deployment Workflow (.github/workflows/deploy.yml):**

```yaml
name: Deploy to Robots

on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Deployment environment'
        required: true
        default: 'staging'
        type: choice
        options:
          - staging
          - production
      robots:
        description: 'Robot IDs (comma-separated, or "all")'
        required: true
        default: 'all'

jobs:
  deploy:
    name: Deploy to ${{ github.event.inputs.environment }}
    runs-on: ubuntu-22.04
    environment: ${{ github.event.inputs.environment }}

    steps:
      - uses: actions/checkout@v3

      - name: Setup SSH
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.SSH_PRIVATE_KEY }}" > ~/.ssh/id_rsa
          chmod 600 ~/.ssh/id_rsa

          # Add known hosts
          ssh-keyscan -H ${{ secrets.ROBOT_HOST }} >> ~/.ssh/known_hosts

      - name: Build Docker image
        run: |
          docker build -t my-robot:${{ github.sha }} -f docker/Dockerfile .
          docker save my-robot:${{ github.sha }} | gzip > robot_image.tar.gz

      - name: Setup Ansible
        run: |
          pip3 install ansible

      - name: Deploy with Ansible
        env:
          ANSIBLE_HOST_KEY_CHECKING: False
        run: |
          ansible-playbook ansible/deploy.yml \
            -i ansible/inventory.yml \
            -e "environment=${{ github.event.inputs.environment }}" \
            -e "robots=${{ github.event.inputs.robots }}" \
            -e "image_tag=${{ github.sha }}" \
            -v

      - name: Health check
        run: |
          for robot in $(echo "${{ github.event.inputs.robots }}" | tr ',' ' '); do
            echo "Checking health of $robot..."
            ssh robot@$robot-${{ github.event.inputs.environment }} \
              '/opt/robot/scripts/health_check.sh' || exit 1
          done

      - name: Notify deployment
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "✅ Deployment successful",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Deployment Complete*\nEnvironment: ${{ github.event.inputs.environment }}\nRobots: ${{ github.event.inputs.robots }}\nCommit: ${{ github.sha }}"
                  }
                }
              ]
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}

      - name: Rollback on failure
        if: failure()
        run: |
          echo "Deployment failed, initiating rollback..."
          ansible-playbook ansible/rollback.yml \
            -i ansible/inventory.yml \
            -e "environment=${{ github.event.inputs.environment }}"
```

**3. Build Script (scripts/build.sh):**

```bash
#!/bin/bash
set -e

ROS_DISTRO=${ROS_DISTRO:-humble}
BUILD_TYPE=${BUILD_TYPE:-Release}

echo "=== Building ROS2 Workspace ==="
echo "ROS Distribution: $ROS_DISTRO"
echo "Build Type: $BUILD_TYPE"

# Source ROS2
source /opt/ros/$ROS_DISTRO/setup.bash

# Install dependencies
echo "Installing dependencies..."
rosdep update
rosdep install --from-paths src --ignore-src -r -y

# Build
echo "Building workspace..."
colcon build \
  --symlink-install \
  --cmake-args -DCMAKE_BUILD_TYPE=$BUILD_TYPE \
  --event-handlers console_direct+

echo "Build complete!"
```

**4. Test Script (scripts/test.sh):**

```bash
#!/bin/bash
set -e

ROS_DISTRO=${ROS_DISTRO:-humble}

echo "=== Running Tests ==="

source /opt/ros/$ROS_DISTRO/setup.bash
source install/setup.bash

# Run tests
colcon test \
  --event-handlers console_direct+ \
  --return-code-on-test-failure

# Show results
colcon test-result --verbose

echo "All tests passed!"
```

**Usage:**

```bash
# Local development
./scripts/build.sh
./scripts/test.sh

# CI automatically runs on push
git push origin develop

# Manual deployment
gh workflow run deploy.yml \
  -f environment=staging \
  -f robots=robot1,robot2
```

---

## Interview Questions

### Question 1: What's the difference between continuous integration and continuous deployment in the context of ROS2?

**Difficulty:** ⭐⭐ (Medium)

**Answer:**

**Continuous Integration (CI):**
- **Goal:** Verify code quality on every commit
- **Triggers:** Push to git, pull request
- **Actions:**
  - Build ROS2 workspace
  - Run unit tests
  - Run integration tests
  - Check code quality (linting)
  - Generate coverage reports
- **Outcome:** Pass/fail status, artifacts

**Example CI workflow:**
```yaml
on: [push, pull_request]
jobs:
  ci:
    steps:
    - Checkout code
    - Build workspace
    - Run tests
    - Report results
```

**Continuous Deployment (CD):**
- **Goal:** Automatically deploy to robots/production
- **Triggers:** Successful CI on specific branch (e.g., main)
- **Actions:**
  - Build Docker image
  - Push to container registry
  - Deploy to staging
  - Run smoke tests
  - Deploy to production (manual approval)
- **Outcome:** Code running on robots

**Example CD workflow:**
```yaml
on:
  push:
    branches: [main]
jobs:
  cd:
    needs: ci  # Wait for CI to pass
    steps:
    - Build Docker image
    - Deploy to robots
    - Health check
```

**Key differences:**

| Aspect | CI | CD |
|--------|----|----|
| **Purpose** | Validate code | Deploy code |
| **Frequency** | Every commit | After CI passes |
| **Environment** | CI runner | Production robots |
| **Failure impact** | Block merge | Rollback |
| **Manual approval** | Not needed | Often required (prod) |

**ROS2-specific considerations:**

**CI challenges:**
- Long build times (C++ compilation)
- Integration tests need simulation
- Hardware dependencies (sensors)

**CD challenges:**
- Zero-downtime deployment (blue-green)
- Robot fleet coordination
- Network reliability
- Safety validation

**Best practice: CI/CD pipeline for ROS2:**

```
Commit → CI (build + test) → CD (staging) → Manual approval → CD (production)
           ↓ fail: block                     ↓ fail: rollback
```

---

### Question 2: How would you optimize CI build times for a large ROS2 workspace?

**Difficulty:** ⭐⭐⭐ (Hard)

**Answer:**

Large ROS2 workspaces can take 30+ minutes to build in CI. Here are optimization strategies:

**1. Caching Dependencies**

```yaml
# .github/workflows/ci.yml
- name: Cache ROS2 dependencies
  uses: actions/cache@v3
  with:
    path: |
      ~/.ros
      ~/ros2_ws/build
      ~/ros2_ws/install
    key: ${{ runner.os }}-ros2-${{ hashFiles('**/package.xml') }}
    restore-keys: |
      ${{ runner.os }}-ros2-

# Subsequent builds: 30min → 5min (6x faster!)
```

**2. Incremental Builds**

```yaml
- name: Build changed packages only
  run: |
    # Get list of changed packages
    changed_packages=$(git diff --name-only HEAD~1 | \
      grep "^src/" | cut -d/ -f2 | sort -u)

    # Build only changed packages + dependents
    colcon build \
      --packages-up-to $changed_packages \
      --cmake-args -DCMAKE_BUILD_TYPE=Release
```

**3. Parallel Builds**

```yaml
- name: Build with parallelism
  run: |
    # Use all available cores
    colcon build \
      --parallel-workers $(nproc) \
      --cmake-args -DCMAKE_BUILD_TYPE=Release
```

**4. ccache (Compiler Cache)**

```yaml
- name: Setup ccache
  uses: hendrikmuhs/ccache-action@v1
  with:
    key: ${{ runner.os }}-ccache

- name: Build with ccache
  run: |
    export CC="ccache gcc"
    export CXX="ccache g++"
    colcon build

# Repeated builds: 30min → 3min (10x faster!)
```

**5. Docker Layer Caching**

```dockerfile
# Multi-stage Dockerfile
FROM ros:humble-ros-base AS deps

# Copy only package.xml (rarely changes)
COPY src/*/package.xml src/*/
RUN rosdep install --from-paths src --ignore-src -y
# ← This layer cached unless package.xml changes!

FROM deps AS builder
# Copy source code (changes frequently)
COPY src/ src/
RUN colcon build
```

```yaml
- name: Build with Docker cache
  uses: docker/build-push-action@v4
  with:
    context: .
    cache-from: type=registry,ref=my-robot:buildcache
    cache-to: type=registry,ref=my-robot:buildcache,mode=max
```

**6. Matrix Strategy (Parallel Jobs)**

```yaml
strategy:
  matrix:
    package:
      - package_a
      - package_b
      - package_c

jobs:
  build:
    steps:
    - name: Build ${{ matrix.package }}
      run: colcon build --packages-select ${{ matrix.package }}

# 3 packages built in parallel instead of sequentially
# Total time = max(package_a, package_b, package_c)
```

**7. Minimal Test Builds**

```yaml
# For PRs: build only changed packages
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  pr-build:
    steps:
    - name: Build minimal
      run: |
        # Skip tests on dependencies
        colcon build \
          --packages-up-to my_package \
          --cmake-args \
            -DBUILD_TESTING=OFF \
            -DCMAKE_BUILD_TYPE=Release
```

**8. Self-Hosted Runners (Powerful Hardware)**

```yaml
jobs:
  build:
    runs-on: self-hosted  # Your own powerful server
    # Instead of: runs-on: ubuntu-22.04 (GitHub's 2-core VM)

# Your server: 32 cores, 64 GB RAM → 10x faster builds
```

**Comparison:**

| Optimization | Time Savings | Complexity |
|-------------|--------------|------------|
| Caching | 5-10x | Low |
| Incremental | 3-5x | Medium |
| Parallel builds | 2-4x | Low |
| ccache | 5-10x | Low |
| Docker cache | 3-5x | Medium |
| Matrix | 2-4x | Low |
| Minimal test | 2x | Low |
| Self-hosted | 5-10x | High |

**Combined approach:**
```yaml
# Ultimate optimized CI
- uses: hendrikmuhs/ccache-action@v1  # ccache
- uses: actions/cache@v3  # Dependency cache
  with:
    path: build/
- name: Build
  run: |
    export CC="ccache gcc"
    export CXX="ccache g++"
    colcon build \
      --parallel-workers $(nproc) \  # Parallel
      --packages-up-to my_package  # Incremental

# Result: 30min → 2min (15x faster!)
```

---

### Question 3: How would you implement a blue-green deployment strategy in CI/CD for a robot fleet?

**Difficulty:** ⭐⭐⭐ (Hard)

**Answer:**

Blue-green deployment runs two versions simultaneously and switches traffic between them for zero-downtime updates.

**Architecture:**

```
Fleet: 10 robots

Blue Environment (current version v1.0):
  robot1_blue, robot2_blue, ..., robot10_blue
  ↓ (receiving commands)

Green Environment (new version v2.0):
  robot1_green, robot2_green, ..., robot10_green
  ↓ (idle/testing)

After validation:
  Switch → Green becomes active, Blue becomes idle
```

**Implementation:**

**1. Docker-based Blue-Green:**

```yaml
# .github/workflows/blue-green-deploy.yml
name: Blue-Green Deployment

on:
  workflow_dispatch:
    inputs:
      version:
        required: true
        description: 'Version to deploy'

jobs:
  deploy:
    runs-on: ubuntu-22.04
    steps:
    - name: Determine current environment
      id: current
      run: |
        # Query which environment is active (blue or green)
        current=$(ssh robot@robot1 'cat /opt/robot/current_env')
        echo "current=$current" >> $GITHUB_OUTPUT

        # New environment is the opposite
        if [ "$current" == "blue" ]; then
          echo "target=green" >> $GITHUB_OUTPUT
        else
          echo "target=blue" >> $GITHUB_OUTPUT
        fi

    - name: Deploy to ${{ steps.current.outputs.target }}
      run: |
        # Deploy new version to inactive environment
        ansible-playbook ansible/deploy.yml \
          -e "environment=${{ steps.current.outputs.target }}" \
          -e "version=${{ github.event.inputs.version }}"

    - name: Health check ${{ steps.current.outputs.target }}
      run: |
        for robot in robot{1..10}; do
          ssh robot@$robot \
            "/opt/robot/health_check.sh ${{ steps.current.outputs.target }}" \
            || exit 1
        done

    - name: Run smoke tests
      run: |
        # Test new environment before switching
        ansible-playbook ansible/smoke_tests.yml \
          -e "environment=${{ steps.current.outputs.target }}"

    - name: Switch traffic to ${{ steps.current.outputs.target }}
      run: |
        # Update active environment
        for robot in robot{1..10}; do
          ssh robot@$robot \
            "echo '${{ steps.current.outputs.target }}' > /opt/robot/current_env"

          # Restart with new environment
          ssh robot@$robot \
            "sudo systemctl restart robot-${{ steps.current.outputs.target }}.service"

          # Stop old environment
          ssh robot@$robot \
            "sudo systemctl stop robot-${{ steps.current.outputs.current }}.service"
        done

    - name: Monitor for 5 minutes
      run: |
        # Watch for errors in new environment
        for i in {1..10}; do
          sleep 30
          ansible-playbook ansible/check_health.yml || {
            echo "Health check failed, rolling back!"
            exit 1
          }
        done

    - name: Rollback on failure
      if: failure()
      run: |
        echo "Deployment failed, rolling back to ${{ steps.current.outputs.current }}"

        for robot in robot{1..10}; do
          # Switch back to old environment
          ssh robot@$robot \
            "echo '${{ steps.current.outputs.current }}' > /opt/robot/current_env"
          ssh robot@$robot \
            "sudo systemctl start robot-${{ steps.current.outputs.current }}.service"
          ssh robot@$robot \
            "sudo systemctl stop robot-${{ steps.current.outputs.target }}.service"
        done
```

**2. Robot-Side Configuration:**

```ini
# /etc/systemd/system/robot-blue.service
[Unit]
Description=Robot Blue Environment
After=network.target

[Service]
Type=simple
User=robot
ExecStart=/usr/bin/docker run --rm --name robot_blue \
  --network host \
  my-robot:blue \
  ros2 launch my_package robot.launch.py namespace:=/blue

Restart=on-failure

# /etc/systemd/system/robot-green.service
[Unit]
Description=Robot Green Environment
After=network.target

[Service]
Type=simple
User=robot
ExecStart=/usr/bin/docker run --rm --name robot_green \
  --network host \
  my-robot:green \
  ros2 launch my_package robot.launch.py namespace:=/green

Restart=on-failure
```

**3. Traffic Router (switches between blue/green):**

```python
#!/usr/bin/env python3
import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist

class TrafficRouter(Node):
    def __init__(self):
        super().__init__('traffic_router')

        # Read current active environment
        with open('/opt/robot/current_env', 'r') as f:
            self.active_env = f.read().strip()

        self.get_logger().info(f'Active environment: {self.active_env}')

        # Subscribe to incoming commands
        self.sub = self.create_subscription(
            Twist, '/cmd_vel', self.cmd_callback, 10)

        # Publishers for both environments
        self.blue_pub = self.create_publisher(Twist, '/blue/cmd_vel', 10)
        self.green_pub = self.create_publisher(Twist, '/green/cmd_vel', 10)

        # Reload environment every 10 seconds
        self.timer = self.create_timer(10.0, self.reload_env)

    def cmd_callback(self, msg):
        # Route to active environment
        if self.active_env == 'blue':
            self.blue_pub.publish(msg)
        elif self.active_env == 'green':
            self.green_pub.publish(msg)

    def reload_env(self):
        # Check for environment switch
        with open('/opt/robot/current_env', 'r') as f:
            new_env = f.read().strip()

        if new_env != self.active_env:
            self.get_logger().info(f'Switching from {self.active_env} to {new_env}')
            self.active_env = new_env
```

**4. Ansible Deployment Playbook:**

```yaml
# ansible/deploy.yml
---
- name: Blue-Green Deployment
  hosts: robots
  vars:
    environment: "{{ environment }}"  # blue or green
    version: "{{ version }}"

  tasks:
    - name: Pull Docker image
      docker_image:
        name: "my-robot:{{ version }}"
        source: pull
        tag: "{{ environment }}"

    - name: Tag image for environment
      docker_image:
        name: "my-robot:{{ version }}"
        repository: "my-robot"
        tag: "{{ environment }}"

    - name: Start {{ environment }} environment
      systemd:
        name: "robot-{{ environment }}.service"
        state: started
        enabled: yes

    - name: Wait for health check
      uri:
        url: "http://localhost:8080/{{ environment }}/health"
        status_code: 200
      register: result
      until: result.status == 200
      retries: 30
      delay: 2
```

**Benefits:**
- **Zero downtime:** Instant switch
- **Easy rollback:** Switch back to old environment
- **Testing in production:** Validate before switch
- **Gradual rollout:** Switch 10% of robots first

**Limitations:**
- **Resource usage:** Need double resources (blue + green)
- **State migration:** Hard to migrate database/state between versions
- **Compatibility:** Both versions must be compatible during switch

---

### Question 4: What metrics would you monitor in a CI/CD pipeline for ROS2, and why?

**Difficulty:** ⭐⭐ (Medium)

**Answer:**

**1. Build Metrics:**

**Build Duration:**
- **Why:** Detect performance degradation
- **Target:** < 10 minutes for PR builds
- **Alert:** If build time increases > 50%

```yaml
- name: Track build time
  run: |
    start_time=$(date +%s)
    colcon build
    end_time=$(date +%s)
    duration=$((end_time - start_time))

    echo "Build duration: ${duration}s"

    # Send to metrics system
    curl -X POST https://metrics.example.com/api/metrics \
      -d "build_duration_seconds=$duration"
```

**Build Success Rate:**
- **Why:** Detect infrastructure issues
- **Target:** > 95% success rate
- **Alert:** If < 90% in last 24 hours

**2. Test Metrics:**

**Test Success Rate:**
- **Why:** Code quality indicator
- **Target:** 100% passing
- **Alert:** Any test failure

**Test Coverage:**
- **Why:** Ensure adequate testing
- **Target:** > 80% line coverage
- **Trend:** Should not decrease

```yaml
- name: Check coverage threshold
  run: |
    coverage=$(lcov --summary coverage.info | grep lines | cut -d' ' -f4 | cut -d'%' -f1)

    if (( $(echo "$coverage < 80" | bc -l) )); then
      echo "Coverage below threshold: $coverage% < 80%"
      exit 1
    fi
```

**Flaky Test Rate:**
- **Why:** Identify unreliable tests
- **Target:** < 1% of tests flaky
- **Action:** Fix or quarantine flaky tests

**3. Code Quality Metrics:**

**Linting Issues:**
- **Why:** Code style consistency
- **Target:** 0 issues
- **Alert:** Block merge if issues found

**Static Analysis Warnings:**
- **Why:** Detect potential bugs
- **Target:** 0 warnings
- **Trend:** Should not increase

**Technical Debt:**
- **Why:** Long-term maintainability
- **Tools:** SonarQube, CodeClimate
- **Target:** Debt ratio < 5%

**4. Deployment Metrics:**

**Deployment Frequency:**
- **Why:** Development velocity
- **Target:** Daily deployments to staging
- **Trend:** Increasing over time

**Lead Time (commit → production):**
- **Why:** Time to market
- **Target:** < 1 hour for hot fixes, < 24 hours for features
- **Trend:** Decreasing over time

**Deployment Success Rate:**
- **Why:** Deployment reliability
- **Target:** > 95%
- **Alert:** If < 90%

**Mean Time to Recovery (MTTR):**
- **Why:** Incident response
- **Target:** < 1 hour
- **Action:** Improve rollback automation

**5. Runtime Metrics (Post-Deployment):**

**Robot Health:**
- **Why:** Detect deployment issues
- **Monitor:** CPU, memory, disk, network
- **Alert:** If any robot unhealthy > 5 minutes

**Error Rate:**
- **Why:** Code quality in production
- **Monitor:** ROS error logs
- **Alert:** If error rate > 10 errors/hour

**Performance:**
- **Why:** Regression detection
- **Monitor:** Topic latency, callback duration
- **Alert:** If latency > 2x baseline

**Dashboard Example (Grafana):**

```
┌─────────────────────────────────────────────────┐
│ CI/CD Dashboard                                 │
├─────────────────────────────────────────────────┤
│ Build Duration: 8m 32s ↓5% vs yesterday        │
│ Test Success Rate: 98.5% (197/200 passed)      │
│ Coverage: 82% ↑2% vs last week                 │
│ Deployments (24h): 12 (11 success, 1 rollback) │
│ MTTR: 45 minutes ↓10min vs last month          │
├─────────────────────────────────────────────────┤
│ [Build Time Graph]                              │
│ [Test Pass/Fail Trend]                          │
│ [Coverage Trend]                                │
│ [Deployment Frequency]                          │
└─────────────────────────────────────────────────┘
```

**Best Practices:**
1. **Automate collection:** Integrate with CI pipeline
2. **Visualize trends:** Dashboards for team visibility
3. **Set thresholds:** Automatic alerts on anomalies
4. **Review regularly:** Weekly metrics review
5. **Correlate:** Connect metrics (e.g., coverage vs bugs)

---

### Question 5: How would you prevent secrets from being exposed in CI/CD logs?

**Difficulty:** ⭐⭐ (Medium)

**Answer:**

**1. Use CI/CD Secret Management:**

```yaml
# GitHub Actions (GOOD)
- name: Deploy
  env:
    AWS_SECRET_KEY: ${{ secrets.AWS_SECRET_KEY }}
  run: |
    # Secret is masked in logs as ***
    echo "Deploying with key: $AWS_SECRET_KEY"
    # Output: Deploying with key: ***
```

**Never hardcode:**
```yaml
# BAD - Exposed in logs!
- name: Deploy
  run: |
    export AWS_SECRET_KEY="abc123secret"  # VISIBLE!
```

**2. Secret Scanning Tools:**

```yaml
# .github/workflows/secret-scan.yml
- name: Scan for secrets
  uses: trufflesecurity/trufflehog@main
  with:
    path: ./
    base: ${{ github.event.repository.default_branch }}
    head: HEAD
```

**3. Pre-commit Hooks:**

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/Yelp/detect-secrets
    rev: v1.4.0
    hooks:
      - id: detect-secrets
        args: ['--baseline', '.secrets.baseline']
```

```bash
# Install and enable
pip install pre-commit
pre-commit install

# Now commits with secrets are blocked locally
```

**4. Mask Secrets in Scripts:**

```bash
#!/bin/bash
# deploy.sh

# GOOD: Mask password in logs
set +x  # Disable command echoing
PASSWORD=$1
echo "Connecting to server..."  # Don't echo password
rsync --password-file=<(echo "$PASSWORD") ...
set -x  # Re-enable echoing
```

**5. Use Temporary Credentials:**

```yaml
# Use OIDC for temporary AWS credentials
- name: Configure AWS credentials
  uses: aws-actions/configure-aws-credentials@v2
  with:
    role-to-assume: arn:aws:iam::123456789012:role/GitHubActionsRole
    aws-region: us-east-1
# No long-lived secrets needed!
```

**6. Rotate Secrets Regularly:**

```bash
# Automate rotation
# .github/workflows/rotate-secrets.yml
on:
  schedule:
    - cron: '0 0 1 * *'  # Monthly

jobs:
  rotate:
    steps:
    - name: Generate new secret
      run: |
        new_secret=$(openssl rand -base64 32)

        # Update in AWS Secrets Manager
        aws secretsmanager update-secret \
          --secret-id robot-api-key \
          --secret-string "$new_secret"

        # Update GitHub secret
        gh secret set ROBOT_API_KEY --body "$new_secret"
```

**7. Audit Logs:**

```bash
# Monitor secret access
gh api repos/owner/repo/actions/secrets/ROBOT_API_KEY/usage

# Set up alerts
gh api graphql -f query='
  query {
    repository(owner: "owner", name: "repo") {
      secretScanningAlerts(first: 10) {
        nodes {
          secret
          resolvedAt
        }
      }
    }
  }
'
```

**Checklist:**
- ✓ Use CI secret management (not hardcoded)
- ✓ Enable secret scanning in repo
- ✓ Pre-commit hooks for local prevention
- ✓ Mask secrets in script output
- ✓ Use temporary credentials (OIDC)
- ✓ Rotate secrets regularly
- ✓ Audit secret access
- ✓ Principle of least privilege
- ✓ Never commit .env files
- ✓ Use .gitignore for sensitive files

**If secret is exposed:**
1. Immediately revoke/rotate
2. Audit usage logs
3. Update all systems
4. Post-mortem to prevent recurrence

---

## Practice Tasks

### Practice Task 1: Setup Complete CI/CD Pipeline

**Objective:** Create a full CI/CD pipeline for a ROS2 project from scratch.

**Requirements:**

1. **CI Pipeline (GitHub Actions or GitLab CI):**
   - Build on every push and PR
   - Run unit tests
   - Run integration tests
   - Generate code coverage report (>80%)
   - Run linters (cpplint, flake8)
   - Build Docker image
   - Test on multiple ROS2 distributions (Humble, Jazzy)

2. **CD Pipeline:**
   - Auto-deploy to staging on develop branch
   - Manual approval for production deployment
   - Blue-green deployment strategy
   - Automated rollback on health check failure

3. **Optimization:**
   - Implement caching (dependencies, build artifacts)
   - Parallel job execution
   - Build time < 10 minutes

4. **Monitoring:**
   - Send notifications to Slack
   - Track build/test metrics
   - Create dashboard with trends

**Deliverables:**
- CI/CD workflow files
- Dockerfile optimized for caching
- Deployment scripts (Ansible or similar)
- Documentation with architecture diagram
- Metrics dashboard

---

### Practice Task 2: Implement Automated Testing Framework

**Objective:** Build a comprehensive automated testing system.

**Requirements:**

1. **Test Pyramid:**
   - Unit tests (80%): Test individual classes/functions
   - Integration tests (15%): Test node interactions
   - System tests (5%): Full simulation tests

2. **Test Infrastructure:**
   - Fixtures for common setup
   - Mocks for hardware dependencies
   - Parameterized tests for edge cases
   - Flaky test detection and retry

3. **Coverage:**
   - Achieve 85%+ line coverage
   - 70%+ branch coverage
   - Generate HTML coverage reports

4. **Performance Testing:**
   - Benchmark critical paths
   - Detect performance regressions
   - Load testing for high-frequency topics

5. **Integration:**
   - Run automatically in CI
   - Test results in JUnit format
   - Fail CI if coverage drops

**Deliverables:**
- Test suite (unit, integration, system)
- Test utilities/helpers
- Coverage configuration
- CI integration
- Performance benchmarks

---

### Practice Task 3: Security and Secret Management

**Objective:** Implement secure CI/CD practices.

**Requirements:**

1. **Secret Management:**
   - No secrets in code or git history
   - Use CI secret management
   - Implement secret rotation automation

2. **Secret Scanning:**
   - Pre-commit hooks for local detection
   - CI scanning with TruffleHog or similar
   - Automated alerts on detection

3. **Access Control:**
   - Principle of least privilege
   - Separate secrets per environment (dev/staging/prod)
   - Audit logging for secret access

4. **Secure Deployment:**
   - Use SSH keys (not passwords)
   - Verify deployment integrity (checksums)
   - Encrypted communication

5. **Incident Response:**
   - Document secret exposure procedure
   - Automated revocation script
   - Post-incident analysis template

**Deliverables:**
- Secret management documentation
- Scanning tools setup
- Rotation automation
- Incident response runbook
- Security checklist

---

## Quick Reference

### GitHub Actions Templates

```yaml
# Basic CI
name: CI
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-22.04
    steps:
    - uses: actions/checkout@v3
    - uses: ros-tooling/setup-ros@v0.6
    - run: colcon build
    - run: colcon test

# Multi-distro
strategy:
  matrix:
    ros_distro: [humble, jazzy]
steps:
- uses: ros-tooling/setup-ros@v0.6
  with:
    required-ros-distributions: ${{ matrix.ros_distro }}

# Coverage
- run: |
    colcon build --cmake-args -DCMAKE_CXX_FLAGS="--coverage"
    colcon test
    lcov --capture --directory build --output-file coverage.info
- uses: codecov/codecov-action@v3

# Docker build
- uses: docker/build-push-action@v4
  with:
    push: true
    tags: my-robot:${{ github.sha }}
    cache-from: type=registry,ref=my-robot:buildcache
```

### Common Commands

```bash
# Build workspace
colcon build --symlink-install

# Run tests
colcon test
colcon test-result --verbose

# Lint
ament_cpplint src/
ament_flake8 src/

# Coverage
lcov --capture --directory build --output-file coverage.info
genhtml coverage.info --output-directory coverage_html

# Docker
docker build -t my-robot:latest .
docker push my-robot:latest
```

---

This completes Topic 4.5: CI/CD for ROS2!