#!/usr/bin/env bash
# 安装自检 + 编译 + 重启 claude-hub 服务
# 用法： ./restart.sh        正常重启（缺依赖自动装、源码有改动自动重新编译）
#        ./restart.sh -s     跳过自检与编译，直接重启（dist 必须已是最新）
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="claude-hub"
SKIP_CHECK="${1:-}"

cd "$DIR/backend"

# 依赖 + 编译产物一把梭（与根目录 Mac_Start.command / Linux_Start.sh 同一套逻辑）。
# pm2 跑的是 dist，所以这一步失败就必须停下——否则会拿旧的 dist 起服务。
if [ "$SKIP_CHECK" != "-s" ]; then
  echo "==> 自检并编译 / preflight + build ..."
  set +e
  node scripts/setup.js --no-tools
  code=$?
  set -e
  if [ "$code" -ne 0 ]; then
    echo "[ERROR] 自检/编译未通过（exit $code），已中止重启，避免用旧的 dist 起服务。"
    exit 1
  fi
fi

# 已存在则重启，否则用 ecosystem 启动
echo "==> (re)starting pm2 app: $APP"
if pm2 describe "$APP" > /dev/null 2>&1; then
  pm2 restart "$APP" --update-env
else
  pm2 start "$DIR/ecosystem.config.js"
fi

# 顺带拉起云端中继 agent（本机 → 自己部署的 relay，地址写在 agent 配置里），非致命
RELAY_AGENT="claude-relay-agent-wss"
RELAY_CFG="$DIR/../claude_relay/agent.wss.config.js"
if [ -f "$RELAY_CFG" ]; then
  echo "==> (re)starting relay agent: $RELAY_AGENT"
  if pm2 describe "$RELAY_AGENT" > /dev/null 2>&1; then
    pm2 restart "$RELAY_AGENT" --update-env || echo "    WARN: relay agent restart failed (ignored)"
  else
    pm2 start "$RELAY_CFG" || echo "    WARN: relay agent start failed (ignored)"
  fi
else
  echo "==> relay agent config not found, skip ($RELAY_CFG)"
fi

pm2 save > /dev/null 2>&1 || true
echo "==> done. Logs: pm2 logs $APP"
pm2 list | grep -E "$APP|$RELAY_AGENT" || true
