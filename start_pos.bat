@echo off
TITLE POS Server Hub Launcher
COLOR 0A

echo ===================================================
echo     STARTING RETAIL POS SERVER HUB (PORT 3001)
echo ===================================================
echo.

cd /d "%~dp0"

:: Check if PM2 is installed globally
where pm2 >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [INFO] Detected PM2 Process Manager.
    echo [INFO] Launching via ecosystem.config.js...
    call pm2 start ecosystem.config.js
    echo.
    echo POS Server is running in background under PM2!
    echo Access the terminal at: http://localhost:3001
    echo Local Network access:  http://192.168.100.18:3001
    timeout /t 5
) else (
    echo [INFO] PM2 not found globally. Running direct Node.js process...
    echo [INFO] Server logs will display below. Press Ctrl+C to stop.
    echo.
    node pos_server.js
)
pause

