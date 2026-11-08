@echo off
TITLE Quality Superstores POS Server
COLOR 0A
cd /d "%~dp0"

echo ===================================================
echo     STARTING RETAIL POS SERVER HUB (PORT 3001)
echo ===================================================
echo.
echo [INFO] Access the terminal at: http://localhost:3001
echo [INFO] Local Network access:  http://192.168.100.18:3001
echo.

:: Automatically open browser after 2 seconds
start /b "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3001"

:: Run Node.js POS Server
node pos_server.js
pause
