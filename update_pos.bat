@echo off
title Quality Superstores POS - Remote Code Updater
cd /d "%~dp0"
cls
echo ========================================================
echo       QUALITY SUPERSTORES POS - SYSTEM UPDATER          
echo ========================================================
echo.
echo Connecting to GitHub repository to check for updates...
echo Branch: origin/dev
echo.

node scripts\update_pos.js

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo --------------------------------------------------------
    echo An error occurred during update check or installation.
    echo Please check your internet connection or contact admin.
    echo --------------------------------------------------------
    echo.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo --------------------------------------------------------
echo Update check and synchronization finished!
echo.
set /p LAUNCH="Do you want to start/restart the POS server now? (Y/N) [default: Y]: "
if /i "%LAUNCH%"=="" set LAUNCH=Y
if /i "%LAUNCH%"=="Y" (
    echo Launching Quality Superstores POS...
    call launch_pos.bat
) else (
    echo Done. You can launch POS anytime using launch_pos.bat.
    pause
)
