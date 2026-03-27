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
