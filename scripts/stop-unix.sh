#!/usr/bin/env bash
# claude-hub 停止器 —— macOS / Linux 实现（与 stop-windows.bat 对应）
# 不要直接跑这个文件：请双击仓库根目录的 Mac_Stop.command，
# 或在 Linux 上执行 ./Linux_Stop.sh。
set -u

PORT=8970
APP=claude-hub

# ============================================================
#  第 1 步：先停 pm2。只 kill 占端口的进程没用 —— pm2 会立刻拉起，
#  而且被 pm2 save 保存过的进程列表会在 resurrect/开机时再把它带回来。
# ============================================================
if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe "$APP" >/dev/null 2>&1; then
    echo "==> pm2: 删除应用 / deleting app $APP ..."
    pm2 delete "$APP" >/dev/null 2>&1 || true
    # 保存更新后的列表，避免 pm2 resurrect 又把它启动起来
    pm2 save --force >/dev/null 2>&1 || true
    echo "    [OK] pm2 应用已移除并保存进程列表 / removed and saved"
  else
    echo "==> pm2: 未注册应用 $APP，跳过 / not registered, skipping"
  fi
else
  echo "==> 未安装 pm2，跳过 / pm2 not installed, skipping"
fi

echo
echo "==> 正在查找监听端口 $PORT 的进程 / Looking for process listening on port $PORT ..."

if ! command -v lsof >/dev/null 2>&1; then
  echo "[ERROR] 未找到 lsof，无法定位进程 / lsof not found."
  echo "        可手动查找： ps aux | grep ts-node"
  exit 1
fi

PIDS="$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null || true)"

if [ -z "$PIDS" ]; then
  echo
  echo "==> 端口 $PORT 未被占用，服务本来就没在运行 / nothing running on port $PORT"
  exit 0
fi

for pid in $PIDS; do
  echo
  echo "    PID $pid"
  echo "    进程名 / command = $(ps -p "$pid" -o comm= 2>/dev/null || echo unknown)"
  if kill "$pid" 2>/dev/null; then
    # 给它一点时间优雅退出，仍在则强杀
    for _ in 1 2 3 4 5; do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.3
    done
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null && echo "    [OK] 已强制结束 / force killed PID $pid" \
        || echo "    [ERROR] 结束进程 $pid 失败 / failed to kill PID $pid"
    else
      echo "    [OK] 已结束 / killed PID $pid"
    fi
  else
    echo "    [ERROR] 结束进程 $pid 失败，可能需要 sudo / failed to kill PID $pid"
  fi
done

# ============================================================
#  第 3 步：复查。如果端口又被监听，说明有守护进程在拉起它。
# ============================================================
sleep 1
STILL="$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | head -n 1 || true)"
echo
if [ -n "$STILL" ]; then
  echo "[ERROR] 端口 $PORT 又被监听（PID $STILL），有守护进程在拉起它。"
  echo "        Port $PORT is listening again - something is respawning it."
  echo "        检查： pm2 list   然后： pm2 delete claude-hub && pm2 save --force"
  echo "        也请关掉还开着的 Mac_Start.command / Linux_Start.sh 终端后再停一次。"
  exit 1
fi
echo "==> claude-hub 已停止，端口 $PORT 已释放 / stopped, port $PORT is free"
