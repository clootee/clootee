# clootee_console —— Clootee 默认服务商网关

`console.clootee.com` 的后端：给客户端匿名发放设备令牌（`ck-…`），记录用量与余额，
并把请求原样转发到 **火山方舟（Volcano Ark）** 上的 DeepSeek 端点。

Clootee 客户端（`logic_struct/ConsoleAccountStruct.ts`）第一次使用默认服务商时调用这里的接口，
用户不用注册、不用填 Key。

## 协议面

| 路由 | 作用 |
|---|---|
| `POST /api/v1/devices` | `{installId, name}` → `{token, grantedMicro, reused, balanceMicro}`（同 installId 幂等） |
| `GET /api/v1/me` | 余额（`Authorization: Bearer ck-…`） |
| `GET /api/v1/me/usage?limit=&tag=` | 最近用量 + 余额 + 按 tag 汇总 |
| `POST /api/v1/devices/link-code` | `{url}`，10 分钟内有效的设备状态页链接 |
| `GET /v1/models` | 对外模型列表 |
| `POST /v1/messages` | Anthropic 兼容（Claude Code 用），含 `stream` |
| `POST /v1/messages/count_tokens` | Anthropic 兼容计数，不记账 |
| `POST /v1/chat/completions` | OpenAI 兼容（Codex 用），含 `stream` |
| `GET /health` | 健康检查（不含任何密钥） |

请求头 `x-clootee-session` 作为用量标签，客户端用 `GET /api/v1/me/usage?tag=<taskId>` 精确汇总单轮费用。

## 配置（项目根目录 `.env`，不进 git）

```ini
CC_ARK_KEY=ark-...                 # 火山方舟 API Key（必填）
CC_UPSTREAM_MODEL=ep-...           # 方舟推理接入点 ID（必填）
CC_PORT=8980
CC_GRANT_MICRO=5000000             # 新设备体验额度（1,000,000 micro = 1 单位）
CC_PRICE_INPUT_MICRO_PER_M=1000000
CC_PRICE_OUTPUT_MICRO_PER_M=2000000
CC_DEVICES_PER_IP_PER_DAY=10       # 同一 IP 每天可领的新设备数
CC_DAILY_BUDGET_MICRO=100000000    # 全站每日预算（¥100），到顶后全部 402
# 可选：CC_MODEL_MAP=deepseek-flash|ep-xxx;deepseek-v4-pro|ep-yyy
# 可选：CC_PUBLIC_URL / CC_DATA_DIR / CC_RATE_LIMIT_RPM
```

环境变量统一 `CC_` 前缀，避免被服务器上已有的 `PORT` 等变量污染。

## 本地运行

```bash
npm install
npm run build
npm start          # 读 .env，监听 127.0.0.1:8980
```

## 部署（devokai / console.clootee.com）

1. 编译产物 + `.env` 放到 `/www/wwwroot/console.clootee.com/app`；
2. `pm2 start ecosystem.config.js`（用户 `claudeuser`），`pm2 save`；
3. nginx 用 `deploy/console.clootee.com.conf`，证书用 acme.sh webroot 签发；
4. 验收：
   ```bash
   curl https://console.clootee.com/health
   curl -X POST https://console.clootee.com/api/v1/devices -H 'content-type: application/json' \
        -d '{"installId":"ci_0123456789abcdef","name":"curl"}'
   ```
