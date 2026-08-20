@echo off
REM ============================================================================
REM  node-env.bat - resolve a usable Node.js runtime. Not meant to be run alone.
REM
REM  Callers (scripts\start-windows.bat) do:   call "%ROOT%scripts\node-env.bat"
REM  On success it sets NODE_EXE and prepends the bundled runtime to PATH.
REM  Order: 1) bundled portable Node in out_end  2) system Node (>= 18)
REM         3) auto-download a portable copy (nothing needs to be preinstalled)
REM ============================================================================
if not defined ROOT set "ROOT=%~dp0..\"
set "HUB=%ROOT%projects\claude_hub"
set "OUTEND=%HUB%\out_end"
set "NODE_EXE="
set "NODEMAJ="

if exist "%OUTEND%\node\node.exe" (
  set "NODE_EXE=%OUTEND%\node\node.exe"
  echo [node] using bundled portable Node
  goto :done
)

where node >nul 2>nul
if errorlevel 1 goto :bootstrap

for /f "delims=" %%i in ('where node') do (
  if not defined NODE_EXE set "NODE_EXE=%%i"
)
for /f "tokens=1 delims=." %%v in ('node -v 2^>nul') do set "NODEMAJ=%%v"
set "NODEMAJ=%NODEMAJ:v=%"
if not defined NODEMAJ goto :bootstrap
if %NODEMAJ% LSS 18 goto :oldnode
echo [node] using system Node (v%NODEMAJ%.x)
goto :done

:oldnode
echo [node] system Node v%NODEMAJ%.x is too old (need 18+), downloading a portable copy...
set "NODE_EXE="

:bootstrap
echo.
echo ==^> Node.js not available. Downloading a portable copy automatically...
echo.
call "%OUTEND%\bootstrap.bat" -y --node-only
if not exist "%OUTEND%\node\node.exe" goto :nonode
set "NODE_EXE=%OUTEND%\node\node.exe"
echo [node] bundled portable Node ready

:done
REM Bundled node/tools go first in PATH so bundled claude / codex are found
set "PATH=%OUTEND%\node;%OUTEND%\tools;%PATH%"
exit /b 0

:nonode
echo.
echo [ERROR] Could not obtain Node.js automatically.
echo         Install Node.js 18+ manually: https://nodejs.org/
echo         Or edit projects\claude_hub\out_end\bootstrap.bat to use a closer mirror and retry.
set "NODE_EXE="
exit /b 1
