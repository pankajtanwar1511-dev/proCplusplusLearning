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
