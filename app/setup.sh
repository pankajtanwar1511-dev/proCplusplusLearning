#!/bin/bash

echo "🚀 C++ Master - Setup Script"
echo "================================"
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3.8+."
    exit 1
fi
echo "✅ Python found: $(python3 --version)"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 16+."
    exit 1
fi
echo "✅ Node.js found: $(node --version)"

# Setup Backend
echo ""
echo "📦 Setting up Backend..."
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
echo "✅ Backend dependencies installed"

# Setup Frontend
echo ""
echo "📦 Setting up Frontend..."
cd ../frontend
npm install
echo "✅ Frontend dependencies installed"

echo ""
echo "✅ Setup complete!"
echo ""
echo "To start the app:"
echo "  1. Start backend:  cd app && ./run_backend.sh"
echo "  2. Start frontend: cd app && ./run_frontend.sh"
echo "  3. Open browser:   http://localhost:3000"
