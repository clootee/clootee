@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo   claude-hub 启动中（pm2 常驻模式）...
echo ========================================

REM 1) 安装自检 + 编译（缺依赖自动装、源码有改动自动重新编译）
REM    pm2 跑的是 backend\dist，所以这一步失败就必须停下。
echo [1/2] 自检并编译 ...
node backend\scripts\setup.js --no-tools
if errorlevel 1 (
  echo.
  echo [错误] 自检/编译未通过，已中止。请在本目录上一级运行 install.bat 查看完整输出。
  pause
  exit /b 1
)

echo [2/2] 用 pm2 启动 claude-hub ...
REM 已存在则重启，否则首次启动
call pm2 describe claude-hub >nul 2>nul
if %errorlevel%==0 (
  call pm2 restart claude-hub
) else (
  call pm2 start ecosystem.config.js
)
call pm2 save

echo.
echo ========================================
echo   已启动: http://localhost:8970
echo ========================================
echo.

REM 自动打开浏览器：等后端真正监听 8970 后再开，避免网页开得太早显示报错。
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "for($i=0;$i -lt 120;$i++){try{$c=New-Object Net.Sockets.TcpClient;$c.Connect('127.0.0.1',8970);$c.Close();Start-Process 'http://localhost:8970';break}catch{Start-Sleep -Milliseconds 500}}"

pause
