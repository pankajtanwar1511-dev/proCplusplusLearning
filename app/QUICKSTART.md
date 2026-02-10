# C++ Master - Quick Start Guide

Get up and running in 3 minutes!

## What You Get

✨ **Complete C++ learning platform** with:
- 17 core C++ topics
- 294 interview questions
- 376 code examples
- Adaptive quizzes
- Progress tracking
- Weakness detection
- Learning paths

## Installation (One Command!)

```bash
cd /home/pankaj/cplusplus/proCplusplus/app
./setup.sh
```

This installs all dependencies for both backend and frontend.

## Running the App

### Option 1: Two Terminals

**Terminal 1 - Backend:**
```bash
cd /home/pankaj/cplusplus/proCplusplus/app
./run_backend.sh
```

**Terminal 2 - Frontend:**
```bash
cd /home/pankaj/cplusplus/proCplusplus/app
./run_frontend.sh
```

### Option 2: Background Process

```bash
cd /home/pankaj/cplusplus/proCplusplus/app

# Start backend in background
./run_backend.sh > backend.log 2>&1 &

# Start frontend (opens browser automatically)
./run_frontend.sh
```

## Access the App

Open your browser to:
```
http://localhost:3000
```

The backend runs on `http://localhost:5000`

## First Steps

1. **Dashboard**: See your progress overview
2. **Topics**: Browse all 17 C++ topics
3. **Pick a Topic**: Click "C++ OOP" to start
4. **Read Theory**: Learn the concepts
5. **Take Quiz**: Test your knowledge
6. **See Results**: View score and weak areas

## Features Tour

### Dashboard
- Overall progress bar
- Weak areas (need practice)
- Strong areas (well understood)
- Recent quiz history
- Current streak

### Topics List
- 17 C++ topics from basics to advanced
- Filter: All, Completed, In Progress
- Sort by: Title, Progress, Difficulty
- Color coding:
  - 🟢 Green: >80% (strong)
  - 🟡 Yellow: 60-80% (ok)
  - 🔴 Red: <60% (weak)
  - ⚪ Gray: Not started

### Topic Detail (5 Tabs)
1. **Theory**: Read explanations
2. **Code Examples**: View code with syntax highlighting
3. **Quiz**: Take adaptive quizzes
4. **Practice**: Coding exercises (coming soon)
5. **Notes**: Add personal notes

### Quiz Mode
- Auto-adaptive difficulty
- Timer countdown
- Multiple choice questions
- Instant results
- Weakness identification
- Recommendations

### Learning Paths
- **Beginner**: Start from scratch
- **Interview Prep**: Focus on interviews
- **Modern C++**: Learn C++11/14/17
- **Comprehensive**: Master everything

## Example Workflow

**Day 1: Get Started**
```
1. Open Dashboard
2. Click "Topics"
3. Start with "Topic 1: C++ OOP"
4. Read Theory tab (mark as read)
5. View Code Examples
6. Take Easy Quiz
7. See results - 70% (Pass!)
```

**Day 2: Continue Learning**
```
1. Dashboard shows: "Weak in: virtual functions"
2. Go back to Topic 1
3. Review Code Examples about virtual functions
4. Take Medium Quiz
5. Score 85% - Improvement!
```

**Day 7: Follow Learning Path**
```
1. Click "Learning Paths"
2. Select "Interview Prep"
3. Follow the recommended sequence
4. Complete quizzes for each topic
5. Track overall progress
```

## Tips for Best Results

1. **Read Theory First**: Don't skip to quizzes
2. **Take Notes**: Use the Notes tab for important points
3. **Practice Regularly**: Daily 30 minutes > Weekly 3 hours
4. **Review Weak Areas**: Focus on topics where you score <70%
5. **Use Learning Paths**: More structured than random topics
6. **Check Code Examples**: Understand before memorizing
7. **Retake Quizzes**: Solidify understanding

## Keyboard Shortcuts

- `/` - Focus search
- `Esc` - Close modal/go back
- `←` `→` - Navigate quiz questions
- `Enter` - Submit answer

## Data & Privacy

- All data stored locally
- No cloud sync
- No login required
- Your progress saved in `backend/user_data.json`

## Troubleshooting

### Backend won't start
```bash
# Check Python version
python3 --version  # Need 3.8+

# Reinstall dependencies
cd app/backend
pip install -r requirements.txt
```

### Frontend won't start
```bash
# Check Node version
node --version  # Need 16+

# Reinstall dependencies
cd app/frontend
rm -rf node_modules
npm install
```

### Port already in use
```bash
# Kill process on port 5000 (backend)
lsof -ti:5000 | xargs kill -9

# Kill process on port 3000 (frontend)
lsof -ti:3000 | xargs kill -9
```

### Can't connect to backend
- Make sure backend is running (Terminal 1)
- Check `http://localhost:5000/api/health`
- Should return: `{"status": "ok", "topics": 17}`

## Next Steps

Once you're comfortable:
1. Complete all 17 topics
2. Take mock interview quizzes
3. Export your progress (Settings)
4. Review technical issues in `/docs/phase1_data/technical_review.md`

## Support

For detailed documentation:
- Read `app/README.md`
- Check frontend docs: `app/frontend/src/README.md`
- Review data: `/docs/phase1_data/README.md`

## Quick Commands Reference

```bash
# Setup (first time only)
cd /home/pankaj/cplusplus/proCplusplus/app && ./setup.sh

# Start backend
./run_backend.sh

# Start frontend
./run_frontend.sh

# View backend logs
tail -f backend.log

# Stop all
pkill -f "python3 app.py"
pkill -f "react-scripts start"

# Reset progress
rm backend/user_data.json

# Update dependencies
cd backend && pip install -r requirements.txt --upgrade
cd ../frontend && npm update
```

---

**Ready to master C++? Let's go! 🚀**

Open http://localhost:3000 and start learning!
