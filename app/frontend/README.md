# C++ Master - Frontend

A modern, production-ready React frontend for the C++ Master learning platform. Built with React 18, React Router, and beautiful UI components.

## Features

### Core Features
- **Dashboard**: Overview of progress, weak/strong areas, quiz history, and streak tracking
- **Topics List**: Browse all 17 C++ topics with filtering, sorting, and search
- **Topic Detail**: 5 tabs (Theory, Code Examples, Quiz, Notes) with progress tracking
- **Quiz Mode**: Interactive quizzes with timer, navigation, and adaptive difficulty
- **Learning Paths**: Structured learning journeys for different skill levels
- **Search**: Comprehensive search across topics, code examples, and quiz questions
- **Profile & Settings**: User profile management, data export, and progress reset

### Smart Features
- **Adaptive Difficulty**: Quiz difficulty adjusts based on performance
- **Progress Tracking**: Real-time sync with backend on every action
- **Weakness Detection**: Identifies weak concepts after quizzes with recommendations
- **Gamification**: Streaks, badges, progress bars, and achievement tracking
- **Code Syntax Highlighting**: Beautiful C++ code examples with Prism.js
- **Responsive Design**: Mobile-first design that works on all devices

### UI/UX Highlights
- Clean, minimalist interface with card-based layout
- Smooth animations and transitions
- Beautiful color scheme (Blue, Green, Yellow, Red palette)
- Loading states and error handling
- Empty states for better UX
- Toast notifications for user actions

## Tech Stack

- **React 18** - Latest React with hooks
- **React Router v6** - Client-side routing
- **Axios** - HTTP client for API calls
- **Prism.js** - Syntax highlighting for code
- **Lucide React** - Beautiful icon library
- **CSS3** - Custom CSS with CSS variables

## Project Structure

```
src/
├── index.js              # Entry point
├── App.js                # Main app with routing
├── index.css             # Global styles
├── components/
│   ├── Dashboard.js      # Dashboard page
│   ├── TopicsList.js     # Topics list with filters
│   ├── TopicDetail.js    # Topic detail with tabs
│   ├── Quiz.js           # Interactive quiz mode
│   ├── LearningPaths.js  # Learning paths page
│   ├── Search.js         # Search functionality
│   ├── Profile.js        # User profile & settings
│   └── Sidebar.js        # Navigation sidebar
└── utils/
    └── api.js            # API client and methods
```

## Getting Started

### Prerequisites

- Node.js 14+ and npm
- Flask backend running on http://localhost:5000

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm start
```

The app will open at [http://localhost:3000](http://localhost:3000).

### Build for Production

```bash
npm run build
```

This creates an optimized production build in the `build/` folder.

## API Integration

The frontend connects to the Flask backend via the proxy configuration in `package.json`. All API calls are made through the `/api` endpoint.

### API Endpoints Used

- `GET /api/dashboard` - Dashboard data
- `GET /api/topics` - List all topics
- `GET /api/topics/:id` - Topic details
- `GET /api/topics/:id/theory` - Topic theory content
- `GET /api/topics/:id/examples` - Code examples
- `POST /api/quiz/generate` - Generate quiz
- `POST /api/quiz/submit` - Submit quiz
- `GET /api/quiz/history` - Quiz history
- `GET /api/learning-paths` - Learning paths
- `GET /api/search?q=` - Search
- `GET /api/notes/:id` - Get notes
- `POST /api/notes/:id` - Save notes
- `POST /api/progress/update` - Update progress
- `GET /api/profile` - User profile
- `PUT /api/profile` - Update profile
- `POST /api/profile/reset` - Reset progress
- `GET /api/profile/export` - Export data

## Components Guide

### Dashboard
Displays user progress, streak, weak/strong areas, and recent quiz history.

**Key Features:**
- Overall progress percentage
- Current streak counter
- Stats cards (progress, streak, quizzes, study time)
- Weak areas list (topics with <60% score)
- Strong areas list (topics with >80% score)
- Recent quiz history

### TopicsList
Browse all C++ topics with filtering and sorting.

**Key Features:**
- Grid/List view toggle
- Filter by status (All, Completed, In Progress, Not Started)
- Sort by title, progress, or difficulty
- Search topics by name/description
- Color-coded progress indicators
- Difficulty badges

### TopicDetail
Comprehensive topic page with 5 tabs.

**Tabs:**
1. **Theory**: Content with "Mark as Read" button
2. **Code Examples**: Syntax-highlighted code with copy button
3. **Quiz**: Start quiz, view past scores
4. **Notes**: Personal notes with save functionality

### Quiz
Interactive quiz mode with timer and navigation.

**Key Features:**
- 10 questions per quiz
- 15-minute timer with warning
- Question navigation (Previous/Next)
- Quick navigation dots
- Progress tracking
- Results page with score, weak concepts, and recommendations
- Adaptive difficulty selection

### LearningPaths
Structured learning journeys for different goals.

**Paths:**
- Beginner Path (fundamentals)
- Interview Prep (common questions)
- Modern C++ (C++11/14/17/20)
- Advanced Topics (templates, metaprogramming)

### Search
Comprehensive search across all content.

**Features:**
- Real-time search with debouncing
- Results grouped by type (Topics, Examples, Questions)
- Highlighted search terms
- Popular search suggestions

### Profile
User profile and settings management.

**Features:**
- Edit profile (name, email)
- View statistics (streak, completed topics, passed quizzes)
- Dark mode toggle (coming soon)
- Export data as JSON
- Reset progress (with confirmation)

## Styling

### CSS Variables
All colors, shadows, and other design tokens are defined as CSS variables in `index.css`:

```css
--primary: #3B82F6
--success: #10B981
--warning: #F59E0B
--danger: #EF4444
--dark: #1F2937
--light: #F9FAFB
```

### Responsive Breakpoints
- Desktop: > 768px
- Mobile: ≤ 768px

### Component Structure
Each component has its own CSS file with scoped styles.

## State Management

This app uses React hooks for state management:
- `useState` - Local component state
- `useEffect` - Side effects and data fetching
- `useParams` - Route parameters
- `useNavigate` - Programmatic navigation

No Redux or Context API needed for this app size.

## Performance Optimizations

1. **Lazy Loading**: Code splitting with React.lazy (can be added)
2. **Debouncing**: Search input debounced (300ms)
3. **Memoization**: Can add React.memo for expensive components
4. **Optimistic Updates**: Immediate UI updates before API responses

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Development Tips

### Adding a New Page

1. Create component in `src/components/YourPage.js`
2. Create styles in `src/components/YourPage.css`
3. Add route in `src/App.js`
4. Add navigation link in `src/components/Sidebar.js`

### API Call Pattern

```javascript
import { apiMethod } from '../utils/api';

const [data, setData] = useState(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState(null);

useEffect(() => {
  const loadData = async () => {
    try {
      setLoading(true);
      const response = await apiMethod();
      setData(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };
  loadData();
}, []);
```

### Styling Best Practices

1. Use CSS variables for colors
2. Use utility classes from `index.css`
3. Keep component styles scoped
4. Use BEM-like naming: `component-element--modifier`

## Troubleshooting

### API Connection Issues

If the frontend can't connect to the backend:

1. Check backend is running on `http://localhost:5000`
2. Verify proxy in `package.json`: `"proxy": "http://localhost:5000"`
3. Check CORS is enabled on the backend

### Build Errors

If you get build errors:

1. Delete `node_modules` and `package-lock.json`
2. Run `npm install` again
3. Clear npm cache: `npm cache clean --force`

### Styling Issues

If styles aren't applied:

1. Check CSS file is imported in the component
2. Verify class names match CSS selectors
3. Clear browser cache

## Future Enhancements

- [ ] Dark mode implementation
- [ ] Offline support with Service Workers
- [ ] PWA features (install prompt, notifications)
- [ ] Code playground for practice
- [ ] Social features (share progress, leaderboards)
- [ ] More interactive code examples
- [ ] Video tutorials integration
- [ ] AI-powered chatbot assistant

## Contributing

When contributing:

1. Follow the existing code style
2. Create component with TypeScript types (if migrating)
3. Add proper error handling
4. Test on mobile devices
5. Update this README if adding features

## License

MIT License - See LICENSE file for details

## Contact

For questions or issues, please contact the development team.

---

**Built with ❤️ for C++ learners**
