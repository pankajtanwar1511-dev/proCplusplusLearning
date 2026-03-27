## TOPIC: Factory Pattern (Factory Method and Abstract Factory)

### PRACTICE_TASKS: Code Analysis and Implementation Challenges

#### Q1
```cpp
class SensorFactory {
public:
    static Sensor* createSensor(Type type) {
        if (type == Type::LIDAR) {
            return new LidarSensor();
        }
        return new RadarSensor();
    }
};

// Used in a loop that processes thousands of sensor readings
for (int i = 0; i < 10000; ++i) {
    Sensor* s = SensorFactory::createSensor(Type::LIDAR);
    process(s);
    delete s;
}

// What's the problem and how do you fix it?
```

**Answer:**
```
Severe performance problem: Memory fragmentation and allocation overhead from 10,000 allocations/deallocations
```

**Explanation:**

- **Performance issues with repeated allocation:**
  - Each new/delete pair: ~100-200ns overhead (system call to allocator)
  - 10,000 iterations: ~1-2ms wasted on allocation alone
  - Heap fragmentation from repeated alloc/free cycles
  - Cache misses from non-contiguous memory
  - Allocator lock contention in multithreaded code

- **Memory fragmentation impact:**
  ```cpp
  // After many alloc/delete cycles:
  // Heap looks like Swiss cheese
  
  Memory layout:
  [Free][Used][Free][Used][Free][Free][Used]...
         └─ Small fragments, can't satisfy large allocations
  
  // Problems:
  // 1. Larger allocations may fail even with enough total free memory
  // 2. Allocator must search for suitable blocks
  // 3. Memory overhead from bookkeeping structures
  ```

- **Benchmark comparison:**
  ```cpp
  // Method 1: Repeated new/delete (current code)
  auto start = high_resolution_clock::now();
  for (int i = 0; i < 10000; ++i) {
      Sensor* s = new LidarSensor();
      process(s);
      delete s;
  }
  auto duration = duration_cast<microseconds>(end - start).count();
  // Result: ~10-20ms (1-2μs per iteration)
  
  // Method 2: Object pool (reuse)
  SensorPool pool(100);  // Pre-allocate 100 sensors
  auto start = high_resolution_clock::now();
  for (int i = 0; i < 10000; ++i) {
      auto s = pool.acquire();
      process(*s);
      // Auto-release on scope exit
  }
  auto duration = duration_cast<microseconds>(end - start).count();
  // Result: ~1-2ms (0.1-0.2μs per iteration)
  // 10x faster!
  ```

- **Solution 1: Object Pool Pattern:**
  ```cpp
  template<typename T>
  class ObjectPool {
      std::vector<std::unique_ptr<T>> pool;
      std::vector<T*> available;
      std::mutex mtx;
  
  public:
      ObjectPool(size_t size) {
          pool.reserve(size);
          for (size_t i = 0; i < size; ++i) {
              pool.push_back(std::make_unique<T>());
              available.push_back(pool.back().get());
          }
      }
      
      class Handle {
          T* obj;
          ObjectPool* owner;
      public:
          Handle(T* o, ObjectPool* p) : obj(o), owner(p) {}
          ~Handle() { owner->release(obj); }
          T* operator->() { return obj; }
          T& operator*() { return *obj; }
      };
      
      Handle acquire() {
          std::lock_guard lock(mtx);
          if (available.empty()) {
              throw std::runtime_error("Pool exhausted");
          }
          T* obj = available.back();
          available.pop_back();
          return Handle(obj, this);
      }
      
      void release(T* obj) {
          std::lock_guard lock(mtx);
          available.push_back(obj);
      }
  };
  
  // Usage:
  ObjectPool<LidarSensor> pool(100);
  for (int i = 0; i < 10000; ++i) {
      auto s = pool.acquire();  // RAII handle
      process(*s);
  }  // Auto-release
  ```

- **Solution 2: Stack allocation (if possible):**
  ```cpp
  // If sensor size is known and reasonable
  for (int i = 0; i < 10000; ++i) {
      LidarSensor sensor;  // Stack allocation
      process(&sensor);
  }  // Auto-destroyed
  
  // Pros: Zero allocation overhead, perfect cache locality
  // Cons: Requires concrete type, no polymorphism
  ```

- **Solution 3: Pre-allocate and reuse single instance:**
  ```cpp
  // If sensor state can be reset
  LidarSensor sensor;
  for (int i = 0; i < 10000; ++i) {
      sensor.reset();  // Clear previous state
      process(&sensor);
  }
  
  // Pros: Simplest solution, zero allocation
  // Cons: Not thread-safe, assumes stateless or resettable
  ```

- **Solution 4: Batch processing with vector:**
  ```cpp
  // Allocate once, process many times
  std::vector<LidarSensor> sensors;
  sensors.reserve(10000);
  for (int i = 0; i < 10000; ++i) {
      sensors.emplace_back();  // Construct in-place
  }
  
  // Process all (can parallelize)
  for (auto& sensor : sensors) {
      process(&sensor);
  }
  
  // Pros: Contiguous memory (cache-friendly), single allocation
  // Cons: Higher peak memory usage
  ```

- **Memory overhead analysis:**
  ```
  Repeated allocation:
  - Allocator bookkeeping: ~16-32 bytes per allocation
  - 10,000 objects: 160-320KB overhead
  - Fragmentation: Can waste 10-30% of heap
  
  Object pool (100 objects):
  - Pre-allocated: 100 * sizeof(Sensor)
  - Reused 10,000 times
  - Zero fragmentation, zero runtime allocation
  ```

- **Thread safety considerations:**
  ```cpp
  // Problem: Multiple threads calling factory
  void worker() {
      for (int i = 0; i < 1000; ++i) {
          Sensor* s = SensorFactory::createSensor(Type::LIDAR);
          process(s);
          delete s;
      }
  }
  
  // Issues:
  // 1. Allocator lock contention (multiple threads competing)
  // 2. False sharing if sensors allocated on same cache line
  // 3. Increased fragmentation from interleaved alloc/free
  
  // Solution: Thread-local pools
  thread_local ObjectPool<LidarSensor> localPool(10);
  for (int i = 0; i < 1000; ++i) {
      auto s = localPool.acquire();
      process(*s);
  }
  // No contention, thread-local cache
  ```

- **Key Concept:** **Avoid repeated allocations in hot loops; use object pooling for performance**
  - Memory allocation: 100-200ns per call
  - Object pool: ~10ns (just pointer swap)
  - Reduces fragmentation and allocator contention
  - Use RAII handles for automatic return to pool
  - Consider stack allocation or reuse for simple cases

---

---

#### Q2
```cpp
class Factory {
public:
    static Sensor createSensor() {  // Note: returns by value
        return LidarSensor();
    }
};

Sensor s = Factory::createSensor();
s.readValue();  // What happens here?
```

**Answer:**
```
Object slicing - LidarSensor sliced to Sensor, polymorphism broken
```

**Explanation:**

- **Object slicing occurs when returning derived class by value:**
  - LidarSensor has more data than base Sensor
  - Returning by value copies only Sensor portion
  - Derived class data discarded
  - Virtual table pointer reset to base class
  - Virtual functions call base class versions

- **Step-by-step slicing:**
  ```cpp
  class Sensor {
      int baseData;
  public:
      virtual void readValue() { std::cout << "Sensor::readValue
"; }
  };
  
  class LidarSensor : public Sensor {
      int lidarSpecificData;  // Extra data
      std::vector<Point> pointCloud;  // Extra data
  public:
      void readValue() override { std::cout << "LidarSensor::readValue
"; }
  };
  
  Sensor createSensor() {
      return LidarSensor();  // Creates full LidarSensor
  }
  
  // Copy construction:
  // 1. LidarSensor temporary created (full object)
  // 2. Copy to Sensor: only baseData copied
  // 3. lidarSpecificData, pointCloud discarded!
  // 4. vptr set to Sensor's vtable
  
  Sensor s = createSensor();
  // s is a pure Sensor, not a LidarSensor
  s.readValue();  // Calls Sensor::readValue (not overridden version)
  ```

- **Memory layout showing slicing:**
  ```
  LidarSensor object (before return):
  [vptr → LidarSensor vtable]
  [baseData: int]
  [lidarSpecificData: int]
  [pointCloud: vector]
  Total: ~40 bytes
  
  After slicing to Sensor:
  [vptr → Sensor vtable]
  [baseData: int]
  Total: ~16 bytes
  
  Lost: lidarSpecificData, pointCloud (~24 bytes)
  ```

- **Why polymorphism breaks:**
  ```cpp
  Sensor s = createSensor();
  
  // Virtual function call mechanism:
  // 1. Compiler generates: s.vptr->readValue()
  // 2. s.vptr points to Sensor's vtable (not LidarSensor's)
  // 3. Calls Sensor::readValue, NOT LidarSensor::readValue
  
  // Expected (polymorphic):
  s.readValue();  // Should call LidarSensor::readValue
  
  // Actual (sliced):
  s.readValue();  // Calls Sensor::readValue
  ```

- **Compiler warnings (with -Weffc++):**
  ```cpp
  warning: base class 'class Sensor' should be explicitly initialized
           in the copy constructor
  
  // Slicing is often silent! No error, just wrong behavior
  ```

- **Solution 1: Return by pointer (unique_ptr):**
  ```cpp
  class Factory {
  public:
      static std::unique_ptr<Sensor> createSensor() {
          return std::make_unique<LidarSensor>();
      }
  };
  
  auto s = Factory::createSensor();  // unique_ptr<Sensor>
  s->readValue();  // Polymorphic call, works correctly!
  
  // Memory layout:
  // s → [unique_ptr] → [LidarSensor object on heap]
  //                     └─ Full object with vtable
  ```

- **Solution 2: Return by shared_ptr (if shared ownership needed):**
  ```cpp
  static std::shared_ptr<Sensor> createSensor() {
      return std::make_shared<LidarSensor>();
  }
  
  auto s = Factory::createSensor();
  s->readValue();  // Works correctly
  
  // Can share ownership:
  auto s2 = s;  // Both point to same LidarSensor
  ```

- **Solution 3: Return reference (if factory manages lifetime):**
  ```cpp
  class Factory {
      static std::unique_ptr<LidarSensor> instance;
  public:
      static Sensor& createSensor() {
          if (!instance) {
              instance = std::make_unique<LidarSensor>();
          }
          return *instance;
      }
  };
  
  Sensor& s = Factory::createSensor();
  s.readValue();  // Works (but singleton-like behavior)
  ```

- **When slicing might be intentional:**
  ```cpp
  // Sometimes you WANT just the base part
  void logSensor(Sensor s) {  // Copy base part only
      std::cout << s.getID() << "
";  // Base class method
  }
  
  LidarSensor lidar;
  logSensor(lidar);  // Intentional slicing, just logging base info
  
  // But usually, this should be:
  void logSensor(const Sensor& s) {  // Reference, no slicing
      std::cout << s.getID() << "
";
  }
  ```

- **Common slicing scenarios:**
  ```cpp
  // Scenario 1: Container of base objects
  std::vector<Sensor> sensors;  // BAD! Will slice
  sensors.push_back(LidarSensor());  // Sliced to Sensor
  
  // Fix: Container of pointers
  std::vector<std::unique_ptr<Sensor>> sensors;
  sensors.push_back(std::make_unique<LidarSensor>());  // No slicing
  
  // Scenario 2: Assignment slicing
  Sensor s;
  LidarSensor lidar;
  s = lidar;  // Slicing! Only base part copied
  
  // Scenario 3: Pass by value
  void process(Sensor s) {  // BAD! Slices parameter
      s.readValue();  // Calls base version
  }
  
  // Fix: Pass by reference
  void process(Sensor& s) {  // Preserves polymorphism
      s.readValue();  // Polymorphic call
  }
  ```

- **Detection strategies:**
  ```cpp
  // Make base class copy constructor protected to prevent slicing
  class Sensor {
  protected:
      Sensor(const Sensor&) = default;
      Sensor& operator=(const Sensor&) = default;
  public:
      virtual ~Sensor() = default;
      // ... other public interface
  };
  
  // Now this won't compile:
  Sensor s = createSensor();  // Error: copy constructor is protected
  
  // But this still works (no slicing):
  std::unique_ptr<Sensor> s = std::make_unique<LidarSensor>();
  ```

- **Key Concept:** **Never return polymorphic objects by value; use pointers/references**
  - Returning by value slices derived class
  - Vtable pointer reset to base class
  - Derived data discarded
  - Use unique_ptr/shared_ptr to preserve polymorphism
  - Make base class non-copyable to prevent slicing

---

---

#### Q3
```cpp
class SensorFactory {
    static map<string, unique_ptr<Sensor>> cache;

public:
    static Sensor* getSensor(const string& id) {
        if (cache.find(id) == cache.end()) {
            cache[id] = make_unique<Sensor>(id);
        }
        return cache[id].get();
    }
};

// Called from multiple threads simultaneously
// Is this thread-safe?
```

**Answer:**
```
Not thread-safe - multiple race conditions
```

**Explanation:**

- **Race condition 1: find() check and insert are not atomic:**
  ```cpp
  // Thread 1:
  if (cache.find(id) == cache.end()) {  // Not found
      // Context switch to Thread 2...
  
  // Thread 2:
  if (cache.find(id) == cache.end()) {  // Also not found!
      cache[id] = make_unique<Sensor>(id);  // Insert
  
  // Back to Thread 1:
      cache[id] = make_unique<Sensor>(id);  // Insert again!
      // Previous unique_ptr destroyed, sensor leaked or double-free
  }
  ```

- **Race condition 2: Map modification during iteration:**
  ```cpp
  // Thread 1: Reading map
  auto it = cache.find("sensor1");
  // Context switch...
  
  // Thread 2: Modifying map
  cache["sensor2"] = make_unique<Sensor>("sensor2");
  // Map internal structure changed (rehashing possible)
  
  // Thread 1: Using iterator
  if (it != cache.end()) {
      return it->second.get();  // Iterator may be invalid!
  }
  ```

- **Race condition 3: operator[] creates default entry:**
  ```cpp
  // operator[] is not const, modifies map
  return cache[id].get();
  
  // If 'id' doesn't exist:
  // 1. Creates default entry (nullptr unique_ptr)
  // 2. Returns reference to nullptr
  // 3. Calling .get() returns nullptr (not an error)
  // 4. But map was modified during "read" operation!
  ```

- **Potential outcomes:**
  ```
  Best case: Corrupt map, crashes immediately
  Worse case: Memory corruption, crashes later (hard to debug)
  Worst case: Appears to work, silent data corruption
  
  Specific problems:
  1. Duplicate sensor creation (memory leak)
  2. Iterator invalidation (crash)
  3. Concurrent map modification (undefined behavior)
  4. Lost updates
  ```

- **Solution 1: Mutex protection:**
  ```cpp
  class SensorFactory {
      static std::map<std::string, std::unique_ptr<Sensor>> cache;
      static std::mutex cacheMutex;
  
  public:
      static Sensor* getSensor(const std::string& id) {
          std::lock_guard<std::mutex> lock(cacheMutex);
          
          auto it = cache.find(id);
          if (it == cache.end()) {
              cache[id] = std::make_unique<Sensor>(id);
              return cache[id].get();
          }
          return it->second.get();
      }
  };
  
  std::map<std::string, std::unique_ptr<Sensor>> SensorFactory::cache;
  std::mutex SensorFactory::cacheMutex;
  
  // Pros: Simple, correct
  // Cons: Locks even for reads (contention)
  ```

- **Solution 2: Shared mutex (read-write lock):**
  ```cpp
  class SensorFactory {
      static std::map<std::string, std::unique_ptr<Sensor>> cache;
      static std::shared_mutex cacheMutex;
  
  public:
      static Sensor* getSensor(const std::string& id) {
          // Try read lock first (shared access)
          {
              std::shared_lock lock(cacheMutex);
              auto it = cache.find(id);
              if (it != cache.end()) {
                  return it->second.get();  // Found, return
              }
          }  // Release shared lock
          
          // Not found, acquire exclusive lock
          std::unique_lock lock(cacheMutex);
          
          // Double-check (another thread may have inserted)
          auto it = cache.find(id);
          if (it != cache.end()) {
              return it->second.get();
          }
          
          // Create new
          cache[id] = std::make_unique<Sensor>(id);
          return cache[id].get();
      }
  };
  
  // Pros: Multiple readers, better performance
  // Cons: More complex, double-check pattern
  ```

- **Solution 3: Thread-safe map (C++20 or third-party):**
  ```cpp
  #include <tbb/concurrent_hash_map.h>  // Intel TBB
  
  class SensorFactory {
      static tbb::concurrent_hash_map<std::string, std::unique_ptr<Sensor>> cache;
  
  public:
      static Sensor* getSensor(const std::string& id) {
          typename decltype(cache)::accessor a;
          
          if (cache.insert(a, id)) {
              // Inserted new entry, initialize it
              a->second = std::make_unique<Sensor>(id);
          }
          // a locks the entry until destroyed
          return a->second.get();
      }
  };
  
  // Pros: Fine-grained locking, high performance
  // Cons: External dependency
  ```

- **Solution 4: Call_once for initialization:**
  ```cpp
  class SensorFactory {
      static std::map<std::string, std::unique_ptr<Sensor>> cache;
      static std::mutex cacheMutex;
      static std::map<std::string, std::once_flag> initFlags;
  
  public:
      static Sensor* getSensor(const std::string& id) {
          std::lock_guard lock(cacheMutex);
          
          std::call_once(initFlags[id], [&]() {
              cache[id] = std::make_unique<Sensor>(id);
          });
          
          return cache[id].get();
      }
  };
  
  // Pros: Guaranteed single initialization per ID
  // Cons: Still need mutex for map access
  ```

- **Performance comparison:**
  ```cpp
  // No synchronization (BROKEN):
  // 1M calls, 8 threads: ~10ms, crashes 50% of the time
  
  // Mutex (correct but slow):
  // 1M calls, 8 threads: ~500ms (serialized)
  
  // Shared mutex (better):
  // 1M calls, 8 threads: ~100ms (parallel reads)
  
  // Concurrent map (best):
  // 1M calls, 8 threads: ~50ms (lock-free reads)
  ```

- **Lazy initialization pattern (double-checked locking):**
  ```cpp
  static Sensor* getSensor(const std::string& id) {
      // Fast path: check without lock
      {
          std::shared_lock lock(cacheMutex);
          auto it = cache.find(id);
          if (it != cache.end()) {
              return it->second.get();  // Already exists
          }
      }
      
      // Slow path: acquire exclusive lock and insert
      std::unique_lock lock(cacheMutex);
      
      // IMPORTANT: Double-check after acquiring lock
      // Another thread may have inserted while we waited
      auto it = cache.find(id);
      if (it != cache.end()) {
          return it->second.get();
      }
      
      // Create new
      cache[id] = std::make_unique<Sensor>(id);
      return cache[id].get();
  }
  ```

- **Key Concept:** **Concurrent map access requires synchronization; use mutex or concurrent containers**
  - find() + insert is not atomic
  - Map modification invalidates iterators
  - Use mutex for correctness
  - Use shared_mutex for better read performance
  - Consider concurrent containers for high contention

---

---

#### Q4
```cpp
class Factory {
public:
    virtual unique_ptr<Sensor> create() = 0;
};

class LidarFactory : public Factory {
public:
    unique_ptr<Sensor> create() override {
        return make_unique<LidarSensor>();
    }
};

// How does this differ from a static factory method?
```

**Answer:**
```
Virtual factory enables runtime polymorphism of factories; static factory is compile-time fixed
```

**Explanation:**

- **Virtual factory (Factory Method pattern):**
  ```cpp
  // Factory itself is polymorphic
  void processWithFactory(Factory& factory) {
      auto sensor = factory.create();  // Virtual call
      // Don't know which factory at compile-time
      sensor->readValue();
  }
  
  LidarFactory lidarFactory;
  RadarFactory radarFactory;
  
  processWithFactory(lidarFactory);  // Creates LidarSensor
  processWithFactory(radarFactory);  // Creates RadarSensor
  
  // Factory chosen at runtime!
  ```

- **Static factory method:**
  ```cpp
  class SensorFactory {
  public:
      static unique_ptr<Sensor> createLidar() {
          return make_unique<LidarSensor>();
      }
      
      static unique_ptr<Sensor> createRadar() {
          return make_unique<RadarSensor>();
      }
  };
  
  // Must know which function to call at compile-time
  auto sensor = SensorFactory::createLidar();
  // Factory choice is hardcoded
  ```

- **Key differences:**

  | Aspect | Virtual Factory | Static Factory |
  |--------|----------------|----------------|
  | Runtime polymorphism | ✅ Yes | ❌ No |
  | Factory selection | Runtime | Compile-time |
  | Virtual dispatch | Yes (overhead) | No (faster) |
  | Can store in container | ✅ Yes | ❌ No |
  | Can pass as parameter | ✅ Yes | ❌ No (unless function ptr) |
  | Memory overhead | vtable pointer | None |
  | Flexibility | High | Low |

- **Virtual factory use cases:**
  ```cpp
  // Use case 1: Configuration-driven factory selection
  unique_ptr<Factory> factory;
  if (config.sensorType == "LIDAR") {
      factory = make_unique<LidarFactory>();
  } else {
      factory = make_unique<RadarFactory>();
  }
  
  auto sensor = factory->create();  // Type determined at runtime
  
  // Use case 2: Dependency injection
  class SensorSystem {
      Factory& factory;
  public:
      SensorSystem(Factory& f) : factory(f) {}
      
      void addSensor() {
          sensors.push_back(factory.create());
      }
  };
  
  LidarFactory lidarFactory;
  SensorSystem system(lidarFactory);  // Inject factory
  
  // Use case 3: Strategy pattern with factories
  class Application {
      vector<unique_ptr<Factory>> factories;
  public:
      void registerFactory(unique_ptr<Factory> factory) {
          factories.push_back(std::move(factory));
      }
      
      void createAllSensors() {
          for (auto& factory : factories) {
              auto sensor = factory->create();
              sensors.push_back(std::move(sensor));
          }
      }
  };
  ```

- **Performance comparison:**
  ```cpp
  // Virtual factory: ~5ns per call (virtual dispatch)
  Factory& factory = lidarFactory;
  for (int i = 0; i < 1000000; ++i) {
      auto sensor = factory.create();  // Virtual call overhead
  }
  
  // Static factory: ~2ns per call (direct call, inlined)
  for (int i = 0; i < 1000000; ++i) {
      auto sensor = SensorFactory::createLidar();  // Direct call
  }
  
  // Difference: ~3ms over 1M calls (usually negligible)
  ```

- **Combining both approaches:**
  ```cpp
  class Factory {
  public:
      virtual ~Factory() = default;
      virtual unique_ptr<Sensor> create() = 0;
      
      // Static convenience methods
      static unique_ptr<Factory> makeLidarFactory() {
          return make_unique<LidarFactory>();
      }
      
      static unique_ptr<Factory> makeRadarFactory() {
          return make_unique<RadarFactory>();
      }
  };
  
  // Use static methods for common cases (compile-time)
  auto factory = Factory::makeLidarFactory();
  
  // Use virtual methods for flexibility (runtime)
  void process(Factory& factory) {
      auto sensor = factory.create();
  }
  ```

- **Abstract factory extending virtual factory:**
  ```cpp
  // Create families of related objects
  class AbstractFactory {
  public:
      virtual unique_ptr<Sensor> createSensor() = 0;
      virtual unique_ptr<Display> createDisplay() = 0;
      virtual unique_ptr<Logger> createLogger() = 0;
  };
  
  class ProductionFactory : public AbstractFactory {
  public:
      unique_ptr<Sensor> createSensor() override {
          return make_unique<HardwareSensor>();
      }
      unique_ptr<Display> createDisplay() override {
          return make_unique<HardwareDisplay>();
      }
      unique_ptr<Logger> createLogger() override {
          return make_unique<FileLogger>();
      }
  };
  
  class TestFactory : public AbstractFactory {
  public:
      unique_ptr<Sensor> createSensor() override {
          return make_unique<MockSensor>();
      }
      unique_ptr<Display> createDisplay() override {
          return make_unique<MockDisplay>();
      }
      unique_ptr<Logger> createLogger() override {
          return make_unique<ConsoleLogger>();
      }
  };
  
  // Switch entire family at runtime
  unique_ptr<AbstractFactory> factory;
  if (isProduction) {
      factory = make_unique<ProductionFactory>();
  } else {
      factory = make_unique<TestFactory>();
  }
  
  auto sensor = factory->createSensor();    // Consistent family
  auto display = factory->createDisplay();
  ```

- **When to use each:**
  ```cpp
  // Use virtual factory when:
  // - Factory selection is runtime decision
  // - Need to pass factory as parameter
  // - Want to store factories in containers
  // - Building plugin systems
  // - Implementing dependency injection
  
  // Use static factory when:
  // - Factory choice known at compile-time
  // - Performance critical (avoid vtable)
  // - Simple utility factories
  // - No need for factory polymorphism
  ```

- **Key Concept:** **Virtual factories enable runtime selection; static factories are compile-time optimized**
  - Virtual: Runtime polymorphism, flexible, small overhead
  - Static: Compile-time selection, faster, less flexible
  - Virtual for configuration-driven systems
  - Static for performance-critical paths
  - Can combine both approaches

---

---

#### Q5
```cpp
template<typename T>
class Factory {
public:
    static unique_ptr<Sensor> create() {
        return make_unique<T>();
    }
};

auto sensor = Factory<LidarSensor>::create();

// What are the advantages and limitations?
```

**Answer:**
```
Advantages: Type-safe, zero overhead, inlined. Limitations: Type must be known at compile-time
```

**Explanation:**

- **Compile-time polymorphism (templates):**
  ```cpp
  // Each instantiation creates separate function
  auto lidar = Factory<LidarSensor>::create();
  // Compiler generates: Factory_LidarSensor::create()
  
  auto radar = Factory<RadarSensor>::create();
  // Compiler generates: Factory_RadarSensor::create()
  
  // No vtable, no indirection, fully inlined
  ```

- **Advantages:**

  **1. Zero runtime overhead:**
  ```cpp
  // Virtual factory: vtable lookup + indirect call
  Factory& factory = lidarFactory;
  auto sensor = factory.create();  // ~5ns
  
  // Template factory: direct call, inlined
  auto sensor = Factory<LidarSensor>::create();  // ~0ns (inlined)
  
  // Assembly comparison:
  // Virtual:
  //   mov rax, [factory]      ; Load vtable ptr
  //   mov rax, [rax + 0x10]   ; Load function ptr
  //   call rax                ; Indirect call
  
  // Template:
  //   call make_unique<LidarSensor>  ; Direct call (or inlined)
  ```

  **2. Type safety:**
  ```cpp
  // Template factory: Compilation error if T doesn't satisfy requirements
  struct NotASensor { /* ... */ };
  
  auto bad = Factory<NotASensor>::create();
  // Compilation error: NotASensor doesn't inherit from Sensor
  
  // Can enforce with concepts (C++20):
  template<typename T>
  concept SensorType = std::is_base_of_v<Sensor, T>;
  
  template<SensorType T>
  class Factory {
  public:
      static unique_ptr<Sensor> create() {
          return make_unique<T>();
      }
  };
  
  auto bad = Factory<NotASensor>::create();  // Compilation error!
  ```

  **3. Perfect forwarding:**
  ```cpp
  template<typename T>
  class Factory {
  public:
      template<typename... Args>
      static unique_ptr<Sensor> create(Args&&... args) {
          return make_unique<T>(std::forward<Args>(args)...);
      }
  };
  
  // Can pass constructor arguments
  auto sensor = Factory<LidarSensor>::create("ID-001", 100, 50.0);
  // Forwards arguments perfectly to LidarSensor constructor
  ```

  **4. No virtual destructor overhead:**
  ```cpp
  // Template factory returns concrete type (can be value)
  template<typename T>
  class Factory {
  public:
      static T createValue() {  // Return by value, no slicing
          return T();
      }
  };
  
  LidarSensor sensor = Factory<LidarSensor>::createValue();
  // No vtable, no virtual destructor, no heap allocation
  ```

- **Limitations:**

  **1. Type must be known at compile-time:**
  ```cpp
  // CANNOT do this:
  string sensorType = getUserInput();  // Runtime value
  auto sensor = Factory<???>::create();  // Can't use runtime value as template!
  
  // Must use runtime polymorphism instead:
  unique_ptr<Sensor> sensor;
  if (sensorType == "LIDAR") {
      sensor = make_unique<LidarSensor>();
  } else if (sensorType == "RADAR") {
      sensor = make_unique<RadarSensor>();
  }
  ```

  **2. Cannot store in heterogeneous containers:**
  ```cpp
  // CANNOT do this:
  vector<Factory<???>> factories;  // What type?
  
  // Each template instantiation is a different type:
  // Factory<LidarSensor> and Factory<RadarSensor> are unrelated types
  
  // Must use runtime polymorphism:
  vector<unique_ptr<FactoryBase>> factories;
  factories.push_back(make_unique<LidarFactory>());
  factories.push_back(make_unique<RadarFactory>());
  ```

  **3. Code bloat from template instantiation:**
  ```cpp
  // Each type creates separate code
  auto lidar = Factory<LidarSensor>::create();    // Instantiates Factory<LidarSensor>
  auto radar = Factory<RadarSensor>::create();    // Instantiates Factory<RadarSensor>
  auto camera = Factory<CameraSensor>::create();  // Instantiates Factory<CameraSensor>
  
  // Result: 3x copies of factory code in binary
  // Virtual factory: 1 base class + 3 small derived classes
  ```

  **4. Cannot use with configuration files:**
  ```cpp
  // Config file: "sensorType": "LIDAR"
  // How to map string to template parameter? Can't!
  
  // Workaround: Manual dispatch
  unique_ptr<Sensor> createFromConfig(const string& type) {
      if (type == "LIDAR") return Factory<LidarSensor>::create();
      if (type == "RADAR") return Factory<RadarSensor>::create();
      throw std::invalid_argument("Unknown type");
  }
  ```

- **Hybrid approach (best of both worlds):**
  ```cpp
  // Base interface for runtime polymorphism
  class FactoryBase {
  public:
      virtual ~FactoryBase() = default;
      virtual unique_ptr<Sensor> create() = 0;
  };
  
  // Template implementation for type safety
  template<typename T>
  class Factory : public FactoryBase {
  public:
      unique_ptr<Sensor> create() override {
          return make_unique<T>();
      }
      
      // Static method for compile-time optimization
      static unique_ptr<Sensor> createStatic() {
          return make_unique<T>();
      }
  };
  
  // Use static when type known at compile-time (zero overhead)
  auto sensor1 = Factory<LidarSensor>::createStatic();
  
  // Use virtual when type is runtime decision
  unique_ptr<FactoryBase> factory = make_unique<Factory<LidarSensor>>();
  auto sensor2 = factory->create();
  ```

- **CRTP alternative (static polymorphism):**
  ```cpp
  template<typename Derived>
  class FactoryBase {
  public:
      unique_ptr<Sensor> create() {
          return static_cast<Derived*>(this)->createImpl();
      }
  };
  
  class LidarFactory : public FactoryBase<LidarFactory> {
  public:
      unique_ptr<Sensor> createImpl() {
          return make_unique<LidarSensor>();
      }
  };
  
  template<typename Factory>
  void process(Factory& factory) {
      auto sensor = factory.create();  // No virtual call!
  }
  
  LidarFactory factory;
  process(factory);  // Fully inlined
  ```

- **When to use template factories:**
  ```cpp
  // Use when:
  // 1. Type known at compile-time
  template<typename SensorType>
  class SensorArray {
      Factory<SensorType> factory;
  public:
      SensorType create() {
          return factory.create();
      }
  };
  
  // 2. Performance critical path
  for (int i = 0; i < 1000000; ++i) {
      auto sensor = Factory<LidarSensor>::create();  // Inlined
      process(sensor);
  }
  
  // 3. Generic algorithms
  template<typename T>
  vector<unique_ptr<Sensor>> createMany(size_t count) {
      vector<unique_ptr<Sensor>> result;
      for (size_t i = 0; i < count; ++i) {
          result.push_back(Factory<T>::create());
      }
      return result;
  }
  
  auto lidarSensors = createMany<LidarSensor>(100);
  ```

- **Key Concept:** **Template factories provide zero-overhead, type-safe creation but require compile-time type knowledge**
  - Zero runtime overhead (inlined)
  - Full type safety with concepts
  - Cannot use with runtime decisions
  - Best for known types in performance-critical code
  - Combine with virtual factories for flexibility

---

---

#### Q6
```cpp
class SensorFactory {
public:
    static unique_ptr<Sensor> create(Type type) {
        Sensor* s = nullptr;

        switch (type) {
            case Type::LIDAR:
                s = new LidarSensor();
                break;
            case Type::RADAR:
                s = new RadarSensor();
                break;
        }

        s->initialize();  // May throw exception
        return unique_ptr<Sensor>(s);
    }
};

// What's the problem if initialize() throws?
```

**Answer:**
```
Memory leak if initialize() throws before unique_ptr construction
```

**Explanation:**

- **Exception safety problem:**
  ```cpp
  Sensor* s = new LidarSensor();  // 1. Allocate raw pointer
  s->initialize();                 // 2. May throw!
  return unique_ptr<Sensor>(s);    // 3. Never reached if throw
  
  // If initialize() throws:
  // - Exception propagates up the stack
  // - unique_ptr never constructed
  // - Raw pointer 's' lost
  // - Memory leaked!
  ```

- **Step-by-step failure scenario:**
  ```cpp
  try {
      auto sensor = SensorFactory::create(Type::LIDAR);
  } catch (const std::exception& e) {
      // Exception caught, but...
      // LidarSensor object was allocated
      // initialize() threw before unique_ptr took ownership
      // Object never deleted → MEMORY LEAK
  }
  
  // Heap state:
  // [LidarSensor object] ← allocated but no pointer to it!
  ```

- **Why unique_ptr doesn't help here:**
  ```cpp
  // unique_ptr ONLY takes ownership when constructed
  Sensor* s = new LidarSensor();  // Allocate
  s->initialize();                 // Throw here!
  return unique_ptr<Sensor>(s);    // Never executed
  
  // unique_ptr never created → no RAII protection
  
  // Correct ownership transfer:
  unique_ptr<Sensor> s = make_unique<LidarSensor>();  // RAII immediately
  s->initialize();  // If throws, unique_ptr destructor called
  return s;         // If we get here, return moves unique_ptr
  ```

- **Multiple exception points:**
  ```cpp
  static unique_ptr<Sensor> create(Type type) {
      Sensor* s = nullptr;
      
      switch (type) {
          case Type::LIDAR:
              s = new LidarSensor();  // Can throw (out of memory)
              break;
      }
      
      s->initialize();  // Can throw (hardware error)
      s->calibrate();   // Can throw (calibration failure)
      s->connect();     // Can throw (connection error)
      
      return unique_ptr<Sensor>(s);  // Only reached if all succeed
  }
  
  // Memory leak if ANY of the above throw!
  ```

- **Solution 1: Construct unique_ptr immediately (best):**
  ```cpp
  static unique_ptr<Sensor> create(Type type) {
      unique_ptr<Sensor> sensor;  // Start with nullptr
      
      switch (type) {
          case Type::LIDAR:
              sensor = make_unique<LidarSensor>();  // RAII protection
              break;
          case Type::RADAR:
              sensor = make_unique<RadarSensor>();
              break;
      }
      
      sensor->initialize();  // Protected by unique_ptr
      // If throws, unique_ptr destructor called automatically
      
      return sensor;  // Move
  }
  
  // Exception-safe: unique_ptr owns from construction
  ```

- **Solution 2: RAII wrapper for initialization:**
  ```cpp
  template<typename T, typename... Args>
  unique_ptr<T> makeAndInitialize(Args&&... args) {
      auto obj = make_unique<T>(std::forward<Args>(args)...);
      obj->initialize();  // Protected by unique_ptr
      return obj;
  }
  
  static unique_ptr<Sensor> create(Type type) {
      switch (type) {
          case Type::LIDAR:
              return makeAndInitialize<LidarSensor>();
          case Type::RADAR:
              return makeAndInitialize<RadarSensor>();
      }
  }
  ```

- **Solution 3: Try-catch with manual cleanup (not recommended):**
  ```cpp
  static unique_ptr<Sensor> create(Type type) {
      Sensor* s = nullptr;
      
      try {
          switch (type) {
              case Type::LIDAR:
                  s = new LidarSensor();
                  break;
          }
          
          s->initialize();  // May throw
          return unique_ptr<Sensor>(s);  // Success
          
      } catch (...) {
          delete s;  // Manual cleanup
          throw;     // Re-throw
      }
  }
  
  // Works but verbose and error-prone
  // Miss one path → leak
  ```

- **Initialize in constructor (architectural solution):**
  ```cpp
  class LidarSensor : public Sensor {
  public:
      LidarSensor() {
          initialize();  // Initialize in constructor
      }
      
  private:
      void initialize() {
          // Initialization logic
          // If throws, destructor NOT called (object not fully constructed)
          // But no leak: memory freed automatically
      }
  };
  
  static unique_ptr<Sensor> create(Type type) {
      switch (type) {
          case Type::LIDAR:
              return make_unique<LidarSensor>();  // Throws if init fails
          case Type::RADAR:
              return make_unique<RadarSensor>();
      }
  }
  
  // Exception-safe by design
  // If constructor throws, no object created, no leak
  ```

- **Exception safety levels:**
  ```cpp
  // No guarantee (BROKEN):
  Sensor* s = new Sensor();
  s->initialize();  // Leak if throws
  return unique_ptr<Sensor>(s);
  
  // Basic guarantee (OK):
  unique_ptr<Sensor> s = make_unique<Sensor>();
  s->initialize();  // No leak, but sensor may be partially initialized
  return s;
  
  // Strong guarantee (BEST):
  auto s = make_unique<Sensor>();
  s->initialize();
  if (!s->isValid()) {
      throw std::runtime_error("Init failed");
  }
  return s;  // Either fully initialized or exception thrown
  ```

- **Real-world example (network socket):**
  ```cpp
  // BROKEN:
  Socket* socket = new Socket();
  socket->connect(address);  // May throw
  return unique_ptr<Socket>(socket);  // Leak if connect throws
  
  // FIXED:
  auto socket = make_unique<Socket>();
  socket->connect(address);  // Safe: unique_ptr owns socket
  return socket;  // Destructor closes socket if exception
  ```

- **Key Concept:** **Always use RAII (unique_ptr) immediately; never hold raw pointers to owned objects**
  - Raw pointer + throwing function = memory leak
  - Construct unique_ptr immediately for RAII protection
  - Exception between new and unique_ptr construction leaks
  - Use make_unique to combine allocation and ownership
  - Consider initialization in constructor for cleaner design

---

---

#### Q7
```cpp
class Factory {
    map<string, function<unique_ptr<Sensor>()>> registry;

public:
    void registerType(const string& name, auto creator) {
        registry[name] = creator;
    }

    unique_ptr<Sensor> create(const string& name) {
        return registry[name]();  // What if name not found?
    }
};

auto sensor = factory.create("unknown_type");
```

**Answer:**
```
Undefined behavior - accessing non-existent map key creates null function, calling it crashes
```

**Explanation:**

- **operator[] behavior on map:**
  ```cpp
  map<string, function<unique_ptr<Sensor>()>> registry;
  
  // If key exists:
  auto& func = registry["lidar"];  // Returns reference to existing function
  
  // If key DOESN'T exist:
  auto& func = registry["unknown"];  // CREATES new entry!
  // - Inserts key "unknown"
  // - Value is default-constructed: function<...>()
  // - Default-constructed std::function is EMPTY (null)
  ```

- **Calling null std::function:**
  ```cpp
  function<int()> f;  // Default constructed, empty
  
  if (!f) {
      cout << "Function is null
";  // This is true
  }
  
  int result = f();  // UNDEFINED BEHAVIOR!
  // Typically throws std::bad_function_call or crashes
  ```

- **Step-by-step failure:**
  ```cpp
  auto sensor = factory.create("unknown_type");
  
  // 1. create() called with "unknown_type"
  // 2. registry["unknown_type"] accessed
  // 3. Key doesn't exist, map creates default entry
  // 4. registry["unknown_type"] = function<...>() (null function)
  // 5. return registry["unknown_type"]();
  //    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  //    Calls null function!
  // 6. std::bad_function_call exception OR crash
  ```

- **Map side effect:**
  ```cpp
  Factory factory;
  factory.registerType("lidar", []() { return make_unique<LidarSensor>(); });
  
  cout << "Size before: " << factory.registrySize() << "
";  // 1
  
  try {
      auto sensor = factory.create("unknown");  // Failed creation
  } catch (...) {
      cout << "Size after: " << factory.registrySize() << "
";  // 2!
      // Map now contains "unknown" → null function
  }
  
  // Calling again:
  auto sensor = factory.create("unknown");  // Still crashes!
  // Entry exists but function is still null
  ```

- **Solution 1: Use find() to check existence:**
  ```cpp
  unique_ptr<Sensor> create(const string& name) {
      auto it = registry.find(name);
      if (it == registry.end()) {
          throw std::invalid_argument("Unknown sensor type: " + name);
      }
      return it->second();  // Safe: function exists
  }
  
  // Usage:
  try {
      auto sensor = factory.create("unknown");
  } catch (const std::invalid_argument& e) {
      cerr << e.what() << "
";  // "Unknown sensor type: unknown"
  }
  ```

- **Solution 2: Use at() (throws if not found):**
  ```cpp
  unique_ptr<Sensor> create(const string& name) {
      try {
          return registry.at(name)();  // at() throws if key missing
      } catch (const std::out_of_range&) {
          throw std::invalid_argument("Unknown sensor type: " + name);
      }
  }
  
  // Shorter but throws generic exception
  unique_ptr<Sensor> create(const string& name) {
      return registry.at(name)();  // Let std::out_of_range propagate
  }
  ```

- **Solution 3: Return optional for expected failure:**
  ```cpp
  optional<unique_ptr<Sensor>> create(const string& name) {
      auto it = registry.find(name);
      if (it == registry.end()) {
          return nullopt;  // Not found
      }
      return it->second();  // Found
  }
  
  // Usage:
  if (auto sensor = factory.create("lidar")) {
      // Use *sensor
  } else {
      cerr << "Sensor type not found
";
  }
  
  // Forces caller to handle failure explicitly
  ```

- **Solution 4: Provide default factory:**
  ```cpp
  class Factory {
      map<string, function<unique_ptr<Sensor>()>> registry;
      function<unique_ptr<Sensor>()> defaultFactory;
  
  public:
      void setDefault(function<unique_ptr<Sensor>()> factory) {
          defaultFactory = factory;
      }
      
      unique_ptr<Sensor> create(const string& name) {
          auto it = registry.find(name);
          if (it == registry.end()) {
              if (defaultFactory) {
                  return defaultFactory();  // Use default
              }
              throw std::invalid_argument("Unknown type: " + name);
          }
          return it->second();
      }
  };
  
  // Usage:
  factory.setDefault([]() { return make_unique<GenericSensor>(); });
  auto sensor = factory.create("unknown");  // Returns GenericSensor
  ```

- **Solution 5: Assert in debug, exception in release:**
  ```cpp
  unique_ptr<Sensor> create(const string& name) {
      auto it = registry.find(name);
      
      assert(it != registry.end() && "Sensor type not registered");
      
      if (it == registry.end()) {
          throw std::invalid_argument("Unknown sensor type: " + name);
      }
      
      return it->second();
  }
  
  // Debug: Assertion failure (loud, stops execution)
  // Release: Exception (recoverable)
  ```

- **Validating function is callable:**
  ```cpp
  void registerType(const string& name, function<unique_ptr<Sensor>()> creator) {
      if (!creator) {
          throw std::invalid_argument("Cannot register null factory");
      }
      registry[name] = creator;
  }
  
  unique_ptr<Sensor> create(const string& name) {
      auto it = registry.find(name);
      if (it == registry.end()) {
          throw std::invalid_argument("Unknown type: " + name);
      }
      
      // Double-check function is valid (paranoid check)
      if (!it->second) {
          throw std::runtime_error("Factory for " + name + " is null");
      }
      
      return it->second();
  }
  ```

- **Performance consideration:**
  ```cpp
  // find() then access: Two map lookups
  auto it = registry.find(name);
  if (it == registry.end()) { /* ... */ }
  return it->second();
  
  // at(): One map lookup, but throws exception
  return registry.at(name)();  // Faster if key exists
  
  // operator[]: One map lookup, but modifies map
  return registry[name]();  // BAD: Creates entry if missing
  
  // Best: Use find() for correctness, at() for brevity
  ```

- **Key Concept:** **Always check map keys before access; operator[] creates default entries**
  - operator[] creates empty std::function if key missing
  - Calling empty std::function is undefined behavior
  - Use find() to check existence
  - Use at() for automatic exception
  - Return optional for expected failures
  - Validate during registration, not just creation

---

---

#### Q8
```cpp
enum class SensorType { LIDAR, RADAR, CAMERA };

unique_ptr<Sensor> createSensor(SensorType type) {
    switch (type) {
        case SensorType::LIDAR:
            return make_unique<LidarSensor>();
        case SensorType::RADAR:
            return make_unique<RadarSensor>();
    }
}

// What compile-time safety does this provide?
```

**Answer:**
```
Compiler warns if not all enum cases handled (with -Wswitch or -Wswitch-enum enabled)
```

**Explanation:**

- **Enum exhaustiveness checking:**
  ```cpp
  enum class SensorType { LIDAR, RADAR, CAMERA };
  
  unique_ptr<Sensor> createSensor(SensorType type) {
      switch (type) {
          case SensorType::LIDAR:
              return make_unique<LidarSensor>();
          case SensorType::RADAR:
              return make_unique<RadarSensor>();
          // MISSING: SensorType::CAMERA
      }
  }
  
  // Compiler warning with -Wswitch:
  // warning: enumeration value 'CAMERA' not handled in switch [-Wswitch]
  
  // Compiler warning with -Wswitch-enum (stricter):
  // warning: enumeration value 'CAMERA' not explicitly handled in switch
  ```

- **Why no default case is important:**
  ```cpp
  // BAD: With default case
  switch (type) {
      case SensorType::LIDAR:
          return make_unique<LidarSensor>();
      case SensorType::RADAR:
          return make_unique<RadarSensor>();
      default:
          return nullptr;  // Silently handles CAMERA!
  }
  
  // If you add CAMERA to enum:
  enum class SensorType { LIDAR, RADAR, CAMERA };
  // NO COMPILER WARNING! Default case silently catches new value
  // Bug introduced silently
  
  // GOOD: Without default case
  switch (type) {
      case SensorType::LIDAR:
          return make_unique<LidarSensor>();
      case SensorType::RADAR:
          return make_unique<RadarSensor>();
  }
  // Adding CAMERA to enum triggers compiler warning
  // Forces developer to add explicit case
  ```

- **Compile-time vs runtime checking:**
  ```cpp
  // Compile-time safety (enum class with switch):
  enum class SensorType { LIDAR, RADAR, CAMERA };
  
  switch (type) {
      case SensorType::LIDAR: /* ... */
      case SensorType::RADAR: /* ... */
      // Forget CAMERA → Compiler warning
  }
  
  // Runtime-only checking (int-based):
  int type = getUserInput();  // User enters 3
  
  if (type == 1) { /* LIDAR */ }
  else if (type == 2) { /* RADAR */ }
  // Forget case 3 → No warning, runtime error
  
  // Runtime-only checking (string-based):
  string type = getConfig();
  
  if (type == "LIDAR") { /* ... */ }
  else if (type == "RADAR") { /* ... */ }
  // Forget "CAMERA" → No warning, runtime error
  ```

- **Compiler flag differences:**
  ```cpp
  // -Wswitch (default in -Wall):
  // Warns if named enum values not handled
  // Ignores unlabeled enum values (rarely used)
  
  // -Wswitch-enum (stricter):
  // Warns if ANY enum value not explicitly handled
  // Even if all named values covered
  
  // Example:
  enum class SensorType {
      LIDAR = 0,
      RADAR = 1,
      CAMERA = 2,
      INTERNAL_USE = 99  // Not documented
  };
  
  switch (type) {
      case SensorType::LIDAR: /* ... */
      case SensorType::RADAR: /* ... */
      case SensorType::CAMERA: /* ... */
  }
  
  // -Wswitch: No warning (all named values handled)
  // -Wswitch-enum: Warning (INTERNAL_USE not handled)
  ```

- **Practical example - adding new sensor type:**
  ```cpp
  // Initial code:
  enum class SensorType { LIDAR, RADAR };
  
  unique_ptr<Sensor> createSensor(SensorType type) {
      switch (type) {
          case SensorType::LIDAR:
              return make_unique<LidarSensor>();
          case SensorType::RADAR:
              return make_unique<RadarSensor>();
      }
  }
  
  void displaySensor(SensorType type) {
      switch (type) {
          case SensorType::LIDAR:
              cout << "LIDAR";
              break;
          case SensorType::RADAR:
              cout << "RADAR";
              break;
      }
  }
  
  // Developer adds new sensor type:
  enum class SensorType { LIDAR, RADAR, CAMERA };  // Added CAMERA
  
  // Compiler immediately warns at BOTH functions:
  // createSensor.cpp:5: warning: enumeration value 'CAMERA' not handled
  // displaySensor.cpp:12: warning: enumeration value 'CAMERA' not handled
  
  // Forces developer to update all switches
  // Catches missing cases at compile-time, not runtime
  ```

- **Return path coverage:**
  ```cpp
  unique_ptr<Sensor> createSensor(SensorType type) {
      switch (type) {
          case SensorType::LIDAR:
              return make_unique<LidarSensor>();
          case SensorType::RADAR:
              return make_unique<RadarSensor>();
      }
      // NO RETURN HERE!
  }
  
  // Without default:
  // Compiler warning: control reaches end of non-void function
  
  // Forces you to either:
  // 1. Add all enum cases (best)
  // 2. Add unreachable() or throw (ok)
  // 3. Add default case (loses exhaustiveness checking)
  
  // Option 1 (best):
  switch (type) {
      case SensorType::LIDAR: return ...;
      case SensorType::RADAR: return ...;
      case SensorType::CAMERA: return ...;
  }
  // All cases handled, no warning
  
  // Option 2 (ok):
  switch (type) {
      case SensorType::LIDAR: return ...;
      case SensorType::RADAR: return ...;
      case SensorType::CAMERA: return ...;
  }
  __builtin_unreachable();  // GCC/Clang
  // or: throw std::logic_error("Unreachable");
  
  // Option 3 (loses safety):
  switch (type) {
      case SensorType::LIDAR: return ...;
      case SensorType::RADAR: return ...;
      default: return nullptr;  // BAD: Loses exhaustiveness
  }
  ```

- **Enum class vs plain enum:**
  ```cpp
  // Plain enum (C-style):
  enum SensorType { LIDAR, RADAR };
  
  SensorType type = LIDAR;
  int i = type;  // Implicit conversion to int
  if (type == 0) { /* Works */ }
  
  // Can pass invalid values:
  createSensor((SensorType)999);  // Compiles! Runtime error
  
  // Enum class (C++11):
  enum class SensorType { LIDAR, RADAR };
  
  SensorType type = SensorType::LIDAR;
  int i = type;  // ERROR: No implicit conversion
  int i = static_cast<int>(type);  // Explicit required
  if (type == 0) { /* ERROR */ }
  
  // Cannot pass invalid values easily:
  createSensor((SensorType)999);  // Still possible but explicit cast
  ```

- **Using [[nodiscard]] for extra safety:**
  ```cpp
  [[nodiscard]] unique_ptr<Sensor> createSensor(SensorType type) {
      switch (type) {
          case SensorType::LIDAR:
              return make_unique<LidarSensor>();
          case SensorType::RADAR:
              return make_unique<RadarSensor>();
          case SensorType::CAMERA:
              return make_unique<CameraSensor>();
      }
  }
  
  // Caller forgets to use result:
  createSensor(SensorType::LIDAR);  // WARNING: ignoring return value
  
  // Forces caller to use result:
  auto sensor = createSensor(SensorType::LIDAR);  // OK
  ```

- **Static analysis benefits:**
  ```cpp
  // Static analyzers (clang-tidy, cppcheck) can detect:
  
  // 1. Missing enum cases
  unique_ptr<Sensor> createSensor(SensorType type) {
      switch (type) {
          case SensorType::LIDAR: return ...;
          // Missing RADAR and CAMERA
      }
  }
  // clang-tidy: Not all enum values covered
  
  // 2. Unreachable code after complete switch
  switch (type) {
      case SensorType::LIDAR: return ...;
      case SensorType::RADAR: return ...;
      case SensorType::CAMERA: return ...;
  }
  return nullptr;  // Unreachable! Warning
  
  // 3. Redundant default cases
  switch (type) {
      case SensorType::LIDAR: return ...;
      case SensorType::RADAR: return ...;
      case SensorType::CAMERA: return ...;
      default: return nullptr;  // Redundant! Loses safety
  }
  ```

- **Key Concept:** **Switch on enum without default enables compile-time exhaustiveness checking**
  - Compiler warns when enum cases not handled
  - Adding enum value triggers warnings at all switches
  - Catches missing cases at compile-time, not runtime
  - Use enum class for type safety
  - Avoid default case to maintain exhaustiveness
  - Enable -Wswitch or -Wswitch-enum warnings

---

---

---


#### Q9
```cpp
class Factory {
    static map<Type, function<unique_ptr<Sensor>()>> registry;

public:
    static void registerType(Type type, function<unique_ptr<Sensor>()> creator) {
        registry[type] = creator;
    }

    static unique_ptr<Sensor> create(Type type) {
        return registry[type]();
    }
};

// Auto-registration with static initializer
struct AutoRegister {
    AutoRegister(Type type, function<unique_ptr<Sensor>()> creator) {
        Factory::registerType(type, creator);
    }
};

static AutoRegister regLidar(Type::LIDAR, []() { return make_unique<LidarSensor>(); });
static AutoRegister regRadar(Type::RADAR, []() { return make_unique<RadarSensor>(); });

// What are the advantages of registry-based factories?
```

**Answer:**
```
Registry-based factories enable Open/Closed Principle - add new types without modifying factory code
```

**Explanation:**

- **Registry pattern eliminates switch statements:**
  ```cpp
  // OLD: Must modify factory for each new type (violates OCP)
  unique_ptr<Sensor> create(Type type) {
      switch (type) {
          case Type::LIDAR: return make_unique<LidarSensor>();
          case Type::RADAR: return make_unique<RadarSensor>();
          // Add CAMERA: Must edit this function!
      }
  }

  // NEW: Registry-based (Open/Closed Principle)
  static map<Type, function<unique_ptr<Sensor>()>> registry;

  unique_ptr<Sensor> create(Type type) {
      return registry.at(type)();  // No modification needed!
  }

  // Add CAMERA: Just register it, no factory changes
  Factory::registerType(Type::CAMERA, []() { return make_unique<CameraSensor>(); });
  ```

- **Self-registration pattern:**
  ```cpp
  // Each sensor type registers itself automatically
  class LidarSensor : public Sensor {
  public:
      static bool registered;
      static bool register_type() {
          Factory::registerType(Type::LIDAR, []() {
              return make_unique<LidarSensor>();
          });
          return true;
      }
  };

  // Static initialization runs before main()
  bool LidarSensor::registered = LidarSensor::register_type();

  // Now factory automatically knows about LidarSensor
  // No central registration needed!
  ```

- **Macro-based registration for convenience:**
  ```cpp
  #define REGISTER_SENSOR(TypeEnum, ClassName) \
      static bool registered_##ClassName = []() { \
          Factory::registerType(TypeEnum, []() { \
              return std::make_unique<ClassName>(); \
          }); \
          return true; \
      }()

  // Usage in sensor implementation files:
  // lidar_sensor.cpp
  class LidarSensor : public Sensor { /* ... */ };
  REGISTER_SENSOR(Type::LIDAR, LidarSensor);

  // radar_sensor.cpp
  class RadarSensor : public Sensor { /* ... */ };
  REGISTER_SENSOR(Type::RADAR, RadarSensor);

  // camera_sensor.cpp
  class CameraSensor : public Sensor { /* ... */ };
  REGISTER_SENSOR(Type::CAMERA, CameraSensor);

  // Factory automatically knows about all types at startup!
  ```

- **Plugin architecture benefits:**
  ```cpp
  // Load sensors from dynamic libraries (.so / .dll)
  void loadPlugin(const string& libraryPath) {
      void* handle = dlopen(libraryPath.c_str(), RTLD_NOW);

      // Each plugin's static initializers run automatically
      // They register themselves with Factory::registerType()
      // No need to know sensor types at compile-time!
  }

  // Example: Load camera sensor plugin at runtime
  loadPlugin("libcamera_sensor.so");

  // Now camera sensor is available:
  auto camera = Factory::create(Type::CAMERA);  // Works!

  // Can add new sensor types without recompiling main application
  ```

- **Runtime discovery of available types:**
  ```cpp
  class Factory {
      static map<Type, function<unique_ptr<Sensor>()>> registry;

  public:
      static vector<Type> getRegisteredTypes() {
          vector<Type> types;
          for (const auto& [type, creator] : registry) {
              types.push_back(type);
          }
          return types;
      }

      static bool isRegistered(Type type) {
          return registry.count(type) > 0;
      }
  };

  // Query what's available at runtime:
  auto types = Factory::getRegisteredTypes();
  for (Type t : types) {
      cout << "Available sensor: " << toString(t) << "
";
  }

  // Check before creating:
  if (Factory::isRegistered(Type::CAMERA)) {
      auto sensor = Factory::create(Type::CAMERA);
  }
  ```

- **Advantages over switch-based factories:**
  ```
  Switch-based:
  ✅ Simple to understand
  ✅ Compile-time checking
  ✅ No runtime overhead
  ❌ Must modify factory for new types (violates OCP)
  ❌ Cannot load types dynamically
  ❌ All types must be known at compile-time
  ❌ Cannot list available types at runtime

  Registry-based:
  ✅ Open/Closed Principle (add types without modifying factory)
  ✅ Plugin architecture support
  ✅ Runtime type discovery
  ✅ Dynamic library loading
  ✅ Self-registration pattern
  ❌ Small runtime overhead (map lookup)
  ❌ No compile-time exhaustiveness checking
  ❌ Potential runtime errors if type not registered
  ```

- **Combining both approaches:**
  ```cpp
  class Factory {
      static map<Type, function<unique_ptr<Sensor>()>> registry;

  public:
      // Registry-based (dynamic):
      static unique_ptr<Sensor> createDynamic(Type type) {
          auto it = registry.find(type);
          if (it == registry.end()) {
              throw std::invalid_argument("Unknown type");
          }
          return it->second();
      }

      // Switch-based (compile-time checked):
      static unique_ptr<Sensor> createStatic(Type type) {
          switch (type) {
              case Type::LIDAR: return make_unique<LidarSensor>();
              case Type::RADAR: return make_unique<RadarSensor>();
              case Type::CAMERA: return make_unique<CameraSensor>();
          }
          throw std::invalid_argument("Unknown type");
      }

      // Use static for known types (fast, compile-time checked)
      // Use dynamic for plugins/extensions (flexible, runtime loaded)
  };
  ```

- **Static initialization order issues:**
  ```cpp
  // PROBLEM: Initialization order fiasco

  // factory.cpp
  map<Type, function<unique_ptr<Sensor>()>> Factory::registry;

  // lidar_sensor.cpp
  static bool lidarReg = []() {
      Factory::registerType(Type::LIDAR, ...);  // May run before registry constructed!
      return true;
  }();

  // SOLUTION: Meyers Singleton pattern
  class Factory {
      static map<Type, function<unique_ptr<Sensor>()>>& getRegistry() {
          static map<Type, function<unique_ptr<Sensor>()>> registry;
          return registry;  // Thread-safe initialization (C++11)
      }

  public:
      static void registerType(Type type, function<unique_ptr<Sensor>()> creator) {
          getRegistry()[type] = creator;  // Registry always exists
      }

      static unique_ptr<Sensor> create(Type type) {
          return getRegistry().at(type)();
      }
  };
  ```

- **Performance comparison:**
  ```cpp
  // Benchmark: 1M factory calls

  // Switch-based:
  // Time: ~20ms (direct function call, likely inlined)
  for (int i = 0; i < 1000000; ++i) {
      auto sensor = Factory::createStatic(Type::LIDAR);
  }

  // Registry-based:
  // Time: ~40ms (map lookup + function pointer call)
  for (int i = 0; i < 1000000; ++i) {
      auto sensor = Factory::createDynamic(Type::LIDAR);
  }

  // Registry overhead: ~20ns per call
  // Usually negligible compared to object construction cost
  ```

- **Alternative: Class-based registry:**
  ```cpp
  class SensorFactoryBase {
  public:
      virtual ~SensorFactoryBase() = default;
      virtual unique_ptr<Sensor> create() = 0;
  };

  template<typename T>
  class SensorFactory : public SensorFactoryBase {
  public:
      unique_ptr<Sensor> create() override {
          return make_unique<T>();
      }
  };

  // Registry holds factory objects instead of functions:
  static map<Type, unique_ptr<SensorFactoryBase>> registry;

  // Register:
  registry[Type::LIDAR] = make_unique<SensorFactory<LidarSensor>>();

  // Create:
  return registry.at(type)->create();

  // Advantage: Can store state in factory objects
  // Disadvantage: More memory (objects vs function pointers)
  ```

- **Configuration-driven factories:**
  ```cpp
  // config.json:
  // {
  //   "sensors": [
  //     {"type": "LIDAR", "class": "LidarSensor"},
  //     {"type": "RADAR", "class": "RadarSensor"},
  //     {"type": "CAMERA", "class": "CameraSensor"}
  //   ]
  // }

  void loadFactoriesFromConfig(const string& configFile) {
      json config = loadJson(configFile);

      for (const auto& sensor : config["sensors"]) {
          string typeStr = sensor["type"];
          string className = sensor["class"];

          Type type = stringToType(typeStr);

          // Look up class name and register creator
          if (className == "LidarSensor") {
              Factory::registerType(type, []() { return make_unique<LidarSensor>(); });
          } else if (className == "RadarSensor") {
              Factory::registerType(type, []() { return make_unique<RadarSensor>(); });
          }
          // Can also use dlsym for dynamic loading
      }
  }
  ```

- **Key Concept:** **Registry-based factories enable Open/Closed Principle and plugin architectures**
  - Add new types without modifying factory code
  - Self-registration with static initializers
  - Support for dynamic plugin loading
  - Runtime type discovery and introspection
  - Small runtime overhead (~20ns) vs switch-based
  - Watch out for static initialization order
  - Best for extensible systems and plugin architectures

---

---

---

#### Q10
```cpp
class SensorFactory {
public:
    static unique_ptr<Sensor> create(int type) {  // int instead of enum
        if (type == 1) return make_unique<LidarSensor>();
        if (type == 2) return make_unique<RadarSensor>();
        return nullptr;  // Invalid type
    }
};

auto sensor = SensorFactory::create(5);  // Typo or invalid

// What's wrong with this design?
```

**Answer:**
```
No type safety - magic numbers allow invalid values, returning nullptr is error-prone
```

**Explanation:**

- **Magic numbers problem:**
  ```cpp
  // BAD: Using int for sensor type
  auto sensor1 = SensorFactory::create(1);  // What is 1? LIDAR? RADAR?
  auto sensor2 = SensorFactory::create(2);  // What is 2?
  auto sensor3 = SensorFactory::create(5);  // Typo! Returns nullptr
  auto sensor4 = SensorFactory::create(-1);  // Invalid! Returns nullptr
  auto sensor5 = SensorFactory::create(99999);  // Also invalid!
  
  // No compile-time checking
  // No auto-completion in IDE
  // No documentation of valid values
  ```

- **nullptr return is dangerous:**
  ```cpp
  auto sensor = SensorFactory::create(5);  // Returns nullptr
  sensor->readValue();  // CRASH! Dereferencing nullptr
  
  // Easy to forget null check:
  auto sensor = SensorFactory::create(type);
  // ... 50 lines of code ...
  sensor->readValue();  // Did we check if sensor is null? No idea!
  
  // CORRECT: Must check every time
  auto sensor = SensorFactory::create(type);
  if (sensor) {
      sensor->readValue();
  } else {
      // Handle error
  }
  // But this is error-prone and easy to forget!
  ```

- **Type safety with enum class:**
  ```cpp
  // GOOD: Using enum class
  enum class SensorType { LIDAR, RADAR, CAMERA };
  
  class SensorFactory {
  public:
      static unique_ptr<Sensor> create(SensorType type) {
          switch (type) {
              case SensorType::LIDAR:
                  return make_unique<LidarSensor>();
              case SensorType::RADAR:
                  return make_unique<RadarSensor>();
              case SensorType::CAMERA:
                  return make_unique<CameraSensor>();
          }
          throw std::invalid_argument("Unknown sensor type");
      }
  };
  
  // Can ONLY pass valid enum values:
  auto sensor1 = SensorFactory::create(SensorType::LIDAR);  // Clear!
  auto sensor2 = SensorFactory::create(5);  // ERROR: Can't convert int to enum class
  
  // IDE auto-completion shows valid values
  // Self-documenting code
  // Compiler error on invalid values
  ```

- **Better error handling:**
  ```cpp
  // Option 1: Throw exception (unexpected error)
  static unique_ptr<Sensor> create(SensorType type) {
      switch (type) {
          case SensorType::LIDAR: return make_unique<LidarSensor>();
          case SensorType::RADAR: return make_unique<RadarSensor>();
      }
      throw std::invalid_argument("Unknown sensor type");
  }
  
  // Usage:
  try {
      auto sensor = SensorFactory::create(type);
      sensor->readValue();  // No null check needed!
  } catch (const std::invalid_argument& e) {
      cerr << "Error: " << e.what() << "
";
  }
  
  // Option 2: Return optional (expected failure)
  static optional<unique_ptr<Sensor>> create(SensorType type) {
      switch (type) {
          case SensorType::LIDAR: 
              return make_unique<LidarSensor>();
          case SensorType::RADAR: 
              return make_unique<RadarSensor>();
      }
      return nullopt;  // Explicit "not found"
  }
  
  // Usage: Forces caller to handle failure
  if (auto sensor = SensorFactory::create(type)) {
      (*sensor)->readValue();
  } else {
      cerr << "Invalid sensor type
";
  }
  
  // Option 3: Return expected<T, E> (C++23)
  static std::expected<unique_ptr<Sensor>, string> create(SensorType type) {
      switch (type) {
          case SensorType::LIDAR: 
              return make_unique<LidarSensor>();
          case SensorType::RADAR: 
              return make_unique<RadarSensor>();
      }
      return std::unexpected("Unknown sensor type");
  }
  
  // Usage:
  auto result = SensorFactory::create(type);
  if (result) {
      result->get()->readValue();
  } else {
      cerr << result.error() << "
";
  }
  ```

- **Real-world mistake examples:**
  ```cpp
  // PROBLEM 1: Passing wrong constant
  const int LIDAR = 1;
  const int RADAR = 2;
  const int CAMERA = 3;
  
  // Developer makes typo:
  auto sensor = SensorFactory::create(RADAR_SENSOR);  // Undefined! May be 0 or garbage
  
  // With enum class:
  auto sensor = SensorFactory::create(SensorType::RADAR_SENSOR);  // Compile error!
  
  // PROBLEM 2: Off-by-one error
  for (int i = 1; i <= 2; ++i) {
      auto sensor = SensorFactory::create(i);
      if (sensor) process(sensor.get());
  }
  // What if someone adds CAMERA = 3? Loop doesn't include it!
  
  // With enum class:
  for (auto type : {SensorType::LIDAR, SensorType::RADAR, SensorType::CAMERA}) {
      auto sensor = SensorFactory::create(type);
      process(sensor.get());
  }
  // Explicit list, no off-by-one
  
  // PROBLEM 3: Configuration file
  // config.json: { "sensorType": 1 }
  int type = config["sensorType"];
  auto sensor = SensorFactory::create(type);
  // What if config has wrong value? Silent failure!
  
  // Better: String to enum mapping
  // config.json: { "sensorType": "LIDAR" }
  SensorType type = stringToSensorType(config["sensorType"]);  // Validates!
  auto sensor = SensorFactory::create(type);
  ```

- **nullptr propagation problem:**
  ```cpp
  // BAD: nullptr silently propagates
  class SensorSystem {
      unique_ptr<Sensor> sensor;
  public:
      SensorSystem(int sensorType) {
          sensor = SensorFactory::create(sensorType);  // May be nullptr!
      }
      
      void run() {
          sensor->readValue();  // CRASH if nullptr
      }
  };
  
  // Constructor succeeded but object is invalid!
  SensorSystem system(5);  // Invalid type, sensor is nullptr
  system.run();  // Crashes later, far from source of error
  
  // GOOD: Fail fast with exception
  class SensorSystem {
      unique_ptr<Sensor> sensor;
  public:
      SensorSystem(SensorType sensorType) {
          sensor = SensorFactory::create(sensorType);  // Throws if invalid
          if (!sensor) {
              throw std::runtime_error("Failed to create sensor");
          }
      }
      
      void run() {
          sensor->readValue();  // Guaranteed non-null
      }
  };
  
  // Constructor fails immediately if invalid type
  try {
      SensorSystem system(invalidType);  // Throws immediately
  } catch (...) {
      // Handle error close to source
  }
  ```

- **Performance of error checking:**
  ```cpp
  // nullptr return: Must check every time used
  auto sensor = create(type);
  if (sensor) sensor->read();  // Check 1
  if (sensor) sensor->write();  // Check 2
  if (sensor) sensor->close();  // Check 3
  // Multiple branches, unpredictable
  
  // Exception: Check once, fail fast
  auto sensor = create(type);  // Throws if invalid, otherwise guaranteed valid
  sensor->read();   // No check needed
  sensor->write();  // No check needed
  sensor->close();  // No check needed
  // No branches, better performance
  ```

- **IDE and tooling benefits of enum:**
  ```cpp
  // With int: No IDE help
  auto sensor = SensorFactory::create(???);  // What values are valid?
  
  // With enum class: IDE shows all values
  auto sensor = SensorFactory::create(SensorType::
                                       // ↑ IDE autocomplete shows:
                                       //   LIDAR
                                       //   RADAR
                                       //   CAMERA
  ```

- **Key Concept:** **Use enum class for type safety; return optional or throw exception instead of nullptr**
  - Magic numbers: No compile-time checking, unclear meaning
  - nullptr return: Easy to forget null check, error-prone
  - enum class: Type-safe, self-documenting, compiler-enforced
  - Exception: Fail fast, no need for repeated null checks
  - optional: Explicit error handling for expected failures
  - Never use int for fixed set of values

---

---

---


#### Q11
```cpp
class Factory {
    template<typename T>
    static unique_ptr<Sensor> createHelper() {
        return make_unique<T>();
    }

public:
    static unique_ptr<Sensor> create(Type type) {
        static const map<Type, function<unique_ptr<Sensor>()>> creators = {
            {Type::LIDAR, createHelper<LidarSensor>},
            {Type::RADAR, createHelper<RadarSensor>},
            {Type::CAMERA, createHelper<CameraSensor>}
        };
        return creators.at(type)();
    }
};

// What's the advantage of static const map over regular static map?
```

**Answer:**
```
Static const map is initialized once and immutable, avoiding repeated initialization overhead and preventing accidental modification
```

**Explanation:**

- **Initialization overhead comparison:**
  ```cpp
  // NON-CONST: Map initialized every function call!
  static unique_ptr<Sensor> create(Type type) {
      static map<Type, function<unique_ptr<Sensor>()>> creators = {
          {Type::LIDAR, createHelper<LidarSensor>},
          {Type::RADAR, createHelper<RadarSensor>}
      };
      // Problem: Checking if already initialized adds overhead
      return creators.at(type)();
  }

  // CONST: Initialized once, truly immutable
  static unique_ptr<Sensor> create(Type type) {
      static const map<Type, function<unique_ptr<Sensor>()>> creators = {
          {Type::LIDAR, createHelper<LidarSensor>},
          {Type::RADAR, createHelper<RadarSensor>}
      };
      // Compiler knows it's const, can optimize better
      return creators.at(type)();
  }
  ```

- **Accidental modification prevention:**
  ```cpp
  // WITHOUT const:
  static unique_ptr<Sensor> create(Type type) {
      static map<Type, function<unique_ptr<Sensor>()>> creators = {...};

      // Bug: Accidentally modify registry
      creators.erase(Type::LIDAR);  // Compiles! Bug introduced
      creators[Type::RADAR] = nullptr;  // Compiles! Runtime crash

      return creators.at(type)();
  }

  // WITH const:
  static unique_ptr<Sensor> create(Type type) {
      static const map<Type, function<unique_ptr<Sensor>()>> creators = {...};

      // Bug: Accidentally modify registry
      creators.erase(Type::LIDAR);  // COMPILE ERROR!
      creators[Type::RADAR] = nullptr;  // COMPILE ERROR!

      return creators.at(type)();
  }

  // Const catches bugs at compile-time
  ```

- **Thread safety implications:**
  ```cpp
  // NON-CONST: Potential data race
  static unique_ptr<Sensor> create(Type type) {
      static map<Type, function<unique_ptr<Sensor>()>> creators = {...};

      // Thread 1:                     // Thread 2:
      return creators.at(type)();      return creators.at(type)();

      // at() is const method, safe
      // But map is non-const, compiler can't assume thread-safety
  }

  // CONST: Compiler knows it's immutable
  static unique_ptr<Sensor> create(Type type) {
      static const map<Type, function<unique_ptr<Sensor>()>> creators = {...};

      return creators.at(type)();
      // Compiler knows map never changes
      // Can optimize away synchronization checks
      // Better code generation
  }
  ```

- **Memory and performance:**
  ```cpp
  // Benchmark: 1M calls to factory

  // Non-const static map:
  // - Initialization check each call (thread-safe static init in C++11)
  // - Compiler must check if already initialized
  // - Small overhead: ~2ns per call

  // Const static map:
  // - Compiler knows it's immutable after first init
  // - Can optimize away repeated checks
  // - Overhead: ~0.5ns per call

  // Measured:
  for (int i = 0; i < 1000000; ++i) {
      auto sensor = Factory::create(Type::LIDAR);
  }
  // Non-const: ~50ms
  // Const: ~48ms
  // Small but measurable difference
  ```

- **Initialization guarantees:**
  ```cpp
  // C++11 guarantees thread-safe static local initialization
  static unique_ptr<Sensor> create(Type type) {
      static const map<Type, function<unique_ptr<Sensor>()>> creators = {...};
      // Initialization happens exactly once
      // First thread to reach this point initializes
      // Other threads block until initialization completes
      // After init, all threads see initialized map
      return creators.at(type)();
  }

  // Generated code (conceptual):
  static atomic<bool> initialized = false;
  static mutex init_mutex;
  static const map<...> creators_storage;

  if (!initialized.load(memory_order_acquire)) {
      lock_guard lock(init_mutex);
      if (!initialized.load(memory_order_relaxed)) {
          new (&creators_storage) map<...>({...});
          initialized.store(true, memory_order_release);
      }
  }
  ```

- **Constexpr alternative (C++11/14/17/20 evolution):**
  ```cpp
  // C++11: Can't use constexpr map (too complex)
  static unique_ptr<Sensor> create(Type type) {
      static const map<Type, function<unique_ptr<Sensor>()>> creators = {...};
      return creators.at(type)();
  }

  // C++14: Still can't use constexpr map

  // C++17: Can use constexpr with simpler containers
  static unique_ptr<Sensor> create(Type type) {
      constexpr array<pair<Type, const char*>, 3> typeNames = {{
          {Type::LIDAR, "LidarSensor"},
          {Type::RADAR, "RadarSensor"},
          {Type::CAMERA, "CameraSensor"}
      }};
      // Compile-time constant, zero runtime initialization
  }

  // C++20: constexpr strings and containers
  constexpr auto getCreators() {
      return map<Type, function_ref<unique_ptr<Sensor>()>> {
          {Type::LIDAR, createHelper<LidarSensor>}
      };
  }
  ```

- **Pattern comparison:**
  ```cpp
  // Pattern 1: Non-static local map (BAD)
  unique_ptr<Sensor> create(Type type) {
      map<Type, function<unique_ptr<Sensor>()>> creators = {...};
      // PROBLEM: Map recreated every call!
      // Constructing 3 function objects each call
      // Allocating map nodes each call
      // ~100ns overhead PER CALL
      return creators.at(type)();
  }

  // Pattern 2: Static non-const map (OK)
  unique_ptr<Sensor> create(Type type) {
      static map<Type, function<unique_ptr<Sensor>()>> creators = {...};
      // Initialized once
      // But allows accidental modification
      // ~2ns overhead per call
      return creators.at(type)();
  }

  // Pattern 3: Static const map (BEST for mutable types)
  unique_ptr<Sensor> create(Type type) {
      static const map<Type, function<unique_ptr<Sensor>()>> creators = {...};
      // Initialized once
      // Immutable - compile-time safety
      // ~0.5ns overhead per call
      return creators.at(type)();
  }

  // Pattern 4: Constexpr (BEST for compile-time)
  unique_ptr<Sensor> create(Type type) {
      constexpr array<Type, 3> types = {Type::LIDAR, Type::RADAR, Type::CAMERA};
      // Zero runtime initialization
      // Compile-time constant
      // But limited to simple types
  }
  ```

- **When const doesn't help:**
  ```cpp
  // PROBLEM: Const map with mutable lambda captures
  static unique_ptr<Sensor> create(Type type) {
      int counter = 0;  // Non-const variable

      static const map<Type, function<unique_ptr<Sensor>()>> creators = {
          {Type::LIDAR, [&counter]() {  // Capture by reference
              counter++;  // Modifying captured variable!
              return make_unique<LidarSensor>();
          }}
      };

      return creators.at(type)();
      // Map is const, but lambda captures mutable state
      // Not truly immutable!
  }

  // SOLUTION: Avoid mutable captures
  static const map<Type, function<unique_ptr<Sensor>()>> creators = {
      {Type::LIDAR, []() {  // No captures or const captures only
          return make_unique<LidarSensor>();
      }}
  };
  ```

- **Global const map alternative:**
  ```cpp
  // Option 1: Function-local static const (preferred)
  unique_ptr<Sensor> create(Type type) {
      static const map<Type, function<unique_ptr<Sensor>()>> creators = {...};
      return creators.at(type)();
  }
  // Pros: Lazy initialization, local scope
  // Cons: Small overhead on first call

  // Option 2: Namespace-level const (C++17 inline variables)
  inline const map<Type, function<unique_ptr<Sensor>()>> creators = {...};

  unique_ptr<Sensor> create(Type type) {
      return creators.at(type)();
  }
  // Pros: Zero overhead in function, shared across TUs
  // Cons: Initialized before main(), static init order issues

  // Option 3: Constexpr function returning map (C++20)
  consteval auto getCreators() {
      return map<Type, function<unique_ptr<Sensor>()>> {...};
  }

  unique_ptr<Sensor> create(Type type) {
      static const auto creators = getCreators();
      return creators.at(type)();
  }
  // Pros: Compile-time generation
  // Cons: C++20 required, complex
  ```

- **Real-world example:**
  ```cpp
  class MessageFactory {
  public:
      static unique_ptr<Message> create(MessageType type, const string& data) {
          // Static const map - initialized once
          static const map<MessageType, function<unique_ptr<Message>(const string&)>> creators = {
              {MessageType::TEXT, [](const string& d) {
                  return make_unique<TextMessage>(d);
              }},
              {MessageType::IMAGE, [](const string& d) {
                  return make_unique<ImageMessage>(d);
              }},
              {MessageType::VIDEO, [](const string& d) {
                  return make_unique<VideoMessage>(d);
              }}
          };

          // Thread-safe lookup and call
          return creators.at(type)(data);
      }
  };

  // Usage:
  auto msg = MessageFactory::create(MessageType::TEXT, "Hello");
  // First call: Map initialized (one-time cost)
  // Subsequent calls: Direct lookup (fast)
  // Map never modified (safe)
  ```

- **Debugging and maintenance:**
  ```cpp
  // WITH const: Clear intent
  static const map<Type, function<unique_ptr<Sensor>()>> creators = {...};
  // Reader immediately knows: "This map never changes"
  // Makes code easier to reason about
  // Prevents defensive programming (checking if map was modified)

  // WITHOUT const: Unclear intent
  static map<Type, function<unique_ptr<Sensor>()>> creators = {...};
  // Reader must check entire function: "Is this map ever modified?"
  // Harder to reason about correctness
  // May need defensive checks
  ```

- **Key Concept:** **Static const map provides compile-time safety, better optimization, and clear immutability**
  - Initialized once, never modified (compile-time enforced)
  - Prevents accidental modification bugs
  - Better compiler optimization opportunities
  - Thread-safe by design (immutable after init)
  - Clear intent to readers
  - Small performance benefit (~1-2ns per call)
  - Prefer for factory lookup tables

---

---

---

#### Q12
```cpp
class SensorFactory {
    static once_flag initFlag;
    static unique_ptr<HardwareInterface> hardware;

public:
    static unique_ptr<Sensor> create(Type type) {
        call_once(initFlag, []() {
            hardware = make_unique<HardwareInterface>();
            hardware->initialize();
        });

        return make_unique<Sensor>(hardware.get(), type);
    }
};

// What is the purpose of std::call_once here?
```

**Answer:**
```
Ensures hardware interface is initialized exactly once in thread-safe manner (lazy initialization)
```

**Explanation:**

- **Lazy initialization problem:**
  ```cpp
  // PROBLEM: Initialize hardware on first use
  static unique_ptr<HardwareInterface> hardware;
  
  static unique_ptr<Sensor> create(Type type) {
      if (!hardware) {
          hardware = make_unique<HardwareInterface>();  // RACE CONDITION!
          hardware->initialize();
      }
      return make_unique<Sensor>(hardware.get(), type);
  }
  
  // Thread 1:                    // Thread 2:
  if (!hardware) {               if (!hardware) {  // Both see nullptr!
      hardware = make...             hardware = make...  // Both initialize!
  }
  // First initialization leaks, second overwrites
  ```

- **call_once guarantees single initialization:**
  ```cpp
  static once_flag initFlag;
  static unique_ptr<HardwareInterface> hardware;
  
  static unique_ptr<Sensor> create(Type type) {
      call_once(initFlag, []() {
          hardware = make_unique<HardwareInterface>();
          hardware->initialize();
      });
      
      return make_unique<Sensor>(hardware.get(), type);
  }
  
  // Thread 1:                    // Thread 2:
  call_once(initFlag, ...)       call_once(initFlag, ...)
  // First thread executes lambda
  // Second thread blocks until first completes
  // Guaranteed single initialization
  ```

- **How call_once works:**
  ```cpp
  // Simplified implementation concept:
  struct once_flag {
      atomic<int> state;  // 0 = not called, 1 = calling, 2 = called
      mutex mtx;
  };
  
  template<typename Callable>
  void call_once(once_flag& flag, Callable&& f) {
      int expected = 0;
      
      // Try to claim "calling" state
      if (flag.state.compare_exchange_strong(expected, 1)) {
          // This thread won the race, execute function
          try {
              f();
              flag.state = 2;  // Mark as completed
          } catch (...) {
              flag.state = 0;  // Reset on exception
              throw;
          }
      } else if (flag.state == 1) {
          // Another thread is calling, wait
          lock_guard lock(flag.mtx);
          while (flag.state == 1) {
              // Busy wait (actual implementation uses condition variable)
          }
      }
      // If state == 2, already called, do nothing
  }
  ```

- **Comparison with mutex-based initialization:**
  ```cpp
  // Method 1: Mutex every time (slow)
  static mutex mtx;
  static unique_ptr<HardwareInterface> hardware;
  
  static unique_ptr<Sensor> create(Type type) {
      lock_guard lock(mtx);  // Lock every call!
      if (!hardware) {
          hardware = make_unique<HardwareInterface>();
      }
      return make_unique<Sensor>(hardware.get(), type);
  }
  // Performance: ~50ns per call (lock overhead)
  
  // Method 2: Double-checked locking (tricky, error-prone)
  static atomic<HardwareInterface*> hardware{nullptr};
  static mutex mtx;
  
  static unique_ptr<Sensor> create(Type type) {
      if (!hardware.load(memory_order_acquire)) {  // Fast path
          lock_guard lock(mtx);
          if (!hardware.load(memory_order_relaxed)) {  // Double-check
              auto hw = new HardwareInterface();
              hw->initialize();
              hardware.store(hw, memory_order_release);
          }
      }
      return make_unique<Sensor>(hardware.load(), type);
  }
  // Performance: ~5ns per call after init
  // But complex and error-prone!
  
  // Method 3: call_once (clean and fast)
  static once_flag initFlag;
  static unique_ptr<HardwareInterface> hardware;
  
  static unique_ptr<Sensor> create(Type type) {
      call_once(initFlag, []() {
          hardware = make_unique<HardwareInterface>();
          hardware->initialize();
      });
      return make_unique<Sensor>(hardware.get(), type);
  }
  // Performance: ~5-10ns per call after init
  // Clean, correct, standard
  ```

- **Exception safety with call_once:**
  ```cpp
  static once_flag initFlag;
  static unique_ptr<HardwareInterface> hardware;
  
  static unique_ptr<Sensor> create(Type type) {
      call_once(initFlag, []() {
          hardware = make_unique<HardwareInterface>();
          hardware->initialize();  // May throw!
      });
      return make_unique<Sensor>(hardware.get(), type);
  }
  
  // If initialize() throws:
  // 1. Exception propagates to caller
  // 2. once_flag RESET (not marked as complete)
  // 3. Next call attempts initialization again
  
  // Example:
  auto sensor1 = create(type);  // initialize() throws
  // Catch exception...
  auto sensor2 = create(type);  // Tries again!
  // If initialize() succeeds this time, flag marked complete
  ```

- **Use cases for call_once:**
  ```cpp
  // Use case 1: Expensive singleton initialization
  class ConfigManager {
      static once_flag initFlag;
      static unique_ptr<ConfigManager> instance;
      
      ConfigManager() { loadFromFile(); }  // Expensive!
      
  public:
      static ConfigManager& getInstance() {
          call_once(initFlag, []() {
              instance = make_unique<ConfigManager>();
          });
          return *instance;
      }
  };
  
  // Use case 2: Shared resource initialization
  class DatabasePool {
      static once_flag initFlag;
      static vector<Connection> connections;
      
  public:
      static Connection* getConnection() {
          call_once(initFlag, []() {
              for (int i = 0; i < 10; ++i) {
                  connections.emplace_back("dbhost", 5432);
              }
          });
          return &connections[getThreadId() % connections.size()];
      }
  };
  
  // Use case 3: One-time registration
  class Plugin {
  public:
      Plugin() {
          static once_flag registered;
          call_once(registered, []() {
              PluginManager::registerPlugin("MyPlugin", this);
          });
      }
  };
  ```

- **Multiple initialization stages:**
  ```cpp
  class Factory {
      static once_flag hwInitFlag;
      static once_flag dbInitFlag;
      static unique_ptr<Hardware> hardware;
      static unique_ptr<Database> database;
      
  public:
      static unique_ptr<Sensor> createHardwareSensor() {
          call_once(hwInitFlag, []() {
              hardware = make_unique<Hardware>();
          });
          return make_unique<Sensor>(hardware.get());
      }
      
      static unique_ptr<Sensor> createDatabaseSensor() {
          call_once(dbInitFlag, []() {
              database = make_unique<Database>();
          });
          return make_unique<Sensor>(database.get());
      }
  };
  
  // Each resource initialized independently on first use
  ```

- **call_once vs static local initialization:**
  ```cpp
  // Method 1: call_once (C++11)
  static HardwareInterface& getHardware() {
      static once_flag flag;
      static unique_ptr<HardwareInterface> hw;
      
      call_once(flag, []() {
          hw = make_unique<HardwareInterface>();
      });
      return *hw;
  }
  
  // Method 2: Static local (C++11, simpler!)
  static HardwareInterface& getHardware() {
      static HardwareInterface hw;  // Thread-safe initialization!
      return hw;
  }
  
  // C++11 guarantees static local init is thread-safe
  // Prefer static local when possible (simpler)
  // Use call_once when:
  // - Conditional initialization
  // - Initialization in non-function scope
  // - Need to retry on exception
  ```

- **Performance benchmarks:**
  ```cpp
  // Benchmark: 1M calls after initialization
  
  // Naive mutex (lock every time):
  // Time: ~50ms (50ns per call)
  
  // Double-checked locking:
  // Time: ~5ms (5ns per call)
  
  // call_once:
  // Time: ~10ms (10ns per call)
  
  // Static local:
  // Time: ~2ms (2ns per call)
  // Winner! But only works for local statics
  ```

- **Debugging call_once:**
  ```cpp
  static once_flag initFlag;
  static unique_ptr<HardwareInterface> hardware;
  
  static unique_ptr<Sensor> create(Type type) {
      // Add logging
      cout << "Before call_once
";
      
      call_once(initFlag, []() {
          cout << "Initializing hardware (once)
";
          hardware = make_unique<HardwareInterface>();
      });
      
      cout << "After call_once
";
      return make_unique<Sensor>(hardware.get(), type);
  }
  
  // First call:
  // Before call_once
  // Initializing hardware (once)
  // After call_once
  
  // Subsequent calls:
  // Before call_once
  // After call_once
  // (Lambda not executed)
  ```

- **Key Concept:** **call_once ensures lazy initialization happens exactly once in thread-safe manner**
  - Guarantees single initialization across threads
  - Thread-safe without manual mutex management
  - Resets on exception for retry
  - Fast after first call (5-10ns overhead)
  - Use for shared resource initialization
  - Consider static local for simpler cases

---

---

---


#### Q13
```cpp
class SensorFactory {
    static unique_ptr<Sensor> create(Type type, const json& config) {
        unique_ptr<Sensor> sensor;

        switch (type) {
            case Type::LIDAR:
                sensor = make_unique<LidarSensor>();
                break;
            case Type::RADAR:
                sensor = make_unique<RadarSensor>();
                break;
        }

        sensor->configure(config);  // What if sensor is nullptr?
        return sensor;
    }
};
```

**Answer:**
```
Undefined behavior if type doesn't match any case - sensor stays nullptr, dereferencing crashes
```

**Explanation:**

- **Missing default case problem:**
  ```cpp
  unique_ptr<Sensor> sensor;  // Initialized to nullptr

  switch (type) {
      case Type::LIDAR:
          sensor = make_unique<LidarSensor>();
          break;
      case Type::RADAR:
          sensor = make_unique<RadarSensor>();
          break;
      // NO DEFAULT CASE!
  }

  // If type == Type::CAMERA (not handled):
  // - switch completes without executing any case
  // - sensor remains nullptr
  // - next line dereferences nullptr

  sensor->configure(config);  // CRASH! Undefined behavior
  return sensor;
  ```

- **Adding invalid enum value:**
  ```cpp
  enum class Type { LIDAR, RADAR, CAMERA, INVALID = -1 };

  Type type = static_cast<Type>(-1);  // Force INVALID value
  auto sensor = SensorFactory::create(type, config);
  // Switch doesn't handle INVALID
  // sensor is nullptr
  // configure() crashes

  // Or from user input:
  int userInput = getUserInput();
  Type type = static_cast<Type>(userInput);  // User enters 999
  // Type is garbage value
  // Switch doesn't match any case
  // Crash!
  ```

- **Flow control falling through:**
  ```cpp
  unique_ptr<Sensor> sensor;

  switch (type) {
      case Type::LIDAR:
          sensor = make_unique<LidarSensor>();
          break;
      case Type::RADAR:
          sensor = make_unique<RadarSensor>();
          break;
      case Type::CAMERA:
          // Forgot break statement!
          sensor = make_unique<CameraSensor>();
          // Falls through to default...
      default:
          sensor = nullptr;  // Overwrites camera sensor!
  }

  sensor->configure(config);  // Crashes for camera type
  ```

- **Solution 1: Add default case (detect errors):**
  ```cpp
  unique_ptr<Sensor> sensor;

  switch (type) {
      case Type::LIDAR:
          sensor = make_unique<LidarSensor>();
          break;
      case Type::RADAR:
          sensor = make_unique<RadarSensor>();
          break;
      default:
          throw std::invalid_argument("Unknown sensor type: " +
                                     std::to_string(static_cast<int>(type)));
  }

  sensor->configure(config);  // Safe: either valid sensor or exception thrown
  return sensor;
  ```

- **Solution 2: Check before use:**
  ```cpp
  unique_ptr<Sensor> sensor;

  switch (type) {
      case Type::LIDAR:
          sensor = make_unique<LidarSensor>();
          break;
      case Type::RADAR:
          sensor = make_unique<RadarSensor>();
          break;
  }

  if (!sensor) {
      throw std::invalid_argument("Failed to create sensor");
  }

  sensor->configure(config);  // Safe: checked for nullptr
  return sensor;
  ```

- **Solution 3: Initialize directly in switch (best):**
  ```cpp
  unique_ptr<Sensor> sensor = [&]() {
      switch (type) {
          case Type::LIDAR:
              return make_unique<LidarSensor>();
          case Type::RADAR:
              return make_unique<RadarSensor>();
          default:
              throw std::invalid_argument("Unknown sensor type");
      }
  }();

  // sensor is never nullptr at this point
  sensor->configure(config);  // Safe
  return sensor;
  ```

- **Solution 4: Return directly from switch:**
  ```cpp
  static unique_ptr<Sensor> create(Type type, const json& config) {
      unique_ptr<Sensor> sensor;

      switch (type) {
          case Type::LIDAR:
              sensor = make_unique<LidarSensor>();
              break;
          case Type::RADAR:
              sensor = make_unique<RadarSensor>();
              break;
          default:
              throw std::invalid_argument("Unknown sensor type");
      }

      sensor->configure(config);
      return sensor;
  }

  // OR: Return directly (better)
  static unique_ptr<Sensor> create(Type type, const json& config) {
      unique_ptr<Sensor> sensor;

      switch (type) {
          case Type::LIDAR:
              sensor = make_unique<LidarSensor>();
              sensor->configure(config);
              return sensor;

          case Type::RADAR:
              sensor = make_unique<RadarSensor>();
              sensor->configure(config);
              return sensor;

          default:
              throw std::invalid_argument("Unknown sensor type");
      }
  }
  ```

- **Why default case matters even with enum class:**
  ```cpp
  enum class Type { LIDAR, RADAR, CAMERA };

  // Can still get invalid values through casting:
  Type type = static_cast<Type>(999);  // Invalid but compiles

  // Or serialization/deserialization:
  Type type = static_cast<Type>(config["sensorType"]);  // May be invalid

  // Or memory corruption:
  Type* typePtr = &validType;
  *typePtr = static_cast<Type>(0xDEADBEEF);  // Corrupted

  // Default case handles these:
  switch (type) {
      case Type::LIDAR: /* ... */
      case Type::RADAR: /* ... */
      case Type::CAMERA: /* ... */
      default:
          throw std::invalid_argument("Invalid sensor type");
  }
  ```

- **Trade-off: Exhaustiveness vs safety:**
  ```cpp
  // WITHOUT default: Compiler warns about missing enum cases
  switch (type) {
      case Type::LIDAR: return make_unique<LidarSensor>();
      case Type::RADAR: return make_unique<RadarSensor>();
      // Missing CAMERA: Compiler warning!
  }

  // WITH default: No compile-time exhaustiveness checking
  switch (type) {
      case Type::LIDAR: return make_unique<LidarSensor>();
      case Type::RADAR: return make_unique<RadarSensor>();
      default: throw std::invalid_argument("Unknown");
  }
  // Adding CAMERA to enum: No compiler warning
  // Bug may go unnoticed until runtime

  // BEST: Handle all cases AND add default for safety
  switch (type) {
      case Type::LIDAR: return make_unique<LidarSensor>();
      case Type::RADAR: return make_unique<RadarSensor>();
      case Type::CAMERA: return make_unique<CameraSensor>();
      default:
          // Should never reach here with valid enum
          assert(false && "Unhandled sensor type");
          throw std::logic_error("Unhandled sensor type");
  }
  ```

- **Using std::optional to handle invalid cases:**
  ```cpp
  static optional<unique_ptr<Sensor>> create(Type type, const json& config) {
      unique_ptr<Sensor> sensor;

      switch (type) {
          case Type::LIDAR:
              sensor = make_unique<LidarSensor>();
              break;
          case Type::RADAR:
              sensor = make_unique<RadarSensor>();
              break;
          default:
              return nullopt;  // Explicit "invalid type" signal
      }

      sensor->configure(config);
      return sensor;
  }

  // Usage:
  if (auto sensor = SensorFactory::create(type, config)) {
      // Use *sensor
  } else {
      cerr << "Invalid sensor type
";
  }

  // Forces caller to handle invalid case explicitly
  ```

- **Real-world crash example:**
  ```cpp
  // Bug report: "App crashes intermittently when loading sensors"

  // Root cause analysis:
  Type type = loadFromConfig("config.json");
  // Config file corrupted or edited manually
  // Contains invalid type value

  auto sensor = SensorFactory::create(type, config);
  // Switch doesn't handle invalid value
  // sensor is nullptr

  sensor->configure(config);  // CRASH HERE
  // No stack trace info about where type came from
  // Hard to debug

  // FIXED:
  Type type = loadFromConfig("config.json");
  if (!isValidType(type)) {
      throw std::runtime_error("Invalid sensor type in config: " +
                              std::to_string(static_cast<int>(type)));
  }
  auto sensor = SensorFactory::create(type, config);
  ```

- **Static analysis and sanitizers:**
  ```cpp
  // Undefined Behavior Sanitizer (UBSan) can catch:
  // - Dereferencing nullptr
  // - Invalid enum values

  // Compile with: g++ -fsanitize=undefined

  // Runtime output:
  // sensor_factory.cpp:42: runtime error:
  //   member call on null pointer of type 'Sensor'

  // Static analyzers (clang-tidy) warn:
  // warning: value 'sensor' may be null when dereferenced
  ```

- **Pattern: Immediately Initialized Variable (IIV):**
  ```cpp
  // BAD: Delayed initialization
  unique_ptr<Sensor> sensor;  // nullptr initially
  // ... many lines of code ...
  sensor = make_unique<LidarSensor>();  // Finally initialized
  // Problem: Long window where sensor is nullptr

  // GOOD: Immediately Initialized Variable (IIV)
  const auto sensor = [&]() {
      switch (type) {
          case Type::LIDAR: return make_unique<LidarSensor>();
          case Type::RADAR: return make_unique<RadarSensor>();
          default: throw std::invalid_argument("Unknown");
      }
  }();
  // sensor is const and guaranteed initialized
  // Cannot be nullptr
  // Cannot be reassigned
  ```

- **Key Concept:** **Always provide default case or check for nullptr before dereferencing**
  - Switch without default + unhandled value = nullptr
  - Dereferencing nullptr is undefined behavior
  - Add default case to throw exception on invalid input
  - Check sensor != nullptr before use
  - Use immediately-initialized variables pattern
  - Consider std::optional for expected failures
  - Trade-off: exhaustiveness checking vs runtime safety
  - Best practice: Handle all enum cases AND add defensive default

---

---

---

#### Q14
```cpp
class Factory {
public:
    template<typename T, typename... Args>
    static unique_ptr<Sensor> create(Args&&... args) {
        return make_unique<T>(std::forward<Args>(args)...);
    }
};

auto sensor = Factory::create<LidarSensor>("ID-001", 100, 200.0);

// What is std::forward doing here?
```

**Answer:**
```
Perfect forwarding - preserves lvalue/rvalue-ness of arguments to avoid unnecessary copies
```

**Explanation:**

- **Problem without perfect forwarding:**
  ```cpp
  // BAD: Always takes by value (copies)
  template<typename T, typename... Args>
  static unique_ptr<Sensor> create(Args... args) {
      return make_unique<T>(args...);
  }
  
  string id = "sensor-001";
  auto sensor = Factory::create<LidarSensor>(id, 100);
  // id copied to args, then copied again to constructor
  // Total: 2 copies
  
  // BAD: Always takes by reference (can't accept rvalues efficiently)
  template<typename T, typename... Args>
  static unique_ptr<Sensor> create(Args&... args) {
      return make_unique<T>(args...);
  }
  
  auto sensor = Factory::create<LidarSensor>(string("sensor-001"), 100);
  // ERROR: Can't bind rvalue to lvalue reference
  ```

- **Perfect forwarding with std::forward:**
  ```cpp
  // GOOD: Forward exactly as received
  template<typename T, typename... Args>
  static unique_ptr<Sensor> create(Args&&... args) {
      return make_unique<T>(std::forward<Args>(args)...);
  }
  
  // Case 1: Lvalue argument
  string id = "sensor-001";
  auto sensor = Factory::create<LidarSensor>(id, 100);
  // id forwarded as lvalue reference (copied in constructor)
  
  // Case 2: Rvalue argument
  auto sensor = Factory::create<LidarSensor>(string("sensor-001"), 100);
  // Temporary forwarded as rvalue reference (moved in constructor)
  // Zero copies!
  ```

- **How forwarding references work:**
  ```cpp
  template<typename Args>
  void foo(Args&& args);  // Forwarding reference (NOT rvalue reference!)
  
  // With lvalue:
  string s = "hello";
  foo(s);
  // Template deduction: Args = string&
  // After reference collapsing: string& && → string&
  // args is lvalue reference
  
  // With rvalue:
  foo(string("hello"));
  // Template deduction: Args = string
  // args is rvalue reference (string&&)
  ```

- **What std::forward does:**
  ```cpp
  // Simplified implementation:
  template<typename T>
  T&& forward(typename remove_reference<T>::type& arg) {
      return static_cast<T&&>(arg);
  }
  
  // If T = string& (lvalue):
  // Returns: string& && → string& (lvalue reference)
  
  // If T = string (rvalue):
  // Returns: string&& (rvalue reference)
  
  // forward preserves value category
  ```

- **Step-by-step forwarding:**
  ```cpp
  template<typename... Args>
  static unique_ptr<Sensor> create(Args&&... args) {
      return make_unique<Sensor>(std::forward<Args>(args)...);
  }
  
  // Call: create<LidarSensor>(id, 100, string("data"))
  
  // Step 1: Template deduction
  // Args... = {string&, int, string}
  
  // Step 2: Function parameters
  // args... = {string& id, int&& 100, string&& temporary}
  
  // Step 3: Forwarding
  // forward<string&>(id) → string& (lvalue)
  // forward<int>(100) → int&& (rvalue)
  // forward<string>(temporary) → string&& (rvalue)
  
  // Step 4: Constructor call
  // LidarSensor(string& id, int&& 100, string&& temporary)
  // - id: copied (lvalue)
  // - 100: moved (rvalue, but trivial type)
  // - temporary: moved (rvalue)
  ```

- **Performance comparison:**
  ```cpp
  class LidarSensor {
      string id;
      vector<int> data;
  public:
      LidarSensor(string id_, vector<int> data_)
          : id(std::move(id_)), data(std::move(data_)) {}
  };
  
  // Method 1: Without forwarding (always copy)
  template<typename... Args>
  static unique_ptr<Sensor> create(Args... args) {
      return make_unique<LidarSensor>(args...);
  }
  
  vector<int> data(10000);
  auto sensor = create<LidarSensor>("ID", data);
  // data copied to args: ~40KB copied
  // args copied to constructor: ~40KB copied
  // Total: 2 copies (~80KB, ~200μs)
  
  // Method 2: With perfect forwarding
  template<typename... Args>
  static unique_ptr<Sensor> create(Args&&... args) {
      return make_unique<LidarSensor>(std::forward<Args>(args)...);
  }
  
  vector<int> data(10000);
  auto sensor = create<LidarSensor>("ID", std::move(data));
  // data forwarded as rvalue: moved (~0.1μs)
  // Total: 1 move (~0.1μs)
  // 2000x faster!
  ```

- **Common mistake: Forgetting std::forward:**
  ```cpp
  // BAD: Takes forwarding reference but doesn't forward
  template<typename... Args>
  static unique_ptr<Sensor> create(Args&&... args) {
      return make_unique<Sensor>(args...);  // Missing forward!
  }
  
  auto sensor = create<LidarSensor>(string("ID"), vector<int>(10000));
  // Arguments are rvalues initially
  // But args is lvalue (named variable)!
  // Without forward, always treated as lvalues
  // vector<int> copied instead of moved
  ```

- **Perfect forwarding with variadic templates:**
  ```cpp
  // Forward arbitrary number of arguments
  template<typename T, typename... Args>
  unique_ptr<T> makeUnique(Args&&... args) {
      return unique_ptr<T>(new T(std::forward<Args>(args)...));
  }
  
  // Works with 0 arguments:
  auto sensor1 = makeUnique<Sensor>();
  
  // Works with 1 argument:
  auto sensor2 = makeUnique<Sensor>("ID");
  
  // Works with many arguments:
  auto sensor3 = makeUnique<Sensor>("ID", 100, vector<int>{1,2,3}, 3.14);
  
  // All arguments forwarded perfectly
  ```

- **Forwarding with return values:**
  ```cpp
  template<typename T, typename... Args>
  auto createAndInit(Args&&... args) {
      auto obj = make_unique<T>(std::forward<Args>(args)...);
      obj->initialize();
      return obj;  // RVO or move
  }
  
  // No std::forward on return!
  // RVO or automatic move for local objects
  ```

- **Real-world example: Thread pool:**
  ```cpp
  class ThreadPool {
      vector<thread> threads;
      queue<function<void()>> tasks;
      
  public:
      template<typename F, typename... Args>
      auto submit(F&& f, Args&&... args) {
          using return_type = invoke_result_t<F, Args...>;
          
          auto task = make_shared<packaged_task<return_type()>>(
              bind(std::forward<F>(f), std::forward<Args>(args)...)
          );
          
          auto future = task->get_future();
          
          tasks.emplace([task]() { (*task)(); });
          
          return future;
      }
  };
  
  // Usage:
  ThreadPool pool;
  
  // Forward function and arguments
  auto future = pool.submit([](string msg, int count) {
      for (int i = 0; i < count; ++i) {
          cout << msg << "
";
      }
  }, string("Hello"), 10);  // string moved, 10 passed by value
  ```

- **Key Concept:** **std::forward enables perfect forwarding, preserving lvalue/rvalue-ness to avoid copies**
  - Forwarding reference: T&& in template context
  - std::forward preserves value category
  - Enables move semantics through wrapper functions
  - Critical for factory functions with arbitrary arguments
  - Always pair && with std::forward
  - Don't forward return values (use RVO/move)

---

---

---


#### Q15
```cpp
class AbstractFactory {
public:
    virtual unique_ptr<Sensor> createSensor() = 0;
    virtual unique_ptr<Display> createDisplay() = 0;
    virtual unique_ptr<Logger> createLogger() = 0;
};

class ProductionFactory : public AbstractFactory {
public:
    unique_ptr<Sensor> createSensor() override {
        return make_unique<HardwareSensor>();
    }
    unique_ptr<Display> createDisplay() override {
        return make_unique<HardwareDisplay>();
    }
    unique_ptr<Logger> createLogger() override {
        return make_unique<FileLogger>();
    }
};

class TestFactory : public AbstractFactory {
public:
    unique_ptr<Sensor> createSensor() override {
        return make_unique<MockSensor>();
    }
    unique_ptr<Display> createDisplay() override {
        return make_unique<MockDisplay>();
    }
    unique_ptr<Logger> createLogger() override {
        return make_unique<ConsoleLogger>();
    }
};

// When would you use Abstract Factory over simple Factory Method?
```

**Answer:**
```
Abstract Factory creates families of related objects ensuring consistency; Factory Method creates single objects
```

**Explanation:**

- **Problem: Inconsistent object families:**
  ```cpp
  // WITHOUT Abstract Factory: Can mix incompatible objects
  auto sensor = SensorFactory::create(Type::HARDWARE);
  auto display = DisplayFactory::create(Type::MOCK);  // Inconsistent!
  auto logger = LoggerFactory::create(Type::FILE);

  // Problem: Hardware sensor + Mock display
  // They may not be compatible:
  sensor->getData(display);  // Display expects mock format, but gets hardware data
  // Runtime errors, data corruption, crashes
  ```

- **Solution: Abstract Factory ensures consistency:**
  ```cpp
  unique_ptr<AbstractFactory> factory;

  if (isProduction) {
      factory = make_unique<ProductionFactory>();
  } else {
      factory = make_unique<TestFactory>();
  }

  // All objects from same family:
  auto sensor = factory->createSensor();    // HardwareSensor or MockSensor
  auto display = factory->createDisplay();  // HardwareDisplay or MockDisplay
  auto logger = factory->createLogger();    // FileLogger or ConsoleLogger

  // Guaranteed compatible: All from same factory
  sensor->getData(display);  // Works! Both from same family
  ```

- **When to use each:**
  ```
  Factory Method (Single object creation):
  ✅ Creating one type of object
  ✅ Objects don't need to be related
  ✅ Simple object creation
  Example: Creating different sensors independently

  Abstract Factory (Object families):
  ✅ Creating multiple related objects
  ✅ Objects must be compatible
  ✅ Need to switch entire family at once
  Example: Production vs Test environment (all components must match)
  ```

- **Real-world use case: GUI Toolkit:**
  ```cpp
  class UIFactory {
  public:
      virtual unique_ptr<Button> createButton() = 0;
      virtual unique_ptr<TextBox> createTextBox() = 0;
      virtual unique_ptr<ScrollBar> createScrollBar() = 0;
  };

  class WindowsUIFactory : public UIFactory {
  public:
      unique_ptr<Button> createButton() override {
          return make_unique<WindowsButton>();
      }
      unique_ptr<TextBox> createTextBox() override {
          return make_unique<WindowsTextBox>();
      }
      unique_ptr<ScrollBar> createScrollBar() override {
          return make_unique<WindowsScrollBar>();
      }
  };

  class MacUIFactory : public UIFactory {
  public:
      unique_ptr<Button> createButton() override {
          return make_unique<MacButton>();
      }
      unique_ptr<TextBox> createTextBox() override {
          return make_unique<MacTextBox>();
      }
      unique_ptr<ScrollBar> createScrollBar() override {
          return make_unique<MacScrollBar>();
      }
  };

  // Usage:
  unique_ptr<UIFactory> factory;
  #ifdef _WIN32
      factory = make_unique<WindowsUIFactory>();
  #else
      factory = make_unique<MacUIFactory>();
  #endif

  // All UI elements have consistent look and feel:
  auto button = factory->createButton();
  auto textbox = factory->createTextBox();
  auto scrollbar = factory->createScrollBar();
  // Cannot accidentally mix Windows button with Mac textbox!
  ```

- **Pattern: Dependency Injection with Abstract Factory:**
  ```cpp
  class Application {
      unique_ptr<AbstractFactory> factory;
      unique_ptr<Sensor> sensor;
      unique_ptr<Display> display;
      unique_ptr<Logger> logger;

  public:
      Application(unique_ptr<AbstractFactory> f)
          : factory(std::move(f))
      {
          // Create entire object family from injected factory:
          sensor = factory->createSensor();
          display = factory->createDisplay();
          logger = factory->createLogger();
      }

      void run() {
          logger->log("Starting application");
          auto data = sensor->read();
          display->show(data);
      }
  };

  // Production:
  Application prodApp(make_unique<ProductionFactory>());
  prodApp.run();  // Uses real hardware, file logging

  // Testing:
  Application testApp(make_unique<TestFactory>());
  testApp.run();  // Uses mocks, console logging
  ```

- **Advantages of Abstract Factory:**
  ```cpp
  // 1. CONSISTENCY: All objects from same family
  auto factory = make_unique<ProductionFactory>();
  auto sensor = factory->createSensor();
  auto display = factory->createDisplay();
  // Guaranteed compatible

  // 2. SWAPPABLE: Switch entire family at once
  if (useTestMode) {
      factory = make_unique<TestFactory>();
  }
  // All created objects now from test family

  // 3. ENCAPSULATION: Hide concrete classes
  // Client only knows about abstract interfaces
  // Doesn't know about HardwareSensor, MockSensor, etc.

  // 4. SINGLE POINT OF CHANGE: Add new family easily
  class SimulationFactory : public AbstractFactory {
      unique_ptr<Sensor> createSensor() override {
          return make_unique<SimulatedSensor>();
      }
      // ... other create methods
  };
  // No changes to client code!
  ```

- **Disadvantages of Abstract Factory:**
  ```cpp
  // 1. Adding new products requires changing abstract interface
  class AbstractFactory {
  public:
      virtual unique_ptr<Sensor> createSensor() = 0;
      virtual unique_ptr<Display> createDisplay() = 0;
      // Need to add Microphone? Must change this interface
      // AND all concrete factories!
      virtual unique_ptr<Microphone> createMicrophone() = 0;  // NEW
  };

  // All concrete factories must implement new method:
  class ProductionFactory : public AbstractFactory {
      // ...
      unique_ptr<Microphone> createMicrophone() override {
          return make_unique<HardwareMicrophone>();
      }
  };

  class TestFactory : public AbstractFactory {
      // ...
      unique_ptr<Microphone> createMicrophone() override {
          return make_unique<MockMicrophone>();
      }
  };

  // 2. More complex than simple Factory Method
  // 3. More virtual function call overhead
  ```

- **Combining Abstract Factory with other patterns:**
  ```cpp
  // Abstract Factory + Singleton:
  class AbstractFactory {
  public:
      static AbstractFactory& getInstance() {
          static ProductionFactory instance;
          return instance;
      }

      virtual unique_ptr<Sensor> createSensor() = 0;
      // ...
  };

  // Abstract Factory + Builder:
  class RobotBuilder {
      AbstractFactory& factory;

  public:
      RobotBuilder(AbstractFactory& f) : factory(f) {}

      unique_ptr<Robot> build() {
          auto sensor = factory.createSensor();
          auto display = factory.createDisplay();
          auto logger = factory.createLogger();

          return make_unique<Robot>(
              std::move(sensor),
              std::move(display),
              std::move(logger)
          );
      }
  };

  // Usage:
  ProductionFactory factory;
  RobotBuilder builder(factory);
  auto robot = builder.build();
  ```

- **Alternative: Template-based Abstract Factory:**
  ```cpp
  template<typename SensorType, typename DisplayType, typename LoggerType>
  class ConcreteFactory : public AbstractFactory {
  public:
      unique_ptr<Sensor> createSensor() override {
          return make_unique<SensorType>();
      }
      unique_ptr<Display> createDisplay() override {
          return make_unique<DisplayType>();
      }
      unique_ptr<Logger> createLogger() override {
          return make_unique<LoggerType>();
      }
  };

  // Usage:
  using ProductionFactory = ConcreteFactory<
      HardwareSensor,
      HardwareDisplay,
      FileLogger
  >;

  using TestFactory = ConcreteFactory<
      MockSensor,
      MockDisplay,
      ConsoleLogger
  >;

  // Reduces boilerplate code
  ```

- **Testing benefits:**
  ```cpp
  // WITHOUT Abstract Factory:
  void test_DataProcessing() {
      // Hard to test - tightly coupled to hardware
      HardwareSensor sensor;
      HardwareDisplay display;
      FileLogger logger("test.log");

      // Test may fail due to hardware issues
      processData(sensor, display, logger);
  }

  // WITH Abstract Factory:
  void test_DataProcessing() {
      // Easy to test - use mocks
      TestFactory factory;
      auto sensor = factory.createSensor();
      auto display = factory.createDisplay();
      auto logger = factory.createLogger();

      // Test isolated from hardware
      processData(*sensor, *display, *logger);
  }
  ```

- **Configuration-driven factory selection:**
  ```cpp
  unique_ptr<AbstractFactory> createFactory(const string& mode) {
      if (mode == "production") {
          return make_unique<ProductionFactory>();
      } else if (mode == "test") {
          return make_unique<TestFactory>();
      } else if (mode == "simulation") {
          return make_unique<SimulationFactory>();
      } else {
          throw std::invalid_argument("Unknown mode: " + mode);
      }
  }

  // Load from config file:
  json config = loadConfig("app.json");
  string mode = config["mode"];
  auto factory = createFactory(mode);

  // Entire application behavior changes based on config
  auto app = make_unique<Application>(std::move(factory));
  app->run();
  ```

- **Key Concept:** **Abstract Factory creates families of related objects ensuring consistency across the family**
  - Use for creating multiple related objects that must be compatible
  - Ensures all objects from same family (no mixing)
  - Switch entire family at once (production vs test)
  - More complex than simple Factory Method
  - Essential for testing and dependency injection
  - Encapsulates concrete classes from clients
  - Example use cases: UI toolkits, cross-platform systems, test mocking

---

---

---

#### Q16
```cpp
class SensorFactory {
public:
    static unique_ptr<Sensor> create(Type type) {
        switch (type) {
            case Type::LIDAR:
                return make_unique<LidarSensor>();
            case Type::RADAR:
                return make_unique<RadarSensor>();
            case Type::CAMERA:
                return make_unique<CameraSensor>();
        }
    }
};

// What happens when you add a new sensor type?
```

**Answer:**
```
Must modify factory code to add new case - violates Open/Closed Principle
```

**Explanation:**

- **Open/Closed Principle (OCP) violation:**
  ```cpp
  // PROBLEM: Adding new sensor type requires modifying factory

  // Original factory:
  switch (type) {
      case Type::LIDAR: return make_unique<LidarSensor>();
      case Type::RADAR: return make_unique<RadarSensor>();
      case Type::CAMERA: return make_unique<CameraSensor>();
  }

  // Need to add SONAR sensor:
  // 1. Modify enum
  enum class Type { LIDAR, RADAR, CAMERA, SONAR };  // CHANGE

  // 2. Modify factory code
  switch (type) {
      case Type::LIDAR: return make_unique<LidarSensor>();
      case Type::RADAR: return make_unique<RadarSensor>();
      case Type::CAMERA: return make_unique<CameraSensor>();
      case Type::SONAR: return make_unique<SonarSensor>();  // ADD
  }

  // Factory class is "closed for extension but not open for modification"
  // Violates OCP
  ```

- **Why OCP matters:**
  ```cpp
  // In large codebase:
  // - Factory is used in 50 different places
  // - Each modification risks introducing bugs
  // - Need to recompile and retest everything
  // - Cannot add sensor types from external plugins/libraries
  // - Third-party developers cannot extend without modifying source
  ```

- **Solution 1: Registry-based factory (runtime registration):**
  ```cpp
  class SensorFactory {
      static map<Type, function<unique_ptr<Sensor>()>> creators;

  public:
      static void registerCreator(Type type, function<unique_ptr<Sensor>()> creator) {
          creators[type] = creator;
      }

      static unique_ptr<Sensor> create(Type type) {
          return creators.at(type)();
      }
  };

  // Add new sensor WITHOUT modifying factory:
  SensorFactory::registerCreator(Type::SONAR, []() {
      return make_unique<SonarSensor>();
  });

  // Factory code unchanged!
  // Open for extension, closed for modification
  ```

- **Solution 2: Self-registration with static initializers:**
  ```cpp
  class SensorFactory {
      static map<Type, function<unique_ptr<Sensor>()>>& getRegistry() {
          static map<Type, function<unique_ptr<Sensor>()>> registry;
          return registry;
      }

  public:
      static void registerCreator(Type type, function<unique_ptr<Sensor>()> creator) {
          getRegistry()[type] = creator;
      }

      static unique_ptr<Sensor> create(Type type) {
          return getRegistry().at(type)();
      }
  };

  // Each sensor registers itself automatically:
  class SonarSensor : public Sensor {
      static bool registered;
  };

  bool SonarSensor::registered = []() {
      SensorFactory::registerCreator(Type::SONAR, []() {
          return make_unique<SonarSensor>();
      });
      return true;
  }();

  // Add new sensor type by adding one .cpp file
  // No changes to factory code
  ```

- **Solution 3: Plugin architecture:**
  ```cpp
  // Factory just manages registry:
  class SensorFactory {
      static map<Type, function<unique_ptr<Sensor>()>> creators;

  public:
      static void registerCreator(Type type, function<unique_ptr<Sensor>()> creator) {
          creators[type] = creator;
      }

      static unique_ptr<Sensor> create(Type type) {
          auto it = creators.find(type);
          if (it == creators.end()) {
              throw std::invalid_argument("Unknown sensor type");
          }
          return it->second();
      }
  };

  // Load sensors from dynamic library:
  void* handle = dlopen("sonar_sensor_plugin.so", RTLD_NOW);

  // Plugin's initialization code registers itself:
  // (Inside sonar_sensor_plugin.so)
  extern "C" void plugin_init() {
      SensorFactory::registerCreator(Type::SONAR, []() {
          return make_unique<SonarSensor>();
      });
  }

  // Can add sensors at runtime without recompiling main application!
  ```

- **Trade-offs:**
  ```
  Switch-based factory:
  ✅ Simple and direct
  ✅ Compile-time type checking
  ✅ Fast (no map lookup)
  ✅ Compiler warns about unhandled enum values
  ❌ Violates OCP (must modify for new types)
  ❌ Cannot extend from plugins
  ❌ Tightly coupled

  Registry-based factory:
  ✅ Follows OCP (add types without modifying factory)
  ✅ Supports plugins
  ✅ Loosely coupled
  ❌ Runtime overhead (map lookup)
  ❌ No compile-time checking
  ❌ Possible registration errors
  ```

- **Hybrid approach:**
  ```cpp
  class SensorFactory {
      static map<Type, function<unique_ptr<Sensor>()>> registry;

  public:
      // Registry-based (extensible):
      static unique_ptr<Sensor> createDynamic(Type type) {
          return registry.at(type)();
      }

      // Switch-based (compile-time checked):
      static unique_ptr<Sensor> createStatic(Type type) {
          switch (type) {
              case Type::LIDAR: return make_unique<LidarSensor>();
              case Type::RADAR: return make_unique<RadarSensor>();
              case Type::CAMERA: return make_unique<CameraSensor>();
          }
          throw std::invalid_argument("Unknown type");
      }

      // Try static first (fast), fall back to dynamic:
      static unique_ptr<Sensor> create(Type type) {
          try {
              return createStatic(type);
          } catch (const std::invalid_argument&) {
              return createDynamic(type);
          }
      }
  };

  // Core sensors use fast switch
  // Plugin sensors use registry
  // Best of both worlds!
  ```

- **When to use each approach:**
  ```cpp
  // Use switch-based factory when:
  // - Fixed set of types known at compile-time
  // - Performance critical
  // - Small codebase
  // - No plugin system needed
  // Example: Game with predefined enemy types

  // Use registry-based factory when:
  // - Types added frequently
  // - Plugin architecture
  // - Third-party extensions
  // - Large codebase with many developers
  // Example: CAD software with user-defined shapes
  ```

- **Key Concept:** **Switch-based factories violate Open/Closed Principle; use registry pattern for extensibility**
  - Switch requires modification for each new type
  - Registry allows adding types without modifying factory
  - Self-registration pattern for automatic registration
  - Plugin architecture for runtime extensibility
  - Trade-off: simplicity vs extensibility
  - Hybrid approach combines benefits of both

---

---

#### Q17
```cpp
class Factory {
public:
    optional<unique_ptr<Sensor>> create(Type type) {
        if (type == Type::INVALID) {
            return nullopt;  // Error: invalid type
        }
        return make_unique<Sensor>(type);
    }
};

auto result = factory.create(type);
if (result) {
    auto sensor = std::move(*result);
    // use sensor
}

// Why use optional instead of exceptions?
```

**Answer:**
```
optional avoids exception overhead and makes failure explicit in return type
```

**Explanation:**

- **Exception overhead:**
  ```cpp
  // Exceptions are expensive when thrown:
  // - Stack unwinding
  // - Destructor calls
  // - Exception object construction/copy
  // - ~1000-10000 CPU cycles per throw

  // Exception-based:
  unique_ptr<Sensor> create(Type type) {
      if (type == Type::INVALID) {
          throw std::invalid_argument("Invalid type");  // Expensive!
      }
      return make_unique<Sensor>(type);
  }

  // Caller:
  try {
      auto sensor = factory.create(type);  // May throw
  } catch (const std::invalid_argument& e) {
      // Handle error (~1000 cycles overhead)
  }

  // optional-based:
  optional<unique_ptr<Sensor>> create(Type type) {
      if (type == Type::INVALID) {
          return nullopt;  // Fast! Just return empty optional
      }
      return make_unique<Sensor>(type);
  }

  // Caller:
  if (auto sensor = factory.create(type)) {
      // Use *sensor (no exception overhead)
  } else {
      // Handle error (~5 cycles overhead)
  }
  ```

- **Expected vs exceptional failures:**
  ```cpp
  // EXCEPTIONAL failure (use exceptions):
  // - Rare, unexpected
  // - Indicates programming error or critical condition
  // - Out of memory, file not found, network error
  // Examples:
  // - make_unique throws bad_alloc (out of memory)
  // - File::open throws if file doesn't exist
  // - Database::connect throws on connection failure

  // EXPECTED failure (use optional):
  // - Common, normal part of control flow
  // - User input validation
  // - Search operations (may not find)
  // - Optional configuration
  // Examples:
  // - Factory create with invalid user input
  // - Map lookup (key may not exist)
  // - Parse user input (may be malformed)
  ```

- **Performance comparison:**
  ```cpp
  // Benchmark: 1M factory calls, 10% invalid types

  // Exception-based:
  int valid = 0, invalid = 0;
  auto start = high_resolution_clock::now();
  for (int i = 0; i < 1000000; ++i) {
      Type type = (i % 10 == 0) ? Type::INVALID : Type::LIDAR;
      try {
          auto sensor = factory.createWithExceptions(type);
          valid++;
      } catch (...) {
          invalid++;  // 100,000 exceptions thrown!
      }
  }
  auto duration = duration_cast<milliseconds>(end - start).count();
  // Result: ~500ms (exceptions are expensive)

  // optional-based:
  int valid = 0, invalid = 0;
  auto start = high_resolution_clock::now();
  for (int i = 0; i < 1000000; ++i) {
      Type type = (i % 10 == 0) ? Type::INVALID : Type::LIDAR;
      if (auto sensor = factory.createWithOptional(type)) {
          valid++;
      } else {
          invalid++;  // Just branch, no exception overhead
      }
  }
  auto duration = duration_cast<milliseconds>(end - start).count();
  // Result: ~10ms (200x faster!)
  ```

- **Explicit error handling:**
  ```cpp
  // Exceptions allow ignoring errors (dangerous):
  auto sensor = factory.createWithExceptions(type);
  // If invalid, exception propagates up
  // May be caught far away or terminate program
  // Easy to forget error handling

  // optional forces explicit handling:
  auto result = factory.createWithOptional(type);
  // result is optional<unique_ptr<Sensor>>
  // Compiler doesn't warn if you forget to check

  if (result) {
      // Must explicitly check before using
      auto sensor = std::move(*result);
  } else {
      // Must explicitly handle failure
  }

  // Even better with [[nodiscard]]:
  [[nodiscard]] optional<unique_ptr<Sensor>> create(Type type) {
      // Compiler warns if caller ignores return value
  }
  ```

- **When to use each:**
  ```cpp
  // Use exceptions for:
  // 1. Exceptional, rare failures
  unique_ptr<Sensor> create(Type type) {
      auto sensor = make_unique<Sensor>();  // May throw bad_alloc (rare)
      return sensor;
  }

  // 2. Failures that cannot be handled locally
  void processData(const string& filename) {
      ifstream file(filename);
      if (!file) throw std::runtime_error("File not found");
      // Caller decides how to handle missing file
  }

  // 3. Constructor failures (no return value)
  class Database {
  public:
      Database(const string& url) {
          if (!connect(url)) {
              throw std::runtime_error("Connection failed");
          }
      }
  };

  // Use optional for:
  // 1. Expected, common failures
  optional<unique_ptr<Sensor>> create(Type type) {
      if (type == Type::INVALID) return nullopt;  // Common
      return make_unique<Sensor>(type);
  }

  // 2. Search operations
  optional<int> findIndex(const vector<int>& vec, int value) {
      auto it = find(vec.begin(), vec.end(), value);
      if (it == vec.end()) return nullopt;  // Not found (normal)
      return distance(vec.begin(), it);
  }

  // 3. Optional parameters
  struct Config {
      string name;
      optional<int> timeout;  // May or may not be set
  };
  ```

- **Combining optional with exceptions:**
  ```cpp
  optional<unique_ptr<Sensor>> create(Type type) {
      if (type == Type::INVALID) {
          return nullopt;  // Expected failure: optional
      }

      auto sensor = make_unique<Sensor>(type);  // May throw bad_alloc (unexpected)
      sensor->initialize();  // May throw on hardware error (unexpected)

      return sensor;
  }

  // Usage:
  try {
      if (auto sensor = factory.create(type)) {
          // Use sensor
      } else {
          // Handle expected failure (invalid type)
      }
  } catch (const std::exception& e) {
      // Handle unexpected failures (out of memory, hardware error)
  }
  ```

- **C++23 std::expected alternative:**
  ```cpp
  // std::expected carries error information:
  expected<unique_ptr<Sensor>, string> create(Type type) {
      if (type == Type::INVALID) {
          return unexpected("Invalid sensor type");  // With error info
      }
      return make_unique<Sensor>(type);
  }

  // Usage:
  auto result = factory.create(type);
  if (result) {
      auto sensor = std::move(*result);
  } else {
      cerr << "Error: " << result.error() << "
";  // Error message available
  }

  // Benefits over optional:
  // - Carries error information
  // - More expressive than nullopt
  // - Can chain with monadic operations (and_then, or_else)
  ```

- **Real-world example:**
  ```cpp
  // User input handling (expected failures → optional):
  class UserInterface {
      SensorFactory factory;

  public:
      void onUserSelectSensor(const string& typeName) {
          Type type = stringToType(typeName);  // User input may be invalid

          if (auto sensor = factory.create(type)) {
              displayMessage("Sensor created successfully");
              activateSensor(*sensor);
          } else {
              displayError("Invalid sensor type selected");  // Common, not exceptional
          }
      }
  };

  // Hardware initialization (unexpected failures → exceptions):
  class HardwareManager {
  public:
      unique_ptr<Sensor> initializeSensor(Type type) {
          auto sensor = make_unique<Sensor>(type);  // May throw bad_alloc
          sensor->connectToHardware();  // May throw HardwareError
          return sensor;  // Failures are exceptional, let caller handle
      }
  };
  ```

- **Key Concept:** **Use optional for expected failures (fast, explicit); exceptions for unexpected failures (rare, propagatable)**
  - Exceptions: 1000-10000 cycles overhead when thrown
  - optional: ~5 cycles overhead (simple branch)
  - Expected failures → optional (user input, search)
  - Unexpected failures → exceptions (OOM, hardware error)
  - optional forces explicit error handling
  - Exceptions allow error propagation
  - Consider std::expected (C++23) for richer error info

---

---

#### Q18
```cpp
class SensorFactory {
    static atomic<int> instanceCount;

public:
    static unique_ptr<Sensor> create(Type type) {
        instanceCount++;
        auto sensor = make_unique<Sensor>(type);
        sensor->setID(instanceCount);
        return sensor;
    }
};

// Called from multiple threads - is this safe?
```

**Answer:**
```
Mostly safe, but instanceCount++ and setID() are not atomic as a unit
```

**Explanation:**

- **Race condition: increment and use are separate:**
  ```cpp
  // Thread 1:                          // Thread 2:
  instanceCount++;  // ID = 1           instanceCount++;  // ID = 2
  auto sensor = make_unique<Sensor>();
  sensor->setID(instanceCount);        auto sensor = make_unique<Sensor>();
  // sensor ID = ???                     sensor->setID(instanceCount);
                                         // sensor ID = ???

  // Possible outcomes:
  // Scenario 1:
  // T1: instanceCount++ (1)
  // T1: setID(1)  ✅
  // T2: instanceCount++ (2)
  // T2: setID(2)  ✅

  // Scenario 2:
  // T1: instanceCount++ (1)
  // T2: instanceCount++ (2)  ← interleaved!
  // T1: setID(2)  ❌ Wrong! Should be 1
  // T2: setID(2)  ❌ Duplicate ID!

  // Scenario 3:
  // T1: instanceCount++ (1)
  // T2: instanceCount++ (2)
  // T2: setID(2)  ✅
  // T1: setID(2)  ❌ Wrong! Should be 1
  ```

- **Why atomic increment doesn't solve it:**
  ```cpp
  // atomic<int>::operator++ is atomic:
  int id1 = instanceCount++;  // Thread-safe
  int id2 = instanceCount++;  // Thread-safe
  // id1 and id2 are guaranteed different

  // BUT: increment and later use are separate operations:
  instanceCount++;  // Atomic operation
  // Context switch can happen here!
  sensor->setID(instanceCount);  // Reading different value

  // Not atomic as a unit!
  ```

- **Demonstration with timing:**
  ```cpp
  // Thread 1 timeline:
  // t=0: instanceCount++ (1 → 2)
  // t=1: make_unique (allocate sensor)
  // t=2: [Context switch to Thread 2]
  // t=5: setID(instanceCount)  ← instanceCount is now 3!

  // Thread 2 timeline:
  // t=3: instanceCount++ (2 → 3)
  // t=4: make_unique
  // t=5: setID(3)

  // Result:
  // Thread 1 sensor: ID = 3 (wrong!)
  // Thread 2 sensor: ID = 3 (duplicate!)
  ```

- **Solution 1: Capture value immediately:**
  ```cpp
  static unique_ptr<Sensor> create(Type type) {
      int id = ++instanceCount;  // Atomic increment and capture
      auto sensor = make_unique<Sensor>(type);
      sensor->setID(id);  // Use captured value
      return sensor;
  }

  // Thread 1: id1 = ++instanceCount (gets 1)
  // Thread 2: id2 = ++instanceCount (gets 2)
  // T1: setID(id1=1)  ✅ Correct
  // T2: setID(id2=2)  ✅ Correct
  // No race condition!
  ```

- **Solution 2: Pass to constructor:**
  ```cpp
  class Sensor {
      int id;
  public:
      Sensor(Type type, int id) : id(id) { /* ... */ }
  };

  static unique_ptr<Sensor> create(Type type) {
      int id = ++instanceCount;  // Atomic increment and capture
      return make_unique<Sensor>(type, id);  // Pass immediately
  }

  // Even safer: ID set in constructor, cannot be changed
  ```

- **Solution 3: Mutex for entire operation:**
  ```cpp
  class SensorFactory {
      static atomic<int> instanceCount;
      static mutex createMutex;

  public:
      static unique_ptr<Sensor> create(Type type) {
          lock_guard lock(createMutex);  // Serialize entire creation

          instanceCount++;
          auto sensor = make_unique<Sensor>(type);
          sensor->setID(instanceCount);
          return sensor;
      }
  };

  // Pros: Simple, correct
  // Cons: Serializes entire factory call (slower)
  ```

- **Why post-increment vs pre-increment matters:**
  ```cpp
  // POST-INCREMENT (instanceCount++):
  int id = instanceCount++;  // Returns OLD value, then increments
  // T1: reads 0, increments to 1, id1 = 0
  // T2: reads 1, increments to 2, id2 = 1
  // Sensor IDs start at 0

  // PRE-INCREMENT (++instanceCount):
  int id = ++instanceCount;  // Increments, then returns NEW value
  // T1: increments to 1, reads 1, id1 = 1
  // T2: increments to 2, reads 2, id2 = 2
  // Sensor IDs start at 1 (more intuitive)
  ```

- **Related atomicity issues:**
  ```cpp
  // BROKEN: Multiple atomic operations are not atomic as a unit
  static atomic<int> sensorCount;
  static atomic<int> errorCount;

  static void reportError() {
      sensorCount++;   // Atomic
      errorCount++;    // Atomic
      // BUT: Not atomic as a unit!
      // Another thread may see sensorCount updated but errorCount not yet
      // Inconsistent state visible
  }

  // FIXED: Mutex or single atomic operation
  static mutex statsMutex;
  static int sensorCount;
  static int errorCount;

  static void reportError() {
      lock_guard lock(statsMutex);
      sensorCount++;
      errorCount++;
      // Atomic as a unit
  }
  ```

- **Performance considerations:**
  ```cpp
  // Benchmark: 1M sensor creations with 8 threads

  // Original (BROKEN):
  instanceCount++;
  sensor->setID(instanceCount);
  // Result: IDs have duplicates and gaps

  // Solution 1: Capture value (FAST):
  int id = ++instanceCount;
  sensor->setID(id);
  // Result: ~50ms, correct IDs

  // Solution 2: Mutex (SLOW):
  lock_guard lock(createMutex);
  instanceCount++;
  sensor->setID(instanceCount);
  // Result: ~500ms (10x slower, but correct)

  // Best: Use Solution 1 (capture value immediately)
  ```

- **Alternative: Thread-local counters:**
  ```cpp
  class SensorFactory {
      static atomic<int> nextThreadID;
      static thread_local int threadID;
      static thread_local int threadLocalCount;

  public:
      static unique_ptr<Sensor> create(Type type) {
          // Lazy initialization of thread ID:
          static thread_local bool initialized = []() {
              threadID = nextThreadID++;
              return true;
          }();

          // Thread-local counter (no contention):
          int localCount = threadLocalCount++;

          // Combine thread ID and local count for unique ID:
          int globalID = (threadID << 20) | localCount;

          auto sensor = make_unique<Sensor>(type);
          sensor->setID(globalID);
          return sensor;
      }
  };

  // Pros: No contention, very fast
  // Cons: IDs not sequential globally, complex
  ```

- **Key Concept:** **Atomic operations on different values are not atomic as a unit; capture value immediately**
  - instanceCount++ is atomic
  - Reading instanceCount later is atomic
  - But the pair is NOT atomic together
  - Capture value with `int id = ++instanceCount`
  - Pass captured value, don't re-read atomic
  - Multiple atomics don't compose into atomic unit
  - Use mutex for complex multi-variable atomicity

---

---

#### Q19
```cpp
class Factory {
    static shared_ptr<Sensor> cached;

public:
    static shared_ptr<Sensor> getInstance() {
        if (!cached) {
            cached = make_shared<Sensor>();
        }
        return cached;
    }
};

// Is this a Factory pattern or Singleton pattern?
```

**Answer:**
```
Hybrid - Factory-like interface but Singleton-like behavior (single cached instance)
```

**Explanation:**

- **Singleton pattern characteristics:**
  ```cpp
  // True Singleton:
  class Singleton {
      static unique_ptr<Singleton> instance;

      Singleton() = default;  // Private constructor

  public:
      static Singleton& getInstance() {
          if (!instance) {
              instance = make_unique<Singleton>();
          }
          return *instance;
      }

      // Prevent copying:
      Singleton(const Singleton&) = delete;
      Singleton& operator=(const Singleton&) = delete;
  };

  // Features:
  // ✅ Private constructor (cannot create externally)
  // ✅ Returns same instance every time
  // ✅ Non-copyable
  ```

- **Factory pattern characteristics:**
  ```cpp
  // True Factory:
  class SensorFactory {
  public:
      static unique_ptr<Sensor> create() {
          return make_unique<Sensor>();  // NEW instance each call
      }
  };

  auto s1 = SensorFactory::create();
  auto s2 = SensorFactory::create();
  // s1 and s2 are DIFFERENT objects

  // Features:
  // ✅ Public constructor (or protected)
  // ✅ Creates new instance each call
  // ✅ Objects are independent
  ```

- **Hybrid pattern analysis:**
  ```cpp
  class Factory {
      static shared_ptr<Sensor> cached;

  public:
      static shared_ptr<Sensor> getInstance() {
          if (!cached) {
              cached = make_shared<Sensor>();  // Create once
          }
          return cached;  // Return same instance
      }
  };

  // Factory-like features:
  // ✅ Named "Factory"
  // ✅ Static factory method
  // ✅ Public constructor (Sensor can be created elsewhere)

  // Singleton-like features:
  // ✅ Returns same instance every time
  // ✅ Lazy initialization
  // ✅ Cached/reused object

  // Missing from true Singleton:
  // ❌ Constructor not private (can create Sensor directly)
  // ❌ Not preventing direct instantiation

  // Missing from true Factory:
  // ❌ Doesn't create new instance each call
  // ❌ All clients share same object
  ```

- **Correct pattern name: Flyweight or Cached Factory:**
  ```cpp
  // Flyweight pattern: Share objects to reduce memory/creation cost
  class SensorFactory {
      static map<Type, shared_ptr<Sensor>> cache;

  public:
      static shared_ptr<Sensor> getSensor(Type type) {
          if (cache.find(type) == cache.end()) {
              cache[type] = make_shared<Sensor>(type);
          }
          return cache[type];  // Return cached instance
      }
  };

  // All clients with Type::LIDAR share same Sensor object
  // Reduces memory if sensors are heavy
  ```

- **Problems with this hybrid:**
  ```cpp
  // Problem 1: Thread-safety
  if (!cached) {  // Thread 1 checks
      // Context switch to Thread 2
      cached = make_shared<Sensor>();  // Thread 2 creates
      // Thread 1 also creates
  }
  // Possible double initialization!

  // Problem 2: Unexpected sharing
  auto s1 = Factory::getInstance();
  s1->setConfig("mode=A");

  auto s2 = Factory::getInstance();  // Same object as s1
  s2->setConfig("mode=B");  // Overwrites s1's config!

  // s1 and s2 are the same object (shared_ptr to same Sensor)
  // Modification through one affects the other

  // Problem 3: Constructor not private
  auto direct = make_shared<Sensor>();  // Can create directly
  // Factory doesn't control all instances
  ```

- **When to use each pattern:**
  ```cpp
  // Use Singleton when:
  // - Exactly one instance needed globally
  // - Examples: Logger, Configuration, Database connection pool
  class Logger {
      static unique_ptr<Logger> instance;
      Logger() { /* ... */ }  // Private
  public:
      static Logger& getInstance() {
          if (!instance) instance = make_unique<Logger>();
          return *instance;
      }
  };

  // Use Factory when:
  // - Need multiple independent instances
  // - Different types based on parameters
  class SensorFactory {
  public:
      static unique_ptr<Sensor> create(Type type) {
          switch (type) {
              case Type::LIDAR: return make_unique<LidarSensor>();
              case Type::RADAR: return make_unique<RadarSensor>();
          }
      }
  };

  // Use Flyweight/Cached Factory when:
  // - Objects are expensive to create
  // - Many clients share same configuration
  // - Objects are immutable or shared state is acceptable
  class IconFactory {
      static map<string, shared_ptr<Icon>> cache;
  public:
      static shared_ptr<Icon> getIcon(const string& filename) {
          if (!cache.count(filename)) {
              cache[filename] = make_shared<Icon>(filename);  // Load once
          }
          return cache[filename];  // Share among all users
      }
  };
  ```

- **Fixing the hybrid to be a proper Singleton:**
  ```cpp
  class Sensor {
      static unique_ptr<Sensor> instance;
      static once_flag initFlag;

      Sensor() = default;  // Private constructor

  public:
      static Sensor& getInstance() {
          call_once(initFlag, []() {
              instance = make_unique<Sensor>();
          });
          return *instance;
      }

      // Delete copy/move:
      Sensor(const Sensor&) = delete;
      Sensor& operator=(const Sensor&) = delete;
      Sensor(Sensor&&) = delete;
      Sensor& operator=(Sensor&&) = delete;
  };

  // Now it's a true Singleton:
  // ✅ Private constructor
  // ✅ Thread-safe (call_once)
  // ✅ Non-copyable/non-movable
  // ✅ Single instance guaranteed
  ```

- **Converting to proper Factory:**
  ```cpp
  class SensorFactory {
  public:
      static unique_ptr<Sensor> create() {
          return make_unique<Sensor>();  // New instance each call
      }

      static shared_ptr<Sensor> createShared() {
          return make_shared<Sensor>();  // New shared instance
      }
  };

  // Each call creates independent object:
  auto s1 = SensorFactory::create();
  auto s2 = SensorFactory::create();
  // s1 != s2 (different objects)
  ```

- **Real-world hybrid pattern: Connection Pool:**
  ```cpp
  class ConnectionPool {
      static vector<shared_ptr<Connection>> pool;
      static mutex poolMutex;

  public:
      static shared_ptr<Connection> acquire() {
          lock_guard lock(poolMutex);

          if (pool.empty()) {
              // Create new if pool exhausted
              return make_shared<Connection>();
          }

          // Reuse existing
          auto conn = pool.back();
          pool.pop_back();
          return conn;
      }

      static void release(shared_ptr<Connection> conn) {
          lock_guard lock(poolMutex);
          pool.push_back(conn);  // Return to pool
      }
  };

  // Factory-like: Creates connections
  // Singleton-like: Reuses connections from pool
  // But not exactly either pattern
  ```

- **Key Concept:** **Hybrid pattern shows Factory interface with Singleton behavior - often a Flyweight pattern**
  - Singleton: One instance, private constructor, non-copyable
  - Factory: New instance each call, independent objects
  - Hybrid: Factory interface, but returns cached instance
  - Proper name: Flyweight or Cached Factory
  - Use for expensive-to-create objects with shared state
  - Watch for thread-safety and unexpected sharing
  - Make intent clear with naming (e.g., getCached vs create)

---

---

#### Q20
```cpp
class Factory {
public:
    static unique_ptr<Sensor> create(const string& config) {
        json j = json::parse(config);
        Type type = j["type"];
        int rate = j["sampleRate"];

        auto sensor = make_unique<Sensor>(type);
        sensor->setSampleRate(rate);
        return sensor;
    }
};

// What happens if JSON parsing fails or fields are missing?
```

**Answer:**
```
Exception thrown - need error handling and validation
```

**Explanation:**

- **Multiple exception points:**
  ```cpp
  static unique_ptr<Sensor> create(const string& config) {
      json j = json::parse(config);  // May throw json::parse_error
      Type type = j["type"];  // May throw json::type_error or out_of_range
      int rate = j["sampleRate"];  // May throw json::type_error or out_of_range

      auto sensor = make_unique<Sensor>(type);  // May throw bad_alloc
      sensor->setSampleRate(rate);  // May throw if rate invalid
      return sensor;
  }

  // Possible exceptions:
  // 1. json::parse_error - invalid JSON syntax
  // 2. json::type_error - wrong type (e.g., "type" is int not string)
  // 3. json::out_of_range - field doesn't exist
  // 4. std::bad_alloc - out of memory
  // 5. std::invalid_argument - rate out of valid range
  ```

- **Scenario 1: Invalid JSON syntax:**
  ```cpp
  // Malformed JSON:
  string config = R"({
      "type": "LIDAR",
      "sampleRate": 100
      // Missing closing brace!
  )";

  try {
      auto sensor = Factory::create(config);
  } catch (const json::parse_error& e) {
      // Exception thrown at json::parse()
      cerr << "Invalid JSON: " << e.what() << "
";
      // Output: parse error at line 3, column 5: syntax error
  }
  ```

- **Scenario 2: Missing required fields:**
  ```cpp
  // Missing "type" field:
  string config = R"({
      "sampleRate": 100
  })";

  try {
      auto sensor = Factory::create(config);
  } catch (const json::out_of_range& e) {
      // Exception thrown at j["type"]
      cerr << "Missing field: " << e.what() << "
";
      // Output: key 'type' not found
  }
  ```

- **Scenario 3: Wrong field type:**
  ```cpp
  // "type" is number instead of string:
  string config = R"({
      "type": 123,
      "sampleRate": 100
  })";

  try {
      auto sensor = Factory::create(config);
  } catch (const json::type_error& e) {
      // Exception thrown when converting 123 to Type enum
      cerr << "Wrong type: " << e.what() << "
";
      // Output: type must be string, but is number
  }
  ```

- **Solution 1: Validate before use:**
  ```cpp
  static unique_ptr<Sensor> create(const string& config) {
      // Parse and validate:
      json j;
      try {
          j = json::parse(config);
      } catch (const json::parse_error& e) {
          throw std::invalid_argument("Invalid JSON: " + string(e.what()));
      }

      // Check required fields exist:
      if (!j.contains("type")) {
          throw std::invalid_argument("Missing 'type' field");
      }
      if (!j.contains("sampleRate")) {
          throw std::invalid_argument("Missing 'sampleRate' field");
      }

      // Check field types:
      if (!j["type"].is_string()) {
          throw std::invalid_argument("'type' must be string");
      }
      if (!j["sampleRate"].is_number_integer()) {
          throw std::invalid_argument("'sampleRate' must be integer");
      }

      // Extract values:
      string typeStr = j["type"];
      Type type = stringToType(typeStr);  // Convert string to enum
      int rate = j["sampleRate"];

      // Validate ranges:
      if (rate < 1 || rate > 1000) {
          throw std::invalid_argument("'sampleRate' must be 1-1000");
      }

      // Create sensor:
      auto sensor = make_unique<Sensor>(type);
      sensor->setSampleRate(rate);
      return sensor;
  }
  ```

- **Solution 2: Return optional on error:**
  ```cpp
  static optional<unique_ptr<Sensor>> create(const string& config) {
      try {
          json j = json::parse(config);

          if (!j.contains("type") || !j.contains("sampleRate")) {
              return nullopt;  // Missing fields
          }

          Type type = stringToType(j["type"]);
          int rate = j["sampleRate"];

          auto sensor = make_unique<Sensor>(type);
          sensor->setSampleRate(rate);
          return sensor;

      } catch (...) {
          return nullopt;  // Any error
      }
  }

  // Usage:
  if (auto sensor = Factory::create(config)) {
      // Use *sensor
  } else {
      cerr << "Failed to create sensor from config
";
  }
  ```

- **Solution 3: Use value_or for defaults:**
  ```cpp
  static unique_ptr<Sensor> create(const string& config) {
      json j = json::parse(config);

      // Provide defaults if fields missing:
      Type type = stringToType(j.value("type", "LIDAR"));
      int rate = j.value("sampleRate", 100);  // Default 100

      auto sensor = make_unique<Sensor>(type);
      sensor->setSampleRate(rate);
      return sensor;
  }

  // Pros: Robust to missing fields
  // Cons: Silent defaults may hide configuration errors
  ```

- **Solution 4: Schema validation:**
  ```cpp
  static bool validateConfig(const json& j, string& error) {
      // Required fields:
      if (!j.contains("type")) {
          error = "Missing required field: type";
          return false;
      }
      if (!j.contains("sampleRate")) {
          error = "Missing required field: sampleRate";
          return false;
      }

      // Type checks:
      if (!j["type"].is_string()) {
          error = "'type' must be string";
          return false;
      }
      if (!j["sampleRate"].is_number_integer()) {
          error = "'sampleRate' must be integer";
          return false;
      }

      // Range checks:
      int rate = j["sampleRate"];
      if (rate < 1 || rate > 1000) {
          error = "'sampleRate' out of range (1-1000)";
          return false;
      }

      return true;
  }

  static unique_ptr<Sensor> create(const string& config) {
      json j = json::parse(config);

      string error;
      if (!validateConfig(j, error)) {
          throw std::invalid_argument(error);
      }

      // Config validated, proceed safely:
      Type type = stringToType(j["type"]);
      int rate = j["sampleRate"];

      auto sensor = make_unique<Sensor>(type);
      sensor->setSampleRate(rate);
      return sensor;
  }
  ```

- **Real-world configuration file handling:**
  ```cpp
  // config.json:
  // {
  //   "sensors": [
  //     {"type": "LIDAR", "sampleRate": 100},
  //     {"type": "RADAR", "sampleRate": 50},
  //     {"type": "INVALID", "sampleRate": -1}  ← Error
  //   ]
  // }

  void loadSensorsFromConfig(const string& filename) {
      ifstream file(filename);
      if (!file) {
          throw std::runtime_error("Config file not found");
      }

      json config;
      try {
          file >> config;
      } catch (const json::parse_error& e) {
          throw std::runtime_error("Invalid JSON in config file: " + string(e.what()));
      }

      for (size_t i = 0; i < config["sensors"].size(); ++i) {
          try {
              auto sensor = Factory::create(config["sensors"][i].dump());
              sensors.push_back(std::move(sensor));
          } catch (const std::exception& e) {
              // Log error but continue loading other sensors:
              cerr << "Failed to load sensor " << i << ": " << e.what() << "
";
          }
      }
  }
  ```

- **Best practices:**
  ```cpp
  // 1. Use JSON schema validator (external library):
  #include <valijson/validator.hpp>

  bool validateAgainstSchema(const json& config, const json& schema) {
      valijson::Schema schemaDoc;
      valijson::SchemaParser parser;
      parser.populateSchema(schema, schemaDoc);

      valijson::Validator validator;
      valijson::ValidationResults results;

      return validator.validate(schemaDoc, config, &results);
  }

  // 2. Provide clear error messages:
  try {
      auto sensor = Factory::create(config);
  } catch (const std::exception& e) {
      throw std::runtime_error(
          "Failed to create sensor from config: " + string(e.what()) +
          "
Config: " + config
      );
  }

  // 3. Log configuration for debugging:
  logger.debug("Creating sensor with config: " + config);
  auto sensor = Factory::create(config);
  logger.info("Sensor created successfully");
  ```

- **Key Concept:** **JSON parsing and field access can throw; validate input and provide meaningful errors**
  - json::parse() throws on invalid syntax
  - Field access throws if key missing
  - Type conversion throws if type mismatch
  - Validate before use to fail early
  - Provide defaults with j.value() for optional fields
  - Use schema validation for complex configs
  - Give clear error messages with context
  - Consider optional return type for expected failures

---
