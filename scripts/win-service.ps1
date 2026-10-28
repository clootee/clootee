# =============================================================================
#  claude-hub - Windows background service helper.
#  Called by scripts\start-windows.bat / scripts\stop-windows.bat - not for direct use.
#
#  Why this file exists
#  --------------------
#  The launcher used to run node in the FOREGROUND, so the black console window
#  WAS the server's lifetime: users closed the window and the service died
#  mid-task. Here the server is spawned as a hidden, detached child of cmd.exe
#  (its own console, stdout/stderr redirected to a file), so the launcher window
#  can be closed safely while the server keeps running.
#
#  Actions
#  -------
#    start   spawn hidden + wait until the port accepts. Exit codes:
#              0  started           10 already running (ours)
#             11 port held by someone else (caller decides what to do)
#             12 an instance is still booting
#              1  failed (log tail is printed)
#    stop    stop by pid file -> by install path -> by port owner.
#            Only processes verified to belong to THIS install are ever killed.
#    status  print pid file, port owner and log location
#
#  This file is deliberately ASCII-only: Windows PowerShell 5.1 reads .ps1 files
#  as ANSI unless they carry a UTF-8 BOM, so non-ASCII here would be mojibake.
#  User-facing wording lives in the .bat files, which set chcp 65001.
# =============================================================================
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('start', 'stop', 'status')]
  [string]$Action,

  [string]$NodeExe = '',
  [string]$WorkDir = '',
  # absolute path of the script node should run (dist\index.js, or src\index.ts)
  [string]$Entry = '',
  # when set (ts-node bin.js) node is invoked as: <EntryPrefix> <Entry>
  [string]$EntryPrefix = '',
  [int]$Port = 8970,
  [string]$RunDir = '',
  [int]$WaitSeconds = 60
)

$ErrorActionPreference = 'Stop'

if (-not $RunDir) { Write-Host '[ERROR] -RunDir is required'; exit 1 }
if (-not (Test-Path -LiteralPath $RunDir)) {
  # 'stop'/'status' on a machine that never started the service: nothing to do
  if ($Action -eq 'start') { New-Item -ItemType Directory -Force -Path $RunDir | Out-Null }
}

$PidFile = Join-Path $RunDir 'hub.pid'
$LogFile = Join-Path $RunDir 'service.log'

# Reads an int out of a pid-file value without [void][int]::TryParse(), whose
# cast-vs-static-call parsing is version dependent.
function ConvertTo-Pid([string]$s) {
  if (-not $s) { return 0 }
  $t = "$s".Trim()
  if ($t -notmatch '^\d+$') { return 0 }
  return [int]$t
}

# The backend's own log, in case the process died before it could write to ours.
function Write-Line([string]$m) { Write-Host $m }

# -----------------------------------------------------------------------------
#  pid file
# -----------------------------------------------------------------------------
function Read-PidFile {
  if (-not (Test-Path -LiteralPath $PidFile)) { return $null }
  $h = @{}
  foreach ($l in @(Get-Content -LiteralPath $PidFile -ErrorAction SilentlyContinue)) {
    $i = $l.IndexOf('=')
    if ($i -gt 0) { $h[$l.Substring(0, $i).Trim()] = $l.Substring($i + 1).Trim() }
  }
  if (-not $h.ContainsKey('pid')) { return $null }
  return $h
}

function Write-PidFile([int]$ProcessId) {
  $lines = @(
    "pid=$ProcessId",
    "port=$Port",
    "node=$NodeExe",
    "entry=$Entry",
    "started=" + (Get-Date).ToString('s')
  )
  Set-Content -LiteralPath $PidFile -Value $lines -Encoding ASCII
}

# -----------------------------------------------------------------------------
#  process / port lookups
# -----------------------------------------------------------------------------
function Get-PortOwner([int]$P) {
  # netstat is missing or blocked on some locked-down machines; a missing command
  # is a TERMINATING error in PowerShell, so it has to be caught or the launcher
  # would die instead of just failing to find a port owner.
  $lines = @()
  try { $lines = @(& netstat -ano -p TCP 2>$null) } catch { return 0 }
  foreach ($line in $lines) {
    if ("$line" -notmatch 'LISTENING') { continue }
    if ("$line" -match ("[:\]]" + $P + "\s+\S+\s+LISTENING\s+(\d+)\s*$")) {
      return [int]$Matches[1]
    }
  }
  return 0
}

function Test-Alive([int]$ProcessId) {
  if ($ProcessId -le 0) { return $false }
  return $null -ne (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)
}

function Get-ProcessInfo([int]$ProcessId) {
  if ($ProcessId -le 0) { return $null }
  try { return Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue }
  catch { return $null }
}

# Is this process really ours?  Never kill on a guess - the port alone is not
# proof of ownership. Strict match means the command line carries an ABSOLUTE
# path that only this install has:
#   - the entry script this launcher spawns, or
#   - the backend working directory
# Deliberately NOT matched here: a bare "claude_hub" substring. Two clones of
# clootee on one machine would then kill each other.
function Test-IsOurs($info) {
  if ($null -eq $info) { return $false }
  $cl = $info.CommandLine
  if (-not $cl) { return $false }
  $c = [System.StringComparison]::OrdinalIgnoreCase
  if ($Entry   -and $cl.IndexOf($Entry,   $c) -ge 0) { return $true }
  if ($WorkDir -and $cl.IndexOf($WorkDir, $c) -ge 0) { return $true }
  return $false
}

# Looser check, used ONLY for whoever currently owns our port.
# Installs from before 0.3.3 ran node in the foreground with a RELATIVE script
# path, so their command line carries neither the entry path nor the backend
# directory - without this they could never be stopped after an upgrade.
# Three independent facts are required instead of one: a node image, a hub entry
# script name, and ownership of this port. The pre-0.3.3 stopper killed the port
# owner unconditionally, so this is strictly more careful than what it replaces.
function Test-IsPortOwnerOurs($info) {
  if (Test-IsOurs $info) { return $true }
  if ($null -eq $info) { return $false }
  if (-not $info.Name) { return $false }
  if ("$($info.Name)" -notmatch '(?i)^node(\.exe)?$') { return $false }
  $cl = $info.CommandLine
  if (-not $cl) { return $false }
  return ($cl -match '(?i)(dist[\\/]index\.js|src[\\/]index\.ts)')
}

function Get-OurProcesses {
  $res = @()
  try { $all = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue) } catch { return $res }
  foreach ($p in $all) {
    if ($p.ProcessId -eq $PID) { continue }
    if (Test-IsOurs $p) { $res += $p }
  }
  return $res
}

# /F /T: the recorded pid is cmd.exe, which owns the real node child - a tree
# kill is what actually frees the port.
function Stop-Tree([int]$ProcessId, [string]$Why) {
  Write-Line ("      kill PID {0} - {1}" -f $ProcessId, $Why)
  $out = @()
  try { $out = @(& taskkill /F /T /PID $ProcessId 2>&1) } catch { Write-Line ("        taskkill unavailable: " + $_.Exception.Message) }
  foreach ($l in $out) {
    if ($null -ne $l -and "$l".Trim()) { Write-Line ("        " + "$l".Trim()) }
  }
}

# -----------------------------------------------------------------------------
#  actions
# -----------------------------------------------------------------------------
function Do-Start {
  if (-not (Test-Path -LiteralPath $RunDir)) {
    New-Item -ItemType Directory -Force -Path $RunDir | Out-Null
  }

  # Already listening?  A second double-click is the normal way to just re-open
  # the UI - never restart the service out from under a running task.
  $owner = Get-PortOwner $Port
  if ($owner -gt 0) {
    $info = Get-ProcessInfo $owner
    if (Test-IsPortOwnerOurs $info) {
      Write-Line ("already-running pid=" + $owner)
      return 10
    }
    $name = '?'
    if ($info) { $name = $info.Name }
    Write-Line ("port-taken pid=" + $owner + " name=" + $name)
    return 11
  }

  # A live pid file with nothing listening yet means it is still booting.
  $pf = Read-PidFile
  if ($pf) {
    $old = ConvertTo-Pid $pf['pid']
    if ($old -gt 0 -and (Test-Alive $old)) {
      Write-Line ("booting pid=" + $old)
      return 12
    }
    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
  }

  if (-not (Test-Path -LiteralPath $NodeExe)) { Write-Line ("[ERROR] node runtime not found: " + $NodeExe); return 1 }
  if (-not (Test-Path -LiteralPath $Entry))   { Write-Line ("[ERROR] entry script not found: "  + $Entry);   return 1 }
  if (-not (Test-Path -LiteralPath $WorkDir)) { Write-Line ("[ERROR] working dir not found: "   + $WorkDir); return 1 }

  # cmd.exe is the detached child that owns its own (hidden) console and does the
  # redirection itself. Spawning node directly with redirected handles would make
  # it inherit the launcher's console - the exact bug this file removes.
  $inner = '"' + $NodeExe + '"'
  if ($EntryPrefix) { $inner += ' "' + $EntryPrefix + '"' }
  $inner += ' "' + $Entry + '"'
  $cmdArgs = '/c "' + $inner + ' 1>"' + $LogFile + '" 2>&1"'

  $cmdExe = Join-Path $env:SystemRoot 'System32\cmd.exe'
  if (-not (Test-Path -LiteralPath $cmdExe)) { $cmdExe = 'cmd.exe' }

  Write-Line ("spawning: " + $NodeExe)
  Write-Line ("     arg: " + $Entry)
  Write-Line ("     log: " + $LogFile)

  # A single string (not an array) so Start-Process passes it through verbatim -
  # with an array it would re-quote the already-quoted command.
  $proc = Start-Process -FilePath $cmdExe -ArgumentList $cmdArgs `
            -WorkingDirectory $WorkDir -WindowStyle Hidden -PassThru

  $deadline = (Get-Date).AddSeconds($WaitSeconds)
  $server = 0
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 400
    $server = Get-PortOwner $Port
    if ($server -gt 0) { break }
    if (-not (Test-Alive $proc.Id)) { break }
  }

  if ($server -gt 0) {
    Write-PidFile $proc.Id
    Write-Line ("started launcher-pid=" + $proc.Id + " server-pid=" + $server)
    return 0
  }

  Write-Line "start-failed"
  if (Test-Alive $proc.Id) {
    Write-Line ("      still not listening after " + $WaitSeconds + "s")
    Stop-Tree $proc.Id 'failed to start'
  } else {
    Write-Line "      the background process exited immediately"
  }
  if (Test-Path -LiteralPath $LogFile) {
    Write-Line "      --- last lines of service.log ---"
    foreach ($l in @(Get-Content -LiteralPath $LogFile -Tail 20 -ErrorAction SilentlyContinue)) {
      Write-Line ("      " + $l)
    }
    Write-Line "      ---------------------------------"
  }
  return 1
}

function Do-Stop {
  $killed = 0
  $stopTargets = New-Object 'System.Collections.Generic.HashSet[int]'

  # 1) the launcher process recorded at startup (verified before touching it)
  $pf = Read-PidFile
  if ($pf) {
    $old = ConvertTo-Pid $pf['pid']
    $info = Get-ProcessInfo $old
    if (-not $info -and (Test-Alive $old)) {
      Write-Line ("cannot-verify live recorded PID=" + $old + "; stop aborted")
      return 1
    }
    if ($info) {
      if (Test-IsOurs $info) { [void]$stopTargets.Add($old); Stop-Tree $old 'recorded launcher process'; $killed++ }
      else { Write-Line ("      PID " + $old + " is alive but is not claude-hub - left alone") }
    }
    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
  }

  # 2) anything still carrying this install's paths (the node child of that cmd)
  foreach ($p in (Get-OurProcesses)) {
    if (Test-Alive ([int]$p.ProcessId)) {
      [void]$stopTargets.Add([int]$p.ProcessId)
      Stop-Tree ([int]$p.ProcessId) 'matches this install path'
      $killed++
    }
  }

  # 3) whatever still owns the port (may be a pre-0.3.3 foreground instance)
  $owner = Get-PortOwner $Port
  if ($owner -gt 0) {
    $info = Get-ProcessInfo $owner
    if (Test-IsPortOwnerOurs $info) {
      [void]$stopTargets.Add($owner)
      Stop-Tree $owner 'owns the port'
      $killed++
    } else {
      $name = '?'
      if ($info) { $name = $info.Name }
      Write-Line ("      port " + $Port + " is held by PID " + $owner + " (" + $name + "), which is not claude-hub - left alone")
    }
  }

  # A booting process may not own a port yet. Wait for both the known processes
  # to exit and the port to be free before a caller is allowed to start again.
  $stopDeadline = (Get-Date).AddSeconds(20)
  do {
    $survivors = @($stopTargets | Where-Object { Test-Alive $_ })
    $still = Get-PortOwner $Port
    if ($survivors.Count -eq 0 -and $still -le 0) { break }
    Start-Sleep -Milliseconds 250
  } while ((Get-Date) -lt $stopDeadline)
  if ($still -gt 0 -or $survivors.Count -gt 0) {
    Write-Line ("stop-incomplete listening-pid=" + $still + " surviving-pids=" + ($survivors -join ','))
    return 1
  }
  Write-Line ("stopped killed=" + $killed)
  return 0
}

function Do-Status {
  $pf = Read-PidFile
  if ($pf) {
    Write-Line ("pid file : " + $PidFile + "  (pid=" + $pf['pid'] + ", started " + $pf['started'] + ")")
  } else {
    Write-Line "pid file : none"
  }

  $owner = Get-PortOwner $Port
  if ($owner -gt 0) {
    $info = Get-ProcessInfo $owner
    $name = '?'
    $verdict = 'NOT ours'
    if ($info) {
      $name = $info.Name
      if (Test-IsPortOwnerOurs $info) { $verdict = 'ours' }
    }
    Write-Line ("listening: port " + $Port + " -> PID " + $owner + " (" + $name + ") [" + $verdict + "]")
  } else {
    Write-Line ("listening: nothing on port " + $Port)
  }

  Write-Line ("log      : " + $LogFile)
  return 0
}

# -----------------------------------------------------------------------------
switch ($Action) {
  'start'  { $code = Do-Start }
  'stop'   { $code = Do-Stop }
  'status' { $code = Do-Status }
}

# [int] so a stray value in the pipeline can never turn the exit code into an array
exit ([int]$code)
