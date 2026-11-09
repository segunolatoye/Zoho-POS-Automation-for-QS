@echo off
TITLE Quality Superstores - One-Time Zoho Cloud Login
COLOR 0B
cd /d "%~dp0"

echo =================================================================
echo   Quality Superstores POS - One-Time Zoho Cloud Sign-In
echo =================================================================
echo.
echo [INFO] Opening Zoho Cloud in an visible browser window...
echo [INFO] Please sign into your Zoho account when prompted.
echo.

node scripts/login_zoho.js

echo.
pause

