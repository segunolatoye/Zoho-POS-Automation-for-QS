@echo off
TITLE Stop POS Server Hub
COLOR 0C

echo ===================================================
echo             STOPPING POS SERVER HUB
echo ===================================================
echo.

cd /d "%~dp0"

where pm2 >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [INFO] Stopping PM2 managed pos-server...
    call pm2 stop pos-server
    call pm2 delete pos-server
    echo [SUCCESS] PM2 pos-server stopped.
) else (
    echo [INFO] Terminating any running node pos_server instances...
    for /f "tokens=5" %%a in ('netstat -aon ^| find ":3001" ^| find "LISTENING"') do (
        echo Killing process ID: %%a
        taskkill /F /PID %%a
    )
    echo [SUCCESS] Port 3001 cleared.
)

pause

