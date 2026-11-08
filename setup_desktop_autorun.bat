@echo off
TITLE Quality Superstores POS - Desktop Shortcut & Autorun Installer
COLOR 0B
cd /d "%~dp0"

echo =================================================================
echo   Quality Superstores POS - Desktop Shortcut & Autorun Setup
echo =================================================================
echo.
echo Installing desktop shortcut and Windows boot autorun...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\create_launch_shortcut.ps1"

echo.
echo Setup completed! You can now launch the POS from your Desktop
echo or let it start automatically when Windows boots.
echo.
pause
