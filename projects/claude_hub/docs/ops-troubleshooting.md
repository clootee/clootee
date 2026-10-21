# claude-hub 运维排障：运行身份 / 开机自启 / 权限

> 适用场景：服务器（尤其 xfeixie personal1）上 claude-hub “服务停了”“启动失败 EACCES”“重启后没起来”。
> 2026-10-21 连续踩过这几类问题，根因都源于一件事：**服务身份从 root 切到了 claudeuser，但机器上仍残留 root 时代的状态**。

## 0. 先记住运行事实

| 项目 | 值 |
|---|---|
| 进程 | pm2 应用 `claude-hub`，**claudeuser** 身份 |
| PM2_HOME | `/home/claudeuser/.pm2`（由 `pm2-claudeuser.service` 托管） |
| 端口 | `127.0.0.1:8970` |
| 部署目录 | `/www/wwwroot/clootee/projects/claude_hub` |
| 启动配置 | 该项目下 `ecosystem.config.js`（`cwd=backend`，`script=dist/index.js`） |
| 公网入口 | `https://clootee.xfeixie.com`（静态前端；后端挂了下发的请求才会失败） |

⚠️ 同一台机器上 root 也有一个 pm2（`/root/.pm2`），**两套 pm2 互不相干**。
用 `pm2 ls` 前先确认自己看的是哪一套：`su - claudeuser -c 'pm2 ls'` vs `pm2 ls`。

## 1. 症状：服务停了 / 不在线

```bash
# 1) 服务活着吗
systemctl is-active pm2-claudeuser
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8970/   # 期望 200

# 2) 进程在 pm2 列表里吗（注意用 claudeuser）
su - claudeuser -c 'export PATH=/www/server/nodejs/v22.6.0/bin:$PATH; pm2 ls' | grep claude-hub
```

如果 8970 不通、列表里也没有 `claude-hub`，按顺序做：

```bash
su - claudeuser -c 'export PATH=/www/server/nodejs/v22.6.0/bin:$PATH; \
  cd /www/wwwroot/clootee/projects/claude_hub && \
  HTTPS_PROXY=http://127.0.0.1:10809 HTTP_PROXY=http://127.0.0.1:10809 \
  https_proxy=http://127.0.0.1:10809 http_proxy=http://127.0.0.1:10809 \
  pm2 start ecosystem.config.js --update-env && pm2 save'

# 等端口起来
for i in $(seq 1 30); do curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8970/ | grep -q 200 && break; sleep 1; done
curl -s -o /dev/null -w 'hub:%{http_code}\n' http://127.0.0.1:8970/
```

> 服务跑在 claudeuser 下，**必须带上代理环境变量**，否则引擎/更新检查会超时。
> 用 root 启动会导致进程属主错误、data/ 下文件写成 root，后续又触发 EACCES。

## 2. 症状：重启服务器后不会自动恢复

检查三处，缺一不可：

### 2.1 systemd 服务是否健康

```bash
systemctl status pm2-claudeuser --no-pager
journalctl -u pm2-claudeuser -n 50 --no-pager
```

常见失败：`Cannot find module '/home/claudeuser/.pm2/modules/pm2-logrotate/node_modules/pm2-logrotate/package.json'`。
这是 pm2 的 logrotate 模块依赖丢失，`pm2 resurrect` 会直接崩。

```bash
su - claudeuser -c 'cd /home/claudeuser/.pm2/modules/pm2-logrotate && \
  export PATH=/www/server/nodejs/v22.6.0/bin:$PATH \
  HTTP_PROXY=http://127.0.0.1:10809 HTTPS_PROXY=http://127.0.0.1:10809 && \
  npm install --no-audit --no-fund'

# 清掉失败计数后干净拉起
pm2 kill   # 以 claudeuser 执行
systemctl reset-failed pm2-claudeuser
systemctl start pm2-claudeuser
systemctl is-active pm2-claudeuser    # 期望 active
```

### 2.2 dump 里有没有 claude-hub

```bash
python3 -c "
import json
d=json.load(open('/home/claudeuser/.pm2/dump.pm2'))
print('apps:',len(d),'hub:',any(p.get('name')=='claude-hub' for p in d))"
```

**这台机器的 pm2 被多个项目共用，任何一次 `pm2 save` 都会整体覆盖 dump。**
别的项目保存列表时，claude-hub 就可能被挤掉。所以每次新增/调整应用后，都要确认 `hub: True`。

### 2.3 服务是否 enabled

```bash
systemctl is-enabled pm2-claudeuser   # 期望 enabled
```

## 3. 症状：EACCES / 无权限（权限类问题汇总）

根因统一是：**磁盘上的文件还是 root 属主，但进程已经用 claudeuser 跑**。

### 3.1 `data/` 写入 EACCES

```
Server.task.add: EACCES ... data/traces/root_xxx/draft-xxx.jsonl
```

```bash
chown -R claudeuser:claudeuser /www/wwwroot/clootee
find /www/wwwroot/clootee ! -user claudeuser | wc -l   # 期望 0
```

> 切换运行身份（root → claudeuser）之后，整个部署目录都要 chown 一次。

### 3.2 上传临时目录 EACCES

```
Server.session.upload: EACCES ... /www/wwwroot/<project>/tmp/xxx.jpg
```

对报错的项目目录把 `tmp/` 改成 claudeuser 可写：

```bash
chown -R claudeuser:claudeuser /www/wwwroot/<project>/tmp
```

### 3.3 `spawn claude EACCES`（工作目录在 `/root` 下）

```
启动失败：没有执行权限
命令：claude
原始信息：spawn claude EACCES
工作目录：/root/projects/morijihan
```

不是 claude 二进制的问题，而是 **claudeuser 进不去 `/root`**：`/root` 是 `dr-xr-x--- root:root`。

```bash
chmod o+x /root          # 只给穿越，不给列目录 → dr-xr-x--x
chown -R claudeuser:claudeuser /root/projects/<项目>

# 验证：以 claudeuser 在该目录 spawn
su - claudeuser -c 'cd /root/projects/<项目> && export PATH=/www/server/nodejs/v22.6.0/bin:$PATH && claude --version'
```

> `/root/projects` 下几十个目录本来就大多是 claudeuser 属主，说明这台机一直把它当 claudeuser 工作区，
> 所以 `chmod o+x /root` 与原有用法一致；仍然是“能进已知路径、不能列目录”。

## 4. 修复后的验收清单

```bash
systemctl is-active pm2-claudeuser                       # active
systemctl is-enabled pm2-claudeuser                      # enabled
su - claudeuser -c 'export PATH=/www/server/nodejs/v22.6.0/bin:$PATH; pm2 ls' | grep claude-hub   # online, ↺ 少
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8970/   # 200
curl -sk -o /dev/null -w '%{http_code}\n' https://127.0.0.1/ -H 'Host: clootee.xfeixie.com'  # 200
```

## 5. 一句话原则

1. **claude-hub 永远只以 claudeuser 启动**，不要用 root 起。
2. **身份换了，磁盘属主也要跟着换**（部署目录 + 它要写的所有项目目录）。
3. **claudeuser 的 pm2 由多项目共用**，`pm2 save` 是整体覆盖，新增应用后必须验证 dump。
4. **重启后先看 `systemctl is-active pm2-claudeuser`**，失败优先查 pm2 模块依赖。
5. **工作目录尽量放在 claudeuser 可穿越的路径下**；`/root/*` 需要额外 `o+x`。
