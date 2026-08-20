// Claude Code 登录（实现）：起 `claude auth login`、抠链接、把授权码写回 stdin。
//
// 为什么不用 ProcessSpawner：它写完 stdin 就 end()，而这里必须**先等链接、稍后再写授权码**，
// 是一个长时间保持打开的交互式 stdin。故直接 spawn 并自己管句柄。
//
// 输出必须按「原始片段」处理，不能按行——claude 最后那句 `Paste code here if prompted >`
// 不带换行，按行读会永远等不到它。
import { spawn, ChildProcess, execFile } from 'child_process';
import {
  ClaudeAuthStatus,
  ClaudeLoginStruct,
  LoginMode,
  LoginPhase,
  LoginSession,
} from '../logic_struct/ClaudeLoginStruct';
import { ClaudeBin } from '../helper/ClaudeBin';
import { AuthUrl } from '../helper/AuthUrl';
import { EventBus } from '../helper/EventBus';
import { Logger } from '../helper/Logger';
import { RunDiag } from '../helper/RunDiag';
import { AppConfig } from '../config/AppConfig';
import { EngineConfig } from './EngineConfig';

// 输出日志最多留这么多行（够排查，又不至于把内存堆爆）
const LOG_MAX = 200;

export class ClaudeLogin extends ClaudeLoginStruct {
  private static _proc: ChildProcess | null = null;
  private static _state: LoginSession = ClaudeLogin._empty();
  private static _raw = '';
  private static _urlWaiters: Array<() => void> = [];
  private static _exitWaiters: Array<() => void> = [];

  private static _empty(): LoginSession {
    return { phase: 'idle', mode: 'claudeai', url: '', message: '', log: [], error: '', startedAt: 0 };
  }

  // ── 探测 ────────────────────────────────────────────────────────────────
  protected static _binInfo(): { found: boolean; path: string } {
    try {
      const r = ClaudeBin.resolve(AppConfig.CLAUDE_BIN, false);
      return { found: true, path: r.prefixArgs.length ? `${r.bin} ${r.prefixArgs.join(' ')}` : r.bin };
    } catch {
      return { found: false, path: '' };
    }
  }

  protected static _provider(): string {
    try {
      return EngineConfig.get().claude.provider || 'official';
    } catch {
      return 'official';
    }
  }

  // `claude auth status --json` → 结构化登录态。它自己就输出 JSON，不必去猜凭据文件位置
  // （Windows/Linux 在 ~/.claude/.credentials.json，macOS 在钥匙串，各不相同）。
  protected static _authStatus(): Promise<{ json: Record<string, unknown> | null; error?: string }> {
    return new Promise((resolve) => {
      let r: { bin: string; prefixArgs: string[] };
      try {
        r = ClaudeBin.resolve(AppConfig.CLAUDE_BIN, false);
      } catch (e: unknown) {
        resolve({ json: null, error: RunDiag.explain(e, AppConfig.CLAUDE_BIN) });
        return;
      }
      execFile(
        r.bin,
        [...r.prefixArgs, 'auth', 'status', '--json'],
        { timeout: 25000, windowsHide: true, encoding: 'utf-8' },
        (err, stdout, stderr) => {
          const text = String(stdout || '') + String(stderr || '');
          const json = this._parseJson(text);
          if (json) {
            resolve({ json });
            return;
          }
          // 老版本 claude 没有 auth 子命令 → 明确告诉用户升级，而不是含糊地说"未登录"
          const hint = /unknown command|未知命令/i.test(text)
            ? '当前 Claude Code 版本过低，没有 `claude auth` 命令，请先在「运行环境」里更新到最新版'
            : err
              ? RunDiag.explain(err, r.bin)
              : '无法解析 claude auth status 的输出';
          resolve({ json: null, error: `${hint}${text.trim() ? `｜原始输出：${text.trim().slice(0, 300)}` : ''}` });
        },
      );
    });
  }

  // 从混杂输出里取第一段完整 JSON 对象
  private static _parseJson(text: string): Record<string, unknown> | null {
    const clean = AuthUrl.clean(text);
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      const v = JSON.parse(clean.slice(start, end + 1));
      return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }

  // ── 登录流程 ────────────────────────────────────────────────────────────
  protected static _reset(mode: LoginMode): void {
    this._raw = '';
    this._urlWaiters = [];
    this._exitWaiters = [];
    this._state = { ...this._empty(), phase: 'starting', mode, message: '正在启动登录…', startedAt: Date.now() };
    this._push();
  }

  protected static _spawn(mode: LoginMode): void {
    const r = ClaudeBin.resolve(AppConfig.CLAUDE_BIN, false);
    const args = [...r.prefixArgs, 'auth', 'login', mode === 'console' ? '--console' : '--claudeai'];
    Logger.info('ClaudeLogin', 'spawn', { bin: r.bin, args });
    const child = spawn(r.bin, args, {
      shell: false,
      windowsHide: true,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this._proc = child;
    // 进程秒退时写 stdin 会抛 EPIPE；没有监听器就是 uncaughtException，会把整个后端带走
    child.stdin?.on('error', () => undefined);
    child.stdout?.setEncoding('utf-8');
    child.stderr?.setEncoding('utf-8');
    child.stdout?.on('data', (c: string) => this._absorb(c));
    child.stderr?.on('data', (c: string) => this._absorb(c));
    child.on('error', (e) => this._fail(RunDiag.explain(e, r.bin)));
    child.on('close', (code) => this._onClose(code));
  }

  // 吞掉一段输出：记日志 → 抠链接 → 判断是否在等授权码
  private static _absorb(chunk: string): void {
    const text = AuthUrl.clean(chunk);
    this._raw += text;
    for (const line of text.split(/\r?\n/)) {
      const l = line.trim();
      if (l) this._state.log = [...this._state.log, l].slice(-LOG_MAX);
    }
    if (!this._state.url) {
      const url = AuthUrl.extract(this._raw);
      if (url) {
        this._state.url = url;
        this._state.phase = 'awaitCode';
        this._state.message = '请点击下方按钮打开授权页面，登录并授权后把页面给出的授权码粘贴回来';
        this._resolveAll(this._urlWaiters);
      }
    } else if (this._state.phase === 'starting' && AuthUrl.awaitsCode(this._raw)) {
      this._state.phase = 'awaitCode';
    }
    this._push();
  }

  protected static _waitUrl(timeoutMs: number): Promise<void> {
    if (this._state.url || this._state.phase === 'failed') return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        finish();
        if (!this._state.url && this._state.phase !== 'failed') {
          // 拿不到链接不等于失败：可能是新版 claude 直接完成了，也可能环境不允许。
          // 明确把「手动兜底」摆出来，用户不会卡在这里没有下一步。
          this._state.message =
            '没能自动取到授权链接。请在服务器的终端里执行 `claude auth login` 手动登录，完成后回到这里点「重新检测」。';
        }
      }, timeoutMs);
      const finish = () => {
        clearTimeout(timer);
        resolve();
      };
      this._urlWaiters.push(finish);
    });
  }

  protected static _writeCode(code: string): void {
    if (!this._proc || this._proc.exitCode !== null)
      throw new Error('ClaudeLogin._writeCode: 登录进程已结束，请重新点击「开始登录」');
    this._state.phase = 'submitting';
    this._state.message = '已提交授权码，正在完成登录…';
    this._push();
    this._proc.stdin?.write(`${code}\n`);
  }

  protected static _waitExit(timeoutMs: number): Promise<void> {
    if (!this._proc || this._proc.exitCode !== null) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        finish();
        if (this._state.phase === 'submitting') {
          this._state.phase = 'failed';
          this._state.error = '提交授权码后 claude 长时间没有反应，请重试或在终端里手动执行 `claude auth login`';
          this._push();
        }
      }, timeoutMs);
      const finish = () => {
        clearTimeout(timer);
        resolve();
      };
      this._exitWaiters.push(finish);
    });
  }

  private static _onClose(code: number | null): void {
    this._proc = null;
    if (this._state.phase === 'canceled') {
      this._resolveAll(this._urlWaiters);
      this._resolveAll(this._exitWaiters);
      return;
    }
    if (code === 0) {
      this._state.phase = 'done';
      this._state.message = '登录成功，可以开始使用了';
      this._state.error = '';
    } else {
      this._state.phase = 'failed';
      this._state.error =
        this._state.error ||
        `claude auth login 退出码 ${code}\n${this._state.log.slice(-8).join('\n')}`;
      this._state.message = '登录未完成，请重试';
    }
    this._push();
    this._resolveAll(this._urlWaiters);
    this._resolveAll(this._exitWaiters);
  }

  private static _fail(reason: string): void {
    this._state.phase = 'failed';
    this._state.error = reason;
    this._state.message = '登录启动失败';
    this._push();
    this._resolveAll(this._urlWaiters);
    this._resolveAll(this._exitWaiters);
  }

  protected static _killProc(): void {
    const p = this._proc;
    this._proc = null;
    if (!p || p.exitCode !== null) return;
    try {
      p.kill();
    } catch {
      /* 已退出 */
    }
  }

  protected static _markCanceled(): void {
    this._state.phase = 'canceled';
    this._state.message = '已取消登录';
    this._push();
    this._resolveAll(this._urlWaiters);
    this._resolveAll(this._exitWaiters);
  }

  protected static _snapshot(): LoginSession {
    return { ...this._state, log: [...this._state.log] };
  }

  private static _resolveAll(list: Array<() => void>): void {
    const waiters = list.splice(0, list.length);
    for (const fn of waiters) fn();
  }

  // 实时推给前端（登录是长流程，靠轮询会明显迟钝）
  private static _push(): void {
    const s = this._state;
    EventBus.broadcast({
      kind: 'claudeLogin',
      phase: s.phase as LoginPhase,
      url: s.url,
      message: s.message,
      error: s.error,
      line: s.log[s.log.length - 1] || '',
    });
  }
}

export type { ClaudeAuthStatus };
