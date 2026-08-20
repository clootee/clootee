<div align="center">

# Clootee

### Claude Code in your browser — unzip, double-click, done.

**No Node. No npm. No terminal. Nothing to install first.**

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)]()
[![Setup](https://img.shields.io/badge/setup-zero%20config-brightgreen.svg)]()

English · [中文](README_zh.md)

</div>

---

## The whole idea

Every other tool starts with "first install Node, then `npm install -g …`, then open a terminal and
sign in". **Clootee does all of that for you, from a web page.**

```
① Unzip   →   ② Double-click Windows_Start.bat   →   ③ Follow the wizard
```

That's it. Whatever is missing, the wizard installs — with a progress bar, not a blank screen.

| Normally you'd have to… | In Clootee |
|---|---|
| Install Node.js and fix your PATH | Downloads a portable copy into its own folder |
| `npm install -g @anthropic-ai/claude-code` | One click, live progress |
| Install Git | One click — on Windows no admin, no registry |
| Open a terminal to run `claude` and sign in | **Sign in inside the browser** — button, 4 steps, paste the code |
| Guess why nothing happens | A **network check** tells you what's wrong and what to do |

---

## Two things people always get stuck on

**🌐 "It just doesn't respond."** — Clootee checks connectivity *before* you hit that wall, and gives
you two concrete ways out: turn on your VPN and re-check, or switch to a China-based model
(MiniMax / Kimi / Xiaomi MiMo) with one click. Only providers that are **actually reachable right now**
are offered.

**🔑 "It says nothing at all."** — Stock Claude Code must be signed in, or messages get no reply *and*
no error. Clootee moves sign-in into the UI: click the button, open the link, authorize, paste the code
back. Works even when the server is remote — the link opens in *your* browser.

---

## What you get

- **Multi-session task queues** — queue tasks per session, run them in order, pause or interject anytime
- **Full transparency** — reasoning, every tool call with full inputs/outputs, timings, token counts
- **File manager** — browse, edit, search and bookmark inside each workspace
- **Failures are never silent** — crashed engine, zero output, long silence: each surfaces with a reason and a fix
- **Cross-platform** — one codebase, install paths branch per OS automatically

---

## Start / stop

| Platform | Start | Stop |
|---|---|---|
| Windows | double-click `Windows_Start.bat` | double-click `Windows_Stop.bat` |
| macOS | double-click `Mac_Start.command` | double-click `Mac_Stop.command` |
| Linux | `./Linux_Start.sh` | `./Linux_Stop.sh` |

Opens <http://localhost:8970>. The start script self-checks everything and fixes what's missing.
On macOS / Linux run `chmod +x Mac_*.command Linux_*.sh` once first.

---

## ⚠️ Security — please read

Clootee runs Claude Code with **permission prompts bypassed** so tasks can run unattended:

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
