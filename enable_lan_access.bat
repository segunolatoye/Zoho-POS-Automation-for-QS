@echo off
title Quality Superstores POS - Open Local Network Firewall (Port 3001)
color 0A
cd /d "%~dp0"

echo ================================================================
echo   Quality Superstores POS - Local Network & Firewall Setup
echo ================================================================
echo.
echo Enabling other cashier PCs, phones, and tablets on this Wi-Fi
echo to connect to the POS Server Hub at port 3001...
echo.

netsh advfirewall firewall delete rule name="Quality Superstores POS (Port 3001)" >nul 2>&1
netsh advfirewall firewall add rule name="Quality Superstores POS (Port 3001)" dir=in action=allow protocol=TCP localport=3001 profile=any

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [NOTICE] Administrator privileges are required to configure Windows Firewall.
    echo Re-launching with Administrator permission...
    powershell -Command "Start-Process cmd -ArgumentList '/c netsh advfirewall firewall delete rule name=\"Quality Superstores POS (Port 3001)\" & netsh advfirewall firewall add rule name=\"Quality Superstores POS (Port 3001)\" dir=in action=allow protocol=TCP localport=3001 profile=any & echo. & echo [SUCCESS] Port 3001 successfully opened in Windows Firewall! & echo Other PCs can now connect to http://192.168.100.18:3001 & timeout /t 5' -Verb RunAs"
    exit /b 0
)

echo.
echo ================================================================
echo [SUCCESS] Windows Defender Firewall has allowed Port 3001!
echo Other PCs can now connect to: http://192.168.100.18:3001
echo ================================================================
echo.
pause
