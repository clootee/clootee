// Clootee 默认服务商的本机账户（实现）：data/console.json 读写 + 调 console.clootee.com 的三个账户接口。
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
import { EngineConfig } from './EngineConfig';
import { Paths } from '../paths';
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

  protected static async _register(installId: string): Promise<string> {
    const r = await this._call('POST', '/api/v1/devices', '', { installId, name: `Clootee · ${os.hostname()}`.slice(0, 60) });
    if (!r.token || !String(r.token).startsWith('ck-'))
      throw new Error(`ConsoleAccount._register: console 没有返回有效令牌 token=${String(r.token).slice(0, 6)}`);
    Logger.info('ConsoleAccount', `device registered, granted=${r.grantedMicro} reused=${r.reused}`);
    return String(r.token);
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
    const r = await this._authed('POST', '/api/v1/devices/link-code', token);
    if (!r.url) throw new Error('ConsoleAccount._requestLinkUrl: console 没有返回绑定地址');
    return String(r.url);
  }

  protected static _consoleUrl(): string {
    return CLOOTEE_CONSOLE_BASE;
  }

  // 带令牌调用；令牌失效（401：在网页上被作废、或 console 换库）时用同一个 installId 重新领一把，
  // 并把新令牌同步进正在使用 clootee 的引擎槽，然后重试一次。
  private static async _authed(method: string, p: string, token: string): Promise<any> {
    try {
      return await this._call(method, p, token);
    } catch (e: any) {
      if (e && e.status === 401) {
        const rec = this._readRecord();
        const fresh = await this._register(rec.installId);
        this._writeRecord({ installId: rec.installId, token: fresh });
        this._syncEngines(fresh);
        Logger.warn('ConsoleAccount', 'device token was rejected, re-registered and synced engines');
        return this._call(method, p, fresh);
      }
      throw e;
    }
  }

  private static _syncEngines(token: string): void {
    const cfg = EngineConfig.get();
    for (const engine of ['claude', 'codex'] as const) {
      if (cfg[engine].provider !== 'clootee') continue;
      EngineConfig.setProvider(engine, { ...cfg[engine], provider: 'clootee', apiKey: token });
    }
  }

  private static async _call(method: string, p: string, token: string, body?: unknown): Promise<any> {
    const headers: Record<string, string> = { accept: 'application/json' };
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
