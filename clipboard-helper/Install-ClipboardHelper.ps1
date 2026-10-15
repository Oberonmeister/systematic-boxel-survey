param([string]$PythonPath, [string]$JournalDirectory, [string]$TabId, [switch]$StartWithWindows)
$ErrorActionPreference = 'Stop'
if (-not $PythonPath) {
    $runtimePython = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
    if (Test-Path -LiteralPath $runtimePython) { $PythonPath = $runtimePython }
    else { $PythonPath = (Get-Command python.exe -ErrorAction Stop).Source }
}
if (-not (Test-Path -LiteralPath $PythonPath)) { throw 'Python 3 is required. Pass -PythonPath with its full path.' }
$helperDir = Join-Path $env:LOCALAPPDATA 'SystematicBoxelSurveyClipboard'
New-Item -ItemType Directory -Force -Path $helperDir | Out-Null
$configPath = Join-Path $helperDir 'connection.json'
$jacobDir = Join-Path $env:APPDATA 'JACoB'
if (-not $JournalDirectory) {
    $pathsFile = Join-Path $jacobDir 'paths.json'
    if (Test-Path -LiteralPath $pathsFile) { $JournalDirectory = (Get-Content -LiteralPath $pathsFile -Raw | ConvertFrom-Json).paths.journalDir }
    if (-not $JournalDirectory) { throw 'Pass -JournalDirectory with the Elite journal folder shown in JACoB settings.' }
}
if (-not (Test-Path -LiteralPath $JournalDirectory -PathType Container)) { throw 'Journal directory does not exist.' }
if (-not $TabId) { throw 'Pass -TabId with the saved Systematic Boxel Survey tab ID from JACoB custom-tabs.json.' }
if (-not (Test-Path -LiteralPath (Join-Path $jacobDir ('custom-tabs\'+$TabId+'.html')))) { throw 'Saved survey tab was not found.' }
$statusPath = Join-Path $JournalDirectory 'SurveyClipboardStatus.json'
if ((Test-Path -LiteralPath $statusPath) -and (Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json).format -ne 'survey-clipboard-status') { throw 'An unrelated file already uses the helper status filename.' }
if (Test-Path -LiteralPath $configPath) { $token = (Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json).token }
if (-not $token) {
    $randomBytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($randomBytes) } finally { $rng.Dispose() }
    $token = ([System.BitConverter]::ToString($randomBytes)).Replace('-','').ToLowerInvariant()
}
@{format='survey-clipboard-helper';transport='jacob-store-v1';token=$token;tabId=$TabId;journalDir=$JournalDirectory;stateFile=(Join-Path $jacobDir 'tab-state.json');checkpointFile=(Join-Path $helperDir 'last-request.json')} | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
$helperScript = Join-Path $helperDir 'clipboard_helper.py'
# Stop only this helper's earlier instance when updating its implementation.
Get-CimInstance Win32_Process -Filter "Name='python.exe' OR Name='pythonw.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($helperScript) } | ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction Stop }
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'clipboard_helper.py') -Destination (Join-Path $helperDir 'clipboard_helper.py') -Force
$escapedPython = $PythonPath.Replace("'","''")
$launcher = @'
$ErrorActionPreference = 'Stop'
$helperDir = $PSScriptRoot
$configPath = Join-Path $helperDir 'connection.json'
Start-Process -FilePath '__PYTHON__' -ArgumentList @(('"'+(Join-Path $helperDir 'clipboard_helper.py')+'"'),'--config',('"'+$configPath+'"')) -WindowStyle Hidden -RedirectStandardError (Join-Path $helperDir 'helper-error.log')
'@
$launchPath = Join-Path $helperDir 'Start-ClipboardHelper.ps1'
$launcher.Replace('__PYTHON__',$escapedPython) | Set-Content -LiteralPath $launchPath -Encoding UTF8
$shell = New-Object -ComObject WScript.Shell
function New-HelperShortcut([string]$path) {
    $shortcut = $shell.CreateShortcut($path)
    $shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $shortcut.Arguments = '-NoProfile -WindowStyle Hidden -File "'+$launchPath+'"'
    $shortcut.WorkingDirectory = $helperDir
    $shortcut.WindowStyle = 7
    $shortcut.Description = 'Write survey targets to the Windows clipboard while Elite has focus.'
    $shortcut.Save()
}
New-HelperShortcut (Join-Path ([Environment]::GetFolderPath('Programs')) 'Survey Clipboard Helper.lnk')
if ($StartWithWindows) { New-HelperShortcut (Join-Path ([Environment]::GetFolderPath('Startup')) 'Survey Clipboard Helper.lnk') }
& $launchPath
Write-Output ('Installed. Connect this file in the survey tab: '+$configPath)
