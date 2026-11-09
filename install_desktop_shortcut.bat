@echo off
title Quality Superstores POS - Setup Desktop Shortcut
cd /d "%~dp0"
echo ========================================================
echo   Quality Superstores POS - Desktop Shortcut Installer  
echo ========================================================
echo.
echo Installing desktop shortcut icon and Windows autorun...
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\create_launch_shortcut.ps1"
echo.
pause
