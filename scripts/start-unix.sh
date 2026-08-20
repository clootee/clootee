#!/usr/bin/env bash
# =============================================================================
#  claude-hub 启动器 —— macOS / Linux 实现（与 start-windows.bat 对应）
#  不要直接跑这个文件：请双击仓库根目录的 Mac_Start.command，
#  或在 Linux 上执行 ./Linux_Start.sh。
#    1) 解析 Node（out_end 内置便携版 → 系统 Node 18+ → 自动下载）
#    2) 启动前自检：缺依赖就装、dist 过期就重编译（与 install.sh 同一套逻辑，
#       见 backend/scripts/setup.js）
#    3) 端口被占用时自动先跑 stop-unix.sh 释放端口，再继续启动；释放不掉才报错
#    4) 运行**编译产物** dist —— TypeScript 只在构建时需要，运行期不需要
# =============================================================================
set -u

SELF="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SELF/.." && pwd)"
HUB="$ROOT/projects/claude_hub"
PORT=8970

# 出错时在交互终端里停住，避免（双击运行时）窗口一闪而过看不到原因
hold() {
  if [ -t 0 ]; then
    echo
    printf '按 Enter 关闭 / Press Enter to close... '
    read -r _ || true
  fi
}
die() { echo; echo "[ERROR] $*"; hold; exit 1; }

# shellcheck source=scripts/node-env.sh
. "$ROOT/scripts/node-env.sh" || { hold; exit 1; }

# ============================================================
#  启动前自检：0=就绪(dist)  2=降级(用 ts-node 跑源码)  1=不可启动
# ============================================================
"$NODE_EXE" "$HUB/backend/scripts/setup.js" --quiet
SETUP=$?
if [ "$SETUP" -eq 1 ]; then
  die "启动前自检未通过 / preflight failed —— 请运行 ./install.sh 查看完整安装输出。"
fi

# ============================================================
#  端口占用检查：被占用就先跑一遍 stop-unix.sh 释放端口，然后继续启动；
#  只有释放不掉时才停下报错。
# ============================================================
port_pid() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | head -n 1 || true
  fi
}

PORTPID="$(port_pid)"
WASBUSY=""
if [ -n "$PORTPID" ]; then
  WASBUSY=1
  echo
  echo "[warn] 端口 $PORT 已被占用（PID $PORTPID），先执行停止脚本释放 / port in use, running the stop script first ..."
  echo
  bash "$SELF/stop-unix.sh" || true
  echo
  PORTPID="$(port_pid)"
fi
if [ -n "$PORTPID" ]; then
  echo
  echo "[ERROR] 执行停止脚本后端口 $PORT 仍被占用 / port $PORT is STILL in use."
  echo "        占用进程 PID = $PORTPID"
  echo "        进程名 / command = $(ps -p "$PORTPID" -o comm= 2>/dev/null || echo unknown)"
  echo
  echo "        有守护进程在拉起它，或结束进程需要更高权限："
  echo "          1) 关掉其他还开着的 Mac_Start.command / Linux_Start.sh 终端"
  echo "          2) 检查 pm2： pm2 list   然后： pm2 delete claude-hub && pm2 save --force"
  echo "          3) 或手动结束： kill -9 $PORTPID"
  echo
  hold
  exit 1
fi
[ -z "$WASBUSY" ] || echo "    [OK] 端口 $PORT 已释放，继续启动 / port freed, continuing startup"

cd "$HUB/backend" || die "找不到目录 / missing directory: $HUB/backend"

echo
echo "==> Starting claude-hub on http://localhost:$PORT"
echo "==> 服务启动中，浏览器将自动打开 http://localhost:$PORT"
echo "==> 首次打开会有引导：设置访问密码 -> 选引擎 -> 选模型服务商"
if command -v open >/dev/null 2>&1; then
  open "http://localhost:$PORT" >/dev/null 2>&1 || true
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://localhost:$PORT" >/dev/null 2>&1 || true
fi

if [ "$SETUP" -eq 2 ]; then
  echo "[warn] 编译产物不可用，降级用 ts-node 直跑源码 / running from source via ts-node"
  "$NODE_EXE" node_modules/ts-node/dist/bin.js src/index.ts
else
  "$NODE_EXE" dist/index.js
fi
EXITCODE=$?

echo
if [ "$EXITCODE" -ne 0 ]; then
  echo "[ERROR] 服务异常退出，退出码 / exit code = $EXITCODE"
  echo "        上面的日志即为错误原因，请勿关闭本窗口。"
  hold
else
  echo "==> Server stopped / 服务已停止"
fi
exit "$EXITCODE"
