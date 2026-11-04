# Noninteractive updater: build before stopping the currently running server.
param([string]$NodeExe, [int]$ServerPid, [int]$Port = 8970)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root 'projects\claude_hub\backend'
$RunDir = Join-Path $Root 'projects\claude_hub\data\run'
$env:PORT = [string]$Port
Set-Location -LiteralPath $Backend
& $NodeExe 'scripts/setup.js' --no-tools --no-git
if ($LASTEXITCODE -ne 0) { throw 'Update build failed; current server remains running.' }
# Do not kill the process tree: this updater was launched by the old server.
$Server = Get-CimInstance Win32_Process -Filter "ProcessId=$ServerPid"
if ($Server -and $Server.CommandLine.Replace('/', '\').IndexOf($Backend, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
  Write-Output "Stopping Clootee server PID=$ServerPid"
  Stop-Process -Id $ServerPid -Force
  Wait-Process -Id $ServerPid -Timeout 20 -ErrorAction SilentlyContinue
  if (Get-Process -Id $ServerPid -ErrorAction SilentlyContinue) {
    throw 'Old Clootee server is still running; restart aborted.'
  }
} else { throw 'Refusing to stop a process outside this installation.' }
$Deadline = (Get-Date).AddSeconds(20)
do {
  $Listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
  if (-not $Listener) { break }
  Start-Sleep -Milliseconds 250
} while ((Get-Date) -lt $Deadline)
if ($Listener) { throw "Port $Port did not become free; restart aborted." }
Write-Output 'Old Clootee server stopped and port released; starting updated service.'
& (Join-Path $PSScriptRoot 'win-service.ps1') -Action start -NodeExe $NodeExe -WorkDir $Backend -Entry (Join-Path $Backend 'dist\index.js') -RunDir $RunDir -Port $Port -WaitSeconds 60
if ($LASTEXITCODE -ne 0) { throw "Updated server failed to start: $LASTEXITCODE" }
