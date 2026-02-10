#!/bin/bash

# C++ Master Pro - Complete Application Startup Script
# This script starts both backend and frontend servers

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║          C++ Master Pro - World-Class Learning App            ║"
echo "║           Evidence-Based Learning with Beautiful UI            ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if backend directory exists
if [ ! -d "backend" ]; then
    echo -e "${RED}Error: backend directory not found${NC}"
    echo "Please run this script from the app directory"
    exit 1
fi

# Check if frontend directory exists
if [ ! -d "frontend_v2" ]; then
    echo -e "${RED}Error: frontend_v2 directory not found${NC}"
    echo "Please run this script from the app directory"
    exit 1
fi

# Function to check if port is in use
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        return 0
    else
        return 1
    fi
}

# Check if ports are available
echo -e "${BLUE}Checking port availability...${NC}"
if check_port 5000; then
    echo -e "${YELLOW}Warning: Port 5000 (backend) is already in use${NC}"
    echo "Please stop the existing process or change the port"
    exit 1
fi

if check_port 3000; then
    echo -e "${YELLOW}Warning: Port 3000 (frontend) is already in use${NC}"
    echo "Please stop the existing process or change the port"
    exit 1
fi

echo -e "${GREEN}✓ Ports 5000 and 3000 are available${NC}"
echo ""

# ============================================================================
# BACKEND SETUP
# ============================================================================

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}                    BACKEND SETUP                              ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

cd backend

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}Creating Python virtual environment...${NC}"
    python3 -m venv venv
    echo -e "${GREEN}✓ Virtual environment created${NC}"
else
    echo -e "${GREEN}✓ Virtual environment already exists${NC}"
fi

# Activate virtual environment
echo -e "${BLUE}Activating virtual environment...${NC}"
source venv/bin/activate

# Install/upgrade dependencies
echo -e "${BLUE}Installing backend dependencies...${NC}"
pip install -q --upgrade pip
pip install -q -r requirements_v2.txt
echo -e "${GREEN}✓ Backend dependencies installed${NC}"
echo ""

# Start backend in background
echo -e "${BLUE}Starting Flask backend server...${NC}"
python3 app_v2.py > ../backend.log 2>&1 &
BACKEND_PID=$!
echo -e "${GREEN}✓ Backend server started (PID: $BACKEND_PID)${NC}"
echo -e "${GREEN}  Logs: app/backend.log${NC}"
echo -e "${GREEN}  API: http://localhost:5000/api${NC}"
echo ""

cd ..

# ============================================================================
# FRONTEND SETUP
# ============================================================================

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}                    FRONTEND SETUP                             ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

cd frontend_v2

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing frontend dependencies (this may take a few minutes)...${NC}"
    npm install
    echo -e "${GREEN}✓ Frontend dependencies installed${NC}"
else
    echo -e "${GREEN}✓ Frontend dependencies already installed${NC}"
fi

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo -e "${BLUE}Creating .env file...${NC}"
    cp .env.example .env
    echo -e "${GREEN}✓ .env file created${NC}"
fi

echo ""

# Wait for backend to be ready
echo -e "${BLUE}Waiting for backend to be ready...${NC}"
MAX_ATTEMPTS=30
ATTEMPT=0
while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    if curl -s http://localhost:5000/api/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Backend is ready!${NC}"
        break
    fi
    ATTEMPT=$((ATTEMPT + 1))
    echo -n "."
    sleep 1
done

if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
    echo ""
    echo -e "${RED}Error: Backend failed to start${NC}"
    echo "Check app/backend.log for details"
    kill $BACKEND_PID 2>/dev/null
    exit 1
fi

echo ""
echo ""

# Start frontend
echo -e "${BLUE}Starting React frontend server...${NC}"
echo ""
npm start > ../frontend.log 2>&1 &
FRONTEND_PID=$!

echo -e "${GREEN}✓ Frontend server starting (PID: $FRONTEND_PID)${NC}"
echo -e "${GREEN}  Logs: app/frontend.log${NC}"
echo ""

cd ..

# ============================================================================
# SUCCESS
# ============================================================================

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                     🎉 SUCCESS! 🎉                             ║${NC}"
echo -e "${GREEN}║             C++ Master Pro is now running!                     ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Backend API:${NC}  http://localhost:5000/api"
echo -e "${BLUE}Frontend UI:${NC}  http://localhost:3000 ${YELLOW}(opening in browser...)${NC}"
echo ""
echo -e "${YELLOW}Process IDs:${NC}"
echo -e "  Backend:  $BACKEND_PID"
echo -e "  Frontend: $FRONTEND_PID"
echo ""
echo -e "${YELLOW}Logs:${NC}"
echo -e "  Backend:  app/backend.log"
echo -e "  Frontend: app/frontend.log"
echo ""
echo -e "${BLUE}To stop the servers:${NC}"
echo -e "  kill $BACKEND_PID $FRONTEND_PID"
echo ""
echo -e "${BLUE}Or use:${NC}"
echo -e "  ./STOP_APP.sh"
echo ""

# Save PIDs to file for stop script
echo "$BACKEND_PID" > .backend.pid
echo "$FRONTEND_PID" > .frontend.pid

# Wait a bit then open browser
sleep 3
if command -v xdg-open > /dev/null; then
    xdg-open http://localhost:3000 2>/dev/null &
elif command -v open > /dev/null; then
    open http://localhost:3000 2>/dev/null &
fi

echo -e "${GREEN}Enjoy your world-class learning experience! 🚀${NC}"
echo ""

# Keep script running
wait
