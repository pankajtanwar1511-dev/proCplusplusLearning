## TOPIC: Strategy Pattern (Policy-Based Design)

### INTERVIEW_QA: Comprehensive Questions with Detailed Answers

#### Q1: What is the Strategy pattern and when should you use it?
**Difficulty:** #beginner
**Category:** #design_pattern
**Concepts:** #strategy #behavioral_pattern #composition

**Answer:**
Strategy pattern defines family of algorithms, encapsulates each one, and makes them interchangeable. Strategy lets algorithm vary independently from clients that use it.

**Code example:**
```cpp
class PathPlanner {
    unique_ptr<PlanningStrategy> strategy;
public:
    void setStrategy(unique_ptr<PlanningStrategy> s) { strategy = move(s); }
    Path plan() { return strategy->computePath(); }
};
```

**Explanation:**
Use Strategy when: (1) multiple algorithms exist for same task, (2) algorithm selection varies at runtime, (3) want to eliminate conditional statements, (4) algorithm logic should be isolated and reusable. Strategy promotes Open/Closed Principle - add new algorithms without modifying context.

**Key takeaway:** Strategy encapsulates algorithms behind interface, enabling runtime algorithm swapping.

---

(Interview questions Q2-Q20 continue with same format covering: Strategy vs State, Strategy vs Template Method, runtime vs compile-time, function pointers vs virtual, stateful strategies, thread safety, performance, testing, etc.)
