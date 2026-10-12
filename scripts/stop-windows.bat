@echo off
chcp 65001 >nul
setlocal
title claude-hub - stop

REM ============================================================================
REM  claude-hub stopper - Windows implementation
REM  Do not run this directly: double-click Windows_Stop.bat in the repo root.
REM
REM    1) pm2 first - killing the port holder alone is not enough, pm2 respawns it
REM       and a saved process list (pm2 save) brings it back on the next boot
REM    2) then scripts\win-service.ps1: pid file -> install path -> port owner
REM       Every candidate is verified to belong to THIS install before it is
REM       killed - a stranger holding port 8970 is reported, never killed.
REM ============================================================================

for %%i in ("%~dp0..") do set "ROOT=%%~fi\"
set "HUB=%ROOT%projects\claude_hub"
set "BACKEND=%HUB%\backend"
set "RUNDIR=%HUB%\data\run"
set "PORT=8970"
set "APP=claude-hub"
set "PS1=%~dp0win-service.ps1"

REM  --no-pause : run non-interactively (used by Windows_Start.bat when it frees the port itself)
set "NOPAUSE="
if /i "%~1"=="--no-pause" set "NOPAUSE=1"

REM ============================================================================
REM  Step 1: pm2
REM ============================================================================
where pm2 >nul 2>nul
if errorlevel 1 (
  echo ==^> pm2 not installed, skipping pm2 step
) else (
  call pm2 describe "%APP%" >nul 2>&1
  if errorlevel 1 (
    echo ==^> pm2: app %APP% is not registered, skipping
  ) else (
    echo ==^> pm2: deleting app %APP% ...
    call pm2 delete "%APP%" >nul 2>&1
    REM persist the empty/updated list so pm2 resurrect won't restart it
    call pm2 save --force >nul 2>&1
    echo     [OK] pm2 app removed and process list saved
  )
)

REM ============================================================================
REM  Step 2: the background service itself (verified kills only)
REM ============================================================================
echo.
echo ==^> Stopping the background service ...
if not exist "%PS1%" (
  echo     [ERROR] missing "%PS1%" - falling back to a port-only kill
  call :killport
  goto :verify
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Action stop ^
  -WorkDir "%BACKEND%" -Entry "%BACKEND%\dist\index.js" -Port %PORT% -RunDir "%RUNDIR%"

REM ============================================================================
REM  Step 3: verify. If something is listening again, a supervisor is respawning it.
REM ============================================================================
:verify
ping -n 3 127.0.0.1 >nul
call :checkport
if defined PORTPID (
  echo.
  echo [ERROR] Port %PORT% is listening again ^(PID %PORTPID%^) - something is respawning it.
  for /f "tokens=1,2 delims=," %%a in ('tasklist /fi "PID eq %PORTPID%" /fo csv /nh 2^>nul') do echo         image = %%~a
  echo         Check:  pm2 list      ^(then: pm2 delete all ^&^& pm2 save --force^)
  echo         Also close any other open Windows_Start.bat window, then run Windows_Stop.bat again.
  if not defined NOPAUSE pause
  exit /b 1
)

echo.
echo ==^> claude-hub 已停止 / stopped, port %PORT% is free
if not defined NOPAUSE pause
exit /b 0

REM ============================================================================
REM  Fallback used only when win-service.ps1 is missing.
REM ============================================================================
:killport
call :checkport
if not defined PORTPID (
  echo     nothing is listening on port %PORT%
  exit /b 0
)
echo     PID %PORTPID%
for /f "tokens=1,2 delims=," %%a in ('tasklist /fi "PID eq %PORTPID%" /fo csv /nh 2^>nul') do echo     image = %%~a
taskkill /F /T /PID %PORTPID%
if errorlevel 1 (
  echo     [ERROR] failed to kill PID %PORTPID% - administrator rights may be required
) else (
  echo     [OK] killed PID %PORTPID%
)
exit /b 0

REM ---------------------------------------------------------------------------
REM  :checkport - sets PORTPID to the first PID listening on %PORT%, or clears it
REM ---------------------------------------------------------------------------
:checkport
set "PORTPID="
for /f "tokens=5" %%p in ('netstat -ano -p TCP ^| findstr /R /C:"LISTENING" ^| findstr /C:":%PORT% "') do (
  if not defined PORTPID if not "%%p"=="0" set "PORTPID=%%p"
)
exit /b 0
