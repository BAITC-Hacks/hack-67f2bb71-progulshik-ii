@echo off
setlocal
cd /d "%~dp0"
title AI Sana Challenge Hub
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is missing. Install Node.js 22.18 or newer, then run this file again.
  echo See docs\JURY_QUICKSTART.md for instructions.
  pause
  exit /b 1
)
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=18)?0:1)"
if errorlevel 1 (
  echo Node.js 22.18 or newer is required.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo npm is missing. Reinstall Node.js with npm enabled.
  pause
  exit /b 1
)
if not exist node_modules\express\package.json (
  echo Installing project dependencies. Internet access is needed on first run.
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo Installation failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)
echo Starting AI Sana. Keep this window open while using the app.
echo Open the address printed below in your browser. Default: http://127.0.0.1:3001
echo Press Ctrl+C to stop the server.
call npm start
echo The server has stopped.
pause
