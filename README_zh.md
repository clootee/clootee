<div align="center">

# Clootee

### 🌐 官方网站：[clootee.com](https://clootee.com)

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

## 下载与安装

**[前往官网下载页 →](https://clootee.com/download/)**

提供 **Windows EXE 安装版**、**macOS DMG 版（Apple 芯片与 Intel 通用）**，以及 **Windows / macOS / Linux 通用开源 ZIP**。各版本的大小、安装说明与 SHA256 校验值以下载页为准。所有安装包均通过腾讯 COS CDN 分发。

Windows 安装后从桌面或开始菜单打开；macOS 13 及以上打开 DMG 后拖入「应用程序」。桌面版将配置与会话保存在用户目录，升级时保留。引擎可在首次使用时按需安装。

以下步骤适用于**开源压缩包版本**。

## 快速开始

### Windows

1. 下载发布包并**解压**（右键 → 全部解压缩，不要直接在压缩包里运行）。
2. 双击 **`Windows_Start.bat`**。

服务在**后台**运行：启动窗口显示「已在后台运行」后可以直接关掉，服务不会停；再次双击只会重新打开界面。

停止：双击 **`Windows_Stop.bat`**（这是唯一的停止方式）。

> 如果 SmartScreen 弹警告，点 *更多信息 → 仍要运行*。全程不往系统里装任何东西，
> 所有内容都在 Clootee 文件夹内，删掉文件夹就卸载干净了。

### macOS

```bash
cd /path/to/Clootee
xattr -dr com.apple.quarantine .   # 只需一次；用浏览器下载的压缩包会被打上隔离标记
chmod +x Mac_*.command             # 只需一次
```
然后双击 `Mac_Start.command`（停止：`Mac_Stop.command`）。

> 如果仍提示「无法打开，因为来自身份不明的开发者」，右键 `Mac_Start.command` → *打开* → *打开*，
> 确认一次之后系统就记住了。
> `git` 只有「推送到云端」功能需要，缺了就执行 `xcode-select --install`（或 `brew install git`）。

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
- **安全密码可选**：本机默认直接使用，没有工具账号登录或退出；只有在设置中主动启用后才需解锁，与供应商账号无关。
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

<div align="center">

**[Apache 2.0](LICENSE)** · 欢迎 issue 与贡献

</div>

### 内置更新

Windows EXE 和 macOS DMG 安装的桌面版会从官网下载清单获取新版本，下载并校验完整安装包，然后自动关闭、安装和重新打开。用户数据、工具和浏览器设置保留在原用户目录。更新失败可查看用户目录中的 `desktop-update.log`。

Linux 与跨平台 ZIP 使用 Git 获取新代码，通过独立 Node 进程完成编译、重启及健康检查，无需安装 PM2。覆盖本地源码改动前会要求确认；编译失败不会停止原服务。

3.1.30 及更早桌面版尚无完整安装包更新通道，请先从官网下载并覆盖安装 3.1.31；后续版本可使用内置更新。
