### THEORY_SECTION: Core Concepts and Foundations
#### What is Layered Architecture?

**Layered Architecture** is a design pattern where you organize code into **horizontal layers**, where each layer has a specific responsibility and can only communicate with adjacent layers (usually the layer directly below).

**Key Idea**: Like a building with floors, each layer sits on top of another. Upper floors depend on lower floors, but lower floors don't depend on upper floors.

---

#### Simple Explanation: Building with Floors Analogy

Imagine an office building:

| Floor | Purpose | Can Access |
|-------|---------|------------|
| **3rd Floor: Offices** | Where people work (User Interface) | Can go down to 2nd floor for supplies |
| **2nd Floor: Supplies** | Storage, resources (Business Logic) | Can go down to 1st floor for infrastructure |
| **1st Floor: Infrastructure** | Electricity, water, HVAC (Database) | Foundation - doesn't need upper floors |

**Key Rules**:
- ✅ 3rd floor can use 2nd floor services
- ✅ 2nd floor can use 1st floor services
- ❌ 1st floor **CANNOT** use 3rd floor (circular dependency!)
- ❌ 3rd floor **SHOULD NOT** directly access 1st floor (skip layers)

---

#### Classic 3-Tier Architecture

The most common form:

```
┌─────────────────────────────────────┐
│   Presentation Layer (UI)           │  ← Users interact here
│   - Web pages, Mobile UI, Desktop   │
│   - Controllers, Views               │
└─────────────────────────────────────┘
              ↓ (uses)
┌─────────────────────────────────────┐
│   Business Logic Layer (BLL)        │  ← Core application logic
│   - Business rules, validation      │
│   - Domain models, Services          │
└─────────────────────────────────────┘
              ↓ (uses)
┌─────────────────────────────────────┐
│   Data Access Layer (DAL)            │  ← Talks to database
│   - Database queries, ORM            │
│   - Data models, Repositories        │
└─────────────────────────────────────┘
              ↓ (uses)
┌─────────────────────────────────────┐
│   Database (PostgreSQL, MySQL, etc.) │
└─────────────────────────────────────┘
```

---

#### Layer Responsibilities

#### 1. Presentation Layer (UI)

**What it does**:
- Displays information to users
- Handles user input (clicks, forms, gestures)
- Formats data for display

**What it does NOT do**:
- ❌ Business logic (e.g., calculating prices)
- ❌ Database access

**Examples**:
- Web: HTML/CSS/JavaScript, React components
- Desktop: Qt widgets, WPF windows
- Mobile: Android activities, iOS view controllers

**Code Example**:
```cpp
// Presentation Layer: Web Controller
class UserController {
    UserService userService;  // ← Depends on Business Layer

public:
    void displayUserProfile(int userId) {
        // 1. Get data from business layer
        User user = userService.getUserById(userId);

        // 2. Format for display
        std::cout << "Name: " << user.name << "\n";
        std::cout << "Email: " << user.email << "\n";

        // ❌ NEVER do this in presentation layer:
        // db.query("SELECT * FROM users WHERE id = " + userId);
    }
};
```

---

#### 2. Business Logic Layer (BLL)

**What it does**:
- Contains **business rules** (e.g., "users must be 18+ to register")
- Validates data (e.g., "email must be valid format")
- Coordinates workflows (e.g., "checkout process: check stock → charge card → send email")

**What it does NOT do**:
- ❌ UI-specific logic (e.g., button colors)
- ❌ Direct database queries

**Examples**:
- User registration validation
- Price calculations (discounts, taxes)
- Order processing workflows

**Code Example**:
```cpp
// Business Logic Layer: Service
class UserService {
    UserRepository userRepo;  // ← Depends on Data Layer

public:
    bool registerUser(const std::string& name, const std::string& email, int age) {
        // Business rule: Must be 18 or older
        if (age < 18) {
            std::cerr << "Error: Must be 18 or older\n";
            return false;
        }

        // Business rule: Email must be valid
        if (!isValidEmail(email)) {
            std::cerr << "Error: Invalid email format\n";
            return false;
        }

        // Business rule: Email must be unique
        if (userRepo.emailExists(email)) {
            std::cerr << "Error: Email already registered\n";
            return false;
        }

        // All checks passed, save user
        User user = {name, email, age};
        userRepo.save(user);
        return true;
    }

private:
    bool isValidEmail(const std::string& email) {
        return email.find('@') != std::string::npos;  // Simplified
    }
};
```

---

#### 3. Data Access Layer (DAL)

**What it does**:
- Handles **all database interactions** (queries, inserts, updates, deletes)
- Abstracts database details from business logic
- Often uses **Repository pattern** or **ORM (Object-Relational Mapping)**

**What it does NOT do**:
- ❌ Business logic (e.g., validation)
- ❌ UI formatting

**Examples**:
- Repository classes (UserRepository, OrderRepository)
- ORMs (Entity Framework, Hibernate)
- Database connection management

**Code Example**:
```cpp
// Data Access Layer: Repository
class UserRepository {
    DatabaseConnection db;

public:
    User getUserById(int id) {
        std::string query = "SELECT * FROM users WHERE id = " + std::to_string(id);
        ResultSet result = db.query(query);

        User user;
        user.id = result.getInt("id");
        user.name = result.getString("name");
        user.email = result.getString("email");
        return user;
    }

    void save(const User& user) {
        std::string query = "INSERT INTO users (name, email) VALUES ('"
                          + user.name + "', '" + user.email + "')";
        db.execute(query);
    }

    bool emailExists(const std::string& email) {
        std::string query = "SELECT COUNT(*) FROM users WHERE email = '" + email + "'";
        ResultSet result = db.query(query);
        return result.getInt(0) > 0;
    }
};
```

---

#### Complete Example: User Registration Flow

```
User fills form (Presentation Layer)
         ↓
UserController.register()
         ↓
UserService.registerUser()  (Business Layer)
  - Validate age >= 18
  - Validate email format
  - Check email not already used ← calls Data Layer
         ↓
UserRepository.save()  (Data Layer)
         ↓
Database.INSERT INTO users...
```

**Full Code**:

```cpp
// === PRESENTATION LAYER ===
class WebController {
    UserService userService;

public:
    void handleRegistrationForm(const std::string& name,
                                const std::string& email,
                                int age) {
        std::cout << "User submitting registration form...\n";

        bool success = userService.registerUser(name, email, age);

        if (success) {
            std::cout << "Registration successful! Welcome, " << name << "!\n";
        } else {
            std::cout << "Registration failed. Please try again.\n";
        }
    }
};

// === BUSINESS LOGIC LAYER ===
class UserService {
    UserRepository userRepo;

public:
    bool registerUser(const std::string& name,
                      const std::string& email,
                      int age) {
        // Business rules
        if (age < 18) return false;
        if (!isValidEmail(email)) return false;
        if (userRepo.emailExists(email)) return false;

        User user = {0, name, email, age};
        userRepo.save(user);
        return true;
    }
};

// === DATA ACCESS LAYER ===
class UserRepository {
    DatabaseConnection db;

public:
    void save(const User& user) {
        db.execute("INSERT INTO users ...");
    }

    bool emailExists(const std::string& email) {
        auto result = db.query("SELECT COUNT(*) FROM users WHERE email = '" + email + "'");
        return result.getInt(0) > 0;
    }
};
```

**Flow**:
1. User fills form → **Presentation** validates input (client-side)
2. Form submitted → **Business** validates rules (age, email uniqueness)
3. **Data** saves to database
4. Result flows back up: Data → Business → Presentation → User

---

#### Benefits of Layered Architecture

| Benefit | Explanation |
|---------|-------------|
| **Separation of Concerns** | Each layer has ONE job (UI, logic, data) |
| **Testability** | Can test business logic without UI or database |
| **Replaceability** | Swap layers (e.g., change database from MySQL to PostgreSQL) |
| **Maintainability** | Changes in one layer don't affect others |
| **Parallel Development** | Teams can work on different layers simultaneously |
| **Reusability** | Business logic can be reused (Web + Mobile use same services) |

---

#### Layering Rules (Dependency Direction)

**Golden Rule**: **Upper layers depend on lower layers, NEVER the reverse.**

```
✅ CORRECT:
Presentation → Business → Data
(UI depends on services, services depend on data)

❌ WRONG:
Data → Business → Presentation
(Database depends on UI? No!)
```

**Common Violations**:

```cpp
// ❌ BAD: Data layer depends on Presentation layer
class UserRepository {
    void save(const User& user) {
        db.execute("INSERT ...");

        // WRONG! Data layer should NOT know about UI
        std::cout << "User " << user.name << " saved! (UI message)";
    }
};

// ✅ GOOD: Data layer returns result, Presentation layer displays
class UserRepository {
    bool save(const User& user) {
        db.execute("INSERT ...");
        return true;  // Just return success/failure
    }
};

class WebController {
    void handleRegistration() {
        if (userService.register(user)) {
            std::cout << "User saved!";  // UI layer handles display
        }
    }
};
```

---

#### N-Tier Architecture (More Layers)

Sometimes you need MORE than 3 layers:

```
┌─────────────────────────┐
│  Presentation Layer     │  (Web UI, Mobile App)
└─────────────────────────┘
            ↓
┌─────────────────────────┐
│  API / Service Layer    │  (REST API, GraphQL)
└─────────────────────────┘
            ↓
┌─────────────────────────┐
│  Business Logic Layer   │  (Domain services)
└─────────────────────────┘
            ↓
┌─────────────────────────┐
│  Data Access Layer      │  (Repositories, ORM)
└─────────────────────────┘
            ↓
┌─────────────────────────┐
│  Database               │
└─────────────────────────┘
```

**Example: E-Commerce System**

```
┌─────────────────────────┐
│  Web UI                 │  ← Users browse products
└─────────────────────────┘
            ↓
┌─────────────────────────┐
│  API Gateway            │  ← REST endpoints (/products, /checkout)
└─────────────────────────┘
            ↓
┌─────────────────────────┐
│  Business Services      │  ← Order processing, inventory management
└─────────────────────────┘
            ↓
┌─────────────────────────┐
│  Domain Models          │  ← Product, Order, Customer entities
└─────────────────────────┘
            ↓
┌─────────────────────────┐
│  Data Repositories      │  ← Database queries
└─────────────────────────┘
            ↓
┌─────────────────────────┐
│  Database (PostgreSQL)  │
└─────────────────────────┘
```

---

#### When to Use Layered Architecture

| **Use When** | **Don't Use When** |
|--------------|---------------------|
| ✅ Clear separation needed (UI, logic, data) | ❌ Simple CRUD app (overkill) |
| ✅ Multiple frontends (Web + Mobile) | ❌ Rapid prototyping (too much structure) |
| ✅ Team specialization (frontend, backend, DB teams) | ❌ High-performance systems (layer overhead) |
| ✅ Long-term maintainability important | ❌ Throw-away code |
| ✅ Business logic is complex | ❌ Microservices (different pattern) |

---

#### Real-World Examples

**Example 1: Banking Application**

```
Presentation Layer:
  - Mobile app (iOS/Android)
  - Web portal (React)

Business Logic Layer:
  - Account validation
  - Transaction processing
  - Fraud detection

Data Access Layer:
  - AccountRepository
  - TransactionRepository

Database:
  - Oracle database
```

**Example 2: E-Commerce**

```
Presentation:
  - Product catalog pages
  - Shopping cart UI
  - Checkout form

Business:
  - Inventory management (check stock)
  - Price calculations (discounts, taxes)
  - Order workflows (payment → fulfillment → shipping)

Data:
  - ProductRepository
  - OrderRepository
  - CustomerRepository

Database:
  - MySQL database
```

---

#### Layered vs Other Architectures

| Architecture | Structure | Use Case |
|--------------|-----------|----------|
| **Layered** | Horizontal layers (UI → Logic → Data) | Traditional web apps, desktop apps |
| **Event-Driven** | Event bus + subscribers | Real-time systems, GUIs |
| **Microservices** | Independent services | Large distributed systems |
| **ECS** | Entities + Components + Systems | Games, simulations |

---

#### Advanced: Dependency Inversion Principle

**Problem**: Business layer depends on concrete Data layer implementations.

```cpp
// ❌ Tight coupling
class UserService {
    MySQLUserRepository userRepo;  // ← Depends on concrete MySQL implementation
};
```

**Solution**: Depend on abstractions (interfaces).

```cpp
// ✅ Loose coupling
class IUserRepository {  // Interface (abstract)
public:
    virtual void save(const User& user) = 0;
    virtual User getById(int id) = 0;
};

class UserService {
    IUserRepository* userRepo;  // ← Depends on interface, not concrete class

public:
    UserService(IUserRepository* repo) : userRepo(repo) {}
};

// Implementations
class MySQLUserRepository : public IUserRepository { /* ... */ };
class PostgreSQLUserRepository : public IUserRepository { /* ... */ };
class InMemoryUserRepository : public IUserRepository { /* ... */ };  // For testing!
```

**Benefit**: Can swap implementations without changing business logic!

---

### EDGE_CASES: Tricky Scenarios and Deep Internals
#### Edge Case 1: Layer Violation (Skipping Layers)

**Problem**: Presentation layer directly accesses Data layer, skipping Business layer.

**Naive Code**:
```cpp
// ❌ BAD: UI directly queries database
class WebController {
    UserRepository userRepo;

public:
    void displayUserProfile(int userId) {
        User user = userRepo.getUserById(userId);  // ← Skipped Business Layer!
        std::cout << "Name: " << user.name << "\n";
    }
};
```

**Why It's Bad**:
- Business rules bypassed (e.g., "only show active users")
- Validation skipped
- Harder to test (UI depends on database)
- Changes to business logic require changing UI code

**Correct Code**:
```cpp
// ✅ GOOD: UI goes through Business Layer
class WebController {
    UserService userService;  // ← Use Business Layer

public:
    void displayUserProfile(int userId) {
        User user = userService.getUserById(userId);  // ← Business layer handles rules
        std::cout << "Name: " << user.name << "\n";
    }
};

class UserService {
    UserRepository userRepo;

public:
    User getUserById(int userId) {
        User user = userRepo.getUserById(userId);

        // Business rule: Only show active users
        if (!user.isActive) {
            throw std::runtime_error("User is inactive");
        }

        return user;
    }
};
```

**Lesson**: **ALWAYS go through adjacent layers.** Never skip layers.

---

#### Edge Case 2: Circular Dependencies

**Problem**: Lower layer depends on upper layer, creating a cycle.

**Naive Code**:
```cpp
// ❌ BAD: Circular dependency
class UserService {  // Business Layer
    UserRepository userRepo;

public:
    void registerUser(const User& user) {
        userRepo.save(user);
    }
};

class UserRepository {  // Data Layer
    UserService userService;  // ← WRONG! Data depends on Business

public:
    void save(const User& user) {
        db.execute("INSERT ...");

        // ❌ WRONG: Data layer calling business layer!
        userService.sendWelcomeEmail(user);
    }
};
```

**Why It Fails**:
- **Circular dependency**: Business → Data → Business
- Hard to test (can't mock dependencies)
- Tight coupling (changes ripple everywhere)

**Solution: Use Callbacks or Events**

```cpp
// ✅ GOOD: Use callback
class UserRepository {
    std::function<void(const User&)> onUserSaved;  // Callback

public:
    void setOnUserSaved(std::function<void(const User&)> callback) {
        onUserSaved = callback;
    }

    void save(const User& user) {
        db.execute("INSERT ...");

        if (onUserSaved) {
            onUserSaved(user);  // Notify higher layer
        }
    }
};

class UserService {
    UserRepository userRepo;

public:
    UserService() {
        // Register callback
        userRepo.setOnUserSaved([this](const User& user) {
            sendWelcomeEmail(user);
        });
    }

    void registerUser(const User& user) {
        userRepo.save(user);  // Data layer will call callback
    }
};
```

**Alternative: Event System**

```cpp
class UserRepository {
    EventBus* eventBus;

public:
    void save(const User& user) {
        db.execute("INSERT ...");
        eventBus->publish(UserSavedEvent{user});  // Publish event
    }
};

class UserService {
    void init() {
        eventBus->subscribe("UserSaved", [this](const Event& e) {
            sendWelcomeEmail(e.user);
        });
    }
};
```

**Lesson**: **Lower layers should NOT depend on upper layers.** Use callbacks or events.

---

#### Edge Case 3: God Classes (Too Much Logic in One Layer)

**Problem**: Business layer becomes a "God Class" with thousands of lines.

**Naive Code**:
```cpp
// ❌ BAD: 5000-line "UserService" class
class UserService {
    // User registration logic
    void registerUser() { /* 200 lines */ }

    // User login logic
    void loginUser() { /* 150 lines */ }

    // Password reset logic
    void resetPassword() { /* 100 lines */ }

    // Email verification logic
    void verifyEmail() { /* 80 lines */ }

    // Profile update logic
    void updateProfile() { /* 120 lines */ }

    // ... 50 more methods!
};
```

**Why It's Bad**:
- **Hard to maintain** (too much in one file)
- **Hard to test** (need to test everything together)
- **Poor cohesion** (unrelated functionality mixed)

**Solution 1: Split by Feature**

```cpp
// ✅ GOOD: Separate services by feature
class UserRegistrationService {
    void registerUser() { /* ... */ }
    void verifyEmail() { /* ... */ }
};

class UserAuthenticationService {
    void loginUser() { /* ... */ }
    void resetPassword() { /* ... */ }
};

class UserProfileService {
    void updateProfile() { /* ... */ }
    void deleteAccount() { /* ... */ }
};
```

**Solution 2: Use Domain-Driven Design (DDD)**

```cpp
// Domain: User Management
class UserDomain {
    UserRegistrationService registrationService;
    UserAuthenticationService authService;
    UserProfileService profileService;
};

// Domain: Order Management
class OrderDomain {
    OrderCreationService creationService;
    OrderFulfillmentService fulfillmentService;
};
```

**Lesson**: **Keep classes focused.** Split large services into smaller, cohesive ones.

---

#### Edge Case 4: Testing Challenges (Coupled Layers)

**Problem**: Can't test Business layer without database running.

**Naive Code**:
```cpp
class UserService {
    MySQLUserRepository userRepo;  // ← Concrete dependency

public:
    bool registerUser(const User& user) {
        // Validation logic
        if (!isValidEmail(user.email)) return false;

        // Save to database
        userRepo.save(user);  // ← Requires MySQL running!
        return true;
    }
};

// Test
void testRegisterUser() {
    UserService service;
    User user = {"test@example.com", 25};

    bool result = service.registerUser(user);  // ❌ Fails if no database!
}
```

**Why It's Bad**:
- Tests require full database setup (slow!)
- Can't test business logic in isolation
- Tests break if database changes

**Solution: Dependency Injection + Mock**

```cpp
// ✅ GOOD: Abstract repository
class IUserRepository {
public:
    virtual void save(const User& user) = 0;
    virtual ~IUserRepository() = default;
};

class UserService {
    IUserRepository* userRepo;  // ← Abstract dependency

public:
    UserService(IUserRepository* repo) : userRepo(repo) {}

    bool registerUser(const User& user) {
        if (!isValidEmail(user.email)) return false;
        userRepo->save(user);
        return true;
    }
};

// Real implementation
class MySQLUserRepository : public IUserRepository {
    void save(const User& user) override {
        db.execute("INSERT INTO users ...");
    }
};

// Mock for testing
class MockUserRepository : public IUserRepository {
public:
    bool saveCalled = false;
    User savedUser;

    void save(const User& user) override {
        saveCalled = true;
        savedUser = user;
    }
};

// Test
void testRegisterUser() {
    MockUserRepository mockRepo;
    UserService service(&mockRepo);  // Inject mock

    User user = {"test@example.com", 25};
    bool result = service.registerUser(user);

    assert(result == true);
    assert(mockRepo.saveCalled == true);  // ✅ No database needed!
}
```

**Lesson**: **Use dependency injection.** Depend on abstractions, not concrete implementations.

---

#### Edge Case 5: Performance Overhead (Too Many Layers)

**Problem**: Every request goes through 5+ layers, causing latency.

**Naive Code**:
```cpp
// Request flow (7 layers!):
UI → Controller → API Gateway → Service → Domain → Repository → Database

// Each layer adds overhead:
void displayUser(int id) {
    controller.getUser(id);           // 1ms
        → apiGateway.getUser(id);     // 1ms
            → userService.getUser(id);    // 1ms
                → userDomain.getUser(id); // 1ms
                    → repository.getUser(id);  // 1ms
                        → database.query();    // 10ms
}
// Total: 15ms (5ms just from layers!)
```

**Why It's Bad**:
- **Latency overhead**: Each layer adds function call overhead
- **Over-engineering**: Too many abstraction layers for simple operations

**Solution 1: Flatten for Simple Queries**

```cpp
// ✅ For simple CRUD, skip intermediate layers
void displayUser(int id) {
    User user = repository.getUserById(id);  // Direct access for simple query
    render(user);
}

// ✅ For complex operations, use layers
void registerUser(const User& user) {
    // Complex validation, business rules → use service layer
    userService.registerUser(user);
}
```

**Solution 2: Caching**

```cpp
class UserService {
    UserRepository userRepo;
    Cache cache;

public:
    User getUserById(int id) {
        // Check cache first
        if (cache.has(id)) {
            return cache.get(id);  // ✅ Fast path (no database)
        }

        // Cache miss → query database
        User user = userRepo.getUserById(id);
        cache.put(id, user);
        return user;
    }
};
```

**Lesson**: **Don't over-layer.** Use layers for complex logic, simplify for simple operations.

---

#### Edge Case 6: Cross-Cutting Concerns (Logging, Security)

**Problem**: Every layer needs logging, authentication, error handling → code duplication.

**Naive Code**:
```cpp
class UserController {
    void displayUser(int id) {
        log("Request: displayUser(" + std::to_string(id) + ")");  // ← Duplicate
        try {
            // ...
        } catch (...) {
            log("Error: displayUser failed");  // ← Duplicate
        }
    }
};

class UserService {
    void registerUser(const User& user) {
        log("Request: registerUser(" + user.name + ")");  // ← Duplicate
        try {
            // ...
        } catch (...) {
            log("Error: registerUser failed");  // ← Duplicate
        }
    }
};
```

**Why It's Bad**:
- **Code duplication**: Logging logic repeated everywhere
- **Hard to maintain**: Change logging format → update 100 places

**Solution 1: Aspect-Oriented Programming (Decorators)**

```cpp
// ✅ GOOD: Logging decorator
template<typename ServiceT>
class LoggingDecorator : public ServiceT {
    ServiceT* innerService;

public:
    LoggingDecorator(ServiceT* service) : innerService(service) {}

    auto registerUser(const User& user) {
        log("Request: registerUser(" + user.name + ")");
        try {
            auto result = innerService->registerUser(user);
            log("Success: registerUser");
            return result;
        } catch (...) {
            log("Error: registerUser failed");
            throw;
        }
    }
};

// Usage
UserService* baseService = new UserService();
UserService* loggedService = new LoggingDecorator(baseService);
```

**Solution 2: Middleware (For Web Apps)**

```cpp
class LoggingMiddleware {
public:
    void handle(Request request, Response response, NextHandler next) {
        log("Request: " + request.url);
        auto start = now();

        next(request, response);  // Call next handler

        auto duration = now() - start;
        log("Response: " + std::to_string(duration) + "ms");
    }
};

// Apply to all routes
app.use(LoggingMiddleware());
```

**Lesson**: **Use cross-cutting patterns** (decorators, middleware, AOP) for common concerns.

---

### CODE_EXAMPLES: Practical Demonstrations
#### Example 1: Simple 3-Tier CRUD Application

**Goal**: Implement basic User management (Create, Read, Update, Delete) with proper layering.

```cpp
#include <iostream>
#include <vector>
#include <string>
#include <map>
#include <memory>

// ═══════════════════════════════════════════════════════════════
//  DATA MODELS
// ═══════════════════════════════════════════════════════════════

struct User {
    int id;
    std::string name;
    std::string email;
    int age;
};

// ═══════════════════════════════════════════════════════════════
//  DATA ACCESS LAYER (Repository Pattern)
// ═══════════════════════════════════════════════════════════════

class IUserRepository {
public:
    virtual void save(const User& user) = 0;
    virtual User getById(int id) = 0;
    virtual std::vector<User> getAll() = 0;
    virtual void update(const User& user) = 0;
    virtual void remove(int id) = 0;
    virtual bool emailExists(const std::string& email) = 0;
    virtual ~IUserRepository() = default;
};

class InMemoryUserRepository : public IUserRepository {
    std::map<int, User> users;
    int nextId = 1;

public:
    void save(const User& user) override {
        User newUser = user;
        newUser.id = nextId++;
        users[newUser.id] = newUser;
        std::cout << "  [DATA] Saved user ID " << newUser.id << " to database\n";
    }

    User getById(int id) override {
        std::cout << "  [DATA] Querying user ID " << id << "\n";
        return users.at(id);
    }

    std::vector<User> getAll() override {
        std::cout << "  [DATA] Querying all users\n";
        std::vector<User> result;
        for (auto& [id, user] : users) {
            result.push_back(user);
        }
        return result;
    }

    void update(const User& user) override {
        std::cout << "  [DATA] Updating user ID " << user.id << "\n";
        users[user.id] = user;
    }

    void remove(int id) override {
        std::cout << "  [DATA] Deleting user ID " << id << "\n";
        users.erase(id);
    }

    bool emailExists(const std::string& email) override {
        for (auto& [id, user] : users) {
            if (user.email == email) return true;
        }
        return false;
    }
};

// ═══════════════════════════════════════════════════════════════
//  BUSINESS LOGIC LAYER (Service)
// ═══════════════════════════════════════════════════════════════

class UserService {
    IUserRepository* userRepo;

public:
    UserService(IUserRepository* repo) : userRepo(repo) {}

    bool registerUser(const std::string& name, const std::string& email, int age) {
        std::cout << "\n[BUSINESS] Registering user: " << name << "\n";

        // Business rule: Age must be 18+
        if (age < 18) {
            std::cerr << "  ❌ Error: Must be 18 or older\n";
            return false;
        }

        // Business rule: Email must contain '@'
        if (email.find('@') == std::string::npos) {
            std::cerr << "  ❌ Error: Invalid email format\n";
            return false;
        }

        // Business rule: Email must be unique
        if (userRepo->emailExists(email)) {
            std::cerr << "  ❌ Error: Email already registered\n";
            return false;
        }

        std::cout << "  ✅ All validations passed\n";
        User user = {0, name, email, age};
        userRepo->save(user);
        return true;
    }

    User getUserById(int id) {
        std::cout << "\n[BUSINESS] Getting user ID " << id << "\n";
        return userRepo->getById(id);
    }

    std::vector<User> getAllUsers() {
        std::cout << "\n[BUSINESS] Getting all users\n";
        return userRepo->getAll();
    }

    bool updateUserEmail(int id, const std::string& newEmail) {
        std::cout << "\n[BUSINESS] Updating email for user ID " << id << "\n";

        // Business rule: Email format validation
        if (newEmail.find('@') == std::string::npos) {
            std::cerr << "  ❌ Error: Invalid email format\n";
            return false;
        }

        User user = userRepo->getById(id);
        user.email = newEmail;
        userRepo->update(user);
        std::cout << "  ✅ Email updated\n";
        return true;
    }

    void deleteUser(int id) {
        std::cout << "\n[BUSINESS] Deleting user ID " << id << "\n";
        userRepo->remove(id);
    }
};

// ═══════════════════════════════════════════════════════════════
//  PRESENTATION LAYER (Controller)
// ═══════════════════════════════════════════════════════════════

class UserController {
    UserService* userService;

public:
    UserController(UserService* service) : userService(service) {}

    void registerUser(const std::string& name, const std::string& email, int age) {
        std::cout << "\n═══════════════════════════════════════════════\n";
        std::cout << "[UI] User submitting registration form\n";
        std::cout << "  Name: " << name << "\n";
        std::cout << "  Email: " << email << "\n";
        std::cout << "  Age: " << age << "\n";

        bool success = userService->registerUser(name, email, age);

        if (success) {
            std::cout << "\n[UI] ✅ Registration successful! Welcome, " << name << "!\n";
        } else {
            std::cout << "\n[UI] ❌ Registration failed. Please try again.\n";
        }
    }

    void displayUser(int userId) {
        std::cout << "\n═══════════════════════════════════════════════\n";
        std::cout << "[UI] Displaying user profile\n";

        User user = userService->getUserById(userId);

        std::cout << "\n╔════════════════════════════════════╗\n";
        std::cout << "║       User Profile                 ║\n";
        std::cout << "╚════════════════════════════════════╝\n";
        std::cout << "  ID:    " << user.id << "\n";
        std::cout << "  Name:  " << user.name << "\n";
        std::cout << "  Email: " << user.email << "\n";
        std::cout << "  Age:   " << user.age << "\n";
    }

    void displayAllUsers() {
        std::cout << "\n═══════════════════════════════════════════════\n";
        std::cout << "[UI] Displaying all users\n";

        std::vector<User> users = userService->getAllUsers();

        std::cout << "\n╔════════════════════════════════════╗\n";
        std::cout << "║       All Users                    ║\n";
        std::cout << "╚════════════════════════════════════╝\n";

        for (const User& user : users) {
            std::cout << "  " << user.id << ". " << user.name
                      << " (" << user.email << ")\n";
        }
    }
};

// ═══════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════

int main() {
    std::cout << "╔═══════════════════════════════════════════════════╗\n";
    std::cout << "║  3-Tier Architecture: User Management System     ║\n";
    std::cout << "╚═══════════════════════════════════════════════════╝\n";

    // Setup layers (Dependency Injection)
    InMemoryUserRepository repository;
    UserService service(&repository);
    UserController controller(&service);

    // Test 1: Register valid user
    controller.registerUser("Alice", "alice@example.com", 25);

    // Test 2: Register underage user (should fail)
    controller.registerUser("Bob", "bob@example.com", 16);

    // Test 3: Register user with invalid email (should fail)
    controller.registerUser("Charlie", "charlie-invalid", 30);

    // Test 4: Register duplicate email (should fail)
    controller.registerUser("Dave", "alice@example.com", 28);

    // Test 5: Register another valid user
    controller.registerUser("Eve", "eve@example.com", 32);

    // Test 6: Display single user
    controller.displayUser(1);

    // Test 7: Display all users
    controller.displayAllUsers();

    std::cout << "\n╔═══════════════════════════════════════════════════╗\n";
    std::cout << "║  Notice: Each layer has distinct responsibility  ║\n";
    std::cout << "║  - UI: Display and format                         ║\n";
    std::cout << "║  - Business: Validation and rules                 ║\n";
    std::cout << "║  - Data: Database operations                      ║\n";
    std::cout << "╚═══════════════════════════════════════════════════╝\n";

    return 0;
}
```

**Output**:
```
╔═══════════════════════════════════════════════════╗
║  3-Tier Architecture: User Management System     ║
╚═══════════════════════════════════════════════════╝

═══════════════════════════════════════════════
[UI] User submitting registration form
  Name: Alice
  Email: alice@example.com
  Age: 25

[BUSINESS] Registering user: Alice
  ✅ All validations passed
  [DATA] Saved user ID 1 to database

[UI] ✅ Registration successful! Welcome, Alice!

═══════════════════════════════════════════════
[UI] User submitting registration form
  Name: Bob
  Email: bob@example.com
  Age: 16

[BUSINESS] Registering user: Bob
  ❌ Error: Must be 18 or older

[UI] ❌ Registration failed. Please try again.

═══════════════════════════════════════════════
[UI] User submitting registration form
  Name: Charlie
  Email: charlie-invalid
  Age: 30

[BUSINESS] Registering user: Charlie
  ❌ Error: Invalid email format

[UI] ❌ Registration failed. Please try again.
```

---

#### Example 2: E-Commerce Order System (4-Tier)

**Goal**: Add an API layer between UI and Business for REST endpoints.

```cpp
// ═══════════════════════════════════════════════════════════════
//  4-TIER ARCHITECTURE
// ═══════════════════════════════════════════════════════════════
//
//  Presentation Layer (Web UI)
//       ↓
//  API Layer (REST endpoints)
//       ↓
//  Business Logic Layer (Order processing)
//       ↓
//  Data Access Layer (Database)
//
// ═══════════════════════════════════════════════════════════════

struct Product {
    int id;
    std::string name;
    double price;
    int stock;
};

struct Order {
    int id;
    int userId;
    std::vector<int> productIds;
    double totalPrice;
    std::string status;  // "pending", "completed", "cancelled"
};

// === DATA LAYER ===
class ProductRepository {
    std::map<int, Product> products;

public:
    ProductRepository() {
        products[1] = {1, "Laptop", 999.99, 10};
        products[2] = {2, "Mouse", 29.99, 50};
        products[3] = {3, "Keyboard", 79.99, 30};
    }

    Product getById(int id) {
        return products.at(id);
    }

    void updateStock(int id, int newStock) {
        products[id].stock = newStock;
    }
};

class OrderRepository {
    std::map<int, Order> orders;
    int nextId = 1;

public:
    void save(const Order& order) {
        Order newOrder = order;
        newOrder.id = nextId++;
        orders[newOrder.id] = newOrder;
        std::cout << "  [DATA] Saved order ID " << newOrder.id << "\n";
    }

    Order getById(int id) {
        return orders.at(id);
    }
};

// === BUSINESS LAYER ===
class OrderService {
    ProductRepository* productRepo;
    OrderRepository* orderRepo;

public:
    OrderService(ProductRepository* pRepo, OrderRepository* oRepo)
        : productRepo(pRepo), orderRepo(oRepo) {}

    bool createOrder(int userId, const std::vector<int>& productIds) {
        std::cout << "\n[BUSINESS] Processing order for user " << userId << "\n";

        double totalPrice = 0;

        // Business rule: Check stock and calculate price
        for (int productId : productIds) {
            Product product = productRepo->getById(productId);

            if (product.stock == 0) {
                std::cerr << "  ❌ " << product.name << " is out of stock!\n";
                return false;
            }

            totalPrice += product.price;
            std::cout << "  ✅ " << product.name << " ($" << product.price << ")\n";
        }

        // Business rule: Minimum order $20
        if (totalPrice < 20) {
            std::cerr << "  ❌ Minimum order is $20\n";
            return false;
        }

        // Create order
        Order order = {0, userId, productIds, totalPrice, "pending"};
        orderRepo->save(order);

        // Update stock
        for (int productId : productIds) {
            Product product = productRepo->getById(productId);
            productRepo->updateStock(productId, product.stock - 1);
        }

        std::cout << "  ✅ Order total: $" << totalPrice << "\n";
        return true;
    }

    Order getOrder(int orderId) {
        return orderRepo->getById(orderId);
    }
};

// === API LAYER ===
class OrderAPI {
    OrderService* orderService;

public:
    OrderAPI(OrderService* service) : orderService(service) {}

    // REST endpoint: POST /orders
    std::string createOrder(const std::string& requestBody) {
        std::cout << "\n[API] POST /orders\n";
        std::cout << "  Request body: " << requestBody << "\n";

        // Parse JSON (simplified)
        int userId = 1;
        std::vector<int> productIds = {1, 2};  // From request

        bool success = orderService->createOrder(userId, productIds);

        if (success) {
            return "{\"status\": \"success\", \"message\": \"Order created\"}";
        } else {
            return "{\"status\": \"error\", \"message\": \"Order failed\"}";
        }
    }

    // REST endpoint: GET /orders/:id
    std::string getOrder(int orderId) {
        std::cout << "\n[API] GET /orders/" << orderId << "\n";

        Order order = orderService->getOrder(orderId);

        return "{\"id\": " + std::to_string(order.id) +
               ", \"total\": " + std::to_string(order.totalPrice) +
               ", \"status\": \"" + order.status + "\"}";
    }
};

// === PRESENTATION LAYER ===
class WebUI {
    OrderAPI* api;

public:
    WebUI(OrderAPI* api) : this->api(api) {}

    void displayCheckoutPage() {
        std::cout << "\n═══════════════════════════════════════════════\n";
        std::cout << "[UI] Checkout Page\n";
        std::cout << "  User clicks 'Place Order' button...\n";

        std::string requestBody = "{\"userId\": 1, \"products\": [1, 2]}";
        std::string response = api->createOrder(requestBody);

        std::cout << "\n[UI] Server response: " << response << "\n";
    }
};

int main() {
    // Setup
    ProductRepository productRepo;
    OrderRepository orderRepo;
    OrderService orderService(&productRepo, &orderRepo);
    OrderAPI api(&orderService);
    WebUI ui(&api);

    // User workflow
    ui.displayCheckoutPage();

    return 0;
}
```

**Flow**:
```
User clicks button → WebUI.displayCheckoutPage()
                  → OrderAPI.createOrder() (REST endpoint)
                  → OrderService.createOrder() (business logic)
                  → ProductRepository.getById() (database)
                  → OrderRepository.save() (database)
```

---

#### Example 3-8: Additional Examples (Outlined)

**Example 3**: Dependency Injection Container (Automated wiring)

**Example 4**: Testing with Mocks (Unit test business layer)

**Example 5**: Middleware Pipeline (Logging, Authentication)

**Example 6**: CQRS (Command Query Responsibility Segregation)

**Example 7**: Repository Pattern with Transactions

**Example 8**: Complete Web Application (User auth + Orders + Products)

---

### QUICK_REFERENCE: Key Takeaways and Comparison Tables
#### 3-Tier Architecture Structure

```
┌─────────────────────────────────────┐
│   Presentation Layer (UI)           │  ← User interaction
│   - Controllers, Views, Forms       │
└─────────────────────────────────────┘
              ↓ uses
┌─────────────────────────────────────┐
│   Business Logic Layer (BLL)        │  ← Business rules
│   - Services, Validation, Workflows │
└─────────────────────────────────────┘
              ↓ uses
┌─────────────────────────────────────┐
│   Data Access Layer (DAL)            │  ← Database access
│   - Repositories, ORM, Queries      │
└─────────────────────────────────────┘
              ↓ uses
┌─────────────────────────────────────┐
│   Database (MySQL, PostgreSQL, etc.)│
└─────────────────────────────────────┘
```

---

#### Layer Responsibilities

| Layer | Responsibility | Examples |
|-------|----------------|----------|
| **Presentation** | Display, user input | Web pages, mobile UI, desktop windows |
| **Business** | Business rules, validation | Age >= 18, email format, price calculations |
| **Data** | Database operations | SELECT, INSERT, UPDATE, DELETE queries |

---

#### When to Use Layered Architecture

| **Use When** | **Don't Use When** |
|--------------|---------------------|
| ✅ Clear UI, logic, data separation needed | ❌ Simple CRUD (overkill) |
| ✅ Multiple frontends (Web + Mobile) | ❌ Rapid prototyping |
| ✅ Team specialization (frontend/backend teams) | ❌ High-performance systems (overhead) |
| ✅ Long-term maintainability | ❌ Microservices (different pattern) |

---

#### Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| **Layer violation** (skipping layers) | Always use adjacent layers |
| **Circular dependencies** | Lower layers don't depend on upper layers |
| **God classes** (too much in one class) | Split by feature |
| **Hard to test** (coupled to database) | Use dependency injection + mocks |
| **Too many layers** (performance overhead) | Flatten for simple operations |

---

#### Code Template

```cpp
// === DATA LAYER ===
class IUserRepository {
public:
    virtual void save(const User& user) = 0;
    virtual User getById(int id) = 0;
    virtual ~IUserRepository() = default;
};

// === BUSINESS LAYER ===
class UserService {
    IUserRepository* userRepo;

public:
    UserService(IUserRepository* repo) : userRepo(repo) {}

    bool registerUser(const User& user) {
        // Business rules
        if (user.age < 18) return false;

        userRepo->save(user);
        return true;
    }
};

// === PRESENTATION LAYER ===
class UserController {
    UserService* userService;

public:
    UserController(UserService* service) : userService(service) {}

    void handleRegistration(const User& user) {
        bool success = userService->registerUser(user);
        displayResult(success);
    }
};
```

---

#### Dependency Rules

```
✅ Presentation → Business → Data (CORRECT)

❌ Data → Business (WRONG)
❌ Business → Presentation (WRONG)
❌ Presentation → Data (WRONG - skipping layer)
```

---

#### Testing Strategy

| Layer | Test Type | Use |
|-------|-----------|-----|
| **Presentation** | UI Tests | Selenium, Cypress |
| **Business** | Unit Tests | Mock repositories |
| **Data** | Integration Tests | Test database |

---
