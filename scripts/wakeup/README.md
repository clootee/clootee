# 项目定时唤起 API

在源码安装目录运行 `python3 scripts/wakeup/server.py`。预约存入实例的 SQLite，服务重启后继续处理。默认调度端口为 19873，Hub 端口为 8970，可用 `--port`、`--hub-port`、`--data` 覆盖。下列 MCP 工具连接默认调度端口；独立配置 MCP 客户端时可通过子进程环境变量 CLOOTEE_WAKEUP_PORT 指定端口。

Claude 和 Codex 业务会话启动时会加载 `clootee_wakeup`。AI 可用 MCP 的 `tools/list` 取得参数说明，也可以读取环境变量 `CLOOTEE_WAKEUP_DOC` 指向的本文。其他 stdio MCP 客户端可用 Node 18+ 运行本目录的 `mcp.cjs`，将当前项目的 `CLOOTEE_ROOT_ID`、`CLOOTEE_EXTERNAL_TOKEN` 传给子进程。

| MCP 工具 | HTTP POST 路径 | 操作参数 |
| --- | --- | --- |
| wakeup_list | /v1/wakeups/list | 可选 status、limit（1–100，默认 50）、cursor。按创建顺序返回 items 和 nextCursor，后者为 null 时已到末页 |
| wakeup_status | /v1/wakeups/status | id。返回当前项目中这条预约的详情 |
| wakeup_create | /v1/wakeups | prompt 和 at、afterSeconds 中的一项。可选 sessionId。MCP 还需 idempotencyKey，HTTP 用 Idempotency-Key 请求头 |
| wakeup_update | /v1/wakeups/update | id，加上需要修改的 prompt、sessionId 或时间。一次可以同时改多项 |
| wakeup_cancel | /v1/wakeups/cancel | id。仅 pending 可撤销，重复撤销返回同一条 cancelled 记录 |

**会话目标**　创建时省略 sessionId 或传 null，会在到期时创建同项目的新会话。要回当前会话，传环境变量 CLOOTEE_SESSION_ID 的值；也可传同项目另一条会话的 ID。更新时省略 sessionId 会保留目标，传 null 会切换到新会话。指定会话在投递前已被删除时，Hub 同样会新建会话承接。

**时间和重试**　at 为未来的 Unix 毫秒时间戳，afterSeconds 为从请求时刻计算的正整数秒。创建时为每个预约选唯一幂等键；重试使用原键和原参数，可取回预约的最新状态。改期需要安全重试时使用固定 at。所有修改只在 pending 阶段生效，已开始投递时返回 HTTP 409。

**HTTP 鉴权**　向本机 http://127.0.0.1:19873 发送 application/json，每个请求体均包含 rootId 和 token，从 CLOOTEE_ROOT_ID 和 CLOOTEE_EXTERNAL_TOKEN 读取。权限覆盖本项目所有会话。凭据留在进程内。成功创建返回 201，其他成功请求返回 200。参数有误返回 400，项目鉴权失败返回 403，预约不存在或属于其他项目返回 404，状态或幂等键冲突返回 409。失败正文含 error。

**回执**　id 为预约 ID，prompt 为唤起指令，at 为投递时间，sessionId 为预约的目标（null 表示新建）。status 可取 pending（等待）、sending（投递中）、queued（已入会话队列）、cancelled（已撤销）、revoked（授权失效）、failed（投递被拒）或 unknown（是否入队待核对）。queued 时 taskId 指向队列任务，deliveredSessionId 记录 Hub 返回的实际接收会话 ID；历史数据可能为空。

## 把已有 check 交给新会话

1. 调用 wakeup_list，传 `{"status":"pending"}`，根据指令和时间找到预约 ID。
2. 调用 wakeup_update。新会话需要完整的检查对象、完成条件和汇报要求，可在同一请求里补齐并改期。

```json
{"id":"预约 ID","sessionId":null,"afterSeconds":3600,"prompt":"检查发布单 42 的审核状态。通过后汇报结果；若仍在审核，记录状态并在一小时后继续检查。"}
```

3. 用 wakeup_status 查看回执。要提前停止检查，使用 wakeup_cancel 撤销仍在等待的预约。
