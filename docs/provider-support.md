# Provider support / 服务商接入

The provider menu uses a filtered, bundled snapshot of the MIT-licensed
[models.dev](https://github.com/anomalyco/models.dev) database. It imports concrete
HTTPS endpoints for providers declaring OpenAI compatibility and one credential
environment variable. Account-specific URLs and non-compatible SDK protocols are
excluded. This is endpoint metadata, **not a universal credential detector** and
not proof that every model supports coding tools or that a key has permission.

服务商目录使用 models.dev 开源数据快照；无需额外部署网关。Codex 复用已有的本地
Responses → Chat Completions 转换代理；Claude 仅显示已配置原生 Anthropic 接口的服务商。
原版订阅继续使用既有登录流程，网页会员、OAuth 凭据不能当作任意平台的普通 API Key。

## Credentials and billing

Choose the issuing provider and region before entering a key. The application
does not send keys to models.dev or try them against unrelated providers.

| Provider | Routing |
| --- | --- |
| Claude official API / OpenAI official API | The vendor's own pay-as-you-go API key, as an alternative to the subscription login in the same dropdown. `anthropic` (`https://api.anthropic.com`) is Claude Code only; `openai` (`https://api.openai.com/v1`) is Codex only. Anthropic accepts the key as `Authorization: Bearer`, which is what the managed `ANTHROPIC_AUTH_TOKEN` sends. |
| Xiaomi MiMo | `tp-` → China Token Plan; other keys → ordinary API. Explicit Singapore/Amsterdam Token Plan entries preserve region. |
| Tencent LKEAP / TokenHub | `sk-sp-` → Coding Plan; `sk-tp-` → Token Plan; ordinary keys retain the selected ordinary endpoint. |
| Alibaba / Qwen | Ordinary keys → selected region's standard API. `sk-sp-` identifies a subscription but **cannot distinguish Coding Plan from Token Plan**; select the dedicated plan and region. Ambiguous configuration is rejected before storage/network access. |
| Kimi, GLM, other shared-format keys | Select the separate API/Coding Plan provider. The key text alone is not sufficient to infer the subscription. |
| OpenRouter | OpenRouter credits/API key; native Anthropic endpoint for Claude, Chat endpoint through the existing Codex proxy. |

服务商下拉把「订阅登录 / 官方 API / OpenRouter / 国产大厂」固定排在最前（其余 models.dev 目录跟在后面），
`anthropic` 只出现在 Claude Code 侧、`openai` 只出现在 Codex 侧——官方 API 两家各只有一半协议。

订阅鉴权失败、过期、无额度或网络故障不会触发按量计费回退。不支持 `/models` 的
服务商可按官方文档手填模型 ID；模型列表成功也不代表 Key 鉴权成功（部分列表是公开的）。
保存 Key、服务商和模型时作为同一份配置处理；各服务商独立存储。

## Maintenance and validation

Run `node projects/claude_hub/backend/scripts/update-provider-catalog.js`, review
the endpoint diff, then build and run the tests below. The snapshot is deliberately
not refreshed at runtime, so upstream metadata cannot silently redirect credentials.
The MIT notice is retained in `backend/src/config/models-dev-LICENSE.txt`.

From `projects/claude_hub/backend`:

```sh
npm run typecheck
npm run build
node --test test/provider_catalog.js
node test/provider_catalog_browser.js
node test/i18n_keys.js
```

Tests use fake credentials and mocked provider responses. Real account permissions,
tool support, quota and subscription expiration still require testing with the
user's own provider account. Restart the hub after updating backend files.

## Official endpoint references

- [Xiaomi API/key distinction](https://mimo.mi.com/docs/en-US/quick-start/faq/api-integration)
- [Tencent Coding Plan](https://cloud.tencent.com/document/product/1823/130092)
- [Tencent Token Plan](https://cloud.tencent.com/document/product/1823/130119)
- [Tencent ordinary LKEAP Anthropic endpoint](https://cloud.tencent.com/document/product/1772/130550)
- [Alibaba regions and billing endpoints](https://help.aliyun.com/en/model-studio/base-url)
- [Alibaba keys, including shared sk-sp- prefix](https://help.aliyun.com/en/model-studio/get-api-key)
- [OpenRouter native Claude integration](https://openrouter.ai/docs/guides/coding-agents/claude-code-integration)
- [Claude API authentication (`Authorization: Bearer` / `x-api-key`)](https://platform.claude.com/docs/en/api/overview)


### Clootee email authorization

Starting with 3.1.14, Clootee uses the Console device authorization flow. Choose **Sign in with email & claim credit**, open the Console link, sign in with an email code, and approve the displayed computer. The client resumes after authorization. **Use my own provider** opens the existing provider setup without a Clootee account.

The client calls `POST /api/device/start`, then polls `POST /api/device/token` on the Console. The private device code stays in the local backend. Only an authorized token associated with an email can activate Clootee. Revoked tokens require a new sign-in; an installation ID never grants a replacement key or more trial credit. Billing opens `/billing` in the Console.

Trial grants and prices are enforced by the cloud service, never by the open-source client. The intended new-account grant is approximately CNY 5, once per verified email account. DeepSeek Flash is offered without markup, including cache-hit and peak/off-peak pricing. Operators must verify these cloud rules separately before advertising the trial as available; updating this client does not change cloud balances or prices.
