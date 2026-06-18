@echo off
title IPOfins — Holdings By AMC
call "%~dp0_common.bat" || exit /b 1
echo.
call node scripts/report-holdings-by-amc.mjs
echo.
pause
