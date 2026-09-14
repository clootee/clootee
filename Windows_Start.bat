@echo off
REM ============================================================================
REM  claude-hub - START (Windows)
REM  Just double-click this file. Nothing to install first.
REM  The real logic lives in scripts\start-windows.bat - this is only the entry point.
REM ============================================================================
call "%~dp0scripts\start-windows.bat" %*
exit /b %ERRORLEVEL%
