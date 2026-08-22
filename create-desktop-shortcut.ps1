# Creates a "Disc" shortcut on the Desktop that silently launches the app
# (no console window) using the Disc icon. Run this once — after that,
# just double-click "Disc" on your Desktop.

$ErrorActionPreference = "Stop"

$wshShell = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "Disc.lnk"

$shortcut = $wshShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "$PSScriptRoot\launch-disc.vbs"
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.IconLocation = "$PSScriptRoot\electron\assets\disc-icon.ico"
$shortcut.Description = "Launch Disc"
$shortcut.Save()

Write-Host ""
Write-Host "Done! A 'Disc' shortcut was created on your Desktop." -ForegroundColor Green
Write-Host "Double-click it any time to launch Disc." -ForegroundColor Green
Write-Host ""
