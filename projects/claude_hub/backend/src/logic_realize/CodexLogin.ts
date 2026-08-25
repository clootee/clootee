// Codex 登录（实现）：起 `codex login --device-auth`（订阅）或 `codex login --with-api-key`（按量付费）。
//
// device-auth 全程不需要往子进程 stdin 写任何东西——用户在浏览器里填完短码，codex 自己轮询到、自动退出。
// with-api-key 则相反：一次性把密钥写进 stdin 就结束，不会有链接/短码。
import { spawn, ChildProcess, execFile } from 'child_process';
import {
  CodexLoginStruct,
  LoginMode,
  LoginPhase,
  CodexLoginSession,
} from '../logic_struct/CodexLoginStruct';
import { CodexBin } from '../helper/CodexBin';
import { AuthUrl } from '../helper/AuthUrl';
import { EventBus } from '../helper/EventBus';
import { Logger } from '../helper/Logger';
import { RunDiag } from '../helper/RunDiag';
import { AppConfig } from '../config/AppConfig';
import { CodexProfile } from './CodexProfile';

const LOG_MAX = 200;

export class CodexLogin extends CodexLoginStruct {
  private static _proc: ChildProcess | null = null;
  private static _state: CodexLoginSession = CodexLogin._empty();
  private static _raw = '';
  private static _urlWaiters: Array<() => void> = [];
  private static _exitWaiters: Array<() => void> = [];

  private static _empty(): CodexLoginSession {
    return { phase: 'idle', mode: 'chatgpt', url: '', code: '', message: '', log: [], error: '', startedAt: 0 };
  }

  // ── 探测 ────────────────────────────────────────────────────────────────
  protected static _binInfo(): { found: boolean; path: string } {
    try {
      const r = CodexBin.resolve(AppConfig.CODEX_BIN, false);
      return { found: true, path: r.prefixArgs.length ? `${r.bin} ${r.prefixArgs.join(' ')}` : r.bin };
    } catch {
      return { found: false, path: '' };
    }
  }

  // codex 只有「原版 ChatGPT」与第三方（如 kimi）两档，档位由 CodexProfileStruct 管（config.toml）
  protected static _provider(): string {
    try {
      const p = CodexProfile.status().profile;
      return p === 'kimi' ? 'kimi' : 'official';
    } catch {
      return 'official';
    }
  }

  // `codex login status` 没有 --json，只能按退出码 + 关键字判断
  protected static _authStatus(): Promise<{ loggedIn: boolean; raw: string; error?: string }> {
    return new Promise((resolve) => {
      let r: { bin: string; prefixArgs: string[] };
      try {
        r = CodexBin.resolve(AppConfig.CODEX_BIN, false);
      } catch (e: unknown) {
        resolve({ loggedIn: false, raw: '', error: RunDiag.explain(e, AppConfig.CODEX_BIN) });
        return;
      }
      execFile(
        r.bin,
        [...r.prefixArgs, 'login', 'status'],
        { timeout: 15000, windowsHide: true, encoding: 'utf-8' },
        (err, stdout, stderr) => {
          const text = AuthUrl.clean(String(stdout || '') + String(stderr || '')).trim();
          if (!err) {
            resolve({ loggedIn: true, raw: text });
            return;
          }
          if (/not logged in/i.test(text)) {
            resolve({ loggedIn: false, raw: text });
            return;
          }
          resolve({ loggedIn: false, raw: text, error: RunDiag.explain(err, r.bin) });
        },
      );
    });
  }

  // ── 登录流程 ────────────────────────────────────────────────────────────
  protected static _reset(mode: LoginMode): void {
    this._raw = '';
    this._urlWaiters = [];
    this._exitWaiters = [];
    this._state = { ...this._empty(), phase: 'starting', mode, message: '正在启动登录…', startedAt: Date.now() };
    this._push();
  }

  protected static _spawnChatgpt(): void {
    const r = CodexBin.resolve(AppConfig.CODEX_BIN, false);
    const args = [...r.prefixArgs, 'login', '--device-auth'];
    this._spawn(r.bin, args);
  }

  protected static _spawnApiKey(key: string): void {
    const r = CodexBin.resolve(AppConfig.CODEX_BIN, false);
    const args = [...r.prefixArgs, 'login', '--with-api-key'];
    this._state.phase = 'submitting';
    this._state.message = '正在提交 API Key…';
    this._push();
    const child = this._spawn(r.bin, args);
    child.stdin?.write(`${key}\n`);
    child.stdin?.end();
  }

  private static _spawn(bin: string, args: string[]): ChildProcess {
    Logger.info('CodexLogin', 'spawn', { bin, args: args.map((a) => (a.length > 40 ? '<redacted>' : a)) });
    const child = spawn(bin, args, {
      shell: false,
      windowsHide: true,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this._proc = child;
    child.stdin?.on('error', () => undefined);
    child.stdout?.setEncoding('utf-8');
    child.stderr?.setEncoding('utf-8');
    child.stdout?.on('data', (c: string) => this._absorb(c));
    child.stderr?.on('data', (c: string) => this._absorb(c));
    child.on('error', (e) => this._fail(RunDiag.explain(e, bin)));
    child.on('close', (code) => this._onClose(code));
    return child;
  }

  private static _absorb(chunk: string): void {
    const text = AuthUrl.clean(chunk);
    this._raw += text;
    for (const line of text.split(/\r?\n/)) {
      const l = line.trim();
      if (l) this._state.log = [...this._state.log, l].slice(-LOG_MAX);
    }
    if (this._state.mode === 'chatgpt' && !this._state.url) {
      const url = AuthUrl.extract(this._raw);
      const code = AuthUrl.extractCode(this._raw);
      if (url && code) {
        this._state.url = url;
        this._state.code = code;
        this._state.phase = 'awaitAuth';
        this._state.message = '请打开下方链接，登录后填入这个一次性短码；填完这里会自动完成，不用回来做别的';
        this._resolveAll(this._urlWaiters);
      }
    }
    this._push();
  }

  protected static _waitUrl(timeoutMs: number): Promise<void> {
    if (this._state.url || this._state.phase === 'failed') return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        finish();
        if (!this._state.url && this._state.phase !== 'failed') {
          this._state.message =
            '没能自动取到授权链接/短码。请在服务器的终端里执行 `codex login --device-auth` 手动登录，完成后回到这里点「重新检测」。';
        }
      }, timeoutMs);
      const finish = () => {
        clearTimeout(timer);
        resolve();
      };
      this._urlWaiters.push(finish);
    });
  }

  protected static _waitExit(timeoutMs: number): Promise<void> {
    if (!this._proc || this._proc.exitCode !== null) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        finish();
        if (this._state.phase === 'submitting' || this._state.phase === 'awaitAuth') {
          this._state.phase = 'failed';
          this._state.error =
            this._state.mode === 'apiKey'
              ? '提交 API Key 后 codex 长时间没有反应，请重试或在终端里手动执行 `codex login --with-api-key`'
              : '长时间没有检测到登录完成，请确认已在浏览器里填完短码，或重试';
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
        this._state.error || `codex login 退出码 ${code}\n${this._state.log.slice(-8).join('\n')}`;
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

  protected static _snapshot(): CodexLoginSession {
    return { ...this._state, log: [...this._state.log] };
  }

  private static _resolveAll(list: Array<() => void>): void {
    const waiters = list.splice(0, list.length);
    for (const fn of waiters) fn();
  }

  private static _push(): void {
    const s = this._state;
    EventBus.broadcast({
      kind: 'codexLogin',
      phase: s.phase as LoginPhase,
      url: s.url,
      code: s.code,
      message: s.message,
      error: s.error,
      line: s.log[s.log.length - 1] || '',
    });
  }
}
