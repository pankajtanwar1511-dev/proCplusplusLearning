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
