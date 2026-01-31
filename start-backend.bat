@echo off
echo Starting backend server...
cd /d "%~dp0backend"
if not exist node_modules (
    echo Installing dependencies...
    npm install
)
npm run dev
