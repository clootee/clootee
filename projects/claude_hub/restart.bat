@echo off
chcp 65001 >nul
REM 安装自检 + 编译 + 重启 claude-hub 服务 (Windows)
REM 用法： restart.bat        正常重启（缺依赖自动装、源码有改动自动重新编译）
REM        restart.bat -s     跳过自检与编译，直接重启（dist 必须已是最新）
setlocal

set "DIR=%~dp0"
set "APP=claude-hub"
set "SKIP_CHECK=%~1"

cd /d "%DIR%backend" || goto :fail

REM 依赖 + 编译产物一把梭（与根目录 Windows_Start.bat 同一套逻辑）。
REM pm2 跑的是 dist，所以这一步失败就必须停下——否则会拿旧的 dist 起服务。
if /i "%SKIP_CHECK%"=="-s" goto :restart
echo ==^> 自检并编译 / preflight + build ...
node scripts\setup.js --no-tools
if errorlevel 1 goto :fail

:restart

REM 已存在则重启，否则用 ecosystem 启动
echo ==^> (re)starting pm2 app: %APP%
call pm2 describe "%APP%" >nul 2>&1
if %errorlevel%==0 (
  call pm2 restart "%APP%" --update-env || goto :fail
) else (
  call pm2 start "%DIR%ecosystem.config.js" || goto :fail
)

call pm2 save >nul 2>&1
echo ==^> done. Logs: pm2 logs %APP%
call pm2 list | findstr "%APP%"

echo.
echo 完成，按任意键关闭...
pause >nul
exit /b 0

:fail
echo.
echo *** 出错了 (errorlevel=%errorlevel%)，按任意键关闭...
pause >nul
exit /b 1
