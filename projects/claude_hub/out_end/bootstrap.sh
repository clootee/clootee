#!/usr/bin/env bash
# =============================================================================
#  out_end bootstrap（Linux / macOS）
#    默认只下载便携版 Node 到 out_end/node（~30MB）。
#    AI 引擎（claude ~500MB / codex ~400MB）默认不下载：多数人本机已装，
#    没装的人在界面引导里点一下装更好（那里有进度显示）。需要时才加 --with-tools。
#  参数：
#    -y | --yes     非交互（本脚本本来就不交互，保留以便与 Windows 版一致）
#    --with-tools   顺便把 claude code / codex 装进 out_end/tools
#    --node-only    兼容旧写法，等同默认行为
#  两个下载源（官方 / 国内镜像）先探测再选，失败自动换另一个重试。
# =============================================================================
set -u
cd "$(dirname "$0")"

WITH_TOOLS=""
for a in "$@"; do
  case "$a" in
    --with-tools) WITH_TOOLS=1 ;;
    --node-only|-y|--yes) : ;;
  esac
done

NODE_VER="v22.14.0"
OS="linux"; EXT="tar.xz"
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

if [ -x "node/bin/node" ]; then
  echo "[node] 已存在，跳过下载 / already present"
else
  command -v curl >/dev/null 2>&1 || { echo "[错误] 需要 curl / curl is required"; exit 1; }
  command -v tar  >/dev/null 2>&1 || { echo "[错误] 需要 tar / tar is required"; exit 1; }

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
fi

export PATH="$(pwd)/node/bin:$PATH"
NPM="$(pwd)/node/bin/npm"
[ -x "$NPM" ] || NPM="npm"

if [ -z "$WITH_TOOLS" ]; then
  echo "[tools] 默认不下载 AI 引擎（几百 MB）；需要时加 --with-tools，或启动后在界面里一键安装"
else
  echo "[tools] 安装 claude code 与 codex 到 tools/ ..."
  if ! "$NPM" install -g @anthropic-ai/claude-code@latest @openai/codex@latest --prefix "$(pwd)/tools" --no-audit --no-fund; then
    echo "[tools] 官方源失败，改用国内镜像重试 / retrying with a China mirror ..."
    "$NPM" install -g @anthropic-ai/claude-code@latest @openai/codex@latest --prefix "$(pwd)/tools" --no-audit --no-fund --registry="$MIRROR_REG" \
      || { echo "[错误] 引擎安装失败 / engine install failed"; exit 1; }
  fi
fi

echo
echo "完成！/ done. 回到上级目录运行 bash start.sh 即可使用。"
