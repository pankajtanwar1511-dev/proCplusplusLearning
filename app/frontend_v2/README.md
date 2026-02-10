# C++ Master Pro - Frontend

World-class React frontend with learning-optimized design, beautiful syntax highlighting, and evidence-based UX.

## Features

- **Learning-Optimized Design**
  - Color palette based on cognitive psychology research
  - Typography optimized for readability (Inter + JetBrains Mono)
  - Dark mode with reduced blue light backgrounds
  - WCAG 2.1 AA accessible

- **Syntax Highlighting**
  - VS Code Dark+ theme for code examples
  - JetBrains Mono font with programming ligatures
  - Copy-to-clipboard functionality

- **Adaptive Learning**
  - Spaced repetition quiz scheduling
  - Real-time feedback with animations
  - Progress tracking with visualizations

- **Responsive Design**
  - Mobile-first approach
  - Touch-optimized interactions
  - 8-point grid system

## Setup

### Install Dependencies

```bash
npm install
```

### Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and set your backend API URL (default: `http://localhost:5000/api`)

### Start Development Server

```bash
npm start
```

The app will open at [http://localhost:3000](http://localhost:3000)

### Build for Production

```bash
npm run build
```

The optimized build will be in the `build/` directory.

## Project Structure

```
src/
├── components/
│   ├── layout/
│   │   ├── Navbar.js           # Top navigation with theme toggle
│   │   └── Sidebar.js          # Chapter/topic navigation
│   └── common/
│       └── CodeBlock.js        # Syntax-highlighted code display
├── pages/
│   ├── Dashboard.js            # Main dashboard with stats
│   ├── ChapterView.js          # Chapter overview
│   ├── TopicView.js            # Topic learning interface
│   ├── QuizView.js             # Interactive quiz with feedback
│   └── StatsView.js            # Detailed analytics
├── utils/
│   └── api.js                  # API service layer
├── App.js                      # Main app component with routing
├── index.js                    # React entry point
└── index.css                   # Global styles with Tailwind

```

## Design System

### Colors

Based on learning psychology research:

- **Primary (Deep Blue #1e3a8a)** - Focus & Concentration
- **Success (Emerald #059669)** - Achievement & Growth
- **Warning (Amber #f59e0b)** - Attention
- **Danger (Red #dc2626)** - Errors
- **Accent (Teal #14b8a6)** - Interactive Elements

### Typography

- **Headings**: Inter (optimal readability)
- **Body**: System fonts (-apple-system, Segoe UI)
- **Code**: JetBrains Mono (programming ligatures)

Line heights:
- Body text: 1.75 (optimal for comprehension)
- Code: 1.5 (maintains structure)

### Spacing

8-point grid system for visual harmony:
- Small: 8px, 16px
- Medium: 24px, 32px
- Large: 48px, 64px

## Learning Features

### Spaced Repetition

- SM-2 algorithm implementation
- Review intervals: 1 day → 3 days → 1 week → 2 weeks
- Based on performance scores

### Adaptive Difficulty

- Questions adapt to user performance
- Weak areas automatically prioritized
- Concept-level mastery tracking

### Immediate Feedback

- Instant answer validation
- Detailed explanations
- Visual feedback animations

## Browser Support

- Chrome/Edge (latest 2 versions)
- Firefox (latest 2 versions)
- Safari (latest 2 versions)

## Performance

- Code splitting with React.lazy()
- Image lazy loading
- Component memoization
- Virtual scrolling for long lists

## Accessibility

- WCAG 2.1 AA compliant
- Keyboard navigation support
- Screen reader optimized
- High contrast text (7:1 ratio)
- Focus indicators (2px outline)

## Dark Mode

Dark mode uses:
- Deep blue-gray background (#0f172a) - reduced blue light
- Warm text colors for comfort
- Preserved contrast ratios (4.5:1+)

Toggle with sun/moon icon in navbar.

## Scripts

- `npm start` - Start development server
- `npm run build` - Build for production
- `npm test` - Run tests
- `npm run eject` - Eject from Create React App

## API Integration

The frontend communicates with the Flask backend via the API service layer (`src/utils/api.js`).

All endpoints are prefixed with `REACT_APP_API_URL` from `.env`.

## Contributing

See main project README for contribution guidelines.

## License

See main project LICENSE file.
