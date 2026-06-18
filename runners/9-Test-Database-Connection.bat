@echo off
title IPOfins — Test Database
call "%~dp0_common.bat" || exit /b 1
echo.
call node --use-system-ca db/test-connection.mjs
echo.
call node --use-system-ca db/check-full-counts.mjs
echo.
pause
