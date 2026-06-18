@echo off
title IPOfins — AMC Coverage Report
call "%~dp0_common.bat" || exit /b 1
echo.
call node scripts/report-missing-amcs.mjs
echo.
pause
