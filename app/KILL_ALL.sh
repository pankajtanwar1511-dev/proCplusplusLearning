#!/bin/bash

# Emergency Kill All Script
# Use this when STOP_APP.sh doesn't work

echo "🚨 EMERGENCY STOP - Killing all C++ Master Pro processes..."

# Kill everything on ports 5000 and 3000
echo "Killing port 5000..."
lsof -ti:5000 | xargs -r kill -9 2>/dev/null
echo "✓ Port 5000 cleared"

echo "Killing port 3000..."
lsof -ti:3000 | xargs -r kill -9 2>/dev/null
echo "✓ Port 3000 cleared"

# Kill any Python backend
echo "Killing Python backends..."
pkill -9 -f "python.*app_v2.py" 2>/dev/null
echo "✓ Python processes cleared"

# Kill any React processes
echo "Killing React frontends..."
pkill -9 -f "react-scripts" 2>/dev/null
pkill -9 -f "node.*frontend_v2" 2>/dev/null
echo "✓ React processes cleared"

# Clean up PID files
rm -f .backend.pid .frontend.pid

echo ""
echo "✅ All processes killed!"
echo ""
echo "Verify ports are free:"
echo "Backend (5000): $(lsof -ti:5000 | wc -l) processes"
echo "Frontend (3000): $(lsof -ti:3000 | wc -l) processes"
