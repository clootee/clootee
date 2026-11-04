@echo off
REM ============================================================================
REM  claude-hub - STOP (Windows)
REM  Just double-click this file. Nothing to install first.
REM  The real logic lives in scripts\stop-windows.bat - this is only the entry point.
REM ============================================================================
call "%~dp0scripts\stop-windows.bat" %*
exit /b %ERRORLEVEL%
