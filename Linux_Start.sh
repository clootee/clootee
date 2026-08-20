#!/usr/bin/env bash
# =============================================================================
#  claude-hub - START (Linux)
#  运行 ./Linux_Start.sh 即可 / Run it from a terminal.
#  真正的逻辑在 scripts/start-unix.sh —— 这里只是入口。
#  The real logic lives in scripts/start-unix.sh - this is only the entry point.
# =============================================================================
HERE="$(cd "$(dirname "$0")" && pwd)"
exec bash "$HERE/scripts/start-unix.sh" "$@"
