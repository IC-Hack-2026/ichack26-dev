@echo off
echo Starting frontend server...
cd /d "%~dp0frontend"
if not exist node_modules (
    echo Installing dependencies...
    npm install
)
npm run dev
