<div align="center">

# Clootee

### 在浏览器里用 Claude Code —— 解压，双击，就能用

**不用装 Node，不用装 Claude Code，不用开终端。全都打包好了。**

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/平台-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)]()
[![Setup](https://img.shields.io/badge/配置-零配置-brightgreen.svg)]()

[English](README.md) · 中文

</div>

---

## 一句话说清楚

别的工具都是「先装 Node，再 `npm install -g …`，然后开终端登录」。
**Clootee 把这些全替你做了，而且是在网页里做的。**

```
① 解压   →   ② 双击 Windows_Start.bat   →   ③ 跟着网页引导走完
```

就这三步。缺什么，引导页当场装给你看——有进度条，不是一片空白。

| 平时你得自己做 | 在 Clootee 里 |
|---|---|
| 装 Node.js、配 PATH | 自动下一份便携版，只放在软件自己的目录 |
| `npm install -g @anthropic-ai/claude-code` | 点一下，带实时进度 |
| 装 Git | 点一下 —— Windows 免管理员、不写注册表 |
| 开终端跑 `claude` 登录 | **在网页里登录** —— 一个按钮、四步指引、粘回授权码 |
| 自己猜「为什么没反应」 | **网络体检**直接告诉你哪里不通、该怎么办 |

---

## 最容易卡住的两件事

**🌐 「发了消息没反应」** —— Clootee 在你撞墙之前就先查好，并且**当场给两条出路**：
开科学上网后点「重新检测」，或者一键换成国产大模型（MiniMax / Kimi / 小米 MiMo）。
界面上只列**当时实测能连通**的那几家，不会让你在不通的选项里瞎试。

**🔑 「一点动静都没有」** —— 原版 Claude Code 必须先登录，否则消息既没回应也不报错。
Clootee 把登录搬进了界面：点按钮 → 打开链接 → 在浏览器里授权 → 把授权码粘回来。
**服务器装在远端也照样能用**，因为链接是在你自己的浏览器里打开的。

---

## 还有这些

- **多会话 + 任务队列** —— 一个会话排一串任务自动依次跑，可暂停、插话、重排
- **全过程可见** —— 思考、每次工具调用的完整入参与输出、耗时、token，都能展开看
- **文件管理器** —— 按工作目录浏览、在线编辑、搜索、收藏
- **失败绝不静默** —— 引擎崩了、零输出、长时间没动静，都会给出原因和处置建议
- **跨平台** —— 一套代码，安装路径按系统自动分流

---

## 启动 / 停止

| 平台 | 启动 | 停止 |
|---|---|---|
| Windows | 双击 `Windows_Start.bat` | 双击 `Windows_Stop.bat` |
| macOS | 双击 `Mac_Start.command` | 双击 `Mac_Stop.command` |
| Linux | `./Linux_Start.sh` | `./Linux_Stop.sh` |

启动后自动打开 <http://localhost:8970>。start 脚本自己会做完整自检，缺什么补什么。
macOS / Linux 首次先跑一次 `chmod +x Mac_*.command Linux_*.sh`。

---

## ⚠️ 安全须知（务必先读）

Clootee 会以**跳过权限确认**的模式运行 Claude Code，以便无人值守连续执行任务：

> **任何能打开这个网页的人，都能在你的机器上以你的身份执行任意命令。**

- 默认**只监听 `127.0.0.1`**，请保持默认，**绝对不要直接暴露到公网**（需要远程就走 SSH 隧道或 VPN）
- **访问口令由你首次打开时自行设定**，项目里没有任何默认口令
- API Key 与会话记录只存在本地 `data/`，不入库、不上传

发现安全问题请提 issue，但不要公开可利用的细节。

---

## 代码怎么组织的

```
projects/claude_hub/
├── backend/src/
│   ├── logic_struct/    # 调度层 —— 用了谁、什么顺序
│   ├── logic_realize/   # 实现层 —— 每一步具体怎么做
│   ├── helper/          # 纯工具，与业务无关
│   └── server/          # HTTP + WebSocket 路由
├── frontend/            # 静态前端，无需构建
└── out_end/             # 便携运行时，按需下载
```

**「做什么」和「怎么做」分开写** —— 调度骨架一眼读完，改实现细节不会误伤架构。
详见 [`docs/SYSTEM_zh.md`](docs/SYSTEM_zh.md) 与[架构图](docs/architecture.svg)。

<div align="center">

**[Apache 2.0](LICENSE)** · 欢迎 issue 与 PR

</div>
