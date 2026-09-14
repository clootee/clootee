#!/usr/bin/env bash
# =============================================================================
#  claude-hub - START (Linux)
#  运行 ./Linux_Start.sh 即可 / Run it from a terminal.
#  真正的逻辑在 scripts/start-unix.sh —— 这里只是入口。
#  The real logic lives in scripts/start-unix.sh - this is only the entry point.
# =============================================================================
HERE="$(cd "$(dirname "$0")" && pwd)"

# 仅限 Linux 运行：检测到非 Linux 就直接拒绝，并按当前系统推荐对应启动脚本。
# Linux only: refuse on any other OS and point to the right launcher for it.
OS="$(uname -s 2>/dev/null || echo unknown)"
case "$OS" in
  Linux) ;;  # 继续 / continue
  Darwin)
    echo "[ERROR] 这是 Linux 专用的启动脚本，当前系统是 macOS。"
    echo "        This is the Linux-only launcher, but you are on macOS."
    echo "        请改用 / Please use:  ./Mac_Start.command  （在 Finder 里双击即可 / double-click it in Finder）"
    exit 1
    ;;
  MINGW*|MSYS*|CYGWIN*|Windows_NT)
    echo "[ERROR] 这是 Linux 专用的启动脚本，当前系统是 Windows。"
    echo "        This is the Linux-only launcher, but you are on Windows."
    echo "        请改用 / Please use:  Windows_Start.bat  （在资源管理器里双击即可 / double-click it in Explorer）"
    exit 1
    ;;
  *)
    echo "[ERROR] 这是 Linux 专用的启动脚本，但检测到的系统不是 Linux（uname: $OS）。"
    echo "        This is the Linux-only launcher, but this OS is not Linux (uname: $OS)."
    echo "        macOS 请用 ./Mac_Start.command，Windows 请用 Windows_Start.bat。"
    echo "        On macOS use ./Mac_Start.command, on Windows use Windows_Start.bat."
    exit 1
    ;;
esac

exec bash "$HERE/scripts/start-unix.sh" "$@"
