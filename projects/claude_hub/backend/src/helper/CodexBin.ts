// 解析 codex 可执行文件（业务无关），思路同 ClaudeBin。
// Windows 上 `codex` 是一个 .cmd 垫片：`node ...\@openai\codex\bin\codex.js %*`。
// 用 shell:true 跑 .cmd 会让含换行/引号的参数被 cmd.exe 重新解析、命令行截断（会话分裂风险），
// 因此这里解析出 codex.js，用 `node codex.js` 直接 spawn（shell:false），参数走 argv 数组。
// 非 Windows：codex 是带 shebang 的脚本/软链，shell:false 直接按 PATH 执行即可。
//
// 优先级（preferBundled 控制）：默认优先系统安装，缺失才用 out_end 内置便携版；true 则相反。
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { OutEnd } from './OutEnd';

export interface ResolvedCodexBin {
  bin: string;          // 实际用于 spawn 的命令/路径（Windows=node，其它=codex）
  prefixArgs: string[]; // 需要前置到用户参数前的参数（Windows=[codex.js]）
  useShell: boolean;    // 恒为 false
}

export class CodexBin {
  private static _cache: Record<string, ResolvedCodexBin> = {};

  static resolve(configured: string, preferBundled = false): ResolvedCodexBin {
    const key = `${preferBundled ? 'B' : 'S'}:${configured}`;
    if (this._cache[key]) return this._cache[key];
    const r = this._compute(configured, preferBundled);
    this._cache[key] = r;
    return r;
  }

  static clearCache(): void {
    this._cache = {};
  }

  private static _compute(configured: string, preferBundled: boolean): ResolvedCodexBin {
    const bundled = () => this._resolveBundled();
    const system = () => this._resolveSystem(configured);
    const order = preferBundled ? [bundled, system] : [system, bundled];
    for (const fn of order) {
      const r = fn();
      if (r) return r;
    }
    throw new Error(
      'CodexBin: 未找到 codex（系统 PATH 与 out_end 内置均无）。' +
        '请安装 codex，或运行 out_end 的 bootstrap 下载内置版，或用 CODEX_BIN 指定 codex.cmd 绝对路径。',
    );
  }

  private static _resolveSystem(configured: string): ResolvedCodexBin | null {
    if (process.platform !== 'win32') {
      const bin = configured || 'codex';
      return this._existsOnPath(bin) ? { bin, prefixArgs: [], useShell: false } : null;
    }
    let cmdPath = configured && /\.cmd$/i.test(configured) ? configured : '';
    if (!cmdPath) cmdPath = this._whereFirst('codex.cmd') || '';
    return this._resolveFromCmd(cmdPath);
  }

  private static _resolveBundled(): ResolvedCodexBin | null {
    const cmd = OutEnd.codexCmd();
    if (!cmd) return null;
    if (process.platform !== 'win32') return { bin: cmd, prefixArgs: [], useShell: false };
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

  private static _resolveFromCmd(cmdPath: string): ResolvedCodexBin | null {
    try {
      if (!cmdPath || !fs.existsSync(cmdPath)) return null;
      const content = fs.readFileSync(cmdPath, 'utf8');
      const m = content.match(/"([^"]*codex\.js)"/i);
      if (!m) return null;
      const rel = m[1].replace(/^%[^%]*%/, '');
      const dir = path.dirname(cmdPath);
      const js = path.win32.normalize(dir + path.win32.sep + rel);
      if (!fs.existsSync(js)) return null;
      const localNode = path.join(dir, 'node.exe');
      const node = fs.existsSync(localNode) ? localNode : OutEnd.nodeExe() || 'node';
      return { bin: node, prefixArgs: [js], useShell: false };
    } catch {
      return null;
    }
  }
}
