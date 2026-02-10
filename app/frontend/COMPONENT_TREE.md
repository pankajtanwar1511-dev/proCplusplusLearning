# Component Tree - C++ Master Frontend

Visual representation of the component hierarchy and routing structure.

## Application Structure

```
App (Main Container)
│
├── Router
│   │
│   ├── Sidebar (Persistent Navigation)
│   │   ├── Logo
│   │   ├── User Info
│   │   │   ├── Avatar
│   │   │   ├── Name
│   │   │   └── Streak Badge
│   │   │
│   │   ├── Navigation Links
│   │   │   ├── Dashboard Link
│   │   │   ├── Topics Link
│   │   │   ├── Learning Paths Link
│   │   │   ├── Search Link
│   │   │   └── Profile Link
│   │   │
│   │   └── Footer (Version Info)
│   │
│   └── Main Content Area (Routes)
│       │
│       ├── Route: /dashboard
│       │   └── Dashboard Component
│       │       ├── Header (Welcome Message)
│       │       ├── Stats Grid
│       │       │   ├── Progress Card
│       │       │   ├── Streak Card
│       │       │   ├── Quizzes Card
│       │       │   └── Study Time Card
│       │       │
│       │       └── Content Grid
│       │           ├── Weak Areas Card
│       │           │   └── Area Items List
│       │           ├── Strong Areas Card
│       │           │   └── Area Items List
│       │           └── Quiz History Card
│       │               └── Quiz Items List
│       │
│       ├── Route: /topics
│       │   └── TopicsList Component
│       │       ├── Header
│       │       ├── Controls Bar
│       │       │   ├── Search Box
│       │       │   ├── Filter Dropdown
│       │       │   ├── Sort Dropdown
│       │       │   └── View Toggle
│       │       │
│       │       └── Topics Grid/List
│       │           └── Topic Cards
│       │               ├── Status Icon
│       │               ├── Title
│       │               ├── Description
│       │               ├── Difficulty Badge
│       │               └── Progress Bar
│       │
│       ├── Route: /topics/:id
│       │   └── TopicDetail Component
│       │       ├── Header
│       │       │   ├── Back Button
│       │       │   ├── Topic Info
│       │       │   └── Progress Bar
│       │       │
│       │       ├── Tabs Navigation
│       │       │   ├── Theory Tab
│       │       │   ├── Examples Tab
│       │       │   ├── Quiz Tab
│       │       │   └── Notes Tab
│       │       │
│       │       └── Tab Content
│       │           ├── Theory Content
│       │           │   ├── Markdown Content
│       │           │   └── Action Buttons
│       │           │
│       │           ├── Examples Content
│       │           │   └── Example Cards
│       │           │       ├── Title
│       │           │       ├── Code Block (with Copy)
│       │           │       ├── Explanation
│       │           │       └── Output
│       │           │
│       │           ├── Quiz Content
│       │           │   ├── Quiz Intro Card
│       │           │   └── Quiz History List
│       │           │
│       │           └── Notes Content
│       │               ├── Text Editor
│       │               └── Save Button
│       │
│       ├── Route: /quiz/:topicId
│       │   └── Quiz Component
│       │       ├── Quiz Start View
│       │       │   ├── Icon
│       │       │   ├── Title
│       │       │   ├── Difficulty Selector
│       │       │   └── Start Button
│       │       │
│       │       ├── Quiz Progress View
│       │       │   ├── Header
│       │       │   │   ├── Question Counter
│       │       │   │   ├── Timer
│       │       │   │   └── Progress Bar
│       │       │   │
│       │       │   ├── Question Card
│       │       │   │   ├── Question Text
│       │       │   │   ├── Code Block (if any)
│       │       │   │   └── Options List
│       │       │   │
│       │       │   ├── Navigation
│       │       │   │   ├── Previous Button
│       │       │   │   ├── Answered Status
│       │       │   │   └── Next/Submit Button
│       │       │   │
│       │       │   └── Question Navigator
│       │       │       └── Question Dots
│       │       │
│       │       └── Quiz Results View
│       │           ├── Results Header
│       │           ├── Stats Cards
│       │           │   ├── Score Card
│       │           │   ├── Correct Answers Card
│       │           │   └── Time Card
│       │           │
│       │           ├── Details
│       │           │   ├── Weak Concepts
│       │           │   └── Recommendations
│       │           │
│       │           └── Actions
│       │               ├── Try Again
│       │               ├── Back to Topic
│       │               └── Dashboard
│       │
│       ├── Route: /learning-paths
│       │   └── LearningPaths Component
│       │       ├── Header
│       │       └── Paths Grid
│       │           └── Path Cards
│       │               ├── Header (Icon + Badge)
│       │               ├── Title
│       │               ├── Description
│       │               ├── Meta Info
│       │               ├── Progress Bar
│       │               ├── Topics List
│       │               └── Start/Continue Button
│       │
│       ├── Route: /search
│       │   └── Search Component
│       │       ├── Header
│       │       ├── Search Input
│       │       │   ├── Search Icon
│       │       │   ├── Input Field
│       │       │   └── Clear Button
│       │       │
│       │       ├── Empty State (no query)
│       │       │   └── Popular Suggestions
│       │       │
│       │       └── Search Results
│       │           ├── Results Summary
│       │           ├── Topics Section
│       │           │   └── Topic Results
│       │           ├── Examples Section
│       │           │   └── Example Results
│       │           └── Questions Section
│       │               └── Question Results
│       │
│       └── Route: /profile
│           └── Profile Component
│               ├── Header
│               ├── Profile Grid
│               │   ├── Profile Card
│               │   │   ├── Avatar
│               │   │   ├── Info Display / Edit Form
│               │   │   └── Action Buttons
│               │   │
│               │   ├── Stats Card
│               │   │   └── Stat Items
│               │   │       ├── Streak
│               │   │       ├── Completed Topics
│               │   │       └── Passed Quizzes
│               │   │
│               │   ├── Settings Card
│               │   │   └── Setting Items
│               │   │       └── Dark Mode Toggle
│               │   │
│               │   └── Actions Card
│               │       ├── Export Data Button
│               │       └── Reset Progress Button
│               │
│               └── Reset Modal (conditional)
│                   ├── Warning Icon
│                   ├── Confirmation Text
│                   └── Action Buttons
│
└── Mobile Bottom Nav (Conditional - Mobile Only)
    ├── Dashboard Link
    ├── Topics Link
    ├── Learning Paths Link
    ├── Search Link
    └── Profile Link
```

## Component Dependencies

### Data Flow

```
App
 ↓
API Utils (api.js)
 ↓
Components
 ↓
UI Elements (Buttons, Cards, etc.)
```

### State Management

```
Component Level State (useState)
 ↓
Local State (loading, data, error)
 ↓
Effect Hooks (useEffect) → API Calls
 ↓
UI Updates
```

### Routing Flow

```
Browser URL
 ↓
React Router
 ↓
Route Match
 ↓
Component Render
 ↓
Data Fetch (useEffect)
 ↓
Display Content
```

## Reusable UI Components

These patterns are used across multiple components:

### Cards
```
.card
├── .card-header
│   ├── Title (h3)
│   └── Badge/Action
└── .card-body
    └── Content
```

### Stat Cards
```
.stat-card
├── .stat-icon
├── .stat-value
└── .stat-label
```

### Progress Bar
```
.progress-bar
└── .progress-bar-fill (dynamic width)
```

### Buttons
```
.btn.[variant]
├── Icon (optional)
└── Text
```

### Empty State
```
.empty-state
├── Icon
├── Heading
├── Message
└── Action Button
```

## Key Features Per Component

| Component | Main Features | Sub-components | API Calls |
|-----------|--------------|----------------|-----------|
| Dashboard | Progress overview | Stats cards, Areas lists | `/api/dashboard` |
| TopicsList | Browse topics | Topic cards, Filters | `/api/topics` |
| TopicDetail | Topic content | 5 tabs, Progress | `/api/topics/:id` |
| Quiz | Interactive quiz | Questions, Timer | `/api/quiz/*` |
| LearningPaths | Learning journeys | Path cards | `/api/learning-paths` |
| Search | Global search | Results sections | `/api/search` |
| Profile | User settings | Profile form, Stats | `/api/profile` |
| Sidebar | Navigation | Nav links, User info | None (props) |

## Props Flow

```
App Component
│
├── user (state) → Sidebar, Dashboard, Profile
├── sidebarOpen (state) → Sidebar, Main Content (margin)
│
Individual Components
│
├── Receive props from parent
├── Manage own local state
├── Call API methods
└── Update UI based on state
```

## Event Handlers

### Navigation Events
- Link clicks → React Router navigation
- Back button → browser history
- Tab switches → local state update

### Data Events
- Form submit → API call → state update
- Button click → action → API call
- Input change → debounced search

### UI Events
- Hover → style changes (CSS)
- Click → selection → state update
- Scroll → infinite scroll (potential)

## Responsive Behavior

### Desktop (>768px)
```
Sidebar (fixed left)
│
└── Main Content (margin-left: 280px)
    └── Component (full width)
```

### Mobile (≤768px)
```
Hidden Sidebar (off-screen)
│
Main Content (full width)
│
└── Component (full width)
    │
    └── Bottom Nav (fixed bottom)
```

## Component Lifecycle

```
Component Mount
 ↓
useEffect runs
 ↓
API call initiated
 ↓
Loading state = true
 ↓
Response received
 ↓
Data state updated
 ↓
Loading state = false
 ↓
UI renders with data
 ↓
User interaction
 ↓
State update
 ↓
Re-render
 ↓
Component Unmount
```

---

**This tree shows the complete structure of the React application!** 🌳
