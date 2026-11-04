# out_end —— claude-hub 外设库（内置便携运行时）

这里放置 claude-hub「打开即用、国内外通用」所需的**独立、内置**运行时，让别人下载即可开始工作，
无需在电脑上预装 Node / Claude Code / Codex。

## 目录约定

```
out_end/
├── node/        便携版 Node.js（Windows: node.exe、npm.cmd 直接在此；Linux/macOS: bin/node）
├── git/         便携版 Git（Windows: cmd/git.exe 的 PortableGit，含 Git Bash；Linux/macOS 走系统包管理器，不落这里）
├── tools/       内置的 claude code / codex（npm --prefix 安装目标）
│   ├── claude.cmd / bin/claude
│   ├── codex.cmd  / bin/codex
│   └── node_modules|lib/...
├── bootstrap.bat  Windows 一键下载/安装
├── bootstrap.sh   Linux/macOS 一键下载/安装
└── README.md
```

> 二进制文件不进入 Git 仓库。安装器自动检查 Node、npm、Git、Claude Code、Codex 及对应平台依赖；已可运行的组件直接复用，缺失或损坏的自动补齐。

## 自动完成安装

- **Windows EXE**：在安装过程自动补齐 Git（含 Git Bash）和两个引擎，再结束安装。
- **macOS DMG**：拖入 Applications 后首次打开，自动完成依赖安装，再进入工作界面。
- **源码 ZIP（Windows / macOS / Linux）**：运行根目录对应的启动入口，自动获取 Node、安装后端依赖、编译并安装 Git 和两个引擎。
- 直接运行 `bootstrap.bat` 或 `bash bootstrap.sh` 也会执行完整安装。`--node-only` 是启动器内部用于获取 Node 的选项；`--with-tools` 保留兼容。

官方源与镜像先测速，选择较快来源；安装失败自动切换备用源。引擎通过 `npm --prefix` 安装到 `tools/`，包含可选的平台二进制依赖；不改系统全局 npm 安装。Windows 桌面版和 macOS 桌面版的工具保存在跨版本共享的用户数据目录。

所有必需组件必须实际运行验证成功，才显示安装完成。失败时保留日志，重新打开会重试。Linux 系统 Git 安装可能需要输入 sudo 密码；macOS 缺少 Git 时自动安装 Command Line Tools，系统可能要求管理员授权。

完成后使用根目录 `Windows_Start.bat`、`Mac_Start.command` 或 `Linux_Start.sh` 启动源码版。

## 与「电脑内置」的关系（优先级）

软件设置里有「优先使用内置引擎」开关：
- 关闭（默认）：**优先使用电脑已安装**的 claude/codex，没有才回退到这里的内置版。
- 开启：**优先使用 out_end 内置版**，缺失才回退系统。

「手动更新」按钮会把最新版 claude/codex 安装进本目录的 `tools/`。
