# Topic 6: Microservices Architecture

### THEORY_SECTION: Core Concepts and Foundations
#### What is Microservices Architecture?

**Microservices Architecture** is a design pattern where you build an application as a **collection of small, independent services** that each run in their own process and communicate over a network (usually HTTP/REST or message queues).

**Key Idea**: Instead of one big application (monolith), break it into many small services, each doing ONE thing well.

---

#### Simple Explanation: City vs Village Analogy

| Monolithic (Village) | Microservices (City) |
|----------------------|----------------------|
| **One general store** sells everything | **Specialized shops**: bakery, butcher, pharmacy |
| Everyone goes to same place | Each shop focuses on ONE thing |
| If store closes, village has nothing | If bakery closes, butcher still works |
| Hard to expand (need bigger building) | Easy to expand (add more shops) |
| One owner manages everything | Each shop has own owner |

**Microservices**: Like a city with specialized shops instead of one store handling everything.

---

#### Monolithic vs Microservices

#### Monolithic Application

```
┌─────────────────────────────────────────┐
│         One Big Application             │
│                                         │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐│
│  │  Users  │  │Products │  │ Orders  ││
│  │ Module  │  │ Module  │  │ Module  ││
│  └─────────┘  └─────────┘  └─────────┘│
│                                         │
│         All in one codebase             │
│         One database                    │
│         Deployed together               │
└─────────────────────────────────────────┘
```

**Problems**:
- ❌ **Can't scale independently** (must scale entire app)
- ❌ **One bug can crash everything**
- ❌ **Long deployment times** (entire app must be redeployed)
- ❌ **Technology lock-in** (entire app uses same language/framework)
- ❌ **Large codebase** (hard to understand)

---

#### Microservices Application

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   User      │    │  Product    │    │   Order     │
│  Service    │    │  Service    │    │  Service    │
│             │    │             │    │             │
│  Port 8001  │    │  Port 8002  │    │  Port 8003  │
│             │    │             │    │             │
│  User DB    │    │ Product DB  │    │  Order DB   │
└─────────────┘    └─────────────┘    └─────────────┘
       ↑                  ↑                   ↑
       └──────────────────┴───────────────────┘
                          │
                   HTTP REST / Message Queue
```

**Benefits**:
- ✅ **Scale independently** (scale only Order Service if needed)
- ✅ **Fault isolation** (if User Service crashes, Product Service still works)
- ✅ **Fast deployment** (deploy only changed service)
- ✅ **Technology diversity** (User Service in C++, Order Service in Python)
- ✅ **Small, manageable codebases**

---

#### Microservices Characteristics

#### 1. Single Responsibility

Each service does **ONE thing well**.

```
✅ GOOD:
- UserService: Handles user authentication and profiles
- OrderService: Handles order creation and tracking
- PaymentService: Handles payment processing

❌ BAD:
- BackendService: Handles users, orders, payments, products, shipping... (monolith!)
```

---

#### 2. Independent Deployment

Each service can be **deployed independently** without affecting others.

```
Scenario: Fix bug in User Service
Monolith: Deploy ENTIRE application (risk to all features)
Microservices: Deploy ONLY User Service (no risk to Orders, Products, etc.)
```

---

#### 3. Decentralized Data

Each service has its **own database** (no shared database!).

```
┌─────────────┐         ┌─────────────┐
│   User      │         │   Order     │
│  Service    │         │  Service    │
│             │         │             │
│  ┌───────┐  │         │  ┌───────┐  │
│  │User DB│  │         │  │OrderDB│  │
│  └───────┘  │         │  └───────┘  │
└─────────────┘         └─────────────┘

❌ NOT like this:
┌─────────────┐         ┌─────────────┐
│   User      │         │   Order     │
│  Service    │         │  Service    │
└─────────────┘         └─────────────┘
       ↓                       ↓
       └───────┬───────────────┘
            ┌──┴────┐
            │Shared │
            │  DB   │  ← WRONG! Creates coupling
            └───────┘
```

**Why?** Each service can change its database schema without affecting others.

---

#### 4. Communicate via APIs

Services talk to each other over **network** (HTTP REST, gRPC, message queues).

```cpp
// User Service wants to get order history
// ❌ WRONG: Direct database access
OrderDatabase::query("SELECT * FROM orders WHERE user_id = " + userId);

// ✅ CORRECT: Call Order Service API
auto response = httpClient.get("http://order-service:8003/api/orders?userId=" + userId);
```

---

#### Communication Patterns

#### 1. Synchronous (HTTP/REST)

**Request-Response**: Client waits for response.

```
User Service                     Order Service
    │                                 │
    │  GET /orders?userId=123         │
    │────────────────────────────────>│
    │                                 │
    │        [200 OK] {orders: [...]} │
    │<────────────────────────────────│
    │                                 │
```

**Pros**: Simple, immediate response
**Cons**: Slow if service down, tight coupling

**Example**:
```cpp
std::string getUserOrders(int userId) {
    // HTTP call to Order Service
    HttpClient client;
    auto response = client.get("http://order-service/api/orders?userId=" + std::to_string(userId));
    return response.body();
}
```

---

#### 2. Asynchronous (Message Queue)

**Publish-Subscribe**: Fire and forget, don't wait.

```
User Service                   Message Queue              Order Service
    │                               │                          │
    │  Publish: UserRegistered      │                          │
    │──────────────────────────────>│                          │
    │                               │                          │
    │  (doesn't wait)               │    Subscribe & Process   │
    │                               │─────────────────────────>│
    │                               │                          │
```

**Pros**: Fast (no waiting), loose coupling
**Cons**: Eventual consistency, harder to debug

**Example**:
```cpp
void registerUser(const User& user) {
    // Save user locally
    userRepository.save(user);

    // Publish event (don't wait for response)
    messageQueue.publish("UserRegistered", {
        {"userId", user.id},
        {"email", user.email}
    });

    // Other services (Email Service, Analytics Service) will receive event
}
```

---

#### API Gateway Pattern

**Problem**: Client needs to call multiple services → many network calls, complex client code.

```
Mobile App
    │
    ├─> User Service
    ├─> Order Service
    ├─> Product Service
    └─> Payment Service

4 network calls! Slow! Complex!
```

**Solution**: API Gateway acts as single entry point.

```
Mobile App
    │
    └─> API Gateway
            │
            ├─> User Service
            ├─> Order Service
            ├─> Product Service
            └─> Payment Service

1 network call! Fast! Simple!
```

**API Gateway Responsibilities**:
- **Routing**: Forward requests to correct service
- **Aggregation**: Combine responses from multiple services
- **Authentication**: Check user credentials once
- **Rate limiting**: Prevent abuse

**Example**:
```cpp
class APIGateway {
public:
    Response handleRequest(Request request) {
        // Authenticate
        if (!authService.verify(request.token)) {
            return Response{401, "Unauthorized"};
        }

        // Route to service
        if (request.path == "/api/users") {
            return forwardTo("user-service", request);
        } else if (request.path == "/api/orders") {
            return forwardTo("order-service", request);
        }

        return Response{404, "Not Found"};
    }

private:
    Response forwardTo(const std::string& serviceName, Request request) {
        std::string serviceURL = serviceDiscovery.getURL(serviceName);
        return httpClient.request(serviceURL, request);
    }
};
```

---

#### Service Discovery

**Problem**: Services don't know where other services are (IP addresses change).

**Solution**: Service Registry keeps track of all services.

```
┌─────────────────────────────────────────┐
│        Service Registry                 │
│  (Consul, Eureka, etcd)                 │
│                                         │
│  user-service:    192.168.1.10:8001    │
│  order-service:   192.168.1.11:8002    │
│  product-service: 192.168.1.12:8003    │
└─────────────────────────────────────────┘
         ↑                    ↑
         │ register           │ lookup
         │                    │
┌────────┴────────┐    ┌─────┴────────┐
│  User Service   │    │ Order Service│
│                 │    │              │
│ On startup:     │    │ Want to call │
│ "I'm at :8001!" │    │ User Service │
└─────────────────┘    └──────────────┘
```

**Flow**:
1. Service starts → **registers** with registry ("I'm User Service at 192.168.1.10:8001")
2. Other service wants to call it → **looks up** registry ("Where is User Service?")
3. Registry responds: "User Service is at 192.168.1.10:8001"

**Example**:
```cpp
class ServiceRegistry {
    std::map<std::string, std::string> services;  // name -> URL

public:
    void register(const std::string& serviceName, const std::string& url) {
        services[serviceName] = url;
        std::cout << serviceName << " registered at " << url << "\n";
    }

    std::string lookup(const std::string& serviceName) {
        if (services.find(serviceName) != services.end()) {
            return services[serviceName];
        }
        throw std::runtime_error("Service not found: " + serviceName);
    }
};

// User Service on startup
void main() {
    ServiceRegistry registry;
    registry.register("user-service", "http://192.168.1.10:8001");

    // Start server...
}

// Order Service wants to call User Service
std::string callUserService(int userId) {
    std::string url = registry.lookup("user-service");
    return httpClient.get(url + "/api/users/" + std::to_string(userId));
}
```

---

#### When to Use Microservices

| **Use When** | **Don't Use When** |
|--------------|-------------------|
| ✅ Large teams (50+ developers) | ❌ Small team (< 5 people) |
| ✅ Need independent scaling | ❌ Simple CRUD application |
| ✅ Different tech stacks needed | ❌ Startup (rapid changes, unclear boundaries) |
| ✅ High availability critical | ❌ Limited DevOps resources |
| ✅ Clear domain boundaries | ❌ Tightly coupled features |

**Golden Rule**: **Start with a monolith, split into microservices when you NEED to.**

---

#### Benefits vs Challenges

| Benefits | Challenges |
|----------|-----------|
| ✅ Independent scaling | ❌ Distributed system complexity |
| ✅ Technology diversity | ❌ Network latency and failures |
| ✅ Fault isolation | ❌ Debugging is harder |
| ✅ Faster deployment | ❌ Data consistency issues |
| ✅ Team autonomy | ❌ Need DevOps expertise |

---

#### Real-World Examples

**Netflix**:
- 700+ microservices
- Each service owns its data
- Polyglot architecture (Java, Node.js, Python, Go)
- Handle 200 million+ users

**Amazon**:
- Thousands of microservices
- "Two-pizza teams" (small, autonomous teams)
- Each service < 1000 lines of code

**Uber**:
- 2,200+ microservices
- Services for: routing, pricing, driver matching, payments, etc.
- Each service independently deployable

---

### EDGE_CASES: Tricky Scenarios and Deep Internals
#### Edge Case 1: Distributed Transactions (SAGA Pattern)

**Problem**: Transaction spans multiple services. What if one fails?

**Scenario**: User places order → need to:
1. Reserve inventory (Product Service)
2. Charge credit card (Payment Service)
3. Create order (Order Service)

**Naive Code**:
```cpp
void placeOrder(int userId, int productId, double amount) {
    // Call Service 1
    productService.reserveInventory(productId);

    // Call Service 2
    paymentService.chargeCard(userId, amount);  // ❌ What if this fails?

    // Call Service 3
    orderService.createOrder(userId, productId);

    // If ANY service fails, how to rollback?
}
```

**Why It Fails**:
- Inventory reserved, but payment failed → inventory stuck as reserved!
- No distributed transaction coordinator
- Can't use database ACID transactions (each service has own DB)

**Solution: SAGA Pattern (Choreography)**

Each service publishes events, others react:

```cpp
// Order Service
void placeOrder(int userId, int productId, double amount) {
    Order order = {userId, productId, "PENDING"};
    orderRepository.save(order);

    messageQueue.publish("OrderCreated", {
        {"orderId", order.id},
        {"productId", productId},
        {"amount", amount}
    });
}

// Product Service (listens to OrderCreated)
void onOrderCreated(Event event) {
    try {
        reserveInventory(event.productId);
        messageQueue.publish("InventoryReserved", {
            {"orderId", event.orderId}
        });
    } catch (...) {
        messageQueue.publish("InventoryReservationFailed", {
            {"orderId", event.orderId}
        });
    }
}

// Payment Service (listens to InventoryReserved)
void onInventoryReserved(Event event) {
    try {
        chargeCard(event.userId, event.amount);
        messageQueue.publish("PaymentSucceeded", {
            {"orderId", event.orderId}
        });
    } catch (...) {
        messageQueue.publish("PaymentFailed", {
            {"orderId", event.orderId}
        });
        // Trigger compensation: release inventory
        messageQueue.publish("CompensateInventory", {
            {"productId", event.productId}
        });
    }
}

// Product Service (listens to CompensateInventory)
void onCompensateInventory(Event event) {
    releaseInventory(event.productId);  // Rollback!
}
```

**Alternative: SAGA Orchestrator**

Central orchestrator coordinates:

```cpp
class OrderSagaOrchestrator {
    void executeSaga(OrderRequest request) {
        try {
            // Step 1
            productService.reserveInventory(request.productId);

            // Step 2
            paymentService.chargeCard(request.userId, request.amount);

            // Step 3
            orderService.createOrder(request);

            std::cout << "Order completed successfully!\n";

        } catch (std::exception& e) {
            // Compensate (rollback)
            std::cout << "Order failed, rolling back...\n";
            productService.releaseInventory(request.productId);
            // Payment refund if needed
        }
    }
};
```

**Lesson**: Use **SAGA pattern** for distributed transactions. Either choreography (events) or orchestration (coordinator).

---

#### Edge Case 2: Network Failures (Circuit Breaker Pattern)

**Problem**: Service B is down. Service A keeps calling it → wastes resources, cascading failures.

**Naive Code**:
```cpp
std::string getUserProfile(int userId) {
    try {
        // Order Service is down!
        auto orders = orderService.getOrders(userId);  // ❌ Times out (5 seconds)
        return renderProfile(userId, orders);
    } catch (...) {
        return "Error loading profile";
    }
}

// If 1000 requests come in, all wait 5 seconds → 5000 seconds wasted!
```

**Why It Fails**:
- **Cascading failure**: Service A becomes slow because Service B is down
- **Resource exhaustion**: All threads blocked waiting for timeouts

**Solution: Circuit Breaker Pattern**

Like electrical circuit breaker: if too many failures, "open" circuit (stop calling).

```cpp
class CircuitBreaker {
    enum State { CLOSED, OPEN, HALF_OPEN };

    State state = CLOSED;
    int failureCount = 0;
    int failureThreshold = 5;
    std::chrono::time_point<std::chrono::steady_clock> openedAt;

public:
    template<typename Func>
    auto call(Func func) {
        if (state == OPEN) {
            // Check if should try again
            auto now = std::chrono::steady_clock::now();
            auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(now - openedAt).count();

            if (elapsed < 60) {  // Wait 60 seconds before retrying
                throw std::runtime_error("Circuit breaker OPEN");
            } else {
                state = HALF_OPEN;  // Try one request
            }
        }

        try {
            auto result = func();  // Execute actual call

            // Success!
            if (state == HALF_OPEN) {
                state = CLOSED;  // Circuit recovered
                failureCount = 0;
            }

            return result;

        } catch (...) {
            failureCount++;

            if (failureCount >= failureThreshold) {
                state = OPEN;
                openedAt = std::chrono::steady_clock::now();
                std::cout << "Circuit breaker OPENED\n";
            }

            throw;
        }
    }
};

// Usage
CircuitBreaker orderServiceBreaker;

std::string getUserProfile(int userId) {
    try {
        auto orders = orderServiceBreaker.call([&]() {
            return orderService.getOrders(userId);
        });
        return renderProfile(userId, orders);

    } catch (...) {
        // Circuit open or service down → fallback
        return renderProfile(userId, {});  // Show profile without orders
    }
}
```

**Flow**:
```
State: CLOSED (normal)
  ↓ (5 failures)
State: OPEN (stop calling, return error immediately)
  ↓ (wait 60 seconds)
State: HALF_OPEN (try one request)
  ↓ (success)
State: CLOSED (recovered!)
```

**Lesson**: Use **Circuit Breaker** to prevent cascading failures and resource exhaustion.

---

#### Edge Case 3: Data Consistency (Eventual Consistency)

**Problem**: User Service updates email, but Order Service still has old email (cached or separate DB).

**Scenario**:
```
User updates email → User Service updates user DB
                  → Order Service still has old email in cache
                  → Sends order confirmation to OLD email!
```

**Why It Happens**:
- Each service has its own database
- Data duplication across services
- Network delays in propagating updates

**Solution 1: Event-Driven Updates**

```cpp
// User Service
void updateEmail(int userId, const std::string& newEmail) {
    userRepository.updateEmail(userId, newEmail);

    // Publish event
    messageQueue.publish("UserEmailUpdated", {
        {"userId", userId},
        {"newEmail", newEmail}
    });
}

// Order Service (subscriber)
void onUserEmailUpdated(Event event) {
    // Update local cache/copy
    userCache.updateEmail(event.userId, event.newEmail);
    std::cout << "Order Service: Updated email for user " << event.userId << "\n";
}
```

**Solution 2: Query Master Service**

```cpp
// Order Service ALWAYS queries User Service for latest data
std::string getUserEmail(int userId) {
    auto response = httpClient.get("http://user-service/api/users/" + std::to_string(userId));
    return parseEmail(response);  // Always fresh!
}

void sendOrderConfirmation(int userId, Order order) {
    std::string email = getUserEmail(userId);  // Query User Service
    emailService.send(email, "Order confirmed!");
}
```

**Trade-offs**:
- **Event-driven**: Fast (cached), but eventual consistency
- **Query master**: Slow (network call), but always consistent

**Lesson**: Accept **eventual consistency** or query master service for strong consistency.

---

#### Edge Case 4: Service Dependency Hell

**Problem**: Service A depends on B, B depends on C, C depends on D... circular dependencies!

**Naive Architecture**:
```
User Service → Order Service → User Service  ← Circular!
```

**Why It's Bad**:
- Circular dependencies cause deadlocks
- Hard to deploy (which service first?)
- Tight coupling (not really microservices!)

**Solution 1: Break Circular Dependency**

```
❌ BAD:
User Service ──> Order Service
     ↑                │
     └────────────────┘

✅ GOOD:
User Service
     ↓
Order Service  (no dependency back to User Service)
```

**Solution 2: Use Events (Loose Coupling)**

```cpp
// User Service doesn't call Order Service directly
void registerUser(const User& user) {
    userRepository.save(user);

    messageQueue.publish("UserRegistered", {
        {"userId", user.id}
    });

    // Order Service listens to this event (no direct dependency!)
}

// Order Service
void onUserRegistered(Event event) {
    // Initialize empty order history for new user
    createOrderHistory(event.userId);
}
```

**Solution 3: Shared Kernel (Last Resort)**

```
Create shared library with common models:
  - User model
  - Order model
  - Common utilities

All services depend on shared library (read-only).
```

**Lesson**: **Avoid circular dependencies.** Use events for loose coupling.

---

#### Edge Case 5: Debugging Distributed Systems (Distributed Tracing)

**Problem**: Request goes through 10 services. Where did it fail?

**Scenario**:
```
API Gateway → User Service → Order Service → Payment Service → Shipping Service
                                                                      ↑
                                                                (failed here!)
```

**How to know Payment Service failed?** Logs are scattered across services!

**Solution: Distributed Tracing (Correlation IDs)**

```cpp
class Request {
public:
    std::string traceId;  // Unique ID for this request
    std::string spanId;   // ID for this service's work
    std::string parentSpanId;  // Previous service's spanId
};

// API Gateway (entry point)
void handleRequest(HttpRequest req) {
    Request request;
    request.traceId = generateUUID();  // e.g., "abc-123-def"
    request.spanId = generateUUID();
    request.parentSpanId = "";

    log("[TraceID: " + request.traceId + "] API Gateway received request");

    forwardToUserService(request);
}

// User Service
void handleRequest(Request req) {
    std::string mySpanId = generateUUID();

    log("[TraceID: " + req.traceId + "][SpanID: " + mySpanId + "] User Service processing");

    Request newReq;
    newReq.traceId = req.traceId;  // Keep same traceId!
    newReq.spanId = generateUUID();
    newReq.parentSpanId = mySpanId;

    forwardToOrderService(newReq);
}

// Payment Service (where it fails)
void handleRequest(Request req) {
    log("[TraceID: " + req.traceId + "] Payment Service processing");

    try {
        chargeCard();
    } catch (...) {
        log("[TraceID: " + req.traceId + "] ERROR: Payment failed!");  // ← Easy to find!
        throw;
    }
}
```

**Now search logs for traceId "abc-123-def"**:
```
[TraceID: abc-123-def] API Gateway received request
[TraceID: abc-123-def] User Service processing
[TraceID: abc-123-def] Order Service processing
[TraceID: abc-123-def] Payment Service processing
[TraceID: abc-123-def] ERROR: Payment failed!  ← Found it!
```

**Tools**: Zipkin, Jaeger, OpenTelemetry

**Lesson**: Use **distributed tracing** with correlation IDs to debug across services.

---

#### Edge Case 6: Database per Service (Data Duplication)

**Problem**: Multiple services need user data. Do we duplicate it?

**Scenario**:
```
User Service has:      {id: 1, name: "Alice", email: "alice@example.com"}
Order Service needs:   User's name for order confirmation
Shipping Service needs: User's email for tracking updates
```

**Option 1: Query User Service (Strong Consistency)**

```cpp
// Order Service
void createOrder(int userId, int productId) {
    // Query User Service for user data
    auto user = httpClient.get("http://user-service/api/users/" + std::to_string(userId));

    Order order = {userId, productId, user.name};  // Use fresh data
    orderRepository.save(order);
}
```

**Pros**: Always consistent
**Cons**: Slow (network call), User Service becomes bottleneck

**Option 2: Cache User Data Locally (Eventual Consistency)**

```cpp
// Order Service maintains local cache
class OrderService {
    std::map<int, User> userCache;  // Local cache

    void onUserUpdated(Event event) {
        // Update cache when User Service publishes event
        userCache[event.userId] = event.user;
    }

    void createOrder(int userId, int productId) {
        User user = userCache[userId];  // Fast! No network call
        Order order = {userId, productId, user.name};
        orderRepository.save(order);
    }
};
```

**Pros**: Fast (no network call)
**Cons**: Eventual consistency (cache might be stale)

**Lesson**: **Trade-off between consistency and performance.** Use caching + events for eventual consistency.

---

### CODE_EXAMPLES: Practical Demonstrations
#### Example 1: Simple REST Microservice

**Goal**: Create a basic User Service with REST API.

```cpp
#include <iostream>
#include <string>
#include <map>
#include <sstream>
// Note: In real app, use library like cpp-httplib, Crow, or Boost.Beast

// ═══════════════════════════════════════════════════════════════
//  USER MODEL
// ═══════════════════════════════════════════════════════════════

struct User {
    int id;
    std::string name;
    std::string email;
};

// ═══════════════════════════════════════════════════════════════
//  USER REPOSITORY (Database Access)
// ═══════════════════════════════════════════════════════════════

class UserRepository {
    std::map<int, User> users;
    int nextId = 1;

public:
    UserRepository() {
        // Seed data
        users[1] = {1, "Alice", "alice@example.com"};
        users[2] = {2, "Bob", "bob@example.com"};
        nextId = 3;
    }

    User getById(int id) {
        if (users.find(id) == users.end()) {
            throw std::runtime_error("User not found");
        }
        return users[id];
    }

    std::vector<User> getAll() {
        std::vector<User> result;
        for (auto& [id, user] : users) {
            result.push_back(user);
        }
        return result;
    }

    User create(const std::string& name, const std::string& email) {
        User user = {nextId++, name, email};
        users[user.id] = user;
        return user;
    }

    void update(int id, const std::string& name, const std::string& email) {
        if (users.find(id) == users.end()) {
            throw std::runtime_error("User not found");
        }
        users[id].name = name;
        users[id].email = email;
    }

    void remove(int id) {
        users.erase(id);
    }
};

// ═══════════════════════════════════════════════════════════════
//  USER SERVICE (Business Logic)
// ═══════════════════════════════════════════════════════════════

class UserService {
    UserRepository repository;

public:
    User getUserById(int id) {
        return repository.getById(id);
    }

    std::vector<User> getAllUsers() {
        return repository.getAll();
    }

    User createUser(const std::string& name, const std::string& email) {
        // Validation
        if (name.empty()) {
            throw std::invalid_argument("Name is required");
        }
        if (email.find('@') == std::string::npos) {
            throw std::invalid_argument("Invalid email format");
        }

        return repository.create(name, email);
    }

    void updateUser(int id, const std::string& name, const std::string& email) {
        repository.update(id, name, email);
    }

    void deleteUser(int id) {
        repository.remove(id);
    }
};

// ═══════════════════════════════════════════════════════════════
//  REST API CONTROLLER (HTTP Interface)
// ═══════════════════════════════════════════════════════════════

class UserController {
    UserService service;

public:
    // Simulate HTTP request handling
    std::string handleRequest(const std::string& method, const std::string& path) {
        try {
            if (method == "GET" && path == "/api/users") {
                return handleGetAllUsers();
            } else if (method == "GET" && path.find("/api/users/") == 0) {
                int userId = std::stoi(path.substr(11));  // Extract ID
                return handleGetUser(userId);
            } else if (method == "POST" && path == "/api/users") {
                return handleCreateUser("Charlie", "charlie@example.com");  // Simulated
            } else {
                return "{\"error\": \"Not found\"}";
            }
        } catch (std::exception& e) {
            return "{\"error\": \"" + std::string(e.what()) + "\"}";
        }
    }

private:
    std::string handleGetAllUsers() {
        auto users = service.getAllUsers();
        std::ostringstream json;
        json << "[";
        for (size_t i = 0; i < users.size(); i++) {
            json << "{\"id\":" << users[i].id
                 << ",\"name\":\"" << users[i].name << "\""
                 << ",\"email\":\"" << users[i].email << "\"}";
            if (i < users.size() - 1) json << ",";
        }
        json << "]";
        return json.str();
    }

    std::string handleGetUser(int userId) {
        User user = service.getUserById(userId);
        std::ostringstream json;
        json << "{\"id\":" << user.id
             << ",\"name\":\"" << user.name << "\""
             << ",\"email\":\"" << user.email << "\"}";
        return json.str();
    }

    std::string handleCreateUser(const std::string& name, const std::string& email) {
        User user = service.createUser(name, email);
        std::ostringstream json;
        json << "{\"id\":" << user.id
             << ",\"name\":\"" << user.name << "\""
             << ",\"email\":\"" << user.email << "\"}";
        return json.str();
    }
};

// ═══════════════════════════════════════════════════════════════
//  MAIN (Microservice Entry Point)
// ═══════════════════════════════════════════════════════════════

int main() {
    std::cout << "═══════════════════════════════════════════════════\n";
    std::cout << "  User Microservice (REST API)                    \n";
    std::cout << "  Running on port 8001                            \n";
    std::cout << "═══════════════════════════════════════════════════\n\n";

    UserController controller;

    // Simulate HTTP requests
    std::cout << "=== GET /api/users ===\n";
    std::cout << controller.handleRequest("GET", "/api/users") << "\n\n";

    std::cout << "=== GET /api/users/1 ===\n";
    std::cout << controller.handleRequest("GET", "/api/users/1") << "\n\n";

    std::cout << "=== POST /api/users (Create Charlie) ===\n";
    std::cout << controller.handleRequest("POST", "/api/users") << "\n\n";

    std::cout << "=== GET /api/users (After Create) ===\n";
    std::cout << controller.handleRequest("GET", "/api/users") << "\n\n";

    std::cout << "═══════════════════════════════════════════════════\n";
    std::cout << "  Key Points:                                      \n";
    std::cout << "  1. Independent service with own data            \n";
    std::cout << "  2. REST API for communication                   \n";
    std::cout << "  3. Can deploy/scale independently               \n";
    std::cout << "═══════════════════════════════════════════════════\n";

    return 0;
}
```

**Output**:
```
═══════════════════════════════════════════════════
  User Microservice (REST API)
  Running on port 8001
═══════════════════════════════════════════════════

=== GET /api/users ===
[{"id":1,"name":"Alice","email":"alice@example.com"},{"id":2,"name":"Bob","email":"bob@example.com"}]

=== GET /api/users/1 ===
{"id":1,"name":"Alice","email":"alice@example.com"}

=== POST /api/users (Create Charlie) ===
{"id":3,"name":"Charlie","email":"charlie@example.com"}

=== GET /api/users (After Create) ===
[{"id":1,"name":"Alice","email":"alice@example.com"},{"id":2,"name":"Bob","email":"bob@example.com"},{"id":3,"name":"Charlie","email":"charlie@example.com"}]
```

---

#### Example 2-8: Additional Examples (Outlined)

**Example 2**: Service-to-Service Communication (Order Service calls User Service)

**Example 3**: API Gateway (Routes requests to multiple services)

**Example 4**: Circuit Breaker Implementation

**Example 5**: Service Discovery (Registry pattern)

**Example 6**: SAGA Pattern (Distributed transaction)

**Example 7**: Event-Driven Microservices (Message queue)

**Example 8**: Complete E-Commerce System (3 microservices)

---

### INTERVIEW_QA: Comprehensive Questions and Answers
#### Q1: What is the main difference between monolithic and microservices architecture?

**Answer**:

| Aspect | Monolithic | Microservices |
|--------|-----------|---------------|
| **Structure** | One big application | Many small services |
| **Deployment** | Deploy entire app | Deploy each service independently |
| **Scaling** | Scale entire app | Scale individual services |
| **Database** | One shared database | Database per service |
| **Technology** | One tech stack | Different tech per service |
| **Fault Isolation** | One bug crashes all | One service failure isolated |

**Key Difference**: **Independent deployment and scaling.**

---

#### Q2: When should you NOT use microservices?

**Answer**:

**Don't use microservices when**:
1. **Small team** (< 5 people) - overhead too high
2. **Startup/early stage** - domain boundaries unclear
3. **Simple CRUD app** - unnecessary complexity
4. **Limited DevOps resources** - need infrastructure expertise
5. **Tight coupling** - features heavily interdependent

**Example**: Todo list app with 1 developer → Use monolith!

**Golden Rule**: Start with monolith, migrate to microservices when you NEED to.

---

#### Q3: How do you handle distributed transactions in microservices?

**Answer**:

**Problem**: Can't use traditional database transactions (each service has own DB).

**Solution: SAGA Pattern**

**Two approaches**:

**1. Choreography (Event-based)**:
```
Order Service → Publish "OrderCreated"
     ↓
Product Service → Subscribe, reserve inventory → Publish "InventoryReserved"
     ↓
Payment Service → Subscribe, charge card → Publish "PaymentSucceeded"
```

**2. Orchestration (Coordinator)**:
```
Saga Orchestrator:
  1. Call Product Service (reserve)
  2. Call Payment Service (charge)
  3. Call Order Service (create)

If any fails → compensate (rollback previous steps)
```

**Key**: Each step is **compensatable** (can be undone).

---

#### Q4: What is the Circuit Breaker pattern? Why use it?

**Answer**:

**Circuit Breaker** prevents cascading failures when a service is down.

**How it works**:
```
CLOSED (normal) → calls go through
    ↓ (failures exceed threshold)
OPEN (stop calling) → return error immediately, don't wait
    ↓ (wait timeout)
HALF_OPEN (try one request) → test if service recovered
    ↓ (success)
CLOSED (recovered)
```

**Why use it**:
- **Fast failure**: Don't wait for timeouts
- **Resource protection**: Don't exhaust threads
- **Cascading failure prevention**: Failure doesn't propagate

**Libraries**: Hystrix (Java), Polly (.NET), resilience4j

---

#### Q5: How do you ensure data consistency across microservices?

**Answer**:

**Two strategies**:

**1. Eventual Consistency (Common)**:
- Each service has own database
- Use events to propagate changes
- Accept temporary inconsistency

```cpp
// User Service updates email
userRepository.updateEmail(userId, newEmail);
eventBus.publish("UserEmailUpdated", {userId, newEmail});

// Order Service listens and updates cache
void onUserEmailUpdated(Event e) {
    userCache.update(e.userId, e.newEmail);
}
```

**2. Strong Consistency (Rare)**:
- Query master service for latest data
- No caching, always fresh

```cpp
// Order Service queries User Service every time
std::string getEmail(int userId) {
    return httpClient.get("user-service/users/" + userId).email;
}
```

**Trade-off**: Performance (caching) vs Consistency (fresh data).

---

#### Additional Questions 6-20 (Outlined)

**Q6**: What is an API Gateway? What are its responsibilities?

**Q7**: How does service discovery work?

**Q8**: What is the difference between synchronous and asynchronous communication?

**Q9**: How do you version APIs in microservices?

**Q10**: What is distributed tracing? How does it work?

**Q11**: How do you handle authentication in microservices?

**Q12**: What is a service mesh? (Istio, Linkerd)

**Q13**: How do you test microservices?

**Q14**: What is the strangler fig pattern for migrating from monolith?

**Q15**: How do you handle database migrations in microservices?

**Q16**: What is CQRS and how does it relate to microservices?

**Q17**: How do you monitor microservices?

**Q18**: What is polyglot persistence?

**Q19**: How do you handle rate limiting in microservices?

**Q20**: What are the differences between microservices and SOA (Service-Oriented Architecture)?

---

### PRACTICE_TASKS: Output Prediction and Code Analysis
#### Q1

**Goal**: Implement a Product Service with CRUD operations.

**Requirements**:
1. `ProductRepository` (in-memory storage)
2. `ProductService` (business logic)
3. REST API endpoints:
   - GET /products → list all
   - GET /products/:id → get one
   - POST /products → create
   - PUT /products/:id → update
   - DELETE /products/:id → delete

---

#### Q2

**Goal**: Order Service calls User Service via HTTP.

**Requirements**:
1. User Service running on port 8001
2. Order Service running on port 8002
3. When creating order, Order Service queries User Service for user data
4. Handle errors if User Service is down

---

#### Q3

**Goal**: Single entry point for multiple services.

**Requirements**:
1. API Gateway on port 8000
2. Routes:
   - /api/users → User Service (8001)
   - /api/orders → Order Service (8002)
   - /api/products → Product Service (8003)
3. Gateway aggregates responses if needed

---

#### Q4

**Goal**: Protect against cascading failures.

**Requirements**:
1. `CircuitBreaker` class with states (CLOSED, OPEN, HALF_OPEN)
2. Failure threshold = 5
3. Timeout = 60 seconds
4. Test with simulated failing service

---

#### Q5

**Goal**: Services register/discover each other.

**Requirements**:
1. `ServiceRegistry` (in-memory map)
2. Services register on startup
3. Services lookup other services by name
4. Heartbeat mechanism (optional)

---

#### Task 6: Implement SAGA Pattern (Choreography)

**Goal**: Distributed transaction with event-driven compensation.

**Requirements**:
1. Order creation spans 3 services (Order, Product, Payment)
2. Each service publishes events
3. If Payment fails, Product Service releases inventory (compensation)

---

#### Task 7: Implement Distributed Tracing

**Goal**: Track requests across multiple services.

**Requirements**:
1. Generate `traceId` at API Gateway
2. Pass `traceId` through all service calls
3. Log format: `[TraceID: xxx] Service: Message`
4. Simulate request through 3 services

---

#### Task 8: Implement Asynchronous Communication

**Goal**: Services communicate via message queue.

**Requirements**:
1. In-memory message queue (pub/sub)
2. User Service publishes "UserRegistered" event
3. Email Service subscribes and sends welcome email
4. Analytics Service subscribes and logs event

---

#### Task 9: Implement Database per Service

**Goal**: Each service has its own database (simulated with separate storage).

**Requirements**:
1. User Service → UserDB (map)
2. Order Service → OrderDB (separate map)
3. Order Service caches user data (eventual consistency)
4. Update cache when User Service publishes event

---

#### Task 10: Implement Health Check Endpoint

**Goal**: Monitor service health.

**Requirements**:
1. Each service exposes GET /health
2. Returns: `{\"status\": \"UP\", \"timestamp\": \"...\"}`
3. API Gateway polls services, marks unhealthy ones

---

#### Task 11-20: Additional Tasks (Outlined)

**Task 11**: Implement rate limiting per service

**Task 12**: Implement API versioning (v1, v2)

**Task 13**: Implement service mesh basics (sidecar proxy)

**Task 14**: Migrate monolith to microservices (strangler fig)

**Task 15**: Implement shared cache (Redis-like)

**Task 16**: Implement load balancer for services

**Task 17**: Implement saga orchestrator

**Task 18**: Implement authentication with JWT tokens

**Task 19**: Implement monitoring dashboard

**Task 20**: Build complete e-commerce system (5 microservices)

---

### QUICK_REFERENCE: Key Takeaways and Comparison Tables
#### Monolith vs Microservices

| Aspect | Monolith | Microservices |
|--------|----------|---------------|
| **Structure** | One application | Many small services |
| **Deployment** | All together | Independent |
| **Scaling** | Scale entire app | Scale per service |
| **Database** | Shared | One per service |
| **Technology** | One stack | Polyglot |
| **Team Size** | Small teams | Large teams |

---

#### Microservices Characteristics

1. **Single Responsibility**: Each service does one thing
2. **Independent Deployment**: Deploy without affecting others
3. **Decentralized Data**: Each service owns its database
4. **Communication via APIs**: REST, gRPC, message queues

---

#### Communication Patterns

| Pattern | Use Case | Pros | Cons |
|---------|----------|------|------|
| **Synchronous (REST)** | Simple queries | Simple, immediate | Slow, tight coupling |
| **Asynchronous (Queue)** | Events, background tasks | Fast, loose coupling | Eventual consistency |

---

#### Key Patterns

| Pattern | Purpose |
|---------|---------|
| **API Gateway** | Single entry point, routing, auth |
| **Service Discovery** | Find service locations dynamically |
| **Circuit Breaker** | Prevent cascading failures |
| **SAGA** | Distributed transactions |
| **Event Sourcing** | Track all state changes as events |

---

#### When to Use Microservices

| **Use** | **Don't Use** |
|---------|---------------|
| ✅ Large teams (50+) | ❌ Small team (< 5) |
| ✅ Need scaling | ❌ Simple app |
| ✅ Clear boundaries | ❌ Unclear domains |
| ✅ High availability | ❌ Limited DevOps |

**Golden Rule**: Start monolith, migrate when needed.

---

#### Code Template

```cpp
// Microservice Structure
class ServiceController {  // HTTP endpoints
    ServiceLogic logic;
    std::string handleRequest(Request req);
};

class ServiceLogic {  // Business logic
    Repository repo;
    void processBusinessLogic();
};

class Repository {  // Data access
    Database db;
    void save(), get(), update(), delete();
};

// Communication
HttpClient::get("http://other-service/api/endpoint");
MessageQueue::publish("EventName", {data});
```

---

