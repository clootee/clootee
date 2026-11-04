@echo off
REM ============================================================================
REM  claude-hub - START (Windows) - thin wrapper / 转发
REM  真正的启动逻辑只有一份：仓库根目录的 Windows_Start.bat
REM  （解析 Node -> 安装自检 -> 端口检查 -> 运行编译产物 dist）。
REM  这里保留一个入口，方便直接在 projectsclaude_hub 目录里双击启动。
REM ============================================================================
call "%~dp0....Windows_Start.bat" %*
exit /b %ERRORLEVEL%
