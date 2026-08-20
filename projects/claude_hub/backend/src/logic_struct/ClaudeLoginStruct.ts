// Claude Code 登录（调度骨架）：小白装完 claude 之后最大的一道坎——
// 原版 claude 必须先登录 Anthropic 账号，否则发任何消息都不会有反应。
//
// 实测（claude 2.1.224）非交互终端下 `claude auth login` 的行为，正是我们需要的：
//   Opening browser to sign in…
//   If the browser didn't open, visit: https://claude.com/cai/oauth/authorize?…
//   Paste code here if prompted >          ← 进程停在这里等 stdin
// 于是整套流程可以完全在网页里完成：
//   ① 后端起进程 → ② 抠出授权链接 → ③ 前端做成一个大按钮 + 文字指引
//   → ④ 用户点开链接、在 Claude 网站授权、复制授权码 → ⑤ 粘回网页 → ⑥ 后端写进 stdin → 完成
// ⚠ 第 ④ 步实际上有**两种情况**，只按「一定拿得到授权码」写会把人卡死：
//   情况一（浏览器里已登录 claude.ai）：授权页直接给出授权码 `xxxxx#yyyyy` → 正常粘回来。
//   情况二（浏览器里没登录）：Claude 让你填邮箱，然后**往邮箱发一条验证链接**，页面上没有授权码。
//     此时必须把邮件里的链接放回「刚才打开授权页的同一个浏览器」里打开完成验证；
//     换个浏览器/手机打开，验证虽然会成功，但 OAuth 会话对不上，永远拿不到授权码。
//     验证完成后页面通常只说「登录成功」，仍然没有码 —— 这是正常的：
//     再打开一次同一条授权链接（登录进程还活着，链接依然有效），这次才会出现 Authorize → 授权码。
//   两种情况怎么选、怎么引导由前端呈现；后端这里只保证「把链接错当授权码提交」会被明确挡下来。
//
// `claude auth status --json` 直接给结构化登录态，不必去猜凭据文件在哪（三个平台各不相同）。
//
// 走第三方服务商（MiniMax / Kimi / 小米…）时用的是 ANTHROPIC_AUTH_TOKEN，**根本不需要登录**，
// 所以状态里要能区分「没登录」和「不需要登录」，否则会把已经配好国产模型的用户吓一跳。
//
// 具体 IO（spawn claude、读 stdout、写 stdin）由 Realize 实现。
import { AuthUrl } from '../helper/AuthUrl';

export type LoginPhase =
  | 'idle'        // 没有进行中的登录
  | 'starting'    // 进程已起，还没拿到链接
  | 'awaitCode'   // 已拿到链接，等用户粘授权码
  | 'submitting'  // 授权码已写进去，等 claude 完成
  | 'done'
  | 'failed'
  | 'canceled';

export type LoginMode = 'claudeai' | 'console';

export interface ClaudeAuthStatus {
  cliFound: boolean;        // claude 命令在不在
  cliPath: string;
  loggedIn: boolean;        // 原版账号是否已登录
  needsLogin: boolean;      // 是否「必须先登录才能用」（第三方服务商为 false）
  method: string;           // claude.ai / console / apiKey / thirdParty / none
  email?: string;
  orgName?: string;
  subscriptionType?: string;
  provider: string;         // 当前 claude 引擎选定的服务商（official 或第三方 id）
  error?: string;           // 探测失败原因（人话）
}

export interface LoginSession {
  phase: LoginPhase;
  mode: LoginMode;
  url: string;              // 授权链接（前端做成按钮）
  message: string;          // 当前该让用户做什么（一句话）
  log: string[];            // claude 的原始输出（出问题时给用户看/复制）
  error: string;
  startedAt: number;
}

// 等授权链接出现的上限。claude 起进程 + 打开浏览器通常 2-5 秒，给到 45 秒足够慢机器。
export const LOGIN_URL_TIMEOUT_MS = 45000;
// 粘完授权码后等 claude 落盘的上限。
export const LOGIN_FINISH_TIMEOUT_MS = 120000;

export class ClaudeLoginStruct {
  // ── 当前登录态（纯读，不会启动任何登录流程）──
  static async status(): Promise<ClaudeAuthStatus> {
    const bin = this._binInfo();
    const provider = this._provider();
    if (!bin.found) return this._compose(bin, provider, null, 'claude 命令未找到，请先安装 Claude Code');
    const raw = await this._authStatus();
    return this._compose(bin, provider, raw.json, raw.error);
  }

  // ── 开始登录：起进程并等待授权链接 ──
  static async start(mode: LoginMode = 'claudeai'): Promise<LoginSession> {
    if (mode !== 'claudeai' && mode !== 'console')
      throw new Error(`ClaudeLoginStruct.start: invalid mode=${mode}`);
    const bin = this._binInfo();
    if (!bin.found)
      throw new Error('ClaudeLoginStruct.start: claude 命令未找到，请先在「运行环境」里安装 Claude Code');
    this._killProc();          // 上一次没走完的登录先收掉，避免两个进程抢 stdin
    this._reset(mode);
    this._spawn(mode);
    await this._waitUrl(LOGIN_URL_TIMEOUT_MS);
    return this.session();
  }

  // ── 提交授权码：写进 claude 的 stdin，等它落盘 ──
  static async submitCode(code: string): Promise<LoginSession> {
    const value = (code || '').trim();
    if (!value) throw new Error('ClaudeLoginStruct.submitCode: 授权码不能为空');
    // 情况二的用户很容易把邮箱验证链接粘到这里：写进 stdin 只会让 claude 报错退出，
    // 还得从头再来一遍。直接挡下来，并告诉他链接该往哪儿放。
    if (AuthUrl.isLink(value))
      throw new Error(
        `ClaudeLoginStruct.submitCode: 这是一个链接不是授权码（${value.slice(0, 60)}…）。` +
          '邮箱里收到的验证链接要放回「刚才打开授权页的那个浏览器」里访问，完成验证后再回来重新打开授权链接取授权码。',
      );
    const cur = this.session();
    if (cur.phase !== 'awaitCode' && cur.phase !== 'starting')
      throw new Error(`ClaudeLoginStruct.submitCode: 当前不在等待授权码（phase=${cur.phase}），请重新开始登录`);
    this._writeCode(value);
    await this._waitExit(LOGIN_FINISH_TIMEOUT_MS);
    return this.session();
  }

  // ── 当前登录流程快照（前端轮询用；同时也会经 WebSocket 实时推送）──
  static session(): LoginSession {
    return this._snapshot();
  }

  // ── 放弃登录 ──
  static cancel(): LoginSession {
    this._killProc();
    this._markCanceled();
    return this.session();
  }

  // 把 claude auth status 的原始 JSON 合成成界面要的结构
  private static _compose(
    bin: { found: boolean; path: string },
    provider: string,
    json: Record<string, unknown> | null,
    error?: string,
  ): ClaudeAuthStatus {
    const thirdParty = provider !== 'official';
    const loggedIn = !!json && json.loggedIn === true;
    return {
      cliFound: bin.found,
      cliPath: bin.path,
      loggedIn,
      // 第三方服务商用 API Key 直连，不需要 Anthropic 账号
      needsLogin: !thirdParty && !loggedIn,
      method: thirdParty ? 'thirdParty' : loggedIn ? String(json?.authMethod || 'claude.ai') : 'none',
      email: json ? (json.email as string) : undefined,
      orgName: json ? (json.orgName as string) : undefined,
      subscriptionType: json ? (json.subscriptionType as string) : undefined,
      provider,
      error: error || undefined,
    };
  }

  // ── Realize 实现点 ──
  protected static _binInfo(): { found: boolean; path: string } {
    throw new Error('ClaudeLoginStruct._binInfo: Not implemented');
  }
  protected static _provider(): string {
    throw new Error('ClaudeLoginStruct._provider: Not implemented');
  }
  protected static _authStatus(): Promise<{ json: Record<string, unknown> | null; error?: string }> {
    throw new Error('ClaudeLoginStruct._authStatus: Not implemented');
  }
  protected static _reset(_mode: LoginMode): void {
    throw new Error('ClaudeLoginStruct._reset: Not implemented');
  }
  protected static _spawn(_mode: LoginMode): void {
    throw new Error('ClaudeLoginStruct._spawn: Not implemented');
  }
  protected static _waitUrl(_timeoutMs: number): Promise<void> {
    throw new Error('ClaudeLoginStruct._waitUrl: Not implemented');
  }
  protected static _writeCode(_code: string): void {
    throw new Error('ClaudeLoginStruct._writeCode: Not implemented');
  }
  protected static _waitExit(_timeoutMs: number): Promise<void> {
    throw new Error('ClaudeLoginStruct._waitExit: Not implemented');
  }
  protected static _killProc(): void {
    throw new Error('ClaudeLoginStruct._killProc: Not implemented');
  }
  protected static _markCanceled(): void {
    throw new Error('ClaudeLoginStruct._markCanceled: Not implemented');
  }
  protected static _snapshot(): LoginSession {
    throw new Error('ClaudeLoginStruct._snapshot: Not implemented');
  }
}
