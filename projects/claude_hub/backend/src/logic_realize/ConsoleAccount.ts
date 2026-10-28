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
import { Session, Task } from '../models/Types';
import { Logger } from '../helper/Logger';
import { ErrorHandler } from '../helper/ErrorHandler';

const TIMEOUT_MS = 15_000;

export class ConsoleAccount extends ConsoleAccountStruct {
  private static _loginRequests = new Map<string,{deviceCode:string;expires:number}>();
  protected static async _beginLogin() {
    const result = await this._call('POST','/api/device/start','',{name:`Clootee · ${os.hostname()}`.slice(0,60),previousToken:this._readRecord().token});
    if (!result.device_code || !/^[0-9]{8}$/.test(String(result.user_code))) throw new Error('ConsoleAccount: invalid login response');
    for (const [key,value] of this._loginRequests) if(value.expires<Date.now()) this._loginRequests.delete(key);
    if (this._loginRequests.size>=10) throw new Error('ConsoleAccount: too many pending logins');
    const loginId=crypto.randomBytes(24).toString('base64url');
    this._loginRequests.set(loginId,{deviceCode:String(result.device_code),expires:Date.now()+600000});
    return {loginId,url:`${CLOOTEE_CONSOLE_BASE}/connect?user_code=${encodeURIComponent(result.user_code)}`,userCode:String(result.user_code)};
  }
  protected static async _finishLogin(loginId:string) {
    const request=this._loginRequests.get(loginId);
    if(!request||request.expires<Date.now()) throw new Error('ConsoleAccount: login expired');
    const result=await this._call('POST','/api/device/token','',{device_code:request.deviceCode});
    if(result.pending)return {pending:true};
    if(!/^ck-[A-Za-z0-9_-]{20,128}$/.test(String(result.token)))throw new Error('ConsoleAccount: invalid login token');
    const record=this._readRecord();
    this._writeRecord({...record,token:String(result.token)});
    this._syncEngines(String(result.token));
    this._loginRequests.delete(loginId);
    return {pending:false};
  }
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

  // 带令牌调用；令牌失效（401：在网页上被作废、或 console 换库）时用同一个 installId 重新领一把，
  // 并把新令牌同步进正在使用 clootee 的引擎槽，然后重试一次。
  private static async _authed(method: string, p: string, token: string): Promise<any> {
    try {
      return await this._call(method, p, token);
    } catch (e: any) {
      if (e && e.status === 401) {
        const rec = this._readRecord();
        this._writeRecord({ installId: rec.installId, token: '' });
        throw new Error('CLOOTEE_LOGIN_REQUIRED');
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
