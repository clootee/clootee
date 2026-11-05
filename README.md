<div align="center">

# Clootee

### 🌐 Official website: [clootee.com](https://clootee.com)

### One-click install for Claude Code & Codex — and easier to use

**No Node. No npm. No terminal. Nothing to install first. Unzip, double-click, done.**

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)]()
[![Setup](https://img.shields.io/badge/setup-zero%20config-brightgreen.svg)]()

English · [中文](README_zh.md)

</div>

---

Claude Code and Codex are powerful, but getting to your first message means installing Node,
running `npm install -g`, fixing your PATH, opening a terminal, and signing in through it.

**Clootee makes them easy to use.** One folder, one double-click, and a web UI that installs
whatever is missing — with a progress bar, not a blank screen.

---

## Download & install

**[Visit the official download page →](https://clootee.com/download/)**

Choose the **Windows EXE installer**, the **universal macOS DMG (Apple Silicon + Intel)**, or the **cross-platform source ZIP for Windows, macOS, and Linux**. The download page lists available builds, file sizes, installation instructions, and SHA256 checksums. All package downloads are delivered through Tencent COS CDN.

On Windows, install and open Clootee from your desktop or Start menu. On macOS 13 or later, open the DMG and drag Clootee into Applications. Desktop configuration and sessions live in your user directory and survive upgrades. Engines can be installed from the app on first use.

The instructions below apply to the **source ZIP edition**.

## Quick start

### Windows

1. Download the release and **unzip it** (right-click → Extract All — don't run it from inside the zip).
2. Double-click **`Windows_Start.bat`**.

The server runs in the **background**: once the launcher says it is running, you can close that window — the service keeps going. Double-clicking again just reopens the UI.

To stop, double-click **`Windows_Stop.bat`** (closing windows does not stop it).

> If SmartScreen warns you, click *More info → Run anyway*. Nothing is installed system-wide —
> everything lives inside the Clootee folder, and deleting the folder removes it completely.

### macOS

```bash
cd /path/to/Clootee
xattr -dr com.apple.quarantine .   # once, if you downloaded the zip with a browser
chmod +x Mac_*.command             # once
```
Then double-click `Mac_Start.command` (stop: `Mac_Stop.command`).

> If Gatekeeper still says the file "cannot be opened because it is from an unidentified developer",
> right-click `Mac_Start.command` → *Open* → *Open* once; macOS remembers your choice afterwards.
> `git` is needed only for the "push to cloud" feature — if it is missing, run `xcode-select --install`
> (or `brew install git`).

### Linux

```bash
chmod +x Linux_*.sh         # once
./Linux_Start.sh            # stop: ./Linux_Stop.sh
```

---

## What it does for you

| Normally you'd have to… | In Clootee |
|---|---|
| Install Node.js and fix your PATH | A portable copy is downloaded into its own folder |
| `npm install -g @anthropic-ai/claude-code` | One click, live progress |
| Install Git | One click — on Windows no admin, no registry |
| Run `claude` in a terminal and sign in there | **Sign in inside the browser** — 4 steps, paste the code |
| Guess why nothing is happening | A **network check** tells you what's wrong and what to do |
| Pick a model that works where you are | Only providers **reachable right now** are offered |

### Two things people always get stuck on

**🌐 "It just doesn't respond."** — Clootee checks connectivity *before* you hit that wall and offers
two ways out: turn on your VPN and re-check, or switch to a China-based model
(MiniMax / Kimi / Xiaomi MiMo) with one click.

**🔑 "It says nothing at all."** — Stock Claude Code must be signed in, or messages get no reply *and*
no error. Clootee moves sign-in into the UI. It works even when the server is remote — the link
opens in *your* browser.

---

## Once you're in

- **Multi-session task queues** — queue tasks per session, run them in order, pause or interject anytime
- **Both engines** — Claude Code and Codex, side by side, same interface
- **Full transparency** — reasoning, every tool call with inputs/outputs, timings, token counts
- **File manager** — browse, edit, search and bookmark inside each workspace
- **Failures are never silent** — crashed engine, zero output, long silence: each surfaces with a reason and a fix

---

## ⚠️ Security — please read

Clootee runs the engines with **permission prompts bypassed** so tasks can run unattended:

> **Anyone who can open this web UI can run any command on your machine, as you.**

- Listens on `127.0.0.1` only by default — keep it that way, and **never expose it to the internet**
  (use an SSH tunnel or VPN if you need remote access)
- **Security password is optional** — local use has no sign-in or sign-out. Enable a password explicitly in Settings when needed; provider accounts are separate.
- API keys and sessions stay in your local `data/`, never committed, never uploaded

Found a security issue? Please open an issue without publishing exploitable details.

---

## Under the hood

```
projects/claude_hub/
├── backend/src/
│   ├── logic_struct/    # Orchestration — who is called, in what order
│   ├── logic_realize/   # Implementation — how each step actually works
│   ├── helper/          # Pure, business-free utilities
│   └── server/          # HTTP + WebSocket routes
├── frontend/            # Static, no build step
└── out_end/             # Portable runtimes, downloaded on demand
```

**"What it does" and "how it does it" live in separate files** — the orchestration reads top to bottom
in one pass, and changing a detail can't damage the architecture.
Public distributions contain product source, runtime assets, licenses, and build scripts. Local project notes, credentials, deployment configuration, and development recordings are excluded.

<div align="center">

**[Apache 2.0](LICENSE)** · Contributions and issues welcome

</div>

### Built-in updates

Windows EXE and macOS DMG desktop installations fetch the published download manifest, verify the complete package, install it and reopen automatically. User data, installed tools and browser preferences remain in the same user directory. Diagnostics are saved to `desktop-update.log` in that directory.

Linux and cross-platform ZIP installations fetch source through Git and use an independent Node supervisor to build, restart and check health, without requiring PM2. Local source changes require confirmation before overwriting; build failures keep the existing server running.

Desktop versions 3.1.30 and earlier require a one-time install of 3.1.31 from the official download page to gain the complete package update channel.

### Linux one-command installation

On Linux x64 or ARM64 with glibc 2.28+:

```bash
curl -fsSL https://clootee.com/download/install.sh | bash
clootee status
```

Downloads a SHA256-verified Tencent COS bundle containing Node.js and the compiled
app, then starts it in the background. Closing the installer terminal is safe.
No global PM2 or boot autostart is configured. Requires `curl`, `tar`, `sha256sum`
and `flock`.

| Command | Action |
| --- | --- |
| `clootee start` | Start |
| `clootee stop` | Stop |
| `clootee restart` | Restart |
| `clootee status` | Show status |
| `clootee logs` | Follow logs; Ctrl+C stops viewing |
| `clootee version` | Show installed version |

User installs use `~/.local/share/clootee` and `~/.local/bin/clootee`; root installs
use `/opt/clootee` and `/usr/local/bin/clootee`. If the command is outside PATH,
use the full path printed by the installer. Set `CLOOTEE_HOME` and
`CLOOTEE_BIN_DIR` to absolute paths to customize them. Run the install command
again to update while preserving settings, sessions and downloaded tools.

Open `http://127.0.0.1:8970` locally. For a remote server, first run
`ssh -L 8970:127.0.0.1:8970 user@server`, then open that URL in your own browser.
