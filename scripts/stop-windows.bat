@echo off
setlocal enabledelayedexpansion
title claude-hub - stop

REM ============================================================================
REM  claude-hub stopper - Windows implementation
REM  Do not run this directly: double-click Windows_Stop.bat in the repo root.
REM ============================================================================

set PORT=8970
set "APP=claude-hub"

REM  --no-pause : run non-interactively (used by Windows_Start.bat when it frees the port itself)
set "NOPAUSE="
if /i "%~1"=="--no-pause" set "NOPAUSE=1"

REM ============================================================
REM  Step 1: stop pm2 first. Killing the port holder alone is not
REM  enough - pm2 respawns it, and a saved process list (pm2 save)
REM  brings it back on the next resurrect/boot.
REM ============================================================
where pm2 >nul 2>nul
if not errorlevel 1 (
  call pm2 describe "%APP%" >nul 2>&1
  if not errorlevel 1 (
    echo ==^> pm2: deleting app %APP% ...
    call pm2 delete "%APP%" >nul 2>&1
    REM persist the empty/updated list so pm2 resurrect won't restart it
    call pm2 save --force >nul 2>&1
    echo     [OK] pm2 app removed and process list saved
  ) else (
    echo ==^> pm2: app %APP% is not registered, skipping
  )
) else (
  echo ==^> pm2 not installed, skipping pm2 step
)

echo.
echo ==^> Looking for the process listening on port %PORT% ...

set "FOUND="
for /f "tokens=5" %%p in ('netstat -ano -p TCP ^| findstr /R /C:"LISTENING" ^| findstr /C:":%PORT% "') do (
  if not "%%p"=="0" (
    set "FOUND=1"
    echo.
    echo     PID %%p
    for /f "tokens=1 delims=," %%a in ('tasklist /fi "PID eq %%p" /fo csv /nh 2^>nul') do echo     image = %%~a
    taskkill /F /T /PID %%p
    if errorlevel 1 (
      echo     [ERROR] failed to kill PID %%p - administrator rights may be required
    ) else (
      echo     [OK] killed PID %%p
    )
  )
)

echo.
if not defined FOUND (
  echo ==^> Nothing was listening on port %PORT%
  if not defined NOPAUSE pause
  exit /b 0
)

REM ============================================================
REM  Step 3: verify. If something is listening again, a supervisor
REM  (pm2 / a leftover Windows_Start.bat window) is respawning it.
REM ============================================================
ping -n 3 127.0.0.1 >nul
set "STILL="
for /f "tokens=5" %%p in ('netstat -ano -p TCP ^| findstr /R /C:"LISTENING" ^| findstr /C:":%PORT% "') do (
  if not defined STILL set "STILL=%%p"
)
if defined STILL (
  echo [ERROR] Port %PORT% is listening again ^(PID %STILL%^) - something is respawning it.
  echo         Check:  pm2 list      ^(then: pm2 delete claude-hub ^&^& pm2 save --force^)
  echo         Also close any open Windows_Start.bat window, then run Windows_Stop.bat again.
) else (
  echo ==^> claude-hub stopped, port %PORT% is free
)

if not defined NOPAUSE pause
