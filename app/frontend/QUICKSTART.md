# Quick Start Guide - C++ Master Frontend

Get the C++ Master frontend up and running in 5 minutes!

## Prerequisites

- Node.js 14+ installed
- npm (comes with Node.js)
- Backend API running at http://localhost:5000

## Step 1: Install Dependencies

```bash
cd /home/pankaj/cplusplus/proCplusplus/app/frontend
npm install
```

This will install:
- React 18.2.0
- React Router DOM 6.20.0
- Axios 1.6.0
- Prism.js 1.29.0
- Lucide React 0.300.0
- And other dependencies...

## Step 2: Start Development Server

```bash
npm start
```

The app will automatically open in your browser at http://localhost:3000

## Step 3: Explore the App

### Default Routes

- **Dashboard**: http://localhost:3000/dashboard
- **Topics**: http://localhost:3000/topics
- **Learning Paths**: http://localhost:3000/learning-paths
- **Search**: http://localhost:3000/search
- **Profile**: http://localhost:3000/profile

### Key Features to Try

1. **Browse Topics**
   - Go to Topics page
   - Filter by status (Completed, In Progress, Not Started)
   - Sort by title, progress, or difficulty
   - Search for specific topics

2. **Take a Quiz**
   - Click any topic
   - Go to "Quiz" tab
   - Click "Start Quiz"
   - Answer questions with timer
   - See results with weak areas identified

3. **View Code Examples**
   - Open any topic
   - Go to "Code Examples" tab
   - Copy code snippets
   - View syntax-highlighted C++ code

4. **Track Progress**
   - Check Dashboard for overall stats
   - See weak vs strong areas
   - Monitor your streak

## Folder Structure

```
frontend/
├── public/
│   └── index.html          # HTML template
├── src/
│   ├── index.js            # App entry point
│   ├── App.js              # Main app component
│   ├── index.css           # Global styles
│   ├── components/         # All React components
│   │   ├── Dashboard.js
│   │   ├── TopicsList.js
│   │   ├── TopicDetail.js
│   │   ├── Quiz.js
│   │   ├── LearningPaths.js
│   │   ├── Search.js
│   │   ├── Profile.js
│   │   └── Sidebar.js
│   └── utils/
│       └── api.js          # API client
├── package.json            # Dependencies
└── README.md              # Full documentation
```

## Common Commands

```bash
# Install dependencies
npm install

# Start development server
npm start

# Build for production
npm run build

# Run tests (if configured)
npm test

# Eject (if you need to customize webpack)
npm run eject
```

## API Configuration

The frontend connects to the backend via proxy configuration in `package.json`:

```json
"proxy": "http://localhost:5000"
```

All API calls to `/api/*` are automatically proxied to the Flask backend.

## Troubleshooting

### Port 3000 already in use?

Kill the process or use a different port:

```bash
# Kill process on port 3000
kill -9 $(lsof -ti:3000)

# Or start on different port
PORT=3001 npm start
```

### Can't connect to backend?

1. Check backend is running: `curl http://localhost:5000/api/topics`
2. Verify proxy in package.json
3. Check CORS settings in backend

### Blank page on load?

1. Open browser console (F12)
2. Check for errors
3. Verify all dependencies installed: `npm install`

### Styles not loading?

1. Hard refresh: Ctrl+F5 (Windows) or Cmd+Shift+R (Mac)
2. Clear browser cache
3. Check if CSS files are imported in components

## Development Tips

### Hot Reload

Changes to files are automatically reflected in the browser. No need to restart the server.

### Component Development

Edit any component in `src/components/` and see changes instantly:

```javascript
// Example: Edit Dashboard.js
// Changes appear immediately in browser
```

### API Testing

Use the browser's Network tab (F12) to monitor API calls:

1. Open DevTools
2. Go to Network tab
3. Filter by "Fetch/XHR"
4. See all API requests and responses

### Console Debugging

Add console logs for debugging:

```javascript
console.log('Data:', data);
console.log('Error:', error);
```

## Mobile Testing

Test responsive design:

1. Open browser DevTools (F12)
2. Click device toolbar icon (or Ctrl+Shift+M)
3. Select device (iPhone, iPad, etc.)
4. Test navigation and features

## Production Build

When ready to deploy:

```bash
# Create optimized build
npm run build

# Serve the build folder
npx serve -s build
```

The build folder contains static files ready for deployment.

## Next Steps

1. Explore all components
2. Customize colors in `src/index.css`
3. Add new features as needed
4. Connect with real backend data
5. Deploy to production

## Key Files to Customize

- **Colors**: `src/index.css` (CSS variables)
- **API Endpoint**: `package.json` (proxy)
- **Routes**: `src/App.js`
- **Navigation**: `src/components/Sidebar.js`
- **Global Styles**: `src/index.css`

## Support

For issues or questions:

1. Check README.md for detailed documentation
2. Review component files for inline comments
3. Check browser console for errors
4. Verify backend API is running

---

**Happy Coding! 🚀**
