# out_end —— claude-hub 外设库（内置便携运行时）

这里放置 claude-hub「打开即用、国内外通用」所需的**独立、内置**运行时，让别人下载即可开始工作，
无需在电脑上预装 Node / Claude Code / Codex。

## 目录约定

```
out_end/
├── node/        便携版 Node.js（Windows: node.exe、npm.cmd 直接在此；Linux/macOS: bin/node）
├── git/         便携版 Git（Windows: cmd/git.exe 的 MinGit；Linux/macOS 走系统包管理器，不落这里）
├── tools/       内置的 claude code / codex（npm --prefix 安装目标）
│   ├── claude.cmd / bin/claude
│   ├── codex.cmd  / bin/codex
│   └── node_modules|lib/...
├── bootstrap.bat  Windows 一键下载/安装
├── bootstrap.sh   Linux/macOS 一键下载/安装
└── README.md
```

> 二进制文件（node/、git/、tools/）都不进入 git 仓库（见 .gitignore）——保持仓库轻量，改为「安装时」按需装：
> - **node**：启动时由 `scripts/node-env.bat`（Windows）/`node-env.sh`（Unix）→ `bootstrap` 自动下载。
> - **git**：在软件界面「工具链」里一键安装，带实时进度与镜像竞速（`Toolchain._installBundledGit`）；Linux/macOS 走系统包管理器。
> - **tools（引擎）**：界面里带进度一键 `npm install -g`。
>
> 分发时若把已下好的 `node/`、`git/`、`tools/` 一起拷贝，目标机器就能离线直接跑。

## 默认只下 Node，不下引擎

`node/` 约 30MB，是跑起来的必需品；而 `tools/` 里的引擎很大（claude ~500MB、codex ~400MB），
多数人本机已经装过 claude，没装的人在**界面引导里点一下就能装，还有实时进度**，
所以 bootstrap **默认不下载引擎**，只有显式 `--with-tools` 才装。

## 用法

- **Windows**：双击 `bootstrap.bat`（只下便携 Node）；要连引擎一起装用 `bootstrap.bat --with-tools`。
- **Linux/macOS**：`bash bootstrap.sh`，同样可加 `--with-tools`。
- 加 `-y` 表示非交互（结束不停顿），start / install 脚本自动调用时用的就是它。

下载源（官方 / 国内镜像）会先各探测一次响应速度，谁快用谁；下载失败自动换另一个重试。

完成后回到项目根目录双击 `start.bat`（或 `bash start.sh`）即可使用。

## 与「电脑内置」的关系（优先级）

软件设置里有「优先使用内置引擎」开关：
- 关闭（默认）：**优先使用电脑已安装**的 claude/codex，没有才回退到这里的内置版。
- 开启：**优先使用 out_end 内置版**，缺失才回退系统。

「手动更新」按钮会把最新版 claude/codex 安装进本目录的 `tools/`。
