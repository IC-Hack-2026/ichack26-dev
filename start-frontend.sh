#!/bin/bash
echo "Starting frontend server..."
cd "$(dirname "$0")/frontend"
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi
npm run dev
