$ErrorActionPreference = 'Stop'
$helperDir = Join-Path $env:LOCALAPPDATA 'SystematicBoxelSurveyClipboard'
$helperScript = Join-Path $helperDir 'clipboard_helper.py'
Get-CimInstance Win32_Process -Filter "Name='python.exe' OR Name='pythonw.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($helperScript) } | ForEach-Object { Stop-Process -Id $_.ProcessId }
$startupShortcut = Join-Path ([Environment]::GetFolderPath('Startup')) 'Survey Clipboard Helper.lnk'
if (Test-Path -LiteralPath $startupShortcut) { Remove-Item -LiteralPath $startupShortcut }
Write-Output 'Clipboard helper stopped. Automatic startup removed; survey and installation files preserved.'
