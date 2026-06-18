@echo off
cd /d "%~dp0.."
echo.
echo  IPOfins — Pre-deploy (NAV refresh + DB verify)
echo  =============================================
call npm run predeploy
if errorlevel 1 exit /b 1
echo.
echo  Next: npm run build
echo  Then:  git push origin main
echo.
pause
