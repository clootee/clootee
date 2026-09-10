<div align="center">

# Clootee

### Claude Code & Codex, in your browser — unzip, double-click, done.

**No Node. No npm. No terminal. Nothing to install first.**

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

## Quick start

### Windows

1. Download the release and **unzip it** (right-click → Extract All — don't run it from inside the zip).
2. Double-click **`Windows_Start.bat`**.
3. Your browser opens <http://localhost:8970>. Set an access password when asked.
4. Follow the wizard: it installs Node, Git and the engine (Claude Code / Codex) for you.
5. Click **Sign in**, open the link, authorize, paste the code back. Start chatting.

To stop, double-click **`Windows_Stop.bat`**.

> If SmartScreen warns you, click *More info → Run anyway*. Nothing is installed system-wide —
> everything lives inside the Clootee folder, and deleting the folder removes it completely.

### macOS

```bash
chmod +x Mac_*.command      # once
```
Then double-click `Mac_Start.command` (stop: `Mac_Stop.command`).

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
- **You set the access password** on first launch — there is no default password
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
See [`docs/SYSTEM_zh.md`](docs/SYSTEM_zh.md) and the [architecture diagram](docs/architecture.svg).

<div align="center">

**[Apache 2.0](LICENSE)** · Contributions and issues welcome

</div>
