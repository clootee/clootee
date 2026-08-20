// 运行环境工具链（实现）：探测本机/内置副本、读写偏好、安装、注入 PATH。
// 安装策略：
//   claude / codex → 只走 npm 全局安装（npm install -g，源由 RegistryPicker 竞速选出），不内置
//   node / git     → 只提供内置便携版下载（全局装它们需要系统安装包/管理员权限，不适合自动做）
import { execFileSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  ToolchainStruct,
  TOOLS,
  ToolCopy,
  ToolId,
  ToolPref,
  ToolProgress,
} from '../logic_struct/ToolchainStruct';
import { OutEnd } from '../helper/OutEnd';
import { ToolEnv } from '../helper/ToolEnv';
import { ClaudeBin } from '../helper/ClaudeBin';
import { CodexBin } from '../helper/CodexBin';
import { RegistryPicker, MIRROR_REGISTRY } from '../helper/RegistryPicker';
import { RunDiag } from '../helper/RunDiag';
import { Settings } from './Settings';
import { Logger } from '../helper/Logger';

const NPM_PKG: Partial<Record<ToolId, string>> = {
  claude: '@anthropic-ai/claude-code',
  codex: '@openai/codex',
};

// 内置便携版 Node（与 out_end/bootstrap 脚本保持同一版本）
const NODE_VER = 'v22.14.0';
// 内置便携版 Git（Windows 用 MinGit：纯 zip，解压即用）
const MINGIT_VER = '2.47.1';
const MINGIT_TAG = `v${MINGIT_VER}.windows.1`;

export class Toolchain extends ToolchainStruct {
  // ── 探测 ────────────────────────────────────────────────────────────────
  // node / git 有内置版，"本机已装"必须排除 out_end 里的那份，否则两栏会重复。
  // claude / codex 没有内置版：npm 全局目录可能就在 out_end/node 下（用内置便携 Node 时），
  // 那也是货真价实的一次全局安装，不能排除掉，否则装完了界面还显示"未安装"。
  protected static _detectSystem(id: ToolId): ToolCopy {
    const name = this._exeName(id);
    const bundlable = TOOLS.some((m) => m.id === id && m.bundlable);
    const found = bundlable ? this._whichOutsideOutEnd(name) : this._which(name);
    if (!found) return { found: false, path: '', version: '' };
    return { found: true, path: found, ...this._probe(found, id) };
  }

  protected static _detectBundled(id: ToolId): ToolCopy {
    const p = this._bundledPath(id);
    if (!p) return { found: false, path: '', version: '' };
    return { found: true, path: p, ...this._probe(p, id) };
  }

  private static _exeName(id: ToolId): string {
    return id === 'claude' ? 'claude' : id === 'codex' ? 'codex' : id;
  }

  // 只有 node / git 有内置版；claude / codex 一律全局安装，没有"内置那一份"
  private static _bundledPath(id: ToolId): string | null {
    if (id === 'node') return OutEnd.nodeExe();
    if (id === 'git') return OutEnd.gitExe();
    return null;
  }

  // 在整个 PATH 里找（含 out_end）
  private static _which(name: string): string | null {
    return this._whichIn(name, false);
  }

  // 在 PATH 里找，但排除 out_end 内置目录（start 脚本会把它们塞进 PATH，不能算「本机已装」）
  private static _whichOutsideOutEnd(name: string): string | null {
    return this._whichIn(name, true);
  }

  private static _whichIn(name: string, excludeOutEnd: boolean): string | null {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    const args = process.platform === 'win32' ? [name] : ['-a', name];
    let out = '';
    try {
      out = String(execFileSync(cmd, args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }));
    } catch {
      return null;
    }
    const outEnd = path.resolve(OutEnd.dir()).toLowerCase();
    const hits = out
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((p) => (!excludeOutEnd || !path.resolve(p).toLowerCase().startsWith(outEnd)) && fs.existsSync(p));
    if (!hits.length) return null;
    if (process.platform !== 'win32') return hits[0];
    // Windows：where 会同时列出 claude / claude.cmd / claude.ps1，
    // 其中无后缀的那个是 bash 脚本、直接执行会失败（拿不到版本号）→ 优先 .exe、其次 .cmd
    const rank = (p: string) => (/\.exe$/i.test(p) ? 0 : /\.cmd$|\.bat$/i.test(p) ? 1 : 2);
    return hits.slice().sort((a, b) => rank(a) - rank(b))[0];
  }

  // 探测版本号。跑不起来时把原因带回去（而不是吞掉返回空串）——
  // "文件在、版本号空白"正是内置 node/git 被拦截或装坏的典型表现，用户必须能看到为什么。
  private static _probe(exe: string, id: ToolId): { version: string; error?: string } {
    const arg = id === 'node' ? '-v' : '--version';
    // Windows 上 .cmd/.bat 不是可执行映像，必须经 cmd.exe 才能拿到输出
    const isBatch = process.platform === 'win32' && /\.(cmd|bat)$/i.test(exe);
    const cmd = isBatch ? 'cmd.exe' : exe;
    const args = isBatch ? ['/c', exe, arg] : [arg];
    try {
      const out = String(
        execFileSync(cmd, args, { encoding: 'utf-8', timeout: 20000, stdio: ['ignore', 'pipe', 'ignore'] }),
      );
      const version = out.split(/\r?\n/)[0].trim().slice(0, 60);
      return version ? { version } : { version: '', error: `执行 ${arg} 没有任何输出` };
    } catch (e: unknown) {
      const error = RunDiag.explain(e, exe).replace(/\n/g, ' ').slice(0, 300);
      Logger.warn('Toolchain', 'version probe failed', { exe, id, error });
      return { version: '', error };
    }
  }

  // ── 偏好读写（落在 settings.json 的 toolPrefs）────────────────────────────
  protected static _readPref(id: ToolId): ToolPref {
    const prefs = Settings.get().toolPrefs || {};
    const v = (prefs as Record<string, ToolPref>)[id];
    return v === 'system' || v === 'bundled' ? v : 'auto';
  }

  protected static _savePref(id: ToolId, pref: ToolPref): void {
    const prefs = { ...(Settings.get().toolPrefs || {}) } as Record<string, ToolPref>;
    prefs[id] = pref;
    Settings.update({ toolPrefs: prefs as never });
  }

  // ── PATH 注入 ───────────────────────────────────────────────────────────
  protected static _applyPath(managedDirs: string[], wantedDirs: string[]): void {
    process.env.PATH = ToolEnv.compose(process.env.PATH || '', managedDirs, wantedDirs);
    Logger.info('Toolchain', 'PATH updated', { wanted: wantedDirs });
  }

  protected static _clearBinCaches(): void {
    ClaudeBin.clearCache();
    CodexBin.clearCache();
  }

  // ── 安装 ────────────────────────────────────────────────────────────────
  // 「安装到本机」有两条完全不同的路：npm 包（claude/codex）走 npm -g；
  // 系统软件（macOS/Linux 的 git）走系统包管理器——npm 上没有官方 git。
  protected static async _installGlobal(id: ToolId, onProgress?: ToolProgress): Promise<void> {
    if (id === 'git') return this._installSystemGit(onProgress);
    const pkg = NPM_PKG[id];
    if (!pkg) throw new Error(`Toolchain: ${id} 不支持全局安装`);
    const registry = await RegistryPicker.pick();
    onProgress?.(`npm registry: ${registry}`);
    await this._run(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['install', '-g', `${pkg}@latest`, `--registry=${registry}`, '--no-audit', '--no-fund'],
      onProgress,
      process.platform === 'win32',
    );
  }

  protected static async _installBundled(id: ToolId, onProgress?: ToolProgress): Promise<void> {
    if (id === 'node') return this._installBundledNode(onProgress);
    if (id === 'git') return this._installBundledGit(onProgress);
    throw new Error(`Toolchain._installBundled: ${id} 没有内置版，请用「安装到本机（全局）」`);
  }

  // 内置 Node：直接复用 out_end 的 bootstrap 脚本（下载+解压+换源重试都在里面）。
  // 脚本自己会按 uname 判断 linux/darwin 与 x64/arm64，下载对应架构的包，三个平台一套逻辑。
  private static async _installBundledNode(onProgress?: ToolProgress): Promise<void> {
    const dir = OutEnd.dir();
    const win = process.platform === 'win32';
    const script = path.join(dir, win ? 'bootstrap.bat' : 'bootstrap.sh');
    if (!fs.existsSync(script))
      throw new Error(`内置 Node 安装脚本不存在：${script}（out_end 目录可能被删了，请重新解压整个软件包）`);
    onProgress?.(`下载内置 Node ${NODE_VER}（${process.platform}/${process.arch}）…`);
    if (win) await this._run('cmd.exe', ['/c', script, '-y'], onProgress, false);
    else await this._run('bash', [script, '-y'], onProgress, false);
    if (!OutEnd.nodeExe()) throw new Error('内置 Node 安装后仍未找到，请查看上方输出');
  }

  // 系统 Git（macOS / Linux）：官方没有便携发行版，只能走包管理器。
  // 有 root（或 macOS 的 brew）就直接装完；没有权限时**不静默失败**，
  // 而是把该敲的那条命令原样交给用户——小白至少知道下一步要干什么。
  private static async _installSystemGit(onProgress?: ToolProgress): Promise<void> {
    if (process.platform === 'win32')
      throw new Error('Windows 请使用「下载内置版」安装 Git（免管理员、不写注册表）');
    const plan = this._gitInstallPlan();
    if (!plan)
      throw new Error(
        '没有识别到可用的包管理器。请手动安装 git 后点「重新检测」：' +
          'macOS 用 `brew install git` 或 `xcode-select --install`；' +
          'Linux 用 `sudo apt-get install -y git` / `sudo dnf install -y git` / `sudo pacman -S git`。',
      );
    if (plan.needsSudo)
      throw new Error(
        `安装 git 需要管理员权限。请在终端里执行：\n  ${plan.display}\n装完回到这里点「重新检测」。`,
      );
    onProgress?.(`安装 Git：${plan.display}`);
    await this._run(plan.cmd, plan.args, onProgress, false);
    if (!this._which('git')) throw new Error('git 安装后仍未找到，请查看上方输出');
  }

  // 挑一个本机存在的包管理器，拼出安装命令
  private static _gitInstallPlan(): { cmd: string; args: string[]; display: string; needsSudo: boolean } | null {
    const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
    // macOS：优先 brew（用户态即可安装，不需要 sudo）
    if (process.platform === 'darwin') {
      if (this._which('brew'))
        return { cmd: 'brew', args: ['install', 'git'], display: 'brew install git', needsSudo: false };
      return {
        cmd: 'xcode-select',
        args: ['--install'],
        display: 'xcode-select --install（会弹出系统安装窗口）',
        needsSudo: false,
      };
    }
    // Linux：常见发行版的包管理器，顺序即优先级
    const managers: Array<{ bin: string; args: string[] }> = [
      { bin: 'apt-get', args: ['install', '-y', 'git'] },
      { bin: 'dnf', args: ['install', '-y', 'git'] },
      { bin: 'yum', args: ['install', '-y', 'git'] },
      { bin: 'zypper', args: ['--non-interactive', 'install', 'git'] },
      { bin: 'pacman', args: ['-S', '--noconfirm', 'git'] },
      { bin: 'apk', args: ['add', '--no-cache', 'git'] },
    ];
    for (const m of managers) {
      if (!this._which(m.bin)) continue;
      const display = `${isRoot ? '' : 'sudo '}${m.bin} ${m.args.join(' ')}`;
      return { cmd: m.bin, args: m.args, display, needsSudo: !isRoot };
    }
    return null;
  }

  // 内置 Git：只有 Windows 有便携版（MinGit：纯 zip，解压即用）
  private static async _installBundledGit(onProgress?: ToolProgress): Promise<void> {
    if (process.platform !== 'win32') return this._installSystemGit(onProgress);
    const registry = await RegistryPicker.pick();
    const mirror = registry === MIRROR_REGISTRY;
    const zipName = `MinGit-${MINGIT_VER}-64-bit.zip`;
    const url = mirror
      ? `https://npmmirror.com/mirrors/git-for-windows/${MINGIT_TAG}/${zipName}`
      : `https://github.com/git-for-windows/git/releases/download/${MINGIT_TAG}/${zipName}`;
    const gitDir = OutEnd.gitDir();
    const zip = path.join(OutEnd.dir(), zipName);
    onProgress?.(`下载内置 Git：${url}`);
    const ps = [
      '-NoProfile',
      '-Command',
      `$ProgressPreference='SilentlyContinue';` +
        `Invoke-WebRequest -Uri '${url}' -OutFile '${zip}';` +
        `if (Test-Path '${gitDir}') { Remove-Item -Recurse -Force '${gitDir}' };` +
        `Expand-Archive -Path '${zip}' -DestinationPath '${gitDir}' -Force;` +
        `Remove-Item -Force '${zip}'`,
    ];
    await this._run('powershell', ps, onProgress, false);
    if (!OutEnd.gitExe()) throw new Error('内置 Git 安装后仍未找到，请查看上方输出');
  }

  // 权限类失败的人话补充（三个平台的解法完全不同，直接把该走的路说清楚）
  private static _permHint(text: string): string {
    if (!/EACCES|EPERM|permission denied|拒绝访问|需要提升/i.test(text)) return '';
    if (process.platform === 'win32')
      return '\n\n看起来是权限不足：请用「以管理员身份运行」重新启动本软件后再试，' +
        '或改用「下载内置版」（装在软件自己的目录里，不需要管理员）。';
    if (process.platform === 'darwin')
      return '\n\n看起来是权限不足：可在终端执行 `sudo npm install -g <包名>`，' +
        '或先 `npm config set prefix ~/.npm-global` 把全局目录改到自己的家目录（推荐，之后都不用 sudo）。';
    return '\n\n看起来是权限不足：可在终端执行 `sudo npm install -g <包名>`，' +
      '或先 `npm config set prefix ~/.npm-global` 并把 `~/.npm-global/bin` 加进 PATH（推荐，之后都不用 sudo）。';
  }

  // 统一的子进程执行：逐行回传输出，非 0 退出码抛错
  private static _run(
    cmd: string,
    args: string[],
    onProgress?: ToolProgress,
    useShell = false,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      Logger.info('Toolchain', 'run', { cmd, args });
      const child = spawn(cmd, args, { shell: useShell, windowsHide: true, cwd: OutEnd.dir() });
      let tail = '';
      let pending = '';
      const cap = (c: Buffer) => {
        const text = c.toString();
        tail = (tail + text).slice(-4000);
        if (!onProgress) return;
        pending += text;
        const lines = pending.split(/\r?\n/);
        pending = lines.pop() || '';
        for (const l of lines) if (l.trim()) onProgress(l.trim());
      };
      child.stdout?.on('data', cap);
      child.stderr?.on('data', cap);
      child.on('error', (e) => reject(new Error(`启动失败 ${cmd}: ${RunDiag.explain(e, cmd)}`)));
      child.on('close', (code) => {
        if (pending.trim() && onProgress) onProgress(pending.trim());
        if (code === 0) resolve();
        else {
          const detail = tail.split(/\r?\n/).slice(-12).join('\n');
          reject(new Error(`${cmd} 退出码 ${code}:\n${detail}${this._permHint(detail)}`));
        }
      });
    });
  }
}
