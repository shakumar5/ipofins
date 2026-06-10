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

REM 1. Fetch IPO + Mutual Fund data (Zerodha, AMFI, mfapi, SEBI)
echo [1/3] Fetching IPO + Mutual Fund data...
call node scripts/fetch-all-data.mjs

REM 2. Parse holdings if new Excel files exist in Holdings folder
echo.
echo [2/3] Checking for new holdings data...
if exist "C:\Users\shaik\Downloads\Holdings\*.xlsx" (
    call node scripts/parse-holdings.mjs
) else if exist "C:\Users\shaik\Downloads\Holdings\*.xls" (
    call node scripts/parse-holdings.mjs
) else (
    echo   No new holdings files found. Skipping.
)

REM 3. Check if any data files changed
echo.
echo [3/3] Checking for changes...
git diff --quiet src/data/
if %errorlevel% == 0 (
    echo.
    echo   No data changes detected. Nothing to push.
    echo.
    pause
    exit /b 0
)

REM Stage only data files, commit, and push
git add src/data/
git commit -m "chore: auto-update data [%date%]"
git push

echo.
echo ===================================================
echo   Done! Data updated and pushed to GitHub.
echo   Vercel will auto-deploy in ~2 minutes.
echo ===================================================
echo.
pause
