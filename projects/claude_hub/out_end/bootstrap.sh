#!/usr/bin/env bash
# =============================================================================
#  out_end bootstrap（Linux / macOS）
#    Downloads Node, then runs the shared Git + Claude Code + Codex installer.
#    --node-only is reserved for the launcher's Node resolver.
#    Downloads probe official and mirror sources, then retry the alternate source.
# =============================================================================
set -u
cd "$(dirname "$0")"

WITH_TOOLS=1
for a in "$@"; do
  case "$a" in
    --with-tools) WITH_TOOLS=1 ;;
    --node-only) WITH_TOOLS="" ;;
    -y|--yes) : ;;
  esac
done

NODE_VER="v22.14.0"
OS="linux"; EXT="tar.gz"
case "$(uname -s)" in
  Darwin) OS="darwin" ;;
  Linux)  OS="linux" ;;
esac
ARCH="x64"
case "$(uname -m)" in
  arm64|aarch64) ARCH="arm64" ;;
  x86_64|amd64)  ARCH="x64" ;;
esac
NODE_PKG="node-${NODE_VER}-${OS}-${ARCH}"
NODE_URL="https://nodejs.org/dist/${NODE_VER}/${NODE_PKG}.${EXT}"
NODE_URL_MIRROR="https://npmmirror.com/mirrors/node/${NODE_VER}/${NODE_PKG}.${EXT}"
MIRROR_REG="https://registry.npmmirror.com"

echo "========================================"
echo "  out_end bootstrap ($OS/$ARCH)"
echo "========================================"

if [ -x "node/bin/node" ] && [ -f "node/lib/node_modules/npm/bin/npm-cli.js" ] && node/bin/node -v >/dev/null 2>&1; then
  echo "[node] 已存在，跳过下载 / already present"
else
  if ! command -v curl >/dev/null 2>&1 || ! command -v tar >/dev/null 2>&1; then
    echo "[node] 自动安装下载与解压依赖 / Installing curl and tar ..."
    bootstrap_elevate=()
    if [ "$(id -u)" -ne 0 ]; then
      command -v sudo >/dev/null 2>&1 || { echo "[ERROR] 无法获取依赖安装权限 / sudo unavailable"; exit 1; }
      bootstrap_elevate=(sudo)
    fi
    if command -v apt-get >/dev/null 2>&1; then
      "${bootstrap_elevate[@]}" apt-get update && "${bootstrap_elevate[@]}" apt-get install -y curl tar ca-certificates || exit 1
    elif command -v dnf >/dev/null 2>&1; then
      "${bootstrap_elevate[@]}" dnf install -y curl tar ca-certificates || exit 1
    elif command -v yum >/dev/null 2>&1; then
      "${bootstrap_elevate[@]}" yum install -y curl tar ca-certificates || exit 1
    elif command -v apk >/dev/null 2>&1; then
      "${bootstrap_elevate[@]}" apk add --no-cache curl tar ca-certificates || exit 1
    elif command -v pacman >/dev/null 2>&1; then
      "${bootstrap_elevate[@]}" pacman -S --noconfirm --needed curl tar ca-certificates || exit 1
    elif command -v zypper >/dev/null 2>&1; then
      "${bootstrap_elevate[@]}" zypper --non-interactive install curl tar ca-certificates || exit 1
    else
      echo "[ERROR] 没有可用的依赖安装器 / No supported package manager for curl and tar"; exit 1
    fi
  fi

  echo "[node] 正在安装 Node.js，请勿关闭窗口。预计约需 10 分钟（取决于网络速度）。"
  echo "[node] Installing Node.js. Please do not close this window. Allow about 10 minutes (depending on your connection)."
  # Heartbeat runs independently of downloads/extraction and is always reaped on exit.
  (
    dots=0
    while :; do
      dots=$((dots % 3 + 1))
      printf '\r[node] 正在安装 / Installing Node.js %-3s' "$(printf '%*s' "$dots" '' | tr ' ' '.')"
      sleep 1
    done
  ) &
  node_heartbeat_pid=$!
  stop_node_heartbeat() {
    kill "$node_heartbeat_pid" 2>/dev/null || true
    wait "$node_heartbeat_pid" 2>/dev/null || true
    printf '\n'
  }
  trap stop_node_heartbeat EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM

  # 先各花最多 2 秒探一下两个源的响应，谁快用谁——比「先等官方源超时再换镜像」快得多。
  # （只测到响应头，不下载正文。探不通的记为 9999。）
  probe() { curl -o /dev/null -sI --connect-timeout 2 --max-time 3 -w '%{time_total}' "$1" 2>/dev/null || echo 9999; }
  T_OFF="$(probe "$NODE_URL")"
  T_MIR="$(probe "$NODE_URL_MIRROR")"
  FIRST="$NODE_URL"; SECOND="$NODE_URL_MIRROR"
  if awk "BEGIN{exit !($T_MIR < $T_OFF)}" 2>/dev/null; then
    FIRST="$NODE_URL_MIRROR"; SECOND="$NODE_URL"
  fi
  echo "[node] 源探测 / probe: 官方 ${T_OFF}s, 镜像 ${T_MIR}s → 先用 $(echo "$FIRST" | awk -F/ '{print $3}')"

  echo "[node] 下载 / downloading $FIRST"
  if ! curl -fL --retry 2 "$FIRST" -o node.tar; then
    echo "[node] 换另一个源重试 / retrying with the other source"
    curl -fL --retry 2 "$SECOND" -o node.tar || { echo "[错误] 下载失败 / download failed"; exit 1; }
  fi
  echo "[node] 解压 / extracting ..."
  rm -rf node "$NODE_PKG"
  tar -xf node.tar || { echo "[错误] 解压失败 / extract failed"; exit 1; }
  mv "$NODE_PKG" node
  rm -f node.tar
  [ -x "node/bin/node" ] || { echo "[错误] 解压后仍找不到 node / node missing after extract"; exit 1; }
  stop_node_heartbeat
  trap - EXIT INT TERM
  echo "[node] 安装完成 / installation complete"
fi

export PATH="$(pwd)/node/bin:$PATH"
if [ -n "$WITH_TOOLS" ]; then
  exec "$(pwd)/node/bin/node" "../backend/scripts/setup.js"
fi
echo "[node] Node ready; launcher will install remaining dependencies."
