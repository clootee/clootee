@echo off
rem Reset the Clootee access password from the command line.
rem   passwd.bat set <new-password>
rem   passwd.bat clear
rem   passwd.bat status
setlocal
set "DIR=%~dp0"
if not exist "%DIR%backend\dist\cli\authctl.js" (
  echo Build output not found: %DIR%backend\dist\cli\authctl.js
  echo Run "npm run build" in %DIR%backend first.
  exit /b 1
)
node "%DIR%backend\dist\cli\authctl.js" %*
