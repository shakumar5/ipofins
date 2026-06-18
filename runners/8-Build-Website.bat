@echo off
title IPOfins — Build Website
call "%~dp0_common.bat" || exit /b 1
echo.
echo ===================================================
echo   Build site (reads from Neon DB)
echo   Expect ~10-20 min (was ~30 min before optimization)
echo   Do NOT close this window until BUILD SUCCESS
echo ===================================================
echo.
call npm run build
echo.
if %errorlevel% neq 0 (echo BUILD FAILED) else (echo BUILD SUCCESS)
echo.
pause
