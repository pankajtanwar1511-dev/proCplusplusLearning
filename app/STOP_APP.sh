#!/bin/bash

# C++ Master Pro - Stop Application Script (Fixed)

echo "Stopping C++ Master Pro..."

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

STOPPED_SOMETHING=false

# Function to kill process tree
kill_tree() {
    local pid=$1
    local sig=${2:-TERM}

    # Get all child processes
    local children=$(pgrep -P $pid 2>/dev/null)

    # Kill children first
    for child in $children; do
        kill_tree $child $sig
    done

    # Kill the process itself
    if kill -0 $pid 2>/dev/null; then
        kill -$sig $pid 2>/dev/null
    fi
}

# Stop by PID files first
if [ -f ".backend.pid" ]; then
    BACKEND_PID=$(cat .backend.pid)
    if kill -0 $BACKEND_PID 2>/dev/null; then
        echo -e "${BLUE}Stopping backend server (PID: $BACKEND_PID)...${NC}"
        kill_tree $BACKEND_PID
        sleep 1
        # Force kill if still alive
        if kill -0 $BACKEND_PID 2>/dev/null; then
            kill -9 $BACKEND_PID 2>/dev/null
        fi
        echo -e "${GREEN}✓ Backend stopped${NC}"
        STOPPED_SOMETHING=true
    fi
    rm -f .backend.pid
fi

if [ -f ".frontend.pid" ]; then
    FRONTEND_PID=$(cat .frontend.pid)
    if kill -0 $FRONTEND_PID 2>/dev/null; then
        echo -e "${BLUE}Stopping frontend server (PID: $FRONTEND_PID)...${NC}"
        kill_tree $FRONTEND_PID
        sleep 1
        # Force kill if still alive
        if kill -0 $FRONTEND_PID 2>/dev/null; then
            kill -9 $FRONTEND_PID 2>/dev/null
        fi
        echo -e "${GREEN}✓ Frontend stopped${NC}"
        STOPPED_SOMETHING=true
    fi
    rm -f .frontend.pid
fi

# Also kill any processes on ports 5000 and 3000
echo -e "${BLUE}Checking for processes on ports 5000 and 3000...${NC}"

# Kill backend port 5000
BACKEND_PIDS=$(lsof -ti:5000 2>/dev/null)
if [ ! -z "$BACKEND_PIDS" ]; then
    echo -e "${BLUE}Found processes on port 5000: $BACKEND_PIDS${NC}"
    for pid in $BACKEND_PIDS; do
        kill_tree $pid
        sleep 0.5
        # Force kill if still alive
        if kill -0 $pid 2>/dev/null; then
            kill -9 $pid 2>/dev/null
        fi
    done
    echo -e "${GREEN}✓ Port 5000 cleared${NC}"
    STOPPED_SOMETHING=true
fi

# Kill frontend port 3000
FRONTEND_PIDS=$(lsof -ti:3000 2>/dev/null)
if [ ! -z "$FRONTEND_PIDS" ]; then
    echo -e "${BLUE}Found processes on port 3000: $FRONTEND_PIDS${NC}"
    for pid in $FRONTEND_PIDS; do
        kill_tree $pid
        sleep 0.5
        # Force kill if still alive
        if kill -0 $pid 2>/dev/null; then
            kill -9 $pid 2>/dev/null
        fi
    done
    echo -e "${GREEN}✓ Port 3000 cleared${NC}"
    STOPPED_SOMETHING=true
fi

# Extra safety: kill any python app_v2.py processes
PYTHON_PIDS=$(pgrep -f "python.*app_v2.py" 2>/dev/null)
if [ ! -z "$PYTHON_PIDS" ]; then
    echo -e "${BLUE}Found Python backend processes: $PYTHON_PIDS${NC}"
    for pid in $PYTHON_PIDS; do
        kill_tree $pid
        sleep 0.5
        if kill -0 $pid 2>/dev/null; then
            kill -9 $pid 2>/dev/null
        fi
    done
    echo -e "${GREEN}✓ Python processes stopped${NC}"
    STOPPED_SOMETHING=true
fi

# Extra safety: kill any react-scripts processes
REACT_PIDS=$(pgrep -f "react-scripts" 2>/dev/null)
if [ ! -z "$REACT_PIDS" ]; then
    echo -e "${BLUE}Found React processes: $REACT_PIDS${NC}"
    for pid in $REACT_PIDS; do
        kill_tree $pid
        sleep 0.5
        if kill -0 $pid 2>/dev/null; then
            kill -9 $pid 2>/dev/null
        fi
    done
    echo -e "${GREEN}✓ React processes stopped${NC}"
    STOPPED_SOMETHING=true
fi

# Clean up log files
if [ -f "backend.log" ]; then
    echo "" >> backend.log
    echo "=== Server stopped at $(date) ===" >> backend.log
fi

if [ -f "frontend.log" ]; then
    echo "" >> frontend.log
    echo "=== Server stopped at $(date) ===" >> frontend.log
fi

echo ""
if [ "$STOPPED_SOMETHING" = true ]; then
    echo -e "${GREEN}✓ C++ Master Pro stopped successfully${NC}"
else
    echo -e "${YELLOW}No running instances found${NC}"
fi

# Verify ports are free
sleep 1
echo ""
echo -e "${BLUE}Verifying ports are free...${NC}"
if lsof -ti:5000 >/dev/null 2>&1; then
    echo -e "${RED}✗ Port 5000 still in use!${NC}"
    echo -e "${YELLOW}Run: kill -9 \$(lsof -ti:5000)${NC}"
else
    echo -e "${GREEN}✓ Port 5000 is free${NC}"
fi

if lsof -ti:3000 >/dev/null 2>&1; then
    echo -e "${RED}✗ Port 3000 still in use!${NC}"
    echo -e "${YELLOW}Run: kill -9 \$(lsof -ti:3000)${NC}"
else
    echo -e "${GREEN}✓ Port 3000 is free${NC}"
fi
