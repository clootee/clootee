#!/usr/bin/env bash
# =============================================================================
#  claude-hub - STOP (Linux)
#  运行 ./Linux_Stop.sh 即可 / Run it from a terminal.
#  真正的逻辑在 scripts/stop-unix.sh —— 这里只是入口。
#  The real logic lives in scripts/stop-unix.sh - this is only the entry point.
# =============================================================================
HERE="$(cd "$(dirname "$0")" && pwd)"
bash "$HERE/scripts/stop-unix.sh" "$@"
CODE=$?
# 双击运行时终端会立刻关掉，先停一下让用户看到结果
if [ -t 0 ]; then
  printf "\n按 Enter 关闭 / Press Enter to close... "
  read -r _ || true
fi
exit "$CODE"
