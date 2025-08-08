#!/bin/bash

# Local Document Agent - Vector Service Startup Script
# Starts both the Node.js backend and Python vector service

echo "🚀 Starting Local Document Agent with Vector Store..."

# Function to check if a port is in use
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null ; then
        echo "⚠️  Port $1 is already in use"
        return 1
    else
        return 0
    fi
}

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3.8+"
    exit 1
fi

# Check if required Python packages are installed
echo "📦 Checking Python dependencies..."
if ! python3 -c "import chromadb, sentence_transformers, fastapi" 2>/dev/null; then
    echo "❌ Missing Python dependencies. Installing..."
    pip3 install -r requirements.txt
fi

# Check ports
echo "🔍 Checking ports..."
if ! check_port 3003; then
    echo "❌ Port 3003 (backend) is already in use"
    exit 1
fi

if ! check_port 8000; then
    echo "❌ Port 8000 (vector service) is already in use"
    exit 1
fi

if ! check_port 3000; then
    echo "❌ Port 3000 (frontend) is already in use"
    exit 1
fi

# Start Python vector service in background
echo "🐍 Starting Python vector service on port 8000..."
cd "$(dirname "$0")"
python3 vector_service.py &
VECTOR_PID=$!

# Wait a moment for vector service to start
sleep 3

# Check if vector service started successfully
if ! curl -s http://localhost:8000/health > /dev/null; then
    echo "❌ Vector service failed to start"
    kill $VECTOR_PID 2>/dev/null
    exit 1
fi

echo "✅ Vector service started successfully"

# Start Node.js backend
echo "🟢 Starting Node.js backend on port 3003..."
cd backend
npm run dev &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 3

# Check if backend started successfully
if ! curl -s http://localhost:3003/api/health > /dev/null; then
    echo "❌ Backend failed to start"
    kill $VECTOR_PID $BACKEND_PID 2>/dev/null
    exit 1
fi

echo "✅ Backend started successfully"

# Start frontend
echo "⚛️  Starting React frontend on port 3000..."
cd ../frontend
npm start &
FRONTEND_PID=$!

echo ""
echo "🎉 All services started successfully!"
echo ""
echo "📱 Frontend: http://localhost:3000"
echo "🔧 Backend: http://localhost:3003"
echo "🧠 Vector Service: http://localhost:8000"
echo ""
echo "📊 Health Checks:"
echo "   Frontend: http://localhost:3000"
echo "   Backend: http://localhost:3003/api/health"
echo "   Vector: http://localhost:8000/health"
echo ""
echo "🛑 Press Ctrl+C to stop all services"

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping all services..."
    kill $VECTOR_PID $BACKEND_PID $FRONTEND_PID 2>/dev/null
    echo "✅ All services stopped"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Wait for all background processes
wait 