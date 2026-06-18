@echo off
title IPOfins — Fast daily routine
call "%~dp0_common.bat" || exit /b 1
echo.
echo  Fast daily update (~2-5 min total)
echo  =================================
echo  1. NAV refresh
echo  2. IPO listing (quick)
echo.
call npm run pipeline:daily
if errorlevel 1 exit /b 1
echo.
echo  Optional during open IPO season: run 7-IPO-Subscription-Pipeline.bat
echo  Then: 8-Build-Website.bat  and  git push
echo.
pause
