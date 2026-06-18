@echo off
title IPOfins — Daily IPO + NAV
call "%~dp0_common.bat" || exit /b 1
echo.
echo ===================================================
echo   Daily Pipeline (IPO broker sync + AMFI NAV)
echo ===================================================
echo.
call npm run pipeline:daily
echo.
if %errorlevel% neq 0 (echo FAILED) else (echo SUCCESS)
echo.
pause
