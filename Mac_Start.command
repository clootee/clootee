#!/usr/bin/env bash
# =============================================================================
#  claude-hub - START (macOS)
#  双击本文件即可 / Just double-click this file in Finder.
#  真正的逻辑在 scripts/start-unix.sh —— 这里只是入口。
#  The real logic lives in scripts/start-unix.sh - this is only the entry point.
# =============================================================================
HERE="$(cd "$(dirname "$0")" && pwd)"
exec bash "$HERE/scripts/start-unix.sh" "$@"
