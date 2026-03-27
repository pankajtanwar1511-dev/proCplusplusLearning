### PRACTICE_TASKS: Output Prediction and Code Analysis
#### Q1

**Goal**: Create a complete 3-tier system for managing Products.

**Requirements**:
1. **Data Layer**: `ProductRepository` with save(), getById(), getAll(), update(), delete()
2. **Business Layer**: `ProductService` with business rules:
   - Price must be > 0
   - Stock must be >= 0
   - Name must not be empty
3. **Presentation Layer**: `ProductController` with UI methods

**Test Cases**:
- Add valid product
- Try to add product with negative price (should fail)
- Update product stock
- Display all products

---

#### Q2

**Goal**: Refactor Task 1 to use dependency injection.

**Requirements**:
1. Create `IProductRepository` interface
2. `ProductService` depends on `IProductRepository*` (constructor injection)
3. `ProductController` depends on `ProductService*`
4. Create a mock `MockProductRepository` for testing

---

#### Q3

**Goal**: Create generic repository base class.

**Requirements**:
1. `IRepository<T>` interface with:
   - `save(T entity)`
   - `getById(int id)`
   - `getAll()`
   - `update(T entity)`
   - `remove(int id)`
2. `ProductRepository` implements `IRepository<Product>`
3. `UserRepository` implements `IRepository<User>`

---

#### Q4

**Goal**: Implement logging decorator for all service methods.

**Requirements**:
1. `LoggingDecorator<T>` template class
2. Wraps any service
3. Logs method calls and results
4. Test with `ProductService`

**Expected Output**:
```
[LOG] ProductService.addProduct() called
[LOG] ProductService.addProduct() completed successfully
```

---

#### Q5

**Goal**: Add compile-time checks to prevent layer violations.

**Requirements**:
1. Organize code into separate namespaces/modules:
   - `presentation::`
   - `business::`
   - `data::`
2. Ensure `data::` cannot #include files from `business::` or `presentation::`
3. Write test that verifies dependencies

---

#### Task 6: Implement 4-Tier Architecture

**Goal**: Add API layer between Presentation and Business.

**Requirements**:
1. **API Layer**: `ProductAPI` with REST-style methods:
   - `createProduct(requestBody)` → returns JSON
   - `getProduct(id)` → returns JSON
2. **Presentation Layer**: Calls API methods
3. Test complete flow: UI → API → Business → Data

---

#### Task 7: Add Unit Tests with Mocks

**Goal**: Write unit tests for Business layer using mocks.

**Requirements**:
1. `MockProductRepository` implements `IProductRepository`
2. Test `ProductService.addProduct()`:
   - Test valid product (should call `repo.save()`)
   - Test invalid price (should NOT call `repo.save()`)
3. Verify mock was called correctly

---

#### Task 8: Implement Error Handling Across Layers

**Goal**: Handle errors consistently across all layers.

**Requirements**:
1. Data layer throws `DataException`
2. Business layer catches `DataException`, throws `BusinessException`
3. Presentation layer catches `BusinessException`, displays user-friendly message

**Example Flow**:
```
Data layer: throw DataException("Database connection failed")
     ↓
Business layer: catch, wrap in BusinessException("Unable to save product")
     ↓
Presentation layer: catch, display "Error: Unable to save product. Try again later."
```

---

#### Task 9: Implement Caching in Service Layer

**Goal**: Add caching to reduce database calls.

**Requirements**:
1. `ProductService` has `cache` map
2. `getProductById()` checks cache first
3. If miss, query database and store in cache
4. Invalidate cache on `update()` and `delete()`

---

#### Task 10: Implement Transaction Support

**Goal**: Execute multiple database operations atomically.

**Requirements**:
1. `beginTransaction()`, `commit()`, `rollback()` in repository
2. Service method that saves multiple entities in one transaction
3. If any save fails, rollback all changes

**Example**:
```cpp
void transferMoney(int fromId, int toId, double amount) {
    accountRepo.beginTransaction();
    try {
        accountRepo.deduct(fromId, amount);
        accountRepo.add(toId, amount);
        accountRepo.commit();
    } catch (...) {
        accountRepo.rollback();
    }
}
```

---

#### Task 11-20: Additional Tasks (Outlined)

**Task 11**: Implement DTO (Data Transfer Object) pattern

**Task 12**: Add authentication middleware

**Task 13**: Implement CQRS (separate read and write models)

**Task 14**: Add pagination to repository queries

**Task 15**: Implement soft delete (mark as deleted, don't actually remove)

**Task 16**: Add validation using Strategy pattern

**Task 17**: Implement audit logging (track who changed what)

**Task 18**: Add authorization (role-based access control)

**Task 19**: Implement connection pooling in Data layer

**Task 20**: Build complete e-commerce system (users, products, orders, payments)

---
