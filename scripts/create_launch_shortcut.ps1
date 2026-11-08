# ==============================================================================
# Quality Superstores POS - Desktop Shortcut & Windows Autorun Installer
# ==============================================================================

$root = (Get-Item $PSScriptRoot).Parent.FullName
$batPath = Join-Path $root "launch_pos.bat"
$iconPath = Join-Path $root "public\pos_icon.ico"

# 1. Dynamically locate user's Desktop & Startup folders (including OneDrive redirection)
$reg = Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders" -ErrorAction SilentlyContinue

$desktopPath = if ($reg.Desktop) { [Environment]::ExpandEnvironmentVariables($reg.Desktop) } else { [Environment]::GetFolderPath("Desktop") }
if (-not (Test-Path $desktopPath)) {
    $desktopPath = Join-Path $env:USERPROFILE "Desktop"
}

$startupPath = if ($reg.Startup) { [Environment]::ExpandEnvironmentVariables($reg.Startup) } else { [Environment]::GetFolderPath("Startup") }
if (-not (Test-Path $startupPath)) {
    $startupPath = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"
}

$WshShell = New-Object -ComObject WScript.Shell

# 2. Create Desktop Shortcut Icon
if (Test-Path $desktopPath) {
    $desktopShortcut = Join-Path $desktopPath "Quality Superstores POS.lnk"
    Write-Host "Creating Desktop shortcut at: $desktopShortcut"
    $shortcut = $WshShell.CreateShortcut($desktopShortcut)
    $shortcut.TargetPath = $batPath
    $shortcut.WorkingDirectory = $root
    $shortcut.IconLocation = "$iconPath,0"
    $shortcut.Description = "Quality Superstores - Offline Retail POS Terminal"
    $shortcut.WindowStyle = 7 # Minimized
    $shortcut.Save()
    Write-Host "  Desktop Shortcut Created Successfully!"
} else {
    Write-Warning "Could not find Desktop folder: $desktopPath"
}

# 3. Create Windows Startup Autorun Shortcut
if (Test-Path $startupPath) {
    $startupShortcut = Join-Path $startupPath "Quality Superstores POS.lnk"
    Write-Host "Configuring Windows Startup Autorun: $startupShortcut"
    $autoShortcut = $WshShell.CreateShortcut($startupShortcut)
    $autoShortcut.TargetPath = $batPath
    $autoShortcut.WorkingDirectory = $root
    $autoShortcut.IconLocation = "$iconPath,0"
    $autoShortcut.Description = "Quality Superstores POS (Autorun on boot)"
    $autoShortcut.WindowStyle = 7 # Minimized
    $autoShortcut.Save()
    Write-Host "  Startup Autorun Configured Successfully!"
} else {
    Write-Warning "Could not find Startup folder: $startupPath"
}

Write-Host ""
Write-Host "================================================================="
Write-Host "  SUCCESS! Quality Superstores POS Launch Icon & Autorun Ready"
Write-Host "================================================================="
Write-Host "  Desktop Icon:    $desktopShortcut"
Write-Host "  Startup Autorun: $startupShortcut"
Write-Host "  Icon Resource:   $iconPath"
Write-Host "================================================================="
