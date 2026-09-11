<div align="center">

# Clootee

### 一键安装 Claude Code 和 Codex，并且更易用

**不用装 Node，不用 npm，不用开终端，什么前置都不用。解压、双击、就能用。**

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)]()
[![Setup](https://img.shields.io/badge/setup-zero%20config-brightgreen.svg)]()

[English](README.md) · 中文

</div>

---

Claude Code 和 Codex 很强，但想发出第一条消息，你得先装 Node、跑 `npm install -g`、
修 PATH、打开终端、再在终端里登录。

**Clootee 就是让它们变好用。** 一个文件夹、一次双击，缺什么网页里自动装 —— 有进度条，不是干等。

---

## 快速开始

### Windows

1. 下载发布包并**解压**（右键 → 全部解压缩，不要直接在压缩包里运行）。
2. 双击 **`Windows_Start.bat`**。

停止：双击 **`Windows_Stop.bat`**。

> 如果 SmartScreen 弹警告，点 *更多信息 → 仍要运行*。全程不往系统里装任何东西，
> 所有内容都在 Clootee 文件夹内，删掉文件夹就卸载干净了。

### macOS

```bash
chmod +x Mac_*.command      # 只需一次
```
然后双击 `Mac_Start.command`（停止：`Mac_Stop.command`）。

### Linux

```bash
chmod +x Linux_*.sh         # 只需一次
./Linux_Start.sh            # 停止：./Linux_Stop.sh
```

---

## 它替你做了什么

| 原本你得… | 在 Clootee 里 |
|---|---|
| 装 Node.js 并修 PATH | 自动下载便携版到自己的目录 |
| `npm install -g @anthropic-ai/claude-code` | 一键安装，实时进度 |
| 装 Git | 一键 —— Windows 下免管理员、不写注册表 |
| 开终端跑 `claude` 并在里面登录 | **在网页里登录** —— 4 步，粘贴授权码 |
| 猜为什么没反应 | **网络体检**告诉你哪里不通、怎么办 |
| 挑一个你这儿能用的模型 | 只列出**此刻真正连得上**的服务商 |

### 两个人人都会卡住的地方

**🌐「发出去没反应」** —— Clootee 在你撞墙之前先做连通性检查，并给两条明确出路：
开 VPN 后重测，或一键切到国内模型（MiniMax / Kimi / 小米 MiMo）。

**🔑「一句话都不回」** —— 原版 Claude Code 必须先登录，否则消息既没回复也没报错。
Clootee 把登录搬进界面，服务器在远端也照样能登 —— 链接在**你自己的**浏览器里打开。

---

## 进去之后

- **多会话任务队列** —— 每个会话排队下任务，按序执行，随时暂停或插话
- **双引擎** —— Claude Code 与 Codex 并列，同一套界面
- **全程透明** —— 思考过程、每次工具调用的完整入参出参、耗时、token 数
- **文件管理器** —— 在每个工作区里浏览、编辑、搜索、收藏
- **失败永不静默** —— 引擎崩溃、零输出、长时间沉默，都会给出原因和处理办法

---

## ⚠️ 安全须知（请务必阅读）

Clootee 以**跳过权限确认**的方式运行引擎，任务才能无人值守地跑：

> **任何能打开这个网页的人，都能以你的身份在你机器上执行任意命令。**

- 默认只监听 `127.0.0.1` —— 请保持这样，**绝不要暴露到公网**（需要远程就用 SSH 隧道或 VPN）
- **访问密码由你首次启动时设置**，没有默认密码
- API Key 和会话都留在本地 `data/`，不入库、不上传

发现安全问题？欢迎提 issue，但请不要公开可直接利用的细节。

---

## 架构一览

```
projects/claude_hub/
├── backend/src/
│   ├── logic_struct/    # 调度层 —— 谁被调用、按什么顺序
│   ├── logic_realize/   # 实现层 —— 每一步具体怎么做
│   ├── helper/          # 纯工具，与业务无关
│   └── server/          # HTTP + WebSocket 路由
├── frontend/            # 静态前端，无需构建
└── out_end/             # 便携运行时，按需下载
```

**「做什么」和「怎么做」分文件存放** —— 调度自上而下一遍读完，改细节不会伤到架构。
详见 [`docs/SYSTEM_zh.md`](docs/SYSTEM_zh.md) 与[架构图](docs/architecture.svg)。

<div align="center">

**[Apache 2.0](LICENSE)** · 欢迎 issue 与贡献

</div>
