// 解析 claude 可执行文件路径（业务无关）。
// 关键：Windows 上若用 shell:true 启动 claude.cmd，含换行/引号的参数（如 --append-system-prompt）
// 会被 cmd.exe 重新解析、命令行被截断 → 后续的 --resume 丢失 → claude 误新建会话（会话"分裂"）。
// 解法：把 claude.cmd 解析到它底层的 claude.exe 或 `node cli.js`，用 shell:false 直接 spawn，
// 参数走 argv 数组不经 shell，换行/引号都安全。绝不回退到 shell:true。
//
// 优先级（preferBundled 控制）：
//   preferBundled=false（默认）：优先电脑内置(系统 PATH)，找不到才用 out_end 内置便携版。
//   preferBundled=true：优先 out_end 内置便携版，缺失才回退系统。
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { OutEnd } from './OutEnd';

export interface ResolvedBin {
  bin: string;          // 实际用于 spawn 的命令/路径（可能是 node）
  prefixArgs: string[]; // 前置到用户参数前（如 [cli.js]，当 bin=node 时）
  useShell: boolean;    // 恒为 false（保留字段以兼容调用方签名）
}

export class ClaudeBin {
  private static _cache: Record<string, ResolvedBin> = {};

  static resolve(configured: string, preferBundled = false): ResolvedBin {
    const key = `${preferBundled ? 'B' : 'S'}:${configured}`;
    if (this._cache[key]) return this._cache[key];
    const r = this._compute(configured, preferBundled);
    this._cache[key] = r;
    return r;
  }

  // 测试/更新后清缓存
  static clearCache(): void {
    this._cache = {};
  }

  private static _compute(configured: string, preferBundled: boolean): ResolvedBin {
    // 显式配置了 .exe 绝对路径 → 直接用（优先级最高）
    if (configured && /\.exe$/i.test(configured)) {
      if (!fs.existsSync(configured))
        throw new Error(`ClaudeBin: 配置的 CLAUDE_BIN 不存在: ${configured}`);
      return { bin: configured, prefixArgs: [], useShell: false };
    }

    const bundled = () => this._resolveBundled();
    const system = () => this._resolveSystem(configured);

    const order = preferBundled ? [bundled, system] : [system, bundled];
    for (const fn of order) {
      const r = fn();
      if (r) return r;
    }
    throw new Error(
      'ClaudeBin: 未找到 claude（系统 PATH 与 out_end 内置均无）。' +
        '请安装 claude，或运行 out_end 的 bootstrap 下载内置版，或用 CLAUDE_BIN 指定 claude.exe 绝对路径。',
    );
  }

  // 系统安装（PATH）
  private static _resolveSystem(configured: string): ResolvedBin | null {
    if (process.platform !== 'win32') {
      const bin = configured || 'claude';
      // Unix 下 claude 是带 shebang 的脚本/软链；仅当能在 PATH 找到时才采用
      return this._existsOnPath(bin) ? { bin, prefixArgs: [], useShell: false } : null;
    }
    const direct = this._whereExe('claude.exe');
    if (direct) return { bin: direct, prefixArgs: [], useShell: false };
    const fromCmd = this._resolveFromCmd(this._whereFirst('claude.cmd'));
    return fromCmd;
  }

  // out_end 内置便携版
  private static _resolveBundled(): ResolvedBin | null {
    const cmd = OutEnd.claudeCmd();
    if (!cmd) return null;
    if (process.platform !== 'win32') {
      // Unix：out_end/tools/bin/claude 是脚本/软链，shell:false 直接执行
      return { bin: cmd, prefixArgs: [], useShell: false };
    }
    // Windows：从 .cmd 解析底层 cli.js 或 claude.exe
    return this._resolveFromCmd(cmd);
  }

  private static _existsOnPath(bin: string): boolean {
    if (path.isAbsolute(bin)) return fs.existsSync(bin);
    try {
      execSync(`command -v ${bin}`, { encoding: 'utf8' });
      return true;
    } catch {
      return false;
    }
  }

  private static _whereFirst(name: string): string | null {
    try {
      const out = execSync(`where ${name}`, { encoding: 'utf8' });
      const p = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
      return p && fs.existsSync(p) ? p : null;
    } catch {
      return null;
    }
  }

  private static _whereExe(name: string): string | null {
    const p = this._whereFirst(name);
    return p;
  }

  // 从 .cmd 解析出底层 claude.exe 或 `node cli.js`。
  private static _resolveFromCmd(cmdPath: string | null): ResolvedBin | null {
    try {
      if (!cmdPath || !fs.existsSync(cmdPath)) return null;
      const content = fs.readFileSync(cmdPath, 'utf8');
      const dir = path.dirname(cmdPath);
      // 情况 A：.cmd 引用了 claude.exe
      const exeM = content.match(/"([^"]*claude\.exe)"/i);
      if (exeM) {
        const rel = exeM[1].replace(/^%[^%]*%/, '');
        const exe = path.win32.normalize(dir + path.win32.sep + rel);
        if (fs.existsSync(exe)) return { bin: exe, prefixArgs: [], useShell: false };
      }
      // 情况 B：.cmd 是 `node ...cli.js`（npm 安装的垫片）
      const jsM = content.match(/"([^"]*\.js)"/i);
      if (jsM) {
        const rel = jsM[1].replace(/^%[^%]*%/, '');
        const js = path.win32.normalize(dir + path.win32.sep + rel);
        if (fs.existsSync(js)) {
          const localNode = path.join(dir, 'node.exe');
          const node = fs.existsSync(localNode) ? localNode : OutEnd.nodeExe() || 'node';
          return { bin: node, prefixArgs: [js], useShell: false };
        }
      }
      return null;
    } catch {
      return null;
    }
  }
}
