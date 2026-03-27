# Topic 5: MVC / MVVM / MVP Patterns (GUI Architecture)

### THEORY_SECTION: Core Concepts and Foundations
#### What are MVC, MVVM, and MVP?

These are **architectural patterns** specifically designed for **Graphical User Interface (GUI) applications**. They all aim to **separate UI from business logic**, but do it in slightly different ways.

**Core Idea**: Don't mix UI code with business logic. Separate "what to display" from "how to display it".

---

#### Simple Explanation: Restaurant Analogy

Imagine a restaurant:

| Component | Role | Restaurant Analogy |
|-----------|------|-------------------|
| **Model** | Data + Business Logic | **Kitchen** (prepares food, knows recipes) |
| **View** | UI Display | **Menu** (shows options to customer) |
| **Controller/ViewModel/Presenter** | Coordinator | **Waiter** (takes orders, brings food) |

**Flow**:
1. Customer looks at **Menu** (View)
2. Customer tells **Waiter** what they want (Controller receives input)
3. Waiter tells **Kitchen** to cook (Controller updates Model)
4. Kitchen prepares food (Model processes data)
5. Waiter brings food to customer (Controller updates View)

**Key Insight**: Customer (user) never talks directly to Kitchen (Model). Waiter (Controller) coordinates everything.

---

## MVC (Model-View-Controller)

#### MVC Structure

```
┌──────────────┐
│     View     │  ← Displays UI (buttons, text, etc.)
│  (UI Layer)  │
└──────────────┘
       ↕ (user input / update)
┌──────────────┐
│  Controller  │  ← Handles user actions, coordinates
│  (Mediator)  │
└──────────────┘
       ↕ (read/write)
┌──────────────┐
│    Model     │  ← Data + Business Logic
│ (Data Layer) │
└──────────────┘
```

#### MVC Components

#### 1. Model (Data + Logic)

**What it does**:
- Stores **data** (e.g., user info, product list)
- Contains **business logic** (e.g., validation, calculations)
- **Notifies** observers when data changes

**What it does NOT do**:
- ❌ Know about UI (buttons, labels, etc.)
- ❌ Handle user input

**Example**:
```cpp
class UserModel {
    std::string name;
    std::string email;
    int age;

    std::vector<std::function<void()>> observers;  // Observer pattern

public:
    void setName(const std::string& newName) {
        name = newName;
        notifyObservers();  // Notify View that data changed
    }

    std::string getName() const { return name; }

    void registerObserver(std::function<void()> observer) {
        observers.push_back(observer);
    }

private:
    void notifyObservers() {
        for (auto& observer : observers) {
            observer();
        }
    }
};
```

---

#### 2. View (UI Display)

**What it does**:
- **Displays** data to user (labels, text fields, buttons)
- **Sends** user actions to Controller (button clicks, form submissions)
- **Updates** itself when Model changes (via Observer pattern)

**What it does NOT do**:
- ❌ Business logic
- ❌ Directly modify Model

**Example**:
```cpp
class UserView {
    UserModel* model;

    // UI Elements (simplified)
    std::string nameLabel;
    std::string emailLabel;

public:
    UserView(UserModel* m) : model(m) {
        // Register as observer
        model->registerObserver([this]() {
            this->updateDisplay();
        });

        updateDisplay();
    }

    void updateDisplay() {
        nameLabel = "Name: " + model->getName();
        emailLabel = "Email: " + model->getEmail();

        std::cout << nameLabel << "\n";
        std::cout << emailLabel << "\n";
    }

    void onButtonClick() {
        // User clicked button → send to Controller
        // (In real app, this would be connected to controller)
    }
};
```

---

#### 3. Controller (Coordinator)

**What it does**:
- **Handles** user input from View
- **Updates** Model based on input
- **Selects** which View to show

**What it does NOT do**:
- ❌ Business logic (that's in Model)
- ❌ UI rendering (that's in View)

**Example**:
```cpp
class UserController {
    UserModel* model;
    UserView* view;

public:
    UserController(UserModel* m, UserView* v) : model(m), view(v) {}

    void updateUserName(const std::string& newName) {
        // Validation (could also be in Model)
        if (newName.empty()) {
            std::cerr << "Error: Name cannot be empty\n";
            return;
        }

        // Update Model
        model->setName(newName);

        // View automatically updates via Observer pattern!
    }

    void handleFormSubmission(const std::string& name, const std::string& email) {
        // Process user input
        model->setName(name);
        model->setEmail(email);

        // View updates automatically
    }
};
```

---

#### MVC Flow

```
1. User interacts with View (clicks button)
        ↓
2. View notifies Controller ("button clicked!")
        ↓
3. Controller updates Model (calls model.setName())
        ↓
4. Model changes data, notifies observers
        ↓
5. View receives notification, updates display
```

**Example Flow: User Profile Update**

```
User types "Alice" in name field
     ↓
View detects input change
     ↓
View calls controller.updateUserName("Alice")
     ↓
Controller validates input
     ↓
Controller calls model.setName("Alice")
     ↓
Model updates name, calls notifyObservers()
     ↓
View (observer) receives notification
     ↓
View calls updateDisplay()
     ↓
Label now shows "Name: Alice"
```

---

#### MVC Benefits

| Benefit | Explanation |
|---------|-------------|
| **Separation of Concerns** | UI separate from logic |
| **Testability** | Can test Model without UI |
| **Multiple Views** | One Model, many Views (desktop + mobile) |
| **Reusability** | Model can be reused across apps |
| **Parallel Development** | Frontend/backend teams work independently |

---

#### MVC Real-World Examples

**Web Frameworks**:
- **Django** (Python): Model = Django models, View = templates, Controller = views.py
- **Ruby on Rails**: Model = ActiveRecord, View = ERB templates, Controller = controllers
- **Spring MVC** (Java): @Controller, @Service, Thymeleaf templates

**Desktop Applications**:
- **Cocoa (macOS/iOS)**: UIViewController, UIView, Data models
- **Qt**: QAbstractItemModel, QWidget, QObject signals/slots

---

## MVVM (Model-View-ViewModel)

#### What's Different from MVC?

**MVC**: Controller sits between View and Model
**MVVM**: **ViewModel** sits between View and Model, with **two-way data binding**

```
MVC:
View ↔ Controller ↔ Model

MVVM:
View ↔ ViewModel ↔ Model
      (data binding)
```

#### MVVM Structure

```
┌──────────────┐
│     View     │  ← UI (XAML, HTML, etc.)
│   (Passive)  │
└──────────────┘
       ↕ (two-way data binding)
┌──────────────┐
│  ViewModel   │  ← Adapter for View
│ (View Logic) │     Exposes data + commands
└──────────────┘
       ↕ (read/write)
┌──────────────┐
│    Model     │  ← Data + Business Logic
│ (Data Layer) │
└──────────────┘
```

#### Key Concept: Data Binding

**Data Binding**: Automatic synchronization between View and ViewModel.

```
XAML (View):
<TextBox Text="{Binding UserName}" />
          ↕ (automatic sync)
C++ (ViewModel):
std::string userName;  // Changes here auto-update UI!
```

**When user types in TextBox**:
- UI updates ViewModel automatically (no explicit code!)

**When code changes `userName`**:
- UI updates automatically (no explicit code!)

---

#### MVVM Components

#### 1. Model (Same as MVC)

Data + business logic. No knowledge of UI.

```cpp
class UserModel {
    std::string name;
    std::string email;

public:
    void save() {
        // Save to database
    }
};
```

---

#### 2. ViewModel (Adapter for View)

**What it does**:
- **Exposes** data for View to bind to
- **Exposes** commands for View to call (button clicks)
- **Transforms** Model data for display (e.g., formatting dates)
- **No direct reference to View** (loose coupling)

**What it does NOT do**:
- ❌ UI-specific code (no buttons, colors, etc.)
- ❌ Business logic (that's in Model)

**Example**:
```cpp
class UserViewModel {
    UserModel* model;

    // Observable properties (with change notification)
    ObservableProperty<std::string> userName;
    ObservableProperty<std::string> userEmail;
    ObservableProperty<bool> isFormValid;

public:
    UserViewModel(UserModel* m) : model(m) {
        // Initialize from Model
        userName.set(model->getName());
        userEmail.set(model->getEmail());

        // Watch for changes
        userName.onChange([this]() {
            validateForm();
        });
    }

    // Property getters (for View binding)
    ObservableProperty<std::string>& getUserName() { return userName; }
    ObservableProperty<std::string>& getUserEmail() { return userEmail; }
    ObservableProperty<bool>& getIsFormValid() { return isFormValid; }

    // Commands (for button clicks)
    void saveCommand() {
        // Update Model
        model->setName(userName.get());
        model->setEmail(userEmail.get());
        model->save();
    }

private:
    void validateForm() {
        bool valid = !userName.get().empty() && userEmail.get().find('@') != std::string::npos;
        isFormValid.set(valid);
    }
};
```

---

#### 3. View (Declarative UI)

**What it does**:
- **Binds** to ViewModel properties
- **Triggers** ViewModel commands on user actions
- **Purely declarative** (minimal code-behind)

**Example (XAML-style)**:
```xml
<Window>
    <StackPanel>
        <!-- Two-way binding -->
        <TextBox Text="{Binding UserName, Mode=TwoWay}" />
        <TextBox Text="{Binding UserEmail, Mode=TwoWay}" />

        <!-- Button command binding -->
        <Button Command="{Binding SaveCommand}"
                IsEnabled="{Binding IsFormValid}">
            Save
        </Button>
    </StackPanel>
</Window>
```

**Key**: View has ZERO logic. Everything is bindings!

---

#### MVVM Flow

```
1. User types in TextBox
        ↓
2. Data binding updates ViewModel.userName automatically
        ↓
3. ViewModel.userName.onChange() triggers validation
        ↓
4. ViewModel.isFormValid updates
        ↓
5. Data binding updates Button.IsEnabled automatically
```

**No explicit UI update code!** Everything is automatic via bindings.

---

#### MVVM Benefits

| Benefit | Explanation |
|---------|-------------|
| **Less boilerplate** | No manual UI update code |
| **Testability** | ViewModel has NO UI dependency |
| **Designer-friendly** | UI designers work on View, devs on ViewModel |
| **Reactive** | UI auto-updates when data changes |
| **Reusability** | Same ViewModel for different Views |

---

#### MVVM Real-World Examples

**Desktop**:
- **WPF** (Windows Presentation Foundation) - C#
- **UWP** (Universal Windows Platform) - C#

**Web**:
- **Angular** - TypeScript (two-way binding with `[(ngModel)]`)
- **Vue.js** - JavaScript (two-way binding with `v-model`)
- **Knockout.js** - JavaScript

**Mobile**:
- **SwiftUI** (iOS) - `@State`, `@Binding`
- **Jetpack Compose** (Android) - Kotlin

---

## MVP (Model-View-Presenter)

#### What's Different from MVC and MVVM?

**MVC**: View talks to Controller, Controller talks to Model
**MVVM**: View binds to ViewModel (automatic)
**MVP**: View is **completely passive**, Presenter controls **everything**

```
MVP:
View ← Presenter ← Model
     (one-way)
```

#### MVP Structure

```
┌──────────────┐
│     View     │  ← Completely passive (interface)
│  (Interface) │     No logic, just displays what Presenter tells it
└──────────────┘
       ↑ (presenter calls view methods)
┌──────────────┐
│   Presenter  │  ← All logic here
│ (Controller) │     Handles user input, updates View
└──────────────┘
       ↕
┌──────────────┐
│    Model     │  ← Data + Business Logic
│ (Data Layer) │
└──────────────┘
```

#### MVP Components

#### 1. View (Interface)

**Key**: View is an **interface**, not a concrete class.

```cpp
class IUserView {
public:
    virtual void displayName(const std::string& name) = 0;
    virtual void displayEmail(const std::string& email) = 0;
    virtual void showError(const std::string& message) = 0;
    virtual ~IUserView() = default;
};
```

#### 2. Presenter (All Logic)

**What it does**:
- Holds reference to **View interface** (not concrete View)
- Handles **all user input** (View just forwards to Presenter)
- Updates **View explicitly** (calls view methods)

```cpp
class UserPresenter {
    IUserView* view;
    UserModel* model;

public:
    UserPresenter(IUserView* v, UserModel* m) : view(v), model(m) {}

    void onSaveButtonClicked(const std::string& name, const std::string& email) {
        // Validation
        if (name.empty()) {
            view->showError("Name cannot be empty");
            return;
        }

        // Update Model
        model->setName(name);
        model->setEmail(email);
        model->save();

        // Update View
        view->displayName(model->getName());
        view->displayEmail(model->getEmail());
    }

    void loadUser(int userId) {
        model->load(userId);
        view->displayName(model->getName());
        view->displayEmail(model->getEmail());
    }
};
```

#### 3. Model (Same as MVC/MVVM)

---

#### MVP Flow

```
1. User clicks button
        ↓
2. View calls presenter.onSaveButtonClicked()
        ↓
3. Presenter validates input
        ↓
4. Presenter updates Model
        ↓
5. Presenter explicitly calls view.displayName(), view.displayEmail()
        ↓
6. View displays data
```

**Key Difference**: Presenter **explicitly** calls View methods. No observers, no binding.

---

#### MVP Benefits

| Benefit | Explanation |
|---------|-------------|
| **Testability** | View is interface → easy to mock |
| **Clear control flow** | Presenter explicitly updates View |
| **No UI framework dependency** | Presenter doesn't know about UI framework |

---

## MVC vs MVVM vs MVP Comparison

| Aspect | MVC | MVVM | MVP |
|--------|-----|------|-----|
| **View-Logic Communication** | View ↔ Controller | View ↔ ViewModel (binding) | View → Presenter (one-way) |
| **View Intelligence** | Some logic | Declarative (bindings) | Completely passive (interface) |
| **Update Mechanism** | Observer pattern | Two-way data binding | Explicit method calls |
| **Testability** | Good | Excellent | Excellent |
| **Boilerplate** | Medium | Low (bindings) | High (explicit calls) |
| **Best For** | Web apps, traditional desktop | Modern frameworks (WPF, Angular) | Android apps, legacy systems |
| **View Dependency** | View knows Model (optional) | View knows ViewModel | View only knows interface |

---

#### When to Use Each Pattern

| Pattern | Use When |
|---------|----------|
| **MVC** | - Web applications (Django, Rails)<br>- Traditional desktop apps<br>- Simple UI with clear flow |
| **MVVM** | - Modern UI frameworks (WPF, SwiftUI, Vue)<br>- Need two-way data binding<br>- Complex reactive UIs |
| **MVP** | - Android applications<br>- Need maximum testability<br>- Legacy systems without binding support |

---

### EDGE_CASES: Tricky Scenarios and Deep Internals
#### Edge Case 1: Fat Controllers / ViewModels

**Problem**: Controller/ViewModel becomes a "God Class" with thousands of lines.

**Naive Code**:
```cpp
class UserController {
    void handleLogin() { /* 200 lines */ }
    void handleRegistration() { /* 300 lines */ }
    void handlePasswordReset() { /* 150 lines */ }
    void handleProfileUpdate() { /* 200 lines */ }
    void handleEmailVerification() { /* 100 lines */ }
    // ... 50 more methods!
};
```

**Why It's Bad**:
- Hard to maintain (too much in one place)
- Hard to test (need to test everything)
- Poor cohesion (unrelated features mixed)

**Solution 1: Split by Feature**

```cpp
// One controller per feature
class LoginController { /* ... */ };
class RegistrationController { /* ... */ };
class ProfileController { /* ... */ };
```

**Solution 2: Use Services**

```cpp
class UserController {
    LoginService loginService;
    RegistrationService registrationService;

    void handleLogin(const Credentials& creds) {
        // Controller is thin, delegates to service
        bool success = loginService.authenticate(creds);
        if (success) {
            view->navigateToHome();
        }
    }
};
```

**Lesson**: Keep controllers **thin**. Delegate to services.

---

#### Edge Case 2: View-Model Coupling

**Problem**: View directly accesses Model, bypassing Controller/ViewModel.

**Naive Code (MVC)**:
```cpp
class UserView {
    UserModel* model;  // ← Direct reference!

    void onButtonClick() {
        // ❌ BAD: View directly modifies Model
        model->setName("Alice");
    }
};
```

**Why It's Bad**:
- Tight coupling (View depends on Model)
- Hard to test (need real Model)
- Validation bypassed (no Controller involved)

**Solution: View Only Talks to Controller**

```cpp
class UserView {
    UserController* controller;  // ← Only knows Controller

    void onButtonClick() {
        // ✅ GOOD: Go through Controller
        controller->updateUserName("Alice");
    }
};
```

**Lesson**: **View should never directly access Model.**

---

#### Edge Case 3: Data Binding Performance (MVVM)

**Problem**: Binding to large lists or complex computations causes lag.

**Naive Code**:
```cpp
class ProductListViewModel {
    ObservableCollection<Product> products;  // 10,000 items!

    void filterProducts(const std::string& query) {
        // ❌ BAD: Expensive operation on every keystroke!
        for (auto& product : products) {
            product.isVisible = product.name.find(query) != std::string::npos;
        }
        notifyPropertyChanged("Products");  // Triggers full UI re-render!
    }
};
```

**Why It's Bad**:
- **Performance**: Filtering 10,000 items on every keystroke
- **UI freezes**: Blocking main thread

**Solution 1: Debouncing (Delay Updates)**

```cpp
class ProductListViewModel {
    Timer debounceTimer;

    void onSearchTextChanged(const std::string& query) {
        // Cancel previous timer
        debounceTimer.cancel();

        // Start new timer: execute after 300ms of no typing
        debounceTimer.start(300ms, [this, query]() {
            filterProducts(query);
        });
    }
};
```

**Solution 2: Virtualization (Only Render Visible)**

```cpp
// Only bind visible items (e.g., 20 items on screen)
// Scroll → load more items dynamically
ObservableCollection<Product> visibleProducts;  // Only 20 items

void onScroll(int scrollPosition) {
    int startIndex = scrollPosition / itemHeight;
    visibleProducts = allProducts.subList(startIndex, startIndex + 20);
}
```

**Solution 3: Background Processing**

```cpp
void filterProducts(const std::string& query) {
    // Run filtering on background thread
    std::async([this, query]() {
        auto filtered = expensiveFilter(query);

        // Update UI on main thread
        runOnUIThread([this, filtered]() {
            products = filtered;
            notifyPropertyChanged("Products");
        });
    });
}
```

**Lesson**: **Optimize bindings** for large data sets. Use debouncing, virtualization, or background threads.

---

#### Edge Case 4: Testing Challenges (Tight View Coupling)

**Problem**: Can't test Controller without real View.

**Naive Code**:
```cpp
class UserController {
    ConcreteUserView* view;  // ← Concrete dependency!

public:
    void updateUser(const std::string& name) {
        model->setName(name);
        view->updateNameLabel();  // ← Requires real UI!
    }
};

// Test
void testUpdateUser() {
    ConcreteUserView view;  // ❌ Need real UI framework!
    UserController controller(&view);
    controller.updateUser("Alice");
}
```

**Why It's Bad**:
- Can't test without UI framework
- Slow tests (need to create UI components)

**Solution: Depend on Interface (MVP Style)**

```cpp
class IUserView {
public:
    virtual void updateNameLabel(const std::string& name) = 0;
    virtual ~IUserView() = default;
};

class UserController {
    IUserView* view;  // ← Interface dependency

public:
    void updateUser(const std::string& name) {
        model->setName(name);
        view->updateNameLabel(name);
    }
};

// Mock View
class MockUserView : public IUserView {
public:
    std::string lastNameUpdate;

    void updateNameLabel(const std::string& name) override {
        lastNameUpdate = name;  // Record for verification
    }
};

// Test
void testUpdateUser() {
    MockUserView mockView;
    UserController controller(&mockView);

    controller.updateUser("Alice");

    assert(mockView.lastNameUpdate == "Alice");  // ✅ No real UI needed!
}
```

**Lesson**: **Use interfaces** for testability. Mock View in tests.

---

#### Edge Case 5: State Management Complexity

**Problem**: Multiple Views need to share state. Where to store it?

**Naive Code**:
```cpp
// ❌ BAD: State duplicated across controllers
class ProductListController {
    std::vector<Product> selectedProducts;
};

class CheckoutController {
    std::vector<Product> selectedProducts;  // ← Duplicate!
};

// How to keep these in sync?
```

**Why It's Bad**:
- State duplication
- Synchronization bugs (one updates, other doesn't)

**Solution 1: Shared Model**

```cpp
class ShoppingCartModel {  // Singleton or shared instance
    std::vector<Product> selectedProducts;
    std::vector<std::function<void()>> observers;

public:
    void addProduct(const Product& product) {
        selectedProducts.push_back(product);
        notifyObservers();
    }

    const std::vector<Product>& getProducts() const {
        return selectedProducts;
    }

    void registerObserver(std::function<void()> observer) {
        observers.push_back(observer);
    }

private:
    void notifyObservers() {
        for (auto& obs : observers) obs();
    }
};

// Both controllers reference same Model
class ProductListController {
    ShoppingCartModel* cartModel;  // Shared

    void onProductSelected(const Product& product) {
        cartModel->addProduct(product);
    }
};

class CheckoutController {
    ShoppingCartModel* cartModel;  // Same instance

    void displayCart() {
        for (const Product& p : cartModel->getProducts()) {
            // Display
        }
    }
};
```

**Solution 2: Event Bus (Decoupled)**

```cpp
// Controllers don't directly share state
class ProductListController {
    void onProductSelected(const Product& product) {
        eventBus.publish(ProductSelectedEvent{product});
    }
};

class CheckoutController {
    void init() {
        eventBus.subscribe("ProductSelected", [this](const Event& e) {
            selectedProducts.push_back(e.product);
            updateDisplay();
        });
    }
};
```

**Lesson**: **Centralize shared state** in a Model or use Event Bus for communication.

---

#### Edge Case 6: Navigation Logic (Where Does It Go?)

**Problem**: Who is responsible for navigating between Views?

**Naive Code**:
```cpp
// ❌ Option 1: View navigates (bad - tight coupling)
class LoginView {
    void onLoginSuccess() {
        HomeView* homeView = new HomeView();
        homeView->show();  // ← View creates another View!
    }
};

// ❌ Option 2: Model navigates (bad - Model shouldn't know about UI)
class UserModel {
    void login() {
        if (authenticated) {
            HomeView* homeView = new HomeView();  // ← Model knows about View!
        }
    }
};
```

**Why It's Bad**:
- **Option 1**: View coupled to other Views
- **Option 2**: Model coupled to UI

**Solution 1: Controller Handles Navigation**

```cpp
class LoginController {
    LoginView* loginView;
    Navigator* navigator;

public:
    void onLoginButtonClicked(const Credentials& creds) {
        bool success = model->authenticate(creds);

        if (success) {
            navigator->navigateTo("home");  // ✅ Controller decides
        } else {
            loginView->showError("Invalid credentials");
        }
    }
};

class Navigator {
public:
    void navigateTo(const std::string& destination) {
        if (destination == "home") {
            homeController->show();
        } else if (destination == "profile") {
            profileController->show();
        }
    }
};
```

**Solution 2: ViewModel with Navigation Service**

```cpp
class LoginViewModel {
    INavigationService* navigationService;

public:
    void loginCommand(const Credentials& creds) {
        bool success = model->authenticate(creds);

        if (success) {
            navigationService->navigateTo("home");  // ✅ ViewModel uses service
        }
    }
};
```

**Lesson**: **Controller/ViewModel handles navigation**, using a Navigation service.

---

### CODE_EXAMPLES: Practical Demonstrations
#### Example 1: Simple MVC (User Profile)

**Goal**: Implement MVC pattern for displaying and editing user profile.

```cpp
#include <iostream>
#include <string>
#include <vector>
#include <functional>

// ═══════════════════════════════════════════════════════════════
//  MODEL
// ═══════════════════════════════════════════════════════════════

class UserModel {
    std::string name;
    std::string email;
    int age;

    std::vector<std::function<void()>> observers;

public:
    UserModel(const std::string& n, const std::string& e, int a)
        : name(n), email(e), age(a) {}

    // Getters
    std::string getName() const { return name; }
    std::string getEmail() const { return email; }
    int getAge() const { return age; }

    // Setters (trigger notification)
    void setName(const std::string& n) {
        name = n;
        notifyObservers();
    }

    void setEmail(const std::string& e) {
        email = e;
        notifyObservers();
    }

    void setAge(int a) {
        age = a;
        notifyObservers();
    }

    // Observer pattern
    void registerObserver(std::function<void()> observer) {
        observers.push_back(observer);
    }

private:
    void notifyObservers() {
        std::cout << "[MODEL] Data changed, notifying observers...\n";
        for (auto& obs : observers) {
            obs();
        }
    }
};

// ═══════════════════════════════════════════════════════════════
//  VIEW
// ═══════════════════════════════════════════════════════════════

class UserView {
    UserModel* model;

public:
    UserView(UserModel* m) : model(m) {
        // Register as observer
        model->registerObserver([this]() {
            this->render();
        });

        render();  // Initial render
    }

    void render() {
        std::cout << "\n╔════════════════════════════════╗\n";
        std::cout << "║      User Profile              ║\n";
        std::cout << "╚════════════════════════════════╝\n";
        std::cout << "  Name:  " << model->getName() << "\n";
        std::cout << "  Email: " << model->getEmail() << "\n";
        std::cout << "  Age:   " << model->getAge() << "\n";
        std::cout << "════════════════════════════════\n";
    }

    void simulateUserInput(std::function<void()> callback) {
        // In real app, this would be button click, form submission, etc.
        callback();
    }
};

// ═══════════════════════════════════════════════════════════════
//  CONTROLLER
// ═══════════════════════════════════════════════════════════════

class UserController {
    UserModel* model;
    UserView* view;

public:
    UserController(UserModel* m, UserView* v) : model(m), view(v) {}

    void updateName(const std::string& newName) {
        std::cout << "\n[CONTROLLER] Updating name to: " << newName << "\n";

        // Validation
        if (newName.empty()) {
            std::cerr << "[CONTROLLER] Error: Name cannot be empty!\n";
            return;
        }

        // Update model (view will auto-update via observer)
        model->setName(newName);
    }

    void updateEmail(const std::string& newEmail) {
        std::cout << "\n[CONTROLLER] Updating email to: " << newEmail << "\n";

        // Validation
        if (newEmail.find('@') == std::string::npos) {
            std::cerr << "[CONTROLLER] Error: Invalid email format!\n";
            return;
        }

        model->setEmail(newEmail);
    }

    void updateAge(int newAge) {
        std::cout << "\n[CONTROLLER] Updating age to: " << newAge << "\n";

        // Validation
        if (newAge < 0 || newAge > 150) {
            std::cerr << "[CONTROLLER] Error: Invalid age!\n";
            return;
        }

        model->setAge(newAge);
    }
};

// ═══════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════

int main() {
    std::cout << "╔═══════════════════════════════════════════════╗\n";
    std::cout << "║  MVC Pattern: User Profile Example           ║\n";
    std::cout << "╚═══════════════════════════════════════════════╝\n";

    // Create MVC components
    UserModel model("Alice", "alice@example.com", 25);
    UserView view(&model);
    UserController controller(&model, &view);

    // Simulate user interactions
    std::cout << "\n=== User updates name ===\n";
    controller.updateName("Alice Smith");

    std::cout << "\n=== User tries invalid name ===\n";
    controller.updateName("");

    std::cout << "\n=== User updates email ===\n";
    controller.updateEmail("alice.smith@example.com");

    std::cout << "\n=== User tries invalid email ===\n";
    controller.updateEmail("invalid-email");

    std::cout << "\n=== User updates age ===\n";
    controller.updateAge(26);

    std::cout << "\n╔═══════════════════════════════════════════════╗\n";
    std::cout << "║  Key Points:                                  ║\n";
    std::cout << "║  1. Model notifies observers on data change   ║\n";
    std::cout << "║  2. View automatically re-renders             ║\n";
    std::cout << "║  3. Controller handles validation             ║\n";
    std::cout << "╚═══════════════════════════════════════════════╝\n";

    return 0;
}
```

**Output**:
```
╔═══════════════════════════════════════════════╗
║  MVC Pattern: User Profile Example           ║
╚═══════════════════════════════════════════════╝

╔════════════════════════════════╗
║      User Profile              ║
╚════════════════════════════════╝
  Name:  Alice
  Email: alice@example.com
  Age:   25
════════════════════════════════

=== User updates name ===

[CONTROLLER] Updating name to: Alice Smith
[MODEL] Data changed, notifying observers...

╔════════════════════════════════╗
║      User Profile              ║
╚════════════════════════════════╝
  Name:  Alice Smith
  Email: alice@example.com
  Age:   25
════════════════════════════════

=== User tries invalid name ===

[CONTROLLER] Updating name to:
[CONTROLLER] Error: Name cannot be empty!
```

---

#### Example 2: MVVM with Observable Properties

**Goal**: Implement MVVM with data binding simulation.

```cpp
#include <iostream>
#include <string>
#include <vector>
#include <functional>

// ═══════════════════════════════════════════════════════════════
//  OBSERVABLE PROPERTY (Data Binding Simulation)
// ═══════════════════════════════════════════════════════════════

template<typename T>
class ObservableProperty {
    T value;
    std::vector<std::function<void(const T&)>> changeListeners;

public:
    ObservableProperty() = default;
    ObservableProperty(const T& val) : value(val) {}

    void set(const T& newValue) {
        if (value != newValue) {
            value = newValue;
            notifyListeners();
        }
    }

    T get() const { return value; }

    void onChange(std::function<void(const T&)> listener) {
        changeListeners.push_back(listener);
    }

private:
    void notifyListeners() {
        for (auto& listener : changeListeners) {
            listener(value);
        }
    }
};

// ═══════════════════════════════════════════════════════════════
//  MODEL
// ═══════════════════════════════════════════════════════════════

struct User {
    std::string name;
    std::string email;
    int age;
};

class UserModel {
public:
    User loadUser(int userId) {
        std::cout << "[MODEL] Loading user from database...\n";
        return {"Alice", "alice@example.com", 25};
    }

    void saveUser(const User& user) {
        std::cout << "[MODEL] Saving user to database...\n";
        std::cout << "  Name: " << user.name << "\n";
        std::cout << "  Email: " << user.email << "\n";
        std::cout << "  Age: " << user.age << "\n";
    }
};

// ═══════════════════════════════════════════════════════════════
//  VIEWMODEL
// ═══════════════════════════════════════════════════════════════

class UserViewModel {
    UserModel model;

public:
    // Observable properties (for View binding)
    ObservableProperty<std::string> userName;
    ObservableProperty<std::string> userEmail;
    ObservableProperty<int> userAge;
    ObservableProperty<bool> isFormValid;
    ObservableProperty<std::string> statusMessage;

    UserViewModel() {
        // Load initial data
        User user = model.loadUser(1);
        userName.set(user.name);
        userEmail.set(user.email);
        userAge.set(user.age);

        // Setup validation
        userName.onChange([this](const std::string&) { validateForm(); });
        userEmail.onChange([this](const std::string&) { validateForm(); });
        userAge.onChange([this](int) { validateForm(); });

        validateForm();
    }

    // Command: Save button clicked
    void saveCommand() {
        std::cout << "\n[VIEWMODEL] Save command executed\n";

        if (!isFormValid.get()) {
            statusMessage.set("Cannot save: Form has errors");
            return;
        }

        User user = {userName.get(), userEmail.get(), userAge.get()};
        model.saveUser(user);

        statusMessage.set("User saved successfully!");
    }

private:
    void validateForm() {
        std::cout << "[VIEWMODEL] Validating form...\n";

        bool valid = true;
        std::string message = "";

        if (userName.get().empty()) {
            valid = false;
            message = "Name is required";
        } else if (userEmail.get().find('@') == std::string::npos) {
            valid = false;
            message = "Invalid email format";
        } else if (userAge.get() < 0 || userAge.get() > 150) {
            valid = false;
            message = "Invalid age";
        } else {
            message = "Form is valid";
        }

        isFormValid.set(valid);
        statusMessage.set(message);
    }
};

// ═══════════════════════════════════════════════════════════════
//  VIEW (Simulated)
// ═══════════════════════════════════════════════════════════════

class UserView {
    UserViewModel* viewModel;

public:
    UserView(UserViewModel* vm) : viewModel(vm) {
        setupBindings();
        render();
    }

    void setupBindings() {
        std::cout << "[VIEW] Setting up data bindings...\n";

        // Bind to ViewModel properties
        viewModel->userName.onChange([this](const std::string&) { render(); });
        viewModel->userEmail.onChange([this](const std::string&) { render(); });
        viewModel->userAge.onChange([this](int) { render(); });
        viewModel->isFormValid.onChange([this](bool) { render(); });
        viewModel->statusMessage.onChange([this](const std::string&) { render(); });
    }

    void render() {
        std::cout << "\n╔════════════════════════════════════════╗\n";
        std::cout << "║      User Profile Form (MVVM)          ║\n";
        std::cout << "╚════════════════════════════════════════╝\n";
        std::cout << "  Name:  [" << viewModel->userName.get() << "]\n";
        std::cout << "  Email: [" << viewModel->userEmail.get() << "]\n";
        std::cout << "  Age:   [" << viewModel->userAge.get() << "]\n";
        std::cout << "  \n";
        std::cout << "  [Save Button] " << (viewModel->isFormValid.get() ? "Enabled" : "Disabled") << "\n";
        std::cout << "  \n";
        std::cout << "  Status: " << viewModel->statusMessage.get() << "\n";
        std::cout << "════════════════════════════════════════\n";
    }

    void simulateUserInput(const std::string& field, const std::string& value) {
        std::cout << "\n[VIEW] User typed in " << field << " field: " << value << "\n";

        if (field == "name") {
            viewModel->userName.set(value);
        } else if (field == "email") {
            viewModel->userEmail.set(value);
        }
    }

    void simulateButtonClick() {
        std::cout << "\n[VIEW] User clicked Save button\n";
        viewModel->saveCommand();
    }
};

// ═══════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════

int main() {
    std::cout << "╔═══════════════════════════════════════════════╗\n";
    std::cout << "║  MVVM Pattern: Data Binding Example          ║\n";
    std::cout << "╚═══════════════════════════════════════════════╝\n\n";

    UserViewModel viewModel;
    UserView view(&viewModel);

    // Simulate user interactions
    view.simulateUserInput("name", "Alice Smith");
    view.simulateUserInput("email", "alice.smith@example.com");
    view.simulateButtonClick();

    std::cout << "\n--- User tries invalid email ---\n";
    view.simulateUserInput("email", "invalid");

    std::cout << "\n╔═══════════════════════════════════════════════╗\n";
    std::cout << "║  Key Points:                                  ║\n";
    std::cout << "║  1. View binds to ViewModel properties       ║\n";
    std::cout << "║  2. Changes auto-trigger UI updates          ║\n";
    std::cout << "║  3. No direct Model reference in View        ║\n";
    std::cout << "╚═══════════════════════════════════════════════╝\n";

    return 0;
}
```

---

#### Example 3-8: Additional Examples (Outlined)

**Example 3**: MVP Pattern (Interface-Based View)

**Example 4**: Complete Desktop App (Qt-style with signals/slots)

**Example 5**: Web Application (MVC with routing)

**Example 6**: Reactive UI (RxCpp for data streams)

**Example 7**: Testing MVC/MVVM/MVP (Unit tests with mocks)

**Example 8**: Navigation System (Multi-view application)

---

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

### PRACTICE_TASKS: Output Prediction and Code Analysis
#### Q1

**Goal**: Create MVC pattern for a Counter application.

**Requirements**:
1. **Model**: `CounterModel` with `increment()`, `decrement()`, `getValue()`
2. **View**: `CounterView` displays count, has buttons
3. **Controller**: `CounterController` handles button clicks

**Test**:
- Click increment → count goes up
- Click decrement → count goes down
- View auto-updates via Observer pattern

---

#### Q2

**Goal**: Create MVVM pattern for a Login form.

**Requirements**:
1. **Model**: `AuthModel` with `authenticate(username, password)`
2. **ViewModel**: `LoginViewModel` with:
   - `ObservableProperty<string> username`
   - `ObservableProperty<string> password`
   - `ObservableProperty<bool> isLoginEnabled`
   - `loginCommand()`
3. **View**: Binds to ViewModel properties

**Test**:
- Username/password empty → login button disabled
- Fill both → login button enabled
- Click login → calls `AuthModel.authenticate()`

---

#### Q3

**Goal**: Create MVP pattern for same Login form.

**Requirements**:
1. **ILoginView** interface with:
   - `showError(message)`
   - `navigateToHome()`
2. **LoginPresenter** with all logic
3. **LoginView** implements interface (completely passive)

**Test**:
- Test Presenter with MockView
- Verify `showError()` called on invalid credentials

---

#### Q4

**Goal**: Take Task 1 (MVC Counter) and convert to MVVM.

**Requirements**:
- Remove Controller
- Create `CounterViewModel` with `ObservableProperty<int> count`
- View binds to ViewModel
- Implement `incrementCommand()`, `decrementCommand()`

---

#### Q5

**Goal**: Create generic `ObservableProperty<T>` class for data binding.

**Requirements**:
1. `set(value)` - sets value and notifies listeners
2. `get()` - returns current value
3. `onChange(callback)` - registers listener

**Test**:
```cpp
ObservableProperty<int> count(0);
count.onChange([](int newValue) {
    std::cout << "Count changed to: " << newValue << "\n";
});
count.set(5);  // Prints: "Count changed to: 5"
```

---

#### Task 6: Implement Navigation System

**Goal**: Handle navigation between multiple Views.

**Requirements**:
1. `INavigator` interface with `navigateTo(viewName)`
2. Multiple Controllers (Login, Home, Profile)
3. Navigator manages view stack

**Test**:
- Login success → navigate to Home
- Click profile button → navigate to Profile
- Back button → return to previous view

---

#### Task 7: Implement Validation in MVVM

**Goal**: Add form validation to LoginViewModel.

**Requirements**:
1. Username: min 3 characters
2. Password: min 8 characters, must have digit
3. `isFormValid` property updates automatically
4. Save button enabled only when form valid

---

#### Task 8: Test Controller with Mock View

**Goal**: Write unit tests for MVC Controller.

**Requirements**:
1. Create `IUserView` interface
2. `MockUserView` implements interface
3. Test `UserController.updateUser()`
4. Verify `view.updateNameLabel()` was called

---

#### Task 9: Implement Commands (MVVM)

**Goal**: Create command pattern for ViewModel actions.

**Requirements**:
1. `ICommand` interface with `execute()`, `canExecute()`
2. `RelayCommand` implementation
3. ViewModel exposes commands (saveCommand, cancelCommand)
4. View binds buttons to commands

---

#### Task 10: Implement Shared State

**Goal**: Share data between multiple ViewModels.

**Requirements**:
1. `SharedCartModel` (singleton or shared instance)
2. `ProductListViewModel` adds products
3. `CheckoutViewModel` displays same products
4. Both ViewModels observe same Model

---

#### Task 11-20: Additional Tasks (Outlined)

**Task 11**: Implement undo/redo in MVC

**Task 12**: Create MVVM web form with client-side validation

**Task 13**: Implement Model with Repository pattern

**Task 14**: Add loading states to ViewModel (isLoading property)

**Task 15**: Implement error handling across layers

**Task 16**: Create multi-page application with routing

**Task 17**: Implement async operations in ViewModel

**Task 18**: Add dependency injection to Controllers

**Task 19**: Implement observer pattern for Model

**Task 20**: Build complete TODO app with MVC or MVVM

---

### QUICK_REFERENCE: Key Takeaways and Comparison Tables
#### MVC vs MVVM vs MVP

| Aspect | MVC | MVVM | MVP |
|--------|-----|------|-----|
| **View-Logic Communication** | View ↔ Controller | View ↔ ViewModel (binding) | View → Presenter |
| **Update Mechanism** | Observer pattern | Two-way binding | Explicit calls |
| **View Intelligence** | Some logic | Declarative only | Completely passive |
| **Testability** | Good | Excellent | Excellent |
| **Best For** | Web apps, traditional desktop | Modern frameworks (WPF, Angular) | Android, max testability |

---

#### Pattern Structures

```
MVC:
┌──────┐     ┌────────────┐     ┌───────┐
│ View │ ↔   │ Controller │ ↔   │ Model │
└──────┘     └────────────┘     └───────┘

MVVM:
┌──────┐  binding  ┌───────────┐     ┌───────┐
│ View │ ========= │ ViewModel │ ↔   │ Model │
└──────┘           └───────────┘     └───────┘

MVP:
┌──────┐           ┌───────────┐     ┌───────┐
│ View │ →         │ Presenter │ ↔   │ Model │
└──────┘           └───────────┘     └───────┘
    ↑                  │
    └──────────────────┘ (explicit calls)
```

---

#### When to Use Each

| Pattern | Use Case |
|---------|----------|
| **MVC** | Web applications (Django, Rails), traditional desktop apps |
| **MVVM** | WPF, UWP, Angular, Vue.js, SwiftUI - anything with data binding |
| **MVP** | Android apps, legacy systems, maximum testability |

---

#### Common Responsibilities

| Component | Responsibilities |
|-----------|------------------|
| **Model** | Data, business logic, persistence |
| **View** | Display UI, capture user input |
| **Controller** | Handle input, update Model, select View |
| **ViewModel** | Expose data for binding, handle commands |
| **Presenter** | All logic, explicitly update View |

---

#### Code Templates

**MVC**:
```cpp
class Model {
    std::vector<Observer*> observers;
    void notifyObservers();
};

class View {
    Model* model;
    void render();
};

class Controller {
    Model* model;
    View* view;
    void handleInput();
};
```

**MVVM**:
```cpp
class ViewModel {
    ObservableProperty<std::string> userName;
    void saveCommand();
};

class View {
    ViewModel* vm;
    void setupBindings();
};
```

**MVP**:
```cpp
class IView {
    virtual void display(const std::string& data) = 0;
};

class Presenter {
    IView* view;
    Model* model;
    void onButtonClicked();
};
```

---

