#!/bin/bash

echo "======================================================================"
echo "C++ Master Pro - Quick Start Script"
echo "======================================================================"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running from correct directory
if [ ! -d "backend" ] || [ ! -d "../processed_data" ]; then
    echo -e "${YELLOW}⚠️  Please run this script from the app/ directory${NC}"
    exit 1
fi

echo -e "${BLUE}Step 1: Setting up Python backend...${NC}"
cd backend

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install requirements
echo "Installing Python dependencies..."
pip install -q -r requirements_v2.txt

echo -e "${GREEN}✅ Backend setup complete!${NC}"
echo ""

# Test the backend
echo -e "${BLUE}Step 2: Testing backend...${NC}"
python3 << 'EOF'
import json
from pathlib import Path

# Check if data exists
JSON_DIR = Path(__file__).parent.parent.parent / 'processed_data' / 'json_output'

if not JSON_DIR.exists():
    print("❌ Error: processed_data/json_output/ directory not found!")
    print("   Please run the data processing script first.")
    exit(1)

# Load master index
try:
    with open(JSON_DIR / 'master_index.json', 'r') as f:
        data = json.load(f)

    print(f"✅ Data loaded successfully!")
    print(f"   - Chapters: {data['statistics']['total_chapters']}")
    print(f"   - Topics: {data['statistics']['total_topics']}")
except Exception as e:
    print(f"❌ Error loading data: {e}")
    exit(1)
EOF

if [ $? -ne 0 ]; then
    exit 1
fi

echo ""
echo -e "${GREEN}======================================================================"
echo "✅ Setup Complete!"
echo "======================================================================"
echo ""
echo "To start the backend server:"
echo -e "${BLUE}  cd app/backend"
echo "  source venv/bin/activate"
echo -e "  python3 app_v2.py${NC}"
echo ""
echo "The API will be available at: http://localhost:5000"
echo ""
echo "API Endpoints:"
echo "  GET  /api/health          - Health check"
echo "  GET  /api/overview        - Content overview"
echo "  GET  /api/chapters        - List chapters"
echo "  GET  /api/chapter/1       - Chapter 1 details"
echo "  GET  /api/topic/1/0       - Topic content"
echo "  GET  /api/quiz/1/0        - Generate quiz"
echo "  GET  /api/stats           - User statistics"
echo ""
echo "Test the API:"
echo -e "${BLUE}  curl http://localhost:5000/api/health${NC}"
echo ""
echo "======================================================================"
echo ""

# Ask if user wants to start the server now
read -p "Start the backend server now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]
then
    echo ""
    echo -e "${GREEN}Starting backend server...${NC}"
    echo "Press Ctrl+C to stop"
    echo ""
    python3 app_v2.py
fi
