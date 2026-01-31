#!/bin/bash
echo "Starting backend server..."
cd "$(dirname "$0")/backend"
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi
npm run dev
