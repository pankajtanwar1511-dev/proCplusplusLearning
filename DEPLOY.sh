#!/bin/bash

# Quick Deployment Setup Script
# Prepares the project for free deployment on Render + Vercel

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║     C++ Master Pro - Deployment Setup (FREE)                  ║"
echo "║     Render (Backend) + Vercel (Frontend) = $0/month           ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "render.yaml" ]; then
    echo -e "${RED}Error: render.yaml not found${NC}"
    echo "Please run this script from the project root directory"
    exit 1
fi

echo -e "${BLUE}Step 1: Checking Git status...${NC}"
if ! git status > /dev/null 2>&1; then
    echo -e "${RED}Error: Not a git repository${NC}"
    echo "Please initialize git first: git init"
    exit 1
fi
echo -e "${GREEN}✓ Git repository found${NC}"
echo ""

echo -e "${BLUE}Step 2: Checking required files...${NC}"

# Check render.yaml
if [ -f "render.yaml" ]; then
    echo -e "${GREEN}✓ render.yaml found${NC}"
else
    echo -e "${RED}✗ render.yaml missing${NC}"
    exit 1
fi

# Check requirements
if [ -f "app/backend/requirements_v2.txt" ]; then
    if grep -q "gunicorn" app/backend/requirements_v2.txt; then
        echo -e "${GREEN}✓ requirements_v2.txt with gunicorn${NC}"
    else
        echo -e "${YELLOW}⚠ gunicorn not in requirements${NC}"
    fi
else
    echo -e "${RED}✗ requirements_v2.txt missing${NC}"
    exit 1
fi

# Check vercel.json
if [ -f "app/frontend/vercel.json" ]; then
    echo -e "${GREEN}✓ vercel.json found${NC}"
else
    echo -e "${RED}✗ vercel.json missing${NC}"
    exit 1
fi

# Check .env.production
if [ -f "app/frontend/.env.production" ]; then
    echo -e "${GREEN}✓ .env.production found${NC}"
else
    echo -e "${YELLOW}⚠ .env.production missing${NC}"
fi

echo ""

echo -e "${BLUE}Step 3: Checking data files...${NC}"
if [ -d "processed_data/json_output" ]; then
    file_count=$(find processed_data/json_output -name "*.json" | wc -l)
    echo -e "${GREEN}✓ Found $file_count JSON data files${NC}"
else
    echo -e "${RED}✗ processed_data/json_output directory missing${NC}"
    exit 1
fi
echo ""

echo -e "${BLUE}Step 4: Checking uncommitted changes...${NC}"
if git diff-index --quiet HEAD --; then
    echo -e "${GREEN}✓ No uncommitted changes${NC}"
else
    echo -e "${YELLOW}⚠ You have uncommitted changes${NC}"
    echo ""
    echo "Would you like to commit and push now? (y/n)"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        echo ""
        echo "Enter commit message:"
        read -r commit_message
        git add .
        git commit -m "$commit_message"
        git push origin main
        echo -e "${GREEN}✓ Changes committed and pushed${NC}"
    else
        echo -e "${YELLOW}Please commit and push manually before deploying${NC}"
    fi
fi
echo ""

echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                  ✅ READY FOR DEPLOYMENT!                       ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${BLUE}Next Steps:${NC}"
echo ""
echo -e "${YELLOW}1. Deploy Backend to Render:${NC}"
echo "   - Go to https://render.com"
echo "   - Click 'New +' → 'Web Service'"
echo "   - Connect your GitHub repository"
echo "   - Render will auto-detect render.yaml"
echo "   - Select 'Free' plan"
echo "   - Click 'Create Web Service'"
echo "   - Wait 3-5 minutes"
echo "   - Copy your backend URL"
echo ""

echo -e "${YELLOW}2. Update Frontend API URL:${NC}"
echo "   - Edit app/frontend/.env.production"
echo "   - Set REACT_APP_API_URL=https://your-backend-url.onrender.com"
echo "   - Commit and push the change"
echo ""

echo -e "${YELLOW}3. Deploy Frontend to Vercel:${NC}"
echo "   Option A - Using CLI (Recommended):"
echo "     npm install -g vercel"
echo "     cd app/frontend"
echo "     vercel --prod"
echo ""
echo "   Option B - Using Dashboard:"
echo "     - Go to https://vercel.com"
echo "     - Click 'Add New...' → 'Project'"
echo "     - Import your GitHub repository"
echo "     - Root Directory: app/frontend"
echo "     - Framework: Create React App"
echo "     - Environment Variable: REACT_APP_API_URL"
echo "     - Click 'Deploy'"
echo ""

echo -e "${BLUE}📖 Full guide available in: DEPLOYMENT_GUIDE.md${NC}"
echo ""

echo -e "${GREEN}🎉 Good luck with your deployment!${NC}"
echo ""
