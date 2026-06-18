@echo off
title IPOfins — Database Health Audit
call "%~dp0_common.bat" || exit /b 1
echo.
echo ===================================================
echo   Database Health Audit
echo ===================================================
echo.
call node scripts/audit-db-health.mjs
echo.
pause
