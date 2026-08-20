# assist —— 可嵌任意网页的 AI 学习小助手组件

一行 `<script>` 就能给任意静态网页加一个能看懂本页的 AI 侧栏。单文件、零依赖、**无后端**。

| 文件 | 作用 |
|---|---|
| `assistant.js` | 组件本体（唯一产物，约 550 行，无依赖） |
| `docs.md` | **给 AI 读的接入文档**，生成教程时把这个地址丢给 AI |
| `index.html` | 落地页，本身就嵌着组件，等于活的演示 |

## 三个可用地址

| 场景 | 地址 |
|---|---|
| 本机（Clootee 在跑时） | `http://localhost:8970/assist/assistant.js` |
| 公网 | `https://learn.xfeixie.com/assist/assistant.js` |
| 要发给别人 / 双击打开 | 把 `assistant.js` 拷到 HTML 旁边，用 `./assistant.js` |

第三种最省事：整个文件夹能随便拷贝，断网也打得开（只有提问那一步要联网）。

## 部署

它**和小白教程共用一个 nginx vhost**，挂在 `/assist/` 下并单独免口令、放行跨域。
配置与步骤只有一份，在 **`projects/claude_hub/deploy/README.md`**，不在这里重复。

更新方式：服务器上 `cd /www/wwwroot/clootee && git pull`，静态文件，不重启任何进程。

## 能力

- 右侧侧栏，可收起展开
- 使用者自己填 MiniMax Key（只存他自己浏览器的 localStorage）
- 多轮对话；新建 / 切换 / 删除会话
- **读整页正文**：优先 `<main>`，找不到才退回 `<body>`，最多 6000 字
- **划词提问**：选中任意文字 → 浮出按钮 → 那段话作为引用一起发出
- 20 轮红字提醒换会话，40 轮锁定输入（每轮都要重发全部历史，越聊越贵）
- 剥掉 MiniMax-M3 内联在正文里的 `<think>…</think>` 推理段
- 会话按 `location.pathname` 分命名空间，不同页面互不串台

## 隐私

Key 只存使用者浏览器；请求由浏览器**直连 MiniMax**，不经过任何中间服务器；
会话记录也只在本地。服务器不经手任何用户数据。
