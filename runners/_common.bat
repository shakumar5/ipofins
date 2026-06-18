@echo off
REM Shared setup — called by other runners in this folder
cd /d "%~dp0.."
where node >nul 2>&1 || (
  echo.
  echo ERROR: Node.js not found. Install from https://nodejs.org
  pause
  exit /b 1
)
where npm >nul 2>&1 || (
  echo.
  echo ERROR: npm not found. Install Node.js from https://nodejs.org
  pause
  exit /b 1
)
