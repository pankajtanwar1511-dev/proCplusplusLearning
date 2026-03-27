## TOPIC: Introduction to Software Architecture & Design Thinking

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
