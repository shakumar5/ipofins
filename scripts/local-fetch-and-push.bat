@echo off
REM ═══════════════════════════════════════════════════════════════
REM IPOfins — Local Data Fetch & Push to GitHub
REM 
REM USAGE:
REM   Double-click to run (fetches IPO + MF data, pushes to GitHub)
REM   Or schedule via Windows Task Scheduler every 12 hours
REM
REM   For holdings update (monthly): 
REM     1. Download AMC Excel files to C:\Users\shaik\Downloads\Holdings\
REM     2. Double-click this file — it auto-detects new holdings
REM ═══════════════════════════════════════════════════════════════

cd /d "c:\Users\shaik\Downloads\Testing\Finverse\finverseui"

echo.
echo ===================================================
echo   IPOfins — Data Refresh
echo   %date% %time%
echo ===================================================
echo.

REM 1. Pull latest changes first to avoid conflicts
echo [1/4] Pulling latest from remote...
git pull --rebase --quiet
if %errorlevel% neq 0 (
    echo   WARNING: git pull failed. Continuing with local state...
)

REM 2. Fetch IPO + Mutual Fund data (Zerodha, AMFI, mfapi, SEBI)
echo.
echo [2/4] Fetching IPO + Mutual Fund data...
call node scripts/fetch-all-data.mjs
if %errorlevel% neq 0 (
    echo.
    echo   ERROR: Data fetch script failed. Aborting.
    echo.
    pause
    exit /b 1
)

REM 3. Parse holdings if new Excel files exist in Holdings folder
echo.
echo [3/4] Checking for new holdings data...
if exist "C:\Users\shaik\Downloads\Holdings\*.xlsx" (
    call node scripts/parse-holdings.mjs
) else if exist "C:\Users\shaik\Downloads\Holdings\*.xls" (
    call node scripts/parse-holdings.mjs
) else (
    echo   No new holdings files found. Skipping.
)

REM 4. Check if any data files changed (working tree OR staged)
echo.
echo [4/4] Checking for changes...
git add src/data/
git diff --cached --quiet src/data/
if %errorlevel% == 0 (
    echo.
    echo   No data changes detected. Nothing to push.
    echo.
    git reset --quiet src/data/
    pause
    exit /b 0
)

REM Commit and push
git commit -m "chore: auto-update data [%date%]"
git push

echo.
echo ===================================================
echo   Done! Data updated and pushed to GitHub.
echo   Vercel will auto-deploy in ~2 minutes.
echo ===================================================
echo.
pause
