#!/usr/bin/env bash
# claude-hub 停止器 —— macOS / Linux 实现（与 stop-windows.bat 对应）
# 不要直接跑这个文件：请双击仓库根目录的 Mac_Stop.command，
# 或在 Linux 上执行 ./Linux_Stop.sh。
set -u

SELF="$(cd "$(dirname "$0")" && pwd -P)"
ROOT="$(cd "$SELF/.." && pwd -P)"
BACKEND="$ROOT/projects/claude_hub/backend"
PORT=8970
APP=claude-hub

port_pids() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null || true
  elif command -v ss >/dev/null 2>&1; then
    ss -lptnH "sport = :$PORT" 2>/dev/null | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' || true
  fi
}

is_ours() {
  local target="$1" cmd name cwd
  case "$target" in ''|*[!0-9]*) return 1 ;; esac
  [ "$target" != "$$" ] || return 1
  cmd="$(ps -p "$target" -o command= -ww 2>/dev/null)" || return 1
  name="$(ps -p "$target" -o comm= 2>/dev/null)" || return 1
  case "${name##*/}" in node|nodejs|ts-node) ;; *) return 1 ;; esac
  case "$cmd" in
    *"$BACKEND/dist/index.js"*|*"$BACKEND/src/index.ts"*) return 0 ;;
    *dist/index.js*|*src/index.ts*)
      # Older launchers passed a relative entry; verify their working directory.
      cwd="$(readlink "/proc/$target/cwd" 2>/dev/null || true)"
      if [ -z "$cwd" ] && command -v lsof >/dev/null 2>&1; then
        cwd="$(lsof -a -p "$target" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1)"
      fi
      [ -n "$cwd" ] && [ "$(cd "$cwd" 2>/dev/null && pwd -P)" = "$BACKEND" ] ;;
    *) return 1 ;;
  esac
}

our_pids() {
  # Include instances still booting, before they begin listening on the port.
  local listing
  listing="$(ps -ax -o pid= -o command= -ww 2>/dev/null)" || return 1
  while read -r target cmd; do
    case "$cmd" in
      *dist/index.js*|*src/index.ts*) is_ours "$target" && printf '%s\n' "$target" ;;
    esac
  done <<< "$listing"
  return 0
}

alive() {
  local state
  state="$(ps -p "$1" -o stat= 2>/dev/null)" || return 1
  case "$state" in ''|*Z*) return 1 ;; *) return 0 ;; esac
}

# ============================================================
#  第 1 步：先停 pm2。只 kill 占端口的进程没用 —— pm2 会立刻拉起，
#  而且被 pm2 save 保存过的进程列表会在 resurrect/开机时再把它带回来。
# ============================================================
if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe "$APP" >/dev/null 2>&1; then
    echo "==> pm2: 删除应用 / deleting app $APP ..."
    pm2 delete "$APP" >/dev/null 2>&1 || { echo "[ERROR] pm2 停止失败 / failed to stop pm2 app"; exit 1; }
    # 保存更新后的列表，避免 pm2 resurrect 又把它启动起来
    pm2 save --force >/dev/null 2>&1 || { echo "[ERROR] pm2 保存失败 / failed to save pm2 process list"; exit 1; }
    echo "    [OK] pm2 应用已移除并保存进程列表 / removed and saved"
  else
    echo "==> pm2: 未注册应用 $APP，跳过 / not registered, skipping"
  fi
else
  echo "==> 未安装 pm2，跳过 / pm2 not installed, skipping"
fi

echo
echo "==> 正在查找监听端口 $PORT 的进程 / Looking for process listening on port $PORT ..."

if ! command -v ps >/dev/null 2>&1; then
  echo "[ERROR] 未找到 ps，无法确认旧实例已停止 / ps not found; cannot verify the previous instance."
  exit 1
fi

PIDS="$(our_pids)" || { echo "[ERROR] 无法查询旧进程 / failed to inspect existing processes"; exit 1; }

FAILED=0
for pid in $PIDS; do
  is_ours "$pid" || continue
  echo
  echo "    PID $pid"
  echo "    进程名 / command = $(ps -p "$pid" -o comm= 2>/dev/null || echo unknown)"
  if kill "$pid" 2>/dev/null; then
    # 给它一点时间优雅退出，仍在则强杀
    for _ in 1 2 3 4 5; do
      alive "$pid" || break
      sleep 0.3
    done
    if alive "$pid"; then
      if ! kill -9 "$pid" 2>/dev/null; then
        echo "    [ERROR] 结束进程 $pid 失败 / failed to kill PID $pid"
        FAILED=1
      fi
    else
      echo "    [OK] 已结束 / killed PID $pid"
    fi
  elif alive "$pid"; then
    echo "    [ERROR] 结束进程 $pid 失败，可能需要 sudo / failed to kill PID $pid"
    FAILED=1
  fi
done

# ============================================================
#  第 3 步：等待进程退出并复查端口，未完成时禁止重新启动。
# ============================================================
for _ in 1 2 3 4 5 6 7 8 9 10; do
  REMAINING="$(our_pids)" || { echo "[ERROR] 无法确认停止结果 / failed to verify process exit"; exit 1; }
  STILL="$(port_pids)"
  [ -n "$REMAINING" ] || [ -n "$STILL" ] || break
  sleep 0.3
done
echo
if [ "$FAILED" -ne 0 ] || [ -n "$REMAINING" ] || [ -n "$STILL" ]; then
  echo "[ERROR] 停止未完成 / stop incomplete: processes=$REMAINING listening=$STILL"
  echo "        旧实例或端口占用仍存在，已取消启动。"
  echo "        An old instance or port listener remains; startup aborted."
  echo "        检查： pm2 list   然后： pm2 delete claude-hub && pm2 save --force"
  echo "        也请关掉还开着的 Mac_Start.command / Linux_Start.sh 终端后再停一次。"
  exit 1
fi
echo "==> claude-hub 旧实例已停止 / previous instance stopped"
exit 0
