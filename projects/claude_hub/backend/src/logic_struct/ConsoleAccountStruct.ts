// Clootee 默认服务商的本机账户（调度骨架）。
// 松耦合：对引擎来说 clootee 只是一个普通的 Anthropic/OpenAI 兼容服务商（见 EngineConfigStruct.PROVIDERS.clootee），
// 本模块只多做一件事——邮箱登录并批准本机后，由 console.clootee.com 颁发密钥填进服务商槽。
// 余额、用量、充值都在 console.clootee.com，这里只转述，不计费、不存钱。
// 具体 IO（读写 data/console.json、HTTP 调 console）由 Realize 实现。
import { EngineConfig } from '../logic_realize/EngineConfig';
import { Session, Task } from '../models/Types';

// 默认模型：DeepSeek Flash（便宜、快、1M 上下文）
export const CLOOTEE_DEFAULT_MODEL = 'deepseek-flash';

export interface ConsoleRecord {
  installId: string; // 本机安装 id（随机生成，持久化；重装 data 目录才会变）
  token: string;     // 设备令牌（ck-…）；'' = 还没领
}

export interface ConsoleStatus {
  engines?: string[];
  registered: boolean;      // 是否已领到设备令牌
  active: boolean;          // 当前 Claude 引擎是否正在用 clootee
  balanceMicro: number | null; // 余额（微美元）；null = 没联网/没注册，查不到
  email: string | null;     // 已绑定的邮箱；null = 匿名设备
  consoleUrl: string;       // 充值 / 账单页
  error?: string;           // 查询失败的原因（不抛给前端，原样显示）
}

export interface ConsoleUsageItem {
  at: number;
  model: string;
  inputTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
  costMicro: number;
  status: string;
}

export class ConsoleAccountStruct {
  // 只允许使用邮箱登录后由云端授权的密钥；不再匿名注册或补发额度。
  static async activate(): Promise<ConsoleStatus> {
    const token = await this.ensureToken();
    this._useForEngine('claude', token);
    this._useForEngine('codex', token);
    return this.status();
  }

  // 拿到设备令牌：本机已有就用，没有就匿名注册一把（同时领取新用户体验额度）
  static async ensureToken(): Promise<string> {
    const rec = this._readRecord();
    if (rec.token) return rec.token;
    throw new Error('CLOOTEE_LOGIN_REQUIRED');
  }

  static async beginLogin(): Promise<{loginId:string;url:string;userCode:string}> { return this._beginLogin(); }
  static async finishLogin(loginId:string): Promise<{pending:boolean}> { return this._finishLogin(loginId); }
  protected static _beginLogin(): Promise<{loginId:string;url:string;userCode:string}> { throw new Error('Not implemented'); }
  protected static _finishLogin(_loginId:string): Promise<{pending:boolean}> { throw new Error('Not implemented'); }

  // 余额与状态（前端顶部的余额徽章、额度耗尽弹层都读这个）
  static async status(): Promise<ConsoleStatus> {
    const rec = this._readRecord();
    const cfg = EngineConfig.get();
    const engines = ['claude', 'codex'].filter((engine) => cfg[engine as 'claude' | 'codex'].provider === 'clootee');
    const active = engines.length > 0;
    if (!rec.token) return { registered: false, active, engines, balanceMicro: null, email: null, consoleUrl: this._consoleUrl() };
    return { ...await this._fetchStatus(rec.token, active), engines };
  }

  // 最近 N 笔用量（每一笔都能在 console 里点开看单价与 token 构成）
  static async usage(limit: number): Promise<{ items: ConsoleUsageItem[]; balanceMicro: number }> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error(`ConsoleAccount.usage: invalid limit=${limit}`);
    const token = await this.ensureToken();
    return this._fetchUsage(token, limit);
  }

  // 某一轮任务花了多少 + 当前余额：任务结束后在对话里就地显示「本次 $x · 剩余 $y」。
  // 用任务 id 作标签而不是会话 id：新会话首轮跑完后会话 id 会从草稿 id 校正成真实 uuid，会话 id 对不上。
  static async turnCost(taskId: string): Promise<{ calls: number; costMicro: number; balanceMicro: number }> {
    if (!taskId) throw new Error(`ConsoleAccount.turnCost: invalid taskId=${taskId}`);
    const token = await this.ensureToken();
    return this._fetchTagged(token, this._tagOf(taskId));
  }

  // 启动 claude 子进程时额外注入的环境变量：正在用 clootee 时，给这一轮的每个请求带上任务标签
  // （Claude Code 的 ANTHROPIC_CUSTOM_HEADERS），console 据此精确汇总这一轮花了多少。
  // 不用 clootee、或找不到正在执行的任务时返回空对象——绝不把任何东西发给别家服务商。
  static runEnv(session: Session): Record<string, string> {
    if (EngineConfig.get().claude.provider !== 'clootee') return {};
    const task = this._runningTask(session);
    if (!task) return {};
    return { ANTHROPIC_CUSTOM_HEADERS: `x-clootee-session: ${this._tagOf(task.id)}` };
  }

  // 充值 / 绑定邮箱入口：换一个 10 分钟有效的绑定码，浏览器打开后登录即把本机归到该邮箱账户
  static async linkUrl(): Promise<string> {
    const token = await this.ensureToken();
    return this._requestLinkUrl(token);
  }

  // 把某个引擎切到 clootee（只写 clootee 自己那一槽，其他服务商的 Key 原样保留）
  private static _useForEngine(engine: 'claude' | 'codex', token: string): void {
    const cur = EngineConfig.get()[engine];
    const model = cur.provider === 'clootee' && cur.model ? cur.model : CLOOTEE_DEFAULT_MODEL;
    EngineConfig.setProvider(engine, { provider: 'clootee', apiKey: token, model, effort: cur.effort || '' });
  }

  // ── IO 钩子（Realize 实现）──
  protected static _readRecord(): ConsoleRecord {
    throw new Error('Not implemented');
  }
  protected static _writeRecord(_rec: ConsoleRecord): void {
    throw new Error('Not implemented');
  }
  protected static _fetchStatus(_token: string, _active: boolean): Promise<ConsoleStatus> {
    throw new Error('Not implemented');
  }
  protected static _fetchUsage(_token: string, _limit: number): Promise<{ items: ConsoleUsageItem[]; balanceMicro: number }> {
    throw new Error('Not implemented');
  }
  protected static _requestLinkUrl(_token: string): Promise<string> {
    throw new Error('Not implemented');
  }
  protected static _consoleUrl(): string {
    throw new Error('Not implemented');
  }
  protected static _tagOf(_sessionId: string): string {
    throw new Error('Not implemented');
  }
  protected static _fetchTagged(_token: string, _tag: string): Promise<{ calls: number; costMicro: number; balanceMicro: number }> {
    throw new Error('Not implemented');
  }
  protected static _runningTask(_session: Session): Task | null {
    throw new Error('Not implemented');
  }
}
