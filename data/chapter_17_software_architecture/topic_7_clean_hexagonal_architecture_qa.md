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
