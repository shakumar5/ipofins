@echo off
title IPOfins — Monthly Holdings Update
call "%~dp0_common.bat" || exit /b 1
echo.
echo ===================================================
echo   Monthly Holdings (incremental — latest month)
echo   %date% %time%
echo ===================================================
echo.
call npm run pipeline:monthly
echo.
if %errorlevel% neq 0 (echo FAILED ^(error %errorlevel%^)) else (echo SUCCESS)
echo.
pause
