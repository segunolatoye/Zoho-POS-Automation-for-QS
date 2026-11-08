' Quality Superstores POS Silent Launcher
' Executes launch_pos.bat in the background with hidden window (WindowStyle = 0)

Set objFSO = CreateObject("Scripting.FileSystemObject")
strCurrentDir = objFSO.GetParentFolderName(WScript.ScriptFullName)

Set objShell = CreateObject("WScript.Shell")
objShell.CurrentDirectory = strCurrentDir

' Run launch_pos.bat completely hidden (0) without waiting (False)
objShell.Run "cmd /c launch_pos.bat", 0, False

