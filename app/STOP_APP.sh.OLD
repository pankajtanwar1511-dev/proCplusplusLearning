#!/bin/bash

# C++ Master Pro - Stop Application Script

set -e

echo "Stopping C++ Master Pro..."

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if PID files exist
if [ ! -f ".backend.pid" ] && [ ! -f ".frontend.pid" ]; then
    echo -e "${YELLOW}No running instances found${NC}"
    exit 0
fi

# Stop backend
if [ -f ".backend.pid" ]; then
    BACKEND_PID=$(cat .backend.pid)
    if kill -0 $BACKEND_PID 2>/dev/null; then
        echo -e "${BLUE}Stopping backend server (PID: $BACKEND_PID)...${NC}"
        kill $BACKEND_PID
        echo -e "${GREEN}✓ Backend stopped${NC}"
    else
        echo -e "${YELLOW}Backend already stopped${NC}"
    fi
    rm .backend.pid
fi

# Stop frontend
if [ -f ".frontend.pid" ]; then
    FRONTEND_PID=$(cat .frontend.pid)
    if kill -0 $FRONTEND_PID 2>/dev/null; then
        echo -e "${BLUE}Stopping frontend server (PID: $FRONTEND_PID)...${NC}"
        kill $FRONTEND_PID
        echo -e "${GREEN}✓ Frontend stopped${NC}"
    else
        echo -e "${YELLOW}Frontend already stopped${NC}"
    fi
    rm .frontend.pid
fi

echo ""
echo -e "${GREEN}C++ Master Pro stopped successfully${NC}"
