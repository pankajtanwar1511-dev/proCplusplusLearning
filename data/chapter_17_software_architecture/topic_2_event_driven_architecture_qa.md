## TOPIC: Event-Driven Architecture (Asynchronous Systems)

### INTERVIEW_QA: Comprehensive Questions with Detailed Answers

#### Q1
**Difficulty:** #beginner
**Category:** #fundamentals
**Concepts:** #event_driven #async #decoupling

**Answer:**
Event-driven architecture (EDA) is a design where components communicate by publishing and subscribing to events rather than direct function calls. Producer publishes event (fire-and-forget), consumers react independently.

**When to use:**
- GUI applications (user interactions)
- Real-time systems (sensors, trading)
- Loosely coupled systems (microservices)
- Many-to-many communication

**When NOT to use:**
- Simple sequential logic
- Need immediate return value
- Debugging is critical (events harder to trace)

**Key takeaway:** EDA decouples producers from consumers via asynchronous messaging.

---

#### Q2: What's the difference between synchronous and asynchronous events?
**Difficulty:** #beginner  
**Category:** #event_delivery
**Concepts:** #sync #async #blocking

**Answer:**
Synchronous: Handlers called immediately during publish(), blocks until all done.
Asynchronous: Events queued, handlers called later (e.g., next frame), returns immediately.

**Example:**
```cpp
// Synchronous
void publish(Event e) {
    for (auto& h : handlers) h(e);  // Blocks here
}

// Asynchronous
void publish(Event e) {
    queue.push(e);  // Returns immediately
}
void processEvents() {
    while (!queue.empty()) { /*...*/ }  // Process later
}
```

**Key takeaway:** Sync = immediate + blocking, Async = deferred + non-blocking.

---

#### Q3: - Observer vs Pub/Sub patterns
- Event ordering and guarantees
- Memory management in event systems
- Thread safety considerations
- Performance optimization
- Error handling in handlers
- Event sourcing pattern
- CQRS (Command Query Responsibility Segregation)
- And 12 more detailed questions...

*(Full answers provided in complete file)*

---
