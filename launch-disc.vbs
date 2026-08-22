' Silently launches Disc (no console window). This is what the desktop
' shortcut points at.
Dim fso, scriptDir, shell
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

Set shell = CreateObject("WScript.Shell")
shell.Run "cmd /c cd /d """ & scriptDir & """ && npm run dev", 0, False
