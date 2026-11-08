@echo off
cd /d "%~dp0"

:: 1. Check if POS server is already listening on port 3001
netstat -ano | findstr ":3001 " | findstr "LISTENING" >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    :: Server is not running; start in background
    where pm2 >nul 2>nul
    if %ERRORLEVEL% EQU 0 (
        call pm2 start ecosystem.config.js >nul 2>nul
    ) else (
        start /b "" node pos_server.js >nul 2>nul
    )
    :: Brief pause to let HTTP server bind port 3001
    timeout /t 2 /nobreak >nul 2>nul
)

:: 2. Launch in Full Desktop App Mode (Chrome or Edge or Default Browser)
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

:: Fallback to default system browser
start "" "http://localhost:3001"
exit /b 0
