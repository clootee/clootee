@echo off
chcp 65001 >nul
setlocal
title claude-hub

REM ============================================================================
REM  claude-hub launcher - Windows implementation
REM  Do not run this directly: double-click Windows_Start.bat in the repo root.
REM    1) resolve Node (bundled portable -> system 18+ -> auto-download)
REM    2) preflight: install/repair dependencies + rebuild backend\dist if stale
REM       (same engine as install.bat - see backend\scripts\setup.js)
REM    3) start the backend as a BACKGROUND process (scripts\win-service.ps1)
REM    4) wait until the port really accepts, then open the browser and exit
REM
REM  The server does NOT die when this window closes - that is the whole point.
REM  The real spawn/stop logic lives in scripts\win-service.ps1.
REM ============================================================================

for %%i in ("%~dp0..") do set "ROOT=%%~fi\"
set "HUB=%ROOT%projects\claude_hub"
set "BACKEND=%HUB%\backend"
set "RUNDIR=%HUB%\data\run"
set "PORT=8970"
set "PS1=%~dp0win-service.ps1"
set "FREED="

if not exist "%PS1%" (
  echo.
  echo [ERROR] Missing "%PS1%" - this copy of clootee is incomplete.
  echo         Re-download the whole folder ^(or: git pull^) and try again.
  pause
  exit /b 1
)

call "%ROOT%scripts\node-env.bat"
if errorlevel 1 goto :fail

REM ---------------------------------------------------------------------------
REM  Preflight. Exit codes: 0 = ready (dist)  2 = degraded (run from source)  1 = broken
REM ---------------------------------------------------------------------------
"%NODE_EXE%" "%BACKEND%\scripts\setup.js" --quiet
set "SETUP=%ERRORLEVEL%"
if "%SETUP%"=="1" goto :setupfail

REM What node should actually run. Kept absolute so the process command line
REM carries this install's path - that is how win-service.ps1 recognises its own
REM processes and refuses to kill anything else on port %PORT%.
set "ENTRY=%BACKEND%\dist\index.js"
set "PREFIXARG="
if not "%SETUP%"=="2" goto :entryready
set "ENTRY=%BACKEND%\src\index.ts"
set "PREFIXARG=-EntryPrefix "%BACKEND%\node_modules\ts-node\dist\bin.js""
:entryready

REM stdout goes to a file with no rotation, and the Logger would otherwise copy
REM every line there too. Tell the backend "nobody is watching this terminal".
set "CLOOTEE_LOG_CONSOLE=0"

echo.
echo ==^> Starting claude-hub on http://localhost:%PORT%
echo ==^> It runs in the BACKGROUND: closing this window does NOT stop it.

:spawn
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Action start ^
  -NodeExe "%NODE_EXE%" -WorkDir "%BACKEND%" -Entry "%ENTRY%" %PREFIXARG% ^
  -Port %PORT% -RunDir "%RUNDIR%" -WaitSeconds 90
set "SVC=%ERRORLEVEL%"

if "%SVC%"=="0"  goto :up
if "%SVC%"=="10" goto :already
if "%SVC%"=="12" goto :booting
if "%SVC%"=="11" goto :foreign
goto :startfail

REM ---------------------------------------------------------------------------
:up
echo.
echo ==^> claude-hub 已在后台运行 / is now running in the background.
echo     这个窗口可以关掉，服务不会停 / This window can be closed safely.
echo     停止服务请双击 / To stop it, double-click:  Windows_Stop.bat
echo.
echo     Actually running this copy  ^(running directory^):
echo       %BACKEND%
echo     运行日志 / log: %RUNDIR%\service.log
echo.
echo     浏览器即将打开 / opening the browser ...
start "" "http://localhost:%PORT%"
ping -n 6 127.0.0.1 >nul
exit /b 0

REM ---------------------------------------------------------------------------
:already
echo.
echo ==^> claude-hub 已经在运行 / is already running on http://localhost:%PORT%
echo     没有重启它，正在打开的只是界面 / nothing was restarted, just opening the UI
echo     停止服务请双击 / to stop it, double-click:  Windows_Stop.bat
echo.
start "" "http://localhost:%PORT%"
ping -n 4 127.0.0.1 >nul
exit /b 0

REM ---------------------------------------------------------------------------
REM  An instance is still booting (it holds the port but has not answered yet).
REM  Wait for it instead of starting a second one.
REM ---------------------------------------------------------------------------
:booting
echo.
echo ==^> 上一个实例还在启动中，正在等它就绪 / an instance is still starting up, waiting ...
set /a TRIES=0
:bwait
call :checkport
if defined PORTPID goto :bready
set /a TRIES+=1
if %TRIES% GEQ 45 goto :startfail
ping -n 2 127.0.0.1 >nul
goto :bwait
:bready
echo     [OK] ready
goto :up

REM ---------------------------------------------------------------------------
REM  The port is held by something that is NOT claude-hub (win-service.ps1 will
REM  not kill a process it cannot prove belongs to this install). Free the port
REM  the careful way, once, then retry. If it is still taken, stop and say so.
REM ---------------------------------------------------------------------------
:foreign
call :checkport
echo.
echo [warn] Port %PORT% is in use by a process that is not claude-hub ^(PID %PORTPID%^).
for /f "tokens=1,2 delims=," %%a in ('tasklist /fi "PID eq %PORTPID%" /fo csv /nh 2^>nul') do echo        image = %%~a
if defined FREED goto :portbusy
echo.
echo        Trying Windows_Stop.bat once to clear it ^(it also cleans up pm2^) ...
echo.
set "FREED=1"
call "%~dp0stop-windows.bat" --no-pause
goto :spawn

:portbusy
echo.
echo [ERROR] Port %PORT% is STILL in use after Windows_Stop.bat.
echo         Something keeps holding it, and it is not this install - so nothing
echo         was killed ^(killing a process we cannot identify could take down
echo         something of yours^). What to check:
echo           1^) another app of yours may simply be using port %PORT%
echo           2^) if you installed pm2:  pm2 list   ^(then: pm2 delete all^)
echo           3^) or stop it yourself from an admin prompt: taskkill /F /PID %PORTPID%
echo.
pause
exit /b 1

REM ---------------------------------------------------------------------------
:startfail
echo.
echo [ERROR] claude-hub did not come up.
echo         Full log, safe to copy:  %RUNDIR%\service.log
echo         The backend keeps its own log at:  %HUB%\data\logs\app.log
echo.
echo         For the complete setup output, run this ^(copy-paste it^):
echo           "%NODE_EXE%" "%BACKEND%\scripts\setup.js"
echo.
pause
exit /b 1

:setupfail
echo.
echo [ERROR] Preflight failed - dependencies are broken or the build did not finish,
echo         so the app is not ready to start.
echo.
echo         Run this to see the full setup output ^(copy-paste it^):
echo           "%NODE_EXE%" "%BACKEND%\scripts\setup.js"
echo.
pause
exit /b 1

:fail
echo.
echo [ERROR] Could not prepare a Node.js runtime - see the message above.
pause
exit /b 1

REM ---------------------------------------------------------------------------
REM  :checkport - sets PORTPID to the first PID listening on %PORT%, or clears it
REM ---------------------------------------------------------------------------
:checkport
set "PORTPID="
for /f "tokens=5" %%p in ('netstat -ano -p TCP ^| findstr /R /C:"LISTENING" ^| findstr /C:":%PORT% "') do (
  if not defined PORTPID if not "%%p"=="0" set "PORTPID=%%p"
)
exit /b 0
