# Noninteractive updater: build before stopping the currently running server.
param([string]$NodeExe, [int]$ServerPid, [int]$Port = 8970)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root 'projects\claude_hub\backend'
$RunDir = Join-Path $Root 'projects\claude_hub\data\run'
Set-Location -LiteralPath $Backend
& $NodeExe 'scripts/setup.js' --no-tools --no-git
if ($LASTEXITCODE -ne 0) { throw 'Update build failed; current server remains running.' }
# Do not kill the process tree: this updater was launched by the old server.
$Server = Get-CimInstance Win32_Process -Filter "ProcessId=$ServerPid"
if ($Server -and $Server.CommandLine.Replace('/', '\').IndexOf($Backend, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
  Stop-Process -Id $ServerPid -Force
} else { throw 'Refusing to stop a process outside this installation.' }
$Deadline = (Get-Date).AddSeconds(20)
do {
  $Listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
  if (-not $Listener) { break }
  Start-Sleep -Milliseconds 250
} while ((Get-Date) -lt $Deadline)
& (Join-Path $PSScriptRoot 'win-service.ps1') -Action start -NodeExe $NodeExe -WorkDir $Backend -Entry (Join-Path $Backend 'dist\index.js') -RunDir $RunDir -Port $Port -WaitSeconds 60
if ($LASTEXITCODE -ne 0) { throw "Updated server failed to start: $LASTEXITCODE" }
