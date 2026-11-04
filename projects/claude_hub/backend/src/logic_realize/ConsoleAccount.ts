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
import { EngineConfig } from './EngineConfig';
import { Paths } from '../paths';
import { Session, Task } from '../models/Types';
import { Logger } from '../helper/Logger';
import { ErrorHandler } from '../helper/ErrorHandler';

const TIMEOUT_MS = 15_000;

export class ConsoleAccount extends ConsoleAccountStruct {
  static signOut(): { ok: boolean } {
    this._loginRequests.clear();
    EngineConfig.disconnectClootee();
    this._writeRecord({ ...this._readRecord(), token: '' });
    return { ok: true };
  }
  static async sendEmailCode(email: string, lang: string): Promise<{ok:boolean}> {
    email = this._email(email);
    await this._call('POST', '/api/auth/code', '', {email, lang: lang === 'zh' ? 'zh' : 'en'});
    return {ok:true};
  }

  static async loginWithEmail(email: string, code: string, lang: string): Promise<{ok:boolean}> {
    email = this._email(email);
    if (!/^[0-9]{6}$/.test(code)) throw new Error('请输入邮件中的 6 位验证码 / Enter the 6-digit email code');
    // Console 会话只在本次后端请求内使用，不下发浏览器、不持久化。
    const session = {cookie:''};
    let loginId = '';
    try {
      await this._call('POST', '/api/auth/login', '', {email, code, lang:lang === 'zh' ? 'zh' : 'en'}, session);
      if (!session.cookie) throw new Error('登录失败，请重新获取验证码 / Please request a new email code');
      const login = await this.beginLogin();
      loginId = login.loginId;
      await this._call('POST', '/api/device/approve', '', {code:login.userCode}, session);
      const result = await this.finishLogin(loginId);
      if (result.pending) throw new Error('登录未完成，请重试 / Sign-in incomplete. Please try again');
      return {ok:true};
    } finally {
      if (loginId) this._loginRequests.delete(loginId);
      if (session.cookie) {
        try { await this._call('POST', '/api/auth/logout', '', {}, session); } catch { /* 会话由云端到期回收 */ }
      }
    }
  }

  private static _email(value: string): string {
    const email = value.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new Error('请输入有效的邮箱地址 / Enter a valid email address');
    return email;
  }
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

  private static async _call(method: string, p: string, token: string, body?: unknown, session?: {cookie:string}): Promise<any> {
    const emailCode = p === '/api/auth/code';
    const requestId = crypto.randomUUID();
    const started = Date.now();
    // 只记录邮箱摘要；不记录请求体、验证码、cookie、令牌或响应正文。
    const emailHash = emailCode ? crypto.createHash('sha256').update(String((body as any)?.email || '')).digest('hex').slice(0, 16) : undefined;
    const details: Record<string, unknown> = { requestId, emailHash, method, path: p, base: CLOOTEE_CONSOLE_BASE, timeoutMs: TIMEOUT_MS, phase: 'connect' };
    const headers: Record<string, string> = { accept: 'application/json', 'x-console-request': '1' };
    if (emailCode) {
      headers['x-request-id'] = requestId;
      Logger.info('ConsoleAccount', 'email_code.request', details);
    }
    if (session?.cookie) headers.cookie = session.cookie;
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    try {
      let res: Response;
      try {
        res = await fetch(`${CLOOTEE_CONSOLE_BASE}${p}`, {
          method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (e: any) {
        details.networkCode = String(e?.cause?.code || e?.name || 'network_error').slice(0, 80);
        throw new Error(`连不上 Clootee 服务（${CLOOTEE_CONSOLE_BASE}）：${e?.cause?.code || e?.message || e}`);
      }
      details.status = res.status;
      details.upstreamRequestId = res.headers.get('x-request-id')?.slice(0, 120);
      details.contentType = res.headers.get('content-type')?.slice(0, 120);
      if (session) {
        const cookies = res.headers.getSetCookie();
        if (cookies.length) session.cookie = cookies.map(value => value.split(';')[0]).join('; ');
      }
      details.phase = 'read_response';
      const text = await res.text();
      details.responseBytes = Buffer.byteLength(text);
      details.phase = 'validate_response';
      let json: any = {};
      let validJSON = false;
      try { json = text ? JSON.parse(text) : {}; validJSON = !!json && typeof json === 'object' && !Array.isArray(json) && !!text; }
      catch (e) { if (emailCode) details.invalidJSON = true; }
      if (emailCode && json?.error?.code) details.errorCode = String(json.error.code).replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 80);
      if (!res.ok || (emailCode && (!validJSON || json.error || json.ok === false || json.success === false))) {
        const err: any = new Error(`Clootee 服务返回 ${res.status}：${json?.error?.message || (emailCode ? '验证码发送未获有效确认 / Email code request was not acknowledged' : text.slice(0, 200))}`);
        err.status = res.status;
        throw err;
      }
      if (emailCode) Logger.info('ConsoleAccount', 'email_code.accepted (API acknowledgement; inbox delivery unverified)', { ...details, elapsedMs: Date.now() - started });
      return json;
    } catch (e) {
      if (emailCode) {
        Logger.warn('ConsoleAccount', 'email_code.failed', { ...details, elapsedMs: Date.now() - started });
        // 不把上游错误正文交给日志，里面可能回显收件地址或其他私密信息。
        ErrorHandler.handle(new Error(`Email code request failed; requestId=${requestId}; status=${details.status || 'unavailable'}`), 'ConsoleAccount.sendEmailCode');
      }
      throw e;
    }
  }
}
