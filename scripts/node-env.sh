#!/usr/bin/env bash
# =============================================================================
#  node-env.sh —— 解析出一个可用的 Node 运行时（供 scripts/start-unix.sh source）
#    用法： ROOT=<仓库根>/ ; . "$ROOT/scripts/node-env.sh"  || exit 1
#    成功后设置 NODE_EXE，并把内置运行时放到 PATH 最前面。
#    顺序：1) out_end 内置便携版  2) 系统 Node（>= 18）  3) 自动下载便携版
# =============================================================================
: "${ROOT:?node-env.sh: ROOT is not set}"
HUB="$ROOT/projects/claude_hub"
OUTEND="$HUB/out_end"
NODE_EXE=""

node_major() { "$1" -v 2>/dev/null | sed 's/^v//' | cut -d. -f1; }

if [ -x "$OUTEND/node/bin/node" ]; then
  NODE_EXE="$OUTEND/node/bin/node"
  echo "[node] 使用内置便携版 / using bundled Node"
elif command -v node >/dev/null 2>&1; then
  _sys="$(command -v node)"
  _maj="$(node_major "$_sys")"
  if [ -n "$_maj" ] && [ "$_maj" -ge 18 ] 2>/dev/null; then
    NODE_EXE="$_sys"
    echo "[node] 使用系统 Node v${_maj}.x / using system Node"
  else
    echo "[node] 系统 Node 版本过低（需 18+）/ system Node too old, downloading a portable copy..."
  fi
fi

if [ -z "$NODE_EXE" ]; then
  echo
  echo "==> 未检测到可用的 Node.js，正在自动下载内置便携版（无需你安装任何东西）..."
  echo "==> No usable Node.js found. Downloading a portable copy automatically..."
  echo
  bash "$OUTEND/bootstrap.sh" -y --node-only || true
  if [ -x "$OUTEND/node/bin/node" ]; then
    NODE_EXE="$OUTEND/node/bin/node"
    echo "[node] 内置便携版就绪 / bundled Node ready"
  else
    echo
    echo "[ERROR] 自动下载失败 / could not obtain Node.js automatically."
    echo "        请手动安装 Node.js 18+：https://nodejs.org/"
    echo "        或编辑 projects/claude_hub/out_end/bootstrap.sh 换用国内镜像后重试。"
    return 1 2>/dev/null || exit 1
  fi
fi

# 内置 node/tools 优先进 PATH：这样内置的 claude / codex 也能被找到
export PATH="$OUTEND/node/bin:$OUTEND/tools/bin:$PATH"
export NODE_EXE
