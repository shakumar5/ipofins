@echo off
title IPOfins — IPO Subscription
call "%~dp0_common.bat" || exit /b 1
echo.
call npm run pipeline:subscription
echo.
if %errorlevel% neq 0 (echo FAILED) else (echo SUCCESS)
echo.
pause
