# Topic 7: Clean / Hexagonal Architecture (Ports and Adapters)

### THEORY_SECTION: Core Concepts and Foundations
#### What is Hexagonal Architecture?

**Hexagonal Architecture** (also called **Ports and Adapters** or **Clean Architecture**) is a design pattern that places your **business logic at the center** and makes it **independent** of external concerns (databases, UI, frameworks).

**Key Idea**: Business logic should not depend on external details. External details (database, UI, web framework) depend on business logic through **interfaces (ports)**.

---

#### Simple Explanation: Power Outlet Analogy

Imagine a laptop:

| Traditional Architecture | Hexagonal Architecture |
|-------------------------|------------------------|
| **Laptop hardwired to wall outlet** | **Laptop with power adapter** |
| Can only use in one country | Use anywhere with different adapters |
| Can't test without electricity | Can test with battery |
| **Tight coupling** | **Loose coupling** |

**Hexagonal**: Your laptop (business logic) doesn't care about the power source (database, UI). It just needs a **port** (interface), and you can plug in different **adapters** (implementations).

---

#### The Problem with Traditional Layered Architecture

**Traditional Layered Architecture**:
```
┌─────────────────┐
│  UI Layer       │
└─────────────────┘
        ↓ depends on
┌─────────────────┐
│  Business Layer │
└─────────────────┘
        ↓ depends on
┌─────────────────┐
│  Data Layer     │
└─────────────────┘
        ↓ depends on
┌─────────────────┐
│  Database       │
└─────────────────┘
```

**Problem**: Business logic depends on concrete database implementation!

```cpp
class OrderService {  // Business Layer
    MySQLOrderRepository repository;  // ← Depends on MySQL!

    void placeOrder(Order order) {
        repository.save(order);  // ← Can't test without MySQL
    }
};
```

**Issues**:
- ❌ Can't test business logic without database
- ❌ Can't switch databases (MySQL → PostgreSQL) easily
- ❌ Business logic coupled to infrastructure

---

#### Hexagonal Architecture Solution

**Hexagonal Architecture**:
```
                    ┌──────────────────┐
                    │   UI Adapter     │ (Web, Mobile, CLI)
                    └──────────────────┘
                            ↓
                    ┌──────────────────┐
                    │   Primary Port   │ (Interface)
                    └──────────────────┘
                            ↓
        ┌───────────────────────────────────────┐
        │                                       │
        │        BUSINESS LOGIC                 │
        │        (Core Domain)                  │
        │                                       │
        └───────────────────────────────────────┘
                            ↓
                    ┌──────────────────┐
                    │ Secondary Port   │ (Interface)
                    └──────────────────┘
                            ↓
                    ┌──────────────────┐
                    │  DB Adapter      │ (MySQL, Postgres, InMemory)
                    └──────────────────┘
```

**Key Change**: Business logic depends on **interfaces (ports)**, not concrete implementations!

```cpp
// Port (Interface)
class IOrderRepository {
public:
    virtual void save(const Order& order) = 0;
    virtual ~IOrderRepository() = default;
};

// Business Logic
class OrderService {
    IOrderRepository* repository;  // ← Depends on interface!

public:
    OrderService(IOrderRepository* repo) : repository(repo) {}

    void placeOrder(Order order) {
        repository->save(order);  // ← Can test with mock!
    }
};

// Adapter (Implementation)
class MySQLOrderRepository : public IOrderRepository {
    void save(const Order& order) override {
        // MySQL-specific code
    }
};

class InMemoryOrderRepository : public IOrderRepository {
    void save(const Order& order) override {
        // In-memory for testing
    }
};
```

**Benefits**:
- ✅ Test business logic with mock/in-memory repository
- ✅ Swap MySQL → PostgreSQL by changing adapter
- ✅ Business logic independent of infrastructure

---

#### Key Concepts

#### 1. Hexagon (Business Logic Core)

The **hexagon** represents your **core business logic** (domain models, use cases, business rules).

**Characteristics**:
- ✅ Contains **pure business logic** (no database, no UI)
- ✅ Has **no dependencies** on external frameworks
- ✅ Defines **interfaces (ports)** for external interactions

**Example**:
```cpp
// Core Business Logic
class Order {
    int id;
    double total;
    std::string status;  // "pending", "completed", "cancelled"

public:
    void confirm() {
        if (status != "pending") {
            throw std::logic_error("Can only confirm pending orders");
        }
        status = "completed";
    }
};

class OrderService {
    IOrderRepository* repository;  // Port (interface)
    IPaymentGateway* paymentGateway;  // Port (interface)

public:
    void placeOrder(Order order, const PaymentInfo& payment) {
        // Business rule: Validate order
        if (order.total <= 0) {
            throw std::invalid_argument("Order total must be positive");
        }

        // Business rule: Charge payment
        paymentGateway->charge(payment, order.total);

        // Business rule: Confirm order
        order.confirm();

        // Save order
        repository->save(order);
    }
};
```

**Note**: `OrderService` has NO idea about MySQL, REST APIs, or UI frameworks!

---

#### 2. Ports (Interfaces)

**Ports** are **interfaces** that define how the business logic interacts with the outside world.

**Two types**:

**Primary Ports (Driving / Inbound)**: How external world **uses** your business logic.
- Example: REST API, CLI commands, GUI buttons

```cpp
// Primary Port: Use Cases
class IOrderService {
public:
    virtual void placeOrder(Order order) = 0;
    virtual Order getOrder(int orderId) = 0;
    virtual ~IOrderService() = default;
};
```

**Secondary Ports (Driven / Outbound)**: How business logic **depends on** external systems.
- Example: Database, email service, payment gateway

```cpp
// Secondary Port: Repository
class IOrderRepository {
public:
    virtual void save(const Order& order) = 0;
    virtual Order getById(int id) = 0;
    virtual ~IOrderRepository() = default;
};

// Secondary Port: Payment Gateway
class IPaymentGateway {
public:
    virtual void charge(const PaymentInfo& payment, double amount) = 0;
    virtual ~IPaymentGateway() = default;
};
```

---

#### 3. Adapters (Implementations)

**Adapters** are **concrete implementations** of ports. They handle external technology details.

**Primary Adapters**: Translate external requests into business logic calls.

```cpp
// Primary Adapter: REST API Controller
class OrderController {
    IOrderService* orderService;  // Uses Primary Port

public:
    void handlePlaceOrderRequest(HttpRequest request) {
        // Parse HTTP request
        Order order = parseOrderFromJSON(request.body);

        // Call business logic
        orderService->placeOrder(order);

        // Return HTTP response
        return HttpResponse{200, "{\"status\": \"success\"}"};
    }
};
```

**Secondary Adapters**: Implement secondary ports with specific technology.

```cpp
// Secondary Adapter: MySQL Repository
class MySQLOrderRepository : public IOrderRepository {
    DatabaseConnection db;

public:
    void save(const Order& order) override {
        std::string query = "INSERT INTO orders (total, status) VALUES ("
                          + std::to_string(order.total) + ", '" + order.status + "')";
        db.execute(query);
    }

    Order getById(int id) override {
        std::string query = "SELECT * FROM orders WHERE id = " + std::to_string(id);
        auto result = db.query(query);
        return parseOrderFromResult(result);
    }
};

// Secondary Adapter: In-Memory Repository (for testing!)
class InMemoryOrderRepository : public IOrderRepository {
    std::map<int, Order> orders;
    int nextId = 1;

public:
    void save(const Order& order) override {
        orders[nextId++] = order;
    }

    Order getById(int id) override {
        return orders[id];
    }
};
```

---

#### Flow: Request to Response

```
1. HTTP Request arrives
        ↓
2. Primary Adapter (REST Controller)
   Translates HTTP → Domain Objects
        ↓
3. Primary Port (IOrderService interface)
        ↓
4. Business Logic (OrderService implementation)
   Validates, applies business rules
        ↓
5. Secondary Port (IOrderRepository interface)
        ↓
6. Secondary Adapter (MySQLOrderRepository)
   Saves to MySQL database
        ↓
7. Returns result through layers
        ↓
8. HTTP Response sent
```

**Example Code**:
```cpp
// 1. HTTP Request
HttpRequest request = {
    method: "POST",
    path: "/orders",
    body: "{\"total\": 99.99}"
};

// 2. Primary Adapter
OrderController controller(orderService);
HttpResponse response = controller.handlePlaceOrderRequest(request);
    // Internally:
    // Order order = parseJSON(request.body);
    // orderService->placeOrder(order);  // ← Calls business logic

// 3-4. Business Logic (OrderService)
void OrderService::placeOrder(Order order) {
    // Validate business rules
    if (order.total <= 0) throw std::invalid_argument("Invalid total");

    // Save via secondary port
    repository->save(order);  // ← Calls adapter
}

// 5-6. Secondary Adapter
void MySQLOrderRepository::save(const Order& order) {
    db.execute("INSERT INTO orders ...");
}

// 7-8. Response
HttpResponse{200, "{\"status\": \"success\"}"}
```

---

#### Hexagonal Architecture Benefits

| Benefit | Explanation |
|---------|-------------|
| **Testability** | Test business logic with mocks/in-memory adapters |
| **Independence** | Business logic doesn't depend on frameworks |
| **Flexibility** | Swap adapters (MySQL → Postgres, REST → gRPC) |
| **Maintainability** | Changes to infrastructure don't affect business logic |
| **Parallel Development** | Teams work on core logic vs adapters independently |

---

#### Hexagonal vs Layered Architecture

| Aspect | Layered | Hexagonal |
|--------|---------|-----------|
| **Dependency Direction** | Top → Bottom (UI → Business → Data) | Outside → Inside (Adapters → Core) |
| **Core Dependency** | Business depends on Data layer | Business depends on **interfaces** |
| **Database** | Business layer imports database code | Database adapter implements interface |
| **Testability** | Need database for tests | Use in-memory adapter for tests |
| **Framework Coupling** | Often tightly coupled | Framework-independent |

---

#### Clean Architecture (Uncle Bob)

**Clean Architecture** is a generalization of Hexagonal Architecture by Robert C. Martin ("Uncle Bob").

**Layers (Circles)**:
```
┌─────────────────────────────────────────┐
│  Frameworks & Drivers (Outer)           │ ← Web, DB, UI
│  ┌───────────────────────────────────┐  │
│  │  Interface Adapters (Middle)      │  │ ← Controllers, Presenters, Gateways
│  │  ┌─────────────────────────────┐  │  │
│  │  │  Use Cases (Inner)          │  │  │ ← Business Logic
│  │  │  ┌───────────────────────┐  │  │  │
│  │  │  │  Entities (Core)      │  │  │  │ ← Domain Models
│  │  │  └───────────────────────┘  │  │  │
│  │  └─────────────────────────────┘  │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

**Dependency Rule**: **Outer layers depend on inner layers, NEVER the reverse.**

```
Frameworks → Adapters → Use Cases → Entities
(outer)                             (inner)
```

---

#### When to Use Hexagonal Architecture

| **Use When** | **Don't Use When** |
|--------------|-------------------|
| ✅ Complex business logic | ❌ Simple CRUD app |
| ✅ Long-lived project (years) | ❌ Prototype/throwaway code |
| ✅ Need to swap implementations (DB, APIs) | ❌ Fixed technology stack |
| ✅ High testability required | ❌ Small project (< 1000 LOC) |
| ✅ Multiple interfaces (Web + Mobile + API) | ❌ Tight deadline (overhead) |

---

#### Real-World Examples

**Banking System**:
```
Core: Account, Transaction, Balance business rules
Ports: IAccountRepository, ITransactionService
Adapters:
  - Primary: REST API, Mobile App, ATM Interface
  - Secondary: Oracle Database, SWIFT Payment Gateway
```

**E-Commerce**:
```
Core: Order, Product, Checkout business logic
Ports: IOrderRepository, IPaymentGateway, IEmailService
Adapters:
  - Primary: Web UI (React), Mobile App (Flutter)
  - Secondary: PostgreSQL, Stripe API, SendGrid Email
```

---

### EDGE_CASES: Tricky Scenarios and Deep Internals
#### Edge Case 1: Anemic Domain Model (Anti-Pattern)

**Problem**: Domain models are just data containers with no behavior. All logic in services.

**Naive Code**:
```cpp
// ❌ Anemic Domain Model
struct Order {
    int id;
    double total;
    std::string status;
    // No methods! Just data!
};

// All logic in service
class OrderService {
    void cancelOrder(Order& order) {
        // Business logic in service, not in domain model
        if (order.status == "completed") {
            throw std::logic_error("Can't cancel completed order");
        }
        order.status = "cancelled";
    }
};
```

**Why It's Bad**:
- **Not object-oriented**: Objects should have behavior, not just data
- **Logic scattered**: Business rules spread across many services
- **Hard to maintain**: No single source of truth

**Solution: Rich Domain Model**

```cpp
// ✅ Rich Domain Model
class Order {
    int id;
    double total;
    std::string status;

public:
    // Business logic IN the domain model
    void cancel() {
        if (status == "completed") {
            throw std::logic_error("Can't cancel completed order");
        }
        status = "cancelled";
    }

    void confirm() {
        if (status != "pending") {
            throw std::logic_error("Can only confirm pending orders");
        }
        status = "completed";
    }

    bool canBeCancelled() const {
        return status == "pending" || status == "processing";
    }

    // Encapsulate state
    std::string getStatus() const { return status; }
};

// Service is thin, delegates to domain model
class OrderService {
    IOrderRepository* repository;

public:
    void cancelOrder(int orderId) {
        Order order = repository->getById(orderId);
        order.cancel();  // ← Domain model handles business logic
        repository->save(order);
    }
};
```

**Lesson**: Put business logic **in domain models**, not services. Services coordinate, models encapsulate behavior.

---

#### Edge Case 2: Port Proliferation (Too Many Interfaces)

**Problem**: Creating an interface for EVERY class leads to unnecessary complexity.

**Naive Code**:
```cpp
// ❌ Interface for everything
class IOrderValidator {
    virtual bool validate(const Order& order) = 0;
};

class IOrderPriceCalculator {
    virtual double calculate(const Order& order) = 0;
};

class IOrderStatusChecker {
    virtual bool canConfirm(const Order& order) = 0;
};

// ... 50 more interfaces!
```

**Why It's Bad**:
- **Over-engineering**: Too many abstractions
- **Hard to understand**: Need to track many interfaces
- **No real benefit**: If only one implementation, interface adds no value

**Solution: Create Ports Only for External Dependencies**

```cpp
// ✅ Interfaces ONLY for external dependencies
class IOrderRepository {  // ← External (database)
    virtual void save(const Order& order) = 0;
    virtual Order getById(int id) = 0;
};

class IPaymentGateway {  // ← External (payment service)
    virtual void charge(const PaymentInfo& payment, double amount) = 0;
};

// Internal logic: NO interface needed
class OrderValidator {  // ← Internal, no interface
    bool validate(const Order& order) {
        return order.getTotal() > 0 && !order.getItems().empty();
    }
};
```

**Rule of Thumb**:
- **Create interface** if:
  - External dependency (database, API, file system)
  - Multiple implementations (MySQL, Postgres, InMemory)
  - Need to mock for testing

- **Skip interface** if:
  - Pure business logic
  - Only one implementation
  - Internal utility

**Lesson**: **Don't over-abstract.** Create ports for external dependencies, not internal logic.

---

#### Edge Case 3: Adapter Leaking to Core

**Problem**: Domain models depend on adapter-specific types (e.g., DTO classes).

**Naive Code**:
```cpp
// DTO from Web Framework
struct UserDTO {  // ← Part of web adapter
    std::string json_name;  // JSON field
    std::string json_email;
};

// ❌ Domain model depends on adapter type!
class User {
    UserDTO dto;  // ← WRONG! Core depends on adapter

public:
    std::string getName() { return dto.json_name; }
};
```

**Why It's Bad**:
- **Coupling**: Core depends on web framework
- **Can't test**: Need web framework to test domain
- **Can't swap**: Changing web framework requires changing domain

**Solution: Use Domain Types, Transform in Adapter**

```cpp
// ✅ Domain model uses pure domain types
class User {
    std::string name;
    std::string email;

public:
    User(const std::string& n, const std::string& e) : name(n), email(e) {}

    std::string getName() const { return name; }
    std::string getEmail() const { return email; }
};

// Adapter transforms DTO → Domain
class UserController {
    User toDomain(const UserDTO& dto) {
        return User(dto.json_name, dto.json_email);
    }

    void handleCreateUser(HttpRequest request) {
        UserDTO dto = parseJSON(request.body);
        User user = toDomain(dto);  // ← Transform in adapter!

        userService->createUser(user);
    }
};
```

**Lesson**: **Core should NEVER depend on adapter types.** Transform in adapters.

---

#### Edge Case 4: Database Entities vs Domain Entities

**Problem**: Using ORM entities (with annotations) as domain models.

**Naive Code**:
```cpp
// ❌ Domain model with ORM annotations
@Entity  // ← ORM annotation
@Table(name = "users")
class User {
    @Id  // ← ORM annotation
    @GeneratedValue
    int id;

    @Column(name = "user_name")
    std::string name;

    // Domain logic mixed with ORM concerns
    void changeName(const std::string& newName) {
        name = newName;
    }
};
```

**Why It's Bad**:
- **Coupling**: Domain depends on ORM framework
- **Pollution**: Domain model cluttered with annotations
- **Hard to test**: Need ORM to test domain logic

**Solution: Separate Domain Model from Persistence Model**

```cpp
// ✅ Pure Domain Model (no annotations)
class User {
    int id;
    std::string name;
    std::string email;

public:
    User(int id, const std::string& name, const std::string& email)
        : id(id), name(name), email(email) {}

    void changeName(const std::string& newName) {
        if (newName.empty()) {
            throw std::invalid_argument("Name cannot be empty");
        }
        name = newName;
    }

    int getId() const { return id; }
    std::string getName() const { return name; }
    std::string getEmail() const { return email; }
};

// Persistence Model (in adapter)
struct UserEntity {  // ← ORM entity
    int id;
    std::string db_name;  // Database column name
    std::string db_email;
};

// Adapter maps between domain and persistence
class UserRepository : public IUserRepository {
    User toDomain(const UserEntity& entity) {
        return User(entity.id, entity.db_name, entity.db_email);
    }

    UserEntity toEntity(const User& user) {
        UserEntity entity;
        entity.id = user.getId();
        entity.db_name = user.getName();
        entity.db_email = user.getEmail();
        return entity;
    }

    User getById(int id) override {
        UserEntity entity = orm.find<UserEntity>(id);
        return toDomain(entity);  // ← Map to domain
    }

    void save(const User& user) override {
        UserEntity entity = toEntity(user);  // ← Map to persistence
        orm.save(entity);
    }
};
```

**Lesson**: **Separate domain models from persistence models.** Map in adapter.

---

#### Edge Case 5: Too Many Layers (Over-Engineering)

**Problem**: Adding too many abstraction layers makes code hard to follow.

**Naive Code**:
```cpp
// ❌ Too many layers
Controller → UseCase → Service → Domain → Repository → ORM → Database

// For a simple operation:
userController.getUser(id)
    → getUserUseCase.execute(id)
        → userService.findUser(id)
            → userDomain.load(id)
                → userRepository.get(id)
                    → ormMapper.query(id)
                        → database.select(id)

// 7 layers for one query!
```

**Why It's Bad**:
- **Complexity**: Hard to trace execution flow
- **Verbose**: Simple operations require many classes
- **Performance**: Many function calls

**Solution: Balance Abstraction with Simplicity**

```cpp
// ✅ Pragmatic layering
Controller → Service (Use Case) → Repository → Database

userController.getUser(id)
    → userService.getUser(id)  // ← Combines use case + domain logic
        → userRepository.getById(id)
            → database.query(id)

// 3 layers - clear and maintainable
```

**Guidelines**:
- Use **3-4 layers** for most applications:
  - Controller (Primary Adapter)
  - Service (Business Logic + Use Cases)
  - Repository (Secondary Adapter)
  - Database

- Add more layers ONLY if needed:
  - Separate Use Case layer if use cases are complex
  - Separate Domain layer if rich domain models

**Lesson**: **Don't over-engineer.** Use Hexagonal principles without excessive layering.

---

#### Edge Case 6: Testing with Mocks vs Real Adapters

**Problem**: Should tests use mocks or real adapters (e.g., in-memory database)?

**Approach 1: Mocks (Fast, Isolated)**

```cpp
// Mock Repository
class MockUserRepository : public IUserRepository {
public:
    bool saveCalled = false;
    User savedUser;

    void save(const User& user) override {
        saveCalled = true;
        savedUser = user;
    }

    User getById(int id) override {
        return User(1, "Alice", "alice@example.com");
    }
};

// Test
void testCreateUser() {
    MockUserRepository mockRepo;
    UserService service(&mockRepo);

    service.createUser("Bob", "bob@example.com");

    assert(mockRepo.saveCalled);  // ✅ Verify mock was called
    assert(mockRepo.savedUser.getName() == "Bob");
}
```

**Pros**: Fast, isolated, no external dependencies
**Cons**: Tests mock behavior, not real implementation

---

**Approach 2: Real In-Memory Adapter (Integration-Like)**

```cpp
// In-Memory Repository (real implementation)
class InMemoryUserRepository : public IUserRepository {
    std::map<int, User> users;
    int nextId = 1;

public:
    void save(const User& user) override {
        users[nextId++] = user;
    }

    User getById(int id) override {
        return users.at(id);
    }
};

// Test
void testCreateUser() {
    InMemoryUserRepository realRepo;
    UserService service(&realRepo);

    service.createUser("Bob", "bob@example.com");

    User retrieved = realRepo.getById(1);
    assert(retrieved.getName() == "Bob");  // ✅ Verify actual save/retrieve
}
```

**Pros**: Tests real behavior, catches more bugs
**Cons**: Slower, more complex

---

**Best Practice**: **Use BOTH**

1. **Unit Tests**: Use mocks for fast, isolated tests
2. **Integration Tests**: Use in-memory adapters for end-to-end tests

**Lesson**: **Test business logic with mocks, integration with real adapters.**

---

### CODE_EXAMPLES: Practical Demonstrations
#### Example 1: Simple Hexagonal Architecture

**Goal**: Implement Order Service with hexagonal architecture.

```cpp
#include <iostream>
#include <string>
#include <map>
#include <memory>

// ═══════════════════════════════════════════════════════════════
//  DOMAIN MODEL (Core)
// ═══════════════════════════════════════════════════════════════

class Order {
    int id;
    double total;
    std::string status;  // "pending", "completed", "cancelled"

public:
    Order(int id, double total) : id(id), total(total), status("pending") {}

    // Business logic in domain model
    void confirm() {
        if (status != "pending") {
            throw std::logic_error("Can only confirm pending orders");
        }
        status = "completed";
    }

    void cancel() {
        if (status == "completed") {
            throw std::logic_error("Can't cancel completed order");
        }
        status = "cancelled";
    }

    // Getters
    int getId() const { return id; }
    double getTotal() const { return total; }
    std::string getStatus() const { return status; }
};

// ═══════════════════════════════════════════════════════════════
//  SECONDARY PORTS (Interfaces for external dependencies)
// ═══════════════════════════════════════════════════════════════

class IOrderRepository {
public:
    virtual void save(const Order& order) = 0;
    virtual Order getById(int id) = 0;
    virtual ~IOrderRepository() = default;
};

class IPaymentGateway {
public:
    virtual void charge(double amount) = 0;
    virtual ~IPaymentGateway() = default;
};

// ═══════════════════════════════════════════════════════════════
//  BUSINESS LOGIC (Core)
// ═══════════════════════════════════════════════════════════════

class OrderService {
    IOrderRepository* repository;
    IPaymentGateway* paymentGateway;

public:
    OrderService(IOrderRepository* repo, IPaymentGateway* payment)
        : repository(repo), paymentGateway(payment) {}

    void placeOrder(int orderId, double total) {
        std::cout << "\n[CORE] Placing order...\n";

        // Business rule: Validate total
        if (total <= 0) {
            throw std::invalid_argument("Order total must be positive");
        }

        // Create order
        Order order(orderId, total);

        // Business rule: Charge payment
        std::cout << "[CORE] Charging payment: $" << total << "\n";
        paymentGateway->charge(total);

        // Business rule: Confirm order
        order.confirm();

        // Save order
        repository->save(order);

        std::cout << "[CORE] Order placed successfully! Status: " << order.getStatus() << "\n";
    }

    void cancelOrder(int orderId) {
        std::cout << "\n[CORE] Cancelling order...\n";

        Order order = repository->getById(orderId);
        order.cancel();  // ← Business logic in domain model
        repository->save(order);

        std::cout << "[CORE] Order cancelled. Status: " << order.getStatus() << "\n";
    }
};

// ═══════════════════════════════════════════════════════════════
//  SECONDARY ADAPTERS (Implementations)
// ═══════════════════════════════════════════════════════════════

class InMemoryOrderRepository : public IOrderRepository {
    std::map<int, Order> orders;

public:
    void save(const Order& order) override {
        std::cout << "  [ADAPTER] Saving order ID " << order.getId() << " to database\n";
        orders[order.getId()] = order;
    }

    Order getById(int id) override {
        std::cout << "  [ADAPTER] Loading order ID " << id << " from database\n";
        return orders.at(id);
    }
};

class MockPaymentGateway : public IPaymentGateway {
public:
    void charge(double amount) override {
        std::cout << "  [ADAPTER] Charging $" << amount << " via payment gateway\n";
        // Simulate payment processing
    }
};

// ═══════════════════════════════════════════════════════════════
//  PRIMARY ADAPTER (API Controller)
// ═══════════════════════════════════════════════════════════════

class OrderController {
    OrderService* orderService;

public:
    OrderController(OrderService* service) : orderService(service) {}

    void handlePlaceOrder(int orderId, double total) {
        std::cout << "\n╔═══════════════════════════════════════╗\n";
        std::cout << "║  HTTP POST /orders                    ║\n";
        std::cout << "╚═══════════════════════════════════════╝\n";

        try {
            orderService->placeOrder(orderId, total);
            std::cout << "\n[CONTROLLER] HTTP 200 OK: Order created\n";
        } catch (std::exception& e) {
            std::cout << "\n[CONTROLLER] HTTP 400 Error: " << e.what() << "\n";
        }
    }

    void handleCancelOrder(int orderId) {
        std::cout << "\n╔═══════════════════════════════════════╗\n";
        std::cout << "║  HTTP DELETE /orders/" << orderId << "              ║\n";
        std::cout << "╚═══════════════════════════════════════╝\n";

        try {
            orderService->cancelOrder(orderId);
            std::cout << "\n[CONTROLLER] HTTP 200 OK: Order cancelled\n";
        } catch (std::exception& e) {
            std::cout << "\n[CONTROLLER] HTTP 400 Error: " << e.what() << "\n";
        }
    }
};

// ═══════════════════════════════════════════════════════════════
//  MAIN (Application Composition Root)
// ═══════════════════════════════════════════════════════════════

int main() {
    std::cout << "═══════════════════════════════════════════════════\n";
    std::cout << "  Hexagonal Architecture Example                    \n";
    std::cout << "═══════════════════════════════════════════════════\n";

    // Create adapters
    InMemoryOrderRepository repository;
    MockPaymentGateway paymentGateway;

    // Inject dependencies into core
    OrderService orderService(&repository, &paymentGateway);

    // Create primary adapter (controller)
    OrderController controller(&orderService);

    // Simulate HTTP requests
    controller.handlePlaceOrder(1, 99.99);
    controller.handleCancelOrder(1);

    std::cout << "\n═══════════════════════════════════════════════════\n";
    std::cout << "  KEY POINTS:                                        \n";
    std::cout << "  1. Core (OrderService) depends on interfaces       \n";
    std::cout << "  2. Adapters implement interfaces                   \n";
    std::cout << "  3. Can swap adapters (InMemory → MySQL)            \n";
    std::cout << "  4. Can test with mocks (no database needed)        \n";
    std::cout << "═══════════════════════════════════════════════════\n";

    return 0;
}
```

**Output**:
```
═══════════════════════════════════════════════════
  Hexagonal Architecture Example
═══════════════════════════════════════════════════

╔═══════════════════════════════════════╗
║  HTTP POST /orders                    ║
╚═══════════════════════════════════════╝

[CORE] Placing order...
[CORE] Charging payment: $99.99
  [ADAPTER] Charging $99.99 via payment gateway
  [ADAPTER] Saving order ID 1 to database
[CORE] Order placed successfully! Status: completed

[CONTROLLER] HTTP 200 OK: Order created

╔═══════════════════════════════════════╗
║  HTTP DELETE /orders/1                ║
╚═══════════════════════════════════════╝

[CORE] Cancelling order...
  [ADAPTER] Loading order ID 1 from database
  [ADAPTER] Saving order ID 1 to database
[CORE] Order cancelled. Status: cancelled

[CONTROLLER] HTTP 200 OK: Order cancelled
```

---

#### Example 2-8: Additional Examples (Outlined)

**Example 2**: Testing with Mocks (Unit tests for business logic)

**Example 3**: Multiple Adapters (InMemory, MySQL, PostgreSQL repositories)

**Example 4**: Rich Domain Model (Business logic in entities)

**Example 5**: Use Case Layer (Separate use cases from domain)

**Example 6**: CLI and Web adapters (Multiple primary adapters)

**Example 7**: Event-Driven Hexagonal (Domain events + event handlers)

**Example 8**: Complete E-Commerce (Orders, Products, Payments with hexagonal)

---

### INTERVIEW_QA: Comprehensive Questions and Answers
#### Q1: What is the main difference between Hexagonal Architecture and Layered Architecture?

**Answer**:

| Aspect | Layered | Hexagonal |
|--------|---------|-----------|
| **Dependency Direction** | Top → Bottom (UI → Business → Data) | Outside → Inside (Adapters → Core) |
| **Core Dependency** | Business layer depends on Data layer | Core depends on **interfaces (ports)** |
| **Testability** | Hard (need database) | Easy (use mocks/in-memory) |
| **Framework Coupling** | Often coupled | Framework-independent |

**Key Difference**: In Hexagonal, **core has no dependencies** on external concerns. Everything depends on core through interfaces.

---

#### Q2: What are "Ports" and "Adapters"?

**Answer**:

**Ports**: **Interfaces** that define how to interact with business logic.
- **Primary Ports**: How external world uses your app (e.g., `IOrderService`)
- **Secondary Ports**: How app uses external systems (e.g., `IOrderRepository`)

**Adapters**: **Implementations** of ports that handle technology details.
- **Primary Adapters**: Translate external requests (e.g., REST Controller)
- **Secondary Adapters**: Implement external interactions (e.g., MySQL Repository)

**Example**:
```cpp
// Port (interface)
class IOrderRepository {
    virtual void save(const Order& order) = 0;
};

// Adapters (implementations)
class MySQLAdapter : public IOrderRepository { /* ... */ };
class PostgresAdapter : public IOrderRepository { /* ... */ };
class InMemoryAdapter : public IOrderRepository { /* ... */ };
```

---

#### Q3: How do you test business logic in Hexagonal Architecture?

**Answer**:

**Use Mock Adapters** for unit tests:

```cpp
// Mock Repository
class MockOrderRepository : public IOrderRepository {
public:
    bool saveCalled = false;
    Order savedOrder;

    void save(const Order& order) override {
        saveCalled = true;
        savedOrder = order;
    }
};

// Test
void testPlaceOrder() {
    MockOrderRepository mockRepo;
    MockPaymentGateway mockPayment;
    OrderService service(&mockRepo, &mockPayment);

    service.placeOrder(1, 99.99);

    assert(mockRepo.saveCalled);  // ✅ No real database needed!
    assert(mockRepo.savedOrder.getTotal() == 99.99);
}
```

**Use In-Memory Adapters** for integration tests:

```cpp
InMemoryOrderRepository realRepo;  // Real implementation, no database
OrderService service(&realRepo, &mockPayment);

service.placeOrder(1, 99.99);

Order retrieved = realRepo.getById(1);
assert(retrieved.getTotal() == 99.99);  // ✅ Tests real behavior
```

---

#### Q4: What is the "Dependency Inversion Principle" in Hexagonal Architecture?

**Answer**:

**Dependency Inversion Principle** (from SOLID): High-level modules should not depend on low-level modules. Both should depend on abstractions.

**Without DIP** (Traditional Layered):
```cpp
// Business layer depends on concrete Data layer
class OrderService {
    MySQLOrderRepository repository;  // ← Depends on concrete class
};
```

**With DIP** (Hexagonal):
```cpp
// Business layer depends on abstraction (port)
class OrderService {
    IOrderRepository* repository;  // ← Depends on interface
};

// Data layer implements abstraction
class MySQLOrderRepository : public IOrderRepository { /* ... */ };
```

**Key**: Business logic (high-level) doesn't depend on infrastructure (low-level). Both depend on interface (abstraction).

---

#### Q5: When should you NOT use Hexagonal Architecture?

**Answer**:

**Don't use when**:
1. **Simple CRUD app** (overkill for basic operations)
2. **Prototype/throwaway code** (too much upfront design)
3. **Small project** (< 1000 lines) - overhead too high
4. **Tight deadline** - hexagonal adds initial complexity
5. **Team unfamiliar** - steep learning curve

**Example**: Todo list app with 3 endpoints → Use simple layered architecture!

**Golden Rule**: Use hexagonal for **complex business logic** and **long-lived projects**.

---

#### Additional Questions 6-20 (Outlined)

**Q6**: What is an "Anemic Domain Model"? Why is it an anti-pattern?

**Q7**: Should you create a port (interface) for every class?

**Q8**: How do you prevent adapters from leaking into the core?

**Q9**: What is the difference between Hexagonal and Clean Architecture?

**Q10**: How do you handle database transactions in Hexagonal Architecture?

**Q11**: Should domain models have ORM annotations?

**Q12**: How many layers should a hexagonal application have?

**Q13**: What is a "Use Case" in hexagonal architecture?

**Q14**: How do you handle cross-cutting concerns (logging, security)?

**Q15**: Can you use hexagonal architecture with microservices?

**Q16**: What is the "Composition Root" pattern?

**Q17**: How do you handle domain events in hexagonal architecture?

**Q18**: What is the difference between Primary and Secondary Adapters?

**Q19**: How do you version APIs in hexagonal architecture?

**Q20**: Compare hexagonal architecture to DDD (Domain-Driven Design).

---

### PRACTICE_TASKS: Output Prediction and Code Analysis
#### Q1

**Goal**: Create User Service with hexagonal architecture.

**Requirements**:
1. Domain: `User` class with business logic
2. Port: `IUserRepository` interface
3. Core: `UserService` with business rules
4. Adapter: `InMemoryUserRepository`
5. Primary Adapter: `UserController` (simulated REST)

---

#### Q2

**Goal**: Implement 3 different repository adapters for same port.

**Requirements**:
1. `IOrderRepository` interface
2. `InMemoryOrderRepository`
3. `MySQLOrderRepository` (simulated with map)
4. `FileOrderRepository` (simulated with map)
5. Swap adapters at runtime

---

#### Q3

**Goal**: Write unit tests using mock adapters.

**Requirements**:
1. `MockUserRepository` that tracks method calls
2. Test `UserService.createUser()` without real database
3. Verify `save()` was called
4. Verify business rules (age validation, email format)

---

#### Q4

**Goal**: Move business logic from service to domain model.

**Requirements**:
1. Start with anemic `Order` (just data)
2. Move validation to `Order.validate()`
3. Move state transitions to `Order.confirm()`, `Order.cancel()`
4. Service becomes thin coordinator

---

#### Q5

**Goal**: Implement multiple primary adapters for same core.

**Requirements**:
1. Core: `OrderService`
2. Primary Adapter 1: `RESTController` (simulated HTTP)
3. Primary Adapter 2: `CLIController` (command-line)
4. Both use same `OrderService`

---

#### Task 6: Use Case Layer

**Goal**: Separate use cases from domain logic.

**Requirements**:
1. Use Case: `PlaceOrderUseCase`
2. Use Case: `CancelOrderUseCase`
3. Domain: `Order`, `Payment`, `Product`
4. Use cases orchestrate domain objects

---

#### Task 7: Domain Events

**Goal**: Implement event-driven hexagonal architecture.

**Requirements**:
1. Domain: `User` publishes `UserRegistered` event
2. Event Handler: `SendWelcomeEmailHandler`
3. Event Bus: `IEventBus` interface
4. In-Memory Event Bus adapter

---

#### Task 8: Separate Domain from Persistence Models

**Goal**: Map between domain and database entities.

**Requirements**:
1. Domain: `User` (pure business logic)
2. Persistence: `UserEntity` (ORM annotations)
3. Mapper: `UserMapper` in repository adapter
4. `UserRepository` maps between them

---

#### Task 9: Integration Test with Real Adapter

**Goal**: Test with in-memory database adapter (integration-like test).

**Requirements**:
1. `InMemoryOrderRepository` (full implementation)
2. Test full flow: create order → retrieve → update → delete
3. Verify data persists correctly

---

#### Task 10: Cross-Cutting Concerns

**Goal**: Add logging without coupling to core.

**Requirements**:
1. `LoggingDecorator` wraps `OrderService`
2. Logs method calls and results
3. Core remains unaware of logging

---

#### Task 11-20: Additional Tasks (Outlined)

**Task 11**: Implement transaction management

**Task 12**: Add authentication/authorization adapter

**Task 13**: Implement dependency injection container

**Task 14**: Create API Gateway as primary adapter

**Task 15**: Implement CQRS (separate read/write ports)

**Task 16**: Add caching adapter

**Task 17**: Implement saga pattern for distributed transactions

**Task 18**: Create monitoring/metrics adapter

**Task 19**: Implement rate limiting adapter

**Task 20**: Build complete e-commerce system with hexagonal architecture

---

### QUICK_REFERENCE: Key Takeaways and Comparison Tables
#### Hexagonal Architecture Structure

```
                    Primary Adapters
                    (REST, CLI, GUI)
                            ↓
                    Primary Ports
                    (IOrderService)
                            ↓
        ┌───────────────────────────────────────┐
        │                                       │
        │        BUSINESS LOGIC CORE            │
        │        (Domain Models, Use Cases)     │
        │                                       │
        └───────────────────────────────────────┘
                            ↓
                    Secondary Ports
                    (IOrderRepository, IPaymentGateway)
                            ↓
                    Secondary Adapters
                    (MySQL, Stripe, SendGrid)
```

---

#### Key Concepts

| Concept | Definition |
|---------|------------|
| **Port** | Interface defining interaction with core |
| **Adapter** | Implementation of port (handles technology) |
| **Primary Port** | How external world uses your app |
| **Secondary Port** | How your app uses external systems |
| **Core** | Business logic, framework-independent |

---

#### Dependency Rule

**Outside → Inside**: Adapters depend on Core, Core never depends on Adapters.

```
Adapters → Ports (Interfaces) → Core
(outside)                        (inside)
```

---

#### When to Use

| **Use** | **Don't Use** |
|---------|---------------|
| ✅ Complex business logic | ❌ Simple CRUD |
| ✅ Long-lived project | ❌ Prototype |
| ✅ Need to swap implementations | ❌ Small project |
| ✅ High testability | ❌ Tight deadline |

---

#### Benefits

- ✅ **Testability**: Mock adapters, no database needed
- ✅ **Flexibility**: Swap adapters (MySQL → Postgres)
- ✅ **Independence**: Core doesn't depend on frameworks
- ✅ **Maintainability**: Changes to infrastructure don't affect core

---

#### Code Template

```cpp
// Port (Interface)
class IOrderRepository {
public:
    virtual void save(const Order& order) = 0;
    virtual ~IOrderRepository() = default;
};

// Core (Business Logic)
class OrderService {
    IOrderRepository* repository;  // Depends on interface

public:
    OrderService(IOrderRepository* repo) : repository(repo) {}

    void placeOrder(Order order) {
        // Business logic
        repository->save(order);
    }
};

// Adapter (Implementation)
class MySQLOrderRepository : public IOrderRepository {
    void save(const Order& order) override {
        // MySQL-specific code
    }
};

// Composition Root (Main)
int main() {
    MySQLOrderRepository adapter;
    OrderService service(&adapter);  // Inject dependency
    service.placeOrder(order);
}
```

---

