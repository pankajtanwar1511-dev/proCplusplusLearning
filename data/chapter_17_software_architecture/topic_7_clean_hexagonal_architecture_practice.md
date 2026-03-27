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
