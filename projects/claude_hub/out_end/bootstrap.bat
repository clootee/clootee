@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

REM ============================================================================
REM  out_end bootstrap (Windows)
REM    Downloads the portable Node runtime into out_end\node (~30MB).
REM    AI engines (claude ~500MB / codex ~400MB) are only installed with
REM    --with-tools; most machines already have claude, and the onboarding page
REM    can install it with a progress bar.
REM  Flags:
REM    -y | --yes      non-interactive (no pause at the end)
REM    --with-tools    also install claude code / codex into out_end\tools
REM    --node-only     accepted for compatibility, same as the default
REM  Official source first with a short timeout, then the China mirror.
REM
REM  NOTE: keep this file CRLF and avoid very long lines - cmd.exe mis-parses
REM  LF-only batch files and can execute fragments of long lines.
REM ============================================================================
set "NOPAUSE="
set "WITH_TOOLS="

:parse
if "%~1"=="" goto :parsed
if /i "%~1"=="-y" set "NOPAUSE=1"
if /i "%~1"=="--yes" set "NOPAUSE=1"
if /i "%~1"=="--with-tools" set "WITH_TOOLS=1"
shift
goto :parse
:parsed

set "NODE_VER=v22.14.0"
set "NODE_PKG=node-%NODE_VER%-win-x64"
set "NODE_URL=https://nodejs.org/dist/%NODE_VER%/%NODE_PKG%.zip"
set "NODE_MIRROR=https://npmmirror.com/mirrors/node/%NODE_VER%/%NODE_PKG%.zip"
set "MIRROR_REG=https://registry.npmmirror.com"

echo ========================================
echo   out_end bootstrap  (Windows)
echo ========================================

if exist "node\node.exe" (
  echo [node] already present, skipping download
  goto :tools
)

echo [node] downloading %NODE_URL%
powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri $env:NODE_URL -OutFile 'node.zip' -TimeoutSec 60"
if not errorlevel 1 goto :unzip
echo [node] official source failed, trying mirror
powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri $env:NODE_MIRROR -OutFile 'node.zip'"
if errorlevel 1 goto :fail

:unzip
echo [node] extracting ...
if exist "%NODE_PKG%" rmdir /s /q "%NODE_PKG%"
powershell -NoProfile -Command "Expand-Archive -Path 'node.zip' -DestinationPath '.' -Force"
if errorlevel 1 goto :fail
if exist "node" rmdir /s /q "node"
ren "%NODE_PKG%" "node"
if errorlevel 1 goto :fail
del /q "node.zip" >nul 2>nul
if not exist "node\node.exe" goto :fail

:tools
set "PATH=%~dp0node;%PATH%"
set "NPM=%~dp0node\npm.cmd"
if not exist "%NPM%" set "NPM=npm"

if not defined WITH_TOOLS (
  echo [tools] AI engines skipped ^(pass --with-tools to install them here^)
  goto :ok
)

echo [tools] installing claude code and codex into tools\ ...
call "%NPM%" install -g @anthropic-ai/claude-code@latest @openai/codex@latest --prefix "%~dp0tools" --no-audit --no-fund
if not errorlevel 1 goto :ok
echo [tools] official registry failed, retrying with the China mirror ...
call "%NPM%" install -g @anthropic-ai/claude-code@latest @openai/codex@latest --prefix "%~dp0tools" --no-audit --no-fund --registry=%MIRROR_REG%
if errorlevel 1 goto :fail

:ok
echo.
echo ========================================
echo   Done. Run start.bat in the repo root.
echo ========================================
if not defined NOPAUSE pause
exit /b 0

:fail
echo.
echo *** bootstrap failed (errorlevel=%errorlevel%)
echo     You can edit NODE_URL at the top of this file to use another source.
if not defined NOPAUSE pause
exit /b 1
