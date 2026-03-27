## TOPIC: Introduction to Software Architecture & Design Thinking

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

**Answer:**
```
Tight coupling, hard-coded dependencies, untestable monolithic design
```

**Explanation:**
- All dependencies created inside `run()` method - hard-coded, not injected
- Cannot unit test without real database, email server, and payment gateway
- Violates Single Responsibility Principle - Application does too much
- No separation of concerns - mixing dependency creation with business logic
- **Key Concept:** Use Dependency Injection to decouple components and enable testability through interface-based design

**Fixed Version:**
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
MockEmailService mockEmail;
MockPaymentGateway mockPayment;
Application app(&mockDb, &mockEmail, &mockPayment);
```

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

**Answer:**
```
Bad architecture - violates layered architecture principles
```

**Explanation:**
- UI layer directly accessing data layer - skips business logic layer entirely
- Tight coupling: UI knows about SQL implementation details
- Cannot reuse business logic - tied to UI trigger
- Cannot change database without modifying UI code
- **Key Concept:** Layered architecture enforces separation where each layer only communicates with adjacent layer below

**Fixed Version (Layered Architecture):**
```cpp
// Layer 3: UI (Presentation)
class UI {
    BusinessLogic* logic;

    void onButtonClick() {
        logic->createUser("John", "john@example.com");  // Call business layer
    }
};

// Layer 2: Business Logic (Domain)
class BusinessLogic {
    IRepository* repo;

public:
    void createUser(const std::string& name, const std::string& email) {
        // Validation
        if (name.empty()) throw std::invalid_argument("Name required");

        User user{name, email};
        repo->save(user);  // Call data layer
    }
};

// Layer 1: Data (Persistence)
class IRepository {
public:
    virtual void save(const User& user) = 0;
};

class SQLRepository : public IRepository {
public:
    void save(const User& user) override {
        std::string sql = "INSERT INTO users VALUES (...)";
        executeSQL(sql);
    }
};
```

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

**Answer:**
```
Event-driven architecture would be better - eliminates tight coupling
```

**Explanation:**
- Sensor directly coupled to 3 components - adding new consumer requires modifying Sensor
- Synchronous processing - Sensor waits for all consumers to complete
- Cannot add/remove consumers dynamically
- Violates Open/Closed Principle - not open for extension without modification
- **Key Concept:** Event-driven architecture decouples producers from consumers via publish-subscribe pattern

**Better: Event-Driven Architecture:**
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
public:
    Planner(EventBus* bus) {
        bus->subscribe(EventType::SensorData, [this](const Event& e) {
            updateData(e.data);
        });
    }
};

class Controller {
public:
    Controller(EventBus* bus) {
        bus->subscribe(EventType::SensorData, [this](const Event& e) {
            reactToData(e.data);
        });
    }
};

class Logger {
public:
    Logger(EventBus* bus) {
        bus->subscribe(EventType::SensorData, [this](const Event& e) {
            logData(e.data);
        });
    }
};
```

#### Q4
```cpp
// What architecture pattern would you use?
// Requirements:
// - 50 different sensor types
// - Each sensor: position, velocity, health, renderable
// - Need high performance (60fps)
// - Sensors dynamically added/removed
```

**Answer:**
```
Entity-Component-System (ECS) architecture
```

**Explanation:**
- Many entities (50+ sensors) benefit from data-oriented design
- Varied composition (some sensors have different component combinations) requires flexibility
- Performance-critical (60fps) needs cache-friendly memory layout (component arrays)
- Dynamic entity management (add/remove) is ECS strength
- **Key Concept:** ECS separates data (Components) from logic (Systems) for performance and flexibility in entity-based systems

**Implementation:**
```cpp
// Components (data only - POD types)
struct Position { double x, y; };
struct Velocity { double dx, dy; };
struct Health { int hp; };
struct Renderable { std::string sprite; };

// Systems (logic only - operate on components)
class MovementSystem {
public:
    void update(ComponentManager<Position>& pos,
                ComponentManager<Velocity>& vel, double dt) {
        for (auto& [id, velocity] : vel.getAll()) {
            if (auto* p = pos.get(id)) {
                p->x += velocity.dx * dt;
                p->y += velocity.dy * dt;
            }
        }
    }
};

class RenderSystem {
public:
    void render(ComponentManager<Position>& pos,
                ComponentManager<Renderable>& renderable) {
        for (auto& [id, render] : renderable.getAll()) {
            if (auto* p = pos.get(id)) {
                draw(render.sprite, p->x, p->y);
            }
        }
    }
};

// Create sensors with different component combinations
Entity sensor1 = entityManager.create();
components.add(sensor1, Position{0, 0});
components.add(sensor1, Velocity{1, 0});
// sensor1: movable sensor (no health, no rendering)

Entity sensor2 = entityManager.create();
components.add(sensor2, Position{10, 10});
components.add(sensor2, Health{100});
components.add(sensor2, Renderable{"sensor.png"});
// sensor2: static sensor with health and rendering
```

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

**Answer:**
```
No transaction coordination - partial failures cause inconsistency
```

**Explanation:**
- If `chargePayment()` succeeds but `updateInventory()` fails, money is charged but inventory is wrong
- No compensation mechanism to undo successful steps
- Catch block cannot determine which step failed and what to rollback
- Distributed transaction problem - different systems (payment, inventory, email)
- **Key Concept:** Use Saga pattern for distributed transactions to ensure consistency through compensation

**Solution 1: Database Transaction (single system):**
```cpp
void processOrder() {
    db.beginTransaction();
    try {
        validateOrder(db);
        chargePayment(db);
        updateInventory(db);
        db.commit();
        sendEmail();  // Outside transaction (best effort, can fail)
    } catch (...) {
        db.rollback();  // Undo everything atomically
        throw;
    }
}
```

**Solution 2: Saga Pattern (distributed systems):**
```cpp
class OrderSaga {
    std::vector<std::function<void()>> compensations;

public:
    void processOrder() {
        try {
            // Step 1: Charge payment
            chargePayment();
            compensations.push_back([this](){ refundPayment(); });

            // Step 2: Update inventory
            updateInventory();
            compensations.push_back([this](){ restoreInventory(); });

            // Step 3: Send email (best effort)
            sendEmail();
        } catch (...) {
            // Compensate in reverse order
            for (auto it = compensations.rbegin(); it != compensations.rend(); ++it) {
                try {
                    (*it)();  // Execute compensation
                } catch (...) {
                    // Log compensation failure
                }
            }
            throw;
        }
    }

private:
    void refundPayment() {
        // Reverse the payment charge
    }

    void restoreInventory() {
        // Restore inventory to previous state
    }
};
```

---
