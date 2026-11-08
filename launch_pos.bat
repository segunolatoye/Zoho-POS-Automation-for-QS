@echo off
TITLE Quality Superstores POS Launcher
cd /d "%~dp0"

:: 1. Check if POS Server is already running on port 3001
netstat -ano | findstr ":3001" | findstr "LISTENING" >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [INFO] Launching Quality Superstores POS Server...
    start "Quality Superstores POS Server" /min cmd /c "node pos_server.js"
    timeout /t 2 /nobreak >nul 2>nul
)

:: 2. Open POS Interface in Desktop App Mode
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app=http://localhost:3001 --start-maximized
    exit /b 0
)

if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" --app=http://localhost:3001 --start-maximized
    exit /b 0
)

if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app=http://localhost:3001 --start-maximized
    exit /b 0
)

if exist "C:\Program Files\Microsoft\Edge\Application\msedge.exe" (
    start "" "C:\Program Files\Microsoft\Edge\Application\msedge.exe" --app=http://localhost:3001 --start-maximized
    exit /b 0
)

:: Fallback to default browser
start "" "http://localhost:3001"
exit /b 0
