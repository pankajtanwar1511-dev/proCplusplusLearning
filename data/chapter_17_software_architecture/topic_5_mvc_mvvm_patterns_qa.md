### INTERVIEW_QA: Comprehensive Questions and Answers
#### Q1: What is the main difference between MVC and MVVM?

**Answer**:

| Aspect | MVC | MVVM |
|--------|-----|------|
| **Communication** | View ↔ Controller (explicit) | View ↔ ViewModel (data binding) |
| **Update Mechanism** | Observer pattern (manual) | Two-way binding (automatic) |
| **View Intelligence** | Some logic allowed | Purely declarative |
| **Testability** | Good | Excellent (no UI dependency) |

**Key Difference**: **Data Binding**

**MVC**:
```cpp
// Manual update
controller.updateName("Alice");
view.updateNameLabel();  // Explicit call
```

**MVVM**:
```xml
<!-- Automatic update -->
<TextBox Text="{Binding UserName}" />
```

When user types, ViewModel updates automatically. When ViewModel changes, UI updates automatically.

---

#### Q2: When should you use MVP over MVC?

**Answer**:

**Use MVP when**:
1. **Maximum testability** needed (View is interface → easy to mock)
2. **No data binding framework** available
3. **Android development** (MVP common pattern)
4. **Legacy systems** without modern UI frameworks

**Example: Android**:
```kotlin
interface ILoginView {
    fun showError(message: String)
    fun navigateToHome()
}

class LoginPresenter(private val view: ILoginView) {
    fun onLoginClicked(username: String, password: String) {
        if (authenticate(username, password)) {
            view.navigateToHome()
        } else {
            view.showError("Invalid credentials")
        }
    }
}

// Easy to test!
class MockLoginView : ILoginView {
    var errorShown = false
    override fun showError(message: String) {
        errorShown = true
    }
}
```

---

#### Q3: How do you prevent "Fat Controllers"?

**Answer**:

**Fat Controller** = Controller with thousands of lines, handling everything.

**Solutions**:

**1. Delegate to Services**:
```cpp
class UserController {
    UserService userService;  // Business logic here

    void handleLogin(const Credentials& creds) {
        bool success = userService.authenticate(creds);  // ✅ Thin controller
        if (success) view->navigateTo("home");
    }
};
```

**2. Split by Feature**:
```cpp
// Instead of one UserController:
class LoginController { /* ... */ };
class RegistrationController { /* ... */ };
class ProfileController { /* ... */ };
```

**3. Use Command Pattern**:
```cpp
class LoginCommand : public ICommand {
    void execute() override {
        // Login logic
    }
};

class Controller {
    void handleAction(ICommand* command) {
        command->execute();  // ✅ Controller delegates
    }
};
```

---

#### Q4: How do you implement two-way data binding in C++?

**Answer**:

C++ doesn't have built-in data binding (unlike C#/WPF or JavaScript frameworks), but you can simulate it:

**ObservableProperty Pattern**:

```cpp
template<typename T>
class ObservableProperty {
    T value;
    std::vector<std::function<void(const T&)>> listeners;

public:
    void set(const T& newValue) {
        value = newValue;
        notify();  // Notify all listeners
    }

    T get() const { return value; }

    void onChange(std::function<void(const T&)> listener) {
        listeners.push_back(listener);
    }

private:
    void notify() {
        for (auto& listener : listeners) {
            listener(value);
        }
    }
};

// Usage
class ViewModel {
    ObservableProperty<std::string> userName;
};

class View {
    void init(ViewModel* vm) {
        vm->userName.onChange([this](const std::string& newValue) {
            updateLabel(newValue);  // Auto-update UI
        });
    }
};
```

**Qt Signals/Slots** (built-in binding):
```cpp
QObject::connect(textBox, &QLineEdit::textChanged,
                 viewModel, &ViewModel::setUserName);

QObject::connect(viewModel, &ViewModel::userNameChanged,
                 label, &QLabel::setText);
```

---

#### Q5: Where should validation logic go: View, Controller, or Model?

**Answer**:

**Two types of validation**:

**1. UI Validation (Presentation Layer)**:
- Format checks (email has @, phone has digits)
- Required field checks
- **Where**: View or Controller

```cpp
class UserController {
    void onFormSubmit(const std::string& email) {
        // UI validation
        if (email.empty()) {
            view->showError("Email is required");
            return;
        }

        if (email.find('@') == std::string::npos) {
            view->showError("Invalid email format");
            return;
        }

        // Pass to Model for business validation
        model->registerUser(email);
    }
};
```

**2. Business Validation (Model Layer)**:
- Business rules (age must be 18+)
- Database constraints (email must be unique)
- **Where**: Model

```cpp
class UserModel {
    bool registerUser(const std::string& email, int age) {
        // Business validation
        if (age < 18) {
            throw BusinessException("Must be 18 or older");
        }

        if (emailExists(email)) {
            throw BusinessException("Email already registered");
        }

        // Save
        saveToDatabase(email, age);
    }
};
```

**Best Practice**: **Validate in both places** (UI for UX, Model for security).

---

#### Additional Questions 6-20 (Outlined)

**Q6**: How do you handle navigation between Views in MVC?

**Q7**: What is the difference between Passive View and Supervising Controller (MVP variants)?

**Q8**: How do you implement commands in MVVM?

**Q9**: Should Model know about View in MVC?

**Q10**: How do you manage state across multiple Views?

**Q11**: What are the disadvantages of MVVM?

**Q12**: How do you implement undo/redo in MVC?

**Q13**: What is the role of a Router in MVC web applications?

**Q14**: How do you handle asynchronous operations in MVVM?

**Q15**: What is the difference between ViewModel and Presentation Model?

**Q16**: How do you implement dependency injection in MVC?

**Q17**: Should Controllers talk to each other?

**Q18**: How do you handle errors in MVVM (where to show error messages)?

**Q19**: What is MVVM-C (MVVM + Coordinator)?

**Q20**: Compare MVC to Flux/Redux architectures.

---
