# Clootee — 本地 Claude 多会话任务工作台

通过本地 `claude` CLI 工作的一个 Web 工具，兼容 PC 与移动端。

## 功能
- **多会话并行**：每个会话对应一个独立的 claude session（`--session-id` / `--resume` 续接上下文），可同时工作。
- **历史会话查看**：会话持久化为 JSON，随时回看消息与任务记录。
- **根目录隔离**：可添加多个根目录并一键切换；会话与根目录绑定，切到某根目录只看到其关联会话。claude 在该根目录下工作。
- **任务队列**：可一次提交多个任务，顺序执行；执行过程中继续输入会被累计排队，等前一个完成再继续。
- **停止 / 暂停 / 继续**：
  - 停止当前任务 → 自动跳到下一个任务；
  - 暂停任务流 → 停止当前并不再执行后续（保留排队）；
  - 继续任务流 → 从队列继续执行。
- **过程可见但不入消息列表**：思考 / 工具调用 / 中间输出通过 WebSocket 实时显示在「执行过程」面板，**不**写入最终消息列表；只有最终回答和你的输入进入消息列表。
- **国际化**：内置中 / 英，右上角切换。
- **访问密码**：**首次打开界面时由你自行设定**（本项目不含任何默认口令），以「随机盐 + sha256」保存在 `data/auth.json`；登录一次后客户端持久保存 token，长期免登，可「退出登录」清除。
  ⚠️ 本服务会以跳过权限确认的模式执行命令 —— 能访问界面即等于能在本机执行任意命令，请设强口令、勿暴露公网（详见仓库根 README 的安全须知）。
- **深 / 浅主题**：右上角 🌗 一键切换，偏好持久保存。

## 测试
```bash
cd claude_hub
npx playwright test     # e2e/hub.spec.js：登录 / 主题 / 多任务实际建文件 / 过程消息分离
```

## 架构（遵循 Struct/Realize 框架）
```
backend/src/
  config/      AppConfig / LogConfig         配置
  helper/      Logger ErrorHandler JsonStore Ids ProcessSpawner EventBus   纯工具
  logic_struct/   RootManager/Session/ClaudeRunner/TaskQueue 的调度骨架
  logic_realize/  对应实现（内部状态、解析、持久化）
  server/      Express + WebSocket（入口层，仅转发）
  models/      纯类型
frontend/      index.html / styles.css / app.js / trans.js（响应式单页）
```

执行链路：`Server → TaskQueue(调度) → ClaudeRunner(spawn claude) → WebSocket 广播过程 / 持久化最终消息`。

## 启动
```bash
cd backend
npm install
# 开发模式
npm run dev
# 或用 pm2（推荐）
pm2 start ../ecosystem.config.js
pm2 save
```
浏览器访问 `http://localhost:8970`（同一局域网手机用本机 IP 访问）。

改动后端后，用脚本一键「类型检查 + 重启」：
```bash
./restart.sh        # 类型检查通过后重启（不存在则按 ecosystem 启动）
./restart.sh -s     # 跳过类型检查，直接重启
```
或手动：`pm2 restart claude-hub`。

## 配置（环境变量）
| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | 8970 | 服务端口 |
| `CLAUDE_BIN` | claude | 本地 claude 命令 |
| `CLAUDE_PERMISSION_MODE` | bypassPermissions | 无人值守执行的权限模式 |
| `TASK_TIMEOUT_MS` | 1800000 | 单任务最大时长 |

> 默认 `bypassPermissions` 让任务可无人值守自动执行；仅建议在受信任的本机使用。
