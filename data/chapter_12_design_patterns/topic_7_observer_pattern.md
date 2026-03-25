## TOPIC: Observer Pattern (Publish-Subscribe)

### THEORY_SECTION: Core Concepts and Design Principles

#### 1. Observer Pattern Overview

**Definition:** Behavioral design pattern defining one-to-many dependency between objects where changes in one object (subject) automatically notify and update dependent objects (observers).

**Core Components:**

| Component | Role | Responsibility |
|-----------|------|----------------|
| **Subject** | Observable object | Maintains list of observers, sends notifications |
| **Observer** | Dependent object | Receives notifications, updates itself |
| **Concrete Subject** | Specific observable | Stores state, triggers notifications on change |
| **Concrete Observer** | Specific dependent | Implements update logic for notifications |

**Core Guarantee:**

| Requirement | Implementation | Purpose |
|-------------|----------------|---------|
| **Loose coupling** | Observers don't know each other | Reduce interdependencies |
| **Dynamic subscription** | Attach/detach observers at runtime | Flexible notification lists |
| **Automatic updates** | Subject notifies on state change | Maintain consistency |
| **One-to-many** | Single subject, multiple observers | Broadcast updates efficiently |

**When to Use Observer Pattern:**

**Common Use Cases:**
```cpp
class SensorFusion {           // ✅ Multiple components need sensor updates
class EventDispatcher {         // ✅ UI elements react to model changes
class StockPriceMonitor {       // ✅ Multiple displays show same data
class LogManager {              // ✅ Multiple loggers receive same events
class CollisionDetector {       // ✅ Multiple systems react to collision events
```

**Inappropriate Uses:**
```cpp
class SingletonObserver {       // ❌ Only one observer - use direct call
class TightlyCoupled {          // ❌ Observer needs specific subject knowledge
class HighFrequencyUpdates {    // ❌ 10kHz+ updates - overhead too high
```

#### 2. Push vs Pull Observer Models

**Push Model:** Subject sends detailed data with notification

```cpp
// Push model - subject sends all data
class Subject {
    vector<Observer*> observers;
    double sensorValue;

public:
    void notifyObservers() {
        for (auto* obs : observers) {
            obs->update(sensorValue);  // Push data to observer
        }
    }
};

class Observer {
public:
    virtual void update(double value) = 0;  // Receives pushed data
};
```

**Pull Model:** Observer queries subject for needed data

```cpp
// Pull model - observer queries subject
class Subject {
    vector<Observer*> observers;
    double sensorValue;

public:
    void notifyObservers() {
        for (auto* obs : observers) {
            obs->update(this);  // Pass subject reference
        }
    }

    double getValue() const { return sensorValue; }  // Observers pull data
};

class Observer {
public:
    virtual void update(Subject* subject) = 0;  // Observer pulls what it needs
};
```

**Comparison:**

| Aspect | Push Model | Pull Model |
|--------|-----------|-----------|
| **Data transfer** | Subject sends all data | Observer queries what it needs |
| **Coupling** | Higher (observers know data format) | Lower (observers query interface) |
| **Efficiency** | Wastes bandwidth if observer doesn't need all data | Efficient - observers get only what they need |
| **Simplicity** | Simpler observer implementation | More flexible, more complex |
| **Use case** | Small, fixed data set | Large or variable data set |

#### 3. C++ Implementation Patterns

**A. Raw Pointer Observers (Simple but Dangerous):**

```cpp
class Subject {
    vector<Observer*> observers;  // ❌ Raw pointers - lifetime issues

public:
    void attach(Observer* obs) { observers.push_back(obs); }

    void detach(Observer* obs) {
        observers.erase(remove(observers.begin(), observers.end(), obs), observers.end());
    }

    void notify() {
        for (auto* obs : observers) {
            obs->update();  // ❌ Dangling pointer if observer deleted!
        }
    }
};
```

**Problem:** If observer is deleted without detaching, subject holds dangling pointer.

**B. Smart Pointer Observers (Safer):**

```cpp
class Subject {
    vector<weak_ptr<Observer>> observers;  // ✅ weak_ptr avoids ownership cycles

public:
    void attach(shared_ptr<Observer> obs) {
        observers.push_back(obs);
    }

    void notify() {
        // Clean up expired observers while iterating
        observers.erase(
            remove_if(observers.begin(), observers.end(),
                      [](const weak_ptr<Observer>& wp) { return wp.expired(); }),
            observers.end()
        );

        // Notify alive observers
        for (auto& wp : observers) {
            if (auto obs = wp.lock()) {  // Convert weak_ptr to shared_ptr
                obs->update();
            }
        }
    }
};
```

**Benefit:** weak_ptr doesn't affect observer lifetime. Observers can be destroyed without manual detach.

**C. Signal/Slot (Boost.Signals2 style):**

```cpp
#include <boost/signals2.hpp>

class Subject {
    boost::signals2::signal<void(double)> valueChanged;  // Signal

public:
    void setValue(double val) {
        value = val;
        valueChanged(val);  // Emit signal
    }

    boost::signals2::connection connect(function<void(double)> slot) {
        return valueChanged.connect(slot);  // Connect slot
    }
};

// Usage
Subject subject;
auto connection = subject.connect([](double val) {
    cout << "Value changed: " << val << "\n";
});
connection.disconnect();  // Explicit disconnect
```

**D. std::function Callbacks:**

```cpp
class Subject {
    vector<function<void(double)>> callbacks;

public:
    void subscribe(function<void(double)> callback) {
        callbacks.push_back(callback);
    }

    void notify(double value) {
        for (auto& cb : callbacks) {
            cb(value);
        }
    }
};

// Usage
Subject subject;
subject.subscribe([](double val) {
    cout << "Callback: " << val << "\n";
});
```

#### 4. Observer Pattern and Concurrency

**Thread Safety Challenges:**

| Challenge | Problem | Solution |
|-----------|---------|----------|
| **Concurrent attach/detach** | Race condition modifying observer list | Mutex protecting observer list |
| **Observer deletion during notification** | Iterator invalidation | Copy observer list before notifying |
| **Concurrent notifications** | Multiple threads notifying simultaneously | Atomic state + mutex for observer list |
| **Deadlock** | Observer callback acquires lock subject needs | Avoid nested locking, use lock-free notifications |

**Thread-Safe Observer (Mutex-Protected):**

```cpp
class ThreadSafeSubject {
    mutable mutex mtx;
    vector<weak_ptr<Observer>> observers;

public:
    void attach(shared_ptr<Observer> obs) {
        lock_guard<mutex> lock(mtx);
        observers.push_back(obs);
    }

    void notify() {
        // Copy observers under lock to avoid holding lock during callbacks
        vector<shared_ptr<Observer>> observersCopy;
        {
            lock_guard<mutex> lock(mtx);
            for (auto& wp : observers) {
                if (auto obs = wp.lock()) {
                    observersCopy.push_back(obs);
                }
            }
        }

        // Notify without holding lock
        for (auto& obs : observersCopy) {
            obs->update();
        }
    }
};
```

#### 5. Autonomous Vehicle Example

**Real-World Observer Use Case:**

```cpp
// Subject: Collision detection system
class CollisionDetector {
    vector<weak_ptr<CollisionObserver>> observers;
    mutable mutex mtx;

public:
    void attach(shared_ptr<CollisionObserver> obs) {
        lock_guard lock(mtx);
        observers.push_back(obs);
    }

    void detectCollisionRisk(double distance, double closing_speed) {
        if (distance < 5.0 && closing_speed > 2.0) {
            // Collision imminent!
            CollisionEvent event{distance, closing_speed, "CRITICAL"};
            notifyObservers(event);
        }
    }

private:
    void notifyObservers(const CollisionEvent& event) {
        vector<shared_ptr<CollisionObserver>> active;
        {
            lock_guard lock(mtx);
            for (auto& wp : observers) {
                if (auto obs = wp.lock()) active.push_back(obs);
            }
        }

        for (auto& obs : active) {
            obs->onCollisionDetected(event);
        }
    }
};

// Observers: Various vehicle systems
class EmergencyBraking : public CollisionObserver {
public:
    void onCollisionDetected(const CollisionEvent& event) override {
        if (event.severity == "CRITICAL") {
            cout << "⚠️  EMERGENCY BRAKING ENGAGED!\n";
            applyMaxBraking();
        }
    }
};

class AlertSystem : public CollisionObserver {
public:
    void onCollisionDetected(const CollisionEvent& event) override {
        cout << "🔔 COLLISION WARNING: " << event.distance << "m\n";
        playWarningSound();
    }
};

class DataLogger : public CollisionObserver {
public:
    void onCollisionDetected(const CollisionEvent& event) override {
        logToFile("Collision event: " + event.toString());
    }
};

// Setup
auto detector = make_shared<CollisionDetector>();
auto braking = make_shared<EmergencyBraking>();
auto alert = make_shared<AlertSystem>();
auto logger = make_shared<DataLogger>();

detector->attach(braking);
detector->attach(alert);
detector->attach(logger);

// When collision detected, all three systems automatically respond
detector->detectCollisionRisk(3.5, 5.0);  // Notifies all observers
```

#### 6. Why Observer Pattern Matters

**Critical Concepts Demonstrated:**

| Concept | How Observer Tests It | Interview Relevance |
|---------|----------------------|---------------------|
| **Polymorphism** | Observers accessed through abstract interface | Core OOP understanding |
| **Loose coupling** | Subject doesn't know concrete observer types | Design for maintainability |
| **Lifetime management** | Smart pointers prevent dangling references | Modern C++ resource safety |
| **Concurrency** | Thread-safe notification requires careful design | Production system requirements |
| **Design patterns** | Classic GoF behavioral pattern | Software architecture knowledge |

**Common Interview Questions:**
- "What's the difference between Observer and Publish-Subscribe?" (Observer: direct reference; Pub-Sub: event channel mediator)
- "How do you prevent memory leaks in Observer pattern?" (Use weak_ptr or explicit detach)
- "What's the difference between push and pull observer models?" (Push sends data; pull provides access)
- "How do you make Observer thread-safe?" (Mutex + copy observer list before notifying)

---

### EDGE_CASES: Tricky Scenarios and Implementation Pitfalls

#### Edge Case 1: Circular References and Memory Leaks

```cpp
// ❌ PROBLEM: shared_ptr circular reference causes memory leak
class Subject {
    vector<shared_ptr<Observer>> observers;  // ❌ Strong reference

public:
    void attach(shared_ptr<Observer> obs) {
        observers.push_back(obs);  // Subject owns observer
    }
};

class Observer {
    shared_ptr<Subject> subject;  // ❌ Observer owns subject

public:
    Observer(shared_ptr<Subject> subj) : subject(subj) {
        subject->attach(shared_from_this());  // Circular reference!
    }
};

// Neither Subject nor Observer ever destroyed - memory leak!

// ✅ SOLUTION: Use weak_ptr to break cycle
class Subject {
    vector<weak_ptr<Observer>> observers;  // ✅ Weak reference

public:
    void attach(shared_ptr<Observer> obs) {
        observers.push_back(obs);
    }

    void notify() {
        for (auto& wp : observers) {
            if (auto obs = wp.lock()) {  // Check if still alive
                obs->update();
            }
        }
    }
};

class Observer : public enable_shared_from_this<Observer> {
    weak_ptr<Subject> subject;  // ✅ Weak reference to subject

public:
    Observer(shared_ptr<Subject> subj) : subject(subj) {
        if (auto s = subject.lock()) {
            s->attach(shared_from_this());
        }
    }
};
```

**Why This Matters:** Observer pattern naturally creates circular references (subject knows observers, observers know subject). Always use `weak_ptr` for at least one direction to prevent memory leaks.

#### Edge Case 2: Observer Deletion During Notification

```cpp
// ❌ PROBLEM: Observer removes itself during notification loop
class Subject {
    vector<Observer*> observers;

public:
    void notify() {
        for (auto* obs : observers) {  // ❌ Iterating observers
            obs->update();  // Observer might call detach() here!
        }
    }

    void detach(Observer* obs) {
        // ❌ Modifies vector while being iterated - undefined behavior!
        observers.erase(remove(observers.begin(), observers.end(), obs), observers.end());
    }
};

class SelfRemovingObserver : public Observer {
    Subject* subject;

public:
    void update() override {
        subject->detach(this);  // ❌ Removes self during iteration!
    }
};

// ✅ SOLUTION: Copy observer list before notifying
class Subject {
    vector<weak_ptr<Observer>> observers;
    mutable mutex mtx;

public:
    void notify() {
        // Copy observers to avoid iteration during modification
        vector<shared_ptr<Observer>> observersCopy;
        {
            lock_guard lock(mtx);
            for (auto& wp : observers) {
                if (auto obs = wp.lock()) {
                    observersCopy.push_back(obs);
                }
            }
        }

        // Notify on copy - safe if observers detach themselves
        for (auto& obs : observersCopy) {
            obs->update();
        }
    }
};
```

**Why This Matters:** Observers often unsubscribe in response to notifications (e.g., one-time listeners). Copying the observer list before iterating prevents iterator invalidation.

#### Edge Case 3: Notification Storms and Infinite Loops

```cpp
// ❌ PROBLEM: Observer triggers notification that triggers observer again
class TemperatureSubject {
    double temperature;
    vector<weak_ptr<Observer>> observers;

public:
    void setTemperature(double temp) {
        temperature = temp;
        notify();  // Notifies observers
    }
};

class TemperatureController : public Observer {
    shared_ptr<TemperatureSubject> subject;

public:
    void update() override {
        double current = subject->getTemperature();
        if (current < 20.0) {
            // ❌ Setting temperature triggers notification again!
            subject->setTemperature(current + 1.0);  // Infinite loop!
        }
    }
};

// ✅ SOLUTION 1: Guard flag to prevent recursive notifications
class TemperatureSubject {
    double temperature;
    bool notifying = false;  // Recursion guard
    vector<weak_ptr<Observer>> observers;

public:
    void setTemperature(double temp) {
        if (temperature != temp) {  // Only notify on actual change
            temperature = temp;

            if (!notifying) {  // ✅ Prevent recursive notifications
                notifying = true;
                notify();
                notifying = false;
            }
        }
    }
};

// ✅ SOLUTION 2: Deferred notifications (queue updates)
class TemperatureSubject {
    double temperature;
    queue<double> pendingUpdates;
    bool processing = false;

public:
    void setTemperature(double temp) {
        pendingUpdates.push(temp);

        if (!processing) {
            processing = true;
            while (!pendingUpdates.empty()) {
                temperature = pendingUpdates.front();
                pendingUpdates.pop();
                notify();
            }
            processing = false;
        }
    }
};
```

**Why This Matters:** Observers that modify the subject can create notification storms or infinite loops. Use recursion guards or deferred notifications to prevent cascading updates.

#### Edge Case 4: Thread Safety and Race Conditions

```cpp
// ❌ PROBLEM: Concurrent attach/notify creates race conditions
class Subject {
    vector<weak_ptr<Observer>> observers;  // ❌ Not protected

public:
    void attach(shared_ptr<Observer> obs) {
        observers.push_back(obs);  // ❌ Race condition with notify()
    }

    void notify() {
        for (auto& wp : observers) {  // ❌ Concurrent modification
            if (auto obs = wp.lock()) {
                obs->update();
            }
        }
    }
};

// Thread 1: subject.attach(obs1);
// Thread 2: subject.notify();  // ❌ Data race on observers vector!

// ✅ SOLUTION: Mutex protection with careful locking
class ThreadSafeSubject {
    mutable mutex mtx;
    vector<weak_ptr<Observer>> observers;

public:
    void attach(shared_ptr<Observer> obs) {
        lock_guard lock(mtx);  // ✅ Protect modification
        observers.push_back(obs);
    }

    void notify() {
        // Step 1: Copy observers under lock
        vector<shared_ptr<Observer>> snapshot;
        {
            lock_guard lock(mtx);
            for (auto& wp : observers) {
                if (auto obs = wp.lock()) {
                    snapshot.push_back(obs);
                }
            }
        }  // Release lock before callbacks

        // Step 2: Notify without holding lock (avoid deadlock)
        for (auto& obs : snapshot) {
            obs->update();
        }
    }
};
```

**Why This Matters:** Multi-threaded systems commonly use Observer pattern. Without proper synchronization, concurrent attach/detach/notify operations cause data races and undefined behavior. Always protect observer list with mutex, and release lock before invoking callbacks to avoid deadlocks.

#### Edge Case 5: Observer Order and Dependencies

```cpp
// ❌ PROBLEM: Observers have implicit dependencies on execution order
class SensorSubject {
    vector<weak_ptr<Observer>> observers;

public:
    void notify() {
        for (auto& wp : observers) {  // ❌ Order undefined
            if (auto obs = wp.lock()) {
                obs->update();
            }
        }
    }
};

// Observer A must execute before Observer B
class DataValidator : public Observer {
    void update() override {
        validateData();  // Must run first
    }
};

class DataProcessor : public Observer {
    void update() override {
        processData();  // ❌ Assumes data already validated!
    }
};

// If DataProcessor notified before DataValidator, processes invalid data!

// ✅ SOLUTION 1: Priority-based notification
class Subject {
    struct ObserverEntry {
        weak_ptr<Observer> observer;
        int priority;  // Higher = notified first

        bool operator<(const ObserverEntry& other) const {
            return priority > other.priority;  // Descending order
        }
    };

    vector<ObserverEntry> observers;

public:
    void attach(shared_ptr<Observer> obs, int priority = 0) {
        observers.push_back({obs, priority});
        sort(observers.begin(), observers.end());  // Sort by priority
    }

    void notify() {
        for (auto& entry : observers) {
            if (auto obs = entry.observer.lock()) {
                obs->update();
            }
        }
    }
};

// Usage
subject.attach(validator, 100);   // High priority
subject.attach(processor, 50);    // Lower priority - runs after validator

// ✅ SOLUTION 2: Multi-phase notification
class Subject {
public:
    void notify() {
        // Phase 1: Validators
        for (auto& obs : validatorObservers) {
            obs->update();
        }

        // Phase 2: Processors (run after validation)
        for (auto& obs : processorObservers) {
            obs->update();
        }

        // Phase 3: Loggers (run last)
        for (auto& obs : loggerObservers) {
            obs->update();
        }
    }
};
```

**Why This Matters:** Observer pattern doesn't guarantee notification order. If observers have dependencies, use explicit priorities or multi-phase notifications to ensure correct execution order.

#### Edge Case 6: Exception Safety in Observer Callbacks

```cpp
// ❌ PROBLEM: Observer throws exception, remaining observers not notified
class Subject {
    vector<weak_ptr<Observer>> observers;

public:
    void notify() {
        for (auto& wp : observers) {
            if (auto obs = wp.lock()) {
                obs->update();  // ❌ If throws, loop aborts!
            }
        }
    }
};

class ThrowingObserver : public Observer {
    void update() override {
        throw runtime_error("Update failed!");  // ❌ Prevents other observers from running
    }
};

// ✅ SOLUTION: Catch exceptions, continue notifying
class Subject {
    vector<weak_ptr<Observer>> observers;

public:
    void notify() {
        for (auto& wp : observers) {
            if (auto obs = wp.lock()) {
                try {
                    obs->update();  // ✅ Isolated from exceptions
                } catch (const exception& e) {
                    cerr << "Observer update failed: " << e.what() << "\n";
                    // Log error but continue notifying other observers
                }
            }
        }
    }
};

// ✅ ALTERNATIVE: Collect exceptions and throw aggregate
class Subject {
public:
    void notify() {
        vector<exception_ptr> exceptions;

        for (auto& wp : observers) {
            if (auto obs = wp.lock()) {
                try {
                    obs->update();
                } catch (...) {
                    exceptions.push_back(current_exception());
                }
            }
        }

        if (!exceptions.empty()) {
            // Throw first exception or custom aggregate exception
            rethrow_exception(exceptions[0]);
        }
    }
};
```

**Why This Matters:** Observer callbacks are user code - they can throw exceptions. Without exception handling, one failing observer prevents others from being notified. Always catch exceptions during notification to ensure all observers execute.

---

### CODE_EXAMPLES: Progressive Implementation from Easy to Advanced

#### Example 1: Easy - Basic Observer with Raw Pointers

```cpp
#include <iostream>
#include <vector>
#include <algorithm>
#include <string>

// Observer interface
class Observer {
public:
    virtual ~Observer() = default;
    virtual void update(const std::string& message) = 0;
};

// Subject (Observable)
class NewsAgency {
    std::vector<Observer*> observers;
    std::string latestNews;

public:
    void subscribe(Observer* observer) {
        observers.push_back(observer);
    }

    void unsubscribe(Observer* observer) {
        observers.erase(
            std::remove(observers.begin(), observers.end(), observer),
            observers.end()
        );
    }

    void setNews(const std::string& news) {
        latestNews = news;
        notifyObservers();
    }

private:
    void notifyObservers() {
        for (auto* observer : observers) {
            observer->update(latestNews);
        }
    }
};

// Concrete Observers
class EmailSubscriber : public Observer {
    std::string email;

public:
    EmailSubscriber(const std::string& e) : email(e) {}

    void update(const std::string& message) override {
        std::cout << "Email to " << email << ": " << message << "\n";
    }
};

class SMSSubscriber : public Observer {
    std::string phoneNumber;

public:
    SMSSubscriber(const std::string& phone) : phoneNumber(phone) {}

    void update(const std::string& message) override {
        std::cout << "SMS to " << phoneNumber << ": " << message << "\n";
    }
};

int main() {
    std::cout << "Basic Observer Pattern Example\n\n";

    NewsAgency agency;

    EmailSubscriber email1("user@example.com");
    SMSSubscriber sms1("555-1234");

    // Subscribe observers
    agency.subscribe(&email1);
    agency.subscribe(&sms1);

    // Publish news - all subscribers notified
    agency.setNews("Breaking: C++ Observer Pattern Explained!");

    std::cout << "\nUnsubscribing email...\n";
    agency.unsubscribe(&email1);

    agency.setNews("Update: Only SMS subscriber receives this");

    return 0;
}
```

Basic Observer pattern with raw pointers. Subject maintains list of observers and notifies them when state changes. Simple but requires manual subscription management.

#### Example 2: Mid - Smart Pointer Observer (weak_ptr)

```cpp
#include <iostream>
#include <vector>
#include <memory>
#include <algorithm>
#include <string>

// Observer interface
class Observer {
public:
    virtual ~Observer() = default;
    virtual void update(double temperature) = 0;
};

// Subject using smart pointers
class TemperatureSensor {
    std::vector<std::weak_ptr<Observer>> observers;
    double currentTemperature = 20.0;

public:
    void attach(std::shared_ptr<Observer> observer) {
        observers.push_back(observer);  // Store weak_ptr
    }

    void setTemperature(double temp) {
        currentTemperature = temp;
        notifyObservers();
    }

    double getTemperature() const {
        return currentTemperature;
    }

private:
    void notifyObservers() {
        // Clean up expired observers
        observers.erase(
            std::remove_if(observers.begin(), observers.end(),
                          [](const std::weak_ptr<Observer>& wp) {
                              return wp.expired();
                          }),
            observers.end()
        );

        // Notify alive observers
        for (auto& wp : observers) {
            if (auto observer = wp.lock()) {  // Convert to shared_ptr
                observer->update(currentTemperature);
            }
        }
    }
};

// Concrete Observers
class TemperatureDisplay : public Observer {
    std::string location;

public:
    TemperatureDisplay(const std::string& loc) : location(loc) {}

    ~TemperatureDisplay() {
        std::cout << "Display at " << location << " destroyed\n";
    }

    void update(double temperature) override {
        std::cout << "[" << location << "] Temperature: "
                  << temperature << "°C\n";
    }
};

class TemperatureAlert : public Observer {
    double threshold;

public:
    TemperatureAlert(double t) : threshold(t) {}

    void update(double temperature) override {
        if (temperature > threshold) {
            std::cout << "⚠️  ALERT: Temperature " << temperature
                      << "°C exceeds threshold " << threshold << "°C!\n";
        }
    }
};

int main() {
    std::cout << "Smart Pointer Observer Example\n\n";

    TemperatureSensor sensor;

    auto display1 = std::make_shared<TemperatureDisplay>("Living Room");
    auto display2 = std::make_shared<TemperatureDisplay>("Bedroom");
    auto alert = std::make_shared<TemperatureAlert>(25.0);

    sensor.attach(display1);
    sensor.attach(display2);
    sensor.attach(alert);

    std::cout << "Setting temperature to 22°C:\n";
    sensor.setTemperature(22.0);

    std::cout << "\nSetting temperature to 28°C:\n";
    sensor.setTemperature(28.0);

    std::cout << "\nDestroying one display...\n";
    display1.reset();  // Destroy observer

    std::cout << "\nSetting temperature to 30°C:\n";
    sensor.setTemperature(30.0);  // Only 2 observers notified

    return 0;
}
```

Smart pointer observer using `weak_ptr` to avoid memory leaks. Subject doesn't own observers, so they can be destroyed without manual detachment. Automatic cleanup of dead observers.

#### Example 3: Mid - Pull Model Observer

```cpp
#include <iostream>
#include <vector>
#include <memory>
#include <string>

// Forward declaration
class WeatherStation;

// Observer interface (Pull model)
class WeatherObserver {
public:
    virtual ~WeatherObserver() = default;
    virtual void update(WeatherStation* station) = 0;  // Pull data from station
};

// Subject with multiple data points
class WeatherStation {
    std::vector<std::weak_ptr<WeatherObserver>> observers;
    double temperature = 20.0;
    double humidity = 50.0;
    double pressure = 1013.0;

public:
    void attach(std::shared_ptr<WeatherObserver> obs) {
        observers.push_back(obs);
    }

    void setMeasurements(double temp, double hum, double pres) {
        temperature = temp;
        humidity = hum;
        pressure = pres;
        notifyObservers();
    }

    // Pull interface - observers query what they need
    double getTemperature() const { return temperature; }
    double getHumidity() const { return humidity; }
    double getPressure() const { return pressure; }

private:
    void notifyObservers() {
        for (auto& wp : observers) {
            if (auto obs = wp.lock()) {
                obs->update(this);  // Pass station reference
            }
        }
    }
};

// Concrete Observers (each pulls different data)
class TemperatureDisplay : public WeatherObserver {
public:
    void update(WeatherStation* station) override {
        // Only pulls temperature
        double temp = station->getTemperature();
        std::cout << "Temperature Display: " << temp << "°C\n";
    }
};

class HumidityDisplay : public WeatherObserver {
public:
    void update(WeatherStation* station) override {
        // Only pulls humidity
        double hum = station->getHumidity();
        std::cout << "Humidity Display: " << hum << "%\n";
    }
};

class FullWeatherDisplay : public WeatherObserver {
public:
    void update(WeatherStation* station) override {
        // Pulls all data
        std::cout << "Full Weather Report:\n";
        std::cout << "  Temperature: " << station->getTemperature() << "°C\n";
        std::cout << "  Humidity: " << station->getHumidity() << "%\n";
        std::cout << "  Pressure: " << station->getPressure() << " hPa\n";
    }
};

int main() {
    std::cout << "Pull Model Observer Example\n\n";

    WeatherStation station;

    auto tempDisplay = std::make_shared<TemperatureDisplay>();
    auto humDisplay = std::make_shared<HumidityDisplay>();
    auto fullDisplay = std::make_shared<FullWeatherDisplay>();

    station.attach(tempDisplay);
    station.attach(humDisplay);
    station.attach(fullDisplay);

    std::cout << "Weather update 1:\n";
    station.setMeasurements(22.5, 60.0, 1015.0);

    std::cout << "\nWeather update 2:\n";
    station.setMeasurements(25.0, 55.0, 1012.0);

    return 0;
}
```

Pull model observer where observers query subject for needed data. More flexible than push model - each observer gets only what it needs. Lower coupling.

#### Example 4: Advanced - Thread-Safe Observer

```cpp
#include <iostream>
#include <vector>
#include <memory>
#include <mutex>
#include <thread>
#include <chrono>

// Observer interface
class SensorObserver {
public:
    virtual ~SensorObserver() = default;
    virtual void onSensorUpdate(double value) = 0;
};

// Thread-safe Subject
class ThreadSafeSensor {
    mutable std::mutex mtx;
    std::vector<std::weak_ptr<SensorObserver>> observers;
    double sensorValue = 0.0;

public:
    void attach(std::shared_ptr<SensorObserver> obs) {
        std::lock_guard<std::mutex> lock(mtx);
        observers.push_back(obs);
    }

    void setSensorValue(double value) {
        {
            std::lock_guard<std::mutex> lock(mtx);
            sensorValue = value;
        }
        notifyObservers(value);
    }

private:
    void notifyObservers(double value) {
        // Copy observers under lock
        std::vector<std::shared_ptr<SensorObserver>> snapshot;
        {
            std::lock_guard<std::mutex> lock(mtx);

            // Clean expired and copy alive observers
            observers.erase(
                std::remove_if(observers.begin(), observers.end(),
                              [](const auto& wp) { return wp.expired(); }),
                observers.end()
            );

            for (auto& wp : observers) {
                if (auto obs = wp.lock()) {
                    snapshot.push_back(obs);
                }
            }
        }  // Release lock before callbacks

        // Notify without holding lock (avoid deadlock)
        for (auto& obs : snapshot) {
            obs->onSensorUpdate(value);
        }
    }
};

// Concrete Observer
class SensorLogger : public SensorObserver {
    std::string name;
    mutable std::mutex logMtx;

public:
    SensorLogger(const std::string& n) : name(n) {}

    void onSensorUpdate(double value) override {
        std::lock_guard<std::mutex> lock(logMtx);
        std::cout << "[" << name << "] Sensor value: " << value << "\n";
    }
};

int main() {
    std::cout << "Thread-Safe Observer Example\n\n";

    ThreadSafeSensor sensor;

    auto logger1 = std::make_shared<SensorLogger>("Logger-1");
    auto logger2 = std::make_shared<SensorLogger>("Logger-2");

    sensor.attach(logger1);
    sensor.attach(logger2);

    // Simulate concurrent sensor updates from multiple threads
    std::vector<std::thread> threads;

    for (int i = 0; i < 5; ++i) {
        threads.emplace_back([&sensor, i]() {
            for (int j = 0; j < 3; ++j) {
                sensor.setSensorValue(i * 10 + j);
                std::this_thread::sleep_for(std::chrono::milliseconds(10));
            }
        });
    }

    for (auto& t : threads) {
        t.join();
    }

    std::cout << "\nAll threads completed\n";

    return 0;
}
```

Thread-safe observer with mutex protection. Copies observer list before notifying to avoid holding lock during callbacks (prevents deadlock). Safe for concurrent attach/notify operations.

#### Example 5: Advanced - Signal/Slot with std::function

```cpp
#include <iostream>
#include <vector>
#include <functional>
#include <memory>
#include <algorithm>

// Signal class (Observable)
template<typename... Args>
class Signal {
    using Slot = std::function<void(Args...)>;

    struct Connection {
        int id;
        Slot slot;
    };

    std::vector<Connection> connections;
    int nextId = 0;

public:
    // Connect a slot (returns connection ID)
    int connect(Slot slot) {
        int id = nextId++;
        connections.push_back({id, slot});
        return id;
    }

    // Disconnect by ID
    void disconnect(int connectionId) {
        connections.erase(
            std::remove_if(connections.begin(), connections.end(),
                          [connectionId](const Connection& conn) {
                              return conn.id == connectionId;
                          }),
            connections.end()
        );
    }

    // Emit signal - notify all connected slots
    void emit(Args... args) {
        for (auto& conn : connections) {
            conn.slot(args...);
        }
    }

    // Operator overload for easier emission
    void operator()(Args... args) {
        emit(args...);
    }
};

// Example: Button class with clicked signal
class Button {
    std::string label;

public:
    Signal<const std::string&> clicked;  // Signal with string parameter

    Button(const std::string& lbl) : label(lbl) {}

    void click() {
        std::cout << "Button '" << label << "' clicked!\n";
        clicked(label);  // Emit signal
    }
};

int main() {
    std::cout << "Signal/Slot Pattern Example\n\n";

    Button button("Submit");

    // Connect lambda slots
    auto conn1 = button.clicked.connect([](const std::string& label) {
        std::cout << "  Handler 1: Button " << label << " was clicked\n";
    });

    auto conn2 = button.clicked.connect([](const std::string& label) {
        std::cout << "  Handler 2: Logging click on " << label << "\n";
    });

    auto conn3 = button.clicked.connect([](const std::string& label) {
        std::cout << "  Handler 3: Sending analytics for " << label << "\n";
    });

    std::cout << "First click:\n";
    button.click();

    std::cout << "\nDisconnecting handler 2...\n";
    button.clicked.disconnect(conn2);

    std::cout << "\nSecond click:\n";
    button.click();

    return 0;
}
```

Signal/Slot pattern using `std::function`. Type-safe, flexible callback system. Each signal can have multiple slots (callbacks). Supports disconnection by ID.

#### Example 6: Real-World - Autonomous Vehicle Sensor Fusion Observer

```cpp
#include <iostream>
#include <vector>
#include <memory>
#include <mutex>
#include <string>
#include <chrono>

// Sensor data structure
struct SensorData {
    std::string sensorType;
    double value;
    long timestamp;
};

// Observer interface
class SensorFusionObserver {
public:
    virtual ~SensorFusionObserver() = default;
    virtual void onSensorData(const SensorData& data) = 0;
};

// Subject: Sensor Fusion Engine
class SensorFusionEngine {
    mutable std::mutex mtx;
    std::vector<std::weak_ptr<SensorFusionObserver>> observers;

public:
    void attach(std::shared_ptr<SensorFusionObserver> obs) {
        std::lock_guard lock(mtx);
        observers.push_back(obs);
    }

    void processSensorData(const SensorData& data) {
        // Sensor fusion processing...
        std::cout << "Fusion: Processing " << data.sensorType
                  << " = " << data.value << "\n";

        // Notify all observers
        notifyObservers(data);
    }

private:
    void notifyObservers(const SensorData& data) {
        std::vector<std::shared_ptr<SensorFusionObserver>> active;
        {
            std::lock_guard lock(mtx);
            for (auto& wp : observers) {
                if (auto obs = wp.lock()) {
                    active.push_back(obs);
                }
            }
        }

        for (auto& obs : active) {
            obs->onSensorData(data);
        }
    }
};

// Concrete Observers: Different vehicle systems

class PerceptionSystem : public SensorFusionObserver {
public:
    void onSensorData(const SensorData& data) override {
        if (data.sensorType == "LIDAR" || data.sensorType == "CAMERA") {
            std::cout << "  [Perception] Object detection using "
                      << data.sensorType << " data\n";
        }
    }
};

class LocalizationSystem : public SensorFusionObserver {
public:
    void onSensorData(const SensorData& data) override {
        if (data.sensorType == "GPS" || data.sensorType == "IMU") {
            std::cout << "  [Localization] Updating vehicle position using "
                      << data.sensorType << " data\n";
        }
    }
};

class PathPlanner : public SensorFusionObserver {
    double lastObstacleDistance = 100.0;

public:
    void onSensorData(const SensorData& data) override {
        if (data.sensorType == "LIDAR") {
            lastObstacleDistance = data.value;

            if (lastObstacleDistance < 10.0) {
                std::cout << "  [PathPlanner] ⚠️  Obstacle at "
                          << lastObstacleDistance << "m - replanning path!\n";
            }
        }
    }
};

class SafetyMonitor : public SensorFusionObserver {
public:
    void onSensorData(const SensorData& data) override {
        if (data.sensorType == "RADAR" && data.value < 5.0) {
            std::cout << "  [Safety] 🚨 EMERGENCY: Object at "
                      << data.value << "m - activating brakes!\n";
        }
    }
};

class DataLogger : public SensorFusionObserver {
public:
    void onSensorData(const SensorData& data) override {
        std::cout << "  [Logger] Recording: " << data.sensorType
                  << " = " << data.value << " @ " << data.timestamp << "\n";
    }
};

int main() {
    std::cout << "Autonomous Vehicle Sensor Fusion Observer\n";
    std::cout << "==========================================\n\n";

    SensorFusionEngine fusion;

    // Create and attach vehicle systems as observers
    auto perception = std::make_shared<PerceptionSystem>();
    auto localization = std::make_shared<LocalizationSystem>();
    auto pathPlanner = std::make_shared<PathPlanner>();
    auto safety = std::make_shared<SafetyMonitor>();
    auto logger = std::make_shared<DataLogger>();

    fusion.attach(perception);
    fusion.attach(localization);
    fusion.attach(pathPlanner);
    fusion.attach(safety);
    fusion.attach(logger);

    // Simulate sensor data processing
    using namespace std::chrono;
    auto now = duration_cast<milliseconds>(system_clock::now().time_since_epoch()).count();

    std::cout << "=== Sensor Update 1: LIDAR ===\n";
    fusion.processSensorData({"LIDAR", 15.7, now});

    std::cout << "\n=== Sensor Update 2: GPS ===\n";
    fusion.processSensorData({"GPS", 37.7749, now + 100});

    std::cout << "\n=== Sensor Update 3: RADAR (Close obstacle!) ===\n";
    fusion.processSensorData({"RADAR", 3.5, now + 200});

    std::cout << "\n=== Sensor Update 4: CAMERA ===\n";
    fusion.processSensorData({"CAMERA", 120.5, now + 300});

    return 0;
}
```

Real-world autonomous vehicle sensor fusion using Observer pattern. Multiple vehicle systems (perception, localization, path planning, safety, logging) observe sensor fusion engine. Each system reacts to relevant sensor data independently.

#### Example 7: Advanced - Observer with Priority and Filtering

```cpp
#include <iostream>
#include <vector>
#include <memory>
#include <algorithm>
#include <functional>

// Event types
enum class EventType { TEMPERATURE, PRESSURE, HUMIDITY };

struct SensorEvent {
    EventType type;
    double value;
};

// Observer with filtering capability
class FilteredObserver {
public:
    virtual ~FilteredObserver() = default;
    virtual void onEvent(const SensorEvent& event) = 0;
    virtual bool interestedIn(EventType type) const = 0;
};

// Subject with priority and filtering
class SmartSensorSubject {
    struct ObserverEntry {
        std::weak_ptr<FilteredObserver> observer;
        int priority;  // Higher = notified first

        bool operator<(const ObserverEntry& other) const {
            return priority > other.priority;  // Descending
        }
    };

    std::vector<ObserverEntry> observers;

public:
    void attach(std::shared_ptr<FilteredObserver> obs, int priority = 0) {
        observers.push_back({obs, priority});
        std::sort(observers.begin(), observers.end());
    }

    void publishEvent(const SensorEvent& event) {
        std::cout << "Publishing event: Type="
                  << static_cast<int>(event.type)
                  << ", Value=" << event.value << "\n";

        for (auto& entry : observers) {
            if (auto obs = entry.observer.lock()) {
                if (obs->interestedIn(event.type)) {  // Filter
                    obs->onEvent(event);
                }
            }
        }
    }
};

// Concrete Observers with filters
class TemperatureMonitor : public FilteredObserver {
public:
    bool interestedIn(EventType type) const override {
        return type == EventType::TEMPERATURE;
    }

    void onEvent(const SensorEvent& event) override {
        std::cout << "  [TempMonitor] Temperature: " << event.value << "°C\n";
    }
};

class AllEventsLogger : public FilteredObserver {
public:
    bool interestedIn(EventType type) const override {
        return true;  // Interested in all events
    }

    void onEvent(const SensorEvent& event) override {
        std::cout << "  [Logger] Logging event type "
                  << static_cast<int>(event.type) << "\n";
    }
};

class CriticalAlerts : public FilteredObserver {
    double tempThreshold = 30.0;
    double pressureThreshold = 1020.0;

public:
    bool interestedIn(EventType type) const override {
        return type == EventType::TEMPERATURE || type == EventType::PRESSURE;
    }

    void onEvent(const SensorEvent& event) override {
        if (event.type == EventType::TEMPERATURE && event.value > tempThreshold) {
            std::cout << "  [ALERT] 🚨 High temperature: " << event.value << "°C!\n";
        }
        if (event.type == EventType::PRESSURE && event.value > pressureThreshold) {
            std::cout << "  [ALERT] 🚨 High pressure: " << event.value << " hPa!\n";
        }
    }
};

int main() {
    std::cout << "Observer with Priority and Filtering\n\n";

    SmartSensorSubject sensor;

    auto tempMonitor = std::make_shared<TemperatureMonitor>();
    auto logger = std::make_shared<AllEventsLogger>();
    auto alerts = std::make_shared<CriticalAlerts>();

    // Attach with priorities (alerts highest, logger lowest)
    sensor.attach(alerts, 100);       // Priority 100 - runs first
    sensor.attach(tempMonitor, 50);   // Priority 50
    sensor.attach(logger, 10);        // Priority 10 - runs last

    std::cout << "Event 1: Temperature 25°C\n";
    sensor.publishEvent({EventType::TEMPERATURE, 25.0});

    std::cout << "\nEvent 2: Pressure 1015 hPa\n";
    sensor.publishEvent({EventType::PRESSURE, 1015.0});

    std::cout << "\nEvent 3: Temperature 35°C (critical!)\n";
    sensor.publishEvent({EventType::TEMPERATURE, 35.0});

    std::cout << "\nEvent 4: Humidity 60% (only logger interested)\n";
    sensor.publishEvent({EventType::HUMIDITY, 60.0});

    return 0;
}
```

Advanced observer with priority-based notification and event filtering. Observers declare interest in specific event types. High-priority observers (alerts) run before low-priority ones (loggers).

#### Example 8: Performance - Observer with Event Queuing

```cpp
#include <iostream>
#include <vector>
#include <memory>
#include <queue>
#include <mutex>
#include <thread>
#include <chrono>
#include <condition_variable>

// Event structure
struct Event {
    std::string type;
    double value;
    long timestamp;
};

// Observer interface
class AsyncObserver {
public:
    virtual ~AsyncObserver() = default;
    virtual void onEvent(const Event& event) = 0;
};

// Asynchronous observer with event queue
class AsyncEventSubject {
    std::vector<std::weak_ptr<AsyncObserver>> observers;
    std::queue<Event> eventQueue;
    std::mutex mtx;
    std::condition_variable cv;
    bool running = true;
    std::thread workerThread;

public:
    AsyncEventSubject() {
        // Background thread processes events
        workerThread = std::thread([this]() {
            processEvents();
        });
    }

    ~AsyncEventSubject() {
        {
            std::lock_guard lock(mtx);
            running = false;
        }
        cv.notify_one();
        if (workerThread.joinable()) {
            workerThread.join();
        }
    }

    void attach(std::shared_ptr<AsyncObserver> obs) {
        std::lock_guard lock(mtx);
        observers.push_back(obs);
    }

    void publishEvent(const Event& event) {
        {
            std::lock_guard lock(mtx);
            eventQueue.push(event);
        }
        cv.notify_one();  // Wake up worker thread
    }

private:
    void processEvents() {
        while (true) {
            std::unique_lock lock(mtx);

            // Wait for events or shutdown
            cv.wait(lock, [this]() {
                return !eventQueue.empty() || !running;
            });

            if (!running && eventQueue.empty()) {
                break;  // Shutdown
            }

            if (!eventQueue.empty()) {
                Event event = eventQueue.front();
                eventQueue.pop();

                // Copy observers
                std::vector<std::shared_ptr<AsyncObserver>> active;
                for (auto& wp : observers) {
                    if (auto obs = wp.lock()) {
                        active.push_back(obs);
                    }
                }

                lock.unlock();  // Release lock before callbacks

                // Notify observers
                for (auto& obs : active) {
                    obs->onEvent(event);
                }
            }
        }
    }
};

// Concrete Observer
class EventProcessor : public AsyncObserver {
    std::string name;

public:
    EventProcessor(const std::string& n) : name(n) {}

    void onEvent(const Event& event) override {
        // Simulate processing time
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
        std::cout << "[" << name << "] Processed event: " << event.type
                  << " = " << event.value << "\n";
    }
};

int main() {
    std::cout << "Asynchronous Observer with Event Queue\n\n";

    AsyncEventSubject subject;

    auto processor1 = std::make_shared<EventProcessor>("Processor-1");
    auto processor2 = std::make_shared<EventProcessor>("Processor-2");

    subject.attach(processor1);
    subject.attach(processor2);

    std::cout << "Publishing events asynchronously...\n";

    // Publish multiple events quickly
    for (int i = 0; i < 5; ++i) {
        subject.publishEvent({"Temperature", 20.0 + i, 1000 + i});
        std::cout << "Published event " << i << "\n";
    }

    std::cout << "\nWaiting for processing to complete...\n";
    std::this_thread::sleep_for(std::chrono::seconds(2));

    std::cout << "\nAll events processed\n";

    return 0;
}
```

High-performance asynchronous observer with event queue. Events are published to queue and processed by background thread. Prevents blocking caller during observer notifications. Critical for real-time systems.

---

### INTERVIEW_QA: Comprehensive Questions with Detailed Answers

#### Q1: What is the Observer pattern and when should you use it?
**Difficulty:** #beginner
**Category:** #design_pattern
**Concepts:** #observer #behavioral_pattern #loose_coupling

**Answer:**
Observer pattern defines one-to-many dependency where changes in one object (subject) automatically notify and update dependent objects (observers).

**Code example:**
```cpp
class Subject {
    vector<Observer*> observers;
public:
    void attach(Observer* obs) { observers.push_back(obs); }
    void notify() {
        for (auto* obs : observers) {
            obs->update();  // Notify all observers
        }
    }
};
```

**Explanation:**
Use Observer when: (1) change in one object requires updating others without tight coupling, (2) number of dependents varies or unknown at compile-time, (3) need broadcast communication where multiple objects react to same event. Common in MVC (Model notifies Views), event systems, and real-time data distribution.

**Key takeaway:** Observer decouples subjects from observers, enabling one-to-many broadcast updates.

---

#### Q2: What's the difference between Observer pattern and Publish-Subscribe pattern?
**Difficulty:** #intermediate
**Category:** #design_patterns #comparison
**Concepts:** #observer #pubsub #event_channel

**Answer:**
Observer pattern: direct reference between subject and observers. Publish-Subscribe: event channel mediates between publishers and subscribers - no direct knowledge.

**Code example:**
```cpp
// Observer: Direct reference
class Subject {
    vector<Observer*> observers;  // Subject knows observers
};

// Pub-Sub: Event channel mediates
class EventChannel {
    map<string, vector<Subscriber*>> subscribers;
public:
    void publish(const string& topic, Event event) {
        for (auto* sub : subscribers[topic]) {
            sub->onEvent(event);  // Publishers don't know subscribers
        }
    }
};
```

**Explanation:**
Observer: subject holds direct references to observers, tighter coupling. Pub-Sub: publishers and subscribers communicate through event channel/broker, complete decoupling. Observer better for small-scale, same-process communication. Pub-Sub better for distributed systems, cross-process messaging, and complex event routing.

**Key takeaway:** Observer = direct coupling; Pub-Sub = indirect coupling through event channel.

---

#### Q3: How do you prevent memory leaks in Observer pattern with smart pointers?
**Difficulty:** #intermediate
**Category:** #memory_management #smart_pointers
**Concepts:** #weak_ptr #circular_references #raii

**Answer:**
Use `weak_ptr` in subject to store observers, preventing circular reference memory leaks while allowing automatic cleanup.

**Code example:**
```cpp
// ❌ Memory leak with shared_ptr cycle
class Subject {
    vector<shared_ptr<Observer>> observers;  // Strong reference
};
class Observer {
    shared_ptr<Subject> subject;  // Circular reference!
};

// ✅ No leak with weak_ptr
class Subject {
    vector<weak_ptr<Observer>> observers;  // Weak reference
public:
    void notify() {
        for (auto& wp : observers) {
            if (auto obs = wp.lock()) {  // Convert to shared_ptr
                obs->update();
            }
        }
    }
};
```

**Explanation:**
Subject and Observer often reference each other, creating circular dependency. If both use `shared_ptr`, reference count never reaches zero, causing leak. Using `weak_ptr` in subject breaks cycle - observers can be destroyed when external references gone. `weak_ptr` doesn't affect reference count.

**Key takeaway:** Always use weak_ptr in subject to store observers to prevent circular reference leaks.

---

#### Q4: What's the difference between push and pull observer models?
**Difficulty:** #intermediate
**Category:** #design_patterns #communication
**Concepts:** #push_model #pull_model #coupling

**Answer:**
Push model: subject sends all data with notification. Pull model: subject sends notification, observer queries for needed data.

**Code example:**
```cpp
// Push model
class Observer {
    virtual void update(double temp, double humidity, double pressure) = 0;
    // ❌ Receives all data, even if only needs temperature
};

// Pull model
class Observer {
    virtual void update(Subject* subject) = 0;  // Receives subject reference
    // ✅ Can query only needed data: subject->getTemperature()
};
```

**Explanation:**
Push: simpler for observers (data already provided), but wasteful if observers don't need all data. Higher coupling (observers know data format). Pull: more flexible (observers query what they need), lower coupling, but requires observers to know subject interface. Use push for small, fixed data. Use pull for large or variable data.

**Key takeaway:** Push = subject sends data; Pull = observer queries data. Trade-off between simplicity and flexibility.

---

#### Q5: How do you make Observer pattern thread-safe?
**Difficulty:** #advanced
**Category:** #concurrency #thread_safety
**Concepts:** #mutex #race_condition #deadlock

**Answer:**
Protect observer list with mutex, copy observers before notifying to avoid holding lock during callbacks (prevents deadlock).

**Code example:**
```cpp
class ThreadSafeSubject {
    mutable mutex mtx;
    vector<weak_ptr<Observer>> observers;

public:
    void notify() {
        // Copy observers under lock
        vector<shared_ptr<Observer>> snapshot;
        {
            lock_guard lock(mtx);
            for (auto& wp : observers) {
                if (auto obs = wp.lock()) {
                    snapshot.push_back(obs);
                }
            }
        }  // Release lock

        // Notify without holding lock
        for (auto& obs : snapshot) {
            obs->update();  // Safe - no lock held
        }
    }
};
```

**Explanation:**
Without synchronization, concurrent attach/detach/notify causes data races. Mutex protects observer list modifications. Crucially, release lock before invoking callbacks to avoid deadlock (observer callback might try to attach/detach). Copying observer list ensures callbacks can safely modify observer list.

**Key takeaway:** Mutex for observer list + copy before notifying = thread-safe without deadlock.

---

#### Q6: What happens if an observer throws an exception during notification?
**Difficulty:** #intermediate
**Category:** #exception_safety #error_handling
**Concepts:** #exception_handling #robustness #isolation

**Answer:**
Without exception handling, one failing observer prevents others from being notified. Always catch exceptions to isolate failures.

**Code example:**
```cpp
// ❌ One exception stops all notifications
void notify() {
    for (auto* obs : observers) {
        obs->update();  // If throws, remaining observers not notified!
    }
}

// ✅ Catch exceptions, continue notifying
void notify() {
    for (auto* obs : observers) {
        try {
            obs->update();
        } catch (const exception& e) {
            cerr << "Observer failed: " << e.what() << "\n";
            // Continue notifying other observers
        }
    }
}
```

**Explanation:**
Observer callbacks are user code - can throw exceptions. Without try-catch, exception propagates, aborting notification loop. Other observers never receive update. Catching exceptions isolates failures, ensuring all observers get notified. Option: collect exceptions and throw aggregate after notifying all.

**Key takeaway:** Always catch exceptions during observer notification to ensure all observers execute.

---

#### Q7: How do you handle observers that modify the subject during notification?
**Difficulty:** #advanced
**Category:** #recursion #notification_storms
**Concepts:** #recursion_guard #deferred_updates

**Answer:**
Use recursion guard to prevent infinite notification loops when observers modify subject.

**Code example:**
```cpp
class Subject {
    bool notifying = false;  // Recursion guard

public:
    void setValue(int val) {
        if (value != val) {
            value = val;

            if (!notifying) {  // ✅ Prevent recursive notifications
                notifying = true;
                notify();
                notifying = false;
            }
        }
    }
};
```

**Explanation:**
Observers that modify subject during notification create cascading updates or infinite loops. Recursion guard prevents re-entering notify() while already notifying. Alternative: defer updates (queue changes, apply after notification complete). Another approach: detect cycles and break them.

**Key takeaway:** Use recursion guard or deferred updates to prevent notification storms from observer modifications.

---

#### Q8: How do you implement priority-based observer notifications?
**Difficulty:** #intermediate
**Category:** #design_patterns #ordering
**Concepts:** #priority #ordering #dependencies

**Answer:**
Store observers with priority values, sort by priority, notify in priority order (high to low).

**Code example:**
```cpp
class Subject {
    struct Entry {
        weak_ptr<Observer> observer;
        int priority;  // Higher = notified first

        bool operator<(const Entry& o) const {
            return priority > o.priority;  // Descending
        }
    };

    vector<Entry> observers;

public:
    void attach(shared_ptr<Observer> obs, int priority = 0) {
        observers.push_back({obs, priority});
        sort(observers.begin(), observers.end());
    }
};
```

**Explanation:**
Default Observer pattern doesn't guarantee notification order. If observers have dependencies (e.g., validator must run before processor), use priorities. Higher priority observers notified first. Alternative: multi-phase notifications (validators phase, processors phase, loggers phase).

**Key takeaway:** Use priority values and sorting for guaranteed observer notification order.

---

#### Q9: What's the virtual constructor idiom and how does it relate to Observer?
**Difficulty:** #advanced
**Category:** #idioms #polymorphism
**Concepts:** #virtual_constructor #clone_pattern

**Answer:**
Virtual constructor idiom uses factory methods for polymorphic copying/construction. Useful for cloning observer lists.

**Code example:**
```cpp
class Observer {
public:
    virtual unique_ptr<Observer> clone() const = 0;  // Virtual copy
};

class ConcreteObserver : public Observer {
public:
    unique_ptr<Observer> clone() const override {
        return make_unique<ConcreteObserver>(*this);
    }
};

// Clone entire observer list
vector<unique_ptr<Observer>> cloneObservers(const vector<Observer*>& orig) {
    vector<unique_ptr<Observer>> cloned;
    for (auto* obs : orig) {
        cloned.push_back(obs->clone());  // Polymorphic copy
    }
    return cloned;
}
```

**Explanation:**
C++ constructors can't be virtual, but clone() achieves virtual copying. Each derived observer implements clone() to return copy of correct type. Useful for duplicating observer lists, creating snapshots, or implementing undo/redo with observer state.

**Key takeaway:** Virtual constructor pattern enables polymorphic observer cloning without knowing concrete types.

---

#### Q10: How do you test code that uses Observer pattern?
**Difficulty:** #intermediate
**Category:** #testing #testability
**Concepts:** #mock_observers #dependency_injection #verification

**Answer:**
Create mock observers to verify notifications, count calls, and inspect received data.

**Code example:**
```cpp
// Mock observer for testing
class MockObserver : public Observer {
public:
    int updateCount = 0;
    double lastValue = 0;

    void update(double value) override {
        updateCount++;
        lastValue = value;
    }
};

// Test
TEST(SubjectTest, NotifiesObservers) {
    Subject subject;
    auto mock = make_shared<MockObserver>();
    subject.attach(mock);

    subject.setValue(42.0);

    EXPECT_EQ(1, mock->updateCount);
    EXPECT_EQ(42.0, mock->lastValue);
}
```

**Explanation:**
Mock observers record interactions (number of calls, parameters received). Tests attach mocks, trigger state changes, verify mocks were notified correctly. Can verify notification order, exception handling, thread safety with mock observers.

**Key takeaway:** Mock observers enable verification of notification behavior in tests.

---

#### Q11: What's the difference between Observer and Mediator patterns?
**Difficulty:** #intermediate
**Category:** #design_patterns #comparison
**Concepts:** #observer #mediator #communication

**Answer:**
Observer: one-to-many broadcast (subject notifies all observers). Mediator: many-to-many coordination (mediator coordinates interactions between components).

**Code example:**
```cpp
// Observer: One-to-many broadcast
class Subject {
    vector<Observer*> observers;
public:
    void notify() {
        for (auto* obs : observers) obs->update();  // Broadcast
    }
};

// Mediator: Many-to-many coordination
class ChatRoom {  // Mediator
public:
    void sendMessage(User* sender, string msg) {
        for (auto* user : users) {
            if (user != sender) user->receive(msg);  // Coordinate
        }
    }
};
```

**Explanation:**
Observer: subjects don't know about each other, only their observers. Communication is one-to-many. Mediator: components know mediator, not each other. Mediator coordinates complex interactions. Use Observer for simple broadcasts. Use Mediator for complex component interactions.

**Key takeaway:** Observer = broadcast updates; Mediator = coordinate interactions between multiple components.

---

#### Q12: How do you implement event filtering in Observer pattern?
**Difficulty:** #intermediate
**Category:** #design_patterns #filtering
**Concepts:** #event_filtering #selective_notification

**Answer:**
Observers declare interest in specific event types; subject only notifies interested observers.

**Code example:**
```cpp
enum class EventType { TEMP, PRESSURE, HUMIDITY };

class Observer {
public:
    virtual void onEvent(Event event) = 0;
    virtual bool interestedIn(EventType type) const = 0;
};

class Subject {
public:
    void publish(Event event) {
        for (auto& obs : observers) {
            if (obs->interestedIn(event.type)) {  // Filter
                obs->onEvent(event);
            }
        }
    }
};

class TempObserver : public Observer {
    bool interestedIn(EventType type) const override {
        return type == EventType::TEMP;  // Only temperature
    }
};
```

**Explanation:**
Filtering reduces unnecessary notifications. Observer declares interest through `interestedIn()` method. Subject checks interest before notifying. Alternative: topic-based subscription where observers subscribe to specific topics/event types.

**Key takeaway:** Event filtering reduces unnecessary observer notifications by checking interest before notifying.

---

#### Q13: What are the performance implications of Observer pattern?
**Difficulty:** #advanced
**Category:** #performance #optimization
**Concepts:** #performance #overhead #optimization

**Answer:**
Observer adds overhead: iteration through observers (~n * 5ns), virtual calls (~3-5ns each), potential dynamic allocation. For high-frequency updates, consider alternatives.

**Code example:**
```cpp
// Overhead breakdown for 10 observers
void notify() {
    for (auto& wp : observers) {  // ~10 iterations
        if (auto obs = wp.lock()) {  // ~5ns weak_ptr lock
            obs->update();  // ~3-5ns virtual call
        }
    }
}
// Total: ~(10 * 8ns) = 80ns per notification

// For 10kHz updates: 80ns * 10000 = 800μs = 0.8ms per second
// Acceptable for most systems, problematic for real-time
```

**Explanation:**
Each notification iterates observers (O(n)), converts weak_ptr to shared_ptr (atomic operation), and makes virtual call. For low-frequency updates (<1kHz), overhead negligible. For high-frequency (>10kHz), consider alternatives: direct callbacks, lock-free queues, or batch notifications.

**Key takeaway:** Observer pattern has O(n) notification overhead; acceptable for moderate frequencies, problematic for real-time high-frequency updates.

---

#### Q14: How do you implement auto-disconnection (observers unsubscribe on destruction)?
**Difficulty:** #intermediate
**Category:** #resource_management #raii
**Concepts:** #raii #auto_disconnect #weak_ptr

**Answer:**
Use `weak_ptr` in subject for automatic disconnection, or RAII connection handles for explicit lifetime management.

**Code example:**
```cpp
// Automatic with weak_ptr
class Subject {
    vector<weak_ptr<Observer>> observers;
public:
    void notify() {
        for (auto& wp : observers) {
            if (auto obs = wp.lock()) {  // Auto-skip destroyed observers
                obs->update();
            }
        }
    }
};
// When observer destroyed, weak_ptr automatically expires

// Explicit with RAII connection
class Connection {
    Subject* subject;
    Observer* observer;
public:
    Connection(Subject* s, Observer* o) : subject(s), observer(o) {}
    ~Connection() { subject->detach(observer); }  // Auto-disconnect
};

auto conn = make_unique<Connection>(&subject, &observer);
// When conn destroyed, observer auto-detached
```

**Explanation:**
weak_ptr approach: no manual detachment needed, expired observers skipped during notification. RAII connection approach: explicit connection object handles detachment in destructor. Both ensure observers don't leak or cause dangling references.

**Key takeaway:** weak_ptr provides automatic disconnection; RAII connection handles provide explicit lifetime control.

---

#### Q15: How does Observer pattern support the Open/Closed Principle?
**Difficulty:** #intermediate
**Category:** #design_principles #solid
**Concepts:** #ocp #extensibility

**Answer:**
Observer pattern enables adding new observers without modifying subject - subject is open for extension, closed for modification.

**Code example:**
```cpp
class Subject {
    vector<Observer*> observers;
public:
    void attach(Observer* obs) { observers.push_back(obs); }
    void notify() { /* unchanged */ }
};

// Add new observer type without modifying Subject
class NewFeatureObserver : public Observer {
    void update() override {
        // New functionality
    }
};

subject.attach(new NewFeatureObserver());  // ✅ Extended without modification
```

**Explanation:**
Open/Closed Principle: software entities should be open for extension but closed for modification. Observer pattern: subject's notification logic never changes, but new observer types can be added by creating new classes implementing Observer interface. No need to modify subject code.

**Key takeaway:** Observer pattern enables extension (new observers) without modification (subject unchanged).

---

#### Q16: What's the relationship between Observer and MVC architecture?
**Difficulty:** #intermediate
**Category:** #architecture #design_patterns
**Concepts:** #mvc #observer #separation_of_concerns

**Answer:**
MVC uses Observer pattern: Model is subject, Views are observers. Model changes notify all Views to update.

**Code example:**
```cpp
// Model (Subject)
class DataModel {
    vector<weak_ptr<View>> views;  // Observers
    int data;

public:
    void setData(int d) {
        data = d;
        notifyViews();  // Notify all views
    }

private:
    void notifyViews() {
        for (auto& wp : views) {
            if (auto view = wp.lock()) {
                view->refresh();  // View updates itself
            }
        }
    }
};

// View (Observer)
class ChartView : public View {
    DataModel& model;
public:
    void refresh() override {
        // Redraw chart with model.getData()
    }
};
```

**Explanation:**
MVC separates data (Model), presentation (View), and control (Controller). Observer pattern connects Model and View: when Model changes, all Views automatically refresh. Enables multiple Views of same Model (e.g., table view + chart view). Views don't need to poll Model for changes.

**Key takeaway:** Observer pattern is fundamental to MVC - Model notifies Views of changes automatically.

---

#### Q17: How do you implement Observer pattern with lambda callbacks instead of interfaces?
**Difficulty:** #intermediate
**Category:** #modern_cpp #callbacks
**Concepts:** #lambda #std_function #callbacks

**Answer:**
Use `std::function` to store lambda callbacks instead of Observer interface, providing more flexible subscription.

**Code example:**
```cpp
class Subject {
    using Callback = function<void(double)>;
    vector<Callback> callbacks;

public:
    void subscribe(Callback cb) {
        callbacks.push_back(cb);
    }

    void notify(double value) {
        for (auto& cb : callbacks) {
            cb(value);
        }
    }
};

// Usage with lambdas
Subject subject;
subject.subscribe([](double val) {
    cout << "Lambda observer: " << val << "\n";
});

int counter = 0;
subject.subscribe([&counter](double val) {
    counter++;  // Capture local state
});
```

**Explanation:**
Traditional Observer requires implementing interface. std::function approach: subscribe with any callable (lambda, function pointer, functor). More flexible, less boilerplate. Trade-off: type erasure overhead (~10% slower than virtual calls), no compile-time type checking for callback signature.

**Key takeaway:** std::function callbacks provide flexible Observer pattern without interface boilerplate.

---

#### Q18: What's the difference between synchronous and asynchronous observer notifications?
**Difficulty:** #advanced
**Category:** #concurrency #performance
**Concepts:** #synchronous #asynchronous #event_queues

**Answer:**
Synchronous: observers notified immediately in caller's thread. Asynchronous: notifications queued and processed by background thread.

**Code example:**
```cpp
// Synchronous - blocks caller
void notify() {
    for (auto& obs : observers) {
        obs->update();  // Blocks until update() completes
    }
}  // Caller waits for all observers

// Asynchronous - non-blocking
void notifyAsync() {
    for (auto& obs : observers) {
        eventQueue.push([obs]() {
            obs->update();  // Queued for background thread
        });
    }
}  // Returns immediately, processing happens later
```

**Explanation:**
Synchronous: simple, predictable order, but caller blocked during notifications. Asynchronous: caller doesn't block, better for slow observers, but complexity increases (threading, event ordering, lifetime management). Use synchronous for fast observers, asynchronous for slow/IO-bound observers.

**Key takeaway:** Synchronous = immediate notification (blocking); Asynchronous = queued notification (non-blocking).

---

#### Q19: How do you prevent deadlock in Observer pattern with multiple mutexes?
**Difficulty:** #advanced
**Category:** #concurrency #deadlock
**Concepts:** #deadlock #lock_ordering #lock_free

**Answer:**
Release subject's lock before invoking observer callbacks to avoid deadlock when observers acquire their own locks.

**Code example:**
```cpp
// ❌ DEADLOCK: Subject holds lock during callback
class Subject {
    mutex mtx;
public:
    void notify() {
        lock_guard lock(mtx);  // Subject locked
        for (auto& obs : observers) {
            obs->update();  // ❌ Observer might try to attach() -> deadlock!
        }
    }
};

// ✅ SAFE: Release lock before callbacks
class Subject {
    mutex mtx;
public:
    void notify() {
        vector<shared_ptr<Observer>> snapshot;
        {
            lock_guard lock(mtx);
            snapshot = copyObservers();  // Copy under lock
        }  // Release lock

        for (auto& obs : snapshot) {
            obs->update();  // ✅ Safe - no lock held
        }
    }
};
```

**Explanation:**
Deadlock occurs when: (1) Subject holds lock, (2) calls observer, (3) observer calls back into subject (attach/detach), (4) tries to acquire same lock. Solution: copy observer list under lock, release lock, then notify. Observers can safely call back into subject without deadlock.

**Key takeaway:** Copy observers under lock, release lock before notifying to prevent deadlock.

---

#### Q20: How do you implement one-time observers (auto-detach after first notification)?
**Difficulty:** #intermediate
**Category:** #design_patterns #lifecycle
**Concepts:** #one_time_observer #auto_detach

**Answer:**
Observer marks itself for removal during update; subject removes marked observers after notification.

**Code example:**
```cpp
class Subject {
    vector<Observer*> observers;
    vector<Observer*> toRemove;

public:
    void notify() {
        for (auto* obs : observers) {
            obs->update();
            if (obs->shouldRemove()) {
                toRemove.push_back(obs);
            }
        }

        // Remove one-time observers
        for (auto* obs : toRemove) {
            detach(obs);
        }
        toRemove.clear();
    }
};

class OneTimeObserver : public Observer {
    bool notified = false;
public:
    void update() override {
        cout << "One-time notification\n";
        notified = true;
    }

    bool shouldRemove() const override {
        return notified;
    }
};
```

**Explanation:**
One-time observers useful for event completion (wait for single event), resource cleanup (react once to condition), or future-like patterns. Observers mark themselves during update, subject removes them after iteration (avoids modifying collection during iteration).

**Key takeaway:** One-time observers auto-detach after first notification by marking themselves for removal.

---

### PRACTICE_TASKS: Code Analysis and Implementation Challenges

#### Q1
```cpp
class Subject {
    vector<Observer*> observers;
public:
    void attach(Observer* obs) {
        observers.push_back(obs);
    }

    void notify() {
        for (auto* obs : observers) {
            obs->update();  // Observer deletes itself here
        }
    }
};

class SelfDestructingObserver : public Observer {
    Subject* subject;
public:
    void update() override {
        subject->detach(this);
        delete this;  // ❌ Deletes itself
    }
};

// What's the problem?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Deleting observer during notification causes use-after-free when loop continues

**Explanation:** After `delete this`, the pointer becomes dangling. Loop might access deleted object on next iteration or in subsequent code.

**Fix:** Use smart pointers (weak_ptr) or defer deletion until after notification loop

**Key Concept:** #use_after_free #lifetime_management

</details>

---

#### Q2
```cpp
class Subject {
    vector<shared_ptr<Observer>> observers;
public:
    void attach(shared_ptr<Observer> obs) {
        observers.push_back(obs);
    }
};

class Observer : public enable_shared_from_this<Observer> {
    shared_ptr<Subject> subject;
public:
    Observer(shared_ptr<Subject> s) : subject(s) {
        subject->attach(shared_from_this());
    }
};

// Why does this cause a memory leak?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Circular reference - subject owns observer, observer owns subject

**Explanation:** shared_ptr cycle: subject holds shared_ptr to observer, observer holds shared_ptr to subject. Reference counts never reach zero.

**Fix:** Use weak_ptr in either subject or observer to break cycle

**Key Concept:** #circular_reference #memory_leak

</details>

---

#### Q3
```cpp
class Subject {
    vector<weak_ptr<Observer>> observers;
public:
    void notify() {
        for (auto& wp : observers) {
            if (auto obs = wp.lock()) {
                obs->update();
            }
        }
    }
};

// Two threads call notify() simultaneously - is this thread-safe?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Not thread-safe - concurrent iteration of vector causes data race

**Explanation:** Vector iteration without synchronization is data race. Also, another thread might attach/detach during iteration, causing iterator invalidation.

**Fix:** Use mutex to protect observer vector access

**Key Concept:** #thread_safety #data_race

</details>

---

#### Q4
```cpp
class TemperatureSubject {
    double temperature;
public:
    void setTemperature(double temp) {
        temperature = temp;
        notify();
    }
};

class TemperatureController : public Observer {
    TemperatureSubject* subject;
public:
    void update() override {
        double current = subject->getTemperature();
        if (current < 20.0) {
            subject->setTemperature(current + 1.0);  // Trigger another notification
        }
    }
};

// What problem can this create?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Infinite notification loop - observer modifies subject, causing new notification

**Explanation:** Setting temperature in update() triggers another notify(), which calls update() again, creating infinite recursion.

**Fix:** Use recursion guard flag to prevent re-entry, or defer updates

**Key Concept:** #infinite_loop #recursion

</details>

---

#### Q5
```cpp
class Subject {
    vector<Observer*> observers;
public:
    void notify() {
        for (auto* obs : observers) {
            obs->update();  // What if this throws?
        }
    }
};

class ThrowingObserver : public Observer {
    void update() override {
        throw runtime_error("Failed!");
    }
};

// What happens to remaining observers?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Exception aborts loop - remaining observers not notified

**Explanation:** Exception propagates out of notify(), preventing subsequent observers from receiving update.

**Fix:** Catch exceptions in loop to ensure all observers execute

**Key Concept:** #exception_safety #isolation

</details>

---

#### Q6
```cpp
// Push model
class Observer {
    virtual void update(double temp, double humidity, double pressure) = 0;
};

// Pull model
class Observer {
    virtual void update(Subject* subject) = 0;
};

// Which model has tighter coupling?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Push model has tighter coupling - observers depend on exact data format

**Explanation:** Push model: observer signature must match all subject data. Adding new data requires changing all observers. Pull model: observers query only what they need.

**Trade-off:** Push = simpler but tighter coupling; Pull = flexible but more complex

**Key Concept:** #coupling #push_vs_pull

</details>

---

#### Q7
```cpp
class Subject {
    vector<weak_ptr<Observer>> observers;
public:
    void attach(shared_ptr<Observer> obs) {
        observers.push_back(obs);
    }

    void notify() {
        for (auto& wp : observers) {
            if (auto obs = wp.lock()) {
                obs->update();
            }
        }
    }
};

// Does this automatically clean up expired observers?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** No - expired weak_ptrs accumulate, need manual cleanup

**Explanation:** weak_ptr::lock() returns nullptr for expired pointers, but expired entries remain in vector. Over time, vector fills with expired weak_ptrs.

**Fix:** Periodically call `erase(remove_if(... expired), end())` to clean up

**Key Concept:** #weak_ptr #cleanup

</details>

---

#### Q8
```cpp
class Subject {
    vector<Observer*> observers;
public:
    void notify() {
        auto observersCopy = observers;  // Copy
        for (auto* obs : observersCopy) {
            obs->update();
        }
    }
};

// Why copy the observer list?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Allows observers to safely attach/detach during notification without iterator invalidation

**Explanation:** Copying observer list before iteration ensures modifications to original list (during callbacks) don't invalidate iterators.

**Use case:** Observers that unsubscribe in response to notification (one-time listeners)

**Key Concept:** #iterator_invalidation #defensive_copying

</details>

---

#### Q9
```cpp
class Subject {
    struct Entry {
        Observer* observer;
        int priority;
    };
    vector<Entry> observers;

public:
    void attach(Observer* obs, int priority) {
        observers.push_back({obs, priority});
        sort(observers.begin(), observers.end(), [](auto& a, auto& b) {
            return a.priority > b.priority;  // Higher first
        });
    }
};

// What does this implement?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Priority-based notification order - high priority observers notified first

**Explanation:** Observers stored with priorities, sorted on each attach. During notification, high-priority observers run before low-priority ones.

**Use case:** Validators run before processors, processors before loggers

**Key Concept:** #priority #notification_order

</details>

---

#### Q10
```cpp
class Signal {
    vector<function<void()>> slots;
public:
    int connect(function<void()> slot) {
        int id = nextId++;
        slots.push_back(slot);
        return id;
    }

    void emit() {
        for (auto& slot : slots) {
            slot();
        }
    }
};

// How is this different from traditional Observer?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Signal/Slot uses std::function callbacks instead of Observer interface

**Explanation:** Traditional Observer: implement interface. Signal/Slot: provide any callable (lambda, function, functor). More flexible, less boilerplate.

**Trade-off:** Type erasure overhead vs interface implementation

**Key Concept:** #signal_slot #std_function

</details>

---

#### Q11
```cpp
class Subject {
    mutex mtx;
    vector<Observer*> observers;
public:
    void notify() {
        lock_guard lock(mtx);
        for (auto* obs : observers) {
            obs->update();  // ❌ Holding lock during callback
        }
    }
};

class Observer {
    Subject* subject;
public:
    void update() override {
        subject->attach(new AnotherObserver());  // ❌ Tries to acquire mtx
    }
};

// What problem occurs here?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Deadlock - subject holds mutex while calling observer that tries to acquire same mutex

**Explanation:** Subject locks mutex, calls observer, observer calls attach() which tries to lock same mutex -> deadlock.

**Fix:** Release lock before invoking callbacks (copy observers, release lock, notify)

**Key Concept:** #deadlock #reentrancy

</details>

---

#### Q12
```cpp
class AsyncSubject {
    queue<Event> eventQueue;
    thread workerThread;

public:
    void publish(Event event) {
        eventQueue.push(event);  // Queue event
    }

    void processEvents() {
        while (true) {
            if (!eventQueue.empty()) {
                Event e = eventQueue.front();
                eventQueue.pop();
                notify(e);
            }
        }
    }
};

// What are the benefits of asynchronous notification?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Non-blocking publish, caller doesn't wait for observer processing

**Explanation:** Events queued and processed by background thread. Caller returns immediately. Good for slow observers or high-frequency updates.

**Trade-off:** Complexity (threading) vs responsiveness

**Key Concept:** #asynchronous #event_queue

</details>

---

#### Q13
```cpp
class Observer {
public:
    virtual void update(const SensorData& data) = 0;
    virtual bool interestedIn(SensorType type) const = 0;
};

class Subject {
public:
    void notify(const SensorData& data) {
        for (auto& obs : observers) {
            if (obs->interestedIn(data.type)) {
                obs->update(data);
            }
        }
    }
};

// What optimization does interestedIn() provide?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Event filtering - only notify observers interested in specific event types

**Explanation:** Instead of notifying all observers, subject checks interest first. Reduces unnecessary notifications and processing.

**Use case:** Temperature observers ignore pressure events

**Key Concept:** #filtering #selective_notification

</details>

---

#### Q14
```cpp
class Subject {
    vector<Observer*> observers;
public:
    void notify() {
        for (size_t i = 0; i < observers.size(); ++i) {
            observers[i]->update();

            // ❌ Observer might remove itself, invalidating indices
        }
    }
};

// What's wrong with this notification approach?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Index-based iteration fails when observer removes itself, skipping next observer

**Explanation:** If observer at index i removes itself, element at i+1 shifts to index i. Loop increments i, skipping shifted element.

**Fix:** Iterate backwards, use iterators with copy, or use weak_ptr

**Key Concept:** #iterator_invalidation #index_skipping

</details>

---

#### Q15
```cpp
class Observer {
    unique_ptr<Connection> connection;
public:
    Observer(Subject& subject) {
        connection = make_unique<Connection>(subject, this);
    }

    ~Observer() {
        // Connection destructor auto-detaches
    }
};

class Connection {
    Subject& subject;
    Observer* observer;
public:
    ~Connection() {
        subject.detach(observer);
    }
};

// What pattern does Connection implement?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** RAII connection handle - automatic detachment on destruction

**Explanation:** Connection object manages observer lifetime. When destroyed (observer destroyed or connection reset), automatically detaches.

**Benefit:** No manual detach needed, exception-safe

**Key Concept:** #raii #auto_disconnect

</details>

---

#### Q16
```cpp
class Subject {
public:
    Signal<double> temperatureChanged;
    Signal<double> pressureChanged;
    Signal<double> humidityChanged;

    void setTemperature(double t) {
        temperature = t;
        temperatureChanged(t);  // Emit specific signal
    }
};

// How is this different from single notify() method?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Multiple signals allow fine-grained subscription to specific events

**Explanation:** Instead of one notify() for all changes, separate signals for each property. Observers subscribe only to signals they care about.

**Benefit:** More selective, better performance (fewer unnecessary notifications)

**Key Concept:** #multiple_signals #fine_grained_subscription

</details>

---

#### Q17
```cpp
class Subject {
    vector<weak_ptr<Observer>> observers;
    int notificationLevel = 0;  // Recursion depth

public:
    void notify() {
        if (notificationLevel > 3) {
            cerr << "Warning: Deep notification recursion!\n";
            return;  // Prevent infinite loop
        }

        notificationLevel++;
        // ... notify observers ...
        notificationLevel--;
    }
};

// What does notificationLevel track?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Recursion depth - detects and prevents infinite notification loops

**Explanation:** If observer modifies subject, causing re-notification, notificationLevel increases. Limit prevents stack overflow from infinite recursion.

**Alternative:** Boolean flag for simple recursion guard

**Key Concept:** #recursion_guard #infinite_loop_prevention

</details>

---

#### Q18
```cpp
class Subject {
public:
    void notify() {
        // Phase 1: Validators
        for (auto& obs : validatorObservers) {
            obs->update();
        }

        // Phase 2: Processors
        for (auto& obs : processorObservers) {
            obs->update();
        }

        // Phase 3: Loggers
        for (auto& obs : loggerObservers) {
            obs->update();
        }
    }
};

// What pattern does multi-phase notification implement?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Ordered notification with observer dependencies

**Explanation:** Some observers depend on others executing first (validators before processors). Multi-phase ensures correct execution order.

**Alternative:** Priority-based single list

**Key Concept:** #ordered_notification #dependencies

</details>

---

#### Q19
```cpp
class Observer {
    bool oneTime = false;
public:
    void update() override {
        processUpdate();

        if (oneTime) {
            requestRemoval();  // Mark for removal
        }
    }

    void setOneTime(bool ot) { oneTime = ot; }
};

// What is a one-time observer useful for?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Auto-unsubscribe after first notification (event completion, futures, async callbacks)

**Explanation:** One-time observers useful for: waiting for single event, completion handlers, promise/future patterns.

**Implementation:** Observer marks itself during update, subject removes marked observers after iteration

**Key Concept:** #one_time_observer #auto_detach

</details>

---

#### Q20
```cpp
class Subject {
    vector<Observer*> observers;
public:
    void notify() {
        try {
            for (auto* obs : observers) {
                obs->update();
            }
        } catch (...) {
            // ❌ Catches all exceptions, logs nothing
        }
    }
};

// What's the problem with this exception handling?
```

<details>
<summary><b>Show Answer</b></summary>

**Answer:** Catches first exception and silences it, remaining observers not notified

**Explanation:** Catch-all in outer scope stops at first exception. Better: catch inside loop to isolate failures, continue notifying.

**Best practice:** Catch in loop, log exception, continue. Optionally collect exceptions and rethrow aggregate.

**Key Concept:** #exception_handling #isolation

</details>

---

### QUICK_REFERENCE: Answer Key and Comparison Tables

#### Answer Key for Practice Questions

| Q# | Answer | Key Concept |
|----|--------|-------------|
| 1 | Deleting observer during notification causes use-after-free | #use_after_free |
| 2 | Circular reference with shared_ptr causes memory leak | #circular_reference |
| 3 | Not thread-safe - concurrent vector iteration is data race | #thread_safety |
| 4 | Infinite notification loop - observer modifies subject | #infinite_loop |
| 5 | Exception aborts loop, remaining observers not notified | #exception_safety |
| 6 | Push model has tighter coupling than pull model | #push_vs_pull |
| 7 | Expired weak_ptrs accumulate, need manual cleanup | #weak_ptr |
| 8 | Copy allows safe attach/detach during notification | #iterator_invalidation |
| 9 | Priority-based notification order implementation | #priority |
| 10 | Signal/Slot uses std::function instead of interface | #signal_slot |
| 11 | Deadlock - lock held during callback that reacquires | #deadlock |
| 12 | Asynchronous notification: non-blocking publish | #asynchronous |
| 13 | Event filtering reduces unnecessary notifications | #filtering |
| 14 | Index-based iteration fails when observers remove themselves | #index_skipping |
| 15 | RAII connection handle for automatic detachment | #raii |
| 16 | Multiple signals enable fine-grained subscription | #multiple_signals |
| 17 | Recursion depth tracking prevents infinite loops | #recursion_guard |
| 18 | Multi-phase notification ensures correct execution order | #ordered_notification |
| 19 | One-time observer for event completion patterns | #one_time_observer |
| 20 | Catch-all exception handling silences errors | #exception_handling |

#### Observer Pattern Implementation Comparison

| Implementation | Ownership | Cleanup | Thread-Safe | Overhead |
|---------------|-----------|---------|-------------|----------|
| **Raw pointers** | External | Manual detach | ❌ No | Minimal |
| **weak_ptr** | External | Automatic (expired check) | ⚠️ Partial | weak_ptr lock (~5ns) |
| **shared_ptr** | Shared | Refcount-based | ⚠️ Partial | Atomic refcount (~10%) |
| **Signal/Slot** | Internal | Connection ID | ❌ No | std::function overhead |
| **Thread-safe** | weak_ptr + mutex | Automatic + protected | ✅ Yes | Mutex + copy (~50ns) |

#### Push vs Pull Observer Models

| Aspect | Push Model | Pull Model |
|--------|-----------|-----------|
| **Data transfer** | Subject sends all data | Observer queries subject |
| **Coupling** | Higher (observers know data format) | Lower (observers use interface) |
| **Bandwidth** | Wastes bandwidth if observer doesn't need all data | Efficient - get only what needed |
| **Simplicity** | Simpler observer implementation | More complex - must know subject API |
| **Example** | `update(temp, humidity, pressure)` | `update(Subject* s) { s->getTemp(); }` |

#### Thread Safety Considerations

| Scenario | Thread-Safe? | Solution |
|----------|--------------|----------|
| **Raw pointer observers** | ❌ No | Don't use in multi-threaded code |
| **weak_ptr observers** | ⚠️ Partial | Atomic lock(), but list needs mutex |
| **Concurrent attach/detach** | ❌ No | Mutex protecting observer list |
| **Notification during attach** | ❌ No | Copy observers before notifying |
| **Observer modifies subject** | ❌ No | Recursion guard or deferred updates |
| **Callbacks holding locks** | ⚠️ Deadlock risk | Release lock before callbacks |

#### Observer Notification Performance

| Observers | Synchronous | Asynchronous (Queued) | Notes |
|-----------|-------------|----------------------|-------|
| **1** | ~10ns | ~100ns (queue overhead) | Virtual call + iteration |
| **10** | ~100ns | ~120ns | Linear scaling |
| **100** | ~1μs | ~1.2μs | Acceptable for moderate frequency |
| **1000** | ~10μs | ~12μs | High-frequency updates problematic |
| **10kHz updates** | 10μs * 10k = 100ms/sec | Queue buffering helps | Consider batching |

#### Memory Management Patterns

| Pattern | Lifetime | Cleanup | Use Case |
|---------|----------|---------|----------|
| **weak_ptr in subject** | External ownership | Automatic (expired) | Default choice, prevents leaks |
| **shared_ptr in subject** | Shared ownership | Refcount-based | ❌ Avoid - causes circular references |
| **Raw pointers** | Manual management | Manual detach required | ❌ Avoid - dangling pointer risk |
| **RAII connection** | Connection object | Auto-detach on destruction | Explicit lifetime control |
| **Scoped observer** | Scope-based | Stack unwinding | Temporary subscriptions |

#### Observer Pattern Use Cases in Autonomous Vehicles

| Component | Observer Type | Rationale |
|-----------|--------------|-----------|
| **Sensor fusion → subsystems** | Thread-safe weak_ptr | Multiple systems react to sensor data, concurrent access |
| **Collision detector → safety** | Priority-based | Emergency braking must run before logging |
| **UI updates (dashboard)** | Asynchronous | UI updates slow, shouldn't block perception |
| **Event logging** | Low-priority filtered | Only log specific events, run after critical systems |
| **Perception → path planner** | Synchronous push | Path planner needs immediate updates, data small |
| **Configuration → components** | Pull model | Components query only needed config, large config space |

#### Exception Safety Strategies

| Strategy | Syntax | Behavior | Use Case |
|----------|--------|----------|----------|
| **Catch in loop** | `try { obs->update(); } catch(...)` | Isolate failures, continue | Production systems (all observers execute) |
| **Catch outer** | `try { for(...) } catch(...)` | First exception stops all | ❌ Avoid - incomplete notification |
| **Collect exceptions** | Store in vector, rethrow | Notify all, then report failures | Testing, diagnostics |
| **No catch** | Let propagate | First exception aborts | ❌ Avoid in production |

#### Design Principles and Observer Pattern

| Principle | How Observer Supports It |
|-----------|------------------------|
| **Open/Closed** | Add new observers without modifying subject |
| **Single Responsibility** | Subject manages state, observers handle reactions |
| **Dependency Inversion** | Subject depends on Observer interface, not concrete classes |
| **Interface Segregation** | Observers implement minimal interface (update()) |
| **Liskov Substitution** | All observers usable interchangeably |

#### Observer vs Related Patterns

| Pattern | Observer | Publish-Subscribe | Mediator | Event Sourcing |
|---------|----------|------------------|----------|----------------|
| **Coupling** | Subject → Observer | Publisher ← Channel → Subscriber | Components ↔ Mediator | Events → Store → Handlers |
| **Knowledge** | Subject knows observers | No direct knowledge | Mediator knows all | Event stream |
| **Scope** | Single process | Distributed | Single process | Persistent events |
| **Use case** | MVC, real-time updates | Message queues, microservices | Complex UI interactions | Audit, replay, CQRS |

---
