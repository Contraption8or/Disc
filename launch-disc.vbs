' Silently launches Disc (no console window). This is what the desktop
' shortcut points at.
'
' Checks whether Disc is already running first, by trying to activate a
' window titled "Disc — Music Library" (Electron sets this from
' BrowserWindow's `title` option even though the window is frameless and
' draws no visible native caption bar — Windows' own window manager still
' knows it by that title). The title is deliberately this specific and not
' just "Disc": AppActivate does a case-insensitive *prefix* match against
' every open window, so a plain "Disc" can match something else entirely
' (a File Explorer window for a folder literally named "disc", say) and
' "activate" that instead of ever launching the app — the launcher
' silently does nothing, with no visible error since this whole script
' runs hidden.
' Without this check, clicking the shortcut while Disc is already open
' starts a second full Vite+Electron process tree that immediately
' collides with the first over port 5173 — Vite fails fast (server.
' strictPort in vite.config.js) and the whole thing exits within about a
' second, but silently, with no visible error (this whole script runs
' hidden) — which reads as "the shortcut doesn't do anything." Electron's
' own single-instance lock (see requestSingleInstanceLock in
' electron/main.js) can't catch this case on its own: the second Electron
' process usually never gets far enough to even run that check before
' concurrently's --kill-others tears it down.
Dim shell
Set shell = CreateObject("WScript.Shell")

If shell.AppActivate("Disc — Music Library") Then
  ' Already running — just brought it to the front, nothing else to do.
Else
  Dim fso, scriptDir
  Set fso = CreateObject("Scripting.FileSystemObject")
  scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
  shell.Run "cmd /c cd /d """ & scriptDir & """ && npm run dev", 0, False
End If
