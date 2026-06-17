@echo off
REM ═══════════════════════════════════════════════════════════════
REM IPOfins — Subscription & GMP Fetch + Push (Local)
REM 
REM Fetches category-wise subscription (Groww) and GMP (IPOWatch)
REM then commits and pushes to GitHub.
REM
REM USAGE:
REM   Double-click to run
REM   Or schedule via Windows Task Scheduler every 2-3 hours
REM ═══════════════════════════════════════════════════════════════

cd /d "c:\Users\shaik\Downloads\Testing\Finverse\finverseui"

echo.
echo ===================================================
echo   IPOfins — Subscription ^& GMP Update
echo   %date% %time%
echo ===================================================
echo.

REM 1. Pull latest
echo [1/3] Pulling latest from remote...
git pull --rebase --quiet
if %errorlevel% neq 0 (
    echo   WARNING: git pull failed. Continuing...
)

REM 2. Fetch subscription + GMP
echo.
echo [2/3] Fetching subscription ^& GMP data...
call node --use-system-ca scripts/fetch-subscription-gmp.mjs
if %errorlevel% neq 0 (
    echo   ERROR: Fetch failed. Aborting.
    pause
    exit /b 1
)

REM 3. Commit and push if changed
echo.
echo [3/3] Checking for changes...
git add src/data/ipos.json
git diff --cached --quiet src/data/ipos.json
if %errorlevel% == 0 (
    echo.
    echo   No changes to push.
    git reset --quiet src/data/ipos.json
    echo.
    timeout /t 3 >nul
    exit /b 0
)

git commit -m "chore: update subscription & GMP [%date:~-10%]"
git push

echo.
echo ===================================================
echo   Done! Subscription ^& GMP data pushed.
echo ===================================================
echo.
timeout /t 5 >nul
