@echo off
echo ============================================
echo  PROACT Sync Agent - Installation
echo ============================================
echo.

echo Step 1: Checking Node.js...
node --version
IF %ERRORLEVEL% NEQ 0 (
  echo ERROR: Node.js not found. Download from https://nodejs.org and install first.
  pause
  exit /b 1
)

echo.
echo Step 2: Installing dependencies...
npm install

echo.
echo Step 3: Running discovery to find PROACT tables...
node discover.js

echo.
echo ============================================
echo  Copy the output above and send to Saif
echo ============================================
pause
