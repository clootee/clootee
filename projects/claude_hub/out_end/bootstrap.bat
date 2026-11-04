@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

REM ============================================================================
REM  out_end bootstrap (Windows)
REM    Downloads the portable Node runtime into out_end\node (~30MB).
REM    Installs Git, Claude Code and Codex using the shared setup script.
REM    --node-only is reserved for the launcher's Node resolver.
REM
REM  NOTE: keep this file CRLF and avoid very long lines - cmd.exe mis-parses
REM  LF-only batch files and can execute fragments of long lines.
REM ============================================================================
set "NOPAUSE="
set "WITH_TOOLS=1"

:parse
if "%~1"=="" goto :parsed
if /i "%~1"=="-y" set "NOPAUSE=1"
if /i "%~1"=="--yes" set "NOPAUSE=1"
if /i "%~1"=="--with-tools" set "WITH_TOOLS=1"
if /i "%~1"=="--node-only" set "WITH_TOOLS="
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

if exist "node\node.exe" if exist "node\node_modules\npm\bin\npm-cli.js" (
  echo [node] already present, skipping download
  goto :tools
)

if exist "node\node.exe" if not exist "node\node_modules\npm\bin\npm-cli.js" rmdir /s /q "node"

REM PowerShell keeps the bilingual status animated during download and extraction.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0bootstrap-node.ps1"
if errorlevel 1 goto :fail

:tools
set "PATH=%~dp0node;%PATH%"
if not defined WITH_TOOLS goto :ok
"%~dp0node\node.exe" "%~dp0..\backend\scripts\setup.js"
if errorlevel 1 goto :fail

:ok
echo.
echo ========================================
echo   Done. Use Windows_Start.bat in the repo root.
echo ========================================
if not defined NOPAUSE pause
exit /b 0

:fail
echo.
echo *** bootstrap failed (errorlevel=%errorlevel%)
echo     You can edit NODE_URL at the top of this file to use another source.
if not defined NOPAUSE pause
exit /b 1
