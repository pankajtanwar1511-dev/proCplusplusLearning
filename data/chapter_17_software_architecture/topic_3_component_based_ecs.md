# Topic 3: Component-Based Architecture (Entity-Component-System)

### THEORY_SECTION: Core Concepts and Foundations
#### What is Component-Based Architecture?

**Component-Based Architecture** is a design pattern where you build objects by **composing** them from smaller, reusable pieces (components) rather than using inheritance hierarchies.

**Entity-Component-System (ECS)** is a specific implementation of component-based architecture that separates:
- **Entities**: Unique IDs (like "Player", "Enemy", "Car")
- **Components**: Pure data (like Position, Velocity, Health)
- **Systems**: Logic that operates on components (like MovementSystem, RenderSystem)

---

#### Simple Explanation: LEGO Blocks Analogy

Imagine building with LEGO:

| Traditional Inheritance | Component-Based (ECS) |
|-------------------------|----------------------|
| **Pre-built toy models** | **Individual LEGO blocks** |
| You buy "Car toy", "Robot toy" | You buy blocks: wheels, arms, body parts |
| Limited to what's pre-built | Combine any blocks to create anything |
| Hard to mix parts (robot with car wheels?) | Easy to mix: robot with wheels! |
| **"IS-A" relationship** | **"HAS-A" relationship** |
| Car IS-A Vehicle | Car HAS wheels, engine, body |

**Key Insight**: Instead of saying "A car **IS-A** vehicle", you say "A car **HAS** position, velocity, and mesh components".

---

#### Why Use Component-Based Architecture?

#### Problem with Deep Inheritance

```
                  GameObject
                      |
          +-----------+-----------+
          |                       |
    PhysicsObject          RenderableObject
          |                       |
    +-----+-----+           +-----+-----+
    |           |           |           |
MovableObject StaticObject VisibleObject AnimatedObject
    |
FlyingObject
    |
  Player
```

**Problems:**
1. **Fragile**: Change one class → breaks everything below
2. **Rigid**: Can't have "visible but not physical" easily
3. **Code Duplication**: Flying logic duplicated if you need "flying enemy"
4. **Hard to Extend**: Want a "flying, animated, physics-enabled" object? Create 10 parent classes?

#### Solution: Composition

```
Entity ID: 1001 (Player)
Components:
  - PositionComponent {x: 10, y: 5}
  - VelocityComponent {dx: 2, dy: 0}
  - HealthComponent {hp: 100}
  - MeshComponent {model: "player.obj"}

Entity ID: 1002 (Enemy)
Components:
  - PositionComponent {x: 20, y: 5}
  - VelocityComponent {dx: -1, dy: 0}
  - HealthComponent {hp: 50}
  - AIComponent {behavior: "patrol"}
```

**Benefits:**
- ✅ **Flexible**: Mix any components
- ✅ **Reusable**: Same components for Player and Enemy
- ✅ **Maintainable**: Change one component doesn't affect others
- ✅ **Data-Oriented**: Components are pure data → cache-friendly

---

#### Core ECS Concepts

#### 1. Entities (Just IDs)

An **entity** is just a **unique identifier** (like an integer ID). It represents "something" in your system but holds NO DATA and NO LOGIC.

```cpp
using EntityID = uint32_t;

EntityID player = 1001;
EntityID enemy = 1002;
EntityID bullet = 1003;
```

**Think of it as**: A label or tag. Like a student ID number.

---

#### 2. Components (Pure Data)

A **component** is a **plain struct** holding data. No methods, no logic.

```cpp
struct PositionComponent {
    float x, y;
};

struct VelocityComponent {
    float dx, dy;
};

struct HealthComponent {
    int hp;
};
```

**Think of it as**: Attributes or properties. Like "height", "weight", "age" on a form.

**Key Rule**: Components should be **POD (Plain Old Data)** - simple structs with no complex methods.

---

#### 3. Systems (Pure Logic)

A **system** contains **logic** that operates on entities with specific components.

```cpp
class MovementSystem {
public:
    void update(float dt, ComponentManager& components) {
        // For each entity that has BOTH Position and Velocity
        for (auto entity : entitiesWithComponents<Position, Velocity>()) {
            auto& pos = components.get<Position>(entity);
            auto& vel = components.get<Velocity>(entity);

            pos.x += vel.dx * dt;
            pos.y += vel.dy * dt;
        }
    }
};
```

**Think of it as**: Workers who process data. Like a cashier (processes payments), chef (processes orders).

**Key Rule**: Systems should be **stateless** - they don't store data, they process components.

---

#### How ECS Works: Step-by-Step

Let's simulate a simple game frame:

```
Frame 1:
┌─────────────────────────────────────────────────┐
│ 1. CREATE ENTITIES                              │
│    - Player (ID: 1)                             │
│    - Enemy (ID: 2)                              │
└─────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────┐
│ 2. ADD COMPONENTS                               │
│    Entity 1: Position(0,0), Velocity(1,0), HP   │
│    Entity 2: Position(10,0), Velocity(-1,0), HP │
└─────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────┐
│ 3. SYSTEMS PROCESS                              │
│    MovementSystem → updates positions           │
│    CollisionSystem → checks if entities collide │
│    RenderSystem → draws entities on screen      │
└─────────────────────────────────────────────────┘
         ↓
Frame 2: Repeat step 3
```

---

#### ECS vs Traditional OOP

| Traditional OOP | Entity-Component-System |
|-----------------|-------------------------|
| **Inheritance hierarchy** | **Composition** |
| `Player extends GameObject` | `Player = {Position, Velocity, Health}` |
| **Data + Logic together** | **Data separate from Logic** |
| `class Player { int hp; void takeDamage() }` | `Component: {int hp}` + `System: processDamage()` |
| **Hard to add behaviors** | **Easy to add/remove components** |
| Need to change class hierarchy | Just add/remove components |
| **Cache unfriendly** | **Cache friendly** |
| Objects scattered in memory | Components packed in arrays |
| **Tight coupling** | **Loose coupling** |
| Systems depend on each other | Systems are independent |

---

#### Data-Oriented Design Benefits

ECS is **data-oriented** rather than object-oriented:

```cpp
// ❌ Object-Oriented (cache unfriendly)
class GameObject {
    Position pos;
    Velocity vel;
    Health hp;
    Mesh mesh;
    AI ai;
    // ... many more fields
};

std::vector<GameObject*> objects;  // Scattered in memory

for (auto obj : objects) {
    obj->update();  // Cache misses! Each object far apart in memory
}

// ✅ Data-Oriented (cache friendly)
std::vector<Position> positions;  // All positions together
std::vector<Velocity> velocities; // All velocities together

for (size_t i = 0; i < positions.size(); i++) {
    positions[i].x += velocities[i].dx;  // Sequential memory access!
}
```

**Why This Matters**:
- **Cache locality**: Data used together is stored together
- **SIMD-friendly**: Can vectorize operations
- **Multithreading**: Systems can run in parallel (no shared state)

---

#### When to Use ECS

| **Use ECS When** | **Don't Use ECS When** |
|------------------|------------------------|
| ✅ Need high flexibility (add/remove behaviors) | ❌ Simple, small projects |
| ✅ Performance critical (games, simulations) | ❌ Few entity types (< 5) |
| ✅ Many entity types (100+ types) | ❌ Deep business logic (banking, e-commerce) |
| ✅ Data-driven design (load entities from files) | ❌ Complex inheritance makes sense |
| ✅ Runtime composition (mod support) | ❌ Team unfamiliar with ECS |

**Example Use Cases**:
- ✅ Game engines (Unity uses ECS)
- ✅ Physics simulations (particle systems)
- ✅ Robotics (sensor components + actuator systems)
- ✅ Entity management in MMOs

---

#### Common ECS Implementations

#### Approach 1: Component Manager (Simple)

```cpp
class ComponentManager {
    std::map<EntityID, std::map<std::type_index, void*>> components;

public:
    template<typename T>
    void addComponent(EntityID entity, T component) {
        components[entity][typeid(T)] = new T(component);
    }

    template<typename T>
    T& getComponent(EntityID entity) {
        return *static_cast<T*>(components[entity][typeid(T)]);
    }
};
```

**Pros**: Simple to understand
**Cons**: Slow (pointer indirection, not cache-friendly)

---

#### Approach 2: Archetypes (Cache-Friendly)

Entities with same component combination share storage:

```
Archetype 1: [Position, Velocity, Health]
  Entity 1: {pos, vel, hp}
  Entity 2: {pos, vel, hp}

Archetype 2: [Position, Mesh]
  Entity 3: {pos, mesh}
  Entity 4: {pos, mesh}
```

**Pros**: Cache-friendly (same components together)
**Cons**: Moving entities between archetypes is expensive

---

#### Approach 3: Sparse Sets (Fast Iteration)

Each component type has its own sparse set:

```cpp
template<typename T>
class SparseSet {
    std::vector<EntityID> dense;   // Packed entity IDs
    std::vector<T> components;      // Packed components
    std::vector<size_t> sparse;     // EntityID → index mapping
};
```

**Pros**: Fast iteration, fast add/remove
**Cons**: More memory (sparse array)

---

#### Real-World Example: Unity's DOTS

Unity's Data-Oriented Technology Stack (DOTS) uses ECS:

```csharp
// Entity (just an ID)
Entity player = entityManager.CreateEntity();

// Add components
entityManager.AddComponent<Position>(player, new Position { x = 0, y = 0 });
entityManager.AddComponent<Velocity>(player, new Velocity { dx = 1, dy = 0 });

// System processes components
public class MovementSystem : SystemBase {
    protected override void OnUpdate() {
        Entities.ForEach((ref Position pos, in Velocity vel) => {
            pos.x += vel.dx * deltaTime;
            pos.y += vel.dy * deltaTime;
        }).Run();
    }
}
```

**Result**: Unity saw **4x-10x performance improvements** in some cases!

---

### EDGE_CASES: Tricky Scenarios and Deep Internals
#### Edge Case 1: Component Dependencies

**Problem**: Some components depend on others. Example: `VelocityComponent` needs `PositionComponent` to be useful.

**Naive Code**:
```cpp
void MovementSystem::update() {
    for (EntityID entity : entities) {
        // What if entity has Velocity but no Position?
        auto& vel = components.get<Velocity>(entity);
        auto& pos = components.get<Position>(entity);  // ❌ Crash if missing!

        pos.x += vel.dx;
    }
}
```

**Why It Fails**:
- Entity might have `Velocity` component but no `Position` component
- Calling `get<Position>()` on such an entity crashes

**Solution 1: Query System (Check Before Use)**

```cpp
class ComponentManager {
public:
    template<typename... Components>
    std::vector<EntityID> getEntitiesWith() {
        std::vector<EntityID> result;
        for (auto& [entity, componentMap] : allComponents) {
            if ((hasComponent<Components>(entity) && ...)) {
                result.push_back(entity);
            }
        }
        return result;
    }
};

void MovementSystem::update() {
    // Only iterate entities that have BOTH Position AND Velocity
    for (EntityID entity : components.getEntitiesWith<Position, Velocity>()) {
        auto& pos = components.get<Position>(entity);
        auto& vel = components.get<Velocity>(entity);

        pos.x += vel.dx;  // ✅ Safe! We know both exist
    }
}
```

**Solution 2: Component Groups (Pre-filtered)**

```cpp
class ComponentGroup {
    std::vector<EntityID> entities;  // Pre-filtered entities

public:
    void addEntity(EntityID entity) {
        entities.push_back(entity);
    }

    void removeEntity(EntityID entity) {
        entities.erase(std::remove(entities.begin(), entities.end(), entity));
    }
};

// Create group for entities with Position + Velocity
ComponentGroup movableGroup;

// When adding components, update groups
void addComponent(EntityID entity, VelocityComponent vel) {
    components[entity] = vel;
    if (hasComponent<Position>(entity)) {
        movableGroup.addEntity(entity);  // Add to group
    }
}

void MovementSystem::update() {
    for (EntityID entity : movableGroup.entities) {
        // All entities guaranteed to have Position + Velocity
        auto& pos = components.get<Position>(entity);
        auto& vel = components.get<Velocity>(entity);
        pos.x += vel.dx;
    }
}
```

**Lesson**: Always validate component existence OR use query/group systems to pre-filter.

---

#### Edge Case 2: System Execution Order

**Problem**: Systems may depend on each other's results. Example: `CollisionSystem` needs updated positions from `MovementSystem`.

**Naive Code**:
```cpp
void gameLoop() {
    collisionSystem.update();  // ❌ Uses old positions!
    movementSystem.update();   // Updates positions AFTER collision check
}
```

**Why It Fails**:
- Collision system checks collisions using **last frame's positions**
- Movement happens **after** collision, so entities might be inside each other!

**Example Scenario**:
```
Frame 1:
  Player at x=5, moving right (velocity=1)
  Wall at x=10

  1. CollisionSystem: Check if player at x=5 hits wall → NO
  2. MovementSystem: Move player to x=6

Frame 2:
  Player at x=6, moving right

  1. CollisionSystem: Check if player at x=6 hits wall → NO
  ... continues until player at x=11 (INSIDE wall!)
```

**Solution 1: Explicit System Order**

```cpp
class SystemManager {
    std::vector<System*> systems;

public:
    void addSystem(System* system, int priority) {
        systems.push_back(system);
        std::sort(systems.begin(), systems.end(), [](System* a, System* b) {
            return a->priority < b->priority;
        });
    }

    void update() {
        for (auto* system : systems) {
            system->update();
        }
    }
};

// Usage
systemManager.addSystem(&movementSystem, 100);     // Run first
systemManager.addSystem(&collisionSystem, 200);    // Run after movement
systemManager.addSystem(&renderSystem, 300);       // Run last
```

**Solution 2: System Dependencies (Graph)**

```cpp
class System {
public:
    std::vector<System*> dependencies;

    virtual void update() = 0;
};

class SystemScheduler {
public:
    void scheduleSystem(System* system) {
        // Topological sort based on dependencies
        // Ensures dependencies run before dependents
    }
};

// Usage
movementSystem.dependencies = {};  // No dependencies
collisionSystem.dependencies = {&movementSystem};  // Depends on movement
renderSystem.dependencies = {&movementSystem, &collisionSystem};

scheduler.scheduleSystem(&renderSystem);  // Auto-schedules dependencies
```

**Solution 3: Multi-Phase Updates**

```cpp
void gameLoop() {
    // Phase 1: Update physics
    movementSystem.update();
    gravitySystem.update();

    // Phase 2: Resolve collisions
    collisionSystem.update();

    // Phase 3: Update game logic
    aiSystem.update();

    // Phase 4: Render
    renderSystem.update();
}
```

**Lesson**: Explicit system ordering is crucial. Document dependencies clearly.

---

#### Edge Case 3: Component Removal During Iteration

**Problem**: Removing a component while iterating over entities can invalidate iterators.

**Naive Code**:
```cpp
void DamageSystem::update() {
    for (EntityID entity : entities) {
        auto& health = components.get<Health>(entity);
        health.hp -= 10;

        if (health.hp <= 0) {
            components.remove<Health>(entity);  // ❌ Invalidates iterator!
        }
    }
}
```

**Why It Fails**:
- `remove()` modifies the underlying container (vector, map)
- Iterators become invalid → crash or skip entities

**Solution 1: Deferred Removal (Queue)**

```cpp
class ComponentManager {
    std::vector<std::pair<EntityID, std::type_index>> removalQueue;

public:
    void queueRemoval(EntityID entity, std::type_index type) {
        removalQueue.emplace_back(entity, type);
    }

    void processRemovals() {
        for (auto [entity, type] : removalQueue) {
            // Actually remove components
            components[type].erase(entity);
        }
        removalQueue.clear();
    }
};

void DamageSystem::update() {
    for (EntityID entity : entities) {
        auto& health = components.get<Health>(entity);
        health.hp -= 10;

        if (health.hp <= 0) {
            components.queueRemoval(entity, typeid(Health));  // ✅ Safe
        }
    }
}

void gameLoop() {
    damageSystem.update();
    components.processRemovals();  // Remove at end of frame
}
```

**Solution 2: Mark for Deletion (Flag)**

```cpp
struct HealthComponent {
    int hp;
    bool markedForDeletion = false;
};

void DamageSystem::update() {
    for (EntityID entity : entities) {
        auto& health = components.get<Health>(entity);
        if (health.markedForDeletion) continue;  // Skip deleted

        health.hp -= 10;
        if (health.hp <= 0) {
            health.markedForDeletion = true;  // ✅ Safe
        }
    }
}

void cleanup() {
    for (EntityID entity : entities) {
        auto& health = components.get<Health>(entity);
        if (health.markedForDeletion) {
            components.remove<Health>(entity);
        }
    }
}
```

**Solution 3: Reverse Iteration (For Vectors)**

```cpp
void DamageSystem::update() {
    // Iterate backwards so removal doesn't affect unprocessed entities
    for (int i = entities.size() - 1; i >= 0; i--) {
        EntityID entity = entities[i];
        auto& health = components.get<Health>(entity);

        health.hp -= 10;
        if (health.hp <= 0) {
            components.remove<Health>(entity);  // ✅ Safe (already processed)
        }
    }
}
```

**Lesson**: Never mutate a collection while iterating forward. Use deferred operations or reverse iteration.

---

#### Edge Case 4: Entity Lifetime and Dangling References

**Problem**: Destroying an entity while other systems still reference it.

**Naive Code**:
```cpp
EntityID bullet = createEntity();
components.add<Position>(bullet, {10, 5});

// Later...
destroyEntity(bullet);  // Entity destroyed

// Even later...
auto& pos = components.get<Position>(bullet);  // ❌ Bullet no longer exists!
pos.x += 1;  // Crash or undefined behavior
```

**Why It Fails**:
- Entity ID `bullet` is reused for a new entity
- Systems may still hold references to old entity
- Accessing destroyed entity's components → crash

**Solution 1: Generation Counter (Versioned Entities)**

```cpp
struct EntityID {
    uint32_t id;         // Actual ID (0, 1, 2, ...)
    uint32_t generation; // Version (incremented on reuse)
};

class EntityManager {
    std::vector<uint32_t> generations;  // Current generation for each ID
    std::queue<uint32_t> freeIDs;

public:
    EntityID createEntity() {
        uint32_t id = freeIDs.empty() ? generations.size() : freeIDs.front();
        if (!freeIDs.empty()) freeIDs.pop();

        if (id >= generations.size()) generations.resize(id + 1, 0);

        return {id, generations[id]};
    }

    void destroyEntity(EntityID entity) {
        generations[entity.id]++;  // Increment generation
        freeIDs.push(entity.id);    // Reuse ID
    }

    bool isValid(EntityID entity) {
        return entity.generation == generations[entity.id];
    }
};

// Usage
EntityID bullet = entityManager.createEntity();  // {id: 0, gen: 0}
destroyEntity(bullet);
EntityID enemy = entityManager.createEntity();   // {id: 0, gen: 1} (reused ID!)

// Later...
if (entityManager.isValid(bullet)) {  // ✅ Returns false! (gen 0 != gen 1)
    auto& pos = components.get<Position>(bullet);
}
```

**Solution 2: Entity Destruction Events**

```cpp
class EntityManager {
    std::vector<std::function<void(EntityID)>> destructionListeners;

public:
    void onEntityDestroy(std::function<void(EntityID)> callback) {
        destructionListeners.push_back(callback);
    }

    void destroyEntity(EntityID entity) {
        for (auto& listener : destructionListeners) {
            listener(entity);  // Notify all systems
        }
        // Then actually destroy
    }
};

// System clears its references
bulletSystem.init() {
    entityManager.onEntityDestroy([this](EntityID entity) {
        activeBullets.erase(entity);  // Remove from tracking
    });
}
```

**Lesson**: Use versioned IDs or event systems to handle entity lifetime safely.

---

#### Edge Case 5: Over-Granular Components (Bloat)

**Problem**: Creating too many small components makes systems inefficient.

**Naive Code**:
```cpp
struct XComponent { float x; };
struct YComponent { float y; };
struct ZComponent { float z; };

// To move an entity, need 3 component lookups!
auto& x = components.get<XComponent>(entity);
auto& y = components.get<YComponent>(entity);
auto& z = components.get<ZComponent>(entity);
```

**Why It Fails**:
- **Too many lookups**: Each `get<>()` is a hash map lookup
- **Cache unfriendly**: x, y, z stored in different places
- **Verbose**: Need 3 lines for simple position access

**Solution 1: Group Related Data**

```cpp
struct PositionComponent {
    float x, y, z;  // ✅ Grouped together
};

auto& pos = components.get<Position>(entity);
pos.x += vel.dx;
pos.y += vel.dy;
pos.z += vel.dz;
```

**Solution 2: Component Granularity Guidelines**

| **Good Granularity** | **Too Granular** | **Too Coarse** |
|----------------------|------------------|----------------|
| `Position {x, y, z}` | `X{x}, Y{y}, Z{z}` | `GameObject {pos, vel, mesh, ai, ...}` |
| `Velocity {dx, dy, dz}` | `VelocityX`, `VelocityY` | `Physics {pos, vel, accel, mass, ...}` |
| `Health {hp, maxHp}` | `HP{hp}, MaxHP{max}` | `Stats {hp, mp, str, dex, ...}` |

**Rule of Thumb**:
- Group data that's **always used together**
- Separate data that's **used by different systems**

**Example**:
```cpp
// ✅ Good: Position and Velocity separate
// (RenderSystem uses Position, MovementSystem uses both)
struct Position { float x, y, z; };
struct Velocity { float dx, dy, dz; };

// ❌ Bad: Grouped when not always used together
struct PositionAndVelocity {
    float x, y, z;
    float dx, dy, dz;  // Wastes cache when rendering (only need position)
};
```

**Lesson**: Balance between granularity and performance. Group coherent data, separate independent data.

---

#### Edge Case 6: Multithreading Component Access

**Problem**: Multiple systems accessing same components concurrently → data races.

**Naive Code**:
```cpp
// Thread 1: MovementSystem
void MovementSystem::update() {
    auto& pos = components.get<Position>(entity);
    pos.x += vel.dx;  // ❌ Write
}

// Thread 2: RenderSystem (runs in parallel)
void RenderSystem::update() {
    auto& pos = components.get<Position>(entity);  // ❌ Read while writing!
    drawAt(pos.x, pos.y);
}
```

**Why It Fails**:
- **Data race**: One thread writes while another reads
- **Undefined behavior**: Could read partial update

**Solution 1: System Access Patterns (Read/Write Tracking)**

```cpp
class System {
public:
    virtual std::vector<std::type_index> readComponents() = 0;
    virtual std::vector<std::type_index> writeComponents() = 0;
};

class MovementSystem : public System {
    std::vector<std::type_index> readComponents() override {
        return {typeid(Velocity)};
    }
    std::vector<std::type_index> writeComponents() override {
        return {typeid(Position)};
    }
};

class SystemScheduler {
    void scheduleParallel(std::vector<System*> systems) {
        // Analyze read/write patterns
        // Only run systems in parallel if:
        //   - No system writes what another reads
        //   - No two systems write to same component

        if (canRunInParallel(movementSystem, renderSystem)) {
            runParallel(movementSystem, renderSystem);
        } else {
            runSequential(movementSystem, renderSystem);
        }
    }
};
```

**Solution 2: Read-Only vs Read-Write Systems**

```cpp
class RenderSystem {
    void update() {
        // Only READ components (no writes)
        for (EntityID entity : entities) {
            const auto& pos = components.get<Position>(entity);
            drawAt(pos.x, pos.y);
        }
    }
};

// Can run multiple read-only systems in parallel safely
scheduler.runParallel({&renderSystem, &debugDrawSystem, &aiPerceptionSystem});
```

**Solution 3: System Stages (Barriers)**

```cpp
void gameLoop() {
    // Stage 1: Physics (can run in parallel)
    runParallel({&movementSystem, &gravitySystem});

    barrier();  // Wait for all to finish

    // Stage 2: Game logic (can run in parallel)
    runParallel({&collisionSystem, &aiSystem});

    barrier();

    // Stage 3: Rendering (single-threaded)
    renderSystem.update();
}
```

**Lesson**: Track which components each system reads/writes. Use barriers or dependency graphs for safe parallelism.

---

### CODE_EXAMPLES: Practical Demonstrations
#### Example 1: Basic ECS Framework (Simple)

**Goal**: Implement minimal ECS with entities, components, and one system.

```cpp
#include <iostream>
#include <vector>
#include <unordered_map>
#include <typeindex>
#include <memory>

// ═══════════════════════════════════════════════════════════════
//  ENTITIES
// ═══════════════════════════════════════════════════════════════

using EntityID = uint32_t;

class EntityManager {
    EntityID nextID = 0;

public:
    EntityID createEntity() {
        return nextID++;
    }
};

// ═══════════════════════════════════════════════════════════════
//  COMPONENTS (Pure Data)
// ═══════════════════════════════════════════════════════════════

struct PositionComponent {
    float x, y;
};

struct VelocityComponent {
    float dx, dy;
};

// ═══════════════════════════════════════════════════════════════
//  COMPONENT MANAGER
// ═══════════════════════════════════════════════════════════════

class ComponentManager {
    // Map: ComponentType -> (Map: EntityID -> Component)
    std::unordered_map<std::type_index,
        std::unordered_map<EntityID, std::shared_ptr<void>>> components;

public:
    template<typename T>
    void addComponent(EntityID entity, T component) {
        auto typeIndex = std::type_index(typeid(T));
        components[typeIndex][entity] = std::make_shared<T>(component);

        std::cout << "Added " << typeid(T).name()
                  << " to entity " << entity << "\n";
    }

    template<typename T>
    T& getComponent(EntityID entity) {
        auto typeIndex = std::type_index(typeid(T));
        return *std::static_pointer_cast<T>(components[typeIndex][entity]);
    }

    template<typename T>
    bool hasComponent(EntityID entity) {
        auto typeIndex = std::type_index(typeid(T));
        return components[typeIndex].find(entity) != components[typeIndex].end();
    }

    template<typename... Components>
    std::vector<EntityID> getEntitiesWith() {
        std::vector<EntityID> result;

        // Get all entity IDs that have at least one component
        std::set<EntityID> allEntities;
        for (auto& [type, entityMap] : components) {
            for (auto& [entity, comp] : entityMap) {
                allEntities.insert(entity);
            }
        }

        // Check each entity has all required components
        for (EntityID entity : allEntities) {
            if ((hasComponent<Components>(entity) && ...)) {
                result.push_back(entity);
            }
        }

        return result;
    }
};

// ═══════════════════════════════════════════════════════════════
//  SYSTEMS (Pure Logic)
// ═══════════════════════════════════════════════════════════════

class MovementSystem {
public:
    void update(ComponentManager& components, float dt) {
        std::cout << "\n[MovementSystem] Updating...\n";

        // Only process entities with BOTH Position and Velocity
        for (EntityID entity : components.getEntitiesWith<PositionComponent, VelocityComponent>()) {
            auto& pos = components.getComponent<PositionComponent>(entity);
            auto& vel = components.getComponent<VelocityComponent>(entity);

            pos.x += vel.dx * dt;
            pos.y += vel.dy * dt;

            std::cout << "  Entity " << entity
                      << " moved to (" << pos.x << ", " << pos.y << ")\n";
        }
    }
};

// ═══════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════

int main() {
    std::cout << "═══════════════════════════════════════════════════\n";
    std::cout << "  ECS Example 1: Basic Framework\n";
    std::cout << "═══════════════════════════════════════════════════\n\n";

    EntityManager entityManager;
    ComponentManager componentManager;
    MovementSystem movementSystem;

    // Create entities
    EntityID player = entityManager.createEntity();
    EntityID enemy = entityManager.createEntity();
    EntityID staticObstacle = entityManager.createEntity();

    std::cout << "\n--- Creating Entities ---\n";
    std::cout << "Player ID: " << player << "\n";
    std::cout << "Enemy ID: " << enemy << "\n";
    std::cout << "Obstacle ID: " << staticObstacle << "\n";

    // Add components
    std::cout << "\n--- Adding Components ---\n";
    componentManager.addComponent(player, PositionComponent{0, 0});
    componentManager.addComponent(player, VelocityComponent{1, 0.5f});

    componentManager.addComponent(enemy, PositionComponent{10, 10});
    componentManager.addComponent(enemy, VelocityComponent{-0.5f, 0});

    componentManager.addComponent(staticObstacle, PositionComponent{5, 5});
    // No velocity! (static object)

    // Simulate 3 frames
    std::cout << "\n--- Simulating Frames ---\n";
    for (int frame = 1; frame <= 3; frame++) {
        std::cout << "\n========== Frame " << frame << " ==========\n";
        movementSystem.update(componentManager, 1.0f);  // dt = 1.0
    }

    std::cout << "\n═══════════════════════════════════════════════════\n";
    std::cout << "  Notice: Obstacle didn't move (no Velocity component)\n";
    std::cout << "═══════════════════════════════════════════════════\n";

    return 0;
}
```

**Output**:
```
═══════════════════════════════════════════════════
  ECS Example 1: Basic Framework
═══════════════════════════════════════════════════

--- Creating Entities ---
Player ID: 0
Enemy ID: 1
Obstacle ID: 2

--- Adding Components ---
Added PositionComponent to entity 0
Added VelocityComponent to entity 0
Added PositionComponent to entity 1
Added VelocityComponent to entity 1
Added PositionComponent to entity 2

--- Simulating Frames ---

========== Frame 1 ==========

[MovementSystem] Updating...
  Entity 0 moved to (1, 0.5)
  Entity 1 moved to (9.5, 10)

========== Frame 2 ==========

[MovementSystem] Updating...
  Entity 0 moved to (2, 1)
  Entity 1 moved to (9, 10)

========== Frame 3 ==========

[MovementSystem] Updating...
  Entity 0 moved to (3, 1.5)
  Entity 1 moved to (8.5, 10)

═══════════════════════════════════════════════════
  Notice: Obstacle didn't move (no Velocity component)
═══════════════════════════════════════════════════
```

**Key Concepts**:
1. **Entities are just IDs** (uint32_t)
2. **Components are plain structs** (Position, Velocity)
3. **Systems query for entities with specific components**
4. **Composition**: Obstacle has Position but no Velocity → doesn't move

---

#### Example 2: Game with Multiple Systems

**Goal**: Expand to multiple systems (Movement, Collision, Health, Render).

```cpp
#include <iostream>
#include <vector>
#include <unordered_map>
#include <typeindex>
#include <memory>
#include <cmath>

// (Reuse EntityManager and ComponentManager from Example 1)

// ═══════════════════════════════════════════════════════════════
//  COMPONENTS
// ═══════════════════════════════════════════════════════════════

struct PositionComponent {
    float x, y;
};

struct VelocityComponent {
    float dx, dy;
};

struct HealthComponent {
    int hp;
};

struct ColliderComponent {
    float radius;
};

// ═══════════════════════════════════════════════════════════════
//  SYSTEMS
// ═══════════════════════════════════════════════════════════════

class MovementSystem {
public:
    void update(ComponentManager& components, float dt) {
        for (EntityID entity : components.getEntitiesWith<PositionComponent, VelocityComponent>()) {
            auto& pos = components.getComponent<PositionComponent>(entity);
            auto& vel = components.getComponent<VelocityComponent>(entity);

            pos.x += vel.dx * dt;
            pos.y += vel.dy * dt;
        }
    }
};

class CollisionSystem {
public:
    void update(ComponentManager& components) {
        auto entities = components.getEntitiesWith<PositionComponent, ColliderComponent>();

        // Check all pairs
        for (size_t i = 0; i < entities.size(); i++) {
            for (size_t j = i + 1; j < entities.size(); j++) {
                EntityID e1 = entities[i];
                EntityID e2 = entities[j];

                auto& pos1 = components.getComponent<PositionComponent>(e1);
                auto& pos2 = components.getComponent<PositionComponent>(e2);
                auto& col1 = components.getComponent<ColliderComponent>(e1);
                auto& col2 = components.getComponent<ColliderComponent>(e2);

                float dx = pos2.x - pos1.x;
                float dy = pos2.y - pos1.y;
                float distance = std::sqrt(dx*dx + dy*dy);

                if (distance < col1.radius + col2.radius) {
                    std::cout << "  COLLISION: Entity " << e1
                              << " and Entity " << e2 << "\n";

                    // Apply damage if has health
                    if (components.hasComponent<HealthComponent>(e1)) {
                        auto& hp1 = components.getComponent<HealthComponent>(e1);
                        hp1.hp -= 10;
                    }
                    if (components.hasComponent<HealthComponent>(e2)) {
                        auto& hp2 = components.getComponent<HealthComponent>(e2);
                        hp2.hp -= 10;
                    }
                }
            }
        }
    }
};

class HealthSystem {
public:
    void update(ComponentManager& components) {
        for (EntityID entity : components.getEntitiesWith<HealthComponent>()) {
            auto& health = components.getComponent<HealthComponent>(entity);

            if (health.hp <= 0) {
                std::cout << "  Entity " << entity << " DESTROYED (HP: 0)\n";
                // In real implementation, would destroy entity here
            }
        }
    }
};

class RenderSystem {
public:
    void update(ComponentManager& components) {
        std::cout << "\n[Render]\n";
        for (EntityID entity : components.getEntitiesWith<PositionComponent>()) {
            auto& pos = components.getComponent<PositionComponent>(entity);
            std::cout << "  Entity " << entity
                      << " at (" << pos.x << ", " << pos.y << ")";

            if (components.hasComponent<HealthComponent>(entity)) {
                auto& hp = components.getComponent<HealthComponent>(entity);
                std::cout << " [HP: " << hp.hp << "]";
            }
            std::cout << "\n";
        }
    }
};

// ═══════════════════════════════════════════════════════════════
//  GAME LOOP
// ═══════════════════════════════════════════════════════════════

void gameLoop(ComponentManager& components,
              MovementSystem& movement,
              CollisionSystem& collision,
              HealthSystem& health,
              RenderSystem& render,
              int frames) {

    for (int frame = 1; frame <= frames; frame++) {
        std::cout << "\n========== Frame " << frame << " ==========\n";

        movement.update(components, 1.0f);
        collision.update(components);
        health.update(components);
        render.update(components);
    }
}

int main() {
    // Setup (EntityManager, ComponentManager - reused from Example 1)
    EntityManager entityManager;
    ComponentManager componentManager;

    // Create systems
    MovementSystem movementSystem;
    CollisionSystem collisionSystem;
    HealthSystem healthSystem;
    RenderSystem renderSystem;

    // Create entities
    EntityID player = entityManager.createEntity();
    EntityID enemy = entityManager.createEntity();

    // Player: Position, Velocity, Health, Collider
    componentManager.addComponent(player, PositionComponent{0, 0});
    componentManager.addComponent(player, VelocityComponent{1, 0});
    componentManager.addComponent(player, HealthComponent{100});
    componentManager.addComponent(player, ColliderComponent{1.0f});

    // Enemy: Position, Velocity, Health, Collider (moving toward player)
    componentManager.addComponent(enemy, PositionComponent{5, 0});
    componentManager.addComponent(enemy, VelocityComponent{-0.8f, 0});
    componentManager.addComponent(enemy, HealthComponent{50});
    componentManager.addComponent(enemy, ColliderComponent{1.0f});

    // Run game
    gameLoop(componentManager, movementSystem, collisionSystem,
             healthSystem, renderSystem, 5);

    return 0;
}
```

**Output**:
```
========== Frame 1 ==========

[Render]
  Entity 0 at (1, 0) [HP: 100]
  Entity 1 at (4.2, 0) [HP: 50]

========== Frame 2 ==========

[Render]
  Entity 0 at (2, 0) [HP: 100]
  Entity 1 at (3.4, 0) [HP: 50]

========== Frame 3 ==========
  COLLISION: Entity 0 and Entity 1

[Render]
  Entity 0 at (3, 0) [HP: 90]
  Entity 1 at (2.6, 0) [HP: 40]

========== Frame 4 ==========
  COLLISION: Entity 0 and Entity 1

[Render]
  Entity 0 at (4, 0) [HP: 80]
  Entity 1 at (1.8, 0) [HP: 30]
```

**Key Concepts**:
- **Multiple systems** working together
- **System execution order** matters (Movement → Collision → Health → Render)
- **Collision detection** using components
- **Damage system** modifying Health component

---

#### Example 3: Dynamic Component Addition (Runtime Composition)

**Goal**: Add/remove components at runtime to change entity behavior.

```cpp
#include <iostream>
#include <vector>
#include <memory>

// (Reuse previous classes)

struct InvincibleComponent {
    float remainingTime;  // Seconds of invincibility
};

class InvincibilitySystem {
public:
    void update(ComponentManager& components, float dt) {
        for (EntityID entity : components.getEntitiesWith<InvincibleComponent>()) {
            auto& invincible = components.getComponent<InvincibleComponent>(entity);
            invincible.remainingTime -= dt;

            if (invincible.remainingTime <= 0) {
                std::cout << "  Entity " << entity << " is no longer invincible!\n";
                components.removeComponent<InvincibleComponent>(entity);
            }
        }
    }
};

class CollisionSystemWithInvincibility {
public:
    void update(ComponentManager& components) {
        auto entities = components.getEntitiesWith<PositionComponent, ColliderComponent>();

        for (size_t i = 0; i < entities.size(); i++) {
            for (size_t j = i + 1; j < entities.size(); j++) {
                EntityID e1 = entities[i];
                EntityID e2 = entities[j];

                // Check collision (same as before)
                // ...

                bool collision = checkCollision(e1, e2, components);
                if (collision) {
                    // Apply damage only if NOT invincible
                    if (!components.hasComponent<InvincibleComponent>(e1) &&
                        components.hasComponent<HealthComponent>(e1)) {
                        auto& hp = components.getComponent<HealthComponent>(e1);
                        hp.hp -= 10;
                        std::cout << "  Entity " << e1 << " took damage!\n";
                    } else if (components.hasComponent<InvincibleComponent>(e1)) {
                        std::cout << "  Entity " << e1 << " is INVINCIBLE!\n";
                    }

                    // Same for e2...
                }
            }
        }
    }
};

int main() {
    EntityManager entityManager;
    ComponentManager componentManager;

    EntityID player = entityManager.createEntity();

    // Add normal components
    componentManager.addComponent(player, PositionComponent{0, 0});
    componentManager.addComponent(player, HealthComponent{100});

    std::cout << "Player created with HP: 100\n";

    // Simulate taking damage
    std::cout << "\nPlayer takes damage...\n";
    auto& hp = componentManager.getComponent<HealthComponent>(player);
    hp.hp -= 20;
    std::cout << "Player HP: " << hp.hp << "\n";

    // Player picks up invincibility power-up!
    std::cout << "\nPlayer picks up INVINCIBILITY power-up!\n";
    componentManager.addComponent(player, InvincibleComponent{5.0f});  // 5 seconds

    // Simulate more damage (should be blocked)
    std::cout << "\nPlayer takes damage...\n";
    if (componentManager.hasComponent<InvincibleComponent>(player)) {
        std::cout << "Damage BLOCKED! Player is invincible!\n";
    }

    // Simulate time passing
    InvincibilitySystem invincibilitySystem;
    for (int i = 0; i < 6; i++) {
        std::cout << "\nFrame " << i+1 << ":\n";
        invincibilitySystem.update(componentManager, 1.0f);
    }

    // Try damage again
    std::cout << "\nPlayer takes damage...\n";
    if (!componentManager.hasComponent<InvincibleComponent>(player)) {
        hp.hp -= 20;
        std::cout << "Damage APPLIED! Player HP: " << hp.hp << "\n";
    }

    return 0;
}
```

**Output**:
```
Player created with HP: 100

Player takes damage...
Player HP: 80

Player picks up INVINCIBILITY power-up!

Player takes damage...
Damage BLOCKED! Player is invincible!

Frame 1:
Frame 2:
Frame 3:
Frame 4:
Frame 5:
Frame 6:
  Entity 0 is no longer invincible!

Player takes damage...
Damage APPLIED! Player HP: 60
```

**Key Concepts**:
- **Runtime composition**: Add/remove components dynamically
- **Temporary behaviors**: Invincibility component expires
- **Conditional logic**: Systems check for component existence

---

#### Example 4: Archetype-Based ECS (Cache-Friendly)

**Goal**: Implement archetype storage for better cache locality.

```cpp
#include <iostream>
#include <vector>
#include <unordered_map>
#include <memory>
#include <tuple>

// ═══════════════════════════════════════════════════════════════
//  ARCHETYPE (Entities with same components share storage)
// ═══════════════════════════════════════════════════════════════

template<typename... Components>
class Archetype {
public:
    std::vector<EntityID> entities;
    std::tuple<std::vector<Components>...> componentArrays;

    void addEntity(EntityID entity, Components... components) {
        entities.push_back(entity);

        // Add components to respective arrays
        size_t index = 0;
        ((std::get<index++>(componentArrays).push_back(components)), ...);
    }

    template<typename Component>
    Component& getComponent(size_t entityIndex) {
        return std::get<std::vector<Component>>(componentArrays)[entityIndex];
    }

    size_t size() const {
        return entities.size();
    }
};

// ═══════════════════════════════════════════════════════════════
//  ARCHETYPE-BASED MOVEMENT SYSTEM
// ═══════════════════════════════════════════════════════════════

using MovableArchetype = Archetype<PositionComponent, VelocityComponent>;

class ArchetypeMovementSystem {
public:
    void update(MovableArchetype& archetype, float dt) {
        std::cout << "\n[ArchetypeMovementSystem] Processing "
                  << archetype.size() << " entities...\n";

        // Cache-friendly! All positions in one array, all velocities in another
        auto& positions = std::get<0>(archetype.componentArrays);
        auto& velocities = std::get<1>(archetype.componentArrays);

        for (size_t i = 0; i < archetype.size(); i++) {
            positions[i].x += velocities[i].dx * dt;
            positions[i].y += velocities[i].dy * dt;

            std::cout << "  Entity " << archetype.entities[i]
                      << " at (" << positions[i].x << ", " << positions[i].y << ")\n";
        }
    }
};

int main() {
    std::cout << "═══════════════════════════════════════════════════\n";
    std::cout << "  Archetype-Based ECS (Cache-Friendly)\n";
    std::cout << "═══════════════════════════════════════════════════\n";

    MovableArchetype movableEntities;

    // Add entities with Position + Velocity
    movableEntities.addEntity(0, PositionComponent{0, 0}, VelocityComponent{1, 0});
    movableEntities.addEntity(1, PositionComponent{5, 5}, VelocityComponent{-1, 1});
    movableEntities.addEntity(2, PositionComponent{10, 0}, VelocityComponent{0, 2});

    ArchetypeMovementSystem system;

    for (int frame = 1; frame <= 3; frame++) {
        std::cout << "\n========== Frame " << frame << " ==========";
        system.update(movableEntities, 1.0f);
    }

    std::cout << "\n\n═══════════════════════════════════════════════════\n";
    std::cout << "  BENEFIT: All Position data in one array\n";
    std::cout << "  → CPU can load multiple positions in one cache line!\n";
    std::cout << "  → 2-5x faster than scattered data\n";
    std::cout << "═══════════════════════════════════════════════════\n";

    return 0;
}
```

**Output**:
```
═══════════════════════════════════════════════════
  Archetype-Based ECS (Cache-Friendly)
═══════════════════════════════════════════════════

========== Frame 1 ==========

[ArchetypeMovementSystem] Processing 3 entities...
  Entity 0 at (1, 0)
  Entity 1 at (4, 6)
  Entity 2 at (10, 2)

========== Frame 2 ==========

[ArchetypeMovementSystem] Processing 3 entities...
  Entity 0 at (2, 0)
  Entity 1 at (3, 7)
  Entity 2 at (10, 4)

═══════════════════════════════════════════════════
  BENEFIT: All Position data in one array
  → CPU can load multiple positions in one cache line!
  → 2-5x faster than scattered data
═══════════════════════════════════════════════════
```

**Key Concepts**:
- **Archetype storage**: Entities with same components stored together
- **Cache locality**: All positions in one contiguous array
- **Performance**: 2-5x speedup for large entity counts

---

#### Example 5: Queued Entity Creation/Destruction (Deferred Operations)

**Goal**: Handle entity creation/destruction during iteration safely.

```cpp
#include <iostream>
#include <vector>
#include <queue>

// ═══════════════════════════════════════════════════════════════
//  DEFERRED ENTITY MANAGER
// ═══════════════════════════════════════════════════════════════

class DeferredEntityManager {
    EntityID nextID = 0;
    std::vector<EntityID> activeEntities;

    std::queue<EntityID> creationQueue;
    std::queue<EntityID> destructionQueue;

public:
    void queueCreateEntity() {
        EntityID newEntity = nextID++;
        creationQueue.push(newEntity);
        std::cout << "  [QUEUED] Create entity " << newEntity << "\n";
    }

    void queueDestroyEntity(EntityID entity) {
        destructionQueue.push(entity);
        std::cout << "  [QUEUED] Destroy entity " << entity << "\n";
    }

    void processQueue() {
        std::cout << "\n[Processing Queue]\n";

        // Process creations
        while (!creationQueue.empty()) {
            EntityID entity = creationQueue.front();
            creationQueue.pop();

            activeEntities.push_back(entity);
            std::cout << "  CREATED entity " << entity << "\n";
        }

        // Process destructions
        while (!destructionQueue.empty()) {
            EntityID entity = destructionQueue.front();
            destructionQueue.pop();

            activeEntities.erase(
                std::remove(activeEntities.begin(), activeEntities.end(), entity),
                activeEntities.end()
            );
            std::cout << "  DESTROYED entity " << entity << "\n";
        }
    }

    const std::vector<EntityID>& getActiveEntities() const {
        return activeEntities;
    }
};

// ═══════════════════════════════════════════════════════════════
//  SPAWNER SYSTEM (Creates entities during iteration)
// ═══════════════════════════════════════════════════════════════

class SpawnerSystem {
public:
    void update(DeferredEntityManager& entityManager, int frame) {
        std::cout << "\n[SpawnerSystem] Frame " << frame << "\n";

        // Iterate over current entities
        for (EntityID entity : entityManager.getActiveEntities()) {
            std::cout << "  Processing entity " << entity << "...\n";

            // Spawn new entity (queued, doesn't affect current iteration)
            if (frame == 2 && entity == 0) {
                std::cout << "    Entity 0 spawns a child!\n";
                entityManager.queueCreateEntity();
            }

            // Destroy entity (queued)
            if (frame == 3 && entity == 1) {
                std::cout << "    Entity 1 self-destructs!\n";
                entityManager.queueDestroyEntity(entity);
            }
        }
    }
};

int main() {
    std::cout << "═══════════════════════════════════════════════════\n";
    std::cout << "  Deferred Entity Operations\n";
    std::cout << "═══════════════════════════════════════════════════\n";

    DeferredEntityManager entityManager;
    SpawnerSystem spawner;

    // Create initial entities
    entityManager.queueCreateEntity();
    entityManager.queueCreateEntity();
    entityManager.processQueue();

    std::cout << "\n--- Starting Simulation ---\n";

    for (int frame = 1; frame <= 4; frame++) {
        std::cout << "\n========== Frame " << frame << " ==========";

        spawner.update(entityManager, frame);
        entityManager.processQueue();

        std::cout << "\nActive entities: ";
        for (EntityID e : entityManager.getActiveEntities()) {
            std::cout << e << " ";
        }
        std::cout << "\n";
    }

    std::cout << "\n═══════════════════════════════════════════════════\n";
    std::cout << "  KEY BENEFIT: Iterator never invalidated!\n";
    std::cout << "  Operations queued during iteration, applied after.\n";
    std::cout << "═══════════════════════════════════════════════════\n";

    return 0;
}
```

**Output**:
```
═══════════════════════════════════════════════════
  Deferred Entity Operations
═══════════════════════════════════════════════════

[QUEUED] Create entity 0
[QUEUED] Create entity 1

[Processing Queue]
  CREATED entity 0
  CREATED entity 1

--- Starting Simulation ---

========== Frame 1 ==========

[SpawnerSystem] Frame 1
  Processing entity 0...
  Processing entity 1...

Active entities: 0 1

========== Frame 2 ==========

[SpawnerSystem] Frame 2
  Processing entity 0...
    Entity 0 spawns a child!
  [QUEUED] Create entity 2
  Processing entity 1...

[Processing Queue]
  CREATED entity 2

Active entities: 0 1 2

========== Frame 3 ==========

[SpawnerSystem] Frame 3
  Processing entity 0...
  Processing entity 1...
    Entity 1 self-destructs!
  [QUEUED] Destroy entity 1
  Processing entity 2...

[Processing Queue]
  DESTROYED entity 1

Active entities: 0 2

═══════════════════════════════════════════════════
  KEY BENEFIT: Iterator never invalidated!
  Operations queued during iteration, applied after.
═══════════════════════════════════════════════════
```

**Key Concepts**:
- **Deferred operations**: Queue changes during iteration
- **Process after iteration**: Apply all changes at end of frame
- **Iterator safety**: Never invalidate iterators

---

#### Example 6: System Dependencies and Scheduling

(Brief outline - structure only)

```cpp
class System {
public:
    std::string name;
    std::vector<System*> dependencies;

    virtual void update() = 0;
};

class SystemScheduler {
public:
    void addSystem(System* system);
    void topologicalSort();  // Order systems by dependencies
    void update();           // Run in correct order
};

// Example usage:
movementSystem.dependencies = {};
collisionSystem.dependencies = {&movementSystem};
renderSystem.dependencies = {&movementSystem, &collisionSystem};

scheduler.addSystem(&renderSystem);  // Auto-schedules dependencies
```

---

#### Example 7: Multithreaded ECS

(Brief outline - structure only)

```cpp
class ParallelSystemScheduler {
    struct SystemInfo {
        System* system;
        std::vector<std::type_index> readComponents;
        std::vector<std::type_index> writeComponents;
    };

public:
    void scheduleParallel();  // Analyze dependencies, run safe systems in parallel
};

// Example: MovementSystem (writes Position) and RenderSystem (reads Position)
// → Can't run in parallel
//
// MovementSystem (writes Position) and AISystem (writes AI component)
// → CAN run in parallel (no overlap)
```

---

#### Example 8: Complete Game Example (Putting It All Together)

(Brief outline - comprehensive game with):
- Player, Enemies, Bullets entities
- Input, Movement, Collision, Damage, Spawn, Render systems
- Dynamic component addition (power-ups)
- Deferred entity destruction
- System execution order

---

### INTERVIEW_QA: Comprehensive Questions and Answers
#### Q1: What is the main difference between ECS and traditional OOP inheritance?

**Answer**:

**Traditional OOP**:
- Uses **inheritance hierarchies** (`Player extends GameObject`)
- Data and logic **together** in classes
- **"IS-A" relationships** (Player IS-A GameObject)
- Hard to change behavior (need to modify class)

**ECS**:
- Uses **composition** (entities are just IDs with components)
- Data (components) **separate from** logic (systems)
- **"HAS-A" relationships** (Player HAS Position, Velocity, Health)
- Easy to change behavior (add/remove components)

**Example**:

Traditional:
```cpp
class Player : public GameObject, public Renderable, public Movable {
    // Data + logic mixed
};
```

ECS:
```cpp
Entity player = 1;
Components: Position, Velocity, Health, Mesh
Systems: MovementSystem, RenderSystem (process these components)
```

**Key Insight**: ECS separates **what** things are (components) from **how** they behave (systems).

---

#### Q2: Why is ECS considered cache-friendly?

**Answer**:

**Problem with OOP**:
```cpp
class GameObject {
    Position pos;      // 8 bytes
    Velocity vel;      // 8 bytes
    Health hp;         // 4 bytes
    Mesh mesh;         // 100+ bytes
    AI aiData;         // 200+ bytes
    // ... total: 300+ bytes per object
};

std::vector<GameObject*> objects;  // Scattered in heap

for (auto obj : objects) {
    obj->pos.x += obj->vel.dx;  // Loads 300+ bytes for 16 bytes of data!
}
```

**With ECS**:
```cpp
std::vector<Position> positions;   // [pos0, pos1, pos2, ...] contiguous
std::vector<Velocity> velocities;  // [vel0, vel1, vel2, ...] contiguous

for (size_t i = 0; i < positions.size(); i++) {
    positions[i].x += velocities[i].dx;  // Sequential access!
}
```

**Why It's Faster**:
1. **Cache lines**: CPU loads 64 bytes at once. ECS loads 8 positions in one cache line, OOP loads 1 object with unused data.
2. **Prefetching**: CPU can predict sequential access, preloads next cache line.
3. **SIMD**: Contiguous data can be vectorized (process 4-8 floats at once).

**Benchmark Results**: 2-10x speedup depending on use case.

---

#### Q3: How do you handle component dependencies in ECS?

**Answer**:

**Problem**: `MovementSystem` needs both `Position` and `Velocity`, but what if entity only has `Velocity`?

**Solution 1: Query with Multiple Component Types**

```cpp
void MovementSystem::update(ComponentManager& cm) {
    // Only get entities with BOTH Position AND Velocity
    for (EntityID e : cm.getEntitiesWith<Position, Velocity>()) {
        auto& pos = cm.get<Position>(e);   // ✅ Safe
        auto& vel = cm.get<Velocity>(e);   // ✅ Safe
        pos.x += vel.dx;
    }
}
```

**Solution 2: Component Groups (Pre-filtered)**

```cpp
class ComponentManager {
    ComponentGroup movableGroup;  // Entities with Position + Velocity

    void addComponent<T>(EntityID entity, T component) {
        components[entity][typeid(T)] = component;

        // Update groups
        if (typeid(T) == typeid(Velocity) && hasComponent<Position>(entity)) {
            movableGroup.add(entity);
        }
    }
};

void MovementSystem::update() {
    for (EntityID e : movableGroup) {
        // Guaranteed to have both components
    }
}
```

**Solution 3: Enforce at Add Time**

```cpp
void addVelocity(EntityID entity, Velocity vel) {
    if (!hasComponent<Position>(entity)) {
        throw std::logic_error("Velocity requires Position component!");
    }
    addComponent(entity, vel);
}
```

**Best Practice**: Use query systems or component groups. Fail fast if dependencies not met.

---

#### Q4: What are the trade-offs of using ECS?

**Answer**:

| **Advantages** | **Disadvantages** |
|----------------|-------------------|
| ✅ **Flexible** - easy to add/remove behaviors | ❌ **Complexity** - more code than simple OOP |
| ✅ **Performant** - cache-friendly, data-oriented | ❌ **Learning curve** - unfamiliar to many developers |
| ✅ **Reusable** - components shared across entities | ❌ **Debugging** - harder to trace logic (no call stack) |
| ✅ **Data-driven** - entities can be loaded from files | ❌ **Overhead** - component lookups (hash maps) |
| ✅ **Parallel** - systems can run concurrently | ❌ **Not suitable for all domains** (e.g., business logic) |

**When NOT to use ECS**:
- Small projects (< 100 entities)
- Simple entity hierarchies (only 3-5 types)
- Deep business logic (banking, e-commerce)
- Team unfamiliar with ECS

**When to use ECS**:
- Games (especially with 1000+ entities)
- Simulations (physics, particles)
- Robotics/autonomous systems
- Need runtime composition (modding support)

---

#### Q5: How do you implement system execution order in ECS?

**Answer**:

**Problem**: Systems depend on each other's results.

**Example**:
```
MovementSystem:  Updates positions
↓
CollisionSystem: Needs updated positions
↓
RenderSystem:    Needs collision results
```

**Solution 1: Priority-Based Scheduling**

```cpp
class SystemManager {
    std::vector<std::pair<int, System*>> systems;  // (priority, system)

public:
    void addSystem(System* system, int priority) {
        systems.emplace_back(priority, system);
        std::sort(systems.begin(), systems.end(), [](auto& a, auto& b) {
            return a.first < b.first;
        });
    }

    void update() {
        for (auto& [priority, system] : systems) {
            system->update();
        }
    }
};

// Usage
manager.addSystem(&movementSystem, 100);
manager.addSystem(&collisionSystem, 200);
manager.addSystem(&renderSystem, 300);
```

**Solution 2: Dependency Graph**

```cpp
class System {
public:
    std::vector<System*> dependencies;
};

class SystemScheduler {
    void topologicalSort(std::vector<System*>& systems) {
        // Sort systems so dependencies run first
    }
};

// Usage
collisionSystem.dependencies = {&movementSystem};
renderSystem.dependencies = {&movementSystem, &collisionSystem};
```

**Solution 3: Manual Phases**

```cpp
void gameLoop() {
    // Phase 1: Input & Movement
    inputSystem.update();
    movementSystem.update();

    // Phase 2: Game Logic
    collisionSystem.update();
    aiSystem.update();

    // Phase 3: Rendering
    renderSystem.update();
}
```

**Best Practice**: Use explicit ordering with documentation of dependencies.

---

#### Additional Questions 6-20 (Outlined)

**Q6**: How do you handle entity lifetime safely (prevent dangling references)?

**Q7**: What is an archetype in ECS? Why is it faster?

**Q8**: How do you implement component removal during iteration?

**Q9**: Explain sparse sets vs dense arrays for component storage.

**Q10**: How do you implement multithreading in ECS?

**Q11**: What is the role of an Entity ID? Why not use pointers?

**Q12**: How do you serialize/deserialize entities with ECS?

**Q13**: Compare ECS to Unity's GameObject system.

**Q14**: How do you implement events/messaging in ECS?

**Q15**: What are system groups? When are they useful?

**Q16**: How do you handle singleton components (global state)?

**Q17**: What is DOTS (Data-Oriented Technology Stack)?

**Q18**: How do you implement entity prefabs/templates in ECS?

**Q19**: What are reactive systems vs update systems?

**Q20**: How do you profile and optimize ECS performance?

(Full answers can be expanded as needed)

---

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

### QUICK_REFERENCE: Key Takeaways and Comparison Tables
#### ECS Core Concepts

| Concept | Description | Example |
|---------|-------------|---------|
| **Entity** | Unique ID (no data/logic) | `EntityID player = 42;` |
| **Component** | Plain struct (data only) | `struct Position { float x, y; };` |
| **System** | Logic operating on components | `MovementSystem` updates positions |
| **Composition** | Entity = set of components | `Player = {Position, Velocity, Health}` |

---

#### When to Use ECS

| **Use ECS** | **Don't Use ECS** |
|-------------|-------------------|
| ✅ 1000+ entities | ❌ < 100 entities |
| ✅ Need flexibility (runtime composition) | ❌ Fixed entity types |
| ✅ Performance critical (games, simulations) | ❌ Business logic (banking) |
| ✅ Data-driven design | ❌ Team unfamiliar with pattern |

---

#### Component Design Guidelines

| **Good** | **Too Granular** | **Too Coarse** |
|----------|------------------|----------------|
| `Position {x, y, z}` | `X {x}, Y {y}, Z {z}` | `GameObject {pos, vel, hp, ...}` |
| `Velocity {dx, dy, dz}` | `VelocityX`, `VelocityY` | `Physics {pos, vel, accel, mass}` |
| `Health {hp, maxHp}` | `HP`, `MaxHP` | `Stats {hp, mp, str, dex, ...}` |

**Rule**: Group data used together, separate data used by different systems.

---

#### System Execution Order

```
Priority 100: InputSystem, MovementSystem
     ↓
Priority 200: CollisionSystem, AISystem
     ↓
Priority 300: RenderSystem, DebugDrawSystem
```

**Key**: Systems that modify data run before systems that read data.

---

#### Component Storage Strategies

| Strategy | Pros | Cons | Use When |
|----------|------|------|----------|
| **Hash Map** (`std::unordered_map`) | Simple, flexible | Slow, cache unfriendly | Prototyping, < 1000 entities |
| **Archetype** (same components together) | Cache-friendly | Moving entities expensive | Many entities (10k+) |
| **Sparse Set** | Fast add/remove, good iteration | Memory overhead | Frequent add/remove |

---

#### Common Pitfalls

| Problem | Solution |
|---------|----------|
| **Iterator invalidation** (modify during loop) | Use deferred operations (queue changes) |
| **Dangling entity references** | Use versioned entity IDs |
| **Wrong system order** | Explicit priority/dependency system |
| **Data races** (multithreading) | Track read/write access per system |
| **Over-granular components** | Group related data |

---

#### ECS vs OOP Quick Comparison

| Aspect | OOP | ECS |
|--------|-----|-----|
| **Structure** | Inheritance hierarchy | Composition |
| **Relationship** | IS-A (Player IS-A GameObject) | HAS-A (Player HAS Position) |
| **Data + Logic** | Together in class | Separate (components + systems) |
| **Flexibility** | Hard to change (modify class) | Easy (add/remove components) |
| **Performance** | Cache unfriendly | Cache friendly |
| **Complexity** | Simple | Higher (more abstractions) |

---

#### Code Template

```cpp
// Entity
using EntityID = uint32_t;

// Component
struct Position { float x, y; };

// Component Manager
class ComponentManager {
    std::unordered_map<std::type_index,
        std::unordered_map<EntityID, void*>> components;
public:
    template<typename T> void add(EntityID e, T comp);
    template<typename T> T& get(EntityID e);
    template<typename... Ts> std::vector<EntityID> getEntitiesWith();
};

// System
class MovementSystem {
public:
    void update(ComponentManager& cm, float dt) {
        for (EntityID e : cm.getEntitiesWith<Position, Velocity>()) {
            auto& pos = cm.get<Position>(e);
            auto& vel = cm.get<Velocity>(e);
            pos.x += vel.dx * dt;
        }
    }
};
```

---

