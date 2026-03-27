### PRACTICE_TASKS: Output Prediction and Code Analysis
#### Q1

**Goal**: Create an ECS framework with entities, components, and one system.

**Requirements**:
1. `EntityManager` to create entity IDs
2. `ComponentManager` to store components (use `std::unordered_map`)
3. Two components: `Position {x, y}` and `Velocity {dx, dy}`
4. `MovementSystem` that updates positions
5. Test with 3 entities (2 movable, 1 static)

**Expected Output**:
```
Entity 0 moved to (1, 0.5)
Entity 1 moved to (9.5, 10)
Entity 2: no movement (no Velocity component)
```

---

#### Q2

**Goal**: Extend Task 1 with health and collision detection.

**Requirements**:
1. Add `HealthComponent {hp}` and `ColliderComponent {radius}`
2. `CollisionSystem` checks distance between entities
3. If colliding, reduce both entities' health by 10
4. `HealthSystem` prints message when HP ≤ 0

**Test Case**:
- Player at (0, 0), moving right (velocity = 1, 0)
- Enemy at (5, 0), moving left (velocity = -1, 0)
- Should collide around frame 3

---

#### Q3

**Goal**: Write a generic `getEntitiesWith<Components...>()` function.

**Requirements**:
1. Template function that accepts multiple component types
2. Returns vector of entity IDs that have ALL specified components
3. Use fold expressions or recursion

**Example Usage**:
```cpp
auto movableEntities = cm.getEntitiesWith<Position, Velocity>();
auto damageable = cm.getEntitiesWith<Health, Collider>();
```

---

#### Q4

**Goal**: Safely destroy entities during system iteration.

**Requirements**:
1. `queueDestroy(EntityID)` adds to destruction queue
2. `processDestructionQueue()` removes entities at end of frame
3. Test by iterating over entities and destroying some mid-loop

**Test Case**:
```cpp
for (EntityID e : entities) {
    if (someCondition(e)) {
        entityManager.queueDestroy(e);  // Don't destroy immediately
    }
}
entityManager.processDestructionQueue();  // Destroy after loop
```

---

#### Q5

**Goal**: Create a system scheduler with priority-based execution.

**Requirements**:
1. `SystemScheduler` class with `addSystem(System*, priority)`
2. Systems sorted by priority
3. `update()` runs all systems in order

**Test Case**:
```cpp
scheduler.addSystem(&movementSystem, 100);
scheduler.addSystem(&collisionSystem, 200);
scheduler.addSystem(&renderSystem, 300);
scheduler.update();  // Runs in order: movement → collision → render
```

---

#### Q6

**Goal**: Group entities with same components for cache locality.

**Requirements**:
1. `Archetype<Components...>` class stores entities
2. Components stored in separate contiguous arrays
3. `addEntity()` and `removeEntity()` methods

**Example**:
```cpp
Archetype<Position, Velocity> movable;
movable.addEntity(0, Position{0, 0}, Velocity{1, 0});
```

---

#### Q7

**Goal**: Change entity behavior by adding/removing components at runtime.

**Requirements**:
1. `addComponent()` and `removeComponent()` methods
2. Test with invincibility power-up (temporary component)
3. After 5 seconds, remove invincibility component

**Test Case**:
```cpp
addComponent(player, InvincibleComponent{5.0f});
// Player takes no damage for 5 seconds
// After 5 seconds, remove component → player can be damaged again
```

---

#### Q8

**Goal**: Ensure `VelocityComponent` can only be added if `PositionComponent` exists.

**Requirements**:
1. Check for dependencies when adding components
2. Throw exception if dependency not met

**Test Case**:
```cpp
addComponent(entity, VelocityComponent{1, 0});  // ❌ Error! No Position
addComponent(entity, PositionComponent{0, 0});
addComponent(entity, VelocityComponent{1, 0});  // ✅ OK
```

---

#### Q9

**Goal**: Prevent use-after-free with versioned entity IDs.

**Requirements**:
1. `EntityID` struct with `{id, generation}`
2. Increment generation when entity destroyed
3. `isValid(EntityID)` checks if generation matches

**Test Case**:
```cpp
EntityID e1 = createEntity();  // {id: 0, gen: 0}
destroyEntity(e1);
EntityID e2 = createEntity();  // {id: 0, gen: 1} (reused ID!)
isValid(e1);  // false (gen 0 != gen 1)
isValid(e2);  // true
```

---

#### Q10

**Goal**: Use sparse sets for fast iteration and O(1) add/remove.

**Requirements**:
1. `SparseSet<T>` class with:
   - `dense` array (packed components)
   - `sparse` array (entity ID → dense index mapping)
2. `add()`, `remove()`, `get()` methods

**Expected Complexity**:
- Add: O(1)
- Remove: O(1) (swap with last element)
- Iteration: O(n) over dense array (cache-friendly)

---

#### Additional Tasks 11-20 (Outlined)

**Task 11**: Implement event system for entity destruction notifications

**Task 12**: Create a serialization system (save/load entities to JSON)

**Task 13**: Implement component groups (pre-filtered entity lists)

**Task 14**: Write a multithreaded system scheduler (systems run in parallel if safe)

**Task 15**: Implement singleton components (global state shared across all entities)

**Task 16**: Create entity prefabs (templates for spawning entities)

**Task 17**: Implement reactive systems (trigger only on component add/remove)

**Task 18**: Write a debugging visualizer (print all entities and their components)

**Task 19**: Implement component pooling (reuse component memory)

**Task 20**: Build a complete mini-game using ECS (player, enemies, bullets, power-ups)

---
