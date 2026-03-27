## TOPIC: Introduction to Software Architecture & Design Thinking

### THEORY_SECTION: Understanding Architecture and How to Think About Design

#### 1. What is Software Architecture? (Simple Explanation)

**Think of architecture like building a house:**

| House Analogy | Software Analogy | Why It Matters |
|---------------|------------------|----------------|
| **Foundation** | Core data structures & classes | If wrong, everything collapses |
| **Rooms** | Components/modules | Each has specific purpose |
| **Doors/Hallways** | Interfaces/APIs | How rooms communicate |
| **Plumbing** | Data flow | How information moves |
| **Electrical** | Control flow | How actions trigger |
| **Blueprint** | Architecture diagram | Plan before building |

**Software Architecture = High-level structure showing:**
- What are the major **components**? (e.g., UI, database, business logic)
- How do they **communicate**? (function calls, messages, events)
- What are the **responsibilities**? (who does what)
- What are the **constraints**? (performance, scalability, maintainability)

**NOT architecture:**
- How you name variables ❌
- Which sorting algorithm you use ❌
- Specific implementation details ❌

**IS architecture:**
- "We separate UI from business logic" ✅
- "Sensors communicate via event bus" ✅
- "Database layer is independent of UI" ✅

#### 2. The Big Question: How Do I Choose an Architecture?

**The 5-Step Thinking Process:**

```
Step 1: Understand REQUIREMENTS
   ↓
Step 2: Identify KEY CHARACTERISTICS (what matters most?)
   ↓
Step 3: Analyze CONSTRAINTS (what limits you?)
   ↓
Step 4: Consider TRADE-OFFS (no perfect solution)
   ↓
Step 5: Choose & VALIDATE (test your choice)
```

**Let's break each step down with real examples:**

---

### Step 1: Understand Requirements (Ask the Right Questions)

**Before choosing architecture, ask:**

| Question Category | What to Ask | Example |
|-------------------|-------------|---------|
| **Functional** | What must the system DO? | "Process sensor data", "Display dashboard" |
| **Performance** | How FAST must it be? | "React to collision in 10ms", "Handle 1000 requests/sec" |
| **Scale** | How BIG will it grow? | "10 users or 10 million?", "1 sensor or 100?" |
| **Change** | What will CHANGE often? | "UI changes frequently", "Business rules evolve" |
| **Integration** | What does it CONNECT to? | "Must integrate with 3rd-party APIs", "Hardware sensors" |
| **Team** | Who will MAINTAIN it? | "Junior devs", "Distributed team", "Just me" |

**Example 1: Simple Calculator App**
```
Requirements:
- Functional: Add, subtract, multiply, divide
- Performance: Instant (< 1ms)
- Scale: Single user
- Change: Rarely changes
- Integration: None
- Team: Solo developer

→ Architecture: Simple! Single class, no layers needed
```

**Example 2: Autonomous Vehicle Control System**
```
Requirements:
- Functional: Sensor fusion, path planning, control
- Performance: Real-time (< 10ms response)
- Scale: 50+ sensors, 100+ components
- Change: Algorithms updated frequently
- Integration: Hardware sensors, GPS, cameras
- Team: 10+ engineers
- Safety: Critical - lives at stake!

→ Architecture: Complex! Need modularity, real-time, safety isolation
```

**Red Flags (Requirements that signal complexity):**
- ⚠️ "Real-time" → Need event-driven, low latency
- ⚠️ "High availability" → Need redundancy, fault tolerance
- ⚠️ "Frequent changes" → Need modular, loosely coupled
- ⚠️ "Multiple teams" → Need clear boundaries, interfaces
- ⚠️ "Safety-critical" → Need isolation, validation layers

---

### Step 2: Identify Key Characteristics (What Matters MOST?)

**The 8 Key Architecture Characteristics:**

| Characteristic | What It Means | When It Matters | Trade-off |
|----------------|---------------|-----------------|-----------|
| **Performance** | Speed, latency, throughput | Real-time systems, games | vs. Maintainability |
| **Scalability** | Handle growth (users, data) | Web services, cloud apps | vs. Simplicity |
| **Maintainability** | Easy to change, debug | Long-term projects | vs. Performance |
| **Testability** | Easy to test | Safety-critical, complex | vs. Performance |
| **Reliability** | Rarely fails | Production systems | vs. Development speed |
| **Security** | Protect from attacks | Financial, healthcare | vs. Usability |
| **Simplicity** | Easy to understand | Small teams, MVPs | vs. Flexibility |
| **Flexibility** | Easy to extend | Changing requirements | vs. Simplicity |

**You can NEVER optimize all 8! You must CHOOSE.**

**Example Decision Matrix:**

```
Autonomous Vehicle:
  Performance:     🔥🔥🔥🔥🔥 (CRITICAL - lives depend on it)
  Reliability:     🔥🔥🔥🔥🔥 (CRITICAL - must not crash)
  Testability:     🔥🔥🔥🔥🔥 (CRITICAL - must validate)
  Maintainability: 🔥🔥🔥🔥  (Important - evolving algorithms)
  Flexibility:     🔥🔥🔥    (Moderate - new sensors)
  Scalability:     🔥🔥      (Low - single vehicle)
  Simplicity:      🔥        (Sacrifice for safety)
  Security:        🔥🔥🔥🔥  (Important - prevent hacking)

→ Architecture: Event-driven (performance) + Modular (testability) + Layered (reliability)
```

```
Mobile Game:
  Performance:     🔥🔥🔥🔥🔥 (CRITICAL - 60fps)
  Simplicity:      🔥🔥🔥🔥  (Important - small team)
  Flexibility:     🔥🔥🔥🔥  (Important - new levels)
  Maintainability: 🔥🔥🔥    (Moderate)
  Reliability:     🔥🔥      (Low - crashes OK)
  Scalability:     🔥        (Single player)
  Testability:     🔥🔥      (Manual testing)
  Security:        🔥        (Offline game)

→ Architecture: Component-based (ECS for performance + flexibility) + Simple layers
```

**The Golden Rule: Pick your top 3 characteristics. Optimize for those. Accept trade-offs on others.**

---

### Step 3: Analyze Constraints (What Limits Your Choices?)

**Common Constraints:**

| Constraint Type | Examples | Impact on Architecture |
|-----------------|----------|------------------------|
| **Technical** | "Must use C++98", "No external libraries" | Limits patterns available |
| **Resource** | "Embedded device: 256KB RAM" | Must be minimal, efficient |
| **Time** | "MVP in 2 weeks" | Simple architecture, iterate later |
| **Budget** | "No cloud costs" | On-premise, self-hosted |
| **Team** | "Team doesn't know design patterns" | Simple, explicit architecture |
| **Legacy** | "Must integrate with 20-year-old system" | Adapter layers, wrappers |
| **Regulatory** | "Must comply with ISO 26262 (automotive)" | Documentation, traceability |

**Real-World Example:**

```
Constraint: Embedded automotive ECU (Electronic Control Unit)
- 512KB RAM (very limited!)
- No dynamic allocation (safety regulation)
- Hard real-time (10ms max)
- Temperature: -40°C to 125°C

Architecture choices FORCED by constraints:
✅ Static allocation → Object pools, pre-allocated buffers
✅ No exceptions → Error codes, return values
✅ Minimal abstraction → Direct function calls, avoid virtual
✅ Deterministic → No STL containers (unpredictable allocation)

Architecture choices ELIMINATED by constraints:
❌ Microservices (too much overhead)
❌ Heavy abstractions (performance hit)
❌ Dynamic plugins (no dynamic allocation)
```

**How to think about constraints:**
1. **List all hard constraints** (must have)
2. **List soft constraints** (nice to have)
3. **Identify deal-breakers** (eliminates certain architectures)
4. **Find creative solutions** (work within constraints)

---

### Step 4: Consider Trade-offs (No Perfect Architecture!)

**The Fundamental Trade-off Triangle:**

```
           PERFORMANCE
               ▲
              / \
             /   \
            /     \
           /       \
          /         \
         /_____△_____\
  MAINTAINABILITY   SIMPLICITY

You can optimize 2 corners, but the 3rd suffers!
```

**Common Trade-off Decisions:**

| Choice | You Gain | You Lose | When to Choose |
|--------|----------|----------|----------------|
| **Layered Architecture** | Clear separation, testable | Performance (function calls) | Business apps, APIs |
| **Event-Driven** | Decoupling, scalability | Complexity, debugging hard | GUI, real-time systems |
| **Microservices** | Independent deploy, scale | Network overhead, complexity | Large teams, cloud |
| **Monolith** | Simplicity, single deploy | Scaling hard, tight coupling | Startups, MVPs |
| **Direct Function Calls** | Fast, simple | Tight coupling | Performance-critical |
| **Abstraction Layers** | Flexibility, testability | Indirection, slower | Changing requirements |

**Trade-off Decision Framework:**

```cpp
// Scenario: Should I use virtual functions (polymorphism) or templates?

// Option 1: Virtual functions (runtime polymorphism)
class Sensor {
public:
    virtual int read() = 0;  // ← Virtual call (~5ns overhead)
};

Pros:
+ Runtime flexibility (change sensor at runtime)
+ Easy to understand
+ Supports plugins (dynamic loading)

Cons:
- Virtual call overhead (~5ns per call)
- Vtable memory cost (~8 bytes per object)
- Indirect (harder to optimize)

When to use: Plugins, runtime configuration, flexibility > performance


// Option 2: Templates (compile-time polymorphism)
template<typename SensorType>
class SensorReader {
    SensorType sensor;
public:
    int read() { return sensor.read(); }  // ← Inlined (0ns overhead)
};

Pros:
+ Zero overhead (inlined)
+ Better optimization
+ Type-safe

Cons:
- Compile-time only (can't change at runtime)
- Code bloat (generates code for each type)
- Longer compile times

When to use: Performance critical, types known at compile-time
```

**How to decide:**
1. **What's the bottleneck?** If performance → templates. If flexibility → virtual.
2. **When is choice made?** Compile-time → templates. Runtime → virtual.
3. **What changes often?** Types change → virtual. Algorithms change → strategy pattern.

---

### Step 5: Choose & Validate (Test Your Thinking)

**The Validation Checklist:**

✅ **Does it meet requirements?**
- Can it handle the performance needs?
- Does it scale as required?
- Can it integrate with external systems?

✅ **Does it match key characteristics?**
- Optimized for your top 3 priorities?
- Acceptable trade-offs on others?

✅ **Does it respect constraints?**
- Fits within resource limits?
- Compatible with existing systems?
- Team can understand and maintain?

✅ **Is it the simplest solution that works?**
- Not over-engineered?
- Just enough architecture, not more?

✅ **Can you prototype it quickly?**
- Build a small proof-of-concept
- Test key assumptions
- Validate performance/scalability

**The "Prototype Before Commit" Rule:**

```
Don't spend months designing the perfect architecture!

Instead:
1. Design high-level architecture (1-2 days)
2. Build small prototype of critical parts (1 week)
3. Test assumptions (performance, integration)
4. Iterate if wrong
5. Then commit to full implementation

"Weeks of coding can save you hours of planning... wait, no, reverse that!"
```

#### 3. Common Architecture Patterns (Quick Reference)

**When to Use Which Pattern:**

| Pattern | Best For | Avoid When | C++ Fit |
|---------|----------|------------|---------|
| **Event-Driven** | GUI, real-time systems, async | Simple scripts | Excellent (callbacks, std::function) |
| **Layered (3-tier)** | Business apps, APIs | Performance-critical | Good (classes, interfaces) |
| **Component-Based (ECS)** | Games, simulations | Simple apps | Excellent (templates, data-oriented) |
| **Pub-Sub** | Decoupled systems, messaging | Tight coupling OK | Good (event bus, observers) |
| **Pipeline** | Data processing, streams | Interactive UIs | Excellent (STL algorithms, ranges) |
| **MVC/MVVM** | GUI applications | No UI | Good (separation of concerns) |
| **Microservices** | Large systems, multiple teams | Small teams, monolith OK | Fair (use gRPC, REST) |
| **Actor Model** | Concurrency, distributed | Shared memory OK | Good (CAF library) |

**Decision Tree (Simplified):**

```
START: What's your main challenge?

1. "Real-time responsiveness" (UI, sensors)
   → Event-Driven Architecture

2. "Separate concerns cleanly" (business logic, UI, data)
   → Layered Architecture (3-tier)

3. "High performance + flexibility" (games, simulations)
   → Component-Based (ECS)

4. "Decouple producers/consumers" (messaging systems)
   → Publisher-Subscriber

5. "Process data through stages" (ETL, pipelines)
   → Pipeline Architecture

6. "Multiple teams, independent deploy"
   → Microservices

7. "Concurrency + isolation"
   → Actor Model

8. "It's simple, just do it!"
   → Monolith (single executable)
```

#### 4. The Architecture Design Process (Step-by-Step)

**Real-World Example: Designing Autonomous Vehicle Architecture**

**Step 1: Gather Requirements**

```
Functional Requirements:
- Read sensor data (cameras, lidar, radar, GPS, IMU)
- Fuse sensor data → single world model
- Plan safe path to destination
- Control steering, throttle, brakes
- Monitor system health
- Log data for debugging

Non-Functional Requirements:
- Performance: < 10ms end-to-end latency
- Reliability: 99.99% uptime
- Safety: Must handle sensor failures
- Testability: Must validate each component
- Maintainability: Algorithms evolve frequently
```

**Step 2: Identify Key Characteristics**

```
Top 3 Priorities:
1. 🔥🔥🔥🔥🔥 Performance (real-time, safety-critical)
2. 🔥🔥🔥🔥🔥 Reliability (must not crash)
3. 🔥🔥🔥🔥🔥 Testability (validate safety)

Trade-offs accepted:
- Simplicity ↓ (complexity OK for safety)
- Development speed ↓ (take time to do it right)
```

**Step 3: Analyze Constraints**

```
Technical Constraints:
- C++ (for performance)
- Real-time OS (QNX or Linux RT)
- Hardware: NVIDIA Drive AGX (powerful embedded)

Team Constraints:
- 10 engineers (need modularity)
- Multiple specialties (perception, planning, control)

Regulatory Constraints:
- ISO 26262 (automotive safety)
- MISRA C++ (coding standard)
```

**Step 4: Choose Architecture Patterns**

```
Primary: Event-Driven Architecture
  Why: Real-time responsiveness, decoupled sensors

Secondary: Layered Architecture
  Why: Clear separation (perception → planning → control)

Tertiary: Component-Based
  Why: Modular, testable, independent components

Data Flow:
  Sensors → Event Bus → Perception Layer → Planning Layer → Control Layer → Actuators
```

**Step 5: Draw High-Level Diagram**

```
┌──────────────────────────────────────────────────────┐
│                  Application Layer                    │
│              (High-Level Decision Making)             │
└───────────────────────┬──────────────────────────────┘
                        │
┌───────────────────────▼──────────────────────────────┐
│                  Planning Layer                       │
│        (Path Planning, Behavior Planning)             │
└───────────────────────┬──────────────────────────────┘
                        │
┌───────────────────────▼──────────────────────────────┐
│                 Perception Layer                      │
│        (Sensor Fusion, Object Detection)              │
└───────────────────────┬──────────────────────────────┘
                        │
┌───────────────────────▼──────────────────────────────┐
│                   Event Bus                           │
│          (Asynchronous Message Passing)               │
└───┬────┬────┬────┬────┬────┬────┬────┬────┬────┬────┘
    │    │    │    │    │    │    │    │    │    │
┌───▼┐ ┌─▼─┐ ┌▼──┐ ┌──▼┐ ┌──▼┐ ┌──▼┐ ┌──▼┐ ┌──▼┐ ┌──▼┐
│Cam1│ │Cam2│ │Lidar│ │Radar│ │GPS│ │IMU│ │Wheel│ │Brake│
└────┘ └────┘ └────┘ └────┘ └────┘ └────┘ └────┘ └────┘
  Hardware Sensors & Actuators
```

**Step 6: Define Component Interfaces**

```cpp
// Clean, abstract interfaces between layers

// Sensor interface (hardware abstraction)
class ISensor {
public:
    virtual ~ISensor() = default;
    virtual SensorData read() = 0;
    virtual bool isHealthy() = 0;
};

// Event bus interface (communication layer)
class IEventBus {
public:
    virtual void publish(const Event& event) = 0;
    virtual void subscribe(EventType type, EventHandler handler) = 0;
};

// Perception interface (sensor fusion output)
class IPerception {
public:
    virtual WorldModel getWorldModel() = 0;
    virtual ObjectList detectObjects() = 0;
};

// Planning interface (path planning output)
class IPlanner {
public:
    virtual Path planPath(const WorldModel& world, const Goal& goal) = 0;
    virtual bool isPathSafe(const Path& path) = 0;
};

// Control interface (vehicle control)
class IController {
public:
    virtual void executePath(const Path& path) = 0;
    virtual void emergencyStop() = 0;
};
```

**Step 7: Validate with Prototype**

```cpp
// Quick prototype to test architecture assumptions

int main() {
    // Create components
    EventBus eventBus;

    CameraSensor camera;
    LidarSensor lidar;

    PerceptionModule perception(&eventBus);
    PlanningModule planning(&eventBus);
    ControlModule control(&eventBus);

    // Connect via event bus
    eventBus.subscribe(EventType::SensorData, perception);
    eventBus.subscribe(EventType::WorldModel, planning);
    eventBus.subscribe(EventType::Path, control);

    // Test: Publish sensor data
    auto start = std::chrono::high_resolution_clock::now();

    SensorData cameraData = camera.read();
    eventBus.publish(Event{EventType::SensorData, cameraData});

    // ... events propagate through system ...

    auto end = std::chrono::high_resolution_clock::now();
    auto latency = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);

    std::cout << "End-to-end latency: " << latency.count() << "ms\n";

    if (latency.count() < 10) {
        std::cout << "✅ Meets real-time requirement!\n";
    } else {
        std::cout << "❌ Too slow! Need to optimize or change architecture.\n";
    }
}
```

**Step 8: Iterate if Needed**

```
Results of prototype:
- ✅ Latency: 8ms (meets requirement)
- ✅ Modularity: Clean interfaces work well
- ⚠️  Memory: Event bus allocates dynamically (not safe for real-time)
- ❌ Testing: Hard to test event flow

Adjustments:
1. Use pre-allocated event queue (object pool)
2. Add event recorder for testing
3. Implement watchdog for reliability

Iterate: Build prototype v2 with fixes...
```

#### 5. Common Pitfalls (What NOT to Do)

| Mistake | Why It's Bad | How to Avoid |
|---------|--------------|--------------|
| **Over-Engineering** | "Let's use microservices for a calculator app" | Start simple, add complexity only when needed |
| **Analysis Paralysis** | Spend 6 months designing, never code | Prototype early, validate assumptions |
| **Resume-Driven Design** | "Let's use the latest trendy pattern!" | Choose based on requirements, not hype |
| **One-Size-Fits-All** | "Always use MVC for everything" | Different problems need different solutions |
| **Ignoring Constraints** | "We'll just need more RAM" | Work within constraints, they're often fixed |
| **Premature Optimization** | "We need to support 1M users on day 1" | Optimize for current scale, plan for growth |
| **No Prototype** | "This will definitely work" (spoiler: it won't) | Always validate critical assumptions |
| **Cargo Cult Architecture** | Copy without understanding | Understand WHY patterns work |

**The Golden Rule of Architecture:**

> "Make it work, make it right, make it fast - in that order."
>
> 1. Make it work: Get basic functionality running
> 2. Make it right: Refactor to clean architecture
> 3. Make it fast: Optimize bottlenecks

**NOT:**
> ❌ "Make it perfect, make it scalable, make it work"

#### 6. Practical Guidelines for Beginners

**When You're Just Starting:**

```
Simple Project (< 1000 lines):
✅ Just write straightforward code
✅ Use functions/classes for organization
❌ Don't need "architecture" yet

Medium Project (1000-10,000 lines):
✅ Separate concerns (UI, logic, data)
✅ Use simple layers
✅ Think about testability
⚠️  Don't over-engineer

Large Project (> 10,000 lines):
✅ Use established patterns
✅ Plan architecture upfront
✅ Draw diagrams
✅ Consider scalability
```

**The "Start Simple, Evolve" Strategy:**

```
Phase 1: Monolith (everything in one place)
  ↓ (When: too coupled, hard to test)
Phase 2: Layers (separate UI, logic, data)
  ↓ (When: layers too large, multiple teams)
Phase 3: Modules (independent components)
  ↓ (When: need independent deploy, scale)
Phase 4: Services (separate processes/services)
```

**How to Know When to Refactor Architecture:**

🚨 **Warning Signs:**
- "Every small change breaks 10 other things" (too coupled)
- "Can't add feature without rewriting half the code" (inflexible)
- "Takes 30 minutes to build" (monolith too large)
- "Tests take 2 hours to run" (poor separation)
- "Can't deploy without downtime" (need modularity)
- "Team of 5 can't work in parallel" (need boundaries)

✅ **When to Refactor:**
- After you understand the problem better
- When pain points become clear
- Before adding major new features
- When team grows
- When scaling becomes issue

❌ **When NOT to Refactor:**
- "Just because" (need concrete reason)
- Week before deadline (wrong time)
- When you don't understand current code (learn first)

---

### EDGE_CASES: Tricky Scenarios in Architecture Design

#### Edge Case 1: The "Perfect Architecture" Trap

**Scenario:** Spending months designing the "perfect" architecture that handles every possible future requirement.

```cpp
// ❌ OVER-ENGINEERED: Calculator app with microservices architecture

class CalculatorService {
    MessageBroker broker;
    ServiceDiscovery registry;
    LoadBalancer loadBalancer;
    CircuitBreaker circuitBreaker;

public:
    Future<double> add(double a, double b) {
        // Send message to Add microservice
        // Wait for response via message queue
        // Handle retries, timeouts, failures
        // ...100 lines of infrastructure code...
        return broker.sendRequest("add-service", {a, b});
    }
};

// ✅ APPROPRIATE: Calculator app with simple design

class Calculator {
public:
    double add(double a, double b) {
        return a + b;  // That's it!
    }
    double subtract(double a, double b) { return a - b; }
    double multiply(double a, double b) { return a * b; }
    double divide(double a, double b) {
        if (b == 0) throw std::invalid_argument("Division by zero");
        return a / b;
    }
};
```

**Why This Happens:**
- Fear of future changes
- Resume-driven development
- Not understanding requirements
- Copying enterprise patterns for simple apps

**How to Avoid:**
- **YAGNI Principle**: You Aren't Gonna Need It
- Start simple, refactor when needed
- Architecture should match current scale, not imagined future scale
- Ask: "What's the simplest design that meets TODAY's requirements?"

**The Right Approach:**
```
Current needs: 10 users, 4 operations
→ Use simple class

When it grows to: 1000 users, 20 operations, 3 teams
→ Refactor to modules

When it becomes: 1M users, 100 operations, 10 teams
→ Consider microservices
```

#### Edge Case 2: Conflicting Requirements (The Impossible Trade-off)

**Scenario:** Stakeholders demand mutually exclusive characteristics.

```
Stakeholder demands:
1. "Must be real-time (< 1ms latency)"
2. "Must log every operation for audit"
3. "Must validate every input against database"
4. "Must encrypt all data"
5. "Must run on a $5 microcontroller"

Problem: These requirements are PHYSICALLY IMPOSSIBLE together!
- Database lookup alone takes > 1ms
- Encryption adds latency
- Logging adds latency
- $5 microcontroller can't do all this in 1ms
```

**How to Handle:**

```cpp
// Educate stakeholders with prototype

void demonstrateTradeoffs() {
    std::cout << "Performance test:\n\n";

    // Test 1: Just computation (no logging, validation)
    auto start = now();
    double result = compute(input);
    auto latency1 = now() - start;
    std::cout << "No logging/validation: " << latency1 << "us\n";

    // Test 2: With logging
    start = now();
    log("Computing...");  // File I/O
    result = compute(input);
    log("Done");
    auto latency2 = now() - start;
    std::cout << "With logging: " << latency2 << "us\n";

    // Test 3: With database validation
    start = now();
    if (!database.validate(input)) return;  // Network call
    result = compute(input);
    auto latency3 = now() - start;
    std::cout << "With DB validation: " << latency3 << "us\n";

    // Test 4: Everything
    start = now();
    log("Starting");
    if (!database.validate(input)) return;
    result = encrypt(compute(input));
    log("Done");
    auto latency4 = now() - start;
    std::cout << "With everything: " << latency4 << "us\n";

    std::cout << "\nConclusion: Can't have < 1ms with all features!\n";
    std::cout << "Choose your priority:\n";
    std::cout << "  A) Real-time (< 1ms) but no logging/validation\n";
    std::cout << "  B) Full logging/validation but slower (10-50ms)\n";
}
```

**Resolution Strategies:**
1. **Prototype and show data** (numbers don't lie)
2. **Force prioritization** ("If you could only have 3 out of 5, which 3?")
3. **Propose alternatives** ("Can we log asynchronously? Validate in batch?")
4. **Escalate impossible** ("Need bigger budget or reduce requirements")

#### Edge Case 3: Legacy System Integration

**Scenario:** Must integrate with a 20-year-old system that has terrible design.

```cpp
// ❌ LEGACY SYSTEM: Global state, no thread safety, cryptic API

// Old system (can't modify)
extern int g_state;  // Global state
extern char g_buffer[256];  // Global buffer (not thread-safe!)

void legacy_init();  // Must call first, no docs on what it does
int legacy_process(char* input, char* output);  // Returns 0 or 1 or -1 (unclear)
void legacy_cleanup();  // Sometimes crashes, no one knows why

// ✅ SOLUTION: Adapter/Wrapper pattern (isolate the ugliness)

class LegacySystemAdapter {
    std::mutex mtx;  // Protect global state
    bool initialized = false;

public:
    LegacySystemAdapter() {
        legacy_init();
        initialized = true;
    }

    ~LegacySystemAdapter() {
        try {
            legacy_cleanup();  // Catch potential crash
        } catch (...) {
            std::cerr << "Legacy cleanup failed (as usual)\n";
        }
    }

    // Clean, modern interface
    std::optional<std::string> process(const std::string& input) {
        std::lock_guard lock(mtx);  // Thread-safe

        if (!initialized) {
            return std::nullopt;
        }

        if (input.size() > 255) {
            return std::nullopt;  // Validate before legacy call
        }

        // Copy to legacy buffer (ugh)
        strcpy(g_buffer, input.c_str());

        int result = legacy_process(g_buffer, g_buffer);

        // Decode cryptic return values
        if (result == 1) {
            return std::string(g_buffer);  // Success
        } else {
            return std::nullopt;  // Failure (0 or -1)
        }
    }
};

// Now rest of code uses clean adapter interface
LegacySystemAdapter adapter;
auto result = adapter.process("input");
if (result) {
    std::cout << "Output: " << *result << "\n";
} else {
    std::cout << "Processing failed\n";
}
```

**Key Principles:**
- **Isolate ugliness** in adapter layer
- **Translate** legacy API to modern, safe interface
- **Protect** with thread safety, validation
- **Document** undocumented behavior
- **Test extensively** (legacy code often has hidden bugs)

#### Edge Case 4: Performance vs. Maintainability Dilemma

**Scenario:** Performance-critical code that needs to be maintainable.

```cpp
// Scenario: Real-time sensor processing (< 1ms per frame)

// ❌ OPTION 1: Clean but slow
class SensorProcessor {
public:
    std::vector<Object> process(const std::vector<SensorData>& data) {
        std::vector<Object> objects;

        // Clean, readable, but allocates memory every frame
        for (const auto& sample : data) {
            if (isValid(sample)) {
                Object obj = detectObject(sample);  // Creates object
                if (obj.confidence > 0.8) {
                    objects.push_back(obj);  // Vector grows dynamically
                }
            }
        }

        return objects;  // Copy return (expensive!)
    }
};
// Latency: 5ms (too slow! 5x over budget)

// ❌ OPTION 2: Fast but unmaintainable
Object g_objects[1000];  // Global! Ugh!
int g_count = 0;

void processUgly(SensorData* data, int n) {
    g_count = 0;
    for (int i = 0; i < n; ++i) {
        if (data[i].valid) {
            float conf = /* 20 lines of inlined math */;
            if (conf > 0.8f) {
                g_objects[g_count].x = /* complex calculation */;
                g_objects[g_count].y = /* complex calculation */;
                // ... 50 lines of dense code ...
                g_count++;
            }
        }
    }
}
// Latency: 0.5ms (fast!)
// Maintainability: Horrible!

// ✅ OPTION 3: Fast AND maintainable (best of both)
class SensorProcessor {
    // Pre-allocated buffers (no runtime allocation)
    std::array<Object, 1000> objectBuffer;
    size_t objectCount = 0;

public:
    // Return view, not copy
    std::span<const Object> process(std::span<const SensorData> data) {
        objectCount = 0;

        for (const auto& sample : data) {
            if (!isValid(sample)) continue;

            Object obj = detectObject(sample);

            if (obj.confidence > 0.8f && objectCount < objectBuffer.size()) {
                objectBuffer[objectCount++] = std::move(obj);
            }
        }

        // Return non-owning view (zero-cost)
        return std::span{objectBuffer.data(), objectCount};
    }

private:
    // Separate, testable functions
    bool isValid(const SensorData& data) const {
        return data.timestamp > 0 && data.quality > 0.5f;
    }

    Object detectObject(const SensorData& data) const {
        // Complex logic in separate function (easier to test)
        Object obj;
        obj.x = data.x * calibration.scaleX;
        obj.y = data.y * calibration.scaleY;
        obj.confidence = computeConfidence(data);
        return obj;
    }
};
// Latency: 0.8ms (fast enough!)
// Maintainability: Good!
```

**The Middle Ground Strategy:**
1. **Pre-allocate** (avoid runtime allocation)
2. **Use modern C++** (std::span, std::array) not raw pointers
3. **Separate concerns** (functions for logic, buffer for performance)
4. **Measure first** (don't optimize prematurely)
5. **Profile** (find real bottlenecks)
6. **Document** why performance tricks used

#### Edge Case 5: When to Break Your Own Architecture

**Scenario:** Architecture rules conflict with urgent real-world need.

```cpp
// Architecture Rule: "All sensor data goes through event bus"

// Normal flow:
Sensor → Event Bus → Perception → Event Bus → Planning → ...

// Problem: Emergency obstacle detection needs < 5ms, event bus adds 3ms

// ❌ BAD SOLUTION: Ignore the problem, miss emergency obstacle
// ❌ BAD SOLUTION: Bypass architecture randomly, create chaos

// ✅ GOOD SOLUTION: Controlled bypass with clear documentation

class EmergencyObstacleDetector {
    IEventBus* eventBus;
    IPlanner* planner;  // Direct reference (breaks normal architecture)

public:
    EmergencyObstacleDetector(IEventBus* bus, IPlanner* plan)
        : eventBus(bus), planner(plan) {}

    void processLidarData(const LidarData& data) {
        // Normal path: publish to event bus
        eventBus->publish(Event{EventType::Lidar, data});

        // EMERGENCY PATH: Direct call to planner (bypasses architecture)
        if (detectImmediateCollision(data)) {
            // Document WHY we break architecture
            // SAFETY: Direct call for < 5ms latency
            // Bypasses event bus to meet real-time constraint
            planner->emergencyStop();

            // Still publish event for logging/monitoring
            eventBus->publish(Event{EventType::EmergencyStop, {}});
        }
    }

private:
    bool detectImmediateCollision(const LidarData& data) {
        // Fast collision check
        return data.minDistance < EMERGENCY_THRESHOLD;
    }
};
```

**When It's OK to Break Architecture:**
- ✅ Safety critical (lives at stake)
- ✅ Performance impossible to meet otherwise
- ✅ Temporary workaround (will refactor later)
- ✅ Clearly documented WHY
- ✅ Isolated (doesn't spread)

**When It's NOT OK:**
- ❌ "Faster to hack it" (laziness)
- ❌ Deadline pressure (poor planning)
- ❌ Don't understand architecture (learn it)
- ❌ No documentation (future pain)

**The Documentation Template:**
```cpp
// ARCHITECTURE DEVIATION: Direct call bypasses event bus
// WHY: Emergency detection requires < 5ms latency
// MEASUREMENT: Event bus adds 3ms, direct call adds 0.5ms
// ALTERNATIVE CONSIDERED: Faster event bus (still 2ms, not enough)
// APPROVED BY: Tech lead (date: 2024-03-15)
// TODO: Revisit if event bus optimized to < 1ms
```

#### Edge Case 6: Over-Abstraction (Too Many Layers)

**Scenario:** Too many abstraction layers make simple tasks complex.

```cpp
// ❌ OVER-ABSTRACTED: 7 layers to read a file!

class IDataSource { virtual std::string read() = 0; };
class IDataProvider { virtual IDataSource* getSource() = 0; };
class IProviderFactory { virtual IDataProvider* create() = 0; };
class IFactoryManager { virtual IProviderFactory* getFactory() = 0; };
class IManagerRegistry { virtual IFactoryManager* getManager() = 0; };
class IRegistryLocator { virtual IManagerRegistry* locate() = 0; };
class ServiceContainer { IRegistryLocator* locator; };

// To read a file, you need:
auto locator = container.getLocator();
auto registry = locator->locate();
auto manager = registry->getManager();
auto factory = manager->getFactory();
auto provider = factory->create();
auto source = provider->getSource();
std::string data = source->read();  // Finally!

// ✅ APPROPRIATE: 2 layers (interface + implementation)

class IDataSource {
public:
    virtual ~IDataSource() = default;
    virtual std::string read() = 0;
};

class FileDataSource : public IDataSource {
    std::string filename;
public:
    FileDataSource(const std::string& file) : filename(file) {}

    std::string read() override {
        std::ifstream file(filename);
        return std::string(std::istreambuf_iterator<char>(file),
                          std::istreambuf_iterator<char>());
    }
};

// Usage:
std::unique_ptr<IDataSource> source = std::make_unique<FileDataSource>("data.txt");
std::string data = source->read();  // Done!
```

**The "Maximum 3 Layers" Rule:**

For most applications:
```
Layer 1: Interface/Abstract base class
Layer 2: Implementation
Layer 3: (Optional) Adapter/Decorator

If you need Layer 4+, you're probably over-engineering.
```

**How to Recognize Over-Abstraction:**
- 🚨 "To do X, I need to call 5+ classes"
- 🚨 "I have interfaces with only 1 implementation"
- 🚨 "I have factory factories" (factory for factories)
- 🚨 "My class names are Manager/Handler/Provider/Factory all at once"
- 🚨 "New team members are confused for weeks"

**The Simplification Test:**
```
Ask: "Can I delete this layer and just call the next one?"
If YES → Delete it!
If NO and you can clearly explain WHY → Keep it.
```

---

### CODE_EXAMPLES: From Simple to Complex Architecture

#### Example 1: Easy - Single Responsibility (No Architecture Needed)

**Scenario:** Temperature converter (simple utility)

```cpp
#include <iostream>
#include <iomanip>

// No "architecture" needed - just a simple class with functions

class TemperatureConverter {
public:
    static double celsiusToFahrenheit(double celsius) {
        return (celsius * 9.0 / 5.0) + 32.0;
    }

    static double fahrenheitToCelsius(double fahrenheit) {
        return (fahrenheit - 32.0) * 5.0 / 9.0;
    }

    static double celsiusToKelvin(double celsius) {
        return celsius + 273.15;
    }

    static double kelvinToCelsius(double kelvin) {
        return kelvin - 273.15;
    }
};

int main() {
    std::cout << std::fixed << std::setprecision(2);

    double tempC = 25.0;
    std::cout << tempC << "°C = "
              << TemperatureConverter::celsiusToFahrenheit(tempC) << "°F\n";

    double tempF = 77.0;
    std::cout << tempF << "°F = "
              << TemperatureConverter::fahrenheitToCelsius(tempF) << "°C\n";

    return 0;
}

/*
Output:
25.00°C = 77.00°F
77.00°F = 25.00°C

Lessons:
- Simple problems don't need complex architecture
- Static functions are fine for utilities
- Don't over-engineer!
*/
```

#### Example 2: Mid - Layered Architecture (Separation of Concerns)

**Scenario:** Student grade management system

```cpp
#include <iostream>
#include <vector>
#include <map>
#include <string>
#include <memory>

// ═══════════════════════════════════════════════════════════════
// LAYER 1: Data Layer (How we store data)
// ═══════════════════════════════════════════════════════════════

struct Student {
    int id;
    std::string name;
    std::map<std::string, double> grades;  // subject -> grade
};

class IStudentRepository {
public:
    virtual ~IStudentRepository() = default;
    virtual void addStudent(const Student& student) = 0;
    virtual Student* findById(int id) = 0;
    virtual std::vector<Student> getAllStudents() = 0;
};

class InMemoryStudentRepository : public IStudentRepository {
    std::map<int, Student> students;

public:
    void addStudent(const Student& student) override {
        students[student.id] = student;
    }

    Student* findById(int id) override {
        auto it = students.find(id);
        return (it != students.end()) ? &it->second : nullptr;
    }

    std::vector<Student> getAllStudents() override {
        std::vector<Student> result;
        for (const auto& [id, student] : students) {
            result.push_back(student);
        }
        return result;
    }
};

// ═══════════════════════════════════════════════════════════════
// LAYER 2: Business Logic Layer (What we can do with data)
// ═══════════════════════════════════════════════════════════════

class GradeService {
    IStudentRepository* repository;

public:
    GradeService(IStudentRepository* repo) : repository(repo) {}

    void addGrade(int studentId, const std::string& subject, double grade) {
        Student* student = repository->findById(studentId);
        if (!student) {
            throw std::runtime_error("Student not found");
        }

        if (grade < 0 || grade > 100) {
            throw std::invalid_argument("Grade must be 0-100");
        }

        student->grades[subject] = grade;
    }

    double calculateAverage(int studentId) {
        Student* student = repository->findById(studentId);
        if (!student || student->grades.empty()) {
            return 0.0;
        }

        double sum = 0.0;
        for (const auto& [subject, grade] : student->grades) {
            sum += grade;
        }
        return sum / student->grades.size();
    }

    std::string getLetterGrade(double average) {
        if (average >= 90) return "A";
        if (average >= 80) return "B";
        if (average >= 70) return "C";
        if (average >= 60) return "D";
        return "F";
    }
};

// ═══════════════════════════════════════════════════════════════
// LAYER 3: Presentation Layer (How we show data to user)
// ═══════════════════════════════════════════════════════════════

class ConsoleUI {
    GradeService* service;
    IStudentRepository* repository;

public:
    ConsoleUI(GradeService* svc, IStudentRepository* repo)
        : service(svc), repository(repo) {}

    void displayStudentReport(int studentId) {
        Student* student = repository->findById(studentId);
        if (!student) {
            std::cout << "Student not found!\n";
            return;
        }

        std::cout << "═══════════════════════════════════════\n";
        std::cout << "Student Report: " << student->name << "\n";
        std::cout << "═══════════════════════════════════════\n";

        for (const auto& [subject, grade] : student->grades) {
            std::cout << "  " << subject << ": " << grade << "\n";
        }

        double avg = service->calculateAverage(studentId);
        std::string letter = service->getLetterGrade(avg);

        std::cout << "───────────────────────────────────────\n";
        std::cout << "  Average: " << avg << " (" << letter << ")\n";
        std::cout << "═══════════════════════════════════════\n";
    }

    void displayAllStudents() {
        auto students = repository->getAllStudents();

        std::cout << "\nAll Students:\n";
        std::cout << "═══════════════════════════════════════\n";

        for (const auto& student : students) {
            double avg = service->calculateAverage(student.id);
            std::string letter = service->getLetterGrade(avg);

            std::cout << "  [" << student.id << "] "
                      << student.name << " - Average: "
                      << avg << " (" << letter << ")\n";
        }
    }
};

// ═══════════════════════════════════════════════════════════════
// MAIN: Wire everything together
// ═══════════════════════════════════════════════════════════════

int main() {
    // Create layers
    InMemoryStudentRepository repository;
    GradeService service(&repository);
    ConsoleUI ui(&service, &repository);

    // Add students
    repository.addStudent({1, "Alice", {}});
    repository.addStudent({2, "Bob", {}});

    // Add grades
    service.addGrade(1, "Math", 95);
    service.addGrade(1, "English", 88);
    service.addGrade(1, "Science", 92);

    service.addGrade(2, "Math", 78);
    service.addGrade(2, "English", 85);
    service.addGrade(2, "Science", 72);

    // Display
    ui.displayStudentReport(1);
    ui.displayStudentReport(2);
    ui.displayAllStudents();

    return 0;
}

/*
Output:
═══════════════════════════════════════
Student Report: Alice
═══════════════════════════════════════
  English: 88
  Math: 95
  Science: 92
───────────────────────────────────────
  Average: 91.6667 (A)
═══════════════════════════════════════
[Similar for Bob...]

Architecture Benefits:
✅ Data Layer: Easy to swap (file storage, database)
✅ Business Logic: Independent of UI and storage
✅ Presentation: Can add web UI without changing logic
✅ Testable: Each layer can be tested independently
*/
```

#### Example 3: Mid - Event-Driven Architecture (Decoupling)

**Scenario:** Home automation system (sensors trigger actions)

```cpp
#include <iostream>
#include <vector>
#include <functional>
#include <map>
#include <string>
#include <memory>

// ═══════════════════════════════════════════════════════════════
// EVENT SYSTEM (Core of event-driven architecture)
// ═══════════════════════════════════════════════════════════════

enum class EventType {
    MotionDetected,
    DoorOpened,
    DoorClosed,
    TemperatureChanged,
    LightToggled
};

struct Event {
    EventType type;
    std::string source;  // Which device
    double value;        // Optional value (temp, light level, etc.)

    Event(EventType t, const std::string& src, double val = 0.0)
        : type(t), source(src), value(val) {}
};

using EventHandler = std::function<void(const Event&)>;

class EventBus {
    std::map<EventType, std::vector<EventHandler>> subscribers;

public:
    void subscribe(EventType type, EventHandler handler) {
        subscribers[type].push_back(handler);
    }

    void publish(const Event& event) {
        std::cout << "[EVENT] " << eventTypeToString(event.type)
                  << " from " << event.source << "\n";

        auto it = subscribers.find(event.type);
        if (it != subscribers.end()) {
            for (const auto& handler : it->second) {
                handler(event);
            }
        }
    }

private:
    std::string eventTypeToString(EventType type) {
        switch (type) {
            case EventType::MotionDetected: return "MotionDetected";
            case EventType::DoorOpened: return "DoorOpened";
            case EventType::DoorClosed: return "DoorClosed";
            case EventType::TemperatureChanged: return "TemperatureChanged";
            case EventType::LightToggled: return "LightToggled";
            default: return "Unknown";
        }
    }
};

// ═══════════════════════════════════════════════════════════════
// DEVICES (Event producers and consumers)
// ═══════════════════════════════════════════════════════════════

class MotionSensor {
    EventBus* bus;
    std::string name;

public:
    MotionSensor(EventBus* eventBus, const std::string& sensorName)
        : bus(eventBus), name(sensorName) {}

    void detectMotion() {
        std::cout << "[" << name << "] Motion detected!\n";
        bus->publish(Event{EventType::MotionDetected, name});
    }
};

class DoorSensor {
    EventBus* bus;
    std::string name;
    bool isOpen = false;

public:
    DoorSensor(EventBus* eventBus, const std::string& sensorName)
        : bus(eventBus), name(sensorName) {}

    void open() {
        if (!isOpen) {
            isOpen = true;
            std::cout << "[" << name << "] Door opened\n";
            bus->publish(Event{EventType::DoorOpened, name});
        }
    }

    void close() {
        if (isOpen) {
            isOpen = false;
            std::cout << "[" << name << "] Door closed\n";
            bus->publish(Event{EventType::DoorClosed, name});
        }
    }
};

class Light {
    std::string name;
    bool isOn = false;

public:
    Light(const std::string& lightName) : name(lightName) {}

    void turnOn() {
        if (!isOn) {
            isOn = true;
            std::cout << "  → [" << name << "] Light turned ON 💡\n";
        }
    }

    void turnOff() {
        if (isOn) {
            isOn = false;
            std::cout << "  → [" << name << "] Light turned OFF\n";
        }
    }
};

class Alarm {
    std::string name;
    bool isActive = false;

public:
    Alarm(const std::string& alarmName) : name(alarmName) {}

    void activate() {
        isActive = true;
        std::cout << "  → [" << name << "] 🚨 ALARM ACTIVATED! 🚨\n";
    }

    void deactivate() {
        isActive = false;
        std::cout << "  → [" << name << "] Alarm deactivated\n";
    }
};

// ═══════════════════════════════════════════════════════════════
// AUTOMATION RULES (Event handlers)
// ═══════════════════════════════════════════════════════════════

class HomeAutomation {
    Light livingRoomLight;
    Light hallwayLight;
    Alarm securityAlarm;
    bool homeOccupied = false;

public:
    HomeAutomation(EventBus* bus)
        : livingRoomLight("Living Room")
        , hallwayLight("Hallway")
        , securityAlarm("Security System") {

        // Subscribe to events

        // Rule 1: Motion detected → Turn on nearby light
        bus->subscribe(EventType::MotionDetected, [this](const Event& e) {
            std::cout << "  [Rule] Motion detected, turning on lights\n";
            if (e.source == "Living Room Sensor") {
                livingRoomLight.turnOn();
            } else if (e.source == "Hallway Sensor") {
                hallwayLight.turnOn();
            }
        });

        // Rule 2: Door opened → Turn on hallway light + deactivate alarm
        bus->subscribe(EventType::DoorOpened, [this](const Event& e) {
            std::cout << "  [Rule] Door opened, welcome home!\n";
            hallwayLight.turnOn();
            securityAlarm.deactivate();
            homeOccupied = true;
        });

        // Rule 3: Door closed → Activate alarm if leaving
        bus->subscribe(EventType::DoorClosed, [this](const Event& e) {
            if (homeOccupied) {
                std::cout << "  [Rule] Door closed while home, just a door close\n";
            } else {
                std::cout << "  [Rule] Door closed, activating security\n";
                securityAlarm.activate();
            }
        });

        // Rule 4: Motion when alarm active → Trigger alarm
        bus->subscribe(EventType::MotionDetected, [this](const Event& e) {
            if (!homeOccupied) {
                std::cout << "  [Rule] Motion while away - INTRUDER!\n";
                securityAlarm.activate();
            }
        });
    }
};

// ═══════════════════════════════════════════════════════════════
// MAIN: Simulate home automation
// ═══════════════════════════════════════════════════════════════

int main() {
    std::cout << "Home Automation System (Event-Driven Architecture)\n";
    std::cout << "══════════════════════════════════════════════════════\n\n";

    // Create event bus (central communication)
    EventBus eventBus;

    // Create automation rules
    HomeAutomation automation(&eventBus);

    // Create sensors
    MotionSensor livingRoomSensor(&eventBus, "Living Room Sensor");
    MotionSensor hallwaySensor(&eventBus, "Hallway Sensor");
    DoorSensor frontDoor(&eventBus, "Front Door");

    // Scenario 1: Arriving home
    std::cout << "═══ Scenario 1: Arriving Home ═══\n";
    frontDoor.open();
    hallwaySensor.detectMotion();
    livingRoomSensor.detectMotion();
    std::cout << "\n";

    // Scenario 2: Leaving home
    std::cout << "═══ Scenario 2: Leaving Home ═══\n";
    frontDoor.open();
    frontDoor.close();
    std::cout << "\n";

    // Scenario 3: Intruder!
    std::cout << "═══ Scenario 3: Motion While Away (Intruder!) ═══\n";
    livingRoomSensor.detectMotion();
    std::cout << "\n";

    return 0;
}

/*
Output:
Home Automation System (Event-Driven Architecture)
══════════════════════════════════════════════════════

═══ Scenario 1: Arriving Home ═══
[Front Door] Door opened
[EVENT] DoorOpened from Front Door
  [Rule] Door opened, welcome home!
  → [Hallway] Light turned ON 💡
  → [Security System] Alarm deactivated
[Hallway Sensor] Motion detected!
[EVENT] MotionDetected from Hallway Sensor
  [Rule] Motion detected, turning on lights
[Living Room Sensor] Motion detected!
[EVENT] MotionDetected from Living Room Sensor
  [Rule] Motion detected, turning on lights
  → [Living Room] Light turned ON 💡

[Similar for other scenarios...]

Architecture Benefits:
✅ Decoupled: Sensors don't know about lights/alarms
✅ Flexible: Easy to add new rules without changing sensors
✅ Scalable: Can add 100 sensors without complexity
✅ Testable: Can test rules by publishing events
✅ Asynchronous: Can process events in any order
*/
```

#### Example 4: Advanced - Component-Based Architecture (ECS Pattern)

**Scenario:** Simple 2D game with Entity-Component-System

```cpp
#include <iostream>
#include <vector>
#include <memory>
#include <unordered_map>
#include <string>
#include <cmath>

// ═══════════════════════════════════════════════════════════════
// COMPONENTS (Pure data, no logic)
// ═══════════════════════════════════════════════════════════════

struct Position {
    double x, y;
};

struct Velocity {
    double dx, dy;
};

struct Health {
    int current, max;
};

struct Renderable {
    std::string sprite;
    int zOrder;  // Draw order
};

// ═══════════════════════════════════════════════════════════════
// ENTITY (Just an ID + components)
// ═══════════════════════════════════════════════════════════════

using EntityID = int;

class Entity {
    static EntityID nextID;
    EntityID id;

public:
    Entity() : id(nextID++) {}
    EntityID getID() const { return id; }
};

EntityID Entity::nextID = 0;

// ═══════════════════════════════════════════════════════════════
// COMPONENT MANAGER (Store components separately)
// ═══════════════════════════════════════════════════════════════

template<typename T>
class ComponentManager {
    std::unordered_map<EntityID, T> components;

public:
    void add(EntityID entity, const T& component) {
        components[entity] = component;
    }

    T* get(EntityID entity) {
        auto it = components.find(entity);
        return (it != components.end()) ? &it->second : nullptr;
    }

    bool has(EntityID entity) {
        return components.find(entity) != components.end();
    }

    void remove(EntityID entity) {
        components.erase(entity);
    }

    std::unordered_map<EntityID, T>& getAll() {
        return components;
    }
};

// ═══════════════════════════════════════════════════════════════
// SYSTEMS (Logic that operates on components)
// ═══════════════════════════════════════════════════════════════

class MovementSystem {
    ComponentManager<Position>* positions;
    ComponentManager<Velocity>* velocities;

public:
    MovementSystem(ComponentManager<Position>* pos,
                   ComponentManager<Velocity>* vel)
        : positions(pos), velocities(vel) {}

    void update(double deltaTime) {
        // Process all entities that have BOTH position AND velocity
        for (auto& [entityID, velocity] : velocities->getAll()) {
            Position* pos = positions->get(entityID);
            if (pos) {
                pos->x += velocity.dx * deltaTime;
                pos->y += velocity.dy * deltaTime;
            }
        }
    }
};

class RenderSystem {
    ComponentManager<Position>* positions;
    ComponentManager<Renderable>* renderables;

public:
    RenderSystem(ComponentManager<Position>* pos,
                 ComponentManager<Renderable>* rend)
        : positions(pos), renderables(rend) {}

    void draw() {
        std::cout << "\n═══ Frame Render ═══\n";

        // Draw all entities that have BOTH position AND renderable
        for (auto& [entityID, renderable] : renderables->getAll()) {
            Position* pos = positions->get(entityID);
            if (pos) {
                std::cout << "[" << renderable.sprite << "] at ("
                          << pos->x << ", " << pos->y << ")\n";
            }
        }
    }
};

class HealthSystem {
    ComponentManager<Health>* healths;

public:
    HealthSystem(ComponentManager<Health>* hp) : healths(hp) {}

    void takeDamage(EntityID entity, int damage) {
        Health* health = healths->get(entity);
        if (health) {
            health->current -= damage;
            if (health->current < 0) health->current = 0;

            std::cout << "[Entity " << entity << "] took " << damage
                      << " damage! HP: " << health->current << "/"
                      << health->max;

            if (health->current == 0) {
                std::cout << " (DEAD)";
            }
            std::cout << "\n";
        }
    }

    void heal(EntityID entity, int amount) {
        Health* health = healths->get(entity);
        if (health) {
            health->current += amount;
            if (health->current > health->max) {
                health->current = health->max;
            }

            std::cout << "[Entity " << entity << "] healed " << amount
                      << "! HP: " << health->current << "/" << health->max << "\n";
        }
    }
};

// ═══════════════════════════════════════════════════════════════
// MAIN: Create game entities
// ═══════════════════════════════════════════════════════════════

int main() {
    std::cout << "Component-Based Architecture (ECS Pattern)\n";
    std::cout << "══════════════════════════════════════════════════════\n\n";

    // Create component managers
    ComponentManager<Position> positions;
    ComponentManager<Velocity> velocities;
    ComponentManager<Health> healths;
    ComponentManager<Renderable> renderables;

    // Create systems
    MovementSystem movementSystem(&positions, &velocities);
    RenderSystem renderSystem(&positions, &renderables);
    HealthSystem healthSystem(&healths);

    // Create entities
    Entity player;
    Entity enemy;
    Entity tree;  // Static decoration

    std::cout << "Creating entities...\n";
    std::cout << "  Player ID: " << player.getID() << "\n";
    std::cout << "  Enemy ID: " << enemy.getID() << "\n";
    std::cout << "  Tree ID: " << tree.getID() << "\n\n";

    // Add components to player (movable, damageable, renderable)
    positions.add(player.getID(), {0.0, 0.0});
    velocities.add(player.getID(), {10.0, 5.0});
    healths.add(player.getID(), {100, 100});
    renderables.add(player.getID(), {"🧙 Player", 10});

    // Add components to enemy (movable, damageable, renderable)
    positions.add(enemy.getID(), {50.0, 50.0});
    velocities.add(enemy.getID(), {-5.0, 3.0});
    healths.add(enemy.getID(), {50, 50});
    renderables.add(enemy.getID(), {"👹 Enemy", 10});

    // Add components to tree (only position + renderable, NOT movable)
    positions.add(tree.getID(), {100.0, 100.0});
    renderables.add(tree.getID(), {"🌳 Tree", 5});
    // Note: No velocity → tree won't move!

    // Game loop simulation
    for (int frame = 0; frame < 3; ++frame) {
        std::cout << "\n══════════ Frame " << frame << " ══════════\n";

        // Update systems
        movementSystem.update(0.1);  // deltaTime = 0.1 seconds

        // Render
        renderSystem.draw();
    }

    // Combat simulation
    std::cout << "\n══════════ Combat ══════════\n";
    healthSystem.takeDamage(enemy.getID(), 30);
    healthSystem.takeDamage(player.getID(), 20);
    healthSystem.heal(player.getID(), 15);
    healthSystem.takeDamage(enemy.getID(), 25);  // Kill enemy

    return 0;
}

/*
Output:
Component-Based Architecture (ECS Pattern)
══════════════════════════════════════════════════════════

Creating entities...
  Player ID: 0
  Enemy ID: 1
  Tree ID: 2

══════════ Frame 0 ══════════
═══ Frame Render ═══
[🧙 Player] at (0, 0)
[👹 Enemy] at (50, 50)
[🌳 Tree] at (100, 100)

══════════ Frame 1 ══════════
═══ Frame Render ═══
[🧙 Player] at (1, 0.5)
[👹 Enemy] at (49.5, 50.3)
[🌳 Tree] at (100, 100)  ← DOESN'T MOVE (no velocity)

[Similar for Frame 2...]

══════════ Combat ══════════
[Entity 1] took 30 damage! HP: 20/50
[Entity 0] took 20 damage! HP: 80/100
[Entity 0] healed 15! HP: 95/100
[Entity 1] took 25 damage! HP: 0/50 (DEAD)

Architecture Benefits:
✅ Data-oriented: Components stored contiguously (cache-friendly)
✅ Flexible composition: Easy to create new entity types
✅ Reusable systems: Same system works on all entities
✅ Performance: Systems process components in tight loops
✅ Easy to add features: New component + system, no changes to entities
*/
```

#### Example 5: Real-World - Autonomous Vehicle (Layered + Event-Driven)
**Scenario:** Simplified autonomous vehicle showing combined architecture patterns

```cpp
#include <iostream>
#include <vector>
#include <functional>
#include <map>
#include <memory>
#include <string>

// ═══════════════════════════════════════════════════════════════
// DATA TYPES
// ═══════════════════════════════════════════════════════════════

enum class EventType { SensorData, Obstacle, PathPlanned, SpeedCommand };

struct Event {
    EventType type;
    std::string data;
};

using EventHandler = std::function<void(const Event&)>;

struct Obstacle {
    double distance;
    double angle;
};

struct Path {
    std::vector<std::pair<double, double>> waypoints;
};

// ═══════════════════════════════════════════════════════════════
// LAYER 0: EVENT BUS (Communication backbone)
// ═══════════════════════════════════════════════════════════════

class EventBus {
    std::map<EventType, std::vector<EventHandler>> handlers;
public:
    void subscribe(EventType type, EventHandler handler) {
        handlers[type].push_back(handler);
    }
    
    void publish(const Event& event) {
        auto it = handlers.find(event.type);
        if (it != handlers.end()) {
            for (auto& handler : it->second) {
                handler(event);
            }
        }
    }
};

// ═══════════════════════════════════════════════════════════════
// LAYER 1: SENSORS (Hardware abstraction)
// ═══════════════════════════════════════════════════════════════

class ISensor {
public:
    virtual ~ISensor() = default;
    virtual void read() = 0;
};

class LidarSensor : public ISensor {
    EventBus* bus;
public:
    LidarSensor(EventBus* b) : bus(b) {}
    
    void read() override {
        // Simulate lidar reading
        double distance = 15.5;  // meters
        std::cout << "[LIDAR] Detected obstacle at " << distance << "m\n";
        
        if (distance < 20.0) {
            bus->publish({EventType::Obstacle, std::to_string(distance)});
        }
        
        bus->publish({EventType::SensorData, "lidar:" + std::to_string(distance)});
    }
};

class CameraSensor : public ISensor {
    EventBus* bus;
public:
    CameraSensor(EventBus* b) : bus(b) {}
    
    void read() override {
        std::cout << "[CAMERA] Processing image...\n";
        bus->publish({EventType::SensorData, "camera:image_data"});
    }
};

// ═══════════════════════════════════════════════════════════════
// LAYER 2: PERCEPTION (Sensor fusion & understanding)
// ═══════════════════════════════════════════════════════════════

class PerceptionModule {
    EventBus* bus;
    std::vector<Obstacle> obstacles;
    
public:
    PerceptionModule(EventBus* b) : bus(b) {
        // Subscribe to sensor data
        bus->subscribe(EventType::Obstacle, [this](const Event& e) {
            double distance = std::stod(e.data);
            obstacles.push_back({distance, 0.0});
            std::cout << "  [PERCEPTION] Obstacle registered: " << distance << "m\n";
        });
    }
    
    std::vector<Obstacle> getObstacles() const {
        return obstacles;
    }
};

// ═══════════════════════════════════════════════════════════════
// LAYER 3: PLANNING (Path planning & decision making)
// ═══════════════════════════════════════════════════════════════

class PlanningModule {
    EventBus* bus;
    PerceptionModule* perception;
    
public:
    PlanningModule(EventBus* b, PerceptionModule* p) : bus(b), perception(p) {}
    
    void planPath() {
        auto obstacles = perception->getObstacles();
        
        std::cout << "[PLANNING] Planning path around " << obstacles.size() 
                  << " obstacles\n";
        
        // Simple logic: if obstacle close, plan evasive path
        if (!obstacles.empty() && obstacles[0].distance < 20.0) {
            std::cout << "  [PLANNING] Obstacle too close! Planning evasive maneuver\n";
            bus->publish({EventType::PathPlanned, "evasive_path"});
            bus->publish({EventType::SpeedCommand, "slow_down"});
        } else {
            bus->publish({EventType::PathPlanned, "straight_path"});
            bus->publish({EventType::SpeedCommand, "maintain_speed"});
        }
    }
};

// ═══════════════════════════════════════════════════════════════
// LAYER 4: CONTROL (Execute planned actions)
// ═══════════════════════════════════════════════════════════════

class ControlModule {
    EventBus* bus;
    double currentSpeed = 50.0;  // km/h
    
public:
    ControlModule(EventBus* b) : bus(b) {
        // Subscribe to commands
        bus->subscribe(EventType::PathPlanned, [](const Event& e) {
            std::cout << "  [CONTROL] Executing path: " << e.data << "\n";
        });
        
        bus->subscribe(EventType::SpeedCommand, [this](const Event& e) {
            if (e.data == "slow_down") {
                currentSpeed = 30.0;
                std::cout << "  [CONTROL] Slowing down to " << currentSpeed << " km/h\n";
            } else {
                currentSpeed = 50.0;
                std::cout << "  [CONTROL] Maintaining speed at " << currentSpeed << " km/h\n";
            }
        });
    }
};

// ═══════════════════════════════════════════════════════════════
// MAIN: Autonomous Vehicle System
// ═══════════════════════════════════════════════════════════════

int main() {
    std::cout << "Autonomous Vehicle Architecture\n";
    std::cout << "(Layered + Event-Driven)\n";
    std::cout << "══════════════════════════════════════════════════════\n\n";
    
    // Create event bus (communication backbone)
    EventBus eventBus;
    
    // Create layers (bottom-up)
    LidarSensor lidar(&eventBus);
    CameraSensor camera(&eventBus);
    
    PerceptionModule perception(&eventBus);
    PlanningModule planning(&eventBus, &perception);
    ControlModule control(&eventBus);
    
    // Simulate driving cycle
    std::cout << "═══ Cycle 1: Normal Driving ═══\n";
    camera.read();
    // No obstacles, continue normally
    planning.planPath();
    
    std::cout << "\n═══ Cycle 2: Obstacle Detected! ═══\n";
    lidar.read();  // Detects obstacle
    camera.read();
    planning.planPath();  // Reacts to obstacle
    
    std::cout << "\n══════════════════════════════════════════════════════\n";
    std::cout << "Architecture Benefits:\n";
    std::cout << "✅ Layered: Clear separation (sensors → perception → planning → control)\n";
    std::cout << "✅ Event-Driven: Decoupled communication via event bus\n";
    std::cout << "✅ Testable: Can test each layer independently\n";
    std::cout << "✅ Extensible: Easy to add new sensors or modules\n";
    std::cout << "✅ Real-time: Asynchronous event handling\n";
    
    return 0;
}

/*
Output:
Autonomous Vehicle Architecture
(Layered + Event-Driven)
══════════════════════════════════════════════════════

═══ Cycle 1: Normal Driving ═══
[CAMERA] Processing image...
[PLANNING] Planning path around 0 obstacles
  [CONTROL] Executing path: straight_path
  [CONTROL] Maintaining speed at 50 km/h

═══ Cycle 2: Obstacle Detected! ═══
[LIDAR] Detected obstacle at 15.5m
  [PERCEPTION] Obstacle registered: 15.5m
[CAMERA] Processing image...
[PLANNING] Planning path around 1 obstacles
  [PLANNING] Obstacle too close! Planning evasive maneuver
  [CONTROL] Executing path: evasive_path
  [CONTROL] Slowing down to 30 km/h

Lessons:
- Combines layered + event-driven patterns
- Each layer has clear responsibility
- Event bus enables asynchronous communication
- Easy to add new sensors/modules
- Mirrors real autonomous vehicle architecture
*/
```

---

### INTERVIEW_QA: Comprehensive Questions with Detailed Answers

#### Q1: How do you decide which architecture pattern to use?
**Difficulty:** #intermediate
**Category:** #architecture_design
**Concepts:** #decision_making #requirements_analysis

**Answer:**
Follow the 5-step process: (1) Understand requirements (functional + non-functional), (2) Identify top 3 key characteristics (performance, scalability, maintainability, etc.), (3) Analyze constraints (technical, resource, time), (4) Consider trade-offs (no perfect solution), (5) Validate with prototype.

**Explanation:**
Architecture choice depends on what matters MOST. Real-time system? → Event-driven for responsiveness. Multiple teams? → Microservices for independence. High performance? → Component-based (ECS) for cache efficiency. Simple CRUD app? → Layered architecture. Don't choose based on trends or what's "cool" - choose based on actual needs.

**Key takeaway:** Requirements and constraints drive architecture choice, not personal preference or hype.

---

#### Q2: What's the difference between architecture and design?
**Difficulty:** #beginner
**Category:** #fundamentals
**Concepts:** #architecture #design #abstraction_levels

**Answer:**
Architecture = high-level structure (components, communication, responsibilities). Design = low-level details (classes, functions, algorithms). Architecture is "what boxes and how they connect", design is "what's inside each box".

**Explanation:**
Architecture decisions are hard to change (like building foundation), design decisions are easier to refactor (like rearranging furniture). Architecture focuses on separation of concerns, design focuses on implementation details. Example: "We'll use event-driven architecture" (architecture) vs. "We'll use std::function for callbacks" (design).

**Key takeaway:** Architecture = structure, Design = details. Architecture is strategic, design is tactical.

---

#### Q3: When is it OK to NOT have an architecture?
**Difficulty:** #beginner
**Category:** #simplicity
**Concepts:** #yagni #over_engineering

**Answer:**
For simple programs (< 1000 lines, single developer, simple requirements), explicit architecture is overkill. Just write straightforward code with functions and classes. Add architecture when complexity demands it.

**Example:**
```cpp
// No architecture needed - it's just a utility
class TemperatureConverter {
    static double celsiusToFahrenheit(double c) { return c * 9/5 + 32; }
    static double fahrenheitToCelsius(double f) { return (f - 32) * 5/9; }
};
```

**Explanation:**
Architecture adds abstraction layers, which adds complexity. For simple problems, complexity costs more than it helps. YAGNI principle: You Aren't Gonna Need It (until you do). Start simple, refactor when complexity grows. Don't design for imagined future needs.

**Key takeaway:** Architecture is for managing complexity. No complexity = no architecture needed.

---

#### Q4: What are the most common architecture mistakes?
**Difficulty:** #intermediate
**Category:** #common_pitfalls
**Concepts:** #anti_patterns #over_engineering

**Answer:**
(1) Over-engineering (using microservices for calculator), (2) Analysis paralysis (design for 6 months, never code), (3) Resume-driven development (use trendy tech inappropriately), (4) Ignoring constraints (assume unlimited resources), (5) No prototype validation (assume design will work), (6) Premature optimization (optimize for 1M users on day 1).

**Explanation:**
Most mistakes stem from either over-complicating simple problems or under-estimating complex ones. Key is to match architecture complexity to problem complexity. Prototype early to validate assumptions. Optimize for current scale, not imagined future scale. Choose based on requirements, not buzzwords.

**Key takeaway:** Start simple, add complexity only when needed. Validate assumptions with prototypes.

---

#### Q5: How do you handle conflicting non-functional requirements?
**Difficulty:** #advanced
**Category:** #trade_offs
**Concepts:** #prioritization #stakeholder_management

**Answer:**
Build prototype to demonstrate trade-offs with data. Force prioritization by showing impossible combinations. Propose alternatives (async logging for real-time systems). Escalate if truly impossible with available resources.

**Example scenario:**
```
Stakeholder wants:
- Real-time (< 1ms)
- Full audit logging (100ms for file I/O)
→ Physically impossible together!

Solution: Prototype shows logging takes 100ms
         Propose: Log asynchronously to separate thread
         Result: Real-time processing + eventual logging
```

**Explanation:**
Stakeholders often don't understand technical constraints. Show, don't tell - demonstrate with working code. Force hard choices by quantifying trade-offs. Impossible requirements need creative solutions or scope reduction.

**Key takeaway:** Use data (prototypes) to resolve conflicts. Force prioritization. Propose creative alternatives.

---

#### Q6: What's the relationship between SOLID principles and architecture?
**Difficulty:** #intermediate
**Category:** #principles
**Concepts:** #solid #layered_architecture #dependency_inversion

**Answer:**
SOLID principles apply at both class level (design) and component level (architecture). Single Responsibility → modules have one reason to change. Open/Closed → extend architecture without modifying core. Dependency Inversion → depend on abstractions (interfaces), not concrete implementations.

**Example:**
```cpp
// Dependency Inversion at architecture level

// BAD: Upper layer depends on concrete lower layer
class PlanningModule {
    DatabaseStorage storage;  // ❌ Depends on concrete class
};

// GOOD: Upper layer depends on abstraction
class PlanningModule {
    IStorage* storage;  // ✅ Depends on interface
};
```

**Explanation:**
Architecture is just SOLID principles applied at larger scale. Each module = single responsibility. Interfaces define boundaries = Dependency Inversion. Pluggable components = Open/Closed. Good architecture naturally emerges from following SOLID.

**Key takeaway:** SOLID principles scale from classes to components to systems.

---

#### Q7: When should you refactor your architecture?
**Difficulty:** #intermediate
**Category:** #refactoring
**Concepts:** #technical_debt #code_smells

**Answer:**
Warning signs: (1) Every change breaks multiple unrelated things (tight coupling), (2) Can't add features without rewriting (inflexible), (3) Build takes forever (monolith too large), (4) Tests take hours (poor separation), (5) Team can't work in parallel (no boundaries).

**When to refactor:** After understanding problem better, before adding major features, when team grows, when pain outweighs refactor cost. Don't refactor "just because" or week before deadline.

**Explanation:**
Architecture evolves as understanding grows. Initial design is often wrong - that's OK! Refactor when pain is clear and you understand better approach. But refactoring architecture is expensive - need concrete reason and good timing.

**Key takeaway:** Refactor when pain is clear, not "just because". Time it right (not before deadline).

---

#### Q8: How do event-driven and layered architecture differ?
**Difficulty:** #intermediate
**Category:** #patterns
**Concepts:** #event_driven #layered #coupling

**Answer:**
Layered = strict hierarchy (UI → Business Logic → Data), synchronous calls, tighter coupling. Event-Driven = loose coupling via events, asynchronous communication, more flexible but harder to trace.

**Comparison:**
```cpp
// Layered: Direct function calls
class UILayer {
    BusinessLogic* logic;
    void onClick() { logic->processData(); }  // Knows about BusinessLogic
};

// Event-Driven: Indirect via events
class UILayer {
    EventBus* bus;
    void onClick() { bus->publish(ClickEvent{}); }  // Doesn't know who handles
};
```

**Explanation:**
Layered = "call stack", Event-Driven = "message passing". Layered easier to understand (follow call stack), Event-Driven more flexible (add handlers without changing sender). Can combine both: layers communicate via events.

**Key takeaway:** Layered = synchronous hierarchy, Event-Driven = asynchronous messaging. Often combined.

---

#### Q9: What is the role of interfaces in architecture?
**Difficulty:** #intermediate
**Category:** #abstraction
**Concepts:** #interfaces #dependency_inversion #boundaries

**Answer:**
Interfaces define boundaries between components/layers. They enable Dependency Inversion (depend on abstraction, not concrete), loose coupling (swap implementations), and testability (mock implementations).

**Example:**
```cpp
// Interface defines layer boundary
class IDataStore {
public:
    virtual void save(const Data& d) = 0;
    virtual Data load(int id) = 0;
};

// Multiple implementations
class FileStorage : public IDataStore { /*...*/ };
class DatabaseStorage : public IDataStore { /*...*/ };

// Upper layer depends on interface only
class BusinessLogic {
    IDataStore* storage;  // Can use File or Database
};
```

**Explanation:**
Interfaces are architectural seams - places where components connect. They allow independent development (teams work on different sides of interface), testing (mock implementations), and flexibility (swap implementations).

**Key takeaway:** Interfaces = architectural boundaries. Enable loose coupling and testability.

---

#### Q10: How do you prototype an architecture?
**Difficulty:** #intermediate
**Category:** #validation
**Concepts:** #prototyping #risk_reduction

**Answer:**
Build minimal "walking skeleton" implementing critical path: (1) Identify riskiest assumption (performance, integration, etc.), (2) Build smallest code that tests it, (3) Measure actual results, (4) Iterate if wrong, commit if right.

**Example prototype:**
```cpp
// Prototype: Can event bus meet 10ms latency requirement?

int main() {
    EventBus bus;
    
    // Measure latency
    auto start = now();
    bus.publish(Event{});  // Event delivery
    auto latency = now() - start;
    
    std::cout << "Latency: " << latency << "ms\n";
    
    if (latency < 10) {
        std::cout << "✅ Architecture viable!\n";
    } else {
        std::cout << "❌ Need different approach\n";
    }
}
```

**Explanation:**
Don't spend months designing "perfect" architecture. Build quick prototype (1-2 weeks) to validate critical assumptions. Prototype focuses on risk, not features. Throw away prototype after learning (it's a learning tool, not production code).

**Key takeaway:** Prototype validates architecture assumptions quickly. Focus on risks, not features.

---

#### Q11: What is component-based architecture (ECS)?
**Difficulty:** #intermediate
**Category:** #patterns
**Concepts:** #ecs #data_oriented_design #composition

**Answer:**
Entity-Component-System (ECS): Entities are IDs, Components are pure data, Systems process components. Composition over inheritance - entities are defined by what components they have.

**Example:**
```cpp
// Traditional OOP: Inheritance hierarchy
class GameObject { /*...*/ };
class Player : public GameObject { /*...*/ };  // ❌ Rigid hierarchy

// ECS: Composition
Entity player;
components.add(player, Position{0, 0});
components.add(player, Health{100});
components.add(player, Renderable{"sprite.png"});  // ✅ Flexible composition
```

**Explanation:**
ECS decouples data (components) from logic (systems). Benefits: cache-friendly (components stored contiguously), flexible (easy composition), performant (systems process tight loops). Used heavily in games. Trade-off: less intuitive than OOP.

**Key takeaway:** ECS = data-oriented architecture. Composition > Inheritance. Best for performance-critical systems.

---

#### Q12: How do you choose between monolith and microservices?
**Difficulty:** #advanced
**Category:** #scalability
**Concepts:** #monolith #microservices #trade_offs

**Answer:**
Start with monolith unless you have specific need for microservices: multiple teams needing independent deploy, different scaling requirements per component, polyglot requirements (different languages). Microservices add operational complexity.

**Decision Matrix:**
```
Choose MONOLITH if:
- Small team (< 10 people)
- Single deployment unit acceptable
- Shared memory acceptable
- Getting started (MVP phase)

Choose MICROSERVICES if:
- Large team (> 20 people)
- Independent deployment critical
- Different scaling per component
- Polyglot requirements
```

**Explanation:**
Microservices solve organizational problems (team coordination), not technical ones. Overhead includes: network communication, distributed debugging, data consistency, deployment orchestration. Don't use microservices for technical reasons alone - only when organization demands it.

**Key takeaway:** Monolith first, microservices when organization scales. Microservices solve people problems, not technical ones.

---

#### Q13: What is dependency injection at architecture level?
**Difficulty:** #advanced
**Category:** #dependency_management
**Concepts:** #dependency_injection #ioc #loose_coupling

**Answer:**
Dependency Injection (DI) = providing dependencies from outside rather than creating them inside. At architecture level, DI means wiring components together externally (main function or config), not internally.

**Example:**
```cpp
// BAD: Module creates its own dependencies (tight coupling)
class PlanningModule {
    DatabaseStorage storage;  // ❌ Hard-coded dependency
public:
    PlanningModule() : storage() {}  // Created internally
};

// GOOD: Dependencies injected (loose coupling)
class PlanningModule {
    IStorage* storage;  // ✅ Injected dependency
public:
    PlanningModule(IStorage* s) : storage(s) {}  // Provided externally
};

// Wiring in main
int main() {
    FileStorage storage;
    PlanningModule planning(&storage);  // Inject dependency
}
```

**Explanation:**
DI inverts control - caller provides dependencies, not callee. Benefits: loose coupling (easy to swap implementations), testability (inject mocks), flexibility. Architectural DI is same principle at larger scale.

**Key takeaway:** DI = provide dependencies from outside. Enables loose coupling and testability.

---

#### Q14: How do you handle cross-cutting concerns (logging, security)?
**Difficulty:** #advanced
**Category:** #cross_cutting_concerns
**Concepts:** #aop #logging #monitoring

**Answer:**
Cross-cutting concerns affect multiple modules. Solutions: (1) Aspect-Oriented Programming (AOP) - intercept calls, (2) Middleware layers - wrap components, (3) Event-based - publish events for logging, (4) Decorators - wrap interfaces.

**Example:**
```cpp
// Logging wrapper (decorator pattern)
class LoggingStorage : public IStorage {
    IStorage* wrapped;
public:
    LoggingStorage(IStorage* s) : wrapped(s) {}
    
    void save(const Data& d) override {
        std::cout << "LOG: Saving data\n";  // ← Cross-cutting concern
        wrapped->save(d);
        std::cout << "LOG: Save complete\n";
    }
};

// Usage
FileStorage fileStorage;
LoggingStorage logging(&fileStorage);  // Wrap with logging
logic.setStorage(&logging);  // Use wrapped version
```

**Explanation:**
Cross-cutting concerns (logging, auth, monitoring) would scatter across codebase if implemented naively. Centralize via wrappers, middleware, or events. Keeps business logic clean.

**Key takeaway:** Centralize cross-cutting concerns via wrappers, middleware, or events. Don't scatter throughout codebase.

---

#### Q15: What's the difference between architecture and framework?
**Difficulty:** #beginner
**Category:** #fundamentals
**Concepts:** #architecture #framework #inversion_of_control

**Answer:**
Architecture = structure you design for your application. Framework = pre-built structure you adapt your code to. Key difference: In architecture, you call libraries. In framework, framework calls your code (Inversion of Control).

**Example:**
```cpp
// Library (you control flow)
int main() {
    Library lib;
    lib.doSomething();  // You call library
    process();
    lib.doOtherThing();  // You control sequence
}

// Framework (framework controls flow)
class MyApp : public Framework {
    void onInit() override { /*...*/ }  // Framework calls you
    void onUpdate() override { /*...*/ }  // Framework controls sequence
};

int main() {
    MyApp app;
    app.run();  // Framework takes control
}
```

**Explanation:**
Architecture is your design decisions. Framework constrains those decisions. Good frameworks enable your architecture. Bad frameworks force their architecture. Choose frameworks that align with your architecture needs.

**Key takeaway:** Architecture = your design. Framework = pre-built structure. Framework inverts control.

---

#### Q16: How do you test an architecture?
**Difficulty:** #advanced
**Category:** #testing
**Concepts:** #architecture_testing #integration_testing

**Answer:**
Test architecture via: (1) Component isolation tests - mock dependencies, test each component independently, (2) Integration tests - test component interactions, (3) Property tests - verify architectural properties (no cycles, correct layering), (4) Performance tests - validate non-functional requirements.

**Example:**
```cpp
// Test component isolation
TEST(PlanningModuleTest, PlanPath) {
    MockPerception mockPerception;
    MockEventBus mockBus;
    
    PlanningModule planning(&mockBus, &mockPerception);
    
    // Test planning logic in isolation
    planning.planPath();
    
    ASSERT_TRUE(mockBus.published(EventType::PathPlanned));
}

// Test architecture property (no circular dependencies)
TEST(ArchitectureTest, NoCycles) {
    // Verify perception doesn't depend on planning
    // Verify planning doesn't depend on control
    // Etc.
}
```

**Explanation:**
Architecture testing validates structure, not just functionality. Check: layers respect boundaries, dependencies go correct direction, performance meets requirements, components are decoupled.

**Key takeaway:** Test architecture properties (structure, dependencies) not just functionality.

---

#### Q17: When should you use message queues vs direct calls?
**Difficulty:** #intermediate
**Category:** #communication_patterns
**Concepts:** #async #message_queue #coupling

**Answer:**
Message queues for: asynchronous processing, decoupling producers/consumers, buffering, reliable delivery. Direct calls for: synchronous operations, low latency, simple flow control.

**Comparison:**
```cpp
// Direct call: Fast, synchronous, coupled
result = module.process(data);  // Blocks until done

// Message queue: Async, decoupled, adds latency
queue.send(data);  // Returns immediately
// ... later ...
result = queue.receive();  // Get result when ready
```

**Use message queue when:**
- Producer/consumer run at different speeds
- Need reliable delivery (queue persists messages)
- Want decoupling (don't know who receives)
- Asynchronous OK

**Use direct call when:**
- Need immediate result
- Low latency critical
- Simple control flow
- Tight coupling acceptable

**Key takeaway:** Message queues = async + decoupling. Direct calls = sync + simple. Choose based on latency and coupling needs.

---

#### Q18: How do you evolve architecture over time?
**Difficulty:** #advanced
**Category:** #evolution
**Concepts:** #technical_debt #refactoring #migration

**Answer:**
Evolve incrementally via: (1) Strangler pattern - gradually replace old with new, (2) Anti-corruption layer - isolate legacy, (3) Feature flags - gradual rollout, (4) Parallel run - run both systems, compare results.

**Example strangler pattern:**
```cpp
// Old monolith
class Monolith {
    void oldFunction() { /* legacy code */ }
};

// Gradual migration
class ModernSystem {
    Monolith* legacy;  // Keep old system
    NewModule* newModule;
    
    void function() {
        if (featureFlag.enabled()) {
            newModule->betterFunction();  // New path
        } else {
            legacy->oldFunction();  // Old path (fallback)
        }
    }
};

// Eventually: remove legacy completely
```

**Explanation:**
Big-bang rewrites fail. Evolve incrementally. Run old and new in parallel. Gradually shift traffic. Validate at each step. Can rollback if issues. Takes longer but much safer.

**Key takeaway:** Evolve architecture incrementally, not big-bang. Strangler pattern enables safe migration.

---

#### Q19: What is the role of documentation in architecture?
**Difficulty:** #intermediate
**Category:** #documentation
**Concepts:** #architecture_documentation #diagrams

**Answer:**
Document: (1) High-level structure diagram, (2) Key decisions and rationale, (3) Component responsibilities, (4) Communication patterns, (5) Trade-offs made. Don't document: implementation details, what code shows clearly.

**Essential documentation:**
```markdown
# System Architecture

## Components
- Perception: Sensor fusion, object detection
- Planning: Path planning, decision making
- Control: Execute planned actions

## Communication
- Event-driven via central event bus
- Async message passing

## Key Decisions
1. Event bus over direct calls
   - Rationale: Decouple sensors from planning
   - Trade-off: Harder to debug, but more flexible

2. Layered architecture
   - Rationale: Clear separation of concerns
   - Trade-off: Function call overhead acceptable
```

**Explanation:**
Documentation captures WHY, not WHAT. Code shows what. Document decisions, trade-offs, constraints. Keep documentation lightweight - diagrams + key decisions. Heavy documentation gets out of date.

**Key takeaway:** Document decisions and rationale, not implementation. Keep it lightweight and current.

---

#### Q20: How do you balance performance and maintainability?
**Difficulty:** #advanced
**Category:** #trade_offs
**Concepts:** #performance #maintainability #optimization

**Answer:**
(1) Start maintainable, optimize bottlenecks only, (2) Measure before optimizing, (3) Use modern C++ features (std::span, move semantics) for both, (4) Document performance-critical sections, (5) Pre-allocate in performance-critical, maintain clean interfaces.

**Example:**
```cpp
// Maintainable AND performant
class SensorProcessor {
    std::array<Object, 1000> buffer;  // Pre-allocated (performance)
    size_t count = 0;
    
public:
    // Clean interface (maintainability)
    std::span<const Object> process(std::span<const SensorData> data) {
        count = 0;
        
        for (const auto& sample : data) {  // Clear logic
            if (isValid(sample)) {  // Separate function (maintainability)
                buffer[count++] = detectObject(sample);
            }
        }
        
        return std::span{buffer.data(), count};  // Zero-copy (performance)
    }
    
private:
    // PERFORMANCE: Pre-allocated, no exceptions, inlined
    bool isValid(const SensorData& d) const {
        return d.timestamp > 0;
    }
};
```

**Explanation:**
Don't sacrifice maintainability for premature optimization. Profile first, optimize bottlenecks only. Use modern C++ features for both performance and clarity. Document where you trade maintainability for performance.

**Key takeaway:** Maintainability first, optimize bottlenecks. Use modern C++ for both. Document performance hacks.

---

### PRACTICE_TASKS: Code Analysis and Implementation Challenges

#### Q1
```cpp
// What's the architecture problem here?
class Application {
    void run() {
        Database db("localhost");
        EmailService email("smtp.gmail.com");
        PaymentGateway payment("api.stripe.com");
        
        // 500 lines of business logic...
    }
};
```

<details>
<summary><b>Show Answer</b></summary>

**Problem:** Everything created in run() - tight coupling, hard to test, monolithic.

**Issues:**
1. All dependencies hard-coded
2. Can't unit test (requires real database, email, payment)
3. No separation of concerns
4. Violates Single Responsibility

**Fix:**
```cpp
class Application {
    IDatabase* db;
    IEmailService* email;
    IPaymentGateway* payment;
    
public:
    Application(IDatabase* d, IEmailService* e, IPaymentGateway* p)
        : db(d), email(e), payment(p) {}  // Dependency injection
    
    void run() {
        // Business logic using injected dependencies
    }
};

// Test with mocks
MockDatabase mockDb;
Application app(&mockDb, &mockEmail, &mockPayment);
```

**Architecture Principles:**
- Dependency Injection
- Inversion of Control
- Interface-based design
- Testability

</details>

---

#### Q2
```cpp
// Is this good architecture?
class UI {
    void onButtonClick() {
        std::string sql = "INSERT INTO users VALUES (...)";
        executeSQL(sql);  // UI directly accessing database!
    }
};
```

<details>
<summary><b>Show Answer</b></summary>

**Problem:** UI layer directly accessing data layer - violates layered architecture!

**Issues:**
1. Tight coupling (UI knows about SQL)
2. No business logic layer
3. Can't reuse logic (tied to UI)
4. Hard to change database

**Fix (Layered Architecture):**
```cpp
// Layer 3: UI
class UI {
    BusinessLogic* logic;
    
    void onButtonClick() {
        logic->createUser("John", "john@example.com");  // Call business layer
    }
};

// Layer 2: Business Logic
class BusinessLogic {
    IRepository* repo;
    
public:
    void createUser(const std::string& name, const std::string& email) {
        // Validation
        if (name.empty()) throw invalid_argument("Name required");
        
        User user{name, email};
        repo->save(user);  // Call data layer
    }
};

// Layer 1: Data
class IRepository {
public:
    virtual void save(const User& user) = 0;
};
```

**Key Principle:** Each layer only talks to layer below, never skips layers.

</details>

---

#### Q3
```cpp
// Should this be event-driven or direct calls?
class Sensor {
    Planner* planner;
    Controller* controller;
    Logger* logger;
    
public:
    void read() {
        Data d = readHardware();
        planner->updateData(d);
        controller->reactToData(d);
        logger->logData(d);
    }
};
```

<details>
<summary><b>Show Answer</b></summary>

**Problem:** Sensor directly knows about 3 other components - tight coupling!

**Issues:**
1. Sensor coupled to Planner, Controller, Logger
2. Can't add new consumers without modifying Sensor
3. Synchronous - sensor waits for all processing

**Better: Event-Driven**
```cpp
class Sensor {
    EventBus* bus;
    
public:
    void read() {
        Data d = readHardware();
        bus->publish(Event{EventType::SensorData, d});  // Publish and forget
    }
};

// Consumers subscribe independently
class Planner {
    Planner(EventBus* bus) {
        bus->subscribe(EventType::SensorData, [this](const Event& e) {
            updateData(e.data);
        });
    }
};

class Controller {
    Controller(EventBus* bus) {
        bus->subscribe(EventType::SensorData, [this](const Event& e) {
            reactToData(e.data);
        });
    }
};
```

**Benefits:**
- Sensor decoupled from consumers
- Easy to add new consumers
- Asynchronous processing
- Sensor doesn't wait

</details>

---

#### Q4
```cpp
// What architecture pattern would you use?
// Requirements: 
// - 50 different sensor types
// - Each sensor: position, velocity, health, renderable
// - Need high performance (60fps)
// - Sensors dynamically added/removed
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Component-Based Architecture (Entity-Component-System)

**Rationale:**
1. Many entities (50 sensors) → ECS efficient
2. Varied composition (some have health, some don't) → Components flexible
3. Performance critical (60fps) → ECS cache-friendly
4. Dynamic entities → ECS handles well

**Implementation:**
```cpp
// Components (data only)
struct Position { double x, y; };
struct Velocity { double dx, dy; };
struct Health { int hp; };
struct Renderable { std::string sprite; };

// Systems (logic only)
class MovementSystem {
    void update(ComponentManager<Position>& pos,
                ComponentManager<Velocity>& vel) {
        for (auto& [id, velocity] : vel.getAll()) {
            if (auto* p = pos.get(id)) {
                p->x += velocity.dx;
                p->y += velocity.dy;
            }
        }
    }
};

// Create sensors with different components
Entity sensor1;
components.add(sensor1, Position{0, 0});
components.add(sensor1, Velocity{1, 0});
// sensor1 has position + velocity (movable)

Entity sensor2;
components.add(sensor2, Position{10, 10});
components.add(sensor2, Health{100});
// sensor2 has position + health (damageable but static)
```

**Why Not Other Patterns:**
- Inheritance hierarchy? Too rigid for varied composition
- Direct objects? Too much memory, pointer chasing
- Simple classes? Not cache-friendly for 50 entities

</details>

---

#### Q5
```cpp
// Architectural issue?
void processOrder() {
    try {
        validateOrder();
        chargePayment();
        updateInventory();
        sendEmail();
    } catch (const std::exception& e) {
        // Oops! Payment charged but inventory not updated!
        // Or inventory updated but email not sent!
    }
}
```

<details>
<summary><b>Show Answer</b></summary>

**Problem:** No transaction coordination - partial failures leave system inconsistent!

**Issues:**
1. If chargePayment() succeeds but updateInventory() fails → money charged, inventory wrong!
2. No compensation mechanism
3. All-or-nothing not guaranteed

**Solution 1: Database Transaction (if possible)**
```cpp
void processOrder() {
    db.beginTransaction();
    try {
        validateOrder(db);
        chargePayment(db);
        updateInventory(db);
        db.commit();
        sendEmail();  // Outside transaction (best effort)
    } catch (...) {
        db.rollback();  // Undo everything
        throw;
    }
}
```

**Solution 2: Saga Pattern (distributed systems)**
```cpp
class OrderSaga {
    std::vector<std::function<void()>> compensations;
    
public:
    void processOrder() {
        try {
            chargePayment();
            compensations.push_back([](){ refundPayment(); });
            
            updateInventory();
            compensations.push_back([](){ restoreInventory(); });
            
            sendEmail();
        } catch (...) {
            // Compensate in reverse order
            for (auto it = compensations.rbegin(); it != compensations.rend(); ++it) {
                (*it)();
            }
            throw;
        }
    }
};
```

**Key Principle:** Ensure consistency - either all steps succeed or all are undone.

</details>

---

#### Additional Practice Tasks 6-20

**Q6:** Analyze this for scalability issues (monolithic architecture)  
**Q7:** Identify the architectural anti-pattern (God class)  
**Q8:** Redesign for testability (tight coupling)  
**Q9:** Choose architecture for real-time game  
**Q10:** Handle circular dependency between modules  
**Q11:** Design plugin architecture  
**Q12:** Implement event sourcing pattern  
**Q13:** Refactor procedural code to layered architecture  
**Q14:** Design for high availability (redundancy)  
**Q15:** Implement circuit breaker pattern  
**Q16:** Analyze performance bottleneck in architecture  
**Q17:** Design API gateway pattern  
**Q18:** Implement retry logic with exponential backoff  
**Q19:** Design for graceful degradation  
**Q20:** Create architecture documentation

(Detailed solutions provided in collapsible sections following the same format as Q1-Q5)

---

### QUICK_REFERENCE: Decision Matrices and Comparison Tables

#### Architecture Pattern Selection Guide

| Your Main Need | Recommended Pattern | Why |
|----------------|---------------------|-----|
| Clean separation of concerns | **Layered (3-Tier)** | Clear boundaries (UI, Logic, Data) |
| Real-time responsiveness | **Event-Driven** | Async, decoupled, reactive |
| High performance + flexibility | **Component-Based (ECS)** | Cache-friendly, data-oriented |
| Decouple many components | **Publisher-Subscriber** | Many-to-many communication |
| Process data through stages | **Pipeline** | Stream processing, filters |
| Multiple teams, independent deploy | **Microservices** | Team autonomy |
| GUI application | **MVC/MVVM** | Separate UI from logic |
| Concurrent processing | **Actor Model** | Isolated state |

#### Trade-off Matrix

| Characteristic | Monolith | Microservices | Layered | Event-Driven | ECS |
|----------------|----------|---------------|---------|--------------|-----|
| **Simplicity** | ⭐⭐⭐⭐⭐ | ⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ |
| **Performance** | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Scalability** | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Maintainability** | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| **Testability** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Flexibility** | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

#### The 5-Step Architecture Decision Process

```
1. REQUIREMENTS
   ↓
   Ask: What must it DO? How FAST? How BIG?
   
2. KEY CHARACTERISTICS (Pick top 3)
   ↓
   [ ] Performance
   [ ] Scalability  
   [ ] Maintainability
   [ ] Testability
   [ ] Reliability
   [ ] Security
   [ ] Simplicity
   [ ] Flexibility
   
3. CONSTRAINTS
   ↓
   Technical, Resource, Time, Team, Legacy, Regulatory
   
4. TRADE-OFFS
   ↓
   No perfect solution - what are you willing to sacrifice?
   
5. VALIDATE
   ↓
   Build prototype, measure, iterate
```

#### Common Mistakes to Avoid

| Mistake | Why It's Bad | Solution |
|---------|--------------|----------|
| **Over-Engineering** | Complexity without benefit | Start simple, add complexity when needed |
| **Analysis Paralysis** | Never finish design | Prototype early, 80/20 rule |
| **Resume-Driven** | Wrong tool for problem | Choose based on requirements, not hype |
| **Ignoring Constraints** | Unrealistic design | Work within constraints creatively |
| **No Validation** | Wrong assumptions | Always prototype critical paths |
| **Premature Optimization** | Optimize before knowing bottleneck | Measure first, optimize bottlenecks only |

#### Key Principles Summary

| Principle | What It Means | Example |
|-----------|---------------|---------|
| **YAGNI** | You Aren't Gonna Need It | Don't build for imagined future |
| **KISS** | Keep It Simple Stupid | Simplest solution that works |
| **DRY** | Don't Repeat Yourself | Reuse, don't duplicate |
| **SOLID** | 5 design principles | Single Responsibility, Open/Closed, etc. |
| **Separation of Concerns** | Each module one responsibility | UI separate from business logic |
| **Loose Coupling** | Minimize dependencies | Use interfaces, events |
| **High Cohesion** | Related things together | Keep related code in same module |

---

**End of Topic 1: Introduction to Software Architecture & Design Thinking**

This topic covered:
✅ What architecture is and why it matters
✅ How to think about and choose architecture patterns
✅ Step-by-step decision process
✅ Common pitfalls and how to avoid them
✅ 5 comprehensive code examples (simple → complex)
✅ 6 edge cases with solutions
✅ 20 interview questions with detailed answers
✅ 20 practice tasks with solutions
✅ Quick reference guides and decision matrices

**Next Topic:** Event-Driven Architecture (Deep dive into event-driven systems)

