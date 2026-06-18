@echo off
title IPOfins — Full Daily IPO + NAV (slow)
call "%~dp0_common.bat" || exit /b 1
echo.
echo ===================================================
echo   FULL Daily Pipeline — SLOW (30-60+ min)
echo   Enriches ALL IPO detail pages (closed + listed too)
echo   Use only weekly or when IPO data looks stale
echo ===================================================
echo.
call npm run pipeline:daily:full
echo.
if %errorlevel% neq 0 (echo FAILED) else (echo SUCCESS)
echo.
pause
