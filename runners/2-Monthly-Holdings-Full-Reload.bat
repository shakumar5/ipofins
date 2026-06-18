@echo off
title IPOfins — Full Holdings Reload
call "%~dp0_common.bat" || exit /b 1
echo.
echo ===================================================
echo   Full Holdings Reload (all months)
echo   %date% %time%
echo ===================================================
echo.
call npm run pipeline:monthly -- --full
echo.
if %errorlevel% neq 0 (echo FAILED ^(error %errorlevel%^)) else (echo SUCCESS)
echo.
pause
