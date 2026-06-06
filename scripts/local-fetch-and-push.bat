@echo off
REM ═══════════════════════════════════════════════════════════════
REM IPOfins — Local Data Fetch & Push to GitHub
REM Run this every 12 hours via Windows Task Scheduler
REM ═══════════════════════════════════════════════════════════════

cd /d "c:\Users\shaik\Downloads\Testing\Finverse\finverseui"

echo [%date% %time%] Starting data fetch...

REM Fetch IPO + Mutual Fund data locally (bypasses Cloudflare)
call node scripts/fetch-all-data.mjs

REM Check if any data files changed
git diff --quiet src/data/
if %errorlevel% == 0 (
    echo [%date% %time%] No data changes detected. Skipping push.
    exit /b 0
)

REM Stage only data files, commit, and push
git add src/data/
git commit -m "chore: auto-update data [%date%]"
git push

echo [%date% %time%] Data updated and pushed to GitHub.
