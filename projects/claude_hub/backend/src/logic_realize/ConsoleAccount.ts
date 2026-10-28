// 本机账户：邮箱授权设备登录、私有凭据存储、余额与用量查询。
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as os from 'os';
import {
  ConsoleAccountStruct,
  ConsoleRecord,
  ConsoleStatus,
  ConsoleUsageItem,
} from '../logic_struct/ConsoleAccountStruct';
import { CLOOTEE_CONSOLE_BASE } from '../logic_struct/EngineConfigStruct';
import { Paths } from '../paths';
import { Session, Task } from '../models/Types';
import { Logger } from '../helper/Logger';
import { ErrorHandler } from '../helper/ErrorHandler';

const TIMEOUT_MS = 15_000;

export class ConsoleAccount extends ConsoleAccountStruct {
  protected static _readRecord(): ConsoleRecord {
    let rec: Partial<ConsoleRecord> = {};
    try {
      if (fs.existsSync(Paths.CONSOLE_FILE)) rec = JSON.parse(fs.readFileSync(Paths.CONSOLE_FILE, 'utf8'));
    } catch (e) {
      ErrorHandler.handle(e, 'ConsoleAccount._readRecord（文件损坏，按未注册处理）');
    }
    const installId = typeof rec.installId === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(rec.installId)
      ? rec.installId
      : `ci_${crypto.randomBytes(18).toString('base64url')}`;
    const out = { installId, token: typeof rec.token === 'string' ? rec.token : '' };
    if (out.installId !== rec.installId) this._writeRecord(out);
    return out;
  }

  protected static _writeRecord(rec: ConsoleRecord): void {
    fs.mkdirSync(Paths.DATA_ROOT, { recursive: true });
    fs.writeFileSync(Paths.CONSOLE_FILE, JSON.stringify(rec, null, 2), { encoding: 'utf8', mode: 0o600 });
  }

  private static _pending: { code: string; userCode: string; url: string; expiresAt: number; interval: number } | null = null;
  private static _starting: Promise<{ userCode: string; url: string; expiresAt: number; interval: number }> | null = null;

  protected static async _startLogin() {
    if (this._pending && this._pending.expiresAt > Date.now()) {
      const { userCode, url, expiresAt, interval } = this._pending;
      return { userCode, url, expiresAt, interval };
    }
    if (this._starting) return this._starting;
    this._starting = (async () => {
      const rec = this._readRecord();
      const r = await this._call('POST', '/api/device/start', '', { installId: rec.installId, name: `Clootee · ${os.hostname()}`.slice(0, 60) });
      const url = new URL(r.verification_uri || '/connect', CLOOTEE_CONSOLE_BASE);
      if (url.origin !== new URL(CLOOTEE_CONSOLE_BASE).origin || !r.device_code || !/^\d{8}$/.test(r.user_code)) {
        throw new Error('Clootee: invalid device authorization response');
      }
      url.searchParams.set('user_code', r.user_code);
      const pending = { code: String(r.device_code), userCode: String(r.user_code), url: url.toString(),
        expiresAt: Date.now() + Math.min(Number(r.expires_in) || 600, 600) * 1000,
        interval: Math.max(Number(r.interval) || 5, 5) };
      this._pending = pending;
      const { userCode, expiresAt, interval } = pending;
      return { userCode, url: pending.url, expiresAt, interval };
    })();
    try { return await this._starting; }
    finally { this._starting = null; }
  }

  private static _completing: Promise<string | null> | null = null;

  protected static async _completeLogin(): Promise<string | null> {
    if (this._completing) return this._completing;
    this._completing = this._exchangeLogin();
    try { return await this._completing; }
    finally { this._completing = null; }
  }

  private static async _exchangeLogin(): Promise<string | null> {
    const pending = this._pending;
    if (!pending) return this.ensureToken();
    if (pending.expiresAt <= Date.now()) {
      this._pending = null;
      throw new Error('Clootee: 授权已过期，请重新登录 / Authorization expired. Please sign in again.');
    }
    const r = await this._call('POST', '/api/device/token', '', { device_code: pending.code });
    if (r.pending || r.error === 'authorization_pending') return null;
    const token = r.token || r.access_token;
    if (typeof token !== 'string' || !token.startsWith('ck-')) throw new Error('Clootee: invalid authorization token');
    // 先持久化云端的一次性结果，避免随后的余额请求超时导致密钥丢失。
    this._writeRecord({ ...this._readRecord(), token });
    this._pending = null;
    Logger.info('ConsoleAccount', 'email-authorized device connected');
    return token;
  }

  protected static async _fetchStatus(token: string, active: boolean): Promise<ConsoleStatus> {
    const base: ConsoleStatus = { registered: true, active, balanceMicro: null, email: null, consoleUrl: this._consoleUrl() };
    try {
      const me = await this._authed('GET', '/api/v1/me', token);
      return { ...base, balanceMicro: Number(me.balanceMicro), email: me.email || null };
    } catch (e) {
      return { ...base, error: ErrorHandler.handle(e, 'ConsoleAccount.status') };
    }
  }

  protected static async _fetchUsage(token: string, limit: number): Promise<{ items: ConsoleUsageItem[]; balanceMicro: number }> {
    const r = await this._authed('GET', `/api/v1/me/usage?limit=${limit}`, token);
    const items: ConsoleUsageItem[] = (Array.isArray(r.items) ? r.items : []).map((u: any) => ({
      at: Number(u.at), model: String(u.model), inputTokens: Number(u.inputTokens) || 0,
      cacheReadTokens: Number(u.cacheReadTokens) || 0, outputTokens: Number(u.outputTokens) || 0,
      costMicro: Number(u.costMicro) || 0, status: String(u.status || ''),
    }));
    return { items, balanceMicro: Number(r.balanceMicro) };
  }

  protected static async _requestLinkUrl(token: string): Promise<string> {
    return `${CLOOTEE_CONSOLE_BASE}/billing`;
  }

  protected static _consoleUrl(): string {
    return CLOOTEE_CONSOLE_BASE;
  }

  // 标签只保留安全字符并限长（console 端同样会清洗一次）
  protected static _tagOf(sessionId: string): string {
    return String(sessionId).replace(/[^\w:.\-]/g, '').slice(0, 120);
  }

  // 调度器总是先把任务标成 running 再启动引擎，所以此刻 running 的那一条就是这一轮
  protected static _runningTask(session: Session): Task | null {
    const tasks = Array.isArray(session && session.tasks) ? session.tasks : [];
    return tasks.find((t) => t.status === 'running') || null;
  }

  protected static async _fetchTagged(token: string, tag: string) {
    const q = new URLSearchParams({ tag, limit: '1' });
    const r = await this._authed('GET', `/api/v1/me/usage?${q.toString()}`, token);
    return {
      calls: Number(r.tagged && r.tagged.calls) || 0,
      costMicro: Number(r.tagged && r.tagged.costMicro) || 0,
      balanceMicro: Number(r.balanceMicro),
    };
  }

  // 已撤销的密钥必须重新邮箱授权，不能用安装 ID 绕过登录换取新密钥。
  private static async _authed(method: string, p: string, token: string): Promise<any> {
    return this._call(method, p, token);
  }

  private static async _call(method: string, p: string, token: string, body?: unknown): Promise<any> {
    const headers: Record<string, string> = { accept: 'application/json', 'x-console-request': '1' };
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    let res: Response;
    try {
      res = await fetch(`${CLOOTEE_CONSOLE_BASE}${p}`, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e: any) {
      throw new Error(`连不上 Clootee 服务（${CLOOTEE_CONSOLE_BASE}）：${e?.cause?.code || e?.message || e}`);
    }
    const text = await res.text();
    let json: any = {};
    try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
    if (!res.ok) {
      const err: any = new Error(`Clootee 服务返回 ${res.status}：${json?.error?.message || text.slice(0, 200)}`);
      err.status = res.status;
      throw err;
    }
    return json;
  }
}
