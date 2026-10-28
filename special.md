# Clootee 项目特殊约定

## Console 的本机位置与发布记录

运维详情的权威文档在：`/home/claudeuser/console.clootee.com/special.md`（独立 Console 私库）。后续处理 Console 上线、余额、赠送和邀请奖励时先读该文件，不要再假设本机没有 Console 服务。

本机已存在并运行：

- 源码/运行目录：`/home/claudeuser/console.clootee.com`。
- 用户：`claudeuser`；PM2 应用名：`clootee-console`。
- 端口：`127.0.0.1:8996`；入口：`src/server.js`。
- 本机健康检查：`curl --noproxy '*' http://127.0.0.1:8996/health`。
- 本机只重启 Console：`pm2 restart clootee-console --update-env`，之后等待健康检查返回目标版本并执行 `pm2 save`。
- 发布前必须一致性备份 SQLite（含 WAL），保留 `.env` 与 `data/`；密钥/数据库不入 git 和公共包。

2026-10-28 已把本机实例更新为 `1.1.0` 并完成重启、完整性及账本对账，含双语验证码、欢迎额度和邀请奖励代码。该实例只有 1 个匿名账号、没有已验证邮箱；本轮无可补赠邮箱账号。

## 公网入口必须独立验证

本轮同时验证到：公网 `https://console.clootee.com/health` 仍返回 `2.0.0`，与本机 `1.1.0` 不同；公网域名解析 `43.153.20.26`，而 `clootee.xfeixie.com` 解析 `106.13.193.3`。强制把 Console 域名解析到 127.0.0.1 访问本机 HTTPS，也没有进入 Console。

`PUBLIC_BASE` 的域名配置不能证明实际路由。本机账本与当前客户端令牌也不匹配，所以本机更新完成后，不能把公网服务或公网赠送报成已完成。切换入口前必须核对 nginx/DNS、设备授权协议和真实生产账本，不能直接覆盖另一个实例。

客户端与 Console 独立发布：当前客户端下载版 `3.1.17`，本机 Console `1.1.0`，公网 Console 本轮观测为 `2.0.0`。不应把这些版本号混为同一个应用版本。
